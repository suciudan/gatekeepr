import {
  claimNextQueuedWriterRun,
  createWriterTraceEvent,
  createWriterRun,
  getSelectedWriterSources,
  getWriterRunDetail,
  heartbeatWriterRunClaim,
  listWriterArtifacts,
  listWriterStageExecutions,
  releaseWriterRunClaim,
  saveWriterSerpSources,
  setWriterSelectedCompetitors,
  updateWriterRun,
  updateWriterSource,
  upsertWriterArtifact,
  upsertWriterStageExecution,
} from './repository'
import type { AIWriterGeneratedFile } from './providerTypes'
import { persistAIWriterRemoteFile } from './remoteFiles'
import type {
  WriterArtifactRecord,
  WriterRelationshipID,
  WriterRunDetail,
  WriterRunInput,
  WriterSerpResult,
  WriterSourceRecord,
  WriterStageExecutionRecord,
  WriterStageKey,
} from './types'
import { writerAutomatedStageKeys } from './types'

declare global {
  var __cmsAiWriterScheduler:
    | {
        bootstrapped: boolean
        workerId: string
      }
    | undefined
}

const schedulerState = globalThis.__cmsAiWriterScheduler ?? {
  bootstrapped: false,
  workerId: `cms-ai-writer-${crypto.randomUUID()}`,
}

globalThis.__cmsAiWriterScheduler = schedulerState

const AUTOMATION_HEARTBEAT_MS = 10_000
const AUTOMATION_LEASE_MS = 45_000
const SOURCE_STAGE_CONCURRENCY = 5

type SearchKeywordResult = {
  raw: unknown
  results: WriterSerpResult[]
}

type ReadableArticleResult = {
  finalUrl?: string
  html: string
  metaDescription?: null | string
  title: string
}

type MarkdownResult = {
  markdown: string
  raw?: unknown
}

type StructuredBlock = {
  block_id: string
  heading: null | string
  kind: string
  markdown: string
  order: number
  plain_text: string
  word_count: number
}

type BlocksResult = {
  blocks: StructuredBlock[]
  raw?: unknown
}

type FactpackResult = {
  factpack: unknown
  markdown: string
  raw?: unknown
}

export type WriterAutomationProvider = {
  buildFactpack(input: {
    run: WriterRunDetail['run']
    sources: Array<{
      blocks: StructuredBlock[]
      markdown: string
      source: WriterSourceRecord
    }>
  }): Promise<FactpackResult>
  convertArticleToMarkdown(input: {
    article: ReadableArticleResult
    run: WriterRunDetail['run']
    source: WriterSourceRecord
  }): Promise<MarkdownResult>
  convertMarkdownToBlocks(input: {
    markdown: string
    run: WriterRunDetail['run']
    source: WriterSourceRecord
  }): Promise<BlocksResult>
  fetchReadableArticle(input: {
    run: WriterRunDetail['run']
    source: WriterSourceRecord
  }): Promise<ReadableArticleResult>
  searchKeyword(input: {
    run: WriterRunDetail['run']
  }): Promise<SearchKeywordResult>
}

function formatJsonFile(content: unknown) {
  return JSON.stringify(content, null, 2)
}

function extractGeneratedFile(raw: unknown): AIWriterGeneratedFile | null {
  if (!raw || typeof raw !== 'object' || !('generatedFile' in raw)) {
    return null
  }

  const candidate = (raw as { generatedFile?: unknown }).generatedFile

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const generatedFile = candidate as Partial<AIWriterGeneratedFile>

  if (
    typeof generatedFile.content !== 'string' ||
    typeof generatedFile.fileId !== 'string' ||
    typeof generatedFile.filename !== 'string' ||
    typeof generatedFile.mimeType !== 'string' ||
    typeof generatedFile.sizeBytes !== 'number'
  ) {
    return null
  }

  if (!generatedFile.fileId.trim() || generatedFile.fileId.startsWith('inline:')) {
    return null
  }

  return {
    content: generatedFile.content,
    downloadable: generatedFile.downloadable === true,
    fileId: generatedFile.fileId,
    filename: generatedFile.filename,
    mimeType: generatedFile.mimeType,
    provider: generatedFile.provider,
    sizeBytes: generatedFile.sizeBytes,
  }
}

