import type { PaginatedDocs, Payload, Where } from 'payload'

import { getCmsPayload } from '@/lib/payload'

import type {
  WriterArtifactRecord,
  WriterArtifactRole,
  WriterArtifactType,
  WriterJobKind,
  WriterJobRecord,
  WriterJobStatus,
  WriterRelationshipID,
  WriterRemoteFileRecord,
  WriterRunDetail,
  WriterRunInput,
  WriterRunRecord,
  WriterRunStatus,
  WriterRunSummary,
  WriterSerpResult,
  WriterSourceFetchStatus,
  WriterSourceRecord,
  WriterSourceRole,
  WriterStageExecutionRecord,
  WriterStageKey,
  WriterStageStatus,
  WriterTraceEventRecord,
  WriterTraceProvider,
  WriterTraceStatus,
} from './types'
import { writerAutomatedStageKeys } from './types'

type PayloadClient = Payload

export class InvalidWriterRunInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidWriterRunInputError'
  }
}

type RelationshipValue = null | WriterRelationshipID | { id?: null | WriterRelationshipID } | undefined

type WriterRunDoc = {
  automationHeartbeatAt?: null | string
  automationLeaseExpiresAt?: null | string
  automationLeaseOwner?: null | string
  automationLeaseToken?: null | string
  createdAt: string
  createdDraft?: RelationshipValue
  currentStage?: null | WriterStageKey
  errorMessage?: null | string
  id: WriterRelationshipID
  normalizedSourceUrl: string
  originalWordCount?: null | number
  sourceUrl: string
  status: WriterRunStatus
  targetKeyword: string
  targetWordCount?: null | number
  updatedAt: string
  writeUserPrompt?: null | string
}

type WriterSourceDoc = {
  createdAt: string
  fetchError?: null | string
  fetchStatus: WriterSourceFetchStatus
  id: WriterRelationshipID
  metaDescription?: null | string
  normalizedUrl: string
  role: WriterSourceRole
  run: RelationshipValue
  selected?: null | boolean
  serpPosition?: null | number
  snippet?: null | string
  title?: null | string
  updatedAt: string
  url: string
}

type WriterStageDoc = {
  completedAt?: null | string
  createdAt: string
  errorText?: null | string
  id: WriterRelationshipID
  inputPayload?: null | Record<string, unknown>
  outputPayload?: null | Record<string, unknown>
  retryCount?: null | number
  run: RelationshipValue
  stageKey: WriterStageKey
  startedAt?: null | string
  status: WriterStageStatus
  updatedAt: string
}

type WriterJobDoc = {
  completedAt?: null | string
  createdAt: string
  errorText?: null | string
  id: WriterRelationshipID
  kind: WriterJobKind
  leaseExpiresAt?: null | string
  leaseHeartbeatAt?: null | string
  leaseOwner?: null | string
  leaseToken?: null | string
  requestPayload?: null | Record<string, unknown>
  responsePayload?: null | Record<string, unknown>
  run: RelationshipValue
  source?: RelationshipValue
  stageKey: WriterStageKey
  startedAt?: null | string
  status: WriterJobStatus
  updatedAt: string
}

type WriterArtifactDoc = {
  artifactRole: WriterArtifactRole
  artifactType: WriterArtifactType
  content: string
  createdAt: string
  filename: string
  id: WriterRelationshipID
  mimeType: string
  producedByJob?: RelationshipValue
  run: RelationshipValue
  schemaName?: null | string
  schemaVersion?: null | string
  sha256?: null | string
  source?: RelationshipValue
  supersedesArtifact?: RelationshipValue
  updatedAt: string
}

type WriterTraceDoc = {
  completedAt?: null | string
  createdAt: string
  errorText?: null | string
  eventType: string
  id: WriterRelationshipID
  provider: WriterTraceProvider
  requestPayload?: null | Record<string, unknown>
  responsePayload?: null | Record<string, unknown>
  run: RelationshipValue
  source?: RelationshipValue
  stageKey?: null | WriterStageKey
  startedAt?: null | string
  status: WriterTraceStatus
  updatedAt: string
}

type WriterRemoteFileDoc = {
  artifact?: RelationshipValue
  artifactHash: string
  createdAt: string
  deletedAt?: null | string
  deleteAttemptedAt?: null | string
  errorText?: null | string
  fileId: string
  id: WriterRelationshipID
  lastUsedAt?: null | string
  metadata?: null | Record<string, unknown>
  provider: string
  run: RelationshipValue
  source?: RelationshipValue
  status: string
  updatedAt: string
}

