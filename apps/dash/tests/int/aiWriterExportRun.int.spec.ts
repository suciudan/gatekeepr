import { describe, expect, it } from 'vitest'

import { buildWriterRunExportEntries, createZipArchive, getWriterRunExportFilename } from '@/lib/aiWriter/exportRun'
import type { WriterRunDetail } from '@/lib/aiWriter/types'

function buildDetail(): WriterRunDetail {
  return {
    artifacts: [
      {
        artifactRole: 'model_output_normalized',
        artifactType: 'article_draft_md',
        content: '# Exported article',
        createdAt: '2026-04-28T07:00:00.000Z',
        filename: 'article.md',
        id: 401,
        mimeType: 'text/markdown',
        producedByJobID: 201,
        runID: 101,
        schemaName: null,
        schemaVersion: null,
        sha256: null,
        sourceID: null,
        supersedesArtifactID: null,
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
    ],
    jobs: [
      {
        completedAt: '2026-04-28T07:00:00.000Z',
        createdAt: '2026-04-28T07:00:00.000Z',
        errorText: null,
        id: 201,
        kind: 'write.generate',
        leaseExpiresAt: null,
        leaseHeartbeatAt: null,
        leaseOwner: null,
        leaseToken: null,
        requestPayload: {
          attempt: 1,
        },
        responsePayload: {
          artifactId: 401,
        },
        runID: 101,
        sourceID: null,
        stageKey: 'write',
        startedAt: '2026-04-28T07:00:00.000Z',
        status: 'succeeded',
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
    ],
    remoteFiles: [
      {
        artifactHash: 'hash-a',
        artifactID: 401,
        createdAt: '2026-04-28T07:00:00.000Z',
        deletedAt: null,
        deleteAttemptedAt: null,
        downloadUrl: '/api/ai-writer/runs/101/remote-files/501',
        errorText: null,
        fileId: 'file-ok',
        id: 501,
        lastUsedAt: null,
        metadata: {
          filename: 'article.md',
          mimeType: 'text/markdown',
        },
        provider: 'anthropic',
        runID: 101,
        sourceID: null,
        status: 'active',
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
      {
        artifactHash: 'hash-b',
        artifactID: null,
        createdAt: '2026-04-28T07:00:00.000Z',
        deletedAt: null,
        deleteAttemptedAt: null,
        downloadUrl: '/api/ai-writer/runs/101/remote-files/502',
        errorText: null,
        fileId: 'file-missing',
        id: 502,
        lastUsedAt: null,
        metadata: {
          filename: 'missing.txt',
          mimeType: 'text/plain',
        },
        provider: 'anthropic',
        runID: 101,
        sourceID: null,
        status: 'active',
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
    ],
    run: {
      automationHeartbeatAt: null,
      automationLeaseExpiresAt: null,
      automationLeaseOwner: null,
      automationLeaseToken: null,
      createdAt: '2026-04-28T07:00:00.000Z',
      createdDraftID: null,
      currentStage: 'write',
      errorMessage: null,
      id: 101,
      normalizedSourceUrl: 'https://example.com/source',
      originalWordCount: 1200,
      sourceUrl: 'https://example.com/source?utm_source=test',
      status: 'completed',
      targetKeyword: 'debug export keyword',
      targetWordCount: 1600,
      updatedAt: '2026-04-28T07:00:00.000Z',
      writeUserPrompt: 'Write this locally debuggable article.',
    },
    sources: [
      {
        createdAt: '2026-04-28T07:00:00.000Z',
        fetchError: null,
        fetchStatus: 'completed',
        id: 301,
        metaDescription: 'Source meta',
        normalizedUrl: 'https://example.com/source',
        role: 'original',
        runID: 101,
        selected: true,
        serpPosition: null,
        snippet: null,
        title: 'Source',
        updatedAt: '2026-04-28T07:00:00.000Z',
        url: 'https://example.com/source?utm_source=test',
      },
    ],
    stages: [
      {
        completedAt: '2026-04-28T07:00:00.000Z',
        createdAt: '2026-04-28T07:00:00.000Z',
        errorText: null,
        id: 601,
        inputPayload: {
          selectedSources: 1,
        },
        outputPayload: {
          articleArtifactId: 401,
        },
        retryCount: 0,
        runID: 101,
        stageKey: 'write',
        startedAt: '2026-04-28T07:00:00.000Z',
        status: 'completed',
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
    ],
    traceEvents: [
      {
        completedAt: '2026-04-28T07:00:00.000Z',
        createdAt: '2026-04-28T07:00:00.000Z',
        errorText: null,
        eventType: 'write_generate',
        id: 701,
        provider: 'anthropic',
        requestPayload: {
          filename: 'article.md',
          prompt: 'Create article.md from selected sources.',
          system: 'You write complete markdown articles.',
        },
        responsePayload: {
          contentBlocks: [
            {
              text: 'Created article.md.',
              type: 'text',
            },
          ],
          fileIds: ['file-ok'],
          matchedFileId: 'file-ok',
          matchedFilename: 'article.md',
          ok: true,
          status: 200,
          stopReason: 'end_turn',
          text: 'Created article.md.',
        },
        runID: 101,
        sourceID: null,
        stageKey: 'write',
        startedAt: '2026-04-28T07:00:00.000Z',
        status: 'completed',
        updatedAt: '2026-04-28T07:00:00.000Z',
      },
    ],
  }
}

function contentText(value: string | Uint8Array | undefined) {
  if (value == null) {
    return ''
  }

  return typeof value === 'string' ? value : new TextDecoder().decode(value)
}

describe('AI Writer run export', () => {
  it('builds a local debug bundle with run data, Claude transcript, artifacts, and remote files', async () => {
    const detail = buildDetail()
    const entries = await buildWriterRunExportEntries(detail, {
      downloadRemoteFile: async (remoteFile) => {
        if (remoteFile.fileId === 'file-missing') {
          throw new Error('Anthropic file is no longer downloadable.')
        }

        return '# Remote article'
      },
      generatedAt: '2026-04-28T07:30:00.000Z',
    })
    const byPath = new Map(entries.map((entry) => [entry.path, entry]))

    expect(contentText(byPath.get('data/run-detail.json')?.content)).toContain('"targetKeyword": "debug export keyword"')
    expect(contentText(byPath.get('conversations/claude-transcript.md')?.content)).toContain('You write complete markdown articles.')
    expect(contentText(byPath.get('conversations/claude-transcript.md')?.content)).toContain('Create article.md from selected sources.')
    expect(contentText(byPath.get('conversations/claude-transcript.md')?.content)).toContain('Created article.md.')
    expect(contentText(byPath.get('trace-events/701-write_generate.json')?.content)).toContain('"requestPayload"')
    expect(byPath.get('artifacts/401-article.md')?.content).toBe('# Exported article')
    expect(byPath.get('remote-files/501-article.md')?.content).toBe('# Remote article')
    expect(contentText(byPath.get('remote-files/502-missing.txt.error.txt')?.content)).toContain('Anthropic file is no longer downloadable.')
    expect(contentText(byPath.get('manifest.json')?.content)).toContain('"remoteFileCount": 2')

    const archive = createZipArchive(entries, new Date('2026-04-28T07:30:00.000Z'))
    const archiveText = new TextDecoder().decode(archive)

    expect(archive[0]).toBe(0x50)
    expect(archive[1]).toBe(0x4b)
    expect(archiveText).toContain('README.md')
    expect(archiveText).toContain('remote-files/501-article.md')
    expect(getWriterRunExportFilename(detail)).toBe('ai-writer-run-101-debug-export-keyword.zip')
  })
})
