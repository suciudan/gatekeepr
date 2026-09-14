import type { WriterRemoteFileRecord, WriterRunDetail, WriterTraceEventRecord } from './types'

export type WriterRunExportEntry = {
  content: string | Uint8Array
  mimeType: string
  path: string
}

type RemoteFileDownloadResult = {
  content: string | Uint8Array
  ok: true
} | {
  errorText: string
  ok: false
}

type BuildWriterRunExportEntriesOptions = {
  downloadRemoteFile?: (remoteFile: WriterRemoteFileRecord) => Promise<string | Uint8Array>
  generatedAt?: string
}

const textEncoder = new TextEncoder()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function jsonEntry(path: string, value: unknown): WriterRunExportEntry {
  return {
    content: `${JSON.stringify(value, null, 2)}\n`,
    mimeType: 'application/json',
    path,
  }
}

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120)

  return sanitized || fallback
}

function uniquePath(path: string, existingPaths: Set<string>) {
  if (!existingPaths.has(path)) {
    existingPaths.add(path)
    return path
  }

  const dotIndex = path.lastIndexOf('.')
  const prefix = dotIndex > 0 ? path.slice(0, dotIndex) : path
  const suffix = dotIndex > 0 ? path.slice(dotIndex) : ''

  for (let index = 2; ; index += 1) {
    const candidate = `${prefix}-${index}${suffix}`

    if (!existingPaths.has(candidate)) {
      existingPaths.add(candidate)
      return candidate
    }
  }
}

function getRemoteFilename(remoteFile: WriterRemoteFileRecord) {
  const metadata = isRecord(remoteFile.metadata) ? remoteFile.metadata : null
  return pickString(metadata?.filename) || `${remoteFile.fileId}.txt`
}

function getRemoteMimeType(remoteFile: WriterRemoteFileRecord) {
  const metadata = isRecord(remoteFile.metadata) ? remoteFile.metadata : null
  return pickString(metadata?.mimeType) || pickString(metadata?.mime_type) || 'text/plain; charset=utf-8'
}

function getTracePayloadText(trace: WriterTraceEventRecord, payloadKey: 'requestPayload' | 'responsePayload', key: string) {
  const payload = trace[payloadKey]
  return payload && isRecord(payload) ? pickString(payload[key]) : ''
}

function extractResponseTextBlocks(trace: WriterTraceEventRecord) {
  const payload = trace.responsePayload
  const contentBlocks = payload && isRecord(payload) && Array.isArray(payload.contentBlocks) ? payload.contentBlocks : []

  return contentBlocks
    .map((block) => (isRecord(block) && block.type === 'text' ? pickString(block.text) : ''))
    .filter(Boolean)
}

function buildModelTranscript(detail: WriterRunDetail) {
  const modelTraces = [...detail.traceEvents]
    .filter((trace) => trace.provider === 'anthropic' || trace.provider === 'openai')
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt)
      }

      return left.id - right.id
    })

  const lines = [
    `# AI Writer Model Transcript`,
    '',
    `Run: ${detail.run.id}`,
    `Target keyword: ${detail.run.targetKeyword}`,
    `Source URL: ${detail.run.sourceUrl}`,
    '',
  ]

  for (const trace of modelTraces) {
    const system = getTracePayloadText(trace, 'requestPayload', 'system')
    const prompt = getTracePayloadText(trace, 'requestPayload', 'prompt')
    const responseText = getTracePayloadText(trace, 'responsePayload', 'text')
    const responseBlocks = extractResponseTextBlocks(trace)

    lines.push(
      `## Trace ${trace.id}: ${trace.stageKey ?? 'runtime'} / ${trace.eventType}`,
      '',
      `Status: ${trace.status}`,
      `Started: ${trace.startedAt ?? trace.createdAt}`,
      `Completed: ${trace.completedAt ?? 'not completed'}`,
      '',
    )

    if (system) {
      lines.push(`### System`, '', system, '')
    }

    if (prompt) {
      lines.push(`### User Prompt`, '', prompt, '')
    }

    if (responseBlocks.length) {
      lines.push(`### Model Response Blocks`, '', ...responseBlocks.flatMap((block, index) => [`#### Block ${index + 1}`, '', block, '']))
    } else if (responseText) {
      lines.push(`### Model Response`, '', responseText, '')
    }

    if (trace.errorText) {
      lines.push(`### Error`, '', trace.errorText, '')
    }
  }

  return `${lines.join('\n').trim()}\n`
}

