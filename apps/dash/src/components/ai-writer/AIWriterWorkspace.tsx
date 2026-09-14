'use client'

import { useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import type { WriterCheckIssue, WriterCheckReport, WriterRunDetail, WriterRunSummary } from '@/lib/aiWriter/types'

type Props = {
  initialRuns: WriterRunSummary[]
}

function getLatestFinalArticleArtifact(detail: WriterRunDetail | null) {
  if (!detail) return null

  return (
    [...detail.artifacts]
      .filter((artifact) => artifact.artifactType === 'article_revision_md')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
    [...detail.artifacts]
      .filter((artifact) => artifact.artifactType === 'article_draft_md')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
    null
  )
}

function formatStageLabel(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'Not started'
}

function formatStatusLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function formatUpdatedAt(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function getLatestArtifact(detail: WriterRunDetail | null, artifactTypes: string | string[]) {
  if (!detail) return null

  const normalizedArtifactTypes = Array.isArray(artifactTypes) ? artifactTypes : [artifactTypes]

  return [...detail.artifacts]
    .filter((artifact) => normalizedArtifactTypes.includes(artifact.artifactType))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

function getStageStatus(detail: WriterRunDetail | null, stageKey: string) {
  return detail?.stages.find((stage) => stage.stageKey === stageKey)?.status ?? null
}

function hasPendingStage(detail: WriterRunDetail | null) {
  return Boolean(
    detail &&
      (detail.run.status === 'processing' ||
        detail.run.status === 'discovering' ||
        detail.stages.some((stage) => stage.status === 'queued' || stage.status === 'running')),
  )
}

async function readJson(response: Response) {
  const rawText = await response.text()
  let payload: Record<string, unknown> = {}

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    const fallbackText = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    throw new Error(
      message ||
        fallbackText ||
        `AI Writer request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`,
    )
  }

  return payload
}

function parseJsonContent<T>(content: string): null | T {
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function formatIssueSeverity(value: null | 'error' | 'warning') {
  if (value === 'error') {
    return 'Failing check'
  }

  if (value === 'warning') {
    return 'Warning'
  }

  return 'Verified'
}

function formatIssueStatus(value: WriterCheckIssue['status']) {
  if (value === 'open') {
    return 'Open'
  }

  if (value === 'resolved') {
    return 'Resolved for current revision'
  }

  return 'Stale for current revision'
}

function normalizeCheckIssues(report: null | Partial<WriterCheckReport>): WriterCheckIssue[] {
  if (!Array.isArray(report?.issues)) {
    return []
  }

  return report.issues.map((issue, index) => {
    if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
      const candidate = issue as Partial<WriterCheckReport['issues'][number]>
      const resultStatus =
        candidate.resultStatus === 'fail' || candidate.resultStatus === 'pass' || candidate.resultStatus === 'warn'
          ? candidate.resultStatus
          : null

      return {
        articleArtifactId:
          typeof candidate.articleArtifactId === 'number' && Number.isFinite(candidate.articleArtifactId)
            ? candidate.articleArtifactId
            : null,
        articleArtifactType:
          typeof candidate.articleArtifactType === 'string' ? candidate.articleArtifactType : null,
        checkKey: typeof candidate.checkKey === 'string' ? candidate.checkKey : `issue_${index + 1}`,
        id: typeof candidate.id === 'string' ? candidate.id : `issue_${index + 1}`,
        label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label : `Issue ${index + 1}`,
        notes: typeof candidate.notes === 'string' ? candidate.notes : '',
        resultStatus,
        severity:
          candidate.severity === 'error' || candidate.severity === 'warning'
            ? candidate.severity
            : resultStatus === 'fail'
              ? 'error'
              : resultStatus === 'warn'
                ? 'warning'
                : null,
        status:
          candidate.status === 'resolved' || candidate.status === 'stale' || candidate.status === 'open'
            ? candidate.status
            : resultStatus === 'pass'
              ? 'resolved'
              : resultStatus
                ? 'open'
                : 'stale',
        verificationMode:
          candidate.verificationMode === 'full' || candidate.verificationMode === 'targeted'
            ? candidate.verificationMode
            : null,
        verifiedAt: typeof candidate.verifiedAt === 'string' ? candidate.verifiedAt : null,
      }
    }

    return {
      articleArtifactId: null,
      articleArtifactType: null,
      checkKey: `legacy_${index + 1}`,
      id: `legacy_${index + 1}`,
      label: `Issue ${index + 1}`,
      notes: typeof issue === 'string' ? issue : '',
      resultStatus: 'fail' as const,
      severity: 'error' as const,
      status: 'open' as const,
      verificationMode: null,
      verifiedAt: null,
    }
  })
}

function getCheckIssueRecheckMessage(detail: WriterRunDetail, checkKey: string) {
  const checkArtifact = getLatestArtifact(detail, 'check_report_json')
  const report = checkArtifact ? parseJsonContent<WriterCheckReport>(checkArtifact.content) : null
  const issue = normalizeCheckIssues(report).find((candidate) => candidate.checkKey === checkKey)

  if (!issue) {
    return 'Rechecked this issue against the current saved article revision.'
  }

  if (issue.status === 'resolved') {
    return `Rechecked "${issue.label}". It is resolved for the current revision.`
  }

  if (issue.status === 'open') {
    return `Rechecked "${issue.label}". It is still failing. Edit and save the article revision, then recheck it.`
  }

  return `Rechecked "${issue.label}". It is still stale for the current revision.`
}

function getCheckIssueFixMessage(detail: WriterRunDetail, checkKey: string) {
  if (checkKey === 'gaps_addressed') {
    return `Generated missing gap content. ${getCheckIssueRecheckMessage(detail, checkKey)}`
  }

  if (checkKey === 'differentiators_included') {
    return `Generated a targeted differentiator patch. ${getCheckIssueRecheckMessage(detail, checkKey)}`
  }

  return `Generated missing sections. ${getCheckIssueRecheckMessage(detail, checkKey)}`
}

function splitIssueNotes(value: string) {
  return value
    .split(/;\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getMissingSectionBudgetItems(value: string) {
  return splitIssueNotes(value)
    .map((item) => item.match(/^(.+?):\s*missing section\s*\(budget:\s*(\d+)\)$/iu))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      targetWords: Number.parseInt(match[2] ?? '', 10),
      title: match[1]?.trim() ?? '',
    }))
    .filter((item) => item.title && Number.isFinite(item.targetWords) && item.targetWords > 0)
}

function getMissingDifferentiatorItems(value: string) {
  const match = value.match(/\bMissing:\s*([\s\S]+)$/iu)
  const missingText = match?.[1]
    ?.replace(/\s+All present\.?$/iu, '')
    .trim() ?? ''

  return splitIssueNotes(missingText)
}

function getMissingGapItems(value: string) {
  const match = value.match(/\bMissing:\s*([\s\S]+)$/iu)
  const missingText = match?.[1]
    ?.replace(/\s+All addressed\.?$/iu, '')
    .trim() ?? ''

  return splitIssueNotes(missingText)
}

export function AIWriterWorkspace({ initialRuns }: Props) {
  const { config } = useConfig()
  const router = useRouter()
  const [runs, setRuns] = useState(initialRuns)
  const [selectedRunId, setSelectedRunId] = useState<null | number>(initialRuns[0]?.id ?? null)
  const [detail, setDetail] = useState<null | WriterRunDetail>(null)
  const [targetKeyword, setTargetKeyword] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [statusMessageIssueKey, setStatusMessageIssueKey] = useState('')
  const [activeMissingSectionIssueKey, setActiveMissingSectionIssueKey] = useState('')
  const [selectedSourceIDs, setSelectedSourceIDs] = useState<number[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(initialRuns.length === 0)
  const [isPending, startTransition] = useTransition()

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  )

  async function refreshRuns() {
    const refreshedRuns = (await readJson(await fetch('/api/ai-writer/runs', { cache: 'no-store' }))) as {
      runs: WriterRunSummary[]
    }

    setRuns(refreshedRuns.runs)
    return refreshedRuns.runs
  }

  const fetchRunDetail = useCallback(async (runID: number) => {
    const payload = (await readJson(await fetch(`/api/ai-writer/runs/${runID}`, { cache: 'no-store' }))) as WriterRunDetail
    return payload
  }, [])

  const applyRunDetail = useCallback((payload: WriterRunDetail) => {
    setSelectedRunId(payload.run.id)
    setDetail(payload)
    setSelectedSourceIDs(
      payload.sources.filter((source) => source.role === 'competitor' && source.selected).map((source) => source.id),
    )
  }, [])

  const loadRun = useCallback(async (runID: number) => {
    setError('')
    setStatusMessage('')
    setStatusMessageIssueKey('')
    setActiveMissingSectionIssueKey('')
    applyRunDetail(await fetchRunDetail(runID))
  }, [applyRunDetail, fetchRunDetail])

  useEffect(() => {
    if (!selectedRunId || detail?.run.id === selectedRunId) {
      return
    }

    void loadRun(selectedRunId)
  }, [detail?.run.id, loadRun, selectedRunId])

  const shouldPollRun = hasPendingStage(detail)

  useEffect(() => {
    if (!selectedRunId || !shouldPollRun) {
      return
    }

    let cancelled = false
    const refreshPendingRun = async () => {
      try {
        const payload = await fetchRunDetail(selectedRunId)

        if (!cancelled) {
          applyRunDetail(payload)
        }
      } catch {
        // Keep the existing visible state; explicit user actions still surface request errors.
      }
    }
    const interval = setInterval(() => {
      void refreshPendingRun()
    }, 3000)

    void refreshPendingRun()

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [applyRunDetail, fetchRunDetail, selectedRunId, shouldPollRun])

  function toggleCompetitor(sourceID: number) {
    setSelectedSourceIDs((current) =>
      current.includes(sourceID) ? current.filter((value) => value !== sourceID) : [...current, sourceID],
    )
  }

  function handleCreateRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      try {
        setError('')
        const payload = (await readJson(
          await fetch('/api/ai-writer/runs', {
            body: JSON.stringify({ sourceUrl, targetKeyword }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        await refreshRuns()
        setDetail(payload)
        setSelectedRunId(payload.run.id)
        setSelectedSourceIDs(payload.sources.filter((source) => source.role === 'competitor' && source.selected).map((source) => source.id))
        setIsCreateOpen(false)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to create AI Writer run.')
      }
    })
  }

  function handleContinueSources() {
    if (!detail) return

    startTransition(async () => {
      try {
        setError('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${detail.run.id}/select-sources`, {
            body: JSON.stringify({ sourceIDs: selectedSourceIDs }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        await refreshRuns()
        setDetail(payload)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to continue AI Writer run.')
      }
    })
  }

  function handleCreateDraft() {
    if (!detail) return

    startTransition(async () => {
      try {
        setError('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${detail.run.id}/create-draft`, {
            method: 'POST',
          }),
        )) as {
          detail: WriterRunDetail
          draft: {
            id: number
            title: string
            uid: string
            updatedAt: string
          }
          editorPath: string
          reusedExistingDraft: boolean
        }

        await refreshRuns()
        setDetail(payload.detail)
        router.push(payload.editorPath)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to create the CMS draft.')
      }
    })
  }

  function handleStageAction(stageKey: 'brief' | 'validate' | 'write' | 'check') {
    if (!detail) return

    startTransition(async () => {
      try {
        setError('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${detail.run.id}/${stageKey}`, {
            method: 'POST',
          }),
        )) as WriterRunDetail

        await refreshRuns()
        setDetail(payload)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : `Failed to run the ${stageKey} stage.`)
      }
    })
  }

  function handleRerunCheckIssue(checkKey: string) {
    if (!detail) return

    startTransition(async () => {
      try {
        setError('')
        setStatusMessage('')
        setStatusMessageIssueKey('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${detail.run.id}/check-issue`, {
            body: JSON.stringify({ checkKey }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        await refreshRuns()
        setDetail(payload)
        setStatusMessage(getCheckIssueRecheckMessage(payload, checkKey))
        setStatusMessageIssueKey(checkKey)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to rerun the selected check issue.')
      }
    })
  }

  function handleGenerateCheckIssueFix(checkKey: string) {
    if (!detail) return

    if (!finalArticleArtifact) {
      setError('Article output is not available yet. Complete the write stage before generating a targeted fix.')
      setStatusMessage('')
      setStatusMessageIssueKey('')
      return
    }

    setError('')
    setStatusMessage('Generating a targeted article fix. This can take a minute.')
    setStatusMessageIssueKey(checkKey)
    setActiveMissingSectionIssueKey(checkKey)

    void (async () => {
      try {
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${detail.run.id}/fix-check-issue`, {
            body: JSON.stringify({ checkKey }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        await refreshRuns()
        setDetail(payload)
        setStatusMessage(getCheckIssueFixMessage(payload, checkKey))
        setStatusMessageIssueKey(checkKey)
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : 'Failed to generate a targeted fix.'
        setError(message)
        setStatusMessage(message)
        setStatusMessageIssueKey(checkKey)
      } finally {
        setActiveMissingSectionIssueKey('')
      }
    })()
  }

  const finalArticleArtifact = getLatestFinalArticleArtifact(detail)
  const latestBriefArtifact = getLatestArtifact(detail, 'finalized_brief_json') ?? getLatestArtifact(detail, 'brief_json')
  const latestDraftArtifact = getLatestArtifact(detail, 'article_draft_md')
  const latestRevisionArtifact = getLatestArtifact(detail, 'article_revision_md')
  const latestCheckArtifact = getLatestArtifact(detail, 'check_report_json')
  const canRunBrief = ['awaiting_user', 'failed'].includes(getStageStatus(detail, 'brief') ?? '')
  const canRunValidate = ['awaiting_user', 'failed'].includes(getStageStatus(detail, 'validate') ?? '')
  const canRunWrite = ['awaiting_user', 'failed'].includes(getStageStatus(detail, 'write') ?? '')
  const canRunCheck = Boolean(finalArticleArtifact && latestBriefArtifact)
  const canRunWriteAction = canRunWrite && !latestCheckArtifact
  const checkReport = latestCheckArtifact ? parseJsonContent<WriterCheckReport>(latestCheckArtifact.content) : null
  const checkIssues = normalizeCheckIssues(checkReport)
  const actionableCheckIssues = checkIssues.filter((issue) => issue.status !== 'resolved')
  const checkCoverage = checkReport?.coverage ?? null
  const draftEditorPath = detail?.run.createdDraftID
    ? `${config.routes.admin}/collections/blog-posts/${detail.run.createdDraftID}`
    : null
  const runEditorPath = detail
    ? `${config.routes.admin}/collections/writer-runs/${detail.run.id}`
    : null

  return (
    <div className="ai-writer-workspace">
      <section className="ai-writer-workspace__panel">
        <div className="ai-writer-workspace__section-heading">
          <div>
            <p className="ai-writer-view__eyebrow">Flows</p>
            <h2 className="ai-writer-view__card-title">Previous AI flows</h2>
          </div>
          <div className="ai-writer-workspace__actions">
            <button
              className="btn btn--style-primary"
              onClick={() => setIsCreateOpen((current) => !current)}
              type="button"
            >
              {isCreateOpen ? 'Hide new flow' : 'Start new flow'}
            </button>
          </div>
        </div>

        <div className="ai-writer-workspace__run-list">
          {runs.map((run) => (
            <button
              key={run.id}
              className={[
                'ai-writer-workspace__run-card',
                selectedRun?.id === run.id && 'ai-writer-workspace__run-card--active',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                void loadRun(run.id)
              }}
              type="button"
            >
              <strong>{run.targetKeyword}</strong>
              <span>{run.sourceUrl}</span>
              <span>
                {formatStatusLabel(run.status)} · {formatStageLabel(run.currentStage)}
              </span>
              <span>
                {run.createdDraftID ? `Draft #${run.createdDraftID}` : 'Flow only'} · Updated {formatUpdatedAt(run.updatedAt)}
              </span>
            </button>
          ))}
          {runs.length === 0 ? <p className="ai-writer-workspace__empty">No AI flows yet. Start one from this page.</p> : null}
        </div>

        {error ? <p className="ai-writer-workspace__error">{error}</p> : null}
        {statusMessage ? <p className="ai-writer-workspace__notice">{statusMessage}</p> : null}
      </section>

      {isCreateOpen ? (
        <section className="ai-writer-workspace__panel">
          <div className="ai-writer-workspace__section-heading">
            <div>
              <p className="ai-writer-view__eyebrow">Kickoff</p>
              <h2 className="ai-writer-view__card-title">Start a new flow</h2>
            </div>
          </div>

          <form className="ai-writer-workspace__form" onSubmit={handleCreateRun}>
            <label className="field-label">
              <span>Target keyword</span>
              <input className="field-input" onChange={(event) => setTargetKeyword(event.target.value)} value={targetKeyword} />
            </label>
            <label className="field-label">
              <span>Original source URL</span>
              <input className="field-input" onChange={(event) => setSourceUrl(event.target.value)} value={sourceUrl} />
            </label>
            <div className="ai-writer-workspace__actions">
              <button className="btn btn--style-primary" disabled={isPending} type="submit">
                {isPending ? 'Starting…' : 'Start flow'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="ai-writer-workspace__panel">
        <div className="ai-writer-workspace__section-heading">
          <div>
            <p className="ai-writer-view__eyebrow">Run detail</p>
            <h2 className="ai-writer-view__card-title">Workflow state</h2>
          </div>
        </div>

        {!detail && selectedRun ? (
          <div className="ai-writer-workspace__actions">
            <button className="btn btn--style-secondary" onClick={() => void loadRun(selectedRun.id)} type="button">
              Load selected run
            </button>
          </div>
        ) : null}

        {detail ? (
          <div className="ai-writer-workspace__detail-grid">
            <div className="ai-writer-workspace__detail-card">
              <h3>Overview</h3>
              <p>
                <strong>Status:</strong> {formatStatusLabel(detail.run.status)}
              </p>
              <p>
                <strong>Current stage:</strong> {formatStageLabel(detail.run.currentStage)}
              </p>
              <p>
                <strong>Word target:</strong> {detail.run.targetWordCount || 'Pending'}
              </p>
              <p>
                <strong>CMS draft:</strong> {detail.run.createdDraftID ? `#${detail.run.createdDraftID}` : 'Not created'}
              </p>
              <p>
                <strong>Final article:</strong>{' '}
                {finalArticleArtifact
                  ? finalArticleArtifact.artifactType === 'article_revision_md'
                    ? 'Saved AI Writer revision'
                    : 'Write-stage draft'
                  : 'Not available'}
              </p>
            </div>

            <div className="ai-writer-workspace__detail-card">
              <h3>Stages</h3>
              <ul className="ai-writer-workspace__compact-list">
                {detail.stages.map((stage) => (
                  <li key={stage.id}>
                    <strong>{formatStageLabel(stage.stageKey)}</strong> · {formatStatusLabel(stage.status)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="ai-writer-workspace__detail-card">
              <h3>Manual stages</h3>
              <div className="ai-writer-workspace__actions">
                <button
                  className="btn btn--style-secondary"
                  disabled={isPending || !canRunBrief}
                  onClick={() => handleStageAction('brief')}
                  type="button"
                >
                  {isPending && detail.run.currentStage === 'brief' ? 'Generating brief…' : 'Generate brief'}
                </button>
                <button
                  className="btn btn--style-secondary"
                  disabled={isPending || !canRunValidate}
                  onClick={() => handleStageAction('validate')}
                  type="button"
                >
                  {isPending && detail.run.currentStage === 'validate' ? 'Validating…' : 'Validate brief'}
                </button>
                <button
                  className="btn btn--style-secondary"
                  disabled={isPending || !canRunWriteAction}
                  onClick={() => handleStageAction('write')}
                  type="button"
                >
                  {isPending && detail.run.currentStage === 'write' ? 'Writing…' : 'Write article'}
                </button>
                <button
                  className="btn btn--style-secondary"
                  disabled={isPending || !canRunCheck}
                  onClick={() => handleStageAction('check')}
                  type="button"
                >
                  {isPending && detail.run.currentStage === 'check'
                    ? 'Checking…'
                    : latestCheckArtifact
                      ? 'Rerun full local check'
                      : 'Run full local check'}
                </button>
              </div>
              {latestCheckArtifact ? (
                <p className="ai-writer-workspace__empty" style={{ marginBottom: 0 }}>
                  Post-check remediation now happens in AI Writer. Edit and save the revision from the workflow editor, then rerun the local check.
                </p>
              ) : null}
            </div>

            <div className="ai-writer-workspace__detail-card">
              <h3>Artifacts</h3>
              <ul className="ai-writer-workspace__compact-list">
                {detail.artifacts.map((artifact) => (
                  <li key={artifact.id}>
                    <strong>{artifact.artifactType}</strong> · {artifact.filename}
                  </li>
                ))}
              </ul>

              <div className="ai-writer-workspace__actions">
                {runEditorPath ? (
                  <a className="btn btn--style-secondary" href={runEditorPath}>
                    Open flow editor
                  </a>
                ) : null}
                {detail.run.createdDraftID && draftEditorPath ? (
                  <a className="btn btn--style-secondary" href={draftEditorPath}>
                    Open draft
                  </a>
                ) : null}
                {!detail.run.createdDraftID ? (
                  <button
                    className="btn btn--style-primary"
                    disabled={isPending || !finalArticleArtifact}
                    onClick={handleCreateDraft}
                    type="button"
                  >
                    {isPending ? 'Creating draft…' : 'Create draft'}
                  </button>
                ) : null}
              </div>
              {!detail.run.createdDraftID && !finalArticleArtifact ? (
                <p className="ai-writer-workspace__empty">
                  Final article output is not available yet. Complete the write/check stages before creating a CMS draft.
                </p>
              ) : finalArticleArtifact ? (
                <p className="ai-writer-workspace__empty">
                  Draft export uses the latest final article artifact, including any saved AI Writer revision.
                </p>
              ) : null}
            </div>

            <div className="ai-writer-workspace__detail-card ai-writer-workspace__detail-card--wide">
              <h3>Latest outputs</h3>
              <ul className="ai-writer-workspace__compact-list">
                <li>
                  <strong>Brief:</strong> {latestBriefArtifact?.filename ?? 'Not generated'}
                </li>
                <li>
                  <strong>Write-stage draft:</strong> {latestDraftArtifact?.filename ?? 'Not generated'}
                </li>
                <li>
                  <strong>Final article:</strong> {(latestRevisionArtifact ?? finalArticleArtifact)?.filename ?? 'Not generated'}
                </li>
                <li>
                  <strong>Check:</strong> {latestCheckArtifact?.filename ?? 'Not generated'}
                </li>
              </ul>
            </div>

            {latestCheckArtifact ? (
              <div className="ai-writer-workspace__detail-card ai-writer-workspace__detail-card--wide">
                <h3>Post-check remediation</h3>
                <p>
                  Review issues here, then edit the article in AI Writer. Save the revision in the workflow editor and rerun either the
                  selected issue or the full local check until every enabled rule is verified for the current saved revision. Draft export
                  stays available, but it is downstream from this loop.
                </p>

                <div className="ai-writer-workspace__actions">
                  {runEditorPath ? (
                    <a className="btn btn--style-primary" href={runEditorPath}>
                      Open AI Writer editor
                    </a>
                  ) : null}
                  <button
                    className="btn btn--style-secondary"
                    disabled={isPending || !canRunCheck}
                    onClick={() => handleStageAction('check')}
                    type="button"
                  >
                    {isPending && detail.run.currentStage === 'check' ? 'Checking…' : 'Rerun full local check'}
                  </button>
                </div>

                {checkCoverage ? (
                  <div className="ai-writer-workspace__detail-card" style={{ marginTop: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Coverage</h4>
                    <p style={{ marginBottom: '.35rem', marginTop: '.5rem' }}>
                      <strong>
                        {checkCoverage.currentVerifiedRuleCount}/{checkCoverage.enabledRuleCount}
                      </strong>{' '}
                      rules verified for the current revision
                    </p>
                    <p style={{ margin: 0 }}>
                      {checkCoverage.openIssueCount} open · {checkCoverage.resolvedIssueCount} resolved · {checkCoverage.staleIssueCount} stale
                    </p>
                  </div>
                ) : null}

                {actionableCheckIssues.length ? (
                  <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem' }}>
                    {checkIssues.map((issue, index) => {
                      const isGeneratingMissingSections = activeMissingSectionIssueKey === issue.checkKey
                      const issueStatusMessage = statusMessageIssueKey === issue.checkKey ? statusMessage : ''
                      const missingSectionItems = getMissingSectionBudgetItems(issue.notes)
                      const missingGapItems = getMissingGapItems(issue.notes)
                      const missingDifferentiatorItems = getMissingDifferentiatorItems(issue.notes)
                      const canGenerateTargetedFix =
                        (issue.checkKey === 'section_budgets' && missingSectionItems.length > 0) ||
                        (issue.checkKey === 'gaps_addressed' && missingGapItems.length > 0) ||
                        (issue.checkKey === 'differentiators_included' && missingDifferentiatorItems.length > 0)

                      return (
                        <div
                          key={issue.id || `${issue.checkKey}-${index}`}
                          style={{
                            background: 'var(--theme-elevation-50)',
                            border: '1px solid var(--theme-elevation-150)',
                            borderRadius: '.5rem',
                            display: 'grid',
                            gap: '.4rem',
                            padding: '.85rem 1rem',
                          }}
                        >
                        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'space-between' }}>
                          <strong>{issue.label}</strong>
                          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
                            <span
                              style={{
                                background:
                                  issue.status === 'resolved'
                                    ? 'var(--theme-success-100)'
                                    : issue.status === 'stale'
                                      ? 'var(--theme-warning-100)'
                                      : 'var(--theme-error-100)',
                                borderRadius: '999px',
                                color:
                                  issue.status === 'resolved'
                                    ? 'var(--theme-success-700)'
                                    : issue.status === 'stale'
                                      ? 'var(--theme-warning-700)'
                                      : 'var(--theme-error-700)',
                                fontSize: '.75rem',
                                fontWeight: 700,
                                padding: '.2rem .55rem',
                              }}
                            >
                              {formatIssueStatus(issue.status)}
                            </span>
                            {issue.severity ? (
                              <span
                                style={{
                                  background: issue.severity === 'error' ? 'var(--theme-error-100)' : 'var(--theme-warning-100)',
                                  borderRadius: '999px',
                                  color: issue.severity === 'error' ? 'var(--theme-error-700)' : 'var(--theme-warning-700)',
                                  fontSize: '.75rem',
                                  fontWeight: 700,
                                  padding: '.2rem .55rem',
                                }}
                              >
                                {formatIssueSeverity(issue.severity)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span style={{ color: 'var(--theme-elevation-600)', fontSize: '.85rem' }}>
                          {issue.verificationMode
                            ? `Last verified by ${issue.verificationMode} rerun${issue.verifiedAt ? ` at ${new Date(issue.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}.`
                            : issue.status === 'stale'
                              ? 'This rule has not been verified for the current revision yet.'
                              : 'Rule state available.'}
                        </span>
                        <span style={{ whiteSpace: 'pre-line' }}>
                          {issue.notes || 'No additional notes were returned for this check.'}
                        </span>
                        {issue.status !== 'resolved' ? (
                          <div
                            className="ai-writer-workspace__actions"
                            style={{
                              alignItems: 'center',
                              flexWrap: 'nowrap',
                              justifyContent: 'flex-start',
                            }}
                          >
                            <button
                              className="btn btn--style-secondary"
                              disabled={isPending}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleRerunCheckIssue(issue.checkKey)
                              }}
                              type="button"
                            >
                              {isPending ? 'Rechecking…' : 'Recheck this issue'}
                            </button>
                            {canGenerateTargetedFix ? (
                              <button
                                className="btn btn--style-secondary"
                                disabled={isPending || Boolean(activeMissingSectionIssueKey)}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  handleGenerateCheckIssueFix(issue.checkKey)
                                }}
                                type="button"
                              >
                                {isGeneratingMissingSections
                                  ? 'Generating…'
                                  : issue.checkKey === 'differentiators_included' || issue.checkKey === 'gaps_addressed'
                                    ? 'Generate missing content'
                                    : 'Generate missing sections'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {issueStatusMessage ? (
                          <span style={{ color: 'var(--theme-warning-700)', fontSize: '.85rem' }}>
                            {issueStatusMessage}
                          </span>
                        ) : null}
                      </div>
                      )
                    })}
                  </div>
                ) : checkReport?.pass ? (
                  <p className="ai-writer-workspace__empty" style={{ marginBottom: 0 }}>
                    The latest saved revision passed the local check, and every enabled rule is verified for the current article.
                  </p>
                ) : (
                  <p className="ai-writer-workspace__empty" style={{ marginBottom: 0 }}>
                    Check output is available, but it did not include any structured issues.
                  </p>
                )}
              </div>
            ) : null}

            <div className="ai-writer-workspace__detail-card ai-writer-workspace__detail-card--wide">
              <h3>Sources</h3>
              <ul className="ai-writer-workspace__source-list">
                {detail.sources.map((source) => {
                  const checked = selectedSourceIDs.includes(source.id)
                  const canSelect = source.role === 'competitor'

                  return (
                    <li key={source.id}>
                      <label>
                        <input
                          checked={source.role === 'original' ? true : checked}
                          disabled={!canSelect || isPending}
                          onChange={() => toggleCompetitor(source.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{source.title || source.url}</strong>
                          <small>
                            {source.role} · {formatStatusLabel(source.fetchStatus)}
                          </small>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>

              {detail.run.status === 'awaiting_selection' ? (
                <div className="ai-writer-workspace__actions">
                  <button className="btn btn--style-primary" disabled={isPending} onClick={handleContinueSources} type="button">
                    {isPending ? 'Continuing…' : 'Continue with selected sources'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="ai-writer-workspace__empty">Select a flow to inspect its workflow state.</p>
        )}
      </section>
    </div>
  )
}
