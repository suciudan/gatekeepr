import type { SerializedEditorState } from 'lexical'

export const writerStageOrder = [
  'discover_serp',
  'source_selection',
  'convert_markdown',
  'extract_blocks',
  'compute_target_word_count',
  'build_factpack',
  'brief',
  'validate',
  'write',
  'check',
] as const

export const writerManualStageKeys = ['brief', 'validate', 'write', 'check'] as const
export const writerAutomatedStageKeys = [
  'discover_serp',
  'source_selection',
  'convert_markdown',
  'extract_blocks',
  'compute_target_word_count',
  'build_factpack',
] as const

export const writerRunStatuses = [
  'draft',
  'discovering',
  'awaiting_selection',
  'awaiting_user',
  'processing',
  'completed',
  'failed',
] as const

export const writerStageStatuses = ['queued', 'running', 'awaiting_user', 'completed', 'failed'] as const

export const writerJobKinds = [
  'brief.generate',
  'validate.run',
  'write.generate',
  'check.audit',
  'check.revise',
] as const

export const writerJobStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const

export const writerSourceRoles = ['original', 'competitor'] as const

export const writerSourceFetchStatuses = ['pending', 'fetching', 'completed', 'failed'] as const

export const writerArtifactRoles = ['model_input', 'model_output_raw', 'model_output_normalized', 'review', 'derived'] as const

export const writerArtifactTypes = [
  'serp',
  'serp_raw',
  'raw_html',
  'markdown',
  'blocks',
  'factpack_json',
  'factpack_md',
  'brief_json',
  'brief_raw_json',
  'finalized_brief_json',
  'review_log_json',
  'article_draft_md',
  'failing_list_md',
  'check_report_json',
  'article_revision_richtext_json',
  'article_revision_md',
  'debug_output',
] as const

export const writerTraceStatuses = ['completed', 'failed', 'running'] as const

export const writerTraceProviders = ['user', 'brightdata', 'fetch', 'anthropic', 'openai', 'local'] as const

export type WriterStageKey = (typeof writerStageOrder)[number]
export type WriterRunStatus = (typeof writerRunStatuses)[number]
export type WriterStageStatus = (typeof writerStageStatuses)[number]
export type WriterJobKind = (typeof writerJobKinds)[number]
export type WriterJobStatus = (typeof writerJobStatuses)[number]
export type WriterSourceRole = (typeof writerSourceRoles)[number]
export type WriterSourceFetchStatus = (typeof writerSourceFetchStatuses)[number]
export type WriterArtifactRole = (typeof writerArtifactRoles)[number]
export type WriterArtifactType = (typeof writerArtifactTypes)[number]
export type WriterTraceStatus = (typeof writerTraceStatuses)[number]
export type WriterTraceProvider = (typeof writerTraceProviders)[number]
export type WriterRelationshipID = number

export type WriterCheckResultStatus = 'fail' | 'pass' | 'warn'
export type WriterCheckLifecycleStatus = 'open' | 'resolved' | 'stale'
export type WriterCheckVerificationMode = 'full' | 'targeted'

export type WriterCheckIssue = {
  articleArtifactId: null | WriterRelationshipID
  articleArtifactType: null | WriterArtifactType
  checkKey: string
  id: string
  label: string
  notes: string
  resultStatus: null | WriterCheckResultStatus
  severity: 'error' | 'warning' | null
  status: WriterCheckLifecycleStatus
  verificationMode: null | WriterCheckVerificationMode
  verifiedAt: null | string
}

export type WriterCheckCoverage = {
  complete: boolean
  currentVerifiedRuleCount: number
  enabledRuleCount: number
  openIssueCount: number
  resolvedIssueCount: number
  staleIssueCount: number
}

export type WriterCheckLink = {
  anchorText: string
  hostname: string
  url: string
}

export type WriterCheckReport = {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  authorityLinks: WriterCheckLink[]
  checks: Array<{
    check: string
    notes: string
    status: WriterCheckResultStatus
  }>
  coverage: WriterCheckCoverage
  failCount: number
  issues: WriterCheckIssue[]
  lastRunCheckKey: null | string
  lastRunMode: WriterCheckVerificationMode
  internalLinks: WriterCheckLink[]
  pass: boolean
  summary: string
  warnCount: number
}

export type WriterArticleRevisionDocument = {
  body: SerializedEditorState
  metaDescription: string
  title: string
}

