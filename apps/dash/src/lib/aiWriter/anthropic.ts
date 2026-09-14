import { createWriterTraceEvent, updateWriterTraceEvent } from './repository'
import { requireAIWriterEnv } from './env'
import { describeAIWriterError } from './errors'
import type {
  AIWriterGeneratedFile,
  AIWriterGeneratedFileValidationFailure,
  AIWriterInputFile,
  AIWriterTraceContext,
} from './providerTypes'
import type { WriterRelationshipID, WriterStageKey } from './types'

const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com/v1'
const ANTHROPIC_FILES_API_BETA = 'files-api-2025-04-14'
const ANTHROPIC_CODE_EXECUTION_API_BETA = 'code-execution-2025-08-25'
const ANTHROPIC_CODE_EXECUTION_TOOL_TYPE = 'code_execution_20250825'
const ANTHROPIC_CONTEXT_WINDOW_TOKENS = 1_000_000
const ANTHROPIC_DEFAULT_MAX_TOKENS = 12_000
const ANTHROPIC_OUTPUT_EFFORT = 'xhigh'
const ANTHROPIC_FETCH_RETRY_COUNT = 1

type TraceContext = AIWriterTraceContext

type AnthropicContentBlock = {
  content?: unknown
  id?: string
  input?: unknown
  name?: string
  text?: string
  type?: string
}

type AnthropicResponse = {
  container?: {
    id?: string
  }
  content?: AnthropicContentBlock[]
  error?: {
    message?: string
  }
  stop_reason?: string
}

type AnthropicFileMetadata = {
  downloadable?: boolean
  filename?: string
  id?: string
  mime_type?: string
  size_bytes?: number
  type?: string
}

type AnthropicFileDeleteResponse = {
  id?: string
  type?: string
}

export type AnthropicGeneratedFile = AIWriterGeneratedFile

export type AnthropicInputFile = AIWriterInputFile

type AnthropicGeneratedFileValidationFailure = AIWriterGeneratedFileValidationFailure

type UploadedAnthropicInputFile = AnthropicInputFile & {
  fileId: string
  mimeType: string
  sizeBytes: number
}

type AnthropicStreamReadResult = {
  fileIds: string[]
  payload: AnthropicResponse
  text: string
}

type AnthropicMessagesResult = {
  containerId: null | string
  contentBlocks: AnthropicContentBlock[]
  fileIds: string[]
  payload: AnthropicResponse
  response: Response
  stopReason: null | string
  text: string
}

function contentByteSize(value: string) {
  return new TextEncoder().encode(value).length
}

