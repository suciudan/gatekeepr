import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { createBlogPostDraftFromWriterRun } from '@/lib/aiWriter/articleDraft'
import { saveWriterArticleRevision } from '@/lib/aiWriter/articleRevision'
import { runWriterCheckIssue, runWriterManualStage } from '@/lib/aiWriter/manualStages'
import { createWriterRun, upsertWriterArtifact } from '@/lib/aiWriter/repository'
import type { WriterArtifactRecord, WriterCheckReport, WriterRunDetail } from '@/lib/aiWriter/types'
import { getCmsPayload } from '@/lib/payload'

const runSeoChecklistMock = vi.fn()

vi.mock('@/lib/aiWriter/agentic/seo-checker-settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/aiWriter/agentic/seo-checker-settings')>(
    '@/lib/aiWriter/agentic/seo-checker-settings',
  )

  return {
    ...actual,
    resolveSeoCheckerConfig: () => {
      const config = JSON.parse(actual.defaultSeoCheckerConfigJson) as ReturnType<typeof actual.resolveSeoCheckerConfig>
      const enabledCheckKeys = new Set(['single_h1', 'keyword_in_h2'])

      config.result_order = ['single_h1', 'keyword_in_h2']

      for (const checkKey of Object.keys(config.checks) as Array<keyof typeof config.checks>) {
        config.checks[checkKey].enabled = enabledCheckKeys.has(checkKey as string)
      }

      return config
    },
  }
})

vi.mock('@/lib/aiWriter/agentic/checkers/seo-checker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/aiWriter/agentic/checkers/seo-checker')>(
    '@/lib/aiWriter/agentic/checkers/seo-checker',
  )

  return {
    ...actual,
    runSeoChecklist: (...args: Parameters<typeof actual.runSeoChecklist>) => runSeoChecklistMock(...args),
  }
})

let payload: Payload

const fixture = {
  bodyHtml: '<p>Updated introduction.</p><h2>Overview</h2><p>Updated article copy with a saved revision.</p>',
  keyword: 'WSA 313 revision flow',
  metaDescription: 'Updated AI Writer revision meta description.',
  sourceUrl: 'https://example.com/wsa-313-source',
  title: 'WSA 313 saved revision title',
}

function buildCheckerResult(
  checks: Array<{
    check: string
    notes: string
    status: 'fail' | 'pass' | 'warn'
  }>,
) {
  return {
    checks,
    failCount: checks.filter((check) => check.status === 'fail').length,
    passCount: checks.filter((check) => check.status === 'pass').length,
    sectionCounts: [['Overview', 42]],
    totalWordCount: 140,
    warnCount: checks.filter((check) => check.status === 'warn').length,
  }
}