type WriterRunPatch = Partial<{
  automationHeartbeatAt: null | string
  automationLeaseExpiresAt: null | string
  automationLeaseOwner: null | string
  automationLeaseToken: null | string
  createdDraft: null | WriterRelationshipID
  currentStage: null | WriterStageKey
  errorMessage: null | string
  normalizedSourceUrl: string
  originalWordCount: number
  sourceUrl: string
  status: WriterRunStatus
  targetKeyword: string
  targetWordCount: number
  writeUserPrompt: string
}>

function nowIso() {
  return new Date().toISOString()
}

function addLeaseDuration(leaseMs: number, from = Date.now()) {
  return new Date(from + leaseMs).toISOString()
}

function relationshipId(value: RelationshipValue) {
  if (typeof value === 'number') {
    return value
  }

  if (value && typeof value === 'object' && 'id' in value && value.id != null) {
    return value.id
  }

  return null
}

function requiredRelationshipId(value: RelationshipValue, fieldName: string) {
  const id = relationshipId(value)

  if (id == null) {
    throw new Error(`Missing relationship id for ${fieldName}`)
  }

  return id
}

function normalizeUrl(rawUrl: string) {
  const value = rawUrl.trim()

  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()

    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = ''
    }

    for (const key of [
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
      'ref',
      'ref_src',
      'utm_campaign',
      'utm_content',
      'utm_id',
      'utm_medium',
      'utm_name',
      'utm_source',
      'utm_term',
    ]) {
      url.searchParams.delete(key)
    }

    const params = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right))
    url.search = ''

    for (const [key, paramValue] of params) {
      url.searchParams.append(key, paramValue)
    }

    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return value
  }
}

function looksLikeHttpUrl(rawValue: string) {
  const value = rawValue.trim()

  if (!value || /\s/.test(value)) {
    return false
  }

  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.')
  } catch {
    return false
  }
}

export function normalizeWriterRunInput(input: WriterRunInput): WriterRunInput {
  let sourceUrl = input.sourceUrl.trim()
  let targetKeyword = input.targetKeyword.trim()

  if (looksLikeHttpUrl(targetKeyword) && !looksLikeHttpUrl(sourceUrl)) {
    ;[sourceUrl, targetKeyword] = [targetKeyword, sourceUrl]
  }

  if (!targetKeyword) {
    throw new InvalidWriterRunInputError('Target keyword is required.')
  }

  if (!looksLikeHttpUrl(sourceUrl)) {
    throw new InvalidWriterRunInputError('Original source URL must be a valid URL.')
  }

  if (looksLikeHttpUrl(targetKeyword)) {
    throw new InvalidWriterRunInputError('Target keyword must describe the topic, not a URL.')
  }

  return {
    sourceUrl,
    targetKeyword,
  }
}

async function withPayload(payload?: PayloadClient) {
  return payload ?? getCmsPayload()
}

function toRunRecord(doc: WriterRunDoc): WriterRunRecord {
  return {
    automationHeartbeatAt: doc.automationHeartbeatAt ?? null,
    automationLeaseExpiresAt: doc.automationLeaseExpiresAt ?? null,
    automationLeaseOwner: doc.automationLeaseOwner ?? null,
    automationLeaseToken: doc.automationLeaseToken ?? null,
    createdAt: doc.createdAt,
    createdDraftID: relationshipId(doc.createdDraft),
    currentStage: doc.currentStage ?? null,
    errorMessage: doc.errorMessage ?? null,
    id: doc.id,
    normalizedSourceUrl: doc.normalizedSourceUrl,
    originalWordCount: doc.originalWordCount ?? 0,
    sourceUrl: doc.sourceUrl,
    status: doc.status,
    targetKeyword: doc.targetKeyword,
    targetWordCount: doc.targetWordCount ?? 0,
    updatedAt: doc.updatedAt,
    writeUserPrompt: doc.writeUserPrompt ?? '',
  }
}

function toSourceRecord(doc: WriterSourceDoc): WriterSourceRecord {
  return {
    createdAt: doc.createdAt,
    fetchError: doc.fetchError ?? null,
    fetchStatus: doc.fetchStatus,
    id: doc.id,
    metaDescription: doc.metaDescription ?? null,
    normalizedUrl: doc.normalizedUrl,
    role: doc.role,
    runID: requiredRelationshipId(doc.run, 'writer source run'),
    selected: Boolean(doc.selected),
    serpPosition: doc.serpPosition ?? null,
    snippet: doc.snippet ?? null,
    title: doc.title ?? null,
    updatedAt: doc.updatedAt,
    url: doc.url,
  }
}