export type WriterSerpResult = {
  normalizedUrl: string
  position: number
  snippet: string
  title: string
  url: string
}

export type WriterRunInput = {
  sourceUrl: string
  targetKeyword: string
}

export type WriterRunSummary = {
  createdDraftID: null | WriterRelationshipID
  currentStage: null | WriterStageKey
  id: WriterRelationshipID
  selectedCompetitors: number
  sourceUrl: string
  status: WriterRunStatus
  targetKeyword: string
  totalCompetitors: number
  updatedAt: string
}

export type WriterRunRecord = {
  automationHeartbeatAt: null | string
  automationLeaseExpiresAt: null | string
  automationLeaseOwner: null | string
  automationLeaseToken: null | string
  createdAt: string
  createdDraftID: null | WriterRelationshipID
  currentStage: null | WriterStageKey
  errorMessage: null | string
  id: WriterRelationshipID
  normalizedSourceUrl: string
  originalWordCount: number
  sourceUrl: string
  status: WriterRunStatus
  targetKeyword: string
  targetWordCount: number
  updatedAt: string
  writeUserPrompt: string
}

export type WriterSourceRecord = {
  createdAt: string
  fetchError: null | string
  fetchStatus: WriterSourceFetchStatus
  id: WriterRelationshipID
  metaDescription: null | string
  normalizedUrl: string
  role: WriterSourceRole
  runID: WriterRelationshipID
  selected: boolean
  serpPosition: null | number
  snippet: null | string
  title: null | string
  updatedAt: string
  url: string
}

export type WriterStageExecutionRecord = {
  completedAt: null | string
  createdAt: string
  errorText: null | string
  id: WriterRelationshipID
  inputPayload: null | Record<string, unknown>
  outputPayload: null | Record<string, unknown>
  retryCount: number
  runID: WriterRelationshipID
  stageKey: WriterStageKey
  startedAt: null | string
  status: WriterStageStatus
  updatedAt: string
}

export type WriterJobRecord = {
  completedAt: null | string
  createdAt: string
  errorText: null | string
  id: WriterRelationshipID
  kind: WriterJobKind
  leaseExpiresAt: null | string
  leaseHeartbeatAt: null | string
  leaseOwner: null | string
  leaseToken: null | string
  requestPayload: null | Record<string, unknown>
  responsePayload: null | Record<string, unknown>
  runID: WriterRelationshipID
  sourceID: null | WriterRelationshipID
  stageKey: WriterStageKey
  startedAt: null | string
  status: WriterJobStatus
  updatedAt: string
}

export type WriterArtifactRecord = {
  artifactRole: WriterArtifactRole
  artifactType: WriterArtifactType
  content: string
  createdAt: string
  filename: string
  id: WriterRelationshipID
  mimeType: string
  producedByJobID: null | WriterRelationshipID
  runID: WriterRelationshipID
  schemaName: null | string
  schemaVersion: null | string
  sha256: null | string
  sourceID: null | WriterRelationshipID
  supersedesArtifactID: null | WriterRelationshipID
  updatedAt: string
}

export type WriterTraceEventRecord = {
  completedAt: null | string
  createdAt: string
  errorText: null | string
  eventType: string
  id: WriterRelationshipID
  provider: WriterTraceProvider
  requestPayload: null | Record<string, unknown>
  responsePayload: null | Record<string, unknown>
  runID: WriterRelationshipID
  sourceID: null | WriterRelationshipID
  stageKey: null | WriterStageKey
  startedAt: null | string
  status: WriterTraceStatus
  updatedAt: string
}

export type WriterRemoteFileRecord = {
  artifactHash: string
  artifactID: null | WriterRelationshipID
  createdAt: string
  deletedAt: null | string
  deleteAttemptedAt: null | string
  downloadUrl: string
  errorText: null | string
  fileId: string
  id: WriterRelationshipID
  lastUsedAt: null | string
  metadata: null | Record<string, unknown>
  provider: string
  runID: WriterRelationshipID
  sourceID: null | WriterRelationshipID
  status: string
  updatedAt: string
}

export type WriterRunDetail = {
  artifacts: WriterArtifactRecord[]
  jobs: WriterJobRecord[]
  remoteFiles: WriterRemoteFileRecord[]
  run: WriterRunRecord
  sources: WriterSourceRecord[]
  stages: WriterStageExecutionRecord[]
  traceEvents: WriterTraceEventRecord[]
}
