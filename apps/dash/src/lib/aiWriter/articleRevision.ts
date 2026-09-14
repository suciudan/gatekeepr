import type { Payload } from 'payload'

import {
  convertLegacyHtmlToLexicalState,
  convertLexicalStateToMarkdown,
  convertMarkdownToLexicalState,
  createEmptyLexicalState,
  ensureLexicalState,
  isLexicalState,
} from '@/lib/richText'

import {
  createWriterTraceEvent,
  getWriterRunDetail,
  updateWriterRun,
  upsertWriterArtifact,
  upsertWriterStageExecution,
} from './repository'
import {
  buildWriterCheckReportFailingListMarkdown,
  invalidateWriterCheckReport,
  parseWriterCheckReport,
} from './checkReport'
import { resolveSeoCheckerConfig } from './agentic/seo-checker-settings'
import type {
  WriterArticleRevisionDocument,
  WriterArtifactRecord,
  WriterRelationshipID,
  WriterRunDetail,
} from './types'

type PayloadClient = Payload

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getLatestArtifactOfType(
  artifacts: WriterArtifactRecord[],
  artifactType: WriterArtifactRecord['artifactType'],
) {
  return [...artifacts]
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

export function getLatestWriterFinalArticleArtifact(artifacts: WriterArtifactRecord[]) {
  return (
    getLatestArtifactOfType(artifacts, 'article_revision_md') ??
    getLatestArtifactOfType(artifacts, 'article_draft_md') ??
    null
  )
}

export function getLatestWriterRevisionRichTextArtifact(artifacts: WriterArtifactRecord[]) {
  return getLatestArtifactOfType(artifacts, 'article_revision_richtext_json')
}

function stripLeadingMarkdownComments(content: string) {
  return content.replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/u, '').trimStart()
}

function extractArticleMetaDescription(content: string) {
  const match = content.match(/<!--\s*(?:meta_description|Meta):\s*([\s\S]*?)\s*-->/i)
  return match?.[1]?.trim() ?? ''
}