function toStageRecord(doc: WriterStageDoc): WriterStageExecutionRecord {
  return {
    completedAt: doc.completedAt ?? null,
    createdAt: doc.createdAt,
    errorText: doc.errorText ?? null,
    id: doc.id,
    inputPayload: doc.inputPayload ?? null,
    outputPayload: doc.outputPayload ?? null,
    retryCount: doc.retryCount ?? 0,
    runID: requiredRelationshipId(doc.run, 'writer stage run'),
    stageKey: doc.stageKey,
    startedAt: doc.startedAt ?? null,
    status: doc.status,
    updatedAt: doc.updatedAt,
  }
}

function toJobRecord(doc: WriterJobDoc): WriterJobRecord {
  return {
    completedAt: doc.completedAt ?? null,
    createdAt: doc.createdAt,
    errorText: doc.errorText ?? null,
    id: doc.id,
    kind: doc.kind,
    leaseExpiresAt: doc.leaseExpiresAt ?? null,
    leaseHeartbeatAt: doc.leaseHeartbeatAt ?? null,
    leaseOwner: doc.leaseOwner ?? null,
    leaseToken: doc.leaseToken ?? null,
    requestPayload: doc.requestPayload ?? null,
    responsePayload: doc.responsePayload ?? null,
    runID: requiredRelationshipId(doc.run, 'writer job run'),
    sourceID: relationshipId(doc.source),
    stageKey: doc.stageKey,
    startedAt: doc.startedAt ?? null,
    status: doc.status,
    updatedAt: doc.updatedAt,
  }
}

function toArtifactRecord(doc: WriterArtifactDoc): WriterArtifactRecord {
  return {
    artifactRole: doc.artifactRole,
    artifactType: doc.artifactType,
    content: doc.content,
    createdAt: doc.createdAt,
    filename: doc.filename,
    id: doc.id,
    mimeType: doc.mimeType,
    producedByJobID: relationshipId(doc.producedByJob),
    runID: requiredRelationshipId(doc.run, 'writer artifact run'),
    schemaName: doc.schemaName ?? null,
    schemaVersion: doc.schemaVersion ?? null,
    sha256: doc.sha256 ?? null,
    sourceID: relationshipId(doc.source),
    supersedesArtifactID: relationshipId(doc.supersedesArtifact),
    updatedAt: doc.updatedAt,
  }
}

function toTraceRecord(doc: WriterTraceDoc): WriterTraceEventRecord {
  return {
    completedAt: doc.completedAt ?? null,
    createdAt: doc.createdAt,
    errorText: doc.errorText ?? null,
    eventType: doc.eventType,
    id: doc.id,
    provider: doc.provider,
    requestPayload: doc.requestPayload ?? null,
    responsePayload: doc.responsePayload ?? null,
    runID: requiredRelationshipId(doc.run, 'writer trace run'),
    sourceID: relationshipId(doc.source),
    stageKey: doc.stageKey ?? null,
    startedAt: doc.startedAt ?? null,
    status: doc.status,
    updatedAt: doc.updatedAt,
  }
}

function toRemoteFileRecord(doc: WriterRemoteFileDoc): WriterRemoteFileRecord {
  const runID = requiredRelationshipId(doc.run, 'writer remote file run')

  return {
    artifactHash: doc.artifactHash,
    artifactID: relationshipId(doc.artifact),
    createdAt: doc.createdAt,
    deletedAt: doc.deletedAt ?? null,
    deleteAttemptedAt: doc.deleteAttemptedAt ?? null,
    downloadUrl: `/api/ai-writer/runs/${runID}/remote-files/${doc.id}`,
    errorText: doc.errorText ?? null,
    fileId: doc.fileId,
    id: doc.id,
    lastUsedAt: doc.lastUsedAt ?? null,
    metadata: doc.metadata ?? null,
    provider: doc.provider,
    runID,
    sourceID: relationshipId(doc.source),
    status: doc.status,
    updatedAt: doc.updatedAt,
  }
}

async function findOne<TDoc>(
  cms: PayloadClient,
  collection: Parameters<PayloadClient['find']>[0]['collection'],
  where: Where,
) {
  const result = (await cms.find({
    collection,
    depth: 0,
    limit: 1,
    page: 1,
    pagination: false,
    where,
  })) as PaginatedDocs<TDoc>

  return result.docs[0] ?? null
}

