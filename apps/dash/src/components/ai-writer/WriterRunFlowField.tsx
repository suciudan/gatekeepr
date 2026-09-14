'use client'

import { marked } from 'marked'
import { useDocumentInfo, useForm } from '@payloadcms/ui'
import { useCallback, useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'

import { WriterArticleConversionWidget } from '@/components/ai-writer/WriterArticleConversionWidget'
import { WriterRichTextHtmlEditor } from '@/components/ai-writer/WriterRichTextHtmlEditor'
import {
  writerRunSaveRevisionRequestEvent,
  type WriterRunSaveRevisionRequestDetail,
} from '@/components/ai-writer/saveRevisionEvents'
import { applyWriterRunStageProcessing } from '@/lib/aiWriter/runDetailState'
import {
  getWriterTranscriptGroupProviderLabel,
  groupWriterTranscriptTraces,
  type WriterTranscriptTraceGroup,
} from '@/lib/aiWriter/transcript'
import {
  getDisplayableAnthropicToolSummaries,
  type AnthropicTraceContentBlock,
} from '@/lib/aiWriter/transcriptDisplay'
import { writerAutomatedStageKeys } from '@/lib/aiWriter/types'
import type {
  WriterArtifactRecord,
  WriterCheckIssue,
  WriterCheckLink,
  WriterCheckReport,
  WriterRunDetail,
} from '@/lib/aiWriter/types'

type ConversationArtifactMessage = {
  artifacts: WriterArtifactRecord[]
  body: string
  createdAt: string
  id: string
  meta?: string[]
  tone?: 'neutral' | 'success' | 'warning'
  title: string
}

type ContentRunConversationEntry =
  | {
      createdAt: string
      kind: 'artifact'
      message: ConversationArtifactMessage
    }
  | {
      createdAt: string
      kind: 'trace'
      traceGroup: WriterTranscriptTraceGroup
    }

const siteOwnedHostname = 'gatekeepr.io'

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

function isAutomatedStage(
  value: null | WriterRunDetail['run']['currentStage'],
): value is (typeof writerAutomatedStageKeys)[number] {
  return Boolean(
    value && writerAutomatedStageKeys.includes(value as (typeof writerAutomatedStageKeys)[number]),
  )
}

function isAutoRunnableManualStage(value: null | 'brief' | 'validate' | 'write' | 'check') {
  return value === 'brief' || value === 'validate' || value === 'write' || value === 'check'
}

function isManualStage(
  value: null | WriterRunDetail['run']['currentStage'],
): value is 'brief' | 'validate' | 'write' | 'check' {
  return value === 'brief' || value === 'validate' || value === 'write' || value === 'check'
}

function getLatestArtifact(detail: null | WriterRunDetail, artifactTypes: string[]) {
  if (!detail) {
    return null
  }

  return (
    [...detail.artifacts]
      .filter((artifact) => artifactTypes.includes(artifact.artifactType))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  )
}

function getLatestArtifacts(detail: null | WriterRunDetail, artifactTypes: string[]) {
  if (!detail) {
    return []
  }

  return [...detail.artifacts]
    .filter((artifact) => artifactTypes.includes(artifact.artifactType))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function formatArtifactBytes(content: string) {
  const bytes = new TextEncoder().encode(content).length

  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getArtifactDownloadLabel(artifact: WriterRunDetail['artifacts'][number]) {
  if (artifact.filename.toLowerCase().endsWith('.md') || artifact.mimeType === 'text/markdown') {
    return 'Download MD'
  }

  if (
    artifact.filename.toLowerCase().endsWith('.json') ||
    artifact.mimeType === 'application/json'
  ) {
    return 'Download JSON'
  }

  return 'Download file'
}

function parseJsonContent<T>(content: string): null | T {
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function normalizeEditorHtml(value: string) {
  return value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
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
        candidate.resultStatus === 'fail' ||
        candidate.resultStatus === 'pass' ||
        candidate.resultStatus === 'warn'
          ? candidate.resultStatus
          : null

      return {
        articleArtifactId:
          typeof candidate.articleArtifactId === 'number' &&
          Number.isFinite(candidate.articleArtifactId)
            ? candidate.articleArtifactId
            : null,
        articleArtifactType:
          typeof candidate.articleArtifactType === 'string' ? candidate.articleArtifactType : null,
        checkKey:
          typeof candidate.checkKey === 'string' ? candidate.checkKey : `issue_${index + 1}`,
        id: typeof candidate.id === 'string' ? candidate.id : `issue_${index + 1}`,
        label:
          typeof candidate.label === 'string' && candidate.label.trim()
            ? candidate.label
            : `Issue ${index + 1}`,
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
          candidate.status === 'resolved' ||
          candidate.status === 'stale' ||
          candidate.status === 'open'
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
  const checkArtifact = getLatestArtifact(detail, ['check_report_json'])
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

function parseBudgetNoteItem(value: string) {
  const match = value.match(/^(.*):\s*(\d+)\/(\d+)\s*\(([-+]?[\d.]+%)\)$/)

  if (!match) {
    return null
  }

  return {
    actualWords: match[2],
    delta: match[4],
    deltaPercent: Number.parseFloat(match[4]),
    targetWords: match[3],
    title: match[1],
  }
}

function shouldShowIssueNoteItem(value: string) {
  const budgetItem = parseBudgetNoteItem(value)

  if (!budgetItem) {
    return true
  }

  return budgetItem.deltaPercent <= -15 || budgetItem.deltaPercent >= 15
}

function normalizeCheckLinks(value: unknown): WriterCheckLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null
      }

      const candidate = item as Partial<WriterCheckLink>
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''

      if (!url) {
        return null
      }

      return {
        anchorText: typeof candidate.anchorText === 'string' ? candidate.anchorText.trim() : '',
        hostname: typeof candidate.hostname === 'string' ? candidate.hostname.trim() : '',
        url,
      } satisfies WriterCheckLink
    })
    .filter((link): link is WriterCheckLink => Boolean(link))
}

function normalizeHostname(value: string) {
  return value
    .toLowerCase()
    .replace(/^www\./, '')
    .trim()
}

function isSiteOwnedHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)
  return (
    normalizedHostname === siteOwnedHostname || normalizedHostname.endsWith(`.${siteOwnedHostname}`)
  )
}