function stripCodeFences(value: string) {
  const trimmed = value.trim()

  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  return trimmed
    .replace(/^```[a-z0-9_-]*\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

export function extractJsonFromResponseText(value: string) {
  const stripped = stripCodeFences(value)
  const objectStart = stripped.indexOf('{')
  const arrayStart = stripped.indexOf('[')
  const start = [objectStart, arrayStart].filter((position) => position >= 0).sort((left, right) => left - right)[0]

  if (start == null) {
    throw new Error('Model did not return JSON content.')
  }

  const candidate = stripped.slice(start)
  const objectEnd = candidate.lastIndexOf('}')
  const arrayEnd = candidate.lastIndexOf(']')
  const end = Math.max(objectEnd, arrayEnd)

  if (end < 0) {
    throw new Error('Model returned truncated JSON content.')
  }

  return candidate.slice(0, end + 1)
}

export function stripTrailingCommasFromJsonLikeText(value: string) {
  return value.replace(/,\s*([}\]])/g, '$1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function pickString(value: unknown) {
  return stringValue(value).trim()
}

function anthropicHeaders(options?: { betaHeaders?: string[]; contentType?: string; includeFilesBeta?: boolean }) {
  const headers: Record<string, string> = {
    'anthropic-version': requireAIWriterEnv('anthropicVersion'),
    'x-api-key': requireAIWriterEnv('anthropicApiKey'),
  }

  if (options?.contentType) {
    headers['content-type'] = options.contentType
  }

  const betaHeaders = new Set<string>()

  if (options?.includeFilesBeta) {
    betaHeaders.add(ANTHROPIC_FILES_API_BETA)
  }

  for (const betaHeader of options?.betaHeaders ?? []) {
    const normalized = betaHeader.trim()

    if (normalized) {
      betaHeaders.add(normalized)
    }
  }

  if (betaHeaders.size > 0) {
    headers['anthropic-beta'] = [...betaHeaders].join(',')
  }

  return headers
}

function anthropicMessagesRequestDefaults(model?: string) {
  return {
    model: model?.trim() || requireAIWriterEnv('anthropicModel'),
    output_config: {
      effort: ANTHROPIC_OUTPUT_EFFORT,
    },
    thinking: {
      type: 'adaptive',
    },
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableAnthropicFetchError(error: unknown) {
  const message = error instanceof Error ? error.message.trim().toLowerCase() : ''

  if (message === 'fetch failed' || message === 'network request failed' || message === 'failed to fetch') {
    return true
  }

  const code = error instanceof Error ? String((error as Error & { code?: unknown }).code ?? '').trim().toUpperCase() : ''
  const causeCode =
    error instanceof Error && (error as Error & { cause?: unknown }).cause
      ? String(((error as Error & { cause?: Record<string, unknown> }).cause as Record<string, unknown>).code ?? '')
          .trim()
          .toUpperCase()
      : ''

  return [code, causeCode].some((value) =>
    ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(value),
  )
}

async function fetchAnthropic(url: string, init: RequestInit) {
  let attempt = 0

  while (true) {
    try {
      return await fetch(url, init)
    } catch (error) {
      if (!isRetryableAnthropicFetchError(error) || attempt >= ANTHROPIC_FETCH_RETRY_COUNT) {
        throw error
      }

      attempt += 1
      await delay(250 * attempt)
    }
  }
}

function parseAnthropicJsonLikeValue(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    try {
      return JSON.parse(stripTrailingCommasFromJsonLikeText(value)) as unknown
    } catch {
      return undefined
    }
  }
}

function normalizeAnthropicContentBlock(value: unknown): AnthropicContentBlock | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    content: value.content,
    id: pickString(value.id) || undefined,
    input: value.input,
    name: pickString(value.name) || undefined,
    text: stringValue(value.text) || undefined,
    type: pickString(value.type) || undefined,
  }
}

function extractAnthropicContainerId(value: unknown) {
  if (!isRecord(value)) {
    return ''
  }

  const directContainer = isRecord(value.container) ? pickString(value.container.id) : ''

  if (directContainer) {
    return directContainer
  }

  const message = isRecord(value.message) ? value.message : null
  return message && isRecord(message.container) ? pickString(message.container.id) : ''
}

function parseAnthropicSseChunk(chunk: string) {
  const lines = chunk.split('\n')
  let eventType = ''
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  return {
    data: dataLines.join('\n'),
    eventType,
  }
}

function applyAnthropicStreamEvent(
  state: {
    containerId: null | string
    contentBlocks: AnthropicContentBlock[]
    stopReason: null | string
  },
  eventPayload: unknown,
  partialInputByIndex: Map<number, string>,
) {
  if (!isRecord(eventPayload)) {
    return false
  }

  const eventContainerId = extractAnthropicContainerId(eventPayload)

  if (eventContainerId) {
    state.containerId = eventContainerId
  }

  const eventType = pickString(eventPayload.type)

  if (eventType === 'error') {
    const errorMessage = isRecord(eventPayload.error) ? pickString(eventPayload.error.message) : ''
    throw new Error(errorMessage || 'Anthropic stream failed.')
  }

  if (eventType === 'message_start') {
    const message = isRecord(eventPayload.message) ? eventPayload.message : null
    const content = Array.isArray(message?.content)
      ? message.content.map((entry) => normalizeAnthropicContentBlock(entry)).filter((entry): entry is AnthropicContentBlock => Boolean(entry))
      : []

    if (content.length > 0) {
      state.contentBlocks = content
    }

    const stopReason = message ? pickString(message.stop_reason) : ''

    if (stopReason) {
      state.stopReason = stopReason
    }

    return content.length > 0 || Boolean(eventContainerId) || Boolean(stopReason)
  }

  if (eventType === 'content_block_start') {
    const index = typeof eventPayload.index === 'number' ? eventPayload.index : -1
    const contentBlock = normalizeAnthropicContentBlock(eventPayload.content_block)

    if (index < 0 || !contentBlock) {
      return false
    }

    state.contentBlocks[index] = contentBlock
    return true
  }

  if (eventType === 'content_block_delta') {
    const index = typeof eventPayload.index === 'number' ? eventPayload.index : -1
    const delta = isRecord(eventPayload.delta) ? eventPayload.delta : null

    if (index < 0 || !delta) {
      return false
    }

    const block = state.contentBlocks[index] ?? {}
    const deltaType = pickString(delta.type)

    if (deltaType === 'text_delta') {
      block.type = block.type || 'text'
      block.text = `${stringValue(block.text)}${stringValue(delta.text)}`
      state.contentBlocks[index] = block
      return stringValue(delta.text).length > 0
    }

    if (deltaType === 'input_json_delta') {
      const nextPartialJson = `${partialInputByIndex.get(index) ?? ''}${stringValue(delta.partial_json)}`
      partialInputByIndex.set(index, nextPartialJson)
      const parsed = parseAnthropicJsonLikeValue(nextPartialJson)

      if (parsed !== undefined) {
        block.input = parsed
      }

      state.contentBlocks[index] = block
      return stringValue(delta.partial_json).length > 0
    }

    return false
  }

  if (eventType === 'content_block_stop') {
    const index = typeof eventPayload.index === 'number' ? eventPayload.index : -1

    if (index < 0) {
      return false
    }

    const partialInput = partialInputByIndex.get(index)

    if (!partialInput) {
      return false
    }

    const block = state.contentBlocks[index] ?? {}
    const parsed = parseAnthropicJsonLikeValue(partialInput)

    block.input = parsed !== undefined ? parsed : partialInput
    state.contentBlocks[index] = block
    partialInputByIndex.delete(index)
    return true
  }

  if (eventType === 'message_delta') {
    const delta = isRecord(eventPayload.delta) ? eventPayload.delta : null
    const stopReason = pickString(delta?.stop_reason) || pickString(eventPayload.stop_reason)

    if (stopReason) {
      state.stopReason = stopReason
      return true
    }
  }

  return false
}

async function readAnthropicMessagesResponse(
  response: Response,
  options?: {
    onProgress?: (progress: {
      containerId: null | string
      contentBlocks: AnthropicContentBlock[]
      fileIds: string[]
      stopReason: null | string
      text: string
    }) => Promise<void> | void
  },
): Promise<AnthropicStreamReadResult> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('text/event-stream') || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as AnthropicResponse

    return {
      fileIds: extractAnthropicFileIds(payload.content),
      payload,
      text: extractTextFromContentBlocks(payload.content),
    }
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const state: {
    containerId: null | string
    contentBlocks: AnthropicContentBlock[]
    stopReason: null | string
  } = {
    containerId: null,
    contentBlocks: [],
    stopReason: null,
  }
  const partialInputByIndex = new Map<number, string>()
  let buffer = ''
  let lastProgressSignature = ''
  let lastProgressAt = 0

  const emitProgress = async (force = false) => {
    if (!options?.onProgress) {
      return
    }

    const fileIds = extractAnthropicFileIds(state.contentBlocks)
    const text = extractTextFromContentBlocks(state.contentBlocks)
    const signature = `${text.length}:${fileIds.join(',')}:${state.contentBlocks.length}:${state.stopReason ?? ''}`
    const now = Date.now()

    if (!force && (!signature || signature === lastProgressSignature)) {
      return
    }

    if (!force && now - lastProgressAt < 250 && fileIds.length === 0) {
      return
    }

    lastProgressSignature = signature
    lastProgressAt = now

    await options.onProgress({
      containerId: state.containerId,
      contentBlocks: state.contentBlocks,
      fileIds,
      stopReason: state.stopReason,
      text,
    })
  }

  const processChunk = async (chunk: string) => {
    const { data } = parseAnthropicSseChunk(chunk)

    if (!data) {
      return
    }

    const eventPayload = JSON.parse(data) as unknown
    const changed = applyAnthropicStreamEvent(state, eventPayload, partialInputByIndex)

    if (changed) {
      await emitProgress(false)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), {
      stream: !done,
    }).replace(/\r\n/g, '\n')

    let separatorIndex = buffer.indexOf('\n\n')

    while (separatorIndex >= 0) {
      const chunk = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      await processChunk(chunk)
      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      break
    }
  }

  if (buffer.trim()) {
    await processChunk(buffer)
  }

  await emitProgress(true)

  return {
    fileIds: extractAnthropicFileIds(state.contentBlocks),
    payload: {
      ...(state.containerId
        ? {
            container: {
              id: state.containerId,
            },
          }
        : {}),
      content: state.contentBlocks,
      stop_reason: state.stopReason ?? undefined,
    },
    text: extractTextFromContentBlocks(state.contentBlocks),
  }
}

function extractTextFromContentBlocks(blocks: AnthropicContentBlock[] | undefined) {
  return blocks?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n').trim() ?? ''
}

function collectAnthropicFileIds(value: unknown, fileIds: Set<string>) {
  if (!value) {
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAnthropicFileIds(entry, fileIds)
    }

    return
  }

  if (typeof value !== 'object') {
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'file_id' && typeof entry === 'string' && entry.trim()) {
      fileIds.add(entry.trim())
      continue
    }

    collectAnthropicFileIds(entry, fileIds)
  }
}

function extractAnthropicFileIds(blocks: AnthropicContentBlock[] | undefined) {
  const fileIds = new Set<string>()

  for (const block of blocks ?? []) {
    collectAnthropicFileIds(block, fileIds)
  }

  return [...fileIds]
}

function normalizeInputFileMimeType(filename: string, mimeType?: string) {
  const providedMimeType = mimeType?.trim()

  if (providedMimeType) {
    return providedMimeType
  }

  const normalizedFilename = filename.toLowerCase()

  if (normalizedFilename.endsWith('.json')) {
    return 'application/json'
  }

  if (normalizedFilename.endsWith('.md')) {
    return 'text/markdown'
  }

  if (normalizedFilename.endsWith('.html') || normalizedFilename.endsWith('.htm')) {
    return 'text/html'
  }

  if (normalizedFilename.endsWith('.txt') || normalizedFilename.endsWith('.py') || normalizedFilename.endsWith('.xml')) {
    return 'text/plain'
  }

  return 'application/octet-stream'
}

async function uploadAnthropicInputFile(input: AnthropicInputFile) {
  const mimeType = normalizeInputFileMimeType(input.filename, input.mimeType)
  const formData = new FormData()

  formData.append('file', new Blob([input.content], { type: mimeType }), input.filename)

  const response = await fetchAnthropic(`${ANTHROPIC_API_BASE_URL}/files`, {
    method: 'POST',
    headers: anthropicHeaders({
      includeFilesBeta: true,
    }),
    body: formData,
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => ({}))) as AnthropicFileMetadata & {
    error?: {
      message?: string
    }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic file upload failed for ${input.filename} (${response.status}).`)
  }

  const fileId = payload.id?.trim()

  if (!fileId) {
    throw new Error(`Anthropic file upload did not return a file id for ${input.filename}.`)
  }

  return {
    content: input.content,
    fileId,
    filename: payload.filename?.trim() || input.filename,
    mimeType: payload.mime_type?.trim() || mimeType,
    sizeBytes: typeof payload.size_bytes === 'number' ? payload.size_bytes : contentByteSize(input.content),
  } satisfies UploadedAnthropicInputFile
}