export async function createWriterRun(input: WriterRunInput, payload?: PayloadClient) {
  const normalizedInput = normalizeWriterRunInput(input)
  const cms = await withPayload(payload)
  const normalizedSourceUrl = normalizeUrl(normalizedInput.sourceUrl)
  const submittedAt = nowIso()

  const runDoc = (await cms.create({
    collection: 'writer-runs',
    data: {
      currentStage: 'discover_serp',
      normalizedSourceUrl,
      sourceUrl: normalizedInput.sourceUrl,
      status: 'draft',
      targetKeyword: normalizedInput.targetKeyword,
      writeUserPrompt: '',
    },
  })) as WriterRunDoc

  const sourceDoc = (await cms.create({
    collection: 'writer-sources',
    data: {
      fetchStatus: 'pending',
      normalizedUrl: normalizedSourceUrl,
      role: 'original',
      run: runDoc.id,
      selected: true,
      url: normalizedInput.sourceUrl,
    },
  })) as WriterSourceDoc

  await upsertWriterStageExecution(
    runDoc.id,
    'discover_serp',
    {
      inputPayload: {
        sourceUrl: normalizedInput.sourceUrl,
        targetKeyword: normalizedInput.targetKeyword,
      },
      status: 'queued',
    },
    cms,
  )

  await createWriterTraceEvent(
    {
      completedAt: submittedAt,
      eventType: 'workflow_submitted',
      provider: 'user',
      requestPayload: {
        sourceUrl: normalizedInput.sourceUrl,
        targetKeyword: normalizedInput.targetKeyword,
      },
      runID: runDoc.id,
      stageKey: 'discover_serp',
      startedAt: submittedAt,
      status: 'completed',
    },
    cms,
  )

  return {
    run: toRunRecord(runDoc),
    source: toSourceRecord(sourceDoc),
  }
}

export async function getWriterRun(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const doc = (await cms.findByID({
    collection: 'writer-runs',
    depth: 0,
    id: runID,
  })) as WriterRunDoc

  return toRunRecord(doc)
}

export async function listWriterRuns(payload?: PayloadClient): Promise<WriterRunSummary[]> {
  const cms = await withPayload(payload)
  const runsResult = (await cms.find({
    collection: 'writer-runs',
    depth: 0,
    limit: 100,
    page: 1,
    sort: '-updatedAt',
  })) as PaginatedDocs<WriterRunDoc>

  const runIDs = runsResult.docs.map((run) => run.id)
  const sourcesDocs = runIDs.length
    ? (
        ((await cms.find({
          collection: 'writer-sources',
          depth: 0,
          limit: 1000,
          page: 1,
          pagination: false,
          where: {
            run: {
              in: runIDs,
            },
          },
        })) as PaginatedDocs<WriterSourceDoc>).docs
      )
    : []

  return runsResult.docs.map((runDoc) => {
    const competitors = sourcesDocs
      .map(toSourceRecord)
      .filter((source) => source.runID === runDoc.id && source.role === 'competitor')

    return {
      createdDraftID: relationshipId(runDoc.createdDraft),
      currentStage: runDoc.currentStage ?? null,
      id: runDoc.id,
      selectedCompetitors: competitors.filter((source) => source.selected).length,
      sourceUrl: runDoc.sourceUrl,
      status: runDoc.status,
      targetKeyword: runDoc.targetKeyword,
      totalCompetitors: competitors.length,
      updatedAt: runDoc.updatedAt,
    }
  })
}

export async function updateWriterRun(runID: WriterRelationshipID, patch: WriterRunPatch, payload?: PayloadClient) {
  const cms = await withPayload(payload)

  const doc = (await cms.update({
    collection: 'writer-runs',
    data: patch,
    id: runID,
  })) as WriterRunDoc

  return toRunRecord(doc)
}

export async function hasPendingWriterRunWork(runID: WriterRelationshipID, payload?: PayloadClient) {
  const [run, stages] = await Promise.all([getWriterRun(runID, payload), listWriterStageExecutions(runID, payload)])
  const now = nowIso()
  const hasLease = Boolean(run.automationLeaseExpiresAt && run.automationLeaseExpiresAt > now)
  const hasQueuedAutomatedStage = stages.some(
    (stage) => stage.status === 'queued' && writerAutomatedStageKeys.includes(stage.stageKey as (typeof writerAutomatedStageKeys)[number]),
  )

  return hasLease || hasQueuedAutomatedStage
}

