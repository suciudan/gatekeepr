import type { WriterRelationshipID, WriterStageKey } from './types'

export type AIWriterModelProvider = 'anthropic' | 'openai'

export type AIWriterGeneratedFile = {
  content: string
  downloadable: boolean
  fileId: string
  filename: string
  mimeType: string
  provider?: AIWriterModelProvider
  sizeBytes: number
}

export type AIWriterInputFile = {
  content: string
  filename: string
  mimeType?: string
}

export type AIWriterGeneratedFileValidationFailure = {
  reason: string
  retryPrompt?: string
}

export type AIWriterTraceContext = {
  eventType: string
  runID: WriterRelationshipID
  sourceID?: null | WriterRelationshipID
  stageKey: WriterStageKey
}