function extractArticleTitle(content: string, fallbackTitle = 'Untitled article') {
  const withoutLeadingComments = stripLeadingMarkdownComments(content)
  const headingMatch = withoutLeadingComments.match(/^#\s+(.+)$/m)
  const heading = pickString(headingMatch?.[1])

  if (heading) {
    return heading
  }

  const firstNonEmptyLine = withoutLeadingComments
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)

  return firstNonEmptyLine ? firstNonEmptyLine.replace(/^#+\s*/, '').trim() : fallbackTitle
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripLeadingMarkdownTitle(content: string, title: string) {
  const normalizedTitle = title.trim()

  if (!normalizedTitle) {
    return content
  }

  const withoutLeadingComments = stripLeadingMarkdownComments(content)
  const exactTitlePatterns = [
    new RegExp(`^\\s*#\\s+${escapeRegex(normalizedTitle).replace(/\s+/g, '\\s+')}\\s*#*\\s*(?:\\r?\\n)+`, 'u'),
    new RegExp(`^\\s*${escapeRegex(normalizedTitle).replace(/\s+/g, '\\s+')}\\s*\\r?\\n=+\\s*(?:\\r?\\n)+`, 'u'),
  ]

  for (const pattern of exactTitlePatterns) {
    const stripped = withoutLeadingComments.replace(pattern, '').trim()

    if (stripped !== withoutLeadingComments.trim()) {
      return stripped
    }
  }

  return withoutLeadingComments
    .replace(/^\s*#\s+.+?\s*#*\s*(?:\r?\n)+/u, '')
    .replace(/^\s*.+\r?\n=+\s*(?:\r?\n)+/u, '')
    .trim()
}

function normalizeRevisionDocument(input: WriterArticleRevisionDocument): WriterArticleRevisionDocument {
  return {
    body: ensureLexicalState(input.body),
    metaDescription: pickString(input.metaDescription),
    title: pickString(input.title) || 'Untitled article',
  }
}

export function parseWriterArticleRevisionDocument(content: string): null | WriterArticleRevisionDocument {
  try {
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const candidate = parsed as Record<string, unknown>

    if (!isLexicalState(candidate.body)) {
      return null
    }

    return normalizeRevisionDocument({
      body: candidate.body,
      metaDescription: pickString(candidate.metaDescription),
      title: pickString(candidate.title),
    })
  } catch {
    return null
  }
}

export async function buildWriterArticleRevisionDocumentFromMarkdown(
  markdown: string,
  fallbackTitle = 'Untitled article',
): Promise<WriterArticleRevisionDocument> {
  const normalizedMarkdown = markdown.trim()
  const title = extractArticleTitle(normalizedMarkdown, fallbackTitle)
  const metaDescription = extractArticleMetaDescription(normalizedMarkdown)
  const bodyMarkdown = stripLeadingMarkdownTitle(normalizedMarkdown, title)
  const body = (await convertMarkdownToLexicalState(bodyMarkdown)) ??
    createEmptyLexicalState()

  return normalizeRevisionDocument({
    body,
    metaDescription,
    title,
  })
}

export async function buildWriterArticleRevisionDocumentFromHtml(input: {
  bodyHtml: string
  metaDescription: string
  title: string
}): Promise<WriterArticleRevisionDocument> {
  const body = (await convertLegacyHtmlToLexicalState(input.bodyHtml || '<p></p>')) ??
    (await convertLegacyHtmlToLexicalState('<p></p>')) ??
    createEmptyLexicalState()

  return normalizeRevisionDocument({
    body,
    metaDescription: input.metaDescription,
    title: input.title,
  })
}

export async function buildWriterArticleMarkdownFromRevision(
  revision: WriterArticleRevisionDocument,
): Promise<string> {
  const normalizedRevision = normalizeRevisionDocument(revision)
  const bodyMarkdown = pickString(await convertLexicalStateToMarkdown(normalizedRevision.body))
  const sections = [
    normalizedRevision.metaDescription ? `<!-- Meta: ${normalizedRevision.metaDescription} -->` : '',
    `# ${normalizedRevision.title}`,
    bodyMarkdown,
  ].filter(Boolean)

  return sections.join('\n\n').trim()
}

export async function syncWriterArticleRevisionFromMarkdown(input: {
  articleMarkdown: string
  payload: PayloadClient
  producedByJobID?: null | WriterRelationshipID
  runID: WriterRelationshipID
}) {
  const revision = await buildWriterArticleRevisionDocumentFromMarkdown(input.articleMarkdown)

  return upsertWriterArticleRevisionArtifacts({
    payload: input.payload,
    producedByJobID: input.producedByJobID,
    revision,
    runID: input.runID,
  })
}

async function upsertWriterArticleRevisionArtifacts(input: {
  payload: PayloadClient
  producedByJobID?: null | WriterRelationshipID
  revision: WriterArticleRevisionDocument
  runID: WriterRelationshipID
}) {
  const detail = await getWriterRunDetail(input.runID, input.payload)
  const existingRichTextArtifact = getLatestWriterRevisionRichTextArtifact(detail.artifacts)
  const existingRevisionArtifact = getLatestArtifactOfType(detail.artifacts, 'article_revision_md')
  const markdown = await buildWriterArticleMarkdownFromRevision(input.revision)

  const [richTextArtifact, revisionArtifact] = await Promise.all([
    upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_revision_richtext_json',
        content: JSON.stringify(input.revision, null, 2),
        filename: 'article-revision.richtext.json',
        mimeType: 'application/json',
        producedByJobID: input.producedByJobID,
        runID: input.runID,
        schemaName: 'ai_writer.article_revision_richtext',
        schemaVersion: 'v1',
        supersedesArtifactID: existingRichTextArtifact?.id ?? null,
      },
      input.payload,
    ),
    upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_revision_md',
        content: markdown,
        filename: 'article-revision.md',
        mimeType: 'text/markdown',
        producedByJobID: input.producedByJobID,
        runID: input.runID,
        schemaName: 'ai_writer.article_revision',
        schemaVersion: 'v1',
        supersedesArtifactID: existingRevisionArtifact?.id ?? null,
      },
      input.payload,
    ),
  ])

  return {
    revisionArtifact,
    richTextArtifact,
  }
}

export async function invalidateWriterCheckArtifactsForArticle(input: {
  articleArtifact: WriterArtifactRecord
  payload: PayloadClient
  runDetail: WriterRunDetail
}) {
  const existingCheckArtifact = getLatestArtifactOfType(input.runDetail.artifacts, 'check_report_json')

  if (!existingCheckArtifact) {
    return null
  }

  const existingReport = parseWriterCheckReport(existingCheckArtifact.content)
  const checkerConfig = resolveSeoCheckerConfig(null)
  const invalidatedReport = invalidateWriterCheckReport({
    articleArtifactId: input.articleArtifact.id,
    articleArtifactType: input.articleArtifact.artifactType,
    checkerConfig,
    existingReport,
  })

  await Promise.all([
    upsertWriterArtifact(
      {
        artifactRole: 'review',
        artifactType: 'check_report_json',
        content: JSON.stringify(invalidatedReport, null, 2),
        filename: 'check-report.json',
        mimeType: 'application/json',
        runID: input.runDetail.run.id,
        schemaName: 'ai_writer.check_report',
        schemaVersion: 'v1',
      },
      input.payload,
    ),
    upsertWriterArtifact(
      {
        artifactRole: 'review',
        artifactType: 'failing_list_md',
        content: buildWriterCheckReportFailingListMarkdown(invalidatedReport),
        filename: 'failing-list.md',
        mimeType: 'text/markdown',
        runID: input.runDetail.run.id,
        schemaName: 'ai_writer.failing_list',
        schemaVersion: 'v1',
      },
      input.payload,
    ),
  ])

  return invalidatedReport
}

