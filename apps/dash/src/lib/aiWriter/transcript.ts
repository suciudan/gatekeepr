import type { WriterRunDetail, WriterSourceRecord, WriterTraceEventRecord } from './types'

const traceEventSuffixes = ['_inline_fallback', '_local_fallback', '_inline_repair', '_repair'] as const

export type WriterTranscriptTraceGroup = {
  anthropicTraces: WriterTraceEventRecord[]
  auxiliaryTraces: WriterTraceEventRecord[]
  baseEventType: string
  createdAt: string
  displayAt: string
  id: string
  primaryTrace: WriterTraceEventRecord
  promptTrace: null | WriterTraceEventRecord
  responseTrace: null | WriterTraceEventRecord
  source: null | WriterSourceRecord
  sourceID: null | WriterTraceEventRecord['sourceID']
  stageKey: null | WriterTraceEventRecord['stageKey']
  status: WriterTraceEventRecord['status']
  traces: WriterTraceEventRecord[]
  usedInlineFallback: boolean
  usedInlineRepair: boolean
  usedLocalFallback: boolean
}

export function getWriterTraceProviderLabel(provider: WriterTraceEventRecord['provider']) {
  if (provider === 'anthropic') {
    return 'Claude'
  }

  if (provider === 'openai') {
    return 'ChatGPT'
  }

  return provider
}