function buildReadme(detail: WriterRunDetail, generatedAt: string) {
  return `# AI Writer Debug Export

Generated: ${generatedAt}
Run ID: ${detail.run.id}
Target keyword: ${detail.run.targetKeyword}
Source URL: ${detail.run.sourceUrl}

## Contents

- manifest.json: bundle inventory and export metadata.
- data/run-detail.json: full hydrated AI Writer run detail.
- data/sources.json, data/stages.json, data/jobs.json, data/trace-events.json, data/remote-files.json: split raw data.
- trace-events/*.json: one JSON file per trace event, including stored requestPayload and responsePayload.
- conversations/model-transcript.md, conversations/claude-transcript.md: readable model prompt/response transcript.
- artifacts/*: saved CMS writer artifacts.
- remote-files/*: downloaded provider generated files when available; .error.txt files explain download failures.
`
}

async function downloadRemoteFile(
  remoteFile: WriterRemoteFileRecord,
  options: BuildWriterRunExportEntriesOptions,
): Promise<RemoteFileDownloadResult> {
  if (!options.downloadRemoteFile) {
    return {
      errorText: `No downloader configured for provider ${remoteFile.provider}.`,
      ok: false,
    }
  }

  try {
    return {
      content: await options.downloadRemoteFile(remoteFile),
      ok: true,
    }
  } catch (error) {
    return {
      errorText: error instanceof Error ? error.message : 'Remote file download failed.',
      ok: false,
    }
  }
}

export async function buildWriterRunExportEntries(
  detail: WriterRunDetail,
  options: BuildWriterRunExportEntriesOptions = {},
) {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const paths = new Set<string>()
  const entries: WriterRunExportEntry[] = []
  const remoteFileResults: Array<{
    errorText: null | string
    id: WriterRemoteFileRecord['id']
    path: string
  }> = []

  const addEntry = (entry: WriterRunExportEntry) => {
    entries.push({
      ...entry,
      path: uniquePath(entry.path, paths),
    })
  }

  addEntry({
    content: buildReadme(detail, generatedAt),
    mimeType: 'text/markdown; charset=utf-8',
    path: 'README.md',
  })
  addEntry(jsonEntry('data/run-detail.json', detail))
  addEntry(jsonEntry('data/sources.json', detail.sources))
  addEntry(jsonEntry('data/stages.json', detail.stages))
  addEntry(jsonEntry('data/jobs.json', detail.jobs))
  addEntry(jsonEntry('data/artifacts.json', detail.artifacts))
  addEntry(jsonEntry('data/trace-events.json', detail.traceEvents))
  addEntry(jsonEntry('data/remote-files.json', detail.remoteFiles))
  addEntry({
    content: buildModelTranscript(detail),
    mimeType: 'text/markdown; charset=utf-8',
    path: 'conversations/model-transcript.md',
  })
  addEntry({
    content: buildModelTranscript(detail),
    mimeType: 'text/markdown; charset=utf-8',
    path: 'conversations/claude-transcript.md',
  })

  for (const trace of [...detail.traceEvents].sort((left, right) => left.id - right.id)) {
    addEntry(jsonEntry(`trace-events/${trace.id}-${sanitizePathSegment(trace.eventType, 'trace')}.json`, trace))
  }

  for (const artifact of [...detail.artifacts].sort((left, right) => left.id - right.id)) {
    addEntry({
      content: artifact.content,
      mimeType: artifact.mimeType || 'text/plain; charset=utf-8',
      path: `artifacts/${artifact.id}-${sanitizePathSegment(artifact.filename, 'artifact.txt')}`,
    })
  }

  for (const remoteFile of [...detail.remoteFiles].sort((left, right) => left.id - right.id)) {
    const filename = `${remoteFile.id}-${sanitizePathSegment(getRemoteFilename(remoteFile), `${remoteFile.fileId}.txt`)}`
    const result = await downloadRemoteFile(remoteFile, options)

    if (result.ok) {
      const path = `remote-files/${filename}`
      addEntry({
        content: result.content,
        mimeType: getRemoteMimeType(remoteFile),
        path,
      })
      remoteFileResults.push({
        errorText: null,
        id: remoteFile.id,
        path,
      })
      continue
    }

    const path = `remote-files/${filename}.error.txt`
    addEntry({
      content: `${result.errorText}\n`,
      mimeType: 'text/plain; charset=utf-8',
      path,
    })
    remoteFileResults.push({
      errorText: result.errorText,
      id: remoteFile.id,
      path,
    })
  }

  addEntry(jsonEntry('manifest.json', {
    artifactCount: detail.artifacts.length,
    entries: entries.map((entry) => ({
      mimeType: entry.mimeType,
      path: entry.path,
      sizeBytes: toBytes(entry.content).byteLength,
    })),
    generatedAt,
    remoteFileCount: detail.remoteFiles.length,
    remoteFileResults,
    run: detail.run,
    traceEventCount: detail.traceEvents.length,
  }))

  return entries
}