export async function claimNextQueuedWriterRun(
  input: {
    leaseMs: number
    workerId: string
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const runs = await listWriterRuns(cms)
  const stageLists = await Promise.all(runs.map((run) => listWriterStageExecutions(run.id, cms)))
  const now = nowIso()

  for (const [index, run] of runs.entries()) {
    const detailStages = stageLists[index] ?? []
    const hasQueuedAutomatedStage = detailStages.some(
      (stage) => stage.status === 'queued' && writerAutomatedStageKeys.includes(stage.stageKey as (typeof writerAutomatedStageKeys)[number]),
    )
    const leaseOpen =
      !detailStages.length ||
      !(await getWriterRun(run.id, cms)).automationLeaseExpiresAt ||
      (await getWriterRun(run.id, cms)).automationLeaseExpiresAt! < now

    if (!hasQueuedAutomatedStage || !leaseOpen) {
      continue
    }

    const leaseToken = crypto.randomUUID()
    await updateWriterRun(
      run.id,
      {
        automationHeartbeatAt: now,
        automationLeaseExpiresAt: addLeaseDuration(input.leaseMs),
        automationLeaseOwner: input.workerId,
        automationLeaseToken: leaseToken,
      },
      cms,
    )

    return {
      leaseToken,
      runID: run.id,
    }
  }

  return null
}

export async function heartbeatWriterRunClaim(
  runID: WriterRelationshipID,
  leaseToken: string,
  leaseMs: number,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const run = await getWriterRun(runID, cms)

  if (run.automationLeaseToken !== leaseToken) {
    return false
  }

  await updateWriterRun(
    runID,
    {
      automationHeartbeatAt: nowIso(),
      automationLeaseExpiresAt: addLeaseDuration(leaseMs),
    },
    cms,
  )

  return true
}

export async function releaseWriterRunClaim(runID: WriterRelationshipID, leaseToken: string, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const run = await getWriterRun(runID, cms)

  if (run.automationLeaseToken !== leaseToken) {
    return false
  }

  await updateWriterRun(
    runID,
    {
      automationHeartbeatAt: null,
      automationLeaseExpiresAt: null,
      automationLeaseOwner: null,
      automationLeaseToken: null,
    },
    cms,
  )

  return true
}

export async function listWriterSources(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-sources',
    depth: 0,
    limit: 1000,
    page: 1,
    sort: 'serpPosition',
    where: {
      run: {
        equals: runID,
      },
    },
  })) as PaginatedDocs<WriterSourceDoc>

  return result.docs.map(toSourceRecord)
}

export async function getSelectedWriterSources(runID: WriterRelationshipID, payload?: PayloadClient) {
  const sources = await listWriterSources(runID, payload)
  return sources.filter((source) => source.role === 'original' || source.selected)
}

export async function updateWriterSource(
  sourceID: WriterRelationshipID,
  patch: Partial<{
    fetchError: null | string
    fetchStatus: WriterSourceFetchStatus
    metaDescription: null | string
    normalizedUrl: string
    selected: boolean
    serpPosition: null | number
    snippet: null | string
    title: null | string
    url: string
  }>,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.update({
    collection: 'writer-sources',
    data: patch,
    id: sourceID,
  })) as WriterSourceDoc

  return toSourceRecord(doc)
}