async function persistGeneratedFileForArtifact(input: {
  artifact: WriterArtifactRecord
  raw: unknown
  runID: WriterRelationshipID
  sourceID?: null | WriterRelationshipID
  stageKey: WriterStageKey
}) {
  const generatedFile = extractGeneratedFile(input.raw)

  if (!generatedFile) {
    return
  }

  await persistAIWriterRemoteFile({
    artifact: input.artifact,
    generatedFile,
    runID: input.runID,
    sourceID: input.sourceID,
    stageKey: input.stageKey,
  })
}

function toWordCount(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function startHeartbeat(runID: WriterRelationshipID, leaseToken: string) {
  const timer = setInterval(() => {
    void heartbeatWriterRunClaim(runID, leaseToken, AUTOMATION_LEASE_MS)
  }, AUTOMATION_HEARTBEAT_MS)

  timer.unref?.()

  return () => {
    clearInterval(timer)
  }
}

function sourceBaseName(source: WriterSourceRecord) {
  if (source.role === 'original') {
    return 'original-source'
  }

  return `serp-${source.serpPosition ?? 0}`
}

function getLatestArtifact(
  artifacts: WriterArtifactRecord[],
  input: {
    artifactType: WriterArtifactRecord['artifactType']
    sourceID?: null | WriterRelationshipID
  },
) {
  return artifacts.find(
    (artifact) =>
      artifact.artifactType === input.artifactType &&
      (input.sourceID === undefined || artifact.sourceID === input.sourceID),
  )
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) {
    return []
  }

  const results = new Array<TResult>(items.length)
  const workerLimit = Math.max(1, limit)
  let nextIndex = 0
  let settled = false
  let completedCount = 0
  let activeCount = 0

  return await new Promise<TResult[]>((resolve, reject) => {
    const launchNext = () => {
      if (settled) {
        return
      }

      if (completedCount === items.length) {
        settled = true
        resolve(results)
        return
      }

      while (!settled && activeCount < workerLimit && nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        activeCount += 1

        void worker(items[currentIndex], currentIndex)
          .then((result) => {
            if (settled) {
              return
            }

            results[currentIndex] = result
            completedCount += 1

            if (completedCount === items.length) {
              settled = true
              resolve(results)
            }
          })
          .catch((error) => {
            if (settled) {
              return
            }

            settled = true
            reject(error)
          })
          .finally(() => {
            activeCount -= 1

            if (!settled) {
              launchNext()
            }
          })
      }
    }

    launchNext()
  })
}

async function ensureAutomatedStageQueued(runID: WriterRelationshipID, stageKey: WriterStageKey, inputPayload?: Record<string, unknown>) {
  await upsertWriterStageExecution(runID, stageKey, {
    completedAt: null,
    errorText: null,
    inputPayload: inputPayload ?? null,
    outputPayload: null,
    startedAt: null,
    status: 'queued',
  })
}

async function markStageFailed(runID: WriterRelationshipID, stageKey: WriterStageKey, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const stages = await listWriterStageExecutions(runID)
  const retryCount = (stages.find((stage) => stage.stageKey === stageKey)?.retryCount ?? 0) + 1

  await Promise.all([
    upsertWriterStageExecution(runID, stageKey, {
      completedAt: new Date().toISOString(),
      errorText: message,
      retryCount,
      status: 'failed',
    }),
    updateWriterRun(runID, {
      currentStage: stageKey,
      errorMessage: message,
      status: 'failed',
    }),
    createWriterTraceEvent({
      completedAt: new Date().toISOString(),
      errorText: message,
      eventType: `${stageKey}_failed`,
      provider: 'local',
      runID,
      stageKey,
      startedAt: new Date().toISOString(),
      status: 'failed',
    }),
  ])
}