async function upsertWriterArticleRevisionRichTextArtifact(input: {
  payload: PayloadClient
  producedByJobID?: null | WriterRelationshipID
  revision: WriterArticleRevisionDocument
  runID: WriterRelationshipID
}) {
  const detail = await getWriterRunDetail(input.runID, input.payload)
  const existingRichTextArtifact = getLatestWriterRevisionRichTextArtifact(detail.artifacts)

  return upsertWriterArtifact(
    {
      artifactRole: 'derived',
      artifactType: 'article_revision_richtext_json',
      content: JSON.stringify(input.revision, null, 2),
      filename: 'article-revision.richtext.json',
      mimeType: 'application/json',
      producedByJobID: input.producedByJobID,
      runID: input.runID,
      schemaName: 'ai_writer.article_revision_richtext',
      schemaVersion: 'v1',
      supersedesArtifactID: existingRichTextArtifact?.id ?? null,
    },
    input.payload,
  )
}

export async function ensureWriterArticleRevisionRichTextArtifact(input: {
  articleMarkdown: string
  payload: PayloadClient
  producedByJobID?: null | WriterRelationshipID
  runID: WriterRelationshipID
}) {
  const detail = await getWriterRunDetail(input.runID, input.payload)
  const existingArtifact = getLatestWriterRevisionRichTextArtifact(detail.artifacts)

  if (existingArtifact) {
    return existingArtifact
  }

  const revision = await buildWriterArticleRevisionDocumentFromMarkdown(input.articleMarkdown)
  return upsertWriterArticleRevisionRichTextArtifact({
    payload: input.payload,
    producedByJobID: input.producedByJobID,
    revision,
    runID: input.runID,
  })
}

export async function saveWriterArticleRevision(input: {
  bodyHtml: string
  metaDescription: string
  payload: PayloadClient
  runID: WriterRelationshipID
  title: string
}): Promise<WriterRunDetail> {
  const detail = await getWriterRunDetail(input.runID, input.payload)
  const finalArticleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)

  if (!finalArticleArtifact) {
    throw new Error('No article draft is available yet. Finish the write stage before saving a revision.')
  }

  const revision = await buildWriterArticleRevisionDocumentFromHtml({
    bodyHtml: input.bodyHtml,
    metaDescription: input.metaDescription,
    title: input.title,
  })
  const completedAt = new Date().toISOString()
  const { revisionArtifact, richTextArtifact } = await upsertWriterArticleRevisionArtifacts({
    payload: input.payload,
    revision,
    runID: input.runID,
  })

  const invalidatedReport = await invalidateWriterCheckArtifactsForArticle({
    articleArtifact: revisionArtifact,
    payload: input.payload,
    runDetail: detail,
  })

  await Promise.all([
    upsertWriterStageExecution(
      input.runID,
      'check',
      {
        errorText: null,
        outputPayload: invalidatedReport
          ? {
              articleArtifactId: invalidatedReport.articleArtifactId,
              currentVerifiedRuleCount: invalidatedReport.coverage.currentVerifiedRuleCount,
              issueCount: invalidatedReport.issues.length,
              pass: invalidatedReport.pass,
              staleIssueCount: invalidatedReport.coverage.staleIssueCount,
            }
          : undefined,
        status: 'awaiting_user',
      },
      input.payload,
    ),
    updateWriterRun(
      input.runID,
      {
        currentStage: 'check',
        errorMessage: null,
        status: 'awaiting_user',
      },
      input.payload,
    ),
    createWriterTraceEvent(
      {
        completedAt,
        eventType: 'article_revision_saved',
        provider: 'local',
        requestPayload: {
          baseArticleArtifactId: finalArticleArtifact.id,
        },
        responsePayload: {
          revisionArtifactId: revisionArtifact.id,
          richTextArtifactId: richTextArtifact.id,
        },
        runID: input.runID,
        stageKey: 'check',
        startedAt: completedAt,
        status: 'completed',
      },
      input.payload,
    ),
  ])

  return getWriterRunDetail(input.runID, input.payload)
}
