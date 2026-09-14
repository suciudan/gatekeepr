import { createWriterTraceEvent, updateWriterTraceEvent } from './repository'
import { requireAIWriterEnv } from './env'
import { describeAIWriterError } from './errors'
import {
  extractJsonFromResponseText,
  stripTrailingCommasFromJsonLikeText,
} from './anthropic'
import type {
  AIWriterGeneratedFile,
  AIWriterGeneratedFileValidationFailure,
  AIWriterInputFile,
  AIWriterTraceContext,
} from './providerTypes'

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'
const OPENAI_DEFAULT_MAX_TOKENS = 12_000

type OpenAIResponsePayload = {
  error?: {
    message?: string
  }
  output?: unknown[]
  output_text?: string
}

function openAIHeaders() {
  return {
    authorization: `Bearer ${requireAIWriterEnv('openaiApiKey')}`,
    'content-type': 'application/json',
  }
}

function contentByteSize(value: string) {
  return new TextEncoder().encode(value).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractTextFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractTextFromUnknown)
  }

  if (!isRecord(value)) {
    return []
  }

  const directText = pickString(value.text)

  if (directText && (value.type === 'output_text' || value.type === 'text' || value.type === 'message')) {
    return [directText]
  }

  return ['content', 'output', 'message'].flatMap((key) => extractTextFromUnknown(value[key]))
}

function extractOpenAIResponseText(payload: OpenAIResponsePayload) {
  const outputText = pickString(payload.output_text)

  if (outputText) {
    return outputText
  }

  return extractTextFromUnknown(payload.output).join('\n').trim()
}

function buildInlineInputFiles(inputFiles: AIWriterInputFile[] = []) {
  if (!inputFiles.length) {
    return ''
  }

  return [
    '',
    '<uploaded_input_files>',
    ...inputFiles.map((inputFile) =>
      [
        `<file name="${inputFile.filename}" mime_type="${inputFile.mimeType ?? 'text/plain'}">`,
        inputFile.content,
        '</file>',
      ].join('\n'),
    ),
    '</uploaded_input_files>',
  ].join('\n')
}

function buildOpenAITraceRequestPayload(input: {
  filename?: string
  inputFiles?: AIWriterInputFile[]
  maxTokens: number
  model: string
  prompt: string
  system: string
}) {
  return {
    filename: input.filename,
    inputFiles: input.inputFiles?.map((inputFile) => ({
      filename: inputFile.filename,
      mimeType: inputFile.mimeType ?? 'text/plain',
      sizeBytes: contentByteSize(inputFile.content),
    })),
    maxTokens: input.maxTokens,
    model: input.model,
    prompt: input.prompt,
    system: input.system,
  }
}

function buildOpenAITraceResponsePayload(input: {
  ok: boolean
  payload: OpenAIResponsePayload
  status: number
  text: string
}) {
  return {
    ok: input.ok,
    payload: input.payload,
    status: input.status,
    text: input.text,
  }
}

function toOpenAIError(error: unknown, fallback: string) {
  const message = describeAIWriterError(error, fallback)

  if (error instanceof Error && error.message === message) {
    return error
  }

  return new Error(message, {
    cause: error instanceof Error ? error : undefined,
  })
}

