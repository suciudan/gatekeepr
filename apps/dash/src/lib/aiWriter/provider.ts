import {
  callAnthropicGeneratedFile,
  callAnthropicJson,
  callAnthropicText,
  downloadAnthropicFileText,
  extractJsonFromResponseText,
  stripTrailingCommasFromJsonLikeText,
} from './anthropic'
import {
  callOpenAIGeneratedFile,
  callOpenAIJson,
  callOpenAIText,
  downloadOpenAIFileText,
} from './openai'
import { resolveOpenAIModel } from './openaiModels'
import { getAIWriterModelSelection } from './settings'
import type {
  AIWriterGeneratedFile,
  AIWriterGeneratedFileValidationFailure,
  AIWriterInputFile,
  AIWriterTraceContext,
} from './providerTypes'

export {
  extractJsonFromResponseText,
  stripTrailingCommasFromJsonLikeText,
  type AIWriterGeneratedFile,
  type AIWriterGeneratedFileValidationFailure,
  type AIWriterInputFile,
}

export async function callAIWriterText(
  input: {
    maxTokens?: number
    prompt: string
    system: string
  },
  trace?: AIWriterTraceContext,
) {
  const selection = await getAIWriterModelSelection()

  if (selection.provider === 'openai') {
    const model = await resolveOpenAIModel(selection.openaiModel)

    return callOpenAIText(
      {
        ...input,
        model,
      },
      trace,
    )
  }

  return callAnthropicText(
    {
      ...input,
      model: selection.anthropicModel,
    },
    trace,
  )
}

export async function callAIWriterJson<T>(
  input: {
    filename?: string
    inputFiles?: AIWriterInputFile[]
    maxTokens?: number
    prompt: string
    system: string
  },
  trace?: AIWriterTraceContext,
) {
  const selection = await getAIWriterModelSelection()

  if (selection.provider === 'openai') {
    const model = await resolveOpenAIModel(selection.openaiModel)

    return callOpenAIJson<T>(
      {
        ...input,
        model,
      },
      trace,
    )
  }

  return callAnthropicJson<T>(
    {
      ...input,
      model: selection.anthropicModel,
    },
    trace,
  )
}

export async function callAIWriterGeneratedFile(
  input: {
    filename: string
    inputFiles?: AIWriterInputFile[]
    maxTokens?: number
    prompt: string
    system: string
    validateFileContent?: (
      file: AIWriterGeneratedFile,
    ) => AIWriterGeneratedFileValidationFailure | null | Promise<AIWriterGeneratedFileValidationFailure | null>
  },
  trace?: AIWriterTraceContext,
) {
  const selection = await getAIWriterModelSelection()

  if (selection.provider === 'openai') {
    const model = await resolveOpenAIModel(selection.openaiModel)

    return callOpenAIGeneratedFile(
      {
        ...input,
        model,
      },
      trace,
    )
  }

  return callAnthropicGeneratedFile(
    {
      ...input,
      model: selection.anthropicModel,
    },
    trace,
  )
}

export async function downloadAIWriterRemoteFileText(provider: string, fileId: string) {
  if (provider === 'anthropic') {
    return downloadAnthropicFileText(fileId)
  }

  if (provider === 'openai') {
    return downloadOpenAIFileText(fileId)
  }

  throw new Error(`Remote file provider is not supported: ${provider}`)
}