function toBytes(content: string | Uint8Array) {
  return typeof content === 'string' ? textEncoder.encode(content) : content
}

function createCrc32Table() {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    table[index] = value >>> 0
  }

  return table
}

const crc32Table = createCrc32Table()

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff

  for (const byte of bytes) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8)
  }

  return (value ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()

  return { dosDate, dosTime }
}

function writeUint16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff
  buffer[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff
  buffer[offset + 1] = (value >>> 8) & 0xff
  buffer[offset + 2] = (value >>> 16) & 0xff
  buffer[offset + 3] = (value >>> 24) & 0xff
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.byteLength, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    combined.set(part, offset)
    offset += part.byteLength
  }

  return combined
}

export function createZipArchive(entries: WriterRunExportEntry[], date = new Date()) {
  const { dosDate, dosTime } = dosDateTime(date)
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.path)
    const contentBytes = toBytes(entry.content)
    const checksum = crc32(contentBytes)
    const localHeader = new Uint8Array(30 + nameBytes.byteLength)

    writeUint32(localHeader, 0, 0x04034b50)
    writeUint16(localHeader, 4, 20)
    writeUint16(localHeader, 6, 0x0800)
    writeUint16(localHeader, 8, 0)
    writeUint16(localHeader, 10, dosTime)
    writeUint16(localHeader, 12, dosDate)
    writeUint32(localHeader, 14, checksum)
    writeUint32(localHeader, 18, contentBytes.byteLength)
    writeUint32(localHeader, 22, contentBytes.byteLength)
    writeUint16(localHeader, 26, nameBytes.byteLength)
    writeUint16(localHeader, 28, 0)
    localHeader.set(nameBytes, 30)

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength)

    writeUint32(centralHeader, 0, 0x02014b50)
    writeUint16(centralHeader, 4, 20)
    writeUint16(centralHeader, 6, 20)
    writeUint16(centralHeader, 8, 0x0800)
    writeUint16(centralHeader, 10, 0)
    writeUint16(centralHeader, 12, dosTime)
    writeUint16(centralHeader, 14, dosDate)
    writeUint32(centralHeader, 16, checksum)
    writeUint32(centralHeader, 20, contentBytes.byteLength)
    writeUint32(centralHeader, 24, contentBytes.byteLength)
    writeUint16(centralHeader, 28, nameBytes.byteLength)
    writeUint16(centralHeader, 30, 0)
    writeUint16(centralHeader, 32, 0)
    writeUint16(centralHeader, 34, 0)
    writeUint16(centralHeader, 36, 0)
    writeUint32(centralHeader, 38, 0)
    writeUint32(centralHeader, 42, offset)
    centralHeader.set(nameBytes, 46)

    localParts.push(localHeader, contentBytes)
    centralParts.push(centralHeader)
    offset += localHeader.byteLength + contentBytes.byteLength
  }

  const centralDirectory = concatBytes(centralParts)
  const endRecord = new Uint8Array(22)

  writeUint32(endRecord, 0, 0x06054b50)
  writeUint16(endRecord, 4, 0)
  writeUint16(endRecord, 6, 0)
  writeUint16(endRecord, 8, entries.length)
  writeUint16(endRecord, 10, entries.length)
  writeUint32(endRecord, 12, centralDirectory.byteLength)
  writeUint32(endRecord, 16, offset)
  writeUint16(endRecord, 20, 0)

  return concatBytes([...localParts, centralDirectory, endRecord])
}

export function getWriterRunExportFilename(detail: Pick<WriterRunDetail, 'run'>) {
  return `ai-writer-run-${detail.run.id}-${sanitizePathSegment(detail.run.targetKeyword, 'debug-export')}.zip`
}
