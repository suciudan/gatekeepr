import type { WriterRunDetail, WriterStageKey } from './types'

export function applyWriterRunStageProcessing(detail: WriterRunDetail, stageKey: WriterStageKey): WriterRunDetail {
  return {
    ...detail,
    run: {
      ...detail.run,
      currentStage: stageKey,
      errorMessage: null,
      status: 'processing',
    },
    stages: detail.stages.map((stage) =>
      stage.stageKey === stageKey
        ? {
            ...stage,
            completedAt: null,
            errorText: null,
            status: 'running',
          }
        : stage,
    ),
  }
}
