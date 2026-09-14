import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { createWriterRunAndStart, selectWriterSourcesAndContinue, type WriterAutomationProvider } from '@/lib/aiWriter/engine'
import { getWriterRunDetail } from '@/lib/aiWriter/repository'
import { getCmsPayload } from '@/lib/payload'

let payload: Payload

type FetchReadableArticleInput = Parameters<WriterAutomationProvider['fetchReadableArticle']>[0]
type FetchReadableArticleResult = Awaited<ReturnType<WriterAutomationProvider['fetchReadableArticle']>>
type ConvertArticleToMarkdownInput = Parameters<WriterAutomationProvider['convertArticleToMarkdown']>[0]
type ConvertArticleToMarkdownResult = Awaited<ReturnType<WriterAutomationProvider['convertArticleToMarkdown']>>
type ConvertMarkdownToBlocksInput = Parameters<WriterAutomationProvider['convertMarkdownToBlocks']>[0]
type ConvertMarkdownToBlocksResult = Awaited<ReturnType<WriterAutomationProvider['convertMarkdownToBlocks']>>

type Deferred<TValue> = {
  promise: Promise<TValue>
  reject: (reason?: unknown) => void
  resolve: (value: TValue | PromiseLike<TValue>) => void
}

type ControlledCall<TInput, TResult> = {
  deferred: Deferred<TResult>
  input: TInput
  settled: boolean
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolve!: Deferred<TValue>['resolve']
  let reject!: Deferred<TValue>['reject']
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function createControlledQueue<TInput, TResult>() {
  const calls: ControlledCall<TInput, TResult>[] = []
  let inFlight = 0
  let maxInFlight = 0

  return {
    calls,
    get maxInFlight() {
      return maxInFlight
    },
    async handler(input: TInput) {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)

      const deferred = createDeferred<TResult>()
      const call: ControlledCall<TInput, TResult> = {
        deferred,
        input,
        settled: false,
      }

      calls.push(call)

      try {
        return await deferred.promise
      } finally {
        inFlight -= 1
      }
    },
  }
}

function resolvePendingCalls<TInput, TResult>(
  calls: ControlledCall<TInput, TResult>[],
  buildResult: (input: TInput) => TResult,
  startIndex = 0,
) {
  for (const call of calls.slice(startIndex)) {
    if (call.settled) {
      continue
    }

    call.settled = true
    call.deferred.resolve(buildResult(call.input))
  }
}

function rejectCall<TInput, TResult>(call: ControlledCall<TInput, TResult>, error: Error) {
  if (call.settled) {
    return
  }

  call.settled = true
  call.deferred.reject(error)
}

async function waitForCondition(assertion: () => void | Promise<void>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for test condition')
}

function buildCompetitorResults(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1
    const url = `https://example.com/${prefix}-competitor-${id}`

    return {
      normalizedUrl: url,
      position: id,
      snippet: `Competitor ${id}`,
      title: `Competitor ${id}`,
      url,
    }
  })
}

function buildReadableArticle(source: FetchReadableArticleInput['source']): FetchReadableArticleResult {
  return {
    html: `<article><h1>${source.title ?? 'Article'}</h1><p>Readable content for ${source.url}.</p></article>`,
    title: source.title ?? `Readable ${source.id}`,
  }
}

function buildMarkdownResult(input: ConvertArticleToMarkdownInput): ConvertArticleToMarkdownResult {
  return {
    markdown: `# ${input.article.title}\n\nContent for ${input.source.url}.`,
    raw: {
      title: input.article.title,
    },
  }
}

