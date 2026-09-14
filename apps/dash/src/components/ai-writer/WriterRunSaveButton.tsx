'use client'

import { SaveButton as DefaultSaveButton, useDocumentInfo } from '@payloadcms/ui'
import type { SaveButtonClientProps } from 'payload'

import {
  writerRunSaveRevisionRequestEvent,
  type WriterRunSaveRevisionRequestDetail,
} from './saveRevisionEvents'

export function WriterRunSaveButton(props: SaveButtonClientProps) {
  const { isEditing } = useDocumentInfo()

  if (!isEditing) {
    return null
  }

  return (
    <span
      onClickCapture={(event) => {
        const detail: WriterRunSaveRevisionRequestDetail = {}
        window.dispatchEvent(new CustomEvent(writerRunSaveRevisionRequestEvent, { detail }))

        if (!detail.saveRevision) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void detail.saveRevision().catch((error: unknown) => {
          console.error('Failed to save the AI Writer article revision.', error)
        })
      }}
    >
      <DefaultSaveButton {...props} />
    </span>
  )
}