async function callOpenAITextRequest(
  input: {
    filename?: string
    inputFiles?: AIWriterInputFile[]
    maxTokens: number
    model?: string
    prompt: string
    system: string
  },
  trace?: AIWriterTraceContext,
) {
  const startedAt = new Date().toISOString()
  const model = input.model?.trim() || requireAIWriterEnv('openaiModel')
  const prompt = `${input.prompt}${buildInlineInputFiles(input.inputFiles)}`
  const traceRequestPayload = buildOpenAITraceRequestPayload({
    filename: input.filename,
    inputFiles: input.inputFiles,
    maxTokens: input.maxTokens,
    model,
    prompt: input.prompt,
    system: input.system,
  })
  const requestPayload = {
    input: prompt,
    instructions: input.system,
    max_output_tokens: input.maxTokens,
    model,
  }
  let traceEventID: null | number = null
  let traceFinished = false
  let lastPayload: OpenAIResponsePayload | null = null
  let lastStatus: null | number = null
  let lastText = ''

  if (trace) {
    const traceEvent = await createWriterTraceEvent({
      eventType: trace.eventType,
      provider: 'openai',
      requestPayload: traceRequestPayload,
      runID: trace.runID,
      sourceID: trace.sourceID,
      stageKey: trace.stageKey,
      startedAt,
      status: 'running',
    })

    traceEventID = traceEvent.id
  }

  try {
    const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
      body: JSON.stringify(requestPayload),
      cache: 'no-store',
      headers: openAIHeaders(),
      method: 'POST',
    })
    const payload = (await response.json().catch(() => ({}))) as OpenAIResponsePayload
    const text = extractOpenAIResponseText(payload)
    const completedAt = new Date().toISOString()
    const errorText = !response.ok ? payload.error?.message || `OpenAI request failed (${response.status})` : null

    lastPayload = payload
    lastStatus = response.status
    lastText = text

    if (trace && traceEventID != null) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt,
        errorText,
        responsePayload: buildOpenAITraceResponsePayload({
          ok: response.ok,
          payload,
          status: response.status,
          text,
        }),
        status: response.ok ? 'completed' : 'failed',
      })
      traceFinished = true
    }

    if (!response.ok) {
      throw new Error(errorText || `OpenAI request failed (${response.status})`)
    }

    if (!text) {
      throw new Error('OpenAI returned no text response.')
    }

    return text
  } catch (error) {
    const normalizedError = toOpenAIError(error, 'OpenAI request failed.')

    if (trace && traceEventID != null && !traceFinished) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        responsePayload:
          lastPayload || lastStatus != null
            ? buildOpenAITraceResponsePayload({
                ok: false,
                payload: lastPayload ?? {},
                status: lastStatus ?? 0,
                text: lastText,
              })
            : undefined,
        status: 'failed',
      })
    } else if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        eventType: trace.eventType,
        provider: 'openai',
        requestPayload: traceRequestPayload,
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'failed',
      })
    }

    throw normalizedError
  }
}

export async function callOpenAIText(
  input: {
    maxTokens?: number
    model?: string
    prompt: string
    system: string
  },
  trace?: AIWriterTraceContext,
) {
  return callOpenAITextRequest(
    {
      maxTokens: input.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
      model: input.model,
      prompt: input.prompt,
      system: input.system,
    },
    trace,
  )
}

export async function callOpenAIJson<T>(
  input: {
    filename?: string
    inputFiles?: AIWriterInputFile[]
    maxTokens?: number
    model?: string
    prompt: string
    system: string
  },
  trace?: AIWriterTraceContext,
) {
  const generated = await callOpenAIGeneratedFile(
    {
      filename: input.filename ?? 'output.json',
      inputFiles: input.inputFiles,
      maxTokens: input.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
      model: input.model,
      prompt: input.prompt,
      system: input.system,
    },
    trace,
  )
  const candidate = generated.file.content.trim()

  try {
    return JSON.parse(candidate) as T
  } catch {
    try {
      return JSON.parse(stripTrailingCommasFromJsonLikeText(extractJsonFromResponseText(candidate))) as T
    } catch {
      const repairedText = await repairOpenAIJson(candidate, trace, input.model)
      return JSON.parse(stripTrailingCommasFromJsonLikeText(extractJsonFromResponseText(repairedText.trim()))) as T
    }
  }
}

async function repairOpenAIJson(text: string, trace?: AIWriterTraceContext, model?: string) {
  const generated = await callOpenAIGeneratedFile(
    {
      filename: 'repaired.json',
      inputFiles: [
        {
          content: text,
          filename: 'malformed.json',
          mimeType: 'application/json',
        },
      ],
      maxTokens: OPENAI_DEFAULT_MAX_TOKENS,
      model,
      prompt:
        'Repair the uploaded malformed.json file and return valid JSON only. Preserve the original structure as closely as possible. Do not add commentary.',
      system: 'You repair malformed JSON. Return only valid JSON.',
    },
    trace
      ? {
          ...trace,
          eventType: `${trace.eventType}_repair`,
        }
      : undefined,
  )

  return generated.file.content
}

