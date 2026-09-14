'use client'

import { useDocumentInfo } from '@payloadcms/ui'

export function WriterRunTitleField() {
  const { isEditing } = useDocumentInfo()

  if (!isEditing) {
    return null
  }

  return <style>{`.render-title { display: none !important; }`}</style>
}