export async function upsertWriterSource(
  input: {
    fetchError?: null | string
    fetchStatus?: WriterSourceFetchStatus
    metaDescription?: null | string
    normalizedUrl: string
    role: WriterSourceRole
    runID: WriterRelationshipID
    selected?: boolean
    serpPosition?: null | number
    snippet?: null | string
    title?: null | string
    url: string
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const existing = await findOne<WriterSourceDoc>(cms, 'writer-sources', {
    and: [
      {
        run: {
          equals: input.runID,
        },
      },
      {
        normalizedUrl: {
          equals: input.normalizedUrl,
        },
      },
    ],
  })

  if (existing) {
    return updateWriterSource(
      existing.id,
      {
        fetchError: input.fetchError,
        fetchStatus: input.fetchStatus,
        metaDescription: input.metaDescription,
        normalizedUrl: input.normalizedUrl,
        selected: input.selected,
        serpPosition: input.serpPosition,
        snippet: input.snippet,
        title: input.title,
        url: input.url,
      },
      cms,
    )
  }

  const doc = (await cms.create({
    collection: 'writer-sources',
    data: {
      fetchError: input.fetchError,
      fetchStatus: input.fetchStatus ?? 'pending',
      metaDescription: input.metaDescription,
      normalizedUrl: input.normalizedUrl,
      role: input.role,
      run: input.runID,
      selected: input.selected ?? false,
      serpPosition: input.serpPosition,
      snippet: input.snippet,
      title: input.title,
      url: input.url,
    },
  })) as WriterSourceDoc

  return toSourceRecord(doc)
}

export async function saveWriterSerpSources(
  runID: WriterRelationshipID,
  results: WriterSerpResult[],
  payload?: PayloadClient,
) {
  const upserts = results.map((result) => upsertWriterSource(toWriterSourceInput(runID, result), payload))
  return Promise.all(upserts)
}

export async function setWriterSelectedCompetitors(
  runID: WriterRelationshipID,
  sourceIDs: WriterRelationshipID[],
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const sources = await listWriterSources(runID, cms)

  await Promise.all(
    sources
      .filter((source) => source.role === 'competitor')
      .map((source) =>
        updateWriterSource(
          source.id,
          {
            selected: sourceIDs.includes(source.id),
          },
          cms,
        ),
      ),
  )

  return listWriterSources(runID, cms)
}

export async function upsertWriterStageExecution(
  runID: WriterRelationshipID,
  stageKey: WriterStageKey,
  patch: Partial<{
    completedAt: null | string
    errorText: null | string
    inputPayload: null | Record<string, unknown>
    outputPayload: null | Record<string, unknown>
    retryCount: number
    startedAt: null | string
    status: WriterStageStatus
  }>,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const existing = await findOne<WriterStageDoc>(cms, 'writer-stage-executions', {
    and: [
      {
        run: {
          equals: runID,
        },
      },
      {
        stageKey: {
          equals: stageKey,
        },
      },
    ],
  })

  const data = {
    completedAt: patch.completedAt,
    errorText: patch.errorText,
    inputPayload: patch.inputPayload,
    outputPayload: patch.outputPayload,
    retryCount: patch.retryCount ?? existing?.retryCount ?? 0,
    startedAt: patch.startedAt,
    status: patch.status ?? existing?.status ?? 'queued',
  }

  if (existing) {
    const doc = (await cms.update({
      collection: 'writer-stage-executions',
      data,
      id: existing.id,
    })) as WriterStageDoc

    return toStageRecord(doc)
  }

  const doc = (await cms.create({
    collection: 'writer-stage-executions',
    data: {
      ...data,
      run: runID,
      stageKey,
    },
  })) as WriterStageDoc

  return toStageRecord(doc)
}

export async function incrementWriterStageRetry(runID: WriterRelationshipID, stageKey: WriterStageKey, payload?: PayloadClient) {
  const stages = await listWriterStageExecutions(runID, payload)
  const stage = stages.find((entry) => entry.stageKey === stageKey)

  return upsertWriterStageExecution(
    runID,
    stageKey,
    {
      retryCount: (stage?.retryCount ?? 0) + 1,
    },
    payload,
  )
}

export async function listWriterStageExecutions(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-stage-executions',
    depth: 0,
    limit: 100,
    page: 1,
    sort: 'createdAt',
    where: {
      run: {
        equals: runID,
      },
    },
  })) as PaginatedDocs<WriterStageDoc>

  return result.docs.map(toStageRecord)
}

export async function createWriterJob(
  input: {
    kind: WriterJobKind
    requestPayload?: null | Record<string, unknown>
    runID: WriterRelationshipID
    sourceID?: null | WriterRelationshipID
    stageKey: WriterStageKey
    status?: WriterJobStatus
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.create({
    collection: 'writer-jobs',
    data: {
      kind: input.kind,
      requestPayload: input.requestPayload,
      run: input.runID,
      source: input.sourceID,
      stageKey: input.stageKey,
      status: input.status ?? 'queued',
    },
  })) as WriterJobDoc

  return toJobRecord(doc)
}

export async function updateWriterJob(
  jobID: WriterRelationshipID,
  patch: Partial<{
    completedAt: null | string
    errorText: null | string
    leaseExpiresAt: null | string
    leaseHeartbeatAt: null | string
    leaseOwner: null | string
    leaseToken: null | string
    requestPayload: null | Record<string, unknown>
    responsePayload: null | Record<string, unknown>
    startedAt: null | string
    status: WriterJobStatus
  }>,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.update({
    collection: 'writer-jobs',
    data: patch,
    id: jobID,
  })) as WriterJobDoc

  return toJobRecord(doc)
}

export async function listWriterJobs(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-jobs',
    depth: 0,
    limit: 500,
    page: 1,
    sort: '-updatedAt',
    where: {
      run: {
        equals: runID,
      },
    },
  })) as PaginatedDocs<WriterJobDoc>

  return result.docs.map(toJobRecord)
}

export async function claimNextQueuedWriterJob(
  input: {
    leaseMs: number
    runID: WriterRelationshipID
    workerId: string
  },
  payload?: PayloadClient,
) {
  const jobs = (await listWriterJobs(input.runID, payload)).filter((job) => job.status === 'queued')

  for (const job of jobs) {
    if (job.leaseExpiresAt && job.leaseExpiresAt > nowIso()) {
      continue
    }

    const leaseToken = crypto.randomUUID()
    const updated = await updateWriterJob(
      job.id,
      {
        leaseExpiresAt: addLeaseDuration(input.leaseMs),
        leaseHeartbeatAt: nowIso(),
        leaseOwner: input.workerId,
        leaseToken,
        startedAt: job.startedAt ?? nowIso(),
        status: 'running',
      },
      payload,
    )

    return {
      job: updated,
      leaseToken,
    }
  }

  return null
}

