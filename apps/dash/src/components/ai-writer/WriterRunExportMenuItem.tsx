'use client'

import { PopupList, useDocumentInfo } from '@payloadcms/ui'

export function WriterRunExportMenuItem() {
  const { id, isEditing } = useDocumentInfo()
  const runID = typeof id === 'number' ? id : Number.parseInt(String(id ?? ''), 10)

  if (!isEditing || !Number.isFinite(runID)) {
    return null
  }

  return (
    <PopupList.Button
      id="action-export-ai-writer-debug"
      onClick={() => {
        window.location.assign(`/api/ai-writer/runs/${runID}/export`)
      }}
    >
      Export debug zip
    </PopupList.Button>
  )
}
