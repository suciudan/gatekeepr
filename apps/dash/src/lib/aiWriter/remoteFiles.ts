import { createHash } from 'node:crypto'

import type { AIWriterGeneratedFile } from './providerTypes'
import { createWriterRemoteFile } from './repository'
import type { WriterArtifactRecord, WriterRelationshipID, WriterStageKey } from './types'

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export async function persistAIWriterRemoteFile(input: {
  artifact: WriterArtifactRecord
  generatedFile: AIWriterGeneratedFile
  runID: WriterRelationshipID
  sourceID?: null | WriterRelationshipID
  stageKey: WriterStageKey
}) {
  if (input.generatedFile.fileId.startsWith('inline:')) {
    return null
  }

  return createWriterRemoteFile({
    artifactHash: sha256Hex(input.artifact.content),
    artifactID: input.artifact.id,
    fileId: input.generatedFile.fileId,
    lastUsedAt: new Date().toISOString(),
    metadata: {
      downloadable: input.generatedFile.downloadable,
      filename: input.generatedFile.filename,
      mimeType: input.generatedFile.mimeType,
      sizeBytes: input.generatedFile.sizeBytes,
      stageKey: input.stageKey,
    },
    provider: input.generatedFile.provider ?? 'anthropic',
    runID: input.runID,
    sourceID: input.sourceID,
  })
}

export const persistAnthropicRemoteFile = persistAIWriterRemoteFile