async function deleteAnthropicFile(fileId: string) {
  const response = await fetchAnthropic(`${ANTHROPIC_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders({
      includeFilesBeta: true,
    }),
    cache: 'no-store',
  })

  if (response.status === 404) {
    return
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as AnthropicFileDeleteResponse & {
      error?: {
        message?: string
      }
    }

    throw new Error(payload.error?.message || `Anthropic file delete failed for ${fileId} (${response.status}).`)
  }
}

async function deleteAnthropicInputFiles(inputFiles: UploadedAnthropicInputFile[]) {
  await Promise.all(
    inputFiles.map(async (inputFile) => {
      try {
        await deleteAnthropicFile(inputFile.fileId)
      } catch {
        // Uploaded input cleanup is best-effort only.
      }
    }),
  )
}

function buildGeneratedFilePrompt(prompt: string, filename: string, inputFiles: UploadedAnthropicInputFile[]) {
  const uploadedInputFilesSection = inputFiles.length
    ? `<uploaded_input_files>
Use the uploaded input files already attached to this request.
Read them from the code execution workspace instead of asking for pasted content.

Available uploaded files:
${inputFiles.map((inputFile) => `- ${inputFile.filename}`).join('\n')}

Use bash_code_execution to run Python. Read uploaded files from pathlib.Path(os.environ["INPUT_DIR"]) inside Python.
Do not hard-code "/uploads" or any other upload directory. List os.environ["INPUT_DIR"] when you need to discover exact uploaded file paths.
</uploaded_input_files>

`
    : ''

  return `${uploadedInputFilesSection}${prompt}

<runtime_output_contract>
Your final deliverable is not the chat reply. Your final deliverable is one downloadable file artifact named exactly "${filename}".

Mandatory write protocol:
1. Build the complete final content in memory.
2. Run one compact verification pass before writing the deliverable.
3. Use bash_code_execution to run Python that writes the verified final content to "./${filename}" with pathlib or open().
4. Confirm the file exists by checking "./${filename}" with pathlib and printing its size in the same bash_code_execution step.
5. Stop only after the tool result exposes "${filename}" as a downloadable file artifact.

Do not write the deliverable until after your compact verification pass. Do not create intermediate downloadable deliverable files.
Each bash_code_execution call can receive a fresh output directory. Do not read a previously written absolute path such as "/files/output/.../${filename}" in a later tool call. If you need to revise, rebuild the content from memory and uploaded inputs, then write "./${filename}" in the current bash_code_execution call.
Do not run open-ended self-revision loops. Make one compact verification pass, fix critical contract/schema issues, then write the final file once.
Keep code execution stdout compact. Do not print full input files, full JSON documents, or the completed deliverable. Summarize inspections and keep stdout under 2000 characters per tool call.
Do not use text editor operations, text_editor_code_execution, bash, or shell commands for the final output file.
Do not paste the full file contents into the chat response.
A text-only confirmation such as "I created ${filename}" is invalid unless the response also includes the downloadable file artifact for "${filename}".
After the downloadable file artifact exists, reply with a short confirmation only.
</runtime_output_contract>`
}

function buildGeneratedFileRetryPrompt(filename: string) {
  return `The previous attempt did not return a downloadable file artifact for "${filename}".

Your next response must fix only that contract failure.

Use bash_code_execution now to run Python that writes the completed final deliverable to "./${filename}".
In the same bash_code_execution step, confirm "./${filename}" exists with pathlib and print its size.
Each bash_code_execution call can receive a fresh output directory. Do not read a previously written absolute path such as "/files/output/.../${filename}".
Do not use text editor operations, text_editor_code_execution, bash, or shell commands for the final output file.
Do not paste the file contents into the chat response.
Do not claim success unless the response includes the downloadable file artifact for "${filename}".
Make sure the response includes the downloadable file artifact for "${filename}".
Reply with a short confirmation only after the file exists.`
}

function buildGeneratedFileTextEditorRetryPrompt(filename: string) {
  return `The previous attempt used text_editor_code_execution and did not return a downloadable file artifact for "${filename}".

That output path is invalid for this workflow. Do not use text_editor_code_execution again.

Use bash_code_execution now. If the completed content already exists in the workspace, read it with Python and rewrite it to "./${filename}". If it does not exist, rebuild the completed final deliverable and write it to "./${filename}" with Python.
In the same bash_code_execution step, confirm "./${filename}" exists with pathlib and print its size.
Each bash_code_execution call can receive a fresh output directory. Do not read a previously written absolute path such as "/files/output/.../${filename}".
Do not use bash or shell commands for the final output file.
Do not paste the file contents into the chat response.
Do not claim success unless the response includes the downloadable file artifact for "${filename}".
Reply with a short confirmation only after the downloadable file artifact exists.`
}

function buildGeneratedFileValidationRetryPrompt(filename: string, reason: string) {
  return `The previous attempt created "${filename}", but the file contents were invalid for this workflow.

Reason:
${reason}

Use the uploaded files to fix the deliverable. Read uploaded files from pathlib.Path(os.environ["INPUT_DIR"]) inside bash_code_execution Python and do not hard-code "/uploads".
Use bash_code_execution to run Python that rewrites the completed final deliverable to "./${filename}" in the sandbox workspace.
In the same bash_code_execution step, confirm "./${filename}" exists with pathlib and print its size.
Each bash_code_execution call can receive a fresh output directory. Do not read a previously written absolute path such as "/files/output/.../${filename}".
Preserve the required workflow schema and make sure the corrected file satisfies the reason above.
Do not use text editor operations, text_editor_code_execution, bash, or shell commands for the corrected output file.
Do not paste the full file contents into the text response.
Do not claim success unless the response includes the downloadable file artifact for "${filename}".
Reply with a short confirmation only after the corrected "${filename}" exists as a downloadable file artifact.`
}

function buildGeneratedFileFreshRetryPrompt(
  originalPrompt: string,
  filename: string,
  inputFiles: UploadedAnthropicInputFile[],
  retryPrompt: string,
) {
  return `${buildGeneratedFilePrompt(originalPrompt, filename, inputFiles)}

<retry_instruction>
${retryPrompt}

The previous attempt did not leave a reusable container. Start fresh from the uploaded files already attached to this request.
Do not spend this response printing or auditing large input files. Inspect only what is needed, keep stdout compact, and write "./${filename}" in the first bash_code_execution step that has enough information to produce it.
</retry_instruction>`
}

function contentMentionsTextEditorCodeExecution(value: unknown): boolean {
  if (!value) {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((entry) => contentMentionsTextEditorCodeExecution(entry))
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase()

    return (
      normalized.includes('text_editor') ||
      normalized.includes('text-editor') ||
      normalized.includes('str_replace_editor')
    )
  }

  if (typeof value !== 'object') {
    return false
  }

  return Object.values(value).some((entry) => contentMentionsTextEditorCodeExecution(entry))
}

function buildAssistantNoArtifactContent(request: {
  contentBlocks: AnthropicContentBlock[]
  text: string
}) {
  if (request.contentBlocks.length > 0) {
    return request.contentBlocks
  }

  return [
    {
      text: request.text || 'The previous attempt ended without returning a downloadable file artifact.',
      type: 'text',
    },
  ]
}

function generatedFileMimeType(filename: string) {
  if (filename.toLowerCase().endsWith('.json')) {
    return 'application/json'
  }

  return filename.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain'
}

function fileMetadataErrorMessage(fileId: string, status: number) {
  return `Anthropic file metadata request failed for ${fileId} (${status}).`
}

function fileDownloadErrorMessage(fileId: string, status: number) {
  return `Anthropic file download failed for ${fileId} (${status}).`
}

function buildAnthropicTraceRequestPayload(input: {
  filename?: string
  inputFiles?: Array<{
    fileId: string
    filename: string
    mimeType: string
    sizeBytes: number
  }>
  maxTokens: number
  maxContextTokens: number
  model: string
  outputConfig: {
    effort: string
  }
  prompt: string
  system: string
  thinking: {
    type: string
  }
  toolType?: string
}) {
  return {
    filename: input.filename,
    maxTokens: input.maxTokens,
    maxContextTokens: input.maxContextTokens,
    model: input.model,
    outputConfig: input.outputConfig,
    prompt: input.prompt,
    promptLength: input.prompt.length,
    promptPreview: input.prompt.slice(0, 4000),
    system: input.system,
    inputFileCount: input.inputFiles?.length ?? 0,
    inputFiles: input.inputFiles ?? [],
    systemLength: input.system.length,
    systemPreview: input.system.slice(0, 2000),
    thinking: input.thinking,
    toolType: input.toolType ?? null,
  }
}

function buildAnthropicTraceResponsePayload(input: {
  contentBlocks?: AnthropicContentBlock[]
  containerId?: null | string
  fileIds?: string[]
  matchedFileId?: null | string
  matchedFilename?: null | string
  ok: boolean
  status: number
  stopReason?: null | string
  text: string
}) {
  return {
    containerId: input.containerId ?? null,
    contentBlocks: input.contentBlocks ?? [],
    fileIds: input.fileIds ?? [],
    matchedFileId: input.matchedFileId ?? null,
    matchedFilename: input.matchedFilename ?? null,
    ok: input.ok,
    status: input.status,
    stopReason: input.stopReason ?? null,
    text: input.text,
    textPreview: input.text.slice(0, 2000),
  }
}

async function updateAnthropicTraceProgress(
  traceEventID: null | WriterRelationshipID,
  input: {
    contentBlocks?: AnthropicContentBlock[]
    containerId?: null | string
    fileIds?: string[]
    ok: boolean
    status: number
    stopReason?: null | string
    text: string
  },
) {
  if (traceEventID == null) {
    return
  }

  await updateWriterTraceEvent(traceEventID, {
    responsePayload: buildAnthropicTraceResponsePayload({
      containerId: input.containerId ?? null,
      contentBlocks: input.contentBlocks,
      fileIds: input.fileIds,
      ok: input.ok,
      status: input.status,
      stopReason: input.stopReason ?? null,
      text: input.text,
    }),
    status: 'running',
  })
}

async function requestAnthropicMessages(
  input: {
    betaHeaders?: string[]
    includeFilesBeta?: boolean
    requestBody: Record<string, unknown>
    traceEventID?: null | WriterRelationshipID
  },
) {
  const response = await fetchAnthropic(`${ANTHROPIC_API_BASE_URL}/messages`, {
    method: 'POST',
    headers: anthropicHeaders({
      betaHeaders: input.betaHeaders,
      contentType: 'application/json',
      includeFilesBeta: input.includeFilesBeta,
    }),
    body: JSON.stringify(input.requestBody),
    cache: 'no-store',
  })

  const streamed = await readAnthropicMessagesResponse(response, {
    onProgress:
      input.traceEventID != null && response.ok
        ? async (progress) => {
            await updateAnthropicTraceProgress(input.traceEventID ?? null, {
              containerId: progress.containerId,
              contentBlocks: progress.contentBlocks,
              fileIds: progress.fileIds,
              ok: response.ok,
              status: response.status,
              stopReason: progress.stopReason,
              text: progress.text,
            })
          }
        : undefined,
  })

  const payload = streamed.payload

  return {
    containerId: payload.container?.id?.trim() || null,
    contentBlocks: Array.isArray(payload.content) ? payload.content : [],
    fileIds: streamed.fileIds,
    payload,
    response,
    stopReason: payload.stop_reason?.trim() || null,
    text: streamed.text,
  } satisfies AnthropicMessagesResult
}

function toAnthropicError(error: unknown, fallback: string) {
  const message = describeAIWriterError(error, fallback)

  if (error instanceof Error && error.message === message) {
    return error
  }

  return new Error(message, {
    cause: error instanceof Error ? error : undefined,
  })
}

async function callAnthropicTextRequest(
  input: {
    maxTokens: number
    model?: string
    prompt: string
    system: string
  },
  trace?: TraceContext,
) {
  const startedAt = new Date().toISOString()
  const requestDefaults = anthropicMessagesRequestDefaults(input.model)
  const traceRequestPayload = buildAnthropicTraceRequestPayload({
    maxTokens: input.maxTokens,
    maxContextTokens: ANTHROPIC_CONTEXT_WINDOW_TOKENS,
    model: requestDefaults.model,
    outputConfig: requestDefaults.output_config,
    prompt: input.prompt,
    system: input.system,
    thinking: requestDefaults.thinking,
  })
  const requestPayload = {
    max_tokens: input.maxTokens,
    messages: [
      {
        content: input.prompt,
        role: 'user',
      },
    ],
    ...requestDefaults,
    stream: true,
    system: input.system,
  }
  let traceEventID: null | WriterRelationshipID = null
  let traceFinished = false
  let lastContentBlocks: AnthropicContentBlock[] = []
  let lastResponsePayload: AnthropicResponse | null = null
  let lastResponseStatus: null | number = null
  let lastResponseStopReason: null | string = null
  let lastResponseText = ''

  if (trace) {
    const traceEvent = await createWriterTraceEvent({
      eventType: trace.eventType,
      provider: 'anthropic',
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
    const { contentBlocks, payload, response, stopReason, text } = await requestAnthropicMessages({
      requestBody: requestPayload,
      traceEventID,
    })

    lastContentBlocks = contentBlocks
    lastResponsePayload = payload
    lastResponseStatus = response.status
    lastResponseStopReason = stopReason
    lastResponseText = text

    const completedAt = new Date().toISOString()
    const errorText = !response.ok ? payload.error?.message || `Anthropic request failed (${response.status})` : null

    if (trace && traceEventID != null) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt,
        responsePayload: buildAnthropicTraceResponsePayload({
          containerId: payload.container?.id ?? null,
          contentBlocks,
          ok: response.ok,
          status: response.status,
          stopReason,
          text,
        }),
        errorText,
        status: response.ok ? 'completed' : 'failed',
      })
      traceFinished = true
    }

    if (!response.ok) {
      throw new Error(errorText || `Anthropic request failed (${response.status})`)
    }

    if (!text) {
      throw new Error('Anthropic returned no text response.')
    }

    return text
  } catch (error) {
    const normalizedError = toAnthropicError(error, 'Anthropic request failed.')

    if (trace && traceEventID != null && !traceFinished) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        responsePayload:
          lastResponsePayload || lastResponseStatus != null
            ? buildAnthropicTraceResponsePayload({
                containerId: lastResponsePayload?.container?.id ?? null,
                contentBlocks: lastContentBlocks,
                ok: false,
                status: lastResponseStatus ?? 0,
                stopReason: lastResponseStopReason,
                text: lastResponseText,
              })
            : undefined,
        status: 'failed',
      })
    } else if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        eventType: trace.eventType,
        provider: 'anthropic',
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

export async function retrieveAnthropicFileMetadata(fileId: string) {
  const response = await fetchAnthropic(`${ANTHROPIC_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    headers: anthropicHeaders({
      includeFilesBeta: true,
    }),
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => ({}))) as AnthropicFileMetadata & {
    error?: {
      message?: string
    }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || fileMetadataErrorMessage(fileId, response.status))
  }

  return {
    downloadable: payload.downloadable === true,
    filename: payload.filename?.trim() || fileId,
    fileId,
    mimeType: payload.mime_type?.trim() || 'text/plain',
    sizeBytes: typeof payload.size_bytes === 'number' ? payload.size_bytes : 0,
  }
}

