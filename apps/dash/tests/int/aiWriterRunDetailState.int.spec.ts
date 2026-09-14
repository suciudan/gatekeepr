import { describe, expect, it } from 'vitest'

import { applyWriterRunStageProcessing } from '@/lib/aiWriter/runDetailState'
import type { WriterRunDetail } from '@/lib/aiWriter/types'

function buildDetail(): WriterRunDetail {
  return {
    artifacts: [],
    jobs: [],
    remoteFiles: [],
    run: {
      automationHeartbeatAt: null,
      automationLeaseExpiresAt: null,
      automationLeaseOwner: null,
      automationLeaseToken: null,
      createdAt: '2026-04-25T20:00:00.000Z',
      createdDraftID: null,
      currentStage: 'validate',
      errorMessage: 'Old error',
      id: 20,
      normalizedSourceUrl: 'https://example.com/source',
      originalWordCount: 1200,
      sourceUrl: 'https://example.com/source?utm_source=test',
      status: 'awaiting_user',
      targetKeyword: 'example keyword',
      targetWordCount: 2400,
      updatedAt: '2026-04-25T20:00:00.000Z',
      writeUserPrompt: '',
    },
    sources: [],
    stages: [
      {
        completedAt: '2026-04-25T20:01:00.000Z',
        createdAt: '2026-04-25T20:00:10.000Z',
        errorText: null,
        id: 1,
        inputPayload: null,
        outputPayload: null,
        retryCount: 0,
        runID: 20,
        stageKey: 'brief',
        startedAt: '2026-04-25T20:00:15.000Z',
        status: 'completed',
        updatedAt: '2026-04-25T20:01:00.000Z',
      },
      {
        completedAt: '2026-04-25T20:02:00.000Z',
        createdAt: '2026-04-25T20:01:05.000Z',
        errorText: 'Needs rerun',
        id: 2,
        inputPayload: null,
        outputPayload: null,
        retryCount: 1,
        runID: 20,
        stageKey: 'validate',
        startedAt: '2026-04-25T20:01:10.000Z',
        status: 'awaiting_user',
        updatedAt: '2026-04-25T20:02:00.000Z',
      },
    ],
    traceEvents: [],
  }
}

describe('ai writer run detail state helpers', () => {
  it('optimistically marks the requested stage as processing', () => {
    const next = applyWriterRunStageProcessing(buildDetail(), 'validate')

    expect(next.run.currentStage).toBe('validate')
    expect(next.run.errorMessage).toBeNull()
    expect(next.run.status).toBe('processing')
    expect(next.stages.find((stage) => stage.stageKey === 'validate')).toMatchObject({
      completedAt: null,
      errorText: null,
      status: 'running',
    })
    expect(next.stages.find((stage) => stage.stageKey === 'brief')?.status).toBe('completed')
  })

  it('still updates the run even if the requested stage record is missing', () => {
    const detail = buildDetail()
    const next = applyWriterRunStageProcessing(
      {
        ...detail,
        stages: detail.stages.filter((stage) => stage.stageKey !== 'check'),
      },
      'check',
    )

    expect(next.run.currentStage).toBe('check')
    expect(next.run.status).toBe('processing')
    expect(next.stages).toHaveLength(2)
  })
})
