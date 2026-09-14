import { after, NextResponse } from 'next/server'

import {
  createBlogPostDraftFromWriterRun,
  convertWriterArticleToBlogPost,
  restoreWriterDraftAsFinalArticle,
} from '@/lib/aiWriter/articleDraft'
import { saveWriterArticleRevision } from '@/lib/aiWriter/articleRevision'
import {
  buildWriterRunExportEntries,
  createZipArchive,
  getWriterRunExportFilename,
} from '@/lib/aiWriter/exportRun'
import { downloadAIWriterRemoteFileText } from '@/lib/aiWriter/provider'
import { createLiveWriterAutomationProvider } from '@/lib/aiWriter/liveProvider'
import {
  enqueueWriterManualStage,
  manualStageKeys,
  processNextQueuedWriterManualStage,
  runWriterCheckIssue,
} from '@/lib/aiWriter/manualStages'
import {
  processNextQueuedWriterRun,
  retryFailedWriterRun,
  selectWriterSourcesAndContinue,
} from '@/lib/aiWriter/engine'
import { getWriterRemoteFile, getWriterRunDetail } from '@/lib/aiWriter/repository'
import {
  runWriterCheckIssueRemediation,
  runWriterMissingSectionRemediation,
} from '@/lib/aiWriter/sectionRemediation'
import type { WriterRunDetail } from '@/lib/aiWriter/types'
import { getCmsPayload } from '@/lib/payload'

type ReplaceRequestBody = {
  postId?: number | string
}

type SaveRevisionRequestBody = {
  bodyHtml?: unknown
  metaDescription?: unknown
  title?: unknown
}

type CheckIssueRequestBody = {
  checkKey?: unknown
}

type SelectSourcesRequestBody = {
  sourceIDs?: unknown[]
}

function normalizeRunId(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function pickMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') {
    return ''
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function parsePostId(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeSourceIDs(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'number' ? entry : Number.parseInt(String(entry), 10)))
    .filter((entry) => Number.isFinite(entry))
}

function normalizeRequestString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isManualStage(value: string): value is (typeof manualStageKeys)[number] {
  return manualStageKeys.includes(value as (typeof manualStageKeys)[number])
}

function shouldAttemptAutomationResume(detail: WriterRunDetail) {
  return detail.run.status === 'discovering' || detail.run.status === 'processing'
}

function scheduleQueuedWriterWork(context: string) {
  after(async () => {
    try {
      await Promise.all([
        processNextQueuedWriterRun(createLiveWriterAutomationProvider()),
        processNextQueuedWriterManualStage(),
      ])
    } catch (error) {
      console.error(`AI Writer queued automation failed ${context}.`, error)
    }
  })
}