export async function heartbeatWriterJobClaim(
  jobID: WriterRelationshipID,
  leaseToken: string,
  leaseMs: number,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.findByID({
    collection: 'writer-jobs',
    depth: 0,
    id: jobID,
  })) as WriterJobDoc

  if ((doc.leaseToken ?? null) !== leaseToken) {
    return false
  }

  await updateWriterJob(
    jobID,
    {
      leaseExpiresAt: addLeaseDuration(leaseMs),
      leaseHeartbeatAt: nowIso(),
    },
    cms,
  )

  return true
}

export async function releaseWriterJobClaim(jobID: WriterRelationshipID, leaseToken: string, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const doc = (await cms.findByID({
    collection: 'writer-jobs',
    depth: 0,
    id: jobID,
  })) as WriterJobDoc

  if ((doc.leaseToken ?? null) !== leaseToken) {
    return false
  }

  await updateWriterJob(
    jobID,
    {
      leaseExpiresAt: null,
      leaseHeartbeatAt: null,
      leaseOwner: null,
      leaseToken: null,
    },
    cms,
  )

  return true
}

export async function createWriterArtifact(
  input: {
    artifactRole?: WriterArtifactRole
    artifactType: WriterArtifactType
    content: string
    filename: string
    mimeType: string
    producedByJobID?: null | WriterRelationshipID
    runID: WriterRelationshipID
    schemaName?: null | string
    schemaVersion?: null | string
    sha256?: null | string
    sourceID?: null | WriterRelationshipID
    supersedesArtifactID?: null | WriterRelationshipID
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.create({
    collection: 'writer-artifacts',
    data: {
      artifactRole: input.artifactRole ?? 'derived',
      artifactType: input.artifactType,
      content: input.content,
      filename: input.filename,
      mimeType: input.mimeType,
      producedByJob: input.producedByJobID,
      run: input.runID,
      schemaName: input.schemaName,
      schemaVersion: input.schemaVersion,
      sha256: input.sha256,
      source: input.sourceID,
      supersedesArtifact: input.supersedesArtifactID,
    },
  })) as WriterArtifactDoc

  return toArtifactRecord(doc)
}

export async function upsertWriterArtifact(
  input: Parameters<typeof createWriterArtifact>[0],
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const existing = await findOne<WriterArtifactDoc>(cms, 'writer-artifacts', {
    and: [
      {
        run: {
          equals: input.runID,
        },
      },
      {
        artifactType: {
          equals: input.artifactType,
        },
      },
      ...(input.sourceID != null
        ? [
            {
              source: {
                equals: input.sourceID,
              },
            },
          ]
        : []),
    ],
  })

  if (!existing) {
    return createWriterArtifact(input, cms)
  }

  const doc = (await cms.update({
    collection: 'writer-artifacts',
    data: {
      artifactRole: input.artifactRole ?? 'derived',
      artifactType: input.artifactType,
      content: input.content,
      filename: input.filename,
      mimeType: input.mimeType,
      producedByJob: input.producedByJobID,
      schemaName: input.schemaName,
      schemaVersion: input.schemaVersion,
      sha256: input.sha256,
      source: input.sourceID,
      supersedesArtifact: input.supersedesArtifactID,
    },
    id: existing.id,
  })) as WriterArtifactDoc

  return toArtifactRecord(doc)
}

export async function listWriterArtifacts(runID: WriterRelationshipID, where: Where = {}, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-artifacts',
    depth: 0,
    limit: 1000,
    page: 1,
    sort: '-updatedAt',
    where: {
      and: [
        {
          run: {
            equals: runID,
          },
        },
        where,
      ],
    },
  })) as PaginatedDocs<WriterArtifactDoc>

  return result.docs.map(toArtifactRecord)
}

export async function getWriterArtifact(artifactID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const doc = (await cms.findByID({
    collection: 'writer-artifacts',
    depth: 0,
    id: artifactID,
  })) as WriterArtifactDoc

  return toArtifactRecord(doc)
}