async function processDiscoverStage(detail: WriterRunDetail, provider: WriterAutomationProvider) {
  const runID = detail.run.id

  await Promise.all([
    upsertWriterStageExecution(runID, 'discover_serp', {
      errorText: null,
      startedAt: new Date().toISOString(),
      status: 'running',
    }),
    updateWriterRun(runID, {
      currentStage: 'discover_serp',
      errorMessage: null,
      status: 'discovering',
    }),
  ])

  const searchResult = await provider.searchKeyword({
    run: detail.run,
  })
  const competitorResults = searchResult.results.filter(
    (result) => result.normalizedUrl !== detail.run.normalizedSourceUrl,
  )

  await saveWriterSerpSources(runID, competitorResults)
  await Promise.all([
    upsertWriterArtifact({
      artifactRole: 'derived',
      artifactType: 'serp',
      content: formatJsonFile(competitorResults),
      filename: 'serp.json',
      mimeType: 'application/json',
      runID,
    }),
    upsertWriterArtifact({
      artifactRole: 'model_output_raw',
      artifactType: 'serp_raw',
      content: formatJsonFile(searchResult.raw),
      filename: 'serp-raw.json',
      mimeType: 'application/json',
      runID,
    }),
  ])

  await Promise.all([
    upsertWriterStageExecution(runID, 'discover_serp', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        sourceCount: competitorResults.length,
      },
      status: 'completed',
    }),
    upsertWriterStageExecution(runID, 'source_selection', {
      inputPayload: {
        candidateCount: competitorResults.length,
      },
      status: 'awaiting_user',
    }),
    createWriterTraceEvent({
      completedAt: new Date().toISOString(),
      eventType: 'serp_discovered',
      provider: 'brightdata',
      requestPayload: {
        targetKeyword: detail.run.targetKeyword,
      },
      responsePayload: {
        resultCount: competitorResults.length,
      },
      runID,
      stageKey: 'discover_serp',
      startedAt: new Date().toISOString(),
      status: 'completed',
    }),
    updateWriterRun(runID, {
      currentStage: 'source_selection',
      status: 'awaiting_selection',
    }),
  ])
}

async function processConvertMarkdownStage(detail: WriterRunDetail, provider: WriterAutomationProvider) {
  const runID = detail.run.id
  const selectedSources = await getSelectedWriterSources(runID)

  await Promise.all([
    upsertWriterStageExecution(runID, 'convert_markdown', {
      errorText: null,
      startedAt: new Date().toISOString(),
      status: 'running',
    }),
    updateWriterRun(runID, {
      currentStage: 'convert_markdown',
      errorMessage: null,
      status: 'processing',
    }),
  ])

  await mapWithConcurrency(selectedSources, SOURCE_STAGE_CONCURRENCY, async (source) => {
    const article = await provider.fetchReadableArticle({
      run: detail.run,
      source,
    })
    const finalUrl = article.finalUrl ?? source.url
    const normalizedFinalUrl = finalUrl === source.url ? source.normalizedUrl : new URL(finalUrl).toString()

    const sourcePersistence = Promise.all([
      updateWriterSource(source.id, {
        fetchError: null,
        fetchStatus: 'completed',
        metaDescription: article.metaDescription ?? null,
        normalizedUrl: normalizedFinalUrl,
        title: article.title,
        url: finalUrl,
      }),
      upsertWriterArtifact({
        artifactRole: 'derived',
        artifactType: 'raw_html',
        content: article.html,
        filename: `${sourceBaseName(source)}.html`,
        mimeType: 'text/html',
        runID,
        sourceID: source.id,
      }),
    ]).then(
      () => null,
      (error) => error,
    )

    const markdownResult = await provider.convertArticleToMarkdown({
      article,
      run: detail.run,
      source,
    })

    const sourcePersistenceError = await sourcePersistence

    if (sourcePersistenceError) {
      throw sourcePersistenceError
    }

    const markdownArtifact = await upsertWriterArtifact({
      artifactRole: 'derived',
      artifactType: 'markdown',
      content: markdownResult.markdown,
      filename: `${sourceBaseName(source)}.md`,
      mimeType: 'text/markdown',
      runID,
      sourceID: source.id,
    })
    await persistGeneratedFileForArtifact({
      artifact: markdownArtifact,
      raw: markdownResult.raw,
      runID,
      sourceID: source.id,
      stageKey: 'convert_markdown',
    })
  })

  await Promise.all([
    upsertWriterStageExecution(runID, 'convert_markdown', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        processedSources: selectedSources.length,
      },
      status: 'completed',
    }),
    ensureAutomatedStageQueued(runID, 'extract_blocks', {
      sourceCount: selectedSources.length,
    }),
    updateWriterRun(runID, {
      currentStage: 'extract_blocks',
      status: 'processing',
    }),
  ])
}

