import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'

import { convertWriterArticleToBlogPost } from './articleDraft'
import type { WriterRelationshipID } from './types'

type CollectionSlug =
  | 'writer-artifacts'
  | 'writer-jobs'
  | 'writer-remote-files'
  | 'writer-runs'
  | 'writer-sources'
  | 'writer-stage-executions'
  | 'writer-trace-events'

type JsonRecord = Record<string, unknown> & {
  id: WriterRelationshipID
}

type WriterRunJsonExport = {
  exportedAt: string
  format: 'gatekeepr.ai-writer-run'
  records: {
    artifacts: JsonRecord[]
    jobs: JsonRecord[]
    remoteFiles: JsonRecord[]
    run: JsonRecord
    sources: JsonRecord[]
    stages: JsonRecord[]
    traceEvents: JsonRecord[]
  }
  sourceRunId: WriterRelationshipID
  version: 1
}

type ImportWriterRunJsonOptions = {
  createBlogPost?: boolean
  publish?: boolean
}

type ImportWriterRunJsonResult = {
  blogPost?: {
    editorPath: string
    id: WriterRelationshipID
    published: boolean
    title: string
    uid: string
  }
  importedRunId: WriterRelationshipID
  sourceRunId: WriterRelationshipID
}

const exportFormat = 'gatekeepr.ai-writer-run'

type PayloadWriteClient = {
  create: (input: Record<string, unknown>) => Promise<unknown>
  update: (input: Record<string, unknown>) => Promise<unknown>
}

function relationshipID(value: unknown): WriterRelationshipID | null {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (value && typeof value === 'object') {
    const id = (value as Record<string, unknown>).id

    if (typeof id === 'number') {
      return id
    }

    if (typeof id === 'string') {
      const parsed = Number.parseInt(id, 10)
      return Number.isFinite(parsed) ? parsed : null
    }
  }

  return null
}

function stripSystemFields(record: JsonRecord) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = record

  return data
}

function mapOptionalRelationship(
  value: unknown,
  idMap: Map<string, WriterRelationshipID>,
  fieldName: string,
) {
  const id = relationshipID(value)

  if (id === null) {
    return undefined
  }

  const mappedID = idMap.get(String(id))

  if (!mappedID) {
    throw new Error(`Could not remap ${fieldName} relationship "${id}".`)
  }

  return mappedID
}

async function findAllByRun(payload: Payload, collection: CollectionSlug, runID: WriterRelationshipID) {
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 10000,
    overrideAccess: true,
    pagination: false,
    sort: 'id',
    where: {
      run: {
        equals: runID,
      },
    },
  })

  return result.docs as unknown as JsonRecord[]
}

export async function exportWriterRunJson(input: {
  outputPath: string
  payload: Payload
  runID: WriterRelationshipID
}) {
  const run = (await input.payload.findByID({
    collection: 'writer-runs',
    depth: 0,
    id: input.runID,
    overrideAccess: true,
  })) as unknown as JsonRecord
  const exportPayload: WriterRunJsonExport = {
    exportedAt: new Date().toISOString(),
    format: exportFormat,
    records: {
      artifacts: await findAllByRun(input.payload, 'writer-artifacts', input.runID),
      jobs: await findAllByRun(input.payload, 'writer-jobs', input.runID),
      remoteFiles: await findAllByRun(input.payload, 'writer-remote-files', input.runID),
      run,
      sources: await findAllByRun(input.payload, 'writer-sources', input.runID),
      stages: await findAllByRun(input.payload, 'writer-stage-executions', input.runID),
      traceEvents: await findAllByRun(input.payload, 'writer-trace-events', input.runID),
    },
    sourceRunId: run.id,
    version: 1,
  }
  const absoluteOutputPath = path.resolve(input.outputPath)

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true })
  await writeFile(absoluteOutputPath, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8')

  return {
    artifactCount: exportPayload.records.artifacts.length,
    jobCount: exportPayload.records.jobs.length,
    outputPath: absoluteOutputPath,
    remoteFileCount: exportPayload.records.remoteFiles.length,
    runID: run.id,
    sourceCount: exportPayload.records.sources.length,
    stageCount: exportPayload.records.stages.length,
    traceEventCount: exportPayload.records.traceEvents.length,
  }
}

async function readWriterRunJson(filePath: string): Promise<WriterRunJsonExport> {
  const parsed = JSON.parse(await readFile(path.resolve(filePath), 'utf8')) as WriterRunJsonExport

  if (parsed.format !== exportFormat || parsed.version !== 1) {
    throw new Error(`Unsupported writer run export format in ${filePath}.`)
  }

  return parsed
}

