export const writerRunSaveRevisionRequestEvent = 'wsa:ai-writer:save-revision-request'

export type WriterRunSaveRevisionRequestDetail = {
  saveRevision?: () => Promise<void>
}
