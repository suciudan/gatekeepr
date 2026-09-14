import { beforeAll, describe, expect, it } from 'vitest'
import type { CollectionSlug, Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'
import {
  claimNextQueuedWriterRun,
  createWriterArtifact,
  createWriterJob,
  createWriterRemoteFile,
  createWriterRun,
  createWriterTraceEvent,
  getSelectedWriterSources,
  getWriterRunDetail,
  heartbeatWriterRunClaim,
  listWriterRuns,
  releaseWriterRunClaim,
  saveWriterSerpSources,
  setWriterSelectedCompetitors,
  upsertWriterStageExecution,
  upsertWriterSource,
} from '@/lib/aiWriter/repository'

let payload: Payload

describe('ai writer repository', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    const existingRuns = await payload.find({
      collection: 'writer-runs',
      depth: 0,
      limit: 100,
      page: 1,
      pagination: false,
      where: {
        targetKeyword: {
          contains: 'WSA 195',
        },
      },
    })

    for (const run of existingRuns.docs) {
      await payload.delete({
        collection: 'writer-runs',
        id: run.id,
      })
    }
  })

  it('creates and hydrates a writer run with related workflow records', async () => {
    const created = await createWriterRun({
      sourceUrl: 'example.com/articles/wsa-195?utm_source=test',
      targetKeyword: 'WSA 195 writer run',
    })

    await saveWriterSerpSources(created.run.id, [
      {
        normalizedUrl: 'https://example.com/competitor-a',
        position: 1,
        snippet: 'Competitor A',
        title: 'Competitor A',
        url: 'https://example.com/competitor-a',
      },
      {
        normalizedUrl: 'https://example.com/competitor-b',
        position: 2,
        snippet: 'Competitor B',
        title: 'Competitor B',
        url: 'https://example.com/competitor-b',
      },
    ])

    const sources = await getSelectedWriterSources(created.run.id)
    expect(sources).toHaveLength(1)
    expect(sources[0]?.role).toBe('original')

    const allSources = await upsertWriterSource({
      fetchStatus: 'completed',
      normalizedUrl: 'https://example.com/competitor-c',
      role: 'competitor',
      runID: created.run.id,
      selected: false,
      serpPosition: 3,
      snippet: 'Competitor C',
      title: 'Competitor C',
      url: 'https://example.com/competitor-c',
    })

    expect(allSources.role).toBe('competitor')

    const allSourceDocs = (await getWriterRunDetail(created.run.id)).sources
    const selectedCompetitor = allSourceDocs.find((source) => source.role === 'competitor' && source.serpPosition === 2)
    expect(selectedCompetitor).toBeTruthy()

    await setWriterSelectedCompetitors(created.run.id, selectedCompetitor ? [selectedCompetitor.id] : [])
    await upsertWriterStageExecution(created.run.id, 'discover_serp', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        sourceCount: 3,
      },
      startedAt: new Date().toISOString(),
      status: 'completed',
    })
    await upsertWriterStageExecution(created.run.id, 'source_selection', {
      inputPayload: {
        candidateCount: 3,
      },
      status: 'awaiting_user',
    })
    await upsertWriterStageExecution(created.run.id, 'convert_markdown', {
      inputPayload: {
        selectedSources: 2,
      },
      status: 'queued',
    })

    const job = await createWriterJob({
      kind: 'brief.generate',
      requestPayload: {
        attempt: 1,
      },
      runID: created.run.id,
      stageKey: 'brief',
    })

    const artifact = await createWriterArtifact({
      artifactRole: 'model_output_normalized',
      artifactType: 'brief_json',
      content: '{"outline":[]}',
      filename: 'brief.json',
      mimeType: 'application/json',
      producedByJobID: job.id,
      runID: created.run.id,
      schemaName: 'brief',
      schemaVersion: '1',
    })

    await createWriterTraceEvent({
      completedAt: new Date().toISOString(),
      eventType: 'brief_job_created',
      provider: 'user',
      requestPayload: {
        kind: 'brief.generate',
      },
      runID: created.run.id,
      stageKey: 'brief',
      startedAt: new Date().toISOString(),
      status: 'completed',
    })

    await createWriterRemoteFile({
      artifactHash: 'hash-brief-1',
      artifactID: artifact.id,
      fileId: 'remote-file-1',
      provider: 'anthropic',
      runID: created.run.id,
    })

    const summaries = await listWriterRuns()
    const summary = summaries.find((entry) => entry.id === created.run.id)

    expect(summary?.selectedCompetitors).toBe(1)
    expect(summary?.totalCompetitors).toBe(3)

    const claim = await claimNextQueuedWriterRun({
      leaseMs: 60_000,
      workerId: 'test-worker',
    })

    expect(claim?.runID).toBe(created.run.id)

    const heartbeatSucceeded = await heartbeatWriterRunClaim(created.run.id, claim?.leaseToken ?? '', 60_000)
    expect(heartbeatSucceeded).toBe(true)

    const detail = await getWriterRunDetail(created.run.id)

    expect(detail.run.normalizedSourceUrl).toBe('https://example.com/articles/wsa-195')
    expect(detail.sources.filter((source) => source.role === 'competitor')).toHaveLength(3)
    expect(detail.jobs[0]?.kind).toBe('brief.generate')
    expect(detail.artifacts[0]?.artifactType).toBe('brief_json')
    expect(detail.traceEvents[0]?.eventType).toBe('brief_job_created')
    expect(detail.remoteFiles[0]?.fileId).toBe('remote-file-1')

    const releaseSucceeded = await releaseWriterRunClaim(created.run.id, claim?.leaseToken ?? '')
    expect(releaseSucceeded).toBe(true)
  })

  it('normalizes swapped keyword and source url inputs before creating the run', async () => {
    const created = await createWriterRun({
      sourceUrl: 'WSA 195 swapped keyword',
      targetKeyword: 'https://example.com/articles/wsa-195-swapped?utm_source=test',
    })

    expect(created.run.sourceUrl).toBe('https://example.com/articles/wsa-195-swapped?utm_source=test')
    expect(created.run.normalizedSourceUrl).toBe('https://example.com/articles/wsa-195-swapped')
    expect(created.run.targetKeyword).toBe('WSA 195 swapped keyword')

    const detail = await getWriterRunDetail(created.run.id)
    const originalSource = detail.sources.find((source) => source.role === 'original')

    expect(originalSource?.url).toBe('https://example.com/articles/wsa-195-swapped?utm_source=test')
  })

  it('deletes a writer run together with its related workflow records', async () => {
    const created = await createWriterRun({
      sourceUrl: 'https://example.com/articles/wsa-195-delete?utm_source=test',
      targetKeyword: 'WSA 195 delete cascade',
    })

    const detail = await getWriterRunDetail(created.run.id)
    const originalSource = detail.sources.find((source) => source.role === 'original')

    expect(originalSource).toBeTruthy()

    const job = await createWriterJob({
      kind: 'write.generate',
      requestPayload: {
        attempt: 1,
      },
      runID: created.run.id,
      sourceID: originalSource?.id,
      stageKey: 'write',
    })

    const artifact = await createWriterArtifact({
      artifactRole: 'model_output_normalized',
      artifactType: 'article_draft_md',
      content: '# Delete cascade test',
      filename: 'article-draft.md',
      mimeType: 'text/markdown',
      producedByJobID: job.id,
      runID: created.run.id,
      sourceID: originalSource?.id,
    })

    await createWriterTraceEvent({
      completedAt: new Date().toISOString(),
      eventType: 'article_job_created',
      provider: 'user',
      requestPayload: {
        kind: 'write.generate',
      },
      runID: created.run.id,
      sourceID: originalSource?.id,
      stageKey: 'write',
      startedAt: new Date().toISOString(),
      status: 'completed',
    })

    await createWriterRemoteFile({
      artifactHash: 'hash-article-delete-1',
      artifactID: artifact.id,
      fileId: 'remote-file-delete-1',
      provider: 'anthropic',
      runID: created.run.id,
      sourceID: originalSource?.id,
    })

    await upsertWriterStageExecution(created.run.id, 'write', {
      completedAt: new Date().toISOString(),
      outputPayload: {
        artifactID: artifact.id,
      },
      startedAt: new Date().toISOString(),
      status: 'completed',
    })

    async function countRunDocs(collection: CollectionSlug) {
      const result = await payload.find({
        collection,
        depth: 0,
        limit: 1000,
        page: 1,
        pagination: false,
        where: {
          run: {
            equals: created.run.id,
          },
        },
      })

      return result.docs.length
    }

    expect(await countRunDocs('writer-sources')).toBeGreaterThan(0)
    expect(await countRunDocs('writer-jobs')).toBeGreaterThan(0)
    expect(await countRunDocs('writer-artifacts')).toBeGreaterThan(0)
    expect(await countRunDocs('writer-trace-events')).toBeGreaterThan(0)
    expect(await countRunDocs('writer-remote-files')).toBeGreaterThan(0)
    expect(await countRunDocs('writer-stage-executions')).toBeGreaterThan(0)

    await payload.delete({
      collection: 'writer-runs',
      id: created.run.id,
    })

    expect(await countRunDocs('writer-sources')).toBe(0)
    expect(await countRunDocs('writer-jobs')).toBe(0)
    expect(await countRunDocs('writer-artifacts')).toBe(0)
    expect(await countRunDocs('writer-trace-events')).toBe(0)
    expect(await countRunDocs('writer-remote-files')).toBe(0)
    expect(await countRunDocs('writer-stage-executions')).toBe(0)

    const deletedRun = await payload.findByID({
      collection: 'writer-runs',
      disableErrors: true,
      id: created.run.id,
    })

    expect(deletedRun).toBeNull()
  })
})