async function processExtractBlocksStage(detail: WriterRunDetail, provider: WriterAutomationProvider) {
  const runID = detail.run.id
  const selectedSources = await getSelectedWriterSources(runID)
  const artifacts = await listWriterArtifacts(runID)

  await Promise.all([
    upsertWriterStageExecution(runID, 'extract_blocks', {
      errorText: null,
      startedAt: new Date().toISOString(),
      status: 'running',
    }),
    updateWriterRun(runID, {
      currentStage: 'extract_blocks',
      errorMessage: null,
      status: 'processing',
    }),
  ])

  await mapWithConcurrency(selectedSources, SOURCE_STAGE_CONCURRENCY, async (source) => {
    const markdownArtifact = getLatestArtifact(artifacts, {
      artifactType: 'markdown',
      sourceID: source.id,
    })

    if (!markdownArtifact) {
      throw new Error(`Missing markdown artifact for source ${source.id}`)
    }

    const blocksResult = await provider.convertMarkdownToBlocks({
      markdown: markdownArtifact.content,
      run: detail.run,
      source,
    })

    const blocksArtifact = await upsertWriterArtifact({
      artifactRole: 'derived',
      artifactType: 'blocks',
      content: formatJsonFile(blocksResult.blocks),
      filename: `${sourceBaseName(source)}-blocks.json`,
      mimeType: 'application/json',
      runID,
      sourceID: source.id,
    })
    await persistGeneratedFileForArtifact({
      artifact: blocksArtifact,
      raw: blocksResult.raw,
      runID,
      sourceID: source.id,
      stageKey: 'extract_blocks',
    })
  })

  await Promise.all([
    upsertWriterStageExecution(runID, 'extract_blocks', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        processedSources: selectedSources.length,
      },
      status: 'completed',
    }),
    ensureAutomatedStageQueued(runID, 'compute_target_word_count'),
    updateWriterRun(runID, {
      currentStage: 'compute_target_word_count',
      status: 'processing',
    }),
  ])
}

async function processTargetWordCountStage(detail: WriterRunDetail) {
  const runID = detail.run.id
  const selectedSources = await getSelectedWriterSources(runID)
  const originalSource = selectedSources.find((source) => source.role === 'original')
  const artifacts = await listWriterArtifacts(runID)

  if (!originalSource) {
    throw new Error('Original source is missing for target word count stage')
  }

  const markdownArtifact = getLatestArtifact(artifacts, {
    artifactType: 'markdown',
    sourceID: originalSource.id,
  })

  if (!markdownArtifact) {
    throw new Error('Original markdown artifact is missing')
  }

  const originalWordCount = toWordCount(markdownArtifact.content)
  const targetWordCount = Math.max(originalWordCount, Math.round(originalWordCount * 1.1))

  await Promise.all([
    upsertWriterStageExecution(runID, 'compute_target_word_count', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        originalWordCount,
        targetWordCount,
      },
      startedAt: new Date().toISOString(),
      status: 'completed',
    }),
    ensureAutomatedStageQueued(runID, 'build_factpack'),
    updateWriterRun(runID, {
      currentStage: 'build_factpack',
      originalWordCount,
      status: 'processing',
      targetWordCount,
    }),
  ])
}