export async function createWriterTraceEvent(
  input: {
    completedAt?: null | string
    errorText?: null | string
    eventType: string
    provider: WriterTraceProvider
    requestPayload?: null | Record<string, unknown>
    responsePayload?: null | Record<string, unknown>
    runID: WriterRelationshipID
    sourceID?: null | WriterRelationshipID
    stageKey?: null | WriterStageKey
    startedAt?: null | string
    status: WriterTraceStatus
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.create({
    collection: 'writer-trace-events',
    data: {
      completedAt: input.completedAt,
      errorText: input.errorText,
      eventType: input.eventType,
      provider: input.provider,
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
      run: input.runID,
      source: input.sourceID,
      stageKey: input.stageKey,
      startedAt: input.startedAt,
      status: input.status,
    },
  })) as WriterTraceDoc

  return toTraceRecord(doc)
}

export async function updateWriterTraceEvent(
  traceEventID: WriterRelationshipID,
  input: Partial<{
    completedAt: null | string
    errorText: null | string
    requestPayload: null | Record<string, unknown>
    responsePayload: null | Record<string, unknown>
    startedAt: null | string
    status: WriterTraceStatus
  }>,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.update({
    collection: 'writer-trace-events',
    data: {
      completedAt: input.completedAt,
      errorText: input.errorText,
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
      startedAt: input.startedAt,
      status: input.status,
    },
    id: traceEventID,
  })) as WriterTraceDoc

  return toTraceRecord(doc)
}

export async function listWriterTraceEvents(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-trace-events',
    depth: 0,
    limit: 1000,
    page: 1,
    sort: '-createdAt',
    where: {
      run: {
        equals: runID,
      },
    },
  })) as PaginatedDocs<WriterTraceDoc>

  return result.docs.map(toTraceRecord)
}

export async function createWriterRemoteFile(
  input: {
    artifactHash: string
    artifactID?: null | WriterRelationshipID
    deletedAt?: null | string
    deleteAttemptedAt?: null | string
    errorText?: null | string
    fileId: string
    lastUsedAt?: null | string
    metadata?: null | Record<string, unknown>
    provider: string
    runID: WriterRelationshipID
    sourceID?: null | WriterRelationshipID
    status?: string
  },
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const doc = (await cms.create({
    collection: 'writer-remote-files',
    data: {
      artifact: input.artifactID,
      artifactHash: input.artifactHash,
      deletedAt: input.deletedAt,
      deleteAttemptedAt: input.deleteAttemptedAt,
      errorText: input.errorText,
      fileId: input.fileId,
      lastUsedAt: input.lastUsedAt,
      metadata: input.metadata,
      provider: input.provider,
      run: input.runID,
      source: input.sourceID,
      status: input.status ?? 'active',
    },
  })) as WriterRemoteFileDoc

  return toRemoteFileRecord(doc)
}

export async function listWriterRemoteFiles(runID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const result = (await cms.find({
    collection: 'writer-remote-files',
    depth: 0,
    limit: 1000,
    page: 1,
    sort: '-updatedAt',
    where: {
      run: {
        equals: runID,
      },
    },
  })) as PaginatedDocs<WriterRemoteFileDoc>

  return result.docs.map(toRemoteFileRecord)
}

export async function getWriterRemoteFile(remoteFileID: WriterRelationshipID, payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const doc = (await cms.findByID({
    collection: 'writer-remote-files',
    depth: 0,
    id: remoteFileID,
  })) as WriterRemoteFileDoc

  return toRemoteFileRecord(doc)
}

export async function getWriterRunDetail(runID: WriterRelationshipID, payload?: PayloadClient): Promise<WriterRunDetail> {
  const cms = await withPayload(payload)
  const [run, sources, stages, jobs, artifacts, traceEvents, remoteFiles] = await Promise.all([
    getWriterRun(runID, cms),
    listWriterSources(runID, cms),
    listWriterStageExecutions(runID, cms),
    listWriterJobs(runID, cms),
    listWriterArtifacts(runID, {}, cms),
    listWriterTraceEvents(runID, cms),
    listWriterRemoteFiles(runID, cms),
  ])

  return {
    artifacts,
    jobs,
    remoteFiles,
    run,
    sources: sources.sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'original' ? -1 : 1
      }

      return (left.serpPosition ?? 9999) - (right.serpPosition ?? 9999)
    }),
    stages,
    traceEvents,
  }
}

export function toWriterSourceInput(runID: WriterRelationshipID, result: WriterSerpResult) {
  return {
    fetchStatus: 'pending' as WriterSourceFetchStatus,
    normalizedUrl: result.normalizedUrl,
    role: 'competitor' as WriterSourceRole,
    runID,
    selected: false,
    serpPosition: result.position,
    snippet: result.snippet,
    title: result.title,
    url: result.url,
  }
}