export async function downloadAnthropicFileText(fileId: string) {
  const response = await fetchAnthropic(`${ANTHROPIC_API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`, {
    headers: anthropicHeaders({
      includeFilesBeta: true,
    }),
    cache: 'no-store',
  })

  const content = await response.text()

  if (!response.ok) {
    throw new Error(content || fileDownloadErrorMessage(fileId, response.status))
  }

  return content
}

export async function callAnthropicText(
  input: {
    maxTokens?: number
    model?: string
    prompt: string
    system: string
  },
  trace?: TraceContext,
) {
  return callAnthropicTextRequest(
    {
      maxTokens: input.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      model: input.model,
      prompt: input.prompt,
      system: input.system,
    },
    trace,
  )
}

export async function callAnthropicJson<T>(
  input: {
    filename?: string
    inputFiles?: AnthropicInputFile[]
    maxTokens?: number
    model?: string
    prompt: string
    system: string
  },
  trace?: TraceContext,
) {
  const generated = await callAnthropicGeneratedFile(
    {
      filename: input.filename ?? 'output.json',
      inputFiles: input.inputFiles,
      maxTokens: input.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
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
      return JSON.parse(stripTrailingCommasFromJsonLikeText(candidate)) as T
    } catch {
      const repairedText = await repairAnthropicJson(candidate, trace, input.model)
      return JSON.parse(stripTrailingCommasFromJsonLikeText(repairedText.trim())) as T
    }
  }
}