async function processBuildFactpackStage(detail: WriterRunDetail, provider: WriterAutomationProvider) {
  const runID = detail.run.id
  const sources = await getSelectedWriterSources(runID)
  const artifacts = await listWriterArtifacts(runID)

  const sourcePayload = sources.map((source) => {
    const markdownArtifact = getLatestArtifact(artifacts, {
      artifactType: 'markdown',
      sourceID: source.id,
    })
    const blocksArtifact = getLatestArtifact(artifacts, {
      artifactType: 'blocks',
      sourceID: source.id,
    })

    if (!markdownArtifact || !blocksArtifact) {
      throw new Error(`Missing stage artifacts for source ${source.id}`)
    }

    return {
      blocks: JSON.parse(blocksArtifact.content) as StructuredBlock[],
      markdown: markdownArtifact.content,
      source,
    }
  })

  await Promise.all([
    upsertWriterStageExecution(runID, 'build_factpack', {
      errorText: null,
      startedAt: new Date().toISOString(),
      status: 'running',
    }),
    updateWriterRun(runID, {
      currentStage: 'build_factpack',
      errorMessage: null,
      status: 'processing',
    }),
  ])

  const factpackResult = await provider.buildFactpack({
    run: detail.run,
    sources: sourcePayload,
  })

  const factpackArtifact = await upsertWriterArtifact({
      artifactRole: 'model_output_normalized',
      artifactType: 'factpack_json',
      content: formatJsonFile(factpackResult.factpack),
      filename: 'factpack.json',
      mimeType: 'application/json',
      runID,
    })
  await persistGeneratedFileForArtifact({
    artifact: factpackArtifact,
    raw: factpackResult.raw,
    runID,
    stageKey: 'build_factpack',
  })

  await Promise.all([
    upsertWriterArtifact({
      artifactRole: 'derived',
      artifactType: 'factpack_md',
      content: factpackResult.markdown,
      filename: 'factpack.md',
      mimeType: 'text/markdown',
      runID,
    }),
    upsertWriterStageExecution(runID, 'build_factpack', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        sourceCount: sourcePayload.length,
      },
      status: 'completed',
    }),
    upsertWriterStageExecution(runID, 'brief', {
      inputPayload: {
        readyFrom: 'build_factpack',
      },
      status: 'awaiting_user',
    }),
    upsertWriterStageExecution(runID, 'validate', {
      inputPayload: {
        blockedOn: 'brief',
      },
      status: 'queued',
    }),
    upsertWriterStageExecution(runID, 'write', {
      inputPayload: {
        blockedOn: 'validate',
      },
      status: 'queued',
    }),
    upsertWriterStageExecution(runID, 'check', {
      inputPayload: {
        blockedOn: 'write',
      },
      status: 'queued',
    }),
    updateWriterRun(runID, {
      currentStage: 'brief',
      status: 'awaiting_user',
    }),
  ])
}

function nextQueuedAutomatedStage(stages: WriterStageExecutionRecord[]) {
  return writerAutomatedStageKeys.find((stageKey) => stages.some((stage) => stage.stageKey === stageKey && stage.status === 'queued'))
}

export async function processWriterRunAutomation(runID: WriterRelationshipID, provider: WriterAutomationProvider) {
  let detail = await getWriterRunDetail(runID)

  while (true) {
    const stageKey = nextQueuedAutomatedStage(detail.stages)

    if (!stageKey) {
      return getWriterRunDetail(runID)
    }

    try {
      switch (stageKey) {
        case 'discover_serp':
          await processDiscoverStage(detail, provider)
          break
        case 'convert_markdown':
          await processConvertMarkdownStage(detail, provider)
          break
        case 'extract_blocks':
          await processExtractBlocksStage(detail, provider)
          break
        case 'compute_target_word_count':
          await processTargetWordCountStage(detail)
          break
        case 'build_factpack':
          await processBuildFactpackStage(detail, provider)
          break
        case 'source_selection':
          return getWriterRunDetail(runID)
      }
    } catch (error) {
      await markStageFailed(runID, stageKey, error)
      throw error
    }

    detail = await getWriterRunDetail(runID)
  }
}