export async function importWriterRunJson(input: {
  filePath: string
  options?: ImportWriterRunJsonOptions
  payload: Payload
}): Promise<ImportWriterRunJsonResult> {
  const source = await readWriterRunJson(input.filePath)
  const writer = input.payload as unknown as PayloadWriteClient
  const sourceIDMap = new Map<string, WriterRelationshipID>()
  const jobIDMap = new Map<string, WriterRelationshipID>()
  const artifactIDMap = new Map<string, WriterRelationshipID>()
  const runData = {
    ...stripSystemFields(source.records.run),
    automationHeartbeatAt: null,
    automationLeaseExpiresAt: null,
    automationLeaseOwner: null,
    automationLeaseToken: null,
    createdDraft: null,
  }
  const importedRun = (await writer.create({
    collection: 'writer-runs',
    data: runData,
    overrideAccess: true,
  })) as JsonRecord
  const importedRunID = importedRun.id

  for (const sourceRecord of source.records.sources) {
    const importedSource = (await writer.create({
      collection: 'writer-sources',
      data: {
        ...stripSystemFields(sourceRecord),
        run: importedRunID,
      },
      overrideAccess: true,
    })) as JsonRecord

    sourceIDMap.set(String(sourceRecord.id), importedSource.id)
  }

  for (const stage of source.records.stages) {
    await writer.create({
      collection: 'writer-stage-executions',
      data: {
        ...stripSystemFields(stage),
        run: importedRunID,
      },
      overrideAccess: true,
    })
  }

  for (const job of source.records.jobs) {
    const importedJob = (await writer.create({
      collection: 'writer-jobs',
      data: {
        ...stripSystemFields(job),
        leaseExpiresAt: null,
        leaseHeartbeatAt: null,
        leaseOwner: null,
        leaseToken: null,
        run: importedRunID,
        source: mapOptionalRelationship(job.source, sourceIDMap, 'writer job source'),
      },
      overrideAccess: true,
    })) as JsonRecord

    jobIDMap.set(String(job.id), importedJob.id)
  }

  for (const artifact of source.records.artifacts) {
    const importedArtifact = (await writer.create({
      collection: 'writer-artifacts',
      data: {
        ...stripSystemFields(artifact),
        producedByJob: mapOptionalRelationship(artifact.producedByJob, jobIDMap, 'writer artifact producedByJob'),
        run: importedRunID,
        source: mapOptionalRelationship(artifact.source, sourceIDMap, 'writer artifact source'),
        supersedesArtifact: undefined,
      },
      overrideAccess: true,
    })) as JsonRecord

    artifactIDMap.set(String(artifact.id), importedArtifact.id)
  }

  for (const artifact of source.records.artifacts) {
    const supersedesArtifact = mapOptionalRelationship(
      artifact.supersedesArtifact,
      artifactIDMap,
      'writer artifact supersedesArtifact',
    )

    if (!supersedesArtifact) {
      continue
    }

    await writer.update({
      collection: 'writer-artifacts',
      data: {
        supersedesArtifact,
      },
      id: artifactIDMap.get(String(artifact.id))!,
      overrideAccess: true,
    })
  }

  for (const traceEvent of source.records.traceEvents) {
    await writer.create({
      collection: 'writer-trace-events',
      data: {
        ...stripSystemFields(traceEvent),
        run: importedRunID,
        source: mapOptionalRelationship(traceEvent.source, sourceIDMap, 'writer trace event source'),
      },
      overrideAccess: true,
    })
  }

  for (const remoteFile of source.records.remoteFiles) {
    await writer.create({
      collection: 'writer-remote-files',
      data: {
        ...stripSystemFields(remoteFile),
        artifact: mapOptionalRelationship(remoteFile.artifact, artifactIDMap, 'writer remote file artifact'),
        run: importedRunID,
        source: mapOptionalRelationship(remoteFile.source, sourceIDMap, 'writer remote file source'),
      },
      overrideAccess: true,
    })
  }

  const result: ImportWriterRunJsonResult = {
    importedRunId: importedRunID,
    sourceRunId: source.sourceRunId,
  }

  if (input.options?.createBlogPost || input.options?.publish) {
    const conversion = await convertWriterArticleToBlogPost({
      payload: input.payload,
      runID: importedRunID,
    })
    const publishAt = new Date().toISOString()

    if (input.options.publish) {
      const publishedPost = (await writer.update({
        collection: 'blog-posts',
        data: {
          _status: 'published',
          firstPublishedAt: publishAt,
          lastPublishedAt: publishAt,
          publishedAt: publishAt,
        },
        draft: false,
        id: conversion.post.id,
        overrideAccess: true,
      })) as JsonRecord

      result.blogPost = {
        editorPath: conversion.editorPath,
        id: publishedPost.id,
        published: true,
        title: String(publishedPost.title ?? conversion.post.title),
        uid: String(publishedPost.uid ?? conversion.post.uid),
      }
    } else {
      result.blogPost = {
        editorPath: conversion.editorPath,
        id: conversion.post.id,
        published: false,
        title: conversion.post.title,
        uid: conversion.post.uid,
      }
    }
  }

  return result
}
