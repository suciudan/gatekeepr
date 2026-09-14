import { openAIModelOptions } from '@/globals/AIWriterSettings'

import { getAIWriterEnv, requireAIWriterEnv } from './env'

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'
const OPENAI_MODEL_CACHE_MS = 5 * 60 * 1000

type OpenAIModelListResponse = {
  data?: Array<{
    id?: string
  }>
  error?: {
    message?: string
  }
}

type OpenAIModelCache = {
  expiresAt: number
  modelIds: string[]
}

let modelCache: OpenAIModelCache | null = null

function openAIAuthHeaders() {
  return {
    authorization: `Bearer ${requireAIWriterEnv('openaiApiKey')}`,
  }
}

function uniqueModelIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return ''
          }

          const id = (entry as { id?: unknown }).id
          return typeof id === 'string' ? id.trim() : ''
        })
        .filter(Boolean),
    ),
  ]
}

function isEligibleAIWriterOpenAIModel(modelId: string) {
  const normalized = modelId.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  if (
    normalized.includes('audio') ||
    normalized.includes('embedding') ||
    normalized.includes('image') ||
    normalized.includes('moderation') ||
    normalized.includes('realtime') ||
    normalized.includes('search-preview') ||
    normalized.includes('tts') ||
    normalized.includes('transcribe') ||
    normalized.includes('whisper')
  ) {
    return false
  }

  return normalized.startsWith('gpt-') || normalized.startsWith('o')
}

export async function listOpenAIModelIds() {
  const now = Date.now()

  if (modelCache && modelCache.expiresAt > now) {
    return modelCache.modelIds
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/models`, {
    cache: 'no-store',
    headers: openAIAuthHeaders(),
  })
  const payload = (await response.json().catch(() => ({}))) as OpenAIModelListResponse

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI model list request failed (${response.status}).`)
  }

  const modelIds = uniqueModelIds(payload.data).filter(isEligibleAIWriterOpenAIModel)

  modelCache = {
    expiresAt: now + OPENAI_MODEL_CACHE_MS,
    modelIds,
  }

  return modelIds
}

export async function resolveOpenAIModel(preferredModel?: string) {
  const envModel = getAIWriterEnv().openaiModel

  if (envModel) {
    return envModel
  }

  const visibleModelIds = await listOpenAIModelIds()
  const visibleModels = new Set(visibleModelIds)
  const preferred = preferredModel?.trim()

  if (preferred && visibleModels.has(preferred)) {
    return preferred
  }

  for (const option of openAIModelOptions) {
    if (visibleModels.has(option.value)) {
      return option.value
    }
  }

  const fallback = visibleModelIds.find((modelId) => modelId.startsWith('gpt-')) ?? visibleModelIds[0]

  if (!fallback) {
    throw new Error('No eligible OpenAI text models are available for this account.')
  }

  return fallback
}

export function clearOpenAIModelCacheForTests() {
  modelCache = null
}