async function repairAnthropicJson(text: string, trace?: TraceContext, model?: string) {
  const generated = await callAnthropicGeneratedFile(
    {
      filename: 'repaired.json',
      inputFiles: [
        {
          content: text,
          filename: 'malformed.json',
          mimeType: 'application/json',
        },
      ],
      maxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
      model,
      prompt:
        'Repair the uploaded malformed.json file and write valid JSON to repaired.json. Preserve the original structure as closely as possible. Do not add commentary.',
      system: 'You repair malformed JSON. Read uploaded files from the workspace and write valid JSON output files.',
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

export async function callAnthropicGeneratedFile(
  input: {
    filename: string
    inputFiles?: AnthropicInputFile[]
    maxTokens?: number
    model?: string
    prompt: string
    system: string
    validateFileContent?: (
      file: AnthropicGeneratedFile,
    ) => AnthropicGeneratedFileValidationFailure | null | Promise<AnthropicGeneratedFileValidationFailure | null>
  },
  trace?: TraceContext,
): Promise<{ file: AnthropicGeneratedFile; text: string }> {
  const startedAt = new Date().toISOString()
  const requestDefaults = anthropicMessagesRequestDefaults(input.model)
  const uploadedInputFiles = input.inputFiles?.length ? await Promise.all(input.inputFiles.map(uploadAnthropicInputFile)) : []
  const originalUserContent = [
    {
      text: buildGeneratedFilePrompt(input.prompt, input.filename, uploadedInputFiles),
      type: 'text' as const,
    },
    ...uploadedInputFiles.map((inputFile) => ({
      file_id: inputFile.fileId,
      type: 'container_upload' as const,
    })),
  ]
  const traceRequestPayload = buildAnthropicTraceRequestPayload({
    filename: input.filename,
    inputFiles: uploadedInputFiles.map((inputFile) => ({
      fileId: inputFile.fileId,
      filename: inputFile.filename,
      mimeType: inputFile.mimeType,
      sizeBytes: inputFile.sizeBytes,
    })),
    maxTokens: input.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    maxContextTokens: ANTHROPIC_CONTEXT_WINDOW_TOKENS,
    model: requestDefaults.model,
    outputConfig: requestDefaults.output_config,
    prompt: input.prompt,
    system: input.system,
    thinking: requestDefaults.thinking,
    toolType: ANTHROPIC_CODE_EXECUTION_TOOL_TYPE,
  })
  let traceEventID: null | WriterRelationshipID = null
  let traceFinished = false
  let lastResponsePayload: AnthropicResponse | null = null
  let lastResponseStatus: null | number = null
  let lastResponseText = ''
  let lastResponseStopReason: null | string = null
  let lastFileIds: string[] = []
  let lastContentBlocks: AnthropicContentBlock[] = []

  if (trace) {
    const traceEvent = await createWriterTraceEvent({
      eventType: trace.eventType,
      provider: 'anthropic',
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
    const requestGeneratedFile = async (options?: {
      containerId?: string
      messages?: Array<{
        content: unknown
        role: 'assistant' | 'user'
      }>
      promptOverride?: string
    }) => {
      const assistantMessages = options?.messages ? [...options.messages] : []
      let containerId = options?.containerId
      const aggregatedContentBlocks: AnthropicContentBlock[] = []
      const aggregatedFileIds = new Set<string>()
      const textSegments: string[] = []
      let response: Response | null = null
      let payload: AnthropicResponse = {}

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const requestPayload = {
          ...(containerId
            ? {
                container: containerId,
              }
            : {}),
          max_tokens: input.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
          stream: true,
          messages:
            assistantMessages.length > 0
              ? [
                  {
                    content: originalUserContent,
                    role: 'user' as const,
                  },
                  ...assistantMessages,
                ]
              : [
                  {
                    content: [
                      {
                        text: options?.promptOverride ?? buildGeneratedFilePrompt(input.prompt, input.filename, uploadedInputFiles),
                        type: 'text' as const,
                      },
                      ...uploadedInputFiles.map((inputFile) => ({
                        file_id: inputFile.fileId,
                        type: 'container_upload' as const,
                      })),
                    ],
                    role: 'user' as const,
                  },
                ],
          ...requestDefaults,
          system: input.system,
          tools: [
            {
              name: 'code_execution',
              type: ANTHROPIC_CODE_EXECUTION_TOOL_TYPE,
            },
          ],
        }

        const streamed = await requestAnthropicMessages({
          betaHeaders: [ANTHROPIC_CODE_EXECUTION_API_BETA],
          includeFilesBeta: true,
          requestBody: requestPayload,
          traceEventID,
        })

        response = streamed.response
        payload = streamed.payload
        containerId = payload.container?.id?.trim() || containerId

        if (Array.isArray(payload.content) && payload.content.length > 0) {
          aggregatedContentBlocks.push(...payload.content)

          if (streamed.text) {
            textSegments.push(streamed.text)
          }

          for (const fileId of streamed.fileIds) {
            aggregatedFileIds.add(fileId)
          }
        }

        if (!response.ok || streamed.fileIds.length > 0 || payload.stop_reason !== 'pause_turn') {
          break
        }

        assistantMessages.push({
          content: payload.content ?? [],
          role: 'assistant',
        })
      }

      return {
        containerId: containerId ?? null,
        contentBlocks: aggregatedContentBlocks,
        fileIds: [...aggregatedFileIds],
        payload,
        response,
        stopReason: payload.stop_reason?.trim() || null,
        text: textSegments.join('\n\n').trim(),
      }
    }

    let finalRequest: null | Awaited<ReturnType<typeof requestGeneratedFile>> = null
    let file: AnthropicGeneratedFile | null = null
    let validationRetryPrompt: null | string = null
    let validationRetryContainerId: null | string = null

    for (let validationAttempt = 0; validationAttempt < 2; validationAttempt += 1) {
      let request = await requestGeneratedFile(
        validationRetryContainerId
          ? {
              containerId: validationRetryContainerId,
              promptOverride: validationRetryPrompt ?? undefined,
            }
          : undefined,
      )
      let noFileRetryUsedTextEditor = false

      for (
        let noFileRetryAttempt = 0;
        request.response?.ok && request.fileIds.length === 0 && noFileRetryAttempt < 3;
        noFileRetryAttempt += 1
      ) {
        const usedTextEditor = contentMentionsTextEditorCodeExecution(request.contentBlocks)
        noFileRetryUsedTextEditor = noFileRetryUsedTextEditor || usedTextEditor
        const retryPrompt = contentMentionsTextEditorCodeExecution(request.contentBlocks)
          ? buildGeneratedFileTextEditorRetryPrompt(input.filename)
          : buildGeneratedFileRetryPrompt(input.filename)

        request = request.containerId
          ? await requestGeneratedFile({
              containerId: request.containerId,
              messages: [
                {
                  content: buildAssistantNoArtifactContent(request),
                  role: 'assistant',
                },
                {
                  content: [
                    {
                      text: retryPrompt,
                      type: 'text',
                    },
                  ],
                  role: 'user',
                },
              ],
            })
          : await requestGeneratedFile({
              promptOverride: buildGeneratedFileFreshRetryPrompt(input.prompt, input.filename, uploadedInputFiles, retryPrompt),
            })
      }

      const { contentBlocks, fileIds, payload, response, stopReason, text } = request

      if (!response) {
        throw new Error('Anthropic request did not return a response.')
      }

      lastResponsePayload = payload
      lastResponseStatus = response.status
      lastResponseStopReason = stopReason
      lastResponseText = text
      lastFileIds = fileIds
      lastContentBlocks = contentBlocks
      finalRequest = request

      if (!response.ok) {
        throw new Error(payload.error?.message || `Anthropic request failed (${response.status})`)
      }

      if (fileIds.length === 0) {
        if (noFileRetryUsedTextEditor || contentMentionsTextEditorCodeExecution(contentBlocks)) {
          throw new Error(
            `Anthropic used text_editor_code_execution without returning the expected downloadable output file ${input.filename}.`,
          )
        }

        throw new Error(`Anthropic did not create the expected output file ${input.filename}.`)
      }

      const candidateFiles = await Promise.all(
        fileIds.map(async (fileId) => {
          const metadata = await retrieveAnthropicFileMetadata(fileId)
          const content = await downloadAnthropicFileText(fileId)

          return {
            content,
            downloadable: metadata.downloadable,
            fileId,
            filename: metadata.filename,
            mimeType: metadata.mimeType,
            provider: 'anthropic',
            sizeBytes: metadata.sizeBytes,
          } satisfies AnthropicGeneratedFile
        }),
      )

      const matchingCandidateFiles = candidateFiles.filter((entry) => entry.filename === input.filename)
      file = matchingCandidateFiles.at(-1) ?? (candidateFiles.length === 1 ? candidateFiles[0] : null)

      if (!file) {
        throw new Error(
          `Anthropic created files, but none matched the expected output filename ${input.filename}.`,
        )
      }

      const validationFailure = input.validateFileContent ? await input.validateFileContent(file) : null

      if (!validationFailure) {
        break
      }

      if (!request.containerId || validationAttempt >= 1) {
        throw new Error(validationFailure.reason)
      }

      file = null
      validationRetryContainerId = request.containerId
      validationRetryPrompt =
        validationFailure.retryPrompt?.trim() || buildGeneratedFileValidationRetryPrompt(input.filename, validationFailure.reason)
    }

    if (!finalRequest || !file) {
      throw new Error(`Anthropic did not create a valid ${input.filename} output file.`)
    }

    const { contentBlocks, fileIds, response, stopReason, text } = finalRequest
    if (!response) {
      throw new Error('Anthropic request did not return a response.')
    }

    const completedAt = new Date().toISOString()

    if (trace && traceEventID != null) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt,
        responsePayload: buildAnthropicTraceResponsePayload({
          containerId: finalRequest.containerId,
          contentBlocks,
          fileIds,
          matchedFileId: file.fileId,
          matchedFilename: file.filename,
          ok: response.ok,
          status: response.status,
          stopReason,
          text,
        }),
        status: 'completed',
      })
      traceFinished = true
    }

    return {
      file,
      text,
    }
  } catch (error) {
    const normalizedError = toAnthropicError(error, 'Anthropic request failed.')

    if (trace && traceEventID != null && !traceFinished) {
      await updateWriterTraceEvent(traceEventID, {
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        responsePayload:
          lastResponsePayload || lastResponseStatus != null
            ? buildAnthropicTraceResponsePayload({
                containerId: lastResponsePayload?.container?.id ?? null,
                contentBlocks: lastContentBlocks,
                fileIds: lastFileIds,
                ok: false,
                status: lastResponseStatus ?? 0,
                stopReason: lastResponseStopReason,
                text: lastResponseText,
              })
            : undefined,
        status: 'failed',
      })
    } else if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: normalizedError.message,
        eventType: trace.eventType,
        provider: 'anthropic',
        requestPayload: traceRequestPayload,
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'failed',
      })
    }

    throw normalizedError
  } finally {
    await deleteAnthropicInputFiles(uploadedInputFiles)
  }
}