function buildGeneratedFilePrompt(prompt: string, filename: string) {
  const isJsonFile = filename.toLowerCase().endsWith('.json')

  return [
    'Provider note: this run is using ChatGPT through the OpenAI Responses API.',
    'You cannot create downloadable artifacts, write files, use bash_code_execution, use text_editor_code_execution, or use a container in this provider mode.',
    'Any instruction that says not to paste file contents into chat is Anthropic-specific and must be ignored.',
    'Any instruction to reply with a short confirmation like "Done" after creating a file is Anthropic-specific and must be ignored.',
    `Your entire response must be the complete contents of ${filename}.`,
    isJsonFile ? 'Because this file is JSON, the first non-whitespace character of your response must be "{" or "[".' : '',
    'Do not wrap the file in markdown fences. Do not add commentary before or after the file contents.',
    '',
    prompt,
  ].join('\n')
}

function validateOpenAIInlineGeneratedFile(filename: string, text: string): AIWriterGeneratedFileValidationFailure | null {
  const trimmed = text.trim()
  const normalized = trimmed.toLowerCase().replace(/[.!]+$/g, '')

  if (!trimmed) {
    return {
      reason: `OpenAI returned empty content for ${filename}.`,
      retryPrompt: `Return the complete contents of ${filename}.`,
    }
  }

  if (['done', 'created', 'complete', 'completed'].includes(normalized) || normalized.startsWith('done ')) {
    return {
      reason: `OpenAI returned a confirmation instead of ${filename} content.`,
      retryPrompt: [
        `Do not confirm that ${filename} was created.`,
        `Return the actual complete contents of ${filename} directly in this chat response.`,
        filename.toLowerCase().endsWith('.json') ? 'Return valid JSON only.' : '',
      ].join('\n'),
    }
  }

  if (filename.toLowerCase().endsWith('.json') && !trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('```')) {
    return {
      reason: `OpenAI did not return JSON content for ${filename}.`,
      retryPrompt: `Return valid JSON only for ${filename}. The first character must be "{" or "[".`,
    }
  }

  return null
}

export async function callOpenAIGeneratedFile(
  input: {
    filename: string
    inputFiles?: AIWriterInputFile[]
    maxTokens?: number
    model?: string
    prompt: string
    system: string
    validateFileContent?: (
      file: AIWriterGeneratedFile,
    ) => AIWriterGeneratedFileValidationFailure | null | Promise<AIWriterGeneratedFileValidationFailure | null>
  },
  trace?: AIWriterTraceContext,
): Promise<{ file: AIWriterGeneratedFile; text: string }> {
  let prompt = buildGeneratedFilePrompt(input.prompt, input.filename)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await callOpenAITextRequest(
      {
        filename: input.filename,
        inputFiles: input.inputFiles,
        maxTokens: input.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
        model: input.model,
        prompt,
        system: `${input.system}\n\nReturn the requested file contents directly as plain text.`,
      },
      trace,
    )
    const file = {
      content: text,
      downloadable: false,
      fileId: `inline:openai:${crypto.randomUUID()}`,
      filename: input.filename,
      mimeType: input.filename.endsWith('.json')
        ? 'application/json'
        : input.filename.endsWith('.md')
          ? 'text/markdown'
          : 'text/plain',
      provider: 'openai',
      sizeBytes: contentByteSize(text),
    } satisfies AIWriterGeneratedFile
    const builtInValidationFailure = validateOpenAIInlineGeneratedFile(input.filename, text)
    const validationFailure = builtInValidationFailure ?? (input.validateFileContent ? await input.validateFileContent(file) : null)

    if (!validationFailure) {
      return {
        file,
        text,
      }
    }

    if (!validationFailure.retryPrompt || attempt >= 1) {
      throw new Error(validationFailure.reason)
    }

    prompt = `${prompt}\n\nPrevious output was rejected: ${validationFailure.reason}\n\n${validationFailure.retryPrompt}`
  }

  throw new Error('OpenAI did not return a valid generated file.')
}

export async function downloadOpenAIFileText(fileId: string) {
  if (fileId.startsWith('inline:')) {
    throw new Error('Inline OpenAI files are stored in AI Writer artifacts and cannot be downloaded from OpenAI.')
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`, {
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${requireAIWriterEnv('openaiApiKey')}`,
    },
  })
  const content = await response.text()

  if (!response.ok) {
    throw new Error(content || `OpenAI file download failed (${response.status}).`)
  }

  return content
}
