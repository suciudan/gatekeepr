import type { Payload } from 'payload'

import {
  anthropicModelOptions,
  openAIModelOptions,
  type AIWriterProvider,
} from '@/globals/AIWriterSettings'
import { getCmsPayload } from '@/lib/payload'

import { getAIWriterEnv } from './env'

export type AIWriterModelSelection = {
  anthropicModel: string
  openaiModel: string
  provider: AIWriterProvider
}

function optionValue(options: readonly { value: string }[], fallback: string) {
  return options[0]?.value ?? fallback
}

function normalizeProvider(value: unknown): AIWriterProvider {
  return value === 'openai' ? 'openai' : 'anthropic'
}

function fallbackSelection(): AIWriterModelSelection {
  const env = getAIWriterEnv()

  return {
    anthropicModel: env.anthropicModel || optionValue(anthropicModelOptions, 'claude-sonnet-4-20250514'),
    openaiModel: optionValue(openAIModelOptions, 'gpt-5.5'),
    provider: 'anthropic',
  }
}

export async function getAIWriterModelSelection(payload?: Payload): Promise<AIWriterModelSelection> {
  const fallback = fallbackSelection()

  try {
    const cms = payload ?? await getCmsPayload()
    const settings = await cms.findGlobal({
      slug: 'ai-writer-settings',
    })

    return {
      anthropicModel: settings.anthropicModel || fallback.anthropicModel,
      openaiModel: settings.openaiModel || fallback.openaiModel,
      provider: normalizeProvider(settings.provider),
    }
  } catch {
    return fallback
  }
}