export function getWriterTranscriptGroupProviderLabel(group: Pick<WriterTranscriptTraceGroup, 'primaryTrace'>) {
  return getWriterTraceProviderLabel(group.primaryTrace.provider)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getTraceRequestPayload(trace: WriterTraceEventRecord) {
  return trace.requestPayload && isRecord(trace.requestPayload) ? trace.requestPayload : null
}

function getTraceResponsePayload(trace: WriterTraceEventRecord) {
  return trace.responsePayload && isRecord(trace.responsePayload) ? trace.responsePayload : null
}

function hasPromptContent(trace: WriterTraceEventRecord) {
  const requestPayload = getTraceRequestPayload(trace)

  return Boolean(
    pickString(requestPayload?.prompt) ||
      pickString(requestPayload?.promptPreview) ||
      pickString(requestPayload?.system) ||
      pickString(requestPayload?.systemPreview),
  )
}

function hasResponseContent(trace: WriterTraceEventRecord) {
  const responsePayload = getTraceResponsePayload(trace)

  if (Array.isArray(responsePayload?.contentBlocks)) {
    const hasTextBlock = responsePayload.contentBlocks.some((block) => {
      if (!isRecord(block)) {
        return false
      }

      return block.type === 'text' && pickString(block.text)
    })

    if (hasTextBlock) {
      return true
    }
  }

  return Boolean(pickString(responsePayload?.text) || pickString(responsePayload?.textPreview))
}

export function getTraceBaseEventType(eventType: string) {
  let baseEventType = eventType.trim()
  let changed = true

  while (changed) {
    changed = false

    for (const suffix of traceEventSuffixes) {
      if (baseEventType.endsWith(suffix)) {
        baseEventType = baseEventType.slice(0, -suffix.length)
        changed = true
      }
    }
  }

  return baseEventType
}

function deriveTranscriptGroupStatus(traces: WriterTraceEventRecord[]) {
  if (traces.some((trace) => trace.provider === 'local' && trace.status === 'completed')) {
    return 'completed' as const
  }

  if (traces.some((trace) => trace.status === 'completed')) {
    return 'completed' as const
  }

  if (traces.some((trace) => trace.status === 'running')) {
    return 'running' as const
  }

  if (traces.some((trace) => trace.status === 'failed')) {
    return 'failed' as const
  }

  return traces[traces.length - 1]?.status ?? 'completed'
}

function getTraceActivityTimestamp(trace: WriterTraceEventRecord) {
  return trace.completedAt || trace.updatedAt || trace.createdAt
}

export function groupWriterTranscriptTraces(
  detail: Pick<WriterRunDetail, 'sources' | 'traceEvents'>,
): WriterTranscriptTraceGroup[] {
  const sourceById = new Map(detail.sources.map((source) => [source.id, source] as const))
  const groupedTraces: WriterTraceEventRecord[][] = []
  const currentGroupByKey = new Map<string, WriterTraceEventRecord[]>()
  const traceEvents = [...detail.traceEvents]
    .filter((trace) => trace.provider === 'anthropic' || trace.provider === 'openai' || trace.provider === 'local')
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt)
      }

      return left.id - right.id
    })

  for (const trace of traceEvents) {
    const baseEventType = getTraceBaseEventType(trace.eventType)
    const key = `${trace.stageKey ?? 'runtime'}:${trace.sourceID ?? 'run'}:${baseEventType}`
    const existing = currentGroupByKey.get(key)
    const isRootAttemptTrace = trace.eventType === baseEventType

    if (existing && !(isRootAttemptTrace && existing.some((existingTrace) => existingTrace.eventType === baseEventType))) {
      existing.push(trace)
      continue
    }

    const nextGroup = [trace]
    groupedTraces.push(nextGroup)
    currentGroupByKey.set(key, nextGroup)
  }

  return groupedTraces
    .map((traces) => {
      const anthropicTraces = traces.filter((trace) => trace.provider === 'anthropic' || trace.provider === 'openai')

      if (!anthropicTraces.length) {
        return null
      }

      const primaryTrace =
        anthropicTraces.find((trace) => trace.eventType === getTraceBaseEventType(trace.eventType)) ?? anthropicTraces[0]

      if (!primaryTrace) {
        return null
      }

      const source = primaryTrace.sourceID != null ? sourceById.get(primaryTrace.sourceID) ?? null : null
      const promptTrace =
        anthropicTraces.find((trace) => trace.eventType === primaryTrace.eventType && hasPromptContent(trace)) ??
        anthropicTraces.find((trace) => hasPromptContent(trace)) ??
        null
      const responseTrace =
        [...anthropicTraces].reverse().find((trace) => hasResponseContent(trace)) ??
        [...anthropicTraces].reverse().find((trace) => Boolean(trace.responsePayload)) ??
        null
      const latestTrace = [...traces]
        .sort((left, right) => {
          const leftTimestamp = getTraceActivityTimestamp(left)
          const rightTimestamp = getTraceActivityTimestamp(right)

          if (leftTimestamp !== rightTimestamp) {
            return leftTimestamp.localeCompare(rightTimestamp)
          }

          return left.id - right.id
        })
        .at(-1)

      return {
        anthropicTraces,
        auxiliaryTraces: traces.filter((trace) => trace.provider !== 'anthropic' && trace.provider !== 'openai'),
        baseEventType: getTraceBaseEventType(primaryTrace.eventType),
        createdAt: traces[0]?.createdAt ?? primaryTrace.createdAt,
        displayAt: latestTrace ? getTraceActivityTimestamp(latestTrace) : getTraceActivityTimestamp(primaryTrace),
        id: `trace-group-${primaryTrace.stageKey ?? 'runtime'}-${primaryTrace.sourceID ?? 'run'}-${getTraceBaseEventType(primaryTrace.eventType)}-${primaryTrace.id}`,
        primaryTrace,
        promptTrace,
        responseTrace,
        source,
        sourceID: primaryTrace.sourceID,
        stageKey: primaryTrace.stageKey,
        status: deriveTranscriptGroupStatus(traces),
        traces,
        usedInlineFallback: traces.some((trace) => trace.eventType.includes('_inline_fallback')),
        usedInlineRepair: traces.some((trace) => trace.eventType.includes('_repair')),
        usedLocalFallback: traces.some((trace) => trace.eventType.includes('_local_fallback') || trace.provider === 'local'),
      } satisfies WriterTranscriptTraceGroup
    })
    .filter((group): group is WriterTranscriptTraceGroup => Boolean(group))
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt)
      }

      return left.primaryTrace.id - right.primaryTrace.id
    })
}