function buildBlocksResult(input: ConvertMarkdownToBlocksInput): ConvertMarkdownToBlocksResult {
  return {
    blocks: [
      {
        block_id: `${input.source.id}-1`,
        heading: 'Overview',
        kind: 'paragraph',
        markdown: input.markdown,
        order: 1,
        plain_text: input.markdown.replace(/[#\n]/g, ' ').trim(),
        word_count: input.markdown.split(/\s+/).filter(Boolean).length,
      },
    ],
    raw: {
      ok: true,
    },
  }
}

async function deleteRunsMatchingKeyword(keywordFragment: string) {
  const existingRuns = await payload.find({
    collection: 'writer-runs',
    depth: 0,
    limit: 100,
    page: 1,
    pagination: false,
    where: {
      targetKeyword: {
        contains: keywordFragment,
      },
    },
  })

  for (const run of existingRuns.docs) {
    await payload.delete({
      collection: 'writer-runs',
      id: run.id,
    })
  }
}

const provider: WriterAutomationProvider = {
  async buildFactpack({ sources }) {
    return {
      factpack: {
        claims: sources.map((source) => ({
          source: source.source.url,
          summary: source.blocks[0]?.plain_text ?? '',
        })),
      },
      markdown: '# Factpack\n\n- Built from test provider',
      raw: {
        sourceCount: sources.length,
      },
    }
  },
  async convertArticleToMarkdown({ article, source }) {
    return {
      markdown: `# ${article.title}\n\nContent for ${source.url}.`,
      raw: {
        title: article.title,
      },
    }
  },
  async convertMarkdownToBlocks({ markdown, source }) {
    return {
      blocks: [
        {
          block_id: `${source.id}-1`,
          heading: 'Overview',
          kind: 'paragraph',
          markdown,
          order: 1,
          plain_text: markdown.replace(/[#\n]/g, ' ').trim(),
          word_count: markdown.split(/\s+/).filter(Boolean).length,
        },
      ],
      raw: {
        ok: true,
      },
    }
  },
  async fetchReadableArticle({ source }) {
    return {
      html: `<article><h1>${source.title ?? 'Article'}</h1><p>Readable content for ${source.url}.</p></article>`,
      title: source.title ?? `Readable ${source.id}`,
    }
  },
  async searchKeyword({ run }) {
    return {
      raw: {
        query: run.targetKeyword,
      },
      results: [
        {
          normalizedUrl: 'https://example.com/competitor-one',
          position: 1,
          snippet: 'Competitor one',
          title: 'Competitor One',
          url: 'https://example.com/competitor-one',
        },
        {
          normalizedUrl: 'https://example.com/competitor-two',
          position: 2,
          snippet: 'Competitor two',
          title: 'Competitor Two',
          url: 'https://example.com/competitor-two',
        },
      ],
    }
  },
}

describe('ai writer engine', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    for (const keywordFragment of ['WSA 196', 'WSA 197', 'WSA 198']) {
      await deleteRunsMatchingKeyword(keywordFragment)
    }
  })

  it('processes automated stages through source selection and factpack generation', async () => {
    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-196-source',
        targetKeyword: 'WSA 196 workflow engine',
      },
      provider,
    )

    expect(discovered.run.status).toBe('awaiting_selection')
    expect(discovered.run.currentStage).toBe('source_selection')
    expect(discovered.sources.filter((source) => source.role === 'competitor')).toHaveLength(2)
    expect(discovered.stages.find((stage) => stage.stageKey === 'discover_serp')?.status).toBe('completed')
    expect(discovered.stages.find((stage) => stage.stageKey === 'source_selection')?.status).toBe('awaiting_user')

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const processed = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    expect(processed.run.status).toBe('awaiting_user')
    expect(processed.run.currentStage).toBe('brief')
    expect(processed.stages.find((stage) => stage.stageKey === 'build_factpack')?.status).toBe('completed')
    expect(processed.stages.find((stage) => stage.stageKey === 'brief')?.status).toBe('awaiting_user')
    expect(processed.run.originalWordCount).toBeGreaterThan(0)
    expect(processed.run.targetWordCount).toBeGreaterThanOrEqual(processed.run.originalWordCount)

    const refreshed = await getWriterRunDetail(discovered.run.id)
    const markdownArtifacts = refreshed.artifacts.filter((artifact) => artifact.artifactType === 'markdown')
    const blockArtifacts = refreshed.artifacts.filter((artifact) => artifact.artifactType === 'blocks')
    const factpackArtifact = refreshed.artifacts.find((artifact) => artifact.artifactType === 'factpack_json')

    expect(markdownArtifacts).toHaveLength(2)
    expect(blockArtifacts).toHaveLength(2)
    expect(factpackArtifact?.content).toContain('competitor-one')
  })

  it('uses the corrected keyword when the submitted keyword and source url are swapped', async () => {
    const searchedKeywords: string[] = []
    const swapAwareProvider: WriterAutomationProvider = {
      ...provider,
      async searchKeyword({ run }) {
        searchedKeywords.push(run.targetKeyword)

        return {
          raw: {
            query: run.targetKeyword,
          },
          results: [],
        }
      },
    }

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'WSA 196 swapped keyword',
        targetKeyword: 'https://example.com/wsa-196-swapped-source',
      },
      swapAwareProvider,
    )

    expect(searchedKeywords).toEqual(['WSA 196 swapped keyword'])
    expect(discovered.run.sourceUrl).toBe('https://example.com/wsa-196-swapped-source')
    expect(discovered.run.targetKeyword).toBe('WSA 196 swapped keyword')
  })

  it('fans out source processing with a shared concurrency cap of 5 per stage', async () => {
    const fetchQueue = createControlledQueue<FetchReadableArticleInput, FetchReadableArticleResult>()
    const markdownQueue = createControlledQueue<ConvertArticleToMarkdownInput, ConvertArticleToMarkdownResult>()
    const blocksQueue = createControlledQueue<ConvertMarkdownToBlocksInput, ConvertMarkdownToBlocksResult>()

    const concurrencyProvider: WriterAutomationProvider = {
      async buildFactpack({ sources }) {
        return {
          factpack: {
            claims: sources.map((source) => ({
              source: source.source.url,
              summary: source.blocks[0]?.plain_text ?? '',
            })),
          },
          markdown: '# Factpack\n\n- Built from concurrency test provider',
          raw: {
            sourceCount: sources.length,
          },
        }
      },
      async convertArticleToMarkdown(input) {
        return markdownQueue.handler(input)
      },
      async convertMarkdownToBlocks(input) {
        return blocksQueue.handler(input)
      },
      async fetchReadableArticle(input) {
        return fetchQueue.handler(input)
      },
      async searchKeyword() {
        return {
          raw: {
            query: 'WSA 197 concurrency fanout',
          },
          results: buildCompetitorResults('wsa-197', 6),
        }
      },
    }

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-197-source',
        targetKeyword: 'WSA 197 concurrency fanout',
      },
      concurrencyProvider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .map((source) => source.id)
    const totalSources = selectedCompetitorIDs.length + 1
    const processingPromise = selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, concurrencyProvider)

    await waitForCondition(() => {
      expect(fetchQueue.calls).toHaveLength(5)
      expect(fetchQueue.maxInFlight).toBe(5)
    })
    resolvePendingCalls(fetchQueue.calls, ({ source }) => buildReadableArticle(source))

    await waitForCondition(() => {
      expect(markdownQueue.calls).toHaveLength(5)
      expect(markdownQueue.maxInFlight).toBe(5)
    })
    resolvePendingCalls(markdownQueue.calls, buildMarkdownResult)

    await waitForCondition(() => {
      expect(fetchQueue.calls).toHaveLength(totalSources)
    })
    resolvePendingCalls(fetchQueue.calls, ({ source }) => buildReadableArticle(source), 5)

    await waitForCondition(() => {
      expect(markdownQueue.calls).toHaveLength(totalSources)
    })
    resolvePendingCalls(markdownQueue.calls, buildMarkdownResult, 5)

    await waitForCondition(() => {
      expect(blocksQueue.calls).toHaveLength(5)
      expect(blocksQueue.maxInFlight).toBe(5)
    })
    resolvePendingCalls(blocksQueue.calls, buildBlocksResult)

    await waitForCondition(() => {
      expect(blocksQueue.calls).toHaveLength(totalSources)
    })
    resolvePendingCalls(blocksQueue.calls, buildBlocksResult, 5)

    const processed = await processingPromise
    const refreshed = await getWriterRunDetail(discovered.run.id)

    expect(processed.run.status).toBe('awaiting_user')
    expect(processed.run.currentStage).toBe('brief')
    expect(refreshed.artifacts.filter((artifact) => artifact.artifactType === 'markdown')).toHaveLength(totalSources)
    expect(refreshed.artifacts.filter((artifact) => artifact.artifactType === 'blocks')).toHaveLength(totalSources)
  })

  it('fails the stage on source errors and stops launching queued source work after the failure is observed', async () => {
    const fetchQueue = createControlledQueue<FetchReadableArticleInput, FetchReadableArticleResult>()
    const failureProvider: WriterAutomationProvider = {
      async buildFactpack() {
        return {
          factpack: {
            claims: [],
          },
          markdown: '# Factpack',
          raw: {
            sourceCount: 0,
          },
        }
      },
      async convertArticleToMarkdown(input) {
        return buildMarkdownResult(input)
      },
      async convertMarkdownToBlocks(input) {
        return buildBlocksResult(input)
      },
      async fetchReadableArticle(input) {
        return fetchQueue.handler(input)
      },
      async searchKeyword() {
        return {
          raw: {
            query: 'WSA 198 source failure',
          },
          results: buildCompetitorResults('wsa-198', 6),
        }
      },
    }

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-198-source',
        targetKeyword: 'WSA 198 source failure',
      },
      failureProvider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .map((source) => source.id)
    const processingPromise = selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, failureProvider)

    await waitForCondition(() => {
      expect(fetchQueue.calls).toHaveLength(5)
      expect(fetchQueue.maxInFlight).toBe(5)
    })

    rejectCall(fetchQueue.calls[0], new Error('Readable fetch failed'))
    resolvePendingCalls(fetchQueue.calls, ({ source }) => buildReadableArticle(source), 1)

    await expect(processingPromise).rejects.toThrow('Readable fetch failed')

    await waitForCondition(async () => {
      const refreshed = await getWriterRunDetail(discovered.run.id)

      expect(fetchQueue.calls).toHaveLength(5)
      expect(refreshed.run.status).toBe('failed')
      expect(refreshed.run.currentStage).toBe('convert_markdown')
      expect(refreshed.stages.find((stage) => stage.stageKey === 'convert_markdown')?.status).toBe('failed')
      expect(refreshed.artifacts.filter((artifact) => artifact.artifactType === 'raw_html')).toHaveLength(4)
      expect(refreshed.artifacts.filter((artifact) => artifact.artifactType === 'markdown')).toHaveLength(4)
    })
  }, 15_000)
})