export async function createWriterRunAndStart(input: WriterRunInput, provider: WriterAutomationProvider) {
  const { run } = await createWriterRun(input)
  await updateWriterRun(run.id, {
    currentStage: 'discover_serp',
    errorMessage: null,
    status: 'discovering',
  })

  return processWriterRunAutomation(run.id, provider)
}

export async function selectWriterSourcesAndContinue(
  runID: WriterRelationshipID,
  sourceIDs: WriterRelationshipID[],
  provider?: WriterAutomationProvider,
) {
  await setWriterSelectedCompetitors(runID, sourceIDs)
  await Promise.all([
    upsertWriterStageExecution(runID, 'source_selection', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        selectedSourceIDs: sourceIDs,
      },
      status: 'completed',
    }),
    ensureAutomatedStageQueued(runID, 'convert_markdown', {
      selectedSourceIDs: sourceIDs,
    }),
    updateWriterRun(runID, {
      currentStage: 'convert_markdown',
      errorMessage: null,
      status: 'processing',
    }),
  ])

  if (provider) {
    return processWriterRunAutomation(runID, provider)
  }

  return getWriterRunDetail(runID)
}

export async function retryFailedWriterRun(runID: WriterRelationshipID, provider?: WriterAutomationProvider) {
  const detail = await getWriterRunDetail(runID)
  const stageKey = detail.run.currentStage

  if (!stageKey) {
    throw new Error('This AI Writer run has no current stage to retry.')
  }

  if (!writerAutomatedStageKeys.includes(stageKey as (typeof writerAutomatedStageKeys)[number])) {
    throw new Error(`Retry is only supported for automated stages. Current stage: ${stageKey}.`)
  }

  if (detail.run.status !== 'failed') {
    throw new Error('Only failed AI Writer runs can be retried.')
  }

  await Promise.all([
    upsertWriterStageExecution(runID, stageKey, {
      completedAt: null,
      errorText: null,
      startedAt: null,
      status: 'queued',
    }),
    updateWriterRun(runID, {
      automationHeartbeatAt: null,
      automationLeaseExpiresAt: null,
      automationLeaseOwner: null,
      automationLeaseToken: null,
      currentStage: stageKey,
      errorMessage: null,
      status: stageKey === 'discover_serp' ? 'discovering' : 'processing',
    }),
  ])

  if (provider) {
    return processWriterRunAutomation(runID, provider)
  }

  return getWriterRunDetail(runID)
}

export async function recoverRunningWriterStages(runID: WriterRelationshipID) {
  const stages = await listWriterStageExecutions(runID)

  await Promise.all(
    stages
      .filter((stage) => writerAutomatedStageKeys.includes(stage.stageKey as (typeof writerAutomatedStageKeys)[number]) && stage.status === 'running')
      .map((stage) =>
        upsertWriterStageExecution(runID, stage.stageKey, {
          errorText: null,
          startedAt: null,
          status: 'queued',
        }),
      ),
  )
}

export async function processNextQueuedWriterRun(provider: WriterAutomationProvider) {
  const claim = await claimNextQueuedWriterRun({
    leaseMs: AUTOMATION_LEASE_MS,
    workerId: schedulerState.workerId,
  })

  if (!claim) {
    return null
  }

  const stopHeartbeat = startHeartbeat(claim.runID, claim.leaseToken)

  try {
    await recoverRunningWriterStages(claim.runID)
    return await processWriterRunAutomation(claim.runID, provider)
  } finally {
    stopHeartbeat()
    await releaseWriterRunClaim(claim.runID, claim.leaseToken)
  }
}

export function bootstrapWriterAutomation(provider: WriterAutomationProvider) {
  if (schedulerState.bootstrapped) {
    return
  }

  schedulerState.bootstrapped = true

  const tick = () => {
    void processNextQueuedWriterRun(provider)
  }

  const timer = setInterval(tick, 5_000)
  timer.unref?.()
  tick()
}