async function requireAuthenticatedPayload(request: Request) {
  const payload = await getCmsPayload()
  const authResult = await payload.auth({
    headers: request.headers,
  })

  if (!authResult.user) {
    return null
  }

  return payload
}

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const payload = await requireAuthenticatedPayload(request)

  if (!payload) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 })
  }

  const { segments } = await context.params

  if (segments.length === 2 && segments[1] === 'export') {
    const runID = normalizeRunId(segments[0])

    if (!runID) {
      return NextResponse.json({ message: 'Invalid run id.' }, { status: 400 })
    }

    try {
      const detail = await getWriterRunDetail(runID, payload)
      const entries = await buildWriterRunExportEntries(detail, {
        downloadRemoteFile: async (remoteFile) => downloadAIWriterRemoteFileText(remoteFile.provider, remoteFile.fileId),
      })
      const archive = createZipArchive(entries)
      const filename = getWriterRunExportFilename(detail)

      return new Response(archive, {
        headers: {
          'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
          'content-type': 'application/zip',
        },
        status: 200,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export AI Writer run.'
      return NextResponse.json({ message }, { status: 500 })
    }
  }

  if (segments.length === 3 && segments[1] === 'remote-files') {
    const runID = normalizeRunId(segments[0])
    const remoteFileID = normalizeRunId(segments[2])

    if (!runID || !remoteFileID) {
      return NextResponse.json({ message: 'Invalid run or remote file id.' }, { status: 400 })
    }

    try {
      const remoteFile = await getWriterRemoteFile(remoteFileID, payload)

      if (remoteFile.runID !== runID) {
        return NextResponse.json(
          { message: 'Remote file not found for this run.' },
          { status: 404 },
        )
      }

      const filename =
        pickMetadataString(remoteFile.metadata, 'filename') || `${remoteFile.fileId}.txt`
      const mimeType =
        pickMetadataString(remoteFile.metadata, 'mimeType') || 'text/plain; charset=utf-8'
      const content = await downloadAIWriterRemoteFileText(remoteFile.provider, remoteFile.fileId)

      return new Response(content, {
        headers: {
          'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
          'content-type': mimeType,
        },
        status: 200,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to download AI Writer remote file.'
      return NextResponse.json({ message }, { status: 500 })
    }
  }

  if (segments.length !== 1) {
    return NextResponse.json({ message: 'Route not found.' }, { status: 404 })
  }

  const runID = normalizeRunId(segments[0])

  if (!runID) {
    return NextResponse.json({ message: 'Invalid run id.' }, { status: 400 })
  }

  try {
    const detail = await getWriterRunDetail(runID, payload)

    if (shouldAttemptAutomationResume(detail)) {
      scheduleQueuedWriterWork('while resuming from detail request')
    }

    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load AI Writer run.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const payload = await requireAuthenticatedPayload(request)

  if (!payload) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 })
  }

  const { segments } = await context.params

  if (segments.length !== 2) {
    return NextResponse.json({ message: 'Route not found.' }, { status: 404 })
  }

  const runID = normalizeRunId(segments[0])
  const action = segments[1]

  if (!runID) {
    return NextResponse.json({ message: 'Invalid run id.' }, { status: 400 })
  }

  try {
    if (action === 'select-sources') {
      const body = (await request.json()) as SelectSourcesRequestBody
      const sourceIDs = normalizeSourceIDs(body.sourceIDs)
      const detail = await selectWriterSourcesAndContinue(runID, sourceIDs)

      scheduleQueuedWriterWork('after source selection')

      return NextResponse.json(detail)
    }

    if (action === 'retry') {
      const detail = await retryFailedWriterRun(runID)

      scheduleQueuedWriterWork('after retry request')

      return NextResponse.json(detail)
    }

    if (action === 'create-draft') {
      const result = await createBlogPostDraftFromWriterRun(runID, payload)

      return NextResponse.json({
        detail: await getWriterRunDetail(runID, payload),
        draft: result.draft,
        editorPath: result.editorPath,
        reusedExistingDraft: result.reusedExistingDraft,
      })
    }

    if (action === 'restore-draft-article') {
      const detail = await restoreWriterDraftAsFinalArticle(runID, payload)
      return NextResponse.json(detail)
    }

    if (action === 'save-revision') {
      const body = (await request.json().catch(() => ({}))) as SaveRevisionRequestBody
      const detail = await saveWriterArticleRevision({
        bodyHtml: normalizeRequestString(body.bodyHtml),
        metaDescription: normalizeRequestString(body.metaDescription),
        payload,
        runID,
        title: normalizeRequestString(body.title),
      })

      return NextResponse.json(detail)
    }

    if (action === 'check-issue') {
      const body = (await request.json().catch(() => ({}))) as CheckIssueRequestBody
      const checkKey = normalizeRequestString(body.checkKey)

      if (!checkKey) {
        return NextResponse.json({ message: 'Select a check issue to rerun.' }, { status: 400 })
      }

      const detail = await runWriterCheckIssue(runID, checkKey, payload)

      return NextResponse.json(detail)
    }

    if (action === 'fix-missing-sections') {
      const body = (await request.json().catch(() => ({}))) as CheckIssueRequestBody
      const checkKey = normalizeRequestString(body.checkKey) || 'section_budgets'
      const detail = await runWriterMissingSectionRemediation(runID, checkKey, payload)

      return NextResponse.json(detail)
    }

    if (action === 'fix-check-issue') {
      const body = (await request.json().catch(() => ({}))) as CheckIssueRequestBody
      const checkKey = normalizeRequestString(body.checkKey)

      if (!checkKey) {
        return NextResponse.json({ message: 'Select a check issue to fix.' }, { status: 400 })
      }

      const detail = await runWriterCheckIssueRemediation(runID, checkKey, payload)

      return NextResponse.json(detail)
    }

    if (action === 'convert-blog-post') {
      const result = await convertWriterArticleToBlogPost({
        payload,
        runID,
      })

      return NextResponse.json(result)
    }

    if (action === 'replace-blog-post') {
      const body = (await request.json()) as ReplaceRequestBody
      const postId = parsePostId(body.postId)

      if (!postId) {
        return NextResponse.json({ message: 'Select a blog post to replace.' }, { status: 400 })
      }

      const result = await convertWriterArticleToBlogPost({
        payload,
        replacePostId: postId,
        runID,
      })

      return NextResponse.json(result)
    }

    if (isManualStage(action)) {
      const detail = await enqueueWriterManualStage(runID, action, payload)
      scheduleQueuedWriterWork(`after ${action} stage request`)
      return NextResponse.json(detail)
    }

    return NextResponse.json({ message: 'Route not found.' }, { status: 404 })
  } catch (error) {
    let message = 'Failed to complete AI Writer request.'

    if (action === 'create-draft') {
      message = 'Failed to create CMS draft from AI Writer output.'
    } else if (action === 'restore-draft-article') {
      message = 'Failed to restore the write-stage article draft.'
    } else if (action === 'save-revision') {
      message = 'Failed to save the AI Writer article revision.'
    } else if (action === 'check-issue') {
      message = 'Failed to rerun the selected AI Writer check issue.'
    } else if (action === 'fix-missing-sections') {
      message = 'Failed to generate missing sections for the selected AI Writer check issue.'
    } else if (action === 'fix-check-issue') {
      message = 'Failed to generate a targeted fix for the selected AI Writer check issue.'
    } else if (action === 'convert-blog-post') {
      message = 'Failed to create a CMS blog post from AI Writer output.'
    } else if (action === 'replace-blog-post') {
      message = 'Failed to replace the selected CMS blog post.'
    } else if (action === 'select-sources') {
      message = 'Failed to save source selection.'
    } else if (action === 'retry') {
      message = 'Failed to retry the AI Writer run.'
    } else if (isManualStage(action)) {
      message = 'Failed to run AI Writer stage.'
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : message },
      { status: 500 },
    )
  }
}