function extractLinksFromArticleHtml(html: string) {
  const internalLinks = new Map<string, WriterCheckLink>()
  const authorityLinks = new Map<string, WriterCheckLink>()

  if (!html.trim()) {
    return {
      authorityLinks: [],
      internalLinks: [],
    }
  }

  const pattern = /<a\b[^>]*href=(["'])(https?:\/\/.*?)\1[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(pattern)) {
    const url = match[2]?.trim()

    if (!url) {
      continue
    }

    try {
      const parsedUrl = new URL(url)
      const hostname = normalizeHostname(parsedUrl.hostname)
      const anchorText = (match[3] ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
      const link = {
        anchorText,
        hostname,
        url,
      }

      if (isSiteOwnedHostname(hostname)) {
        internalLinks.set(url, link)
      } else {
        authorityLinks.set(url, link)
      }
    } catch {
      continue
    }
  }

  return {
    authorityLinks: [...authorityLinks.values()],
    internalLinks: [...internalLinks.values()],
  }
}

function extractArticleMarkdown(content: string) {
  const taggedFileMatch = content.match(/<FILE\s+path=["'][^"']+["']>([\s\S]*?)<\/FILE>/i)
  if (taggedFileMatch?.[1]?.trim()) {
    return taggedFileMatch[1].trim()
  }

  const namedFileMatch = content.match(/<file\s+name=["'][^"']+["']>([\s\S]*?)<\/file>/i)
  if (namedFileMatch?.[1]?.trim()) {
    return namedFileMatch[1].trim()
  }

  return content.trim()
}

function stripLeadingMarkdownComments(content: string) {
  return content.replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/u, '').trimStart()
}

function extractArticleMetaDescription(content: string) {
  const match = content.match(/<!--\s*(?:meta_description|Meta):\s*([\s\S]*?)\s*-->/i)
  return match?.[1]?.trim() ?? ''
}

function stripLeadingMarkdownTitle(content: string, title: string) {
  const normalizedTitle = title.trim()

  if (!normalizedTitle) {
    return content
  }

  const withoutLeadingComments = stripLeadingMarkdownComments(content)
  const lines = withoutLeadingComments.split('\n')
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0)

  if (firstNonEmptyIndex === -1) {
    return withoutLeadingComments
  }

  const firstLine = lines[firstNonEmptyIndex]?.trim() ?? ''
  const headingMatch = firstLine.match(/^#\s+(.+)$/)

  if (!headingMatch) {
    return withoutLeadingComments
  }

  if (headingMatch[1]?.trim() !== normalizedTitle) {
    return withoutLeadingComments
  }

  lines.splice(firstNonEmptyIndex, 1)

  if (lines[firstNonEmptyIndex]?.trim() === '') {
    lines.splice(firstNonEmptyIndex, 1)
  }

  return lines.join('\n').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function formatTraceEventLabel(value: string) {
  return value.replaceAll('_', ' ').trim()
}

function getTraceRequestPayload(trace: WriterRunDetail['traceEvents'][number]) {
  return trace.requestPayload && isRecord(trace.requestPayload) ? trace.requestPayload : null
}

function getTraceResponsePayload(trace: WriterRunDetail['traceEvents'][number]) {
  return trace.responsePayload && isRecord(trace.responsePayload) ? trace.responsePayload : null
}

function getTraceInputFiles(trace: WriterRunDetail['traceEvents'][number]) {
  const requestPayload = getTraceRequestPayload(trace)
  const candidateFiles = Array.isArray(requestPayload?.inputFiles) ? requestPayload.inputFiles : []

  return candidateFiles
    .map((entry) => (isRecord(entry) ? entry : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      fileId: pickString(entry.fileId),
      filename: pickString(entry.filename),
      mimeType: pickString(entry.mimeType),
      sizeBytes:
        typeof entry.sizeBytes === 'number' && Number.isFinite(entry.sizeBytes)
          ? entry.sizeBytes
          : null,
    }))
    .filter((entry) => entry.filename)
}

function getTracePromptText(trace: WriterRunDetail['traceEvents'][number]) {
  const requestPayload = getTraceRequestPayload(trace)
  return pickString(requestPayload?.prompt) || pickString(requestPayload?.promptPreview)
}

function getTraceSystemText(trace: WriterRunDetail['traceEvents'][number]) {
  const requestPayload = getTraceRequestPayload(trace)
  return pickString(requestPayload?.system) || pickString(requestPayload?.systemPreview)
}

function traceUsesPromptPreview(trace: WriterRunDetail['traceEvents'][number]) {
  const requestPayload = getTraceRequestPayload(trace)
  return !pickString(requestPayload?.prompt) && Boolean(pickString(requestPayload?.promptPreview))
}

function getTraceResponseTextBlocks(trace: WriterRunDetail['traceEvents'][number]) {
  const textBlocks = extractAnthropicContentBlocks(trace)
    .filter((block) => block.type === 'text' && pickString(block.text))
    .map((block) => pickString(block.text))
    .filter(Boolean)

  if (textBlocks.length > 0) {
    return textBlocks
  }

  const responsePayload = getTraceResponsePayload(trace)
  const fallbackText = pickString(responsePayload?.text) || pickString(responsePayload?.textPreview)

  return fallbackText ? [fallbackText] : []
}

function traceUsesResponsePreview(trace: WriterRunDetail['traceEvents'][number]) {
  const responsePayload = getTraceResponsePayload(trace)
  return !pickString(responsePayload?.text) && Boolean(pickString(responsePayload?.textPreview))
}

function getTraceProviderLabel(trace: WriterRunDetail['traceEvents'][number]) {
  if (trace.provider === 'openai') {
    return 'ChatGPT'
  }

  if (trace.provider === 'anthropic') {
    return 'Claude'
  }

  return 'AI Writer'
}

function describeRunningAnthropicTrace(trace: WriterRunDetail['traceEvents'][number]) {
  const requestPayload = getTraceRequestPayload(trace)
  const filename = pickString(requestPayload?.filename)
  const promptPreview = getTracePromptText(trace)
  const providerLabel = getTraceProviderLabel(trace)

  if (filename) {
    return `${providerLabel} is generating ${filename}.`
  }

  if (promptPreview) {
    return `${providerLabel} is working on: ${promptPreview.slice(0, 180)}${promptPreview.length > 180 ? '…' : ''}`
  }

  return `${providerLabel} is processing this step.`
}

function formatTraceTimestamp(value: string | null) {
  if (!value) {
    return ''
  }

  try {
    return new Date(value).toLocaleString([], {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      second: '2-digit',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function extractAnthropicContentBlocks(trace: WriterRunDetail['traceEvents'][number]) {
  const contentBlocks = getTraceResponsePayload(trace)?.contentBlocks
  return Array.isArray(contentBlocks) ? (contentBlocks as AnthropicTraceContentBlock[]) : []
}

function collectRemoteFileIds(value: unknown, fileIds: Set<string>) {
  if (!value) {
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRemoteFileIds(entry, fileIds)
    }

    return
  }

  if (!isRecord(value)) {
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'file_id' && typeof entry === 'string' && entry.trim()) {
      fileIds.add(entry.trim())
      continue
    }

    collectRemoteFileIds(entry, fileIds)
  }
}

function getTraceRemoteFiles(
  detail: WriterRunDetail,
  trace: WriterRunDetail['traceEvents'][number],
) {
  const fileIds = new Set<string>()

  const responsePayload = getTraceResponsePayload(trace)

  if (Array.isArray(responsePayload?.fileIds)) {
    for (const fileId of responsePayload.fileIds) {
      if (typeof fileId === 'string' && fileId.trim()) {
        fileIds.add(fileId.trim())
      }
    }
  }

  for (const block of extractAnthropicContentBlocks(trace)) {
    collectRemoteFileIds(block, fileIds)
  }

  return detail.remoteFiles.filter((remoteFile) => fileIds.has(remoteFile.fileId))
}

function getTraceGroupRemoteFiles(detail: WriterRunDetail, group: WriterTranscriptTraceGroup) {
  const remoteFiles = new Map<number, WriterRunDetail['remoteFiles'][number]>()

  for (const trace of group.anthropicTraces) {
    for (const remoteFile of getTraceRemoteFiles(detail, trace)) {
      remoteFiles.set(remoteFile.id, remoteFile)
    }
  }

  return [...remoteFiles.values()]
}

function getTraceGroupResponseTextBlocks(group: WriterTranscriptTraceGroup) {
  if (!group.responseTrace) {
    return []
  }

  return getTraceResponseTextBlocks(group.responseTrace)
}

function formatTraceSourceLabel(group: WriterTranscriptTraceGroup) {
  if (!group.source) {
    return null
  }

  if (group.source.role === 'original') {
    return 'Original source'
  }

  if (group.source.serpPosition != null) {
    return `Competitor ${group.source.serpPosition}`
  }

  return 'Competitor source'
}

function getTranscriptGroupNotes(group: WriterTranscriptTraceGroup) {
  const notes: string[] = []

  if (group.usedInlineFallback) {
    notes.push('Inline fallback')
  }

  if (group.usedInlineRepair) {
    notes.push('JSON repair')
  }

  if (group.usedLocalFallback) {
    notes.push('Local fallback')
  }

  return notes
}

function looksLikeStructuredTranscript(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  return (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('```') ||
    /^#{1,6}\s+\S/m.test(trimmed) ||
    /^\s*[-*]\s+\S/m.test(trimmed) ||
    /^\s*\d+\.\s+\S/m.test(trimmed) ||
    /\n\s*\n/.test(trimmed)
  )
}

const assistantConversationMaxWidth = 'min(100%, 768px)'
const assistantConversationLaneStyle = {
  display: 'grid',
  justifyItems: 'start',
  maxWidth: assistantConversationMaxWidth,
  width: '100%',
} as const

export function WriterRunFlowField() {
  const { id, isEditing } = useDocumentInfo()
  const { setModified } = useForm()
  const [activeTab, setActiveTab] = useState<'article' | 'content_run'>('content_run')
  const [articleBodyHasUserChanges, setArticleBodyHasUserChanges] = useState(false)
  const [articleBodyHtmlDraft, setArticleBodyHtmlDraft] = useState('')
  const [articleMetaDescriptionDraft, setArticleMetaDescriptionDraft] = useState('')
  const [articleTitleDraft, setArticleTitleDraft] = useState('')
  const [detail, setDetail] = useState<null | WriterRunDetail>(null)
  const [editorResetKey, setEditorResetKey] = useState('empty')
  const [selectedSourceIDs, setSelectedSourceIDs] = useState<number[]>([])
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [statusMessageIssueKey, setStatusMessageIssueKey] = useState('')
  const [activeCheckIssueKey, setActiveCheckIssueKey] = useState('')
  const [activeMissingSectionIssueKey, setActiveMissingSectionIssueKey] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [isPending, startTransition] = useTransition()
  const autoStageKeys = useRef(new Set<string>())
  const defaultTabAppliedRunID = useRef<number | null>(null)
  const userSelectedTab = useRef(false)

  const runID = typeof id === 'number' ? id : Number.parseInt(String(id ?? ''), 10)
  const hasRunId = Number.isFinite(runID)

  function handleSelectTab(tab: 'article' | 'content_run') {
    userSelectedTab.current = true
    setActiveTab(tab)
  }

  const loadRun = useEffectEvent(async () => {
    if (!hasRunId) {
      return
    }

    try {
      setError('')
      setStatusMessage('')
      setStatusMessageIssueKey('')
      setSelectionError('')
      const payload = (await readJson(
        await fetch(`/api/ai-writer/runs/${runID}`, { cache: 'no-store' }),
      )) as WriterRunDetail
      setDetail(payload)
      setSelectedSourceIDs(
        payload.sources
          .filter((source) => source.role === 'competitor' && source.selected)
          .map((source) => source.id),
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Failed to load SERP results.',
      )
    }
  })

  useEffect(() => {
    if (!isEditing || !hasRunId) {
      return
    }

    void loadRun()
  }, [hasRunId, isEditing, runID])

  useEffect(() => {
    if (!isEditing || !hasRunId || detail?.run.status !== 'processing') {
      return
    }

    const timer = window.setInterval(() => {
      void loadRun()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [detail?.run.status, hasRunId, isEditing, runID])

  useEffect(() => {
    if (!isEditing) {
      return
    }

    const shouldLockFields = Boolean(
      detail?.run.currentStage &&
      detail.run.currentStage !== 'discover_serp' &&
      detail.run.currentStage !== 'source_selection',
    )

    for (const fieldName of ['targetKeyword', 'sourceUrl']) {
      const input = document.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`)

      if (!input) {
        continue
      }

      input.readOnly = shouldLockFields
      input.setAttribute('aria-readonly', shouldLockFields ? 'true' : 'false')
    }
  }, [detail?.run.currentStage, isEditing])

  useEffect(() => {
    if (!detail || isPending) {
      return
    }

    const getStageStatus = (stageKey: 'brief' | 'validate' | 'write' | 'check') =>
      detail.stages.find((stage) => stage.stageKey === stageKey)?.status ?? null
    const hasBriefArtifact = detail.artifacts.some(
      (artifact) =>
        artifact.artifactType === 'brief_json' || artifact.artifactType === 'finalized_brief_json',
    )
    const hasCheckArtifact = detail.artifacts.some(
      (artifact) => artifact.artifactType === 'check_report_json',
    )
    const stageToRun =
      detail.run.currentStage === 'brief' &&
      detail.run.status === 'awaiting_user' &&
      !hasBriefArtifact
        ? 'brief'
        : detail.run.currentStage === 'validate' && getStageStatus('validate') === 'awaiting_user'
          ? 'validate'
          : detail.run.currentStage === 'write' && getStageStatus('write') === 'awaiting_user'
            ? 'write'
            : detail.run.currentStage === 'check' &&
                getStageStatus('check') === 'awaiting_user' &&
                !hasCheckArtifact
              ? 'check'
              : null

    if (!stageToRun || !isAutoRunnableManualStage(stageToRun)) {
      return
    }

    const runStageKey = `${detail.run.id}:${stageToRun}`

    if (autoStageKeys.current.has(runStageKey)) {
      return
    }

    autoStageKeys.current.add(runStageKey)

    startTransition(async () => {
      try {
        setError('')
        setDetail((current) =>
          current ? applyWriterRunStageProcessing(current, stageToRun) : current,
        )
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/${stageToRun}`, {
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
      } catch (requestError) {
        autoStageKeys.current.delete(runStageKey)
        setError(
          requestError instanceof Error
            ? requestError.message
            : `Failed to run the ${stageToRun} stage.`,
        )
      }
    })
  }, [detail, isPending, runID])

  function toggleCompetitor(sourceID: number) {
    setSelectionError('')
    setSelectedSourceIDs((current) =>
      current.includes(sourceID)
        ? current.filter((value) => value !== sourceID)
        : [...current, sourceID],
    )
  }

  function handleContinueSources() {
    if (selectedSourceIDs.length === 0) {
      setSelectionError('Competitor Results is required.')
      return
    }

    startTransition(async () => {
      try {
        setError('')
        setSelectionError('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/select-sources`, {
            body: JSON.stringify({ sourceIDs: selectedSourceIDs }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
        setSelectedSourceIDs(
          payload.sources
            .filter((source) => source.role === 'competitor' && source.selected)
            .map((source) => source.id),
        )
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to continue the AI Writer flow.',
        )
      }
    })
  }

  function handleRetryRun() {
    startTransition(async () => {
      try {
        setError('')
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/retry`, {
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to retry the AI Writer flow.',
        )
      }
    })
  }

  function handleRunManualStage(stageKey: 'brief' | 'validate' | 'write' | 'check') {
    startTransition(async () => {
      try {
        setError('')
        setDetail((current) =>
          current ? applyWriterRunStageProcessing(current, stageKey) : current,
        )
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/${stageKey}`, {
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : `Failed to run the ${stageKey} stage.`,
        )
      }
    })
  }

  function handleArticleBodyChange(html: string) {
    setArticleBodyHtmlDraft(html)
    setArticleBodyHasUserChanges(true)
    setModified(true)
  }

  function handleArticleTitleChange(value: string) {
    setArticleTitleDraft(value)
    setModified(true)
  }

  function handleArticleMetaDescriptionChange(value: string) {
    setArticleMetaDescriptionDraft(value)
    setModified(true)
  }

  function handleRerunCheckIssue(checkKey: string) {
    if (!articleArtifact) {
      setError(
        'Article output is not available yet. Complete the write stage before rerunning an individual check.',
      )
      return
    }

    if (hasUnsavedArticleChanges) {
      setError('Save the article revision before rerunning an individual check.')
      return
    }

    startTransition(async () => {
      try {
        setError('')
        setStatusMessage('')
        setStatusMessageIssueKey('')
        setActiveCheckIssueKey(checkKey)
        setDetail((current) =>
          current ? applyWriterRunStageProcessing(current, 'check') : current,
        )
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/check-issue`, {
            body: JSON.stringify({
              checkKey,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
        setStatusMessage(getCheckIssueRecheckMessage(payload, checkKey))
        setStatusMessageIssueKey(checkKey)
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to rerun the selected check issue.',
        )
      } finally {
        setActiveCheckIssueKey('')
      }
    })
  }

  function handleGenerateCheckIssueFix(checkKey: string) {
    if (!articleArtifact) {
      setError(
        'Article output is not available yet. Complete the write stage before generating a targeted fix.',
      )
      setStatusMessage('')
      setStatusMessageIssueKey('')
      return
    }

    if (hasUnsavedArticleChanges) {
      setError('Save the article revision before generating a targeted fix.')
      setStatusMessage('')
      setStatusMessageIssueKey('')
      return
    }

    setError('')
    setStatusMessage('Generating a targeted article fix. This can take a minute.')
    setStatusMessageIssueKey(checkKey)
    setActiveMissingSectionIssueKey(checkKey)
    setDetail((current) => (current ? applyWriterRunStageProcessing(current, 'check') : current))

    void (async () => {
      try {
        const payload = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/fix-check-issue`, {
            body: JSON.stringify({
              checkKey,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as WriterRunDetail

        setDetail(payload)
        setStatusMessage(getCheckIssueFixMessage(payload, checkKey))
        setStatusMessageIssueKey(checkKey)
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Failed to generate a targeted fix.'
        setError(message)
        setStatusMessage(message)
        setStatusMessageIssueKey(checkKey)
      } finally {
        setActiveMissingSectionIssueKey('')
      }
    })()
  }

  function handleDownloadArtifact(artifact: WriterRunDetail['artifacts'][number]) {
    const blob = new Blob([artifact.content], {
      type: artifact.mimeType || 'text/plain;charset=utf-8',
    })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = artifact.filename || 'artifact.txt'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url)
    }, 0)
  }

  const getStageStatus = (stageKey: 'brief' | 'validate' | 'write' | 'check') =>
    detail?.stages.find((stage) => stage.stageKey === stageKey)?.status ?? null

  const competitorSources = detail?.sources.filter((source) => source.role === 'competitor') ?? []
  const isAwaitingSelection =
    detail?.run.currentStage === 'source_selection' || detail?.run.status === 'awaiting_selection'
  const isRetryableFailure = Boolean(
    detail?.run.status === 'failed' && isAutomatedStage(detail.run.currentStage),
  )
  const retryableManualFailureStage =
    detail?.run.status === 'failed' && isManualStage(detail.run.currentStage)
      ? detail.run.currentStage
      : null
  const activeManualStage =
    detail?.run.currentStage === 'brief' && getStageStatus('brief') === 'awaiting_user'
      ? 'brief'
      : detail?.run.currentStage === 'validate' && getStageStatus('validate') === 'awaiting_user'
        ? 'validate'
        : detail?.run.currentStage === 'write' && getStageStatus('write') === 'awaiting_user'
          ? 'write'
          : detail?.run.currentStage === 'check' && getStageStatus('check') === 'awaiting_user'
            ? 'check'
            : null
  const activeManualStageLabel =
    activeManualStage === 'brief'
      ? 'Generating brief.'
      : activeManualStage === 'validate'
        ? 'Validating brief.'
        : activeManualStage === 'write'
          ? 'Writing article.'
          : activeManualStage === 'check'
            ? 'Running check.'
            : ''
  const factpackArtifacts = getLatestArtifacts(detail, ['factpack_md', 'factpack_json']).slice(0, 2)
  const briefArtifacts = getLatestArtifacts(detail, [
    'finalized_brief_json',
    'brief_json',
    'brief_raw_json',
  ]).slice(0, 3)
  const validationArtifacts = getLatestArtifacts(detail, ['review_log_json']).slice(0, 1)
  const articleConversationArtifacts = getLatestArtifacts(detail, [
    'article_revision_md',
    'article_draft_md',
  ]).slice(0, 2)
  const checkConversationArtifacts = getLatestArtifacts(detail, [
    'check_report_json',
    'failing_list_md',
  ]).slice(0, 2)
  const latestRichTextRevisionArtifact = getLatestArtifact(detail, [
    'article_revision_richtext_json',
  ])
  const articleArtifact = getLatestArtifact(detail, ['article_revision_md', 'article_draft_md'])
  const briefArtifact = getLatestArtifact(detail, [
    'finalized_brief_json',
    'brief_json',
    'brief_raw_json',
  ])
  const reviewLogArtifact = getLatestArtifact(detail, ['review_log_json'])
  const canRunWriteFromSidebar = Boolean(briefArtifact && reviewLogArtifact)
  const isFailedWriteRun = detail?.run.status === 'failed' && detail.run.currentStage === 'write'
  const checkArtifact = getLatestArtifact(detail, ['check_report_json'])
  const briefContent = briefArtifact
    ? parseJsonContent<{ title?: string }>(briefArtifact.content)
    : null
  const checkContent = checkArtifact
    ? parseJsonContent<WriterCheckReport>(checkArtifact.content)
    : null
  const checkIssues = normalizeCheckIssues(checkContent)
  const openCheckIssues = checkIssues.filter((issue) => issue.status === 'open')
  const staleCheckIssues = checkIssues.filter((issue) => issue.status === 'stale')
  const checkCoverage = checkContent?.coverage ?? null
  const normalizedArticleMarkdown = articleArtifact
    ? extractArticleMarkdown(articleArtifact.content)
    : ''
  const articleMarkdownWithoutComments = normalizedArticleMarkdown
    ? stripLeadingMarkdownComments(normalizedArticleMarkdown)
    : ''
  const articleTitle =
    briefContent?.title?.trim() ||
    articleMarkdownWithoutComments.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    detail?.run.targetKeyword ||
    'Article'
  const articleMetaDescription = normalizedArticleMarkdown
    ? extractArticleMetaDescription(normalizedArticleMarkdown)
    : ''
  const articleBody = normalizedArticleMarkdown
    ? stripLeadingMarkdownTitle(normalizedArticleMarkdown, articleTitle)
    : ''
  const articleBodyHtml = articleBody
    ? marked.parse(articleBody, { async: false, gfm: true })
    : '<p></p>'
  const articleHtmlLinkFallback = extractLinksFromArticleHtml(
    articleBodyHtmlDraft || articleBodyHtml,
  )
  const reportInternalLinks = normalizeCheckLinks(checkContent?.internalLinks)
  const reportAuthorityLinks = normalizeCheckLinks(checkContent?.authorityLinks)
  const checkInternalLinks = reportInternalLinks.length
    ? reportInternalLinks
    : articleHtmlLinkFallback.internalLinks
  const checkAuthorityLinks = reportAuthorityLinks.length
    ? reportAuthorityLinks
    : articleHtmlLinkFallback.authorityLinks
  const hasUnsavedArticleChanges = Boolean(
    articleArtifact &&
    (articleTitleDraft.trim() !== articleTitle.trim() ||
      articleMetaDescriptionDraft.trim() !== articleMetaDescription.trim() ||
      articleBodyHasUserChanges ||
      normalizeEditorHtml(articleBodyHtmlDraft) !== normalizeEditorHtml(articleBodyHtml)),
  )
  const hasSavedRevisionPendingCheck = Boolean(checkCoverage && checkCoverage.staleIssueCount > 0)
  const articleNeedsCheckRerun =
    hasUnsavedArticleChanges || hasSavedRevisionPendingCheck || openCheckIssues.length > 0
  const canRunCheckFromArticle = Boolean(articleArtifact && !hasUnsavedArticleChanges)
  const saveArticleRevision = useCallback(async () => {
    if (!articleArtifact) {
      throw new Error('Article output is not available yet.')
    }

    setError('')
    const payload = (await readJson(
      await fetch(`/api/ai-writer/runs/${runID}/save-revision`, {
        body: JSON.stringify({
          bodyHtml: articleBodyHtmlDraft,
          metaDescription: articleMetaDescriptionDraft,
          title: articleTitleDraft,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    )) as WriterRunDetail

    setDetail(payload)
    setModified(false)
  }, [
    articleArtifact,
    articleBodyHtmlDraft,
    articleMetaDescriptionDraft,
    articleTitleDraft,
    runID,
    setModified,
  ])

  useEffect(() => {
    if (
      !detail ||
      !articleArtifact ||
      userSelectedTab.current ||
      defaultTabAppliedRunID.current === detail.run.id
    ) {
      return
    }

    if (detail.run.status === 'completed' || detail.run.currentStage === 'check') {
      defaultTabAppliedRunID.current = detail.run.id
      setActiveTab('article')
    }
  }, [articleArtifact, detail])

  function handleSaveRevision() {
    startTransition(async () => {
      try {
        await saveArticleRevision()
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to save the article revision.',
        )
      }
    })
  }

  const transcriptTraceGroups = detail ? groupWriterTranscriptTraces(detail) : []
  const runCreatedAt = detail?.run.createdAt ?? new Date(0).toISOString()
  const selectedCompetitorTitles = competitorSources
    .filter((source) => source.selected)
    .map((source) => source.title || source.url)
    .filter(Boolean)
  const conversationArtifactMessages: ConversationArtifactMessage[] = [
    factpackArtifacts.length
      ? {
          artifacts: factpackArtifacts,
          body: 'I assembled the source-backed factpack so the later stages can work from extracted evidence instead of raw pages.',
          createdAt: factpackArtifacts[0]?.updatedAt ?? runCreatedAt,
          id: 'factpack',
          meta: [
            `${factpackArtifacts.length} file${factpackArtifacts.length === 1 ? '' : 's'} saved`,
          ],
          title: 'Factpack ready',
        }
      : null,
    briefArtifacts.length
      ? {
          artifacts: briefArtifacts,
          body: briefArtifacts.some((artifact) => artifact.artifactType === 'finalized_brief_json')
            ? 'I drafted the brief, reviewed it, and saved the finalized version that drives the article output.'
            : 'I generated the working brief for this run.',
          createdAt: briefArtifacts[0]?.updatedAt ?? runCreatedAt,
          id: 'brief',
          meta: briefContent?.title ? [`Working title: ${briefContent.title}`] : undefined,
          title: 'Brief ready',
        }
      : null,
    validationArtifacts.length
      ? {
          artifacts: validationArtifacts,
          body: 'I validated the brief and saved the review log for the writing pass.',
          createdAt: validationArtifacts[0]?.updatedAt ?? runCreatedAt,
          id: 'validation',
          title: 'Validation saved',
        }
      : null,
    articleConversationArtifacts.length
      ? {
          artifacts: articleConversationArtifacts,
          body:
            articleArtifact?.artifactType === 'article_revision_md'
              ? 'The latest article lives in AI Writer as a saved revision.'
              : 'The write-stage article draft is ready.',
          createdAt: articleConversationArtifacts[0]?.updatedAt ?? runCreatedAt,
          id: 'article',
          meta: [
            articleTitle ? `Title: ${articleTitle}` : '',
            articleMetaDescription ? `Meta: ${articleMetaDescription}` : '',
          ].filter(Boolean),
          title:
            articleArtifact?.artifactType === 'article_revision_md'
              ? 'Article revision ready'
              : 'Article draft ready',
        }
      : null,
    checkConversationArtifacts.length
      ? {
          artifacts: checkConversationArtifacts,
          body:
            checkContent?.summary ||
            (checkContent?.pass
              ? 'The local check passed for the current article revision.'
              : 'The local check report is ready for review.'),
          createdAt: checkConversationArtifacts[0]?.updatedAt ?? runCreatedAt,
          id: 'check',
          meta: checkCoverage
            ? [
                `Coverage ${checkCoverage.currentVerifiedRuleCount}/${checkCoverage.enabledRuleCount}`,
                `${checkCoverage.openIssueCount} open`,
                `${checkCoverage.staleIssueCount} stale`,
              ]
            : undefined,
          tone: checkContent?.pass ? 'success' : 'warning',
          title: checkContent?.pass ? 'Check passed' : 'Check report ready',
        }
      : null,
  ].filter((message): message is ConversationArtifactMessage => Boolean(message))
  const contentRunConversation: ContentRunConversationEntry[] = [
    ...transcriptTraceGroups.map((traceGroup) => ({
      createdAt: traceGroup.createdAt,
      kind: 'trace' as const,
      traceGroup,
    })),
    ...conversationArtifactMessages.map((message) => ({
      createdAt: message.createdAt,
      kind: 'artifact' as const,
      message,
    })),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const currentRunNarrative = isAwaitingSelection
    ? {
        actionLabel: null,
        body: `I found ${competitorSources.length} competitor results. Pick the sources you want me to use, then I’ll continue with the run.`,
        title: 'Waiting for source selection',
      }
    : detail?.run.status === 'processing'
      ? {
          actionLabel: null,
          body: `I’m currently working on ${formatTraceEventLabel(detail?.run.currentStage ?? 'the run')}.`,
          title: 'Generation in progress',
        }
      : activeManualStage
        ? {
            actionLabel:
              activeManualStage === 'brief'
                ? 'Generate brief'
                : activeManualStage === 'validate'
                  ? 'Validate brief'
                  : activeManualStage === 'write'
                    ? 'Write article'
                    : 'Run local check',
            body:
              activeManualStage === 'check'
                ? 'The article draft is ready. Run the local check when you want to review the current article.'
                : `${activeManualStageLabel} Continue when you want the next step to run.`,
            title:
              activeManualStage === 'check' ? 'Ready for local check' : 'Ready for the next step',
          }
        : detail?.run.status === 'completed'
          ? {
              actionLabel: null,
              body: 'This generation pass is complete. Review the article or move into the post-check editing loop.',
              title: 'Run completed',
            }
          : null

  useEffect(() => {
    if (!articleArtifact) {
      setArticleTitleDraft('')
      setArticleMetaDescriptionDraft('')
      setArticleBodyHtmlDraft('')
      setArticleBodyHasUserChanges(false)
      setModified(false)
      setEditorResetKey('empty')
      return
    }

    setArticleTitleDraft(articleTitle)
    setArticleMetaDescriptionDraft(articleMetaDescription)
    setArticleBodyHtmlDraft(articleBodyHtml)
    setArticleBodyHasUserChanges(false)
    setModified(false)
    setEditorResetKey(
      `${articleArtifact.id}:${articleArtifact.updatedAt}:${latestRichTextRevisionArtifact?.updatedAt ?? 'none'}`,
    )
  }, [
    articleArtifact,
    articleArtifact?.id,
    articleArtifact?.updatedAt,
    articleBodyHtml,
    articleMetaDescription,
    articleTitle,
    latestRichTextRevisionArtifact?.updatedAt,
    setModified,
  ])

  useEffect(() => {
    if (!hasUnsavedArticleChanges) {
      return
    }

    const handleSaveRequest = (event: Event) => {
      const customEvent = event as CustomEvent<WriterRunSaveRevisionRequestDetail>
      customEvent.detail.saveRevision = async () => {
        try {
          await saveArticleRevision()
        } catch (requestError) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Failed to save the article revision.',
          )
        }
      }
    }

    window.addEventListener(writerRunSaveRevisionRequestEvent, handleSaveRequest)

    return () => {
      window.removeEventListener(writerRunSaveRevisionRequestEvent, handleSaveRequest)
    }
  }, [hasUnsavedArticleChanges, saveArticleRevision])

  if (!isEditing || !hasRunId) {
    return null
  }

  return (
    <div className="writer-run-flow-field">
      {error ? <p className="writer-run-flow-field__error">{error}</p> : null}
      {statusMessage ? <p className="writer-run-flow-field__notice">{statusMessage}</p> : null}
      <div
        style={{
          borderBottom: '1px solid var(--theme-elevation-150)',
          display: 'flex',
          gap: '.75rem',
          marginBottom: '0',
          marginTop: '-.5rem',
        }}
      >
        {[
          { key: 'content_run' as const, label: 'Content Run' },
          { key: 'article' as const, label: 'Article' },
        ].map((tab) => {
          const isActive = activeTab === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => handleSelectTab(tab.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--theme-success-500)'
                  : '2px solid transparent',
                color: isActive ? 'var(--theme-text)' : 'var(--theme-elevation-500)',
                cursor: 'pointer',
                fontSize: '.95rem',
                fontWeight: 600,
                marginBottom: '-1px',
                padding: '.75rem 1rem',
              }}
              type="button"
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {!detail ? (
        <p className="ai-writer-workspace__empty">Loading results…</p>
      ) : activeTab === 'article' ? (
        <div
          style={{
            alignItems: 'start',
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(18rem, 1fr)',
          }}
        >
          <div style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
            <div className="field-type text">
              <label className="field-label">
                <span>Title</span>
              </label>
              <input
                className="field-input"
                disabled={!articleArtifact || isPending}
                onChange={(event) => handleArticleTitleChange(event.target.value)}
                value={articleTitleDraft}
              />
            </div>

            <div className="field-type textarea">
              <label className="field-label">
                <span>Meta Description</span>
              </label>
              <textarea
                className="field-input"
                disabled={!articleArtifact || isPending}
                onChange={(event) => handleArticleMetaDescriptionChange(event.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
                value={articleMetaDescriptionDraft}
              />
            </div>

            <div style={{ display: 'grid', gap: '.35rem' }}>
              <div style={{ display: 'grid', gap: '.15rem' }}>
                <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
                  Body
                </span>
                <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.8125rem' }}>
                  Edit the article body here, save the revision, then rerun the local check.
                </span>
              </div>
              {articleArtifact ? (
                <WriterRichTextHtmlEditor
                  disabled={isPending}
                  initialHtml={articleBodyHtmlDraft}
                  onChange={handleArticleBodyChange}
                  resetKey={editorResetKey}
                />
              ) : (
                <p className="ai-writer-workspace__empty" style={{ margin: 0 }}>
                  Article output is not available yet.
                </p>
              )}
            </div>
          </div>

          <aside
            style={{
              display: 'grid',
              gap: '1rem',
            }}
          >
            <section
              style={{
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: '.75rem',
                display: 'grid',
                gap: '.9rem',
                padding: '1rem 1.25rem',
              }}
            >
              <div style={{ display: 'grid', gap: '.2rem' }}>
                <strong>Post-check loop</strong>
                <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
                  1. Review issues. 2. Edit in AI Writer. 3. Save the revision. 4. Rerun the local
                  check.
                </span>
              </div>

              <div
                style={{
                  background: articleNeedsCheckRerun
                    ? 'var(--theme-warning-50)'
                    : 'var(--theme-success-50)',
                  border: `1px solid ${articleNeedsCheckRerun ? 'var(--theme-warning-150)' : 'var(--theme-success-150)'}`,
                  borderRadius: '.5rem',
                  display: 'grid',
                  gap: '.35rem',
                  padding: '.8rem .9rem',
                }}
              >
                <strong
                  style={{
                    color: articleNeedsCheckRerun
                      ? 'var(--theme-warning-700)'
                      : 'var(--theme-success-700)',
                  }}
                >
                  {hasUnsavedArticleChanges
                    ? 'Unsaved article changes'
                    : !checkContent
                      ? 'Ready for first local check'
                      : hasSavedRevisionPendingCheck
                        ? 'Current revision needs targeted revalidation'
                        : checkContent?.pass
                          ? 'Latest revision passed'
                          : 'Open check issues remain'}
                </strong>
                <span style={{ color: 'var(--theme-text)' }}>
                  {hasUnsavedArticleChanges
                    ? 'Save the latest article edits before rerunning the checker.'
                    : !checkContent
                      ? 'Run the full local checker once to initialize rule coverage for this article.'
                      : hasSavedRevisionPendingCheck
                        ? 'The article changed after the last verification. Rerun individual rules or the full local check for the current revision.'
                        : checkContent?.pass
                          ? 'The latest saved revision passed the local checker.'
                          : 'Resolve the remaining open checks or rerun the full local checker.'}
                </span>
              </div>

              {checkCoverage ? (
                <div
                  style={{
                    background: 'var(--theme-elevation-50)',
                    border: '1px solid var(--theme-elevation-150)',
                    borderRadius: '.5rem',
                    display: 'grid',
                    gap: '.2rem',
                    padding: '.8rem .9rem',
                  }}
                >
                  <strong>
                    Rule coverage: {checkCoverage.currentVerifiedRuleCount}/
                    {checkCoverage.enabledRuleCount}
                  </strong>
                  <span style={{ color: 'var(--theme-elevation-600)', fontSize: '.875rem' }}>
                    {checkCoverage.openIssueCount} open · {checkCoverage.resolvedIssueCount}{' '}
                    resolved · {checkCoverage.staleIssueCount} stale
                  </span>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: '.65rem' }}>
                <button
                  className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
                  disabled={!articleArtifact || isPending || !hasUnsavedArticleChanges}
                  onClick={handleSaveRevision}
                  type="button"
                >
                  {isPending && hasUnsavedArticleChanges ? 'Saving revision…' : 'Save revision'}
                </button>

                <button
                  className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-secondary btn--withoutPopup writer-run-continue-field__button"
                  disabled={!canRunCheckFromArticle || isPending}
                  onClick={() => {
                    if (hasUnsavedArticleChanges) {
                      setError('Save the article revision before rerunning the local check.')
                      return
                    }

                    handleRunManualStage('check')
                  }}
                  type="button"
                >
                  {isPending && !hasUnsavedArticleChanges
                    ? 'Running local check…'
                    : checkArtifact
                      ? 'Rerun full local check'
                      : 'Run local check'}
                </button>
              </div>
            </section>

            {canRunWriteFromSidebar && !checkArtifact ? (
              <section
                style={{
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: '.75rem',
                  display: 'grid',
                  gap: '.75rem',
                  padding: '1rem 1.25rem',
                }}
              >
                <div style={{ display: 'grid', gap: '.2rem' }}>
                  <strong>Writing</strong>
                  <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
                    {isFailedWriteRun
                      ? 'The write stage failed before saving a valid article.md artifact.'
                      : articleArtifact
                        ? 'Run the write stage again from the saved brief to replace the current article draft.'
                        : 'Generate the article draft from the saved brief.'}
                  </span>
                </div>
                <button
                  className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
                  disabled={isPending}
                  onClick={() => handleRunManualStage('write')}
                  type="button"
                >
                  {isPending
                    ? isFailedWriteRun
                      ? 'Retrying write…'
                      : 'Rewriting article…'
                    : isFailedWriteRun
                      ? 'Retry write'
                      : articleArtifact
                        ? 'Rewrite article'
                        : 'Generate article'}
                </button>
              </section>
            ) : null}

            <WriterArticleConversionWidget
              disabled={!articleArtifact}
              onComplete={setDetail}
              runID={runID}
            />

            <section
              style={{
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: '.75rem',
                display: 'grid',
                gap: '1rem',
                padding: '1rem 1.25rem',
              }}
            >
              <div style={{ display: 'grid', gap: '.2rem' }}>
                <strong>Check results</strong>
                <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
                  {checkArtifact ? checkArtifact.filename : 'Pending'}
                </span>
              </div>

              {checkContent ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div
                    style={{
                      background: 'var(--theme-elevation-50)',
                      border: '1px solid var(--theme-elevation-150)',
                      borderRadius: '.5rem',
                      display: 'grid',
                      gap: '.35rem',
                      padding: '.85rem 1rem',
                    }}
                  >
                    <strong>Coverage</strong>
                    <span>
                      {checkContent.coverage.currentVerifiedRuleCount}/
                      {checkContent.coverage.enabledRuleCount} rules verified for the current
                      revision.
                    </span>
                    <span style={{ color: 'var(--theme-elevation-600)', fontSize: '.85rem' }}>
                      {checkContent.coverage.openIssueCount} open ·{' '}
                      {checkContent.coverage.resolvedIssueCount} resolved ·{' '}
                      {checkContent.coverage.staleIssueCount} stale
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: '.75rem',
                    }}
                  >
                    {[
                      {
                        empty: 'No qualifying internal links found in the current article.',
                        links: checkInternalLinks,
                        title: 'Internal links',
                      },
                      {
                        empty: 'No qualifying authority links found in the current article.',
                        links: checkAuthorityLinks,
                        title: 'Authority links',
                      },
                    ].map((linkGroup) => (
                      <div
                        key={linkGroup.title}
                        style={{
                          background: 'var(--theme-elevation-50)',
                          border: '1px solid var(--theme-elevation-150)',
                          borderRadius: '.5rem',
                          display: 'grid',
                          gap: '.55rem',
                          padding: '.85rem 1rem',
                        }}
                      >
                        <div
                          style={{
                            alignItems: 'baseline',
                            display: 'flex',
                            gap: '.5rem',
                            justifyContent: 'space-between',
                          }}
                        >
                          <strong>{linkGroup.title}</strong>
                          <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.8rem' }}>
                            {linkGroup.links.length}
                          </span>
                        </div>

                        {linkGroup.links.length ? (
                          <ul
                            style={{
                              display: 'grid',
                              gap: '.5rem',
                              listStyle: 'none',
                              margin: 0,
                              padding: 0,
                            }}
                          >
                            {linkGroup.links.map((link) => (
                              <li
                                key={link.url}
                                style={{ display: 'grid', gap: '.15rem', minWidth: 0 }}
                              >
                                <a
                                  href={link.url}
                                  rel="noreferrer"
                                  style={{
                                    color: 'var(--theme-text)',
                                    fontWeight: 600,
                                    overflowWrap: 'anywhere',
                                    textDecoration: 'underline',
                                    textDecorationColor: 'var(--theme-elevation-300)',
                                  }}
                                  target="_blank"
                                >
                                  {link.anchorText || link.url}
                                </a>
                                <span
                                  style={{
                                    color: 'var(--theme-elevation-500)',
                                    fontSize: '.78rem',
                                    overflowWrap: 'anywhere',
                                  }}
                                >
                                  {link.hostname || link.url}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.85rem' }}>
                            {linkGroup.empty}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {openCheckIssues.length || staleCheckIssues.length ? (
                    <div style={{ display: 'grid', gap: '.75rem' }}>
                      {checkIssues.map((issue, index) => {
                        const noteItems = splitIssueNotes(issue.notes).filter(
                          shouldShowIssueNoteItem,
                        )
                        const isIssueRerunning = activeCheckIssueKey === issue.checkKey
                        const isGeneratingMissingSections =
                          activeMissingSectionIssueKey === issue.checkKey
                        const issueStatusMessage =
                          statusMessageIssueKey === issue.checkKey ? statusMessage : ''
                        const missingSectionItems = getMissingSectionBudgetItems(issue.notes)
                        const missingGapItems = getMissingGapItems(issue.notes)
                        const missingDifferentiatorItems = getMissingDifferentiatorItems(issue.notes)
                        const canGenerateTargetedFix =
                          (issue.checkKey === 'section_budgets' && missingSectionItems.length > 0) ||
                          (issue.checkKey === 'gaps_addressed' && missingGapItems.length > 0) ||
                          (issue.checkKey === 'differentiators_included' &&
                            missingDifferentiatorItems.length > 0)

                        return (
                          <div
                            key={issue.id || `${issue.checkKey}-${index}`}
                            style={{
                              background: 'var(--theme-elevation-50)',
                              border: '1px solid var(--theme-elevation-150)',
                              borderRadius: '.5rem',
                              display: 'grid',
                              gap: '.65rem',
                              padding: '.75rem',
                            }}
                          >
                            <div
                              style={{
                                alignItems: 'center',
                                display: 'flex',
                                gap: '.5rem',
                                justifyContent: 'space-between',
                              }}
                            >
                              <strong>{issue.label || `Issue ${index + 1}`}</strong>
                              <div
                                style={{
                                  alignItems: 'center',
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '.45rem',
                                  justifyContent: 'flex-end',
                                }}
                              >
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
                                      background:
                                        issue.severity === 'error'
                                          ? 'var(--theme-error-100)'
                                          : 'var(--theme-warning-100)',
                                      borderRadius: '999px',
                                      color:
                                        issue.severity === 'error'
                                          ? 'var(--theme-error-700)'
                                          : 'var(--theme-warning-700)',
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
                            <span
                              style={{ color: 'var(--theme-elevation-600)', fontSize: '.8rem' }}
                            >
                              {issue.verificationMode
                                ? `Last verified by ${issue.verificationMode} rerun${issue.verifiedAt ? ` at ${new Date(issue.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}.`
                                : issue.status === 'stale'
                                  ? 'This rule has not been verified for the current revision yet.'
                                  : 'Rule state available.'}
                            </span>
                            {noteItems.length ? (
                              <ul
                                style={{
                                  display: 'grid',
                                  gap: '.45rem',
                                  listStyle: 'none',
                                  margin: 0,
                                  padding: 0,
                                }}
                              >
                                {noteItems.map((noteItem) => {
                                  const budgetItem = parseBudgetNoteItem(noteItem)

                                  return (
                                    <li
                                      key={noteItem}
                                      style={{
                                        background: 'var(--theme-elevation-0)',
                                        border: '1px solid var(--theme-elevation-100)',
                                        borderRadius: '.45rem',
                                        display: 'grid',
                                        gap: '.2rem',
                                        padding: '.55rem .65rem',
                                      }}
                                    >
                                      {budgetItem ? (
                                        <>
                                          <span style={{ fontWeight: 600, lineHeight: 1.35 }}>
                                            {budgetItem.title}
                                          </span>
                                          <span
                                            style={{
                                              color: 'var(--theme-elevation-600)',
                                              fontSize: '.82rem',
                                            }}
                                          >
                                            {budgetItem.actualWords}/{budgetItem.targetWords} words
                                            · {budgetItem.delta}
                                          </span>
                                        </>
                                      ) : (
                                        <span style={{ lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                                          {noteItem}
                                        </span>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : (
                              <span>No additional notes were returned for this check.</span>
                            )}
                            {issue.status !== 'resolved' ? (
                              <div
                                style={{
                                  alignItems: 'center',
                                  display: 'flex',
                                  flexWrap: 'nowrap',
                                  gap: '.5rem',
                                }}
                              >
                                <button
                                  className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-secondary btn--withoutPopup"
                                  disabled={
                                    isPending ||
                                    Boolean(activeCheckIssueKey) ||
                                    Boolean(activeMissingSectionIssueKey)
                                  }
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleRerunCheckIssue(issue.checkKey)
                                  }}
                                  type="button"
                                >
                                  {isIssueRerunning ? 'Rechecking…' : 'Recheck this issue'}
                                </button>
                                {canGenerateTargetedFix ? (
                                  <button
                                    className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-secondary btn--withoutPopup"
                                    disabled={
                                      isPending ||
                                      Boolean(activeCheckIssueKey) ||
                                      Boolean(activeMissingSectionIssueKey)
                                    }
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      handleGenerateCheckIssueFix(issue.checkKey)
                                    }}
                                    type="button"
                                  >
                                    {isGeneratingMissingSections
                                      ? 'Generating…'
                                      : issue.checkKey === 'differentiators_included' ||
                                          issue.checkKey === 'gaps_addressed'
                                        ? 'Generate missing content'
                                        : 'Generate missing sections'}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {issueStatusMessage ? (
                              <span
                                style={{ color: 'var(--theme-warning-700)', fontSize: '.85rem' }}
                              >
                                {issueStatusMessage}
                              </span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : checkContent.pass ? (
                    <div
                      style={{
                        background: 'var(--theme-success-50)',
                        border: '1px solid var(--theme-success-150)',
                        borderRadius: '.5rem',
                        display: 'grid',
                        gap: '.35rem',
                        padding: '.85rem 1rem',
                      }}
                    >
                      <strong style={{ color: 'var(--theme-success-700)' }}>Passed check</strong>
                      <span>
                        {checkContent.summary ||
                          'The latest check passed and did not return any issues.'}
                      </span>
                    </div>
                  ) : checkContent.summary ? (
                    <div
                      style={{
                        background: 'var(--theme-elevation-50)',
                        border: '1px solid var(--theme-elevation-150)',
                        borderRadius: '.5rem',
                        display: 'grid',
                        gap: '.35rem',
                        padding: '.85rem 1rem',
                      }}
                    >
                      <strong>Check summary</strong>
                      <span>{checkContent.summary}</span>
                    </div>
                  ) : (
                    <p className="ai-writer-workspace__empty" style={{ margin: 0 }}>
                      Check output was returned, but it did not include any structured issues or
                      summary text.
                    </p>
                  )}
                </div>
              ) : (
                <p className="ai-writer-workspace__empty" style={{ margin: 0 }}>
                  Check output is not available yet.
                </p>
              )}
            </section>
          </aside>
        </div>
      ) : competitorSources.length ? (
        <>
          <div
            className="writer-run-flow-field__top-fields"
            style={{
              display: 'grid',
              gap: '.35rem',
              marginBottom: '.5rem',
            }}
          >
            <div className="field-type text">
              <label className="field-label">
                <span>
                  Target Keyword <span style={{ color: 'var(--theme-error-500)' }}>*</span>
                </span>
              </label>
              <input className="field-input" readOnly value={detail.run.targetKeyword || ''} />
            </div>

            <div className="field-type text">
              <label className="field-label">
                <span>
                  Source Url <span style={{ color: 'var(--theme-error-500)' }}>*</span>
                </span>
              </label>
              <input className="field-input" readOnly value={detail.run.sourceUrl || ''} />
            </div>
          </div>

          <style>{`
            .writer-run-flow-field__top-fields .field-type {
              margin-bottom: 0;
            }

            .writer-run-flow-field__top-fields .field-label {
              margin-bottom: .1rem;
            }
          `}</style>

          <label className="field-label" style={{ marginBottom: '0' }}>
            <span>
              Competitor Results <span style={{ color: 'var(--theme-error-500)' }}>*</span>
            </span>
          </label>

          <div
            className="writer-run-flow-field__source-list"
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            }}
          >
            {competitorSources.map((source) => {
              const checked = selectedSourceIDs.includes(source.id)

              return (
                <label className="writer-run-flow-field__source-card" key={source.id}>
                  <input
                    checked={checked}
                    disabled={isPending || !isAwaitingSelection}
                    onChange={() => toggleCompetitor(source.id)}
                    type="checkbox"
                  />
                  <div className="writer-run-flow-field__source-copy">
                    <strong>{source.title || source.url}</strong>
                    <span>{source.url}</span>
                    {source.snippet ? <span>{source.snippet}</span> : null}
                    <span>
                      Position {source.serpPosition ?? 'n/a'} ·{' '}
                      {checked ? 'selected' : 'not selected'}
                    </span>
                  </div>
                </label>
              )
            })}
          </div>

          {isAwaitingSelection ? (
            <div
              className="ai-writer-workspace__actions"
              style={{ alignItems: 'flex-start', flexDirection: 'column' }}
            >
              {selectionError ? (
                <p
                  className="field-error"
                  style={{ color: 'var(--theme-error-500)', marginBottom: '.5rem' }}
                >
                  {selectionError}
                </p>
              ) : null}
              <button
                className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
                disabled={isPending}
                onClick={handleContinueSources}
                type="button"
              >
                {isPending ? 'Continuing…' : 'Continue with selected sources'}
              </button>
            </div>
          ) : null}

          <style>{`
            @keyframes writer-run-flow-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {detail?.run.status === 'failed' ? (
            <div
              className="field-error"
              style={{
                border: '1px solid var(--theme-error-500)',
                borderRadius: '.75rem',
                color: 'var(--theme-error-500)',
                padding: '1rem 1.25rem',
              }}
            >
              <strong style={{ display: 'block', marginBottom: '.35rem' }}>
                Processing failed at{' '}
                {detail.run.currentStage?.replaceAll('_', ' ') || 'an unknown stage'}.
              </strong>
              <span>
                {detail.run.errorMessage ||
                  'An unknown error occurred while processing the selected sources.'}
              </span>
              {isRetryableFailure || retryableManualFailureStage ? (
                <div style={{ marginTop: '.85rem' }}>
                  <button
                    className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
                    disabled={isPending}
                    onClick={() => {
                      if (retryableManualFailureStage) {
                        handleRunManualStage(retryableManualFailureStage)
                        return
                      }

                      handleRetryRun()
                    }}
                    type="button"
                  >
                    {isPending
                      ? retryableManualFailureStage
                        ? `Retrying ${retryableManualFailureStage.replaceAll('_', ' ')}…`
                        : 'Retrying…'
                      : retryableManualFailureStage
                        ? retryableManualFailureStage === 'write'
                          ? 'Retry write'
                          : `Retry ${retryableManualFailureStage.replaceAll('_', ' ')}`
                        : 'Retry this stage'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <section
            style={{
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: '.95rem',
              display: 'grid',
              gap: '1rem',
              justifySelf: 'center',
              maxWidth: '768px',
              padding: '1rem 1.25rem 1.25rem',
              width: '100%',
            }}
          >
            <div style={{ display: 'grid', gap: '.2rem' }}>
              <strong>AI Writer Conversation</strong>
              <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
                Prompts, model responses, tool activity, and saved outputs all appear in one
                conversation.
              </span>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div
                style={{
                  display: 'grid',
                  justifyItems: 'end',
                }}
              >
                <div
                  style={{
                    background:
                      'color-mix(in srgb, var(--theme-elevation-0) 82%, var(--theme-success-150) 18%)',
                    border:
                      '1px solid color-mix(in srgb, var(--theme-elevation-150) 70%, var(--theme-success-250) 30%)',
                    borderRadius: '1.2rem 1.2rem .35rem 1.2rem',
                    display: 'grid',
                    gap: '.55rem',
                    maxWidth: 'min(100%, 76ch)',
                    padding: '1rem',
                    width: 'fit-content',
                  }}
                >
                  <div
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      gap: '.5rem',
                      justifyContent: 'space-between',
                    }}
                  >
                    <strong>You</strong>
                    <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.8125rem' }}>
                      Run request
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: '.3rem' }}>
                    <span>
                      <strong>Target keyword:</strong> {detail.run.targetKeyword}
                    </span>
                    <span style={{ overflowWrap: 'anywhere' }}>
                      <strong>Source URL:</strong> {detail.run.sourceUrl}
                    </span>
                    <span>
                      <strong>Competitors:</strong>{' '}
                      {selectedCompetitorTitles.length
                        ? `${selectedCompetitorTitles.length} selected`
                        : isAwaitingSelection
                          ? 'Waiting for selection'
                          : 'No competitors selected yet'}
                    </span>
                    {selectedCompetitorTitles.length ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '.35rem',
                          marginTop: '.15rem',
                        }}
                      >
                        {selectedCompetitorTitles.slice(0, 6).map((title) => (
                          <span
                            key={title}
                            style={{
                              background: 'var(--theme-elevation-25)',
                              border: '1px solid var(--theme-elevation-150)',
                              borderRadius: '999px',
                              fontSize: '.8rem',
                              padding: '.2rem .55rem',
                            }}
                          >
                            {title}
                          </span>
                        ))}
                        {selectedCompetitorTitles.length > 6 ? (
                          <span
                            style={{
                              color: 'var(--theme-elevation-500)',
                              fontSize: '.8rem',
                              padding: '.2rem 0',
                            }}
                          >
                            +{selectedCompetitorTitles.length - 6} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {currentRunNarrative ? (
                <div style={assistantConversationLaneStyle}>
                  <div
                    style={{
                      background: 'var(--theme-elevation-25)',
                      border: '1px solid var(--theme-elevation-150)',
                      borderRadius: '1.2rem 1.2rem 1.2rem .35rem',
                      display: 'grid',
                      gap: '.65rem',
                      maxWidth: '100%',
                      padding: '1rem',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: '.5rem',
                        justifyContent: 'space-between',
                      }}
                    >
                      <strong>AI Writer</strong>
                      <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.8125rem' }}>
                        Status
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '.3rem' }}>
                      <strong>{currentRunNarrative.title}</strong>
                      <span>{currentRunNarrative.body}</span>
                    </div>
                    {detail.run.status === 'processing' ? (
                      <div style={{ alignItems: 'center', display: 'flex', gap: '.65rem' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            animation: 'writer-run-flow-spin 0.9s linear infinite',
                            border: '2px solid var(--theme-elevation-250)',
                            borderRadius: '999px',
                            borderTopColor: 'var(--theme-success-500)',
                            display: 'inline-block',
                            flexShrink: 0,
                            height: '1rem',
                            width: '1rem',
                          }}
                        />
                        <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.9rem' }}>
                          {detail.run.currentStage
                            ? `Current stage: ${formatTraceEventLabel(detail.run.currentStage)}`
                            : 'Working'}
                        </span>
                      </div>
                    ) : null}
                    {currentRunNarrative.actionLabel && activeManualStage ? (
                      <div>
                        <button
                          className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
                          disabled={isPending}
                          onClick={() => handleRunManualStage(activeManualStage)}
                          type="button"
                        >
                          {isPending
                            ? `${currentRunNarrative.actionLabel}…`
                            : currentRunNarrative.actionLabel}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {contentRunConversation.length
                ? contentRunConversation.map((entry) => {
                    if (entry.kind === 'trace') {
                      const traceGroup = entry.traceGroup
                      const promptTrace = traceGroup.promptTrace ?? traceGroup.primaryTrace
                      const responseTrace = traceGroup.responseTrace
                      const contentBlocks = traceGroup.anthropicTraces.flatMap((trace) =>
                        extractAnthropicContentBlocks(trace),
                      )
                      const remoteFiles = getTraceGroupRemoteFiles(detail, traceGroup)
                      const promptText = promptTrace ? getTracePromptText(promptTrace) : ''
                      const inputFiles = promptTrace ? getTraceInputFiles(promptTrace) : []
                      const systemText = promptTrace ? getTraceSystemText(promptTrace) : ''
                      const responseTextBlocks = getTraceGroupResponseTextBlocks(traceGroup)
                      const toolSummaries = getDisplayableAnthropicToolSummaries(contentBlocks)
                      const filename = pickString(getTraceRequestPayload(promptTrace)?.filename)
                      const sourceLabel = formatTraceSourceLabel(traceGroup)
                      const sourceTitle =
                        traceGroup.source?.title?.trim() || traceGroup.source?.url || ''
                      const sourceUrl = traceGroup.source?.url || ''
                      const transcriptGroupNotes = getTranscriptGroupNotes(traceGroup)
                      const traceDisplayTimestamp = formatTraceTimestamp(traceGroup.displayAt)
                      const traceDisplayLabel =
                        traceGroup.status === 'running' && traceDisplayTimestamp
                          ? `Updated ${traceDisplayTimestamp}`
                          : traceDisplayTimestamp
                      const errorMessages = [
                        ...new Set(
                          traceGroup.traces
                            .map((trace) => trace.errorText?.trim())
                            .filter((value): value is string => Boolean(value)),
                        ),
                      ]

                      return (
                        <article
                          key={traceGroup.id}
                          style={{
                            display: 'grid',
                            gap: '.75rem',
                          }}
                        >
                          <div
                            style={{
                              alignItems: 'center',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '.5rem .75rem',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div
                              style={{
                                alignItems: 'center',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '.45rem',
                              }}
                            >
                              <span
                                style={{
                                  background: 'var(--theme-elevation-50)',
                                  border: '1px solid var(--theme-elevation-150)',
                                  borderRadius: '999px',
                                  fontSize: '.75rem',
                                  fontWeight: 700,
                                  padding: '.2rem .55rem',
                                }}
                              >
                                {formatTraceEventLabel(traceGroup.baseEventType)}
                              </span>
                              <span
                                style={{
                                  color: 'var(--theme-elevation-500)',
                                  fontSize: '.8125rem',
                                }}
                              >
                                {traceGroup.stageKey
                                  ? formatTraceEventLabel(traceGroup.stageKey)
                                  : 'runtime'}{' '}
                                · {traceGroup.status}
                              </span>
                            </div>
                            {traceDisplayLabel ? (
                              <span
                                style={{
                                  color: 'var(--theme-elevation-500)',
                                  fontSize: '.8125rem',
                                }}
                              >
                                {traceDisplayLabel}
                              </span>
                            ) : null}
                          </div>

                          {promptText || systemText ? (
                            <div
                              style={{
                                display: 'grid',
                                justifyItems: 'end',
                              }}
                            >
                              <div
                                style={{
                                  background:
                                    'color-mix(in srgb, var(--theme-elevation-0) 84%, var(--theme-success-150) 16%)',
                                  border:
                                    '1px solid color-mix(in srgb, var(--theme-elevation-150) 70%, var(--theme-success-250) 30%)',
                                  borderRadius: '1.2rem 1.2rem .35rem 1.2rem',
                                  display: 'grid',
                                  gap: '.75rem',
                                  maxWidth: 'min(100%, 76ch)',
                                  padding: '1rem 1rem .95rem',
                                  width: 'fit-content',
                                }}
                              >
                                <div
                                  style={{
                                    alignItems: 'center',
                                    display: 'flex',
                                    gap: '.5rem',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <strong>AI Writer</strong>
                                  <span
                                    style={{
                                      color: 'var(--theme-elevation-500)',
                                      display: 'inline-flex',
                                      flexWrap: 'wrap',
                                      fontSize: '.8125rem',
                                      gap: '.35rem',
                                      justifyContent: 'flex-end',
                                      textAlign: 'right',
                                    }}
                                  >
                                    <span>{filename ? `Prompt for ${filename}` : 'Prompt'}</span>
                                  </span>
                                </div>

                                {sourceLabel || sourceTitle || transcriptGroupNotes.length ? (
                                  <div
                                    style={{
                                      borderBottom:
                                        promptText || systemText
                                          ? '1px solid var(--theme-elevation-150)'
                                          : 'none',
                                      display: 'grid',
                                      gap: '.45rem',
                                      paddingBottom: promptText || systemText ? '.75rem' : 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        alignItems: 'center',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '.4rem',
                                      }}
                                    >
                                      {sourceLabel ? (
                                        <span
                                          style={{
                                            background: 'var(--theme-elevation-25)',
                                            border: '1px solid var(--theme-elevation-150)',
                                            borderRadius: '999px',
                                            fontSize: '.76rem',
                                            fontWeight: 700,
                                            padding: '.2rem .55rem',
                                          }}
                                        >
                                          {sourceLabel}
                                        </span>
                                      ) : null}
                                      {transcriptGroupNotes.map((note) => (
                                        <span
                                          key={`${traceGroup.id}-${note}`}
                                          style={{
                                            background:
                                              'color-mix(in srgb, var(--theme-warning-50) 70%, var(--theme-elevation-0) 30%)',
                                            border: '1px solid var(--theme-warning-150)',
                                            borderRadius: '999px',
                                            color: 'var(--theme-warning-700)',
                                            fontSize: '.76rem',
                                            fontWeight: 700,
                                            padding: '.2rem .55rem',
                                          }}
                                        >
                                          {note}
                                        </span>
                                      ))}
                                    </div>
                                    {sourceTitle ? (
                                      <div style={{ display: 'grid', gap: '.18rem' }}>
                                        <strong style={{ fontSize: '.92rem', fontWeight: 600 }}>
                                          {sourceTitle}
                                        </strong>
                                        {sourceUrl && sourceUrl !== sourceTitle ? (
                                          <span
                                            style={{
                                              color: 'var(--theme-elevation-500)',
                                              fontSize: '.8125rem',
                                              overflowWrap: 'anywhere',
                                            }}
                                          >
                                            {sourceUrl}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {inputFiles.length ? (
                                  <div
                                    style={{
                                      borderBottom:
                                        promptText || systemText
                                          ? '1px solid var(--theme-elevation-150)'
                                          : 'none',
                                      display: 'grid',
                                      gap: '.45rem',
                                      paddingBottom: promptText || systemText ? '.75rem' : 0,
                                    }}
                                  >
                                    <span
                                      style={{
                                        color: 'var(--theme-elevation-500)',
                                        fontSize: '.75rem',
                                        fontWeight: 700,
                                        letterSpacing: '.02em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Uploaded files
                                    </span>
                                    <div
                                      style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}
                                    >
                                      {inputFiles.map((inputFile) => (
                                        <span
                                          key={`${traceGroup.id}-${inputFile.fileId || inputFile.filename}`}
                                          style={{
                                            background: 'var(--theme-elevation-0)',
                                            border: '1px solid var(--theme-elevation-150)',
                                            borderRadius: '999px',
                                            color: 'var(--theme-elevation-700)',
                                            fontSize: '.8rem',
                                            padding: '.25rem .6rem',
                                          }}
                                        >
                                          {inputFile.filename}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {systemText ? (
                                  <div
                                    style={{
                                      borderBottom: promptText
                                        ? '1px solid var(--theme-elevation-150)'
                                        : 'none',
                                      display: 'grid',
                                      gap: '.35rem',
                                      paddingBottom: promptText ? '.75rem' : 0,
                                    }}
                                  >
                                    <span
                                      style={{
                                        color: 'var(--theme-elevation-500)',
                                        fontSize: '.75rem',
                                        fontWeight: 700,
                                        letterSpacing: '.02em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      System instructions
                                    </span>
                                    <pre
                                      style={{
                                        fontFamily: 'inherit',
                                        fontSize: '.93rem',
                                        lineHeight: 1.55,
                                        margin: 0,
                                        maxHeight: '12rem',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {systemText}
                                    </pre>
                                  </div>
                                ) : null}

                                {promptText ? (
                                  <div style={{ display: 'grid', gap: '.35rem' }}>
                                    <span
                                      style={{
                                        color: 'var(--theme-elevation-500)',
                                        fontSize: '.75rem',
                                        fontWeight: 700,
                                        letterSpacing: '.02em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Prompt
                                    </span>
                                    <pre
                                      style={{
                                        fontFamily: 'inherit',
                                        fontSize: '.95rem',
                                        lineHeight: 1.58,
                                        margin: 0,
                                        maxHeight: '24rem',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {promptText}
                                    </pre>
                                  </div>
                                ) : null}

                                {promptTrace && traceUsesPromptPreview(promptTrace) ? (
                                  <span
                                    style={{
                                      color: 'var(--theme-elevation-500)',
                                      fontSize: '.8125rem',
                                    }}
                                  >
                                    Older run: showing the saved prompt preview, not the full
                                    request.
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {responseTextBlocks.length ? (
                            <div style={assistantConversationLaneStyle}>
                              <div
                                style={{
                                  background: 'var(--theme-elevation-25)',
                                  border: '1px solid var(--theme-elevation-150)',
                                  borderRadius: '1.2rem 1.2rem 1.2rem .35rem',
                                  display: 'grid',
                                  gap: '.75rem',
                                  maxWidth: '100%',
                                  padding: '1rem',
                                  width: '100%',
                                }}
                              >
                                <div
                                  style={{
                                    alignItems: 'center',
                                    display: 'flex',
                                    gap: '.5rem',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <strong>{getWriterTranscriptGroupProviderLabel(traceGroup)}</strong>
                                  <span
                                    style={{
                                      color: 'var(--theme-elevation-500)',
                                      display: 'inline-flex',
                                      flexWrap: 'wrap',
                                      fontSize: '.8125rem',
                                      gap: '.35rem',
                                      justifyContent: 'flex-end',
                                      textAlign: 'right',
                                    }}
                                  >
                                    <span>
                                      {traceGroup.status === 'running'
                                        ? 'Response in progress'
                                        : 'Response'}
                                    </span>
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gap: '.75rem' }}>
                                  {responseTextBlocks.map((textBlock, index) => (
                                    <div
                                      key={`${traceGroup.id}-response-${index}`}
                                      style={{
                                        borderTop:
                                          index > 0
                                            ? '1px solid var(--theme-elevation-100)'
                                            : 'none',
                                        paddingTop: index > 0 ? '.75rem' : 0,
                                      }}
                                    >
                                      <pre
                                        style={{
                                          background: looksLikeStructuredTranscript(textBlock)
                                            ? 'var(--theme-elevation-0)'
                                            : 'transparent',
                                          border: looksLikeStructuredTranscript(textBlock)
                                            ? '1px solid var(--theme-elevation-100)'
                                            : 'none',
                                          borderRadius: looksLikeStructuredTranscript(textBlock)
                                            ? '.85rem'
                                            : 0,
                                          fontFamily: 'inherit',
                                          fontSize: '.95rem',
                                          lineHeight: 1.62,
                                          margin: 0,
                                          maxHeight: looksLikeStructuredTranscript(textBlock)
                                            ? '28rem'
                                            : '20rem',
                                          overflow: 'auto',
                                          padding: looksLikeStructuredTranscript(textBlock)
                                            ? '.85rem .95rem'
                                            : 0,
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        {textBlock}
                                      </pre>
                                    </div>
                                  ))}
                                </div>

                                {responseTrace && traceUsesResponsePreview(responseTrace) ? (
                                  <span
                                    style={{
                                      color: 'var(--theme-elevation-500)',
                                      fontSize: '.8125rem',
                                    }}
                                  >
                                    Older run: showing the saved response preview, not the full
                                    model text.
                                  </span>
                                ) : null}
                                {traceGroup.status === 'running' ? (
                                  <div
                                    style={{
                                      alignItems: 'center',
                                      color: 'var(--theme-elevation-500)',
                                      display: 'flex',
                                      fontSize: '.8125rem',
                                      gap: '.55rem',
                                    }}
                                  >
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        animation: 'writer-run-flow-spin 0.9s linear infinite',
                                        border: '2px solid var(--theme-elevation-250)',
                                        borderRadius: '999px',
                                        borderTopColor: 'var(--theme-success-500)',
                                        display: 'inline-block',
                                        flexShrink: 0,
                                        height: '.85rem',
                                        width: '.85rem',
                                      }}
                                    />
                                    <span>{getWriterTranscriptGroupProviderLabel(traceGroup)} is still working on this step.</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {traceGroup.status === 'running' && !responseTextBlocks.length ? (
                            <div style={assistantConversationLaneStyle}>
                              <div
                                style={{
                                  alignItems: 'center',
                                  background: 'var(--theme-elevation-25)',
                                  border: '1px solid var(--theme-elevation-150)',
                                  borderRadius: '1.2rem 1.2rem 1.2rem .35rem',
                                  display: 'flex',
                                  gap: '.75rem',
                                  maxWidth: '100%',
                                  padding: '.9rem 1rem',
                                  width: '100%',
                                }}
                              >
                                <span
                                  aria-hidden="true"
                                  style={{
                                    animation: 'writer-run-flow-spin 0.9s linear infinite',
                                    border: '2px solid var(--theme-elevation-250)',
                                    borderRadius: '999px',
                                    borderTopColor: 'var(--theme-success-500)',
                                    display: 'inline-block',
                                    flexShrink: 0,
                                    height: '1rem',
                                    width: '1rem',
                                  }}
                                />
                                <span>{describeRunningAnthropicTrace(promptTrace)}</span>
                              </div>
                            </div>
                          ) : null}

                          {toolSummaries.length || remoteFiles.length || errorMessages.length ? (
                            <div
                              style={{
                                ...assistantConversationLaneStyle,
                                gap: '.65rem',
                              }}
                            >
                              <div
                                style={{
                                  display: 'grid',
                                  gap: '.65rem',
                                  maxWidth: '100%',
                                  width: '100%',
                                }}
                              >
                                {toolSummaries.length ? (
                                  <div
                                    style={{
                                      background: 'var(--theme-elevation-50)',
                                      border: '1px solid var(--theme-elevation-150)',
                                      borderRadius: '.85rem',
                                      display: 'grid',
                                      gap: '.65rem',
                                      padding: '.8rem .95rem',
                                    }}
                                  >
                                    <div
                                      style={{
                                        alignItems: 'center',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '.45rem',
                                        justifyContent: 'space-between',
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: 'var(--theme-elevation-500)',
                                          fontSize: '.75rem',
                                          fontWeight: 700,
                                          letterSpacing: '.02em',
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        Tool activity
                                      </span>
                                      <span
                                        style={{
                                          color: 'var(--theme-elevation-500)',
                                          fontSize: '.8125rem',
                                        }}
                                      >
                                        {toolSummaries.length === 1
                                          ? '1 result'
                                          : `${toolSummaries.length} results`}
                                      </span>
                                    </div>
                                    <div style={{ display: 'grid', gap: '.75rem' }}>
                                      {toolSummaries.map((toolSummary, index) => (
                                        <div
                                          key={`${traceGroup.id}-tool-${index}`}
                                          style={{
                                            borderTop:
                                              index > 0
                                                ? '1px solid var(--theme-elevation-150)'
                                                : 'none',
                                            display: 'grid',
                                            gap: '.45rem',
                                            paddingTop: index > 0 ? '.75rem' : 0,
                                          }}
                                        >
                                          <strong>{toolSummary.label}</strong>
                                          <pre
                                            style={{
                                              fontFamily: 'inherit',
                                              fontSize: '.9rem',
                                              lineHeight: 1.55,
                                              margin: 0,
                                              maxHeight: '24rem',
                                              overflow: 'auto',
                                              whiteSpace: 'pre-wrap',
                                              wordBreak: 'break-word',
                                            }}
                                          >
                                            {toolSummary.details.join('\n')}
                                          </pre>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {remoteFiles.length ? (
                                  <div
                                    style={{
                                      background: 'var(--theme-elevation-50)',
                                      border: '1px solid var(--theme-elevation-150)',
                                      borderRadius: '.85rem',
                                      display: 'grid',
                                      gap: '.55rem',
                                      padding: '.8rem .95rem',
                                    }}
                                  >
                                    <div
                                      style={{
                                        alignItems: 'center',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '.45rem',
                                        justifyContent: 'space-between',
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: 'var(--theme-elevation-500)',
                                          fontSize: '.75rem',
                                          fontWeight: 700,
                                          letterSpacing: '.02em',
                                          textTransform: 'uppercase',
                                        }}
                                      >
                                        Generated files
                                      </span>
                                    </div>
                                    <div
                                      style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}
                                    >
                                      {remoteFiles.map((remoteFile) => {
                                        const remoteFilename =
                                          remoteFile.metadata && isRecord(remoteFile.metadata)
                                            ? pickString(remoteFile.metadata.filename) ||
                                              remoteFile.fileId
                                            : remoteFile.fileId

                                        return (
                                          <a
                                            key={remoteFile.id}
                                            className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-secondary"
                                            href={remoteFile.downloadUrl}
                                            rel="noreferrer"
                                            target="_blank"
                                          >
                                            {remoteFilename}
                                          </a>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                {errorMessages.map((errorMessage) => (
                                  <div
                                    key={`${traceGroup.id}-${errorMessage}`}
                                    style={{
                                      background: 'var(--theme-error-50)',
                                      border: '1px solid var(--theme-error-150)',
                                      borderRadius: '.85rem',
                                      color: 'var(--theme-error-700)',
                                      padding: '.85rem .95rem',
                                    }}
                                  >
                                    {errorMessage}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      )
                    }

                    const message = entry.message
                    const messageDisplayTimestamp = formatTraceTimestamp(message.createdAt)
                    const toneStyles =
                      message.tone === 'success'
                        ? {
                            background: 'var(--theme-success-50)',
                            border: '1px solid var(--theme-success-150)',
                          }
                        : message.tone === 'warning'
                          ? {
                              background: 'var(--theme-warning-50)',
                              border: '1px solid var(--theme-warning-150)',
                            }
                          : {
                              background: 'var(--theme-elevation-25)',
                              border: '1px solid var(--theme-elevation-150)',
                            }

                    return (
                      <div key={`artifact-${message.id}`} style={assistantConversationLaneStyle}>
                        <div
                          style={{
                            ...toneStyles,
                            borderRadius: '1.2rem 1.2rem 1.2rem .35rem',
                            display: 'grid',
                            gap: '.7rem',
                            maxWidth: '100%',
                            padding: '1rem',
                            width: '100%',
                          }}
                        >
                          <div
                            style={{
                              alignItems: 'center',
                              display: 'flex',
                              gap: '.5rem',
                              justifyContent: 'space-between',
                            }}
                          >
                            <strong>AI Writer</strong>
                            <span
                              style={{
                                color: 'var(--theme-elevation-500)',
                                display: 'inline-flex',
                                flexWrap: 'wrap',
                                fontSize: '.8125rem',
                                gap: '.35rem',
                                justifyContent: 'flex-end',
                                textAlign: 'right',
                              }}
                            >
                              <span>Saved output</span>
                              {messageDisplayTimestamp ? (
                                <span>· {messageDisplayTimestamp}</span>
                              ) : null}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gap: '.3rem' }}>
                            <strong>{message.title}</strong>
                            <span>{message.body}</span>
                            {message.meta?.length ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '.4rem',
                                  marginTop: '.15rem',
                                }}
                              >
                                {message.meta.map((item) => (
                                  <span
                                    key={item}
                                    style={{
                                      background: 'var(--theme-elevation-50)',
                                      border: '1px solid var(--theme-elevation-150)',
                                      borderRadius: '999px',
                                      fontSize: '.78rem',
                                      padding: '.2rem .55rem',
                                    }}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: 'grid', gap: '.55rem' }}>
                            {message.artifacts.map((artifact) => (
                              <div
                                key={artifact.id}
                                style={{
                                  alignItems: 'center',
                                  background: 'var(--theme-elevation-0)',
                                  border: '1px solid var(--theme-elevation-100)',
                                  borderRadius: '.8rem',
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '.75rem',
                                  justifyContent: 'space-between',
                                  padding: '.8rem .9rem',
                                }}
                              >
                                <div style={{ display: 'grid', gap: '.15rem', minWidth: 0 }}>
                                  <strong style={{ overflowWrap: 'anywhere' }}>
                                    {artifact.filename}
                                  </strong>
                                  <span
                                    style={{
                                      color: 'var(--theme-elevation-500)',
                                      fontSize: '.8125rem',
                                    }}
                                  >
                                    {artifact.artifactType} ·{' '}
                                    {formatArtifactBytes(artifact.content)}
                                  </span>
                                </div>
                                <button
                                  className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-secondary"
                                  onClick={() => handleDownloadArtifact(artifact)}
                                  type="button"
                                >
                                  {getArtifactDownloadLabel(artifact)}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })
                : null}
            </div>
          </section>
        </>
      ) : (
        <p className="ai-writer-workspace__empty">No competitor results are stored for this run.</p>
      )}
    </div>
  )
}
