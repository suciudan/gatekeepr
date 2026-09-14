import { describe, expect, it } from 'vitest'

import { getTraceBaseEventType, groupWriterTranscriptTraces } from '@/lib/aiWriter/transcript'
import { getDisplayableAnthropicToolSummaries } from '@/lib/aiWriter/transcriptDisplay'
import type { WriterSourceRecord, WriterTraceEventRecord } from '@/lib/aiWriter/types'

function buildSource(overrides: Partial<WriterSourceRecord> = {}): WriterSourceRecord {
  return {
    createdAt: '2026-04-25T16:00:00.000Z',
    fetchError: null,
    fetchStatus: 'completed',
    id: 145,
    metaDescription: null,
    normalizedUrl: 'https://example.com/source',
    role: 'competitor',
    runID: 19,
    selected: true,
    serpPosition: 6,
    snippet: 'Example source',
    title: 'Example source',
    updatedAt: '2026-04-25T16:00:00.000Z',
    url: 'https://example.com/source',
    ...overrides,
  }
}

function buildTrace(overrides: Partial<WriterTraceEventRecord> & Pick<WriterTraceEventRecord, 'eventType' | 'id'>): WriterTraceEventRecord {
  const { eventType, id, ...rest } = overrides

  return {
    completedAt: null,
    createdAt: '2026-04-25T16:00:00.000Z',
    errorText: null,
    eventType,
    id,
    provider: 'anthropic',
    requestPayload: null,
    responsePayload: null,
    runID: 19,
    sourceID: 145,
    stageKey: 'convert_markdown',
    startedAt: '2026-04-25T16:00:00.000Z',
    status: 'completed',
    updatedAt: '2026-04-25T16:00:00.000Z',
    ...rest,
  }
}

describe('ai writer transcript grouping', () => {
  it('groups fallback traces under a single conceptual transcript turn', () => {
    const source = buildSource()
    const groups = groupWriterTranscriptTraces({
      sources: [source],
      traceEvents: [
        buildTrace({
          createdAt: '2026-04-25T16:10:49.092Z',
          eventType: 'markdown_convert',
          id: 16628,
          requestPayload: {
            filename: 'article.md',
            prompt: 'Convert this article HTML into markdown.',
          },
        }),
        buildTrace({
          completedAt: '2026-04-25T16:10:51.940Z',
          createdAt: '2026-04-25T16:10:51.940Z',
          eventType: 'markdown_convert_inline_fallback',
          id: 16629,
          responsePayload: {
            text: '# Example article',
          },
        }),
        buildTrace({
          completedAt: '2026-04-25T16:12:38.322Z',
          createdAt: '2026-04-25T16:12:38.322Z',
          eventType: 'markdown_convert_local_fallback',
          id: 16634,
          provider: 'local',
          responsePayload: {
            preview: '# Example article',
          },
        }),
      ],
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.baseEventType).toBe('markdown_convert')
    expect(groups[0]?.promptTrace?.id).toBe(16628)
    expect(groups[0]?.responseTrace?.id).toBe(16629)
    expect(groups[0]?.usedInlineFallback).toBe(true)
    expect(groups[0]?.usedLocalFallback).toBe(true)
    expect(groups[0]?.status).toBe('completed')
  })

  it('keeps separate transcript turns for different selected sources', () => {
    const original = buildSource({
      id: 140,
      normalizedUrl: 'https://example.com/original',
      role: 'original',
      serpPosition: null,
      title: 'Original source',
      url: 'https://example.com/original',
    })
    const competitor = buildSource()
    const groups = groupWriterTranscriptTraces({
      sources: [original, competitor],
      traceEvents: [
        buildTrace({
          eventType: 'markdown_convert',
          id: 1,
          sourceID: original.id,
        }),
        buildTrace({
          createdAt: '2026-04-25T16:00:01.000Z',
          eventType: 'markdown_convert',
          id: 2,
          sourceID: competitor.id,
        }),
      ],
    })

    expect(groups).toHaveLength(2)
    expect(groups[0]?.source?.id).toBe(original.id)
    expect(groups[1]?.source?.id).toBe(competitor.id)
  })

  it('creates separate transcript turns for repeated attempts of the same stage event', () => {
    const groups = groupWriterTranscriptTraces({
      sources: [],
      traceEvents: [
        buildTrace({
          completedAt: null,
          createdAt: '2026-04-25T20:12:19.785Z',
          errorText: 'container: Input should be a valid string',
          eventType: 'brief_validate',
          id: 16791,
          sourceID: null,
          stageKey: 'validate',
          status: 'failed',
        }),
        buildTrace({
          completedAt: '2026-04-25T20:16:18.007Z',
          createdAt: '2026-04-25T20:16:18.007Z',
          errorText: 'container: Input should be a valid string',
          eventType: 'validate_failed',
          id: 16796,
          provider: 'local',
          sourceID: null,
          stageKey: 'validate',
          status: 'failed',
        }),
        buildTrace({
          completedAt: null,
          createdAt: '2026-04-25T20:22:36.160Z',
          errorText: 'Anthropic did not create the expected output file ValidationOutput.json.',
          eventType: 'brief_validate',
          id: 16797,
          sourceID: null,
          stageKey: 'validate',
          status: 'failed',
        }),
        buildTrace({
          completedAt: '2026-04-25T20:26:24.177Z',
          createdAt: '2026-04-25T20:26:24.177Z',
          errorText: 'Anthropic did not create the expected output file ValidationOutput.json.',
          eventType: 'validate_failed',
          id: 16798,
          provider: 'local',
          sourceID: null,
          stageKey: 'validate',
          status: 'failed',
        }),
      ],
    })

    const briefValidateGroups = groups.filter((group) => group.baseEventType === 'brief_validate')
    expect(briefValidateGroups).toHaveLength(2)
    expect(briefValidateGroups[0]?.traces.map((trace) => trace.id)).toEqual([16791])
    expect(briefValidateGroups[1]?.traces.map((trace) => trace.id)).toEqual([16797])
  })

  it('uses updatedAt as the display time for running transcript groups', () => {
    const groups = groupWriterTranscriptTraces({
      sources: [],
      traceEvents: [
        buildTrace({
          createdAt: '2026-04-26T19:09:50.000Z',
          eventType: 'article_write',
          id: 20001,
          sourceID: null,
          stageKey: 'write',
          status: 'running',
          updatedAt: '2026-04-26T19:28:00.000Z',
        }),
      ],
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.status).toBe('running')
    expect(groups[0]?.displayAt).toBe('2026-04-26T19:28:00.000Z')
  })

  it('keeps useful tool output and drops empty tool activity placeholders', () => {
    const longStdout = `Found article.md\n${'x'.repeat(480)}`
    const summaries = getDisplayableAnthropicToolSummaries([
      {
        text: 'I will write the file now.',
        type: 'text',
      },
      {
        id: 'srvtoolu_empty',
        name: 'code_execution',
        type: 'server_tool_use',
      },
      {
        content: {
          return_code: 0,
          stderr: '',
          stdout: longStdout,
          type: 'code_execution_result',
        },
        type: 'code_execution_tool_result',
      },
    ])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.label).toBe('code execution tool result')
    expect(summaries[0]?.details).toContain('Return code: 0')
    expect(summaries[0]?.details).toContain(longStdout)
  })

  it('normalizes nested fallback and repair suffixes back to the base event type', () => {
    expect(getTraceBaseEventType('blocks_extract_inline_repair_repair')).toBe('blocks_extract')
    expect(getTraceBaseEventType('brief_generate_inline_fallback')).toBe('brief_generate')
  })
})