function getLatestArtifact(
  detail: WriterRunDetail,
  artifactType: WriterArtifactRecord['artifactType'],
) {
  return [...detail.artifacts]
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function getLatestCheckReport(detail: WriterRunDetail) {
  const artifact = getLatestArtifact(detail, 'check_report_json')

  if (!artifact) {
    throw new Error('Expected a check_report_json artifact.')
  }

  return JSON.parse(artifact.content) as WriterCheckReport
}

function buildRevisionBodyHtml(suffix: string) {
  return `${fixture.bodyHtml}<p>${suffix}</p>`
}

async function createRevisionReadyRun(keywordSuffix: string) {
  const { run } = await createWriterRun(
    {
      sourceUrl: fixture.sourceUrl,
      targetKeyword: `${fixture.keyword} ${keywordSuffix}`,
    },
    payload,
  )

  await upsertWriterArtifact(
    {
      artifactRole: 'model_output_normalized',
      artifactType: 'finalized_brief_json',
      content: JSON.stringify({
        SeoBrief: {
          internal_links: ['Signup Protection Guide (https://gatekeepr.io/blog/signup-protection-guide)'],
          meta_descriptions: [fixture.metaDescription],
          target_keyword: `${fixture.keyword} ${keywordSuffix}`,
          title: fixture.title,
        },
      }),
      filename: 'finalized-brief.json',
      mimeType: 'application/json',
      runID: run.id,
    },
    payload,
  )

  await upsertWriterArtifact(
    {
      artifactRole: 'derived',
      artifactType: 'article_draft_md',
      content: [
        '<!-- Meta: Draft article meta description. -->',
        '',
        '# Draft article title',
        '',
        'Draft article content that will be superseded by a saved revision.',
      ].join('\n'),
      filename: 'article-draft.md',
      mimeType: 'text/markdown',
      runID: run.id,
    },
    payload,
  )

  return run
}

beforeAll(async () => {
  payload = await getCmsPayload()

  await payload.delete({
    collection: 'writer-runs',
    where: {
      targetKeyword: {
        contains: fixture.keyword,
      },
    },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ai writer article revision flow', () => {
  it('persists the rich-text revision artifact, regenerates article_revision_md, and exports the latest revision', async () => {
    const run = await createRevisionReadyRun('save')

    const saved = await saveWriterArticleRevision({
      bodyHtml: fixture.bodyHtml,
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: fixture.title,
    })

    const richTextArtifact = saved.artifacts.find((artifact) => artifact.artifactType === 'article_revision_richtext_json')
    const revisionArtifact = saved.artifacts.find((artifact) => artifact.artifactType === 'article_revision_md')

    expect(saved.run.currentStage).toBe('check')
    expect(saved.run.status).toBe('awaiting_user')
    expect(richTextArtifact).toBeTruthy()
    expect(revisionArtifact).toBeTruthy()
    expect(JSON.parse(String(richTextArtifact?.content))).toMatchObject({
      metaDescription: fixture.metaDescription,
      title: fixture.title,
    })
    expect(revisionArtifact?.content).toContain(`<!-- Meta: ${fixture.metaDescription} -->`)
    expect(revisionArtifact?.content).toContain(`# ${fixture.title}`)
    expect(revisionArtifact?.content).toContain('## Overview')

    const createdDraft = await createBlogPostDraftFromWriterRun(run.id, payload)

    expect(createdDraft.finalArticleArtifact.artifactType).toBe('article_revision_md')
    expect(createdDraft.finalArticleArtifact.content).toContain(`# ${fixture.title}`)
  })

  it('checks the saved revision before the draft and initializes rule coverage for the current revision', async () => {
    const run = await createRevisionReadyRun('full-check')

    const saved = await saveWriterArticleRevision({
      bodyHtml: fixture.bodyHtml,
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: fixture.title,
    })
    const savedRevisionArtifact = getLatestArtifact(saved, 'article_revision_md')

    runSeoChecklistMock.mockReturnValueOnce(
      buildCheckerResult([
        {
          check: 'Single H1',
          notes: 'The article is missing a single H1.',
          status: 'fail',
        },
        {
          check: 'Keyword in at least one H2',
          notes: 'The target keyword appears in an H2.',
          status: 'pass',
        },
      ]),
    )

    const afterCheck = await runWriterManualStage(run.id, 'check', payload)
    const report = getLatestCheckReport(afterCheck)

    expect(afterCheck.run.status).toBe('awaiting_user')
    expect(report.articleArtifactType).toBe('article_revision_md')
    expect(report.articleArtifactId).toBe(savedRevisionArtifact?.id)
    expect(report.pass).toBe(false)
    expect(report.coverage).toMatchObject({
      complete: false,
      currentVerifiedRuleCount: 2,
      enabledRuleCount: 2,
      openIssueCount: 1,
      resolvedIssueCount: 1,
      staleIssueCount: 0,
    })
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkKey: 'single_h1',
          id: 'check:single_h1',
          resultStatus: 'fail',
          status: 'open',
        }),
        expect.objectContaining({
          checkKey: 'keyword_in_h2',
          id: 'check:keyword_in_h2',
          resultStatus: 'pass',
          status: 'resolved',
        }),
      ]),
    )
    expect(runSeoChecklistMock.mock.calls[0]?.[0]).toBe(savedRevisionArtifact?.content)
    expect(runSeoChecklistMock.mock.calls[0]?.[2]).toMatchObject({
      result_order: ['single_h1', 'keyword_in_h2'],
    })
  })

  it('marks prior rule validations stale after another revision save', async () => {
    const run = await createRevisionReadyRun('invalidate')

    await saveWriterArticleRevision({
      bodyHtml: fixture.bodyHtml,
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: fixture.title,
    })

    runSeoChecklistMock.mockReturnValueOnce(
      buildCheckerResult([
        {
          check: 'Single H1',
          notes: 'The article is missing a single H1.',
          status: 'fail',
        },
        {
          check: 'Keyword in at least one H2',
          notes: 'The target keyword appears in an H2.',
          status: 'pass',
        },
      ]),
    )

    await runWriterManualStage(run.id, 'check', payload)

    const savedAgain = await saveWriterArticleRevision({
      bodyHtml: buildRevisionBodyHtml('Second saved revision.'),
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: `${fixture.title} second pass`,
    })
    const latestRevisionArtifact = getLatestArtifact(savedAgain, 'article_revision_md')
    const report = getLatestCheckReport(savedAgain)

    expect(savedAgain.run.status).toBe('awaiting_user')
    expect(savedAgain.run.currentStage).toBe('check')
    expect(report.articleArtifactId).toBe(latestRevisionArtifact?.id)
    expect(report.articleArtifactType).toBe('article_revision_md')
    expect(report.pass).toBe(false)
    expect(report.coverage).toMatchObject({
      complete: false,
      currentVerifiedRuleCount: 0,
      enabledRuleCount: 2,
      openIssueCount: 0,
      resolvedIssueCount: 0,
      staleIssueCount: 2,
    })
    expect(savedAgain.stages.find((stage) => stage.stageKey === 'check')?.outputPayload).toMatchObject({
      articleArtifactId: latestRevisionArtifact?.id,
      currentVerifiedRuleCount: 0,
      issueCount: 2,
      pass: false,
      staleIssueCount: 2,
    })
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkKey: 'single_h1',
          status: 'stale',
        }),
        expect.objectContaining({
          checkKey: 'keyword_in_h2',
          status: 'stale',
        }),
      ]),
    )
  })

  it('reruns selected checks without invoking write and completes once all enabled rules are current and passing', async () => {
    const run = await createRevisionReadyRun('targeted')

    await saveWriterArticleRevision({
      bodyHtml: fixture.bodyHtml,
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: fixture.title,
    })

    runSeoChecklistMock.mockReturnValueOnce(
      buildCheckerResult([
        {
          check: 'Single H1',
          notes: 'The article is missing a single H1.',
          status: 'fail',
        },
        {
          check: 'Keyword in at least one H2',
          notes: 'The target keyword appears in an H2.',
          status: 'pass',
        },
      ]),
    )

    await runWriterManualStage(run.id, 'check', payload)

    await saveWriterArticleRevision({
      bodyHtml: buildRevisionBodyHtml('Targeted rerun revision.'),
      metaDescription: fixture.metaDescription,
      payload,
      runID: run.id,
      title: `${fixture.title} targeted`,
    })

    runSeoChecklistMock.mockReturnValueOnce(
      buildCheckerResult([
        {
          check: 'Single H1',
          notes: 'The article includes a single H1.',
          status: 'pass',
        },
      ]),
    )

    const afterSingleRule = await runWriterCheckIssue(run.id, 'single_h1', payload)
    const firstTargetedReport = getLatestCheckReport(afterSingleRule)

    expect(afterSingleRule.run.status).toBe('awaiting_user')
    expect(firstTargetedReport.lastRunMode).toBe('targeted')
    expect(firstTargetedReport.lastRunCheckKey).toBe('single_h1')
    expect(firstTargetedReport.pass).toBe(false)
    expect(firstTargetedReport.coverage).toMatchObject({
      complete: false,
      currentVerifiedRuleCount: 1,
      enabledRuleCount: 2,
      openIssueCount: 0,
      resolvedIssueCount: 1,
      staleIssueCount: 1,
    })
    expect(firstTargetedReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkKey: 'single_h1',
          resultStatus: 'pass',
          status: 'resolved',
          verificationMode: 'targeted',
        }),
        expect.objectContaining({
          checkKey: 'keyword_in_h2',
          status: 'stale',
        }),
      ]),
    )
    expect(runSeoChecklistMock.mock.calls[1]?.[2]).toMatchObject({
      result_order: ['single_h1'],
      checks: {
        keyword_in_h2: {
          enabled: false,
        },
        single_h1: {
          enabled: true,
        },
      },
    })
    expect(afterSingleRule.jobs.filter((job) => job.kind === 'check.audit')).toHaveLength(1)
    expect(afterSingleRule.jobs.filter((job) => job.kind === 'check.revise')).toHaveLength(1)
    expect(afterSingleRule.jobs.filter((job) => job.kind === 'write.generate')).toHaveLength(0)

    runSeoChecklistMock.mockReturnValueOnce(
      buildCheckerResult([
        {
          check: 'Keyword in at least one H2',
          notes: 'The target keyword appears in an H2.',
          status: 'pass',
        },
      ]),
    )

    const afterSecondRule = await runWriterCheckIssue(run.id, 'keyword_in_h2', payload)
    const secondTargetedReport = getLatestCheckReport(afterSecondRule)

    expect(afterSecondRule.run.status).toBe('completed')
    expect(afterSecondRule.run.currentStage).toBe('check')
    expect(secondTargetedReport.lastRunMode).toBe('targeted')
    expect(secondTargetedReport.lastRunCheckKey).toBe('keyword_in_h2')
    expect(secondTargetedReport.pass).toBe(true)
    expect(secondTargetedReport.coverage).toMatchObject({
      complete: true,
      currentVerifiedRuleCount: 2,
      enabledRuleCount: 2,
      openIssueCount: 0,
      resolvedIssueCount: 2,
      staleIssueCount: 0,
    })
    expect(secondTargetedReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkKey: 'single_h1',
          status: 'resolved',
          verificationMode: 'targeted',
        }),
        expect.objectContaining({
          checkKey: 'keyword_in_h2',
          status: 'resolved',
          verificationMode: 'targeted',
        }),
      ]),
    )
    expect(runSeoChecklistMock.mock.calls[2]?.[2]).toMatchObject({
      result_order: ['keyword_in_h2'],
      checks: {
        keyword_in_h2: {
          enabled: true,
        },
        single_h1: {
          enabled: false,
        },
      },
    })
    expect(afterSecondRule.jobs.filter((job) => job.kind === 'check.audit')).toHaveLength(1)
    expect(afterSecondRule.jobs.filter((job) => job.kind === 'check.revise')).toHaveLength(2)
    expect(afterSecondRule.jobs.filter((job) => job.kind === 'write.generate')).toHaveLength(0)
  })
})
