'use client'

import { useConfig, useDocumentInfo, useField } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type CreateRunResponse = {
  message?: string
  run?: {
    id: number
  }
}

async function readJson(response: Response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as CreateRunResponse
  } catch {
    return null
  }
}

export function WriterRunContinueField() {
  const router = useRouter()
  const { config } = useConfig()
  const { isEditing } = useDocumentInfo()
  const { value: targetKeyword } = useField<string>({ path: 'targetKeyword' })
  const { value: sourceUrl } = useField<string>({ path: 'sourceUrl' })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  if (isEditing) {
    return null
  }

  const handleContinue = () => {
    const nextTargetKeyword = typeof targetKeyword === 'string' ? targetKeyword.trim() : ''
    const nextSourceUrl = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''

    if (!nextTargetKeyword || !nextSourceUrl) {
      setError('Target keyword and source URL are required.')
      return
    }

    setError('')

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch('/api/ai-writer/runs', {
            body: JSON.stringify({
              sourceUrl: nextSourceUrl,
              targetKeyword: nextTargetKeyword,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          })

          const payload = await readJson(response)

          if (!response.ok || !payload?.run?.id) {
            setError(payload?.message || 'Failed to start the writer flow.')
            return
          }

          router.push(`${config.routes.admin}/collections/writer-runs/${payload.run.id}`)
          router.refresh()
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : 'Failed to start the writer flow.')
        }
      })()
    })
  }

  return (
    <div className="writer-run-continue-field">
      <style>{`.render-title { display: none !important; }`}</style>
      <button
        className="btn btn--icon-style-without-border btn--size-medium btn--withoutPopup btn--style-primary btn--withoutPopup writer-run-continue-field__button"
        disabled={isPending}
        onClick={handleContinue}
        type="button"
      >
        {isPending ? 'Continuing…' : 'Continue'}
      </button>
      {error ? <p className="writer-run-continue-field__error">{error}</p> : null}
    </div>
  )
}
