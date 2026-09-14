'use client'

import { Button, ReactSelect, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { stringify } from 'qs-esm'
import { useEffect, useState, useTransition } from 'react'

import { DEFAULT_LANGUAGE_CODE } from '@/lib/languages'
import type { WriterRunDetail } from '@/lib/aiWriter/types'

type BlogPostOption = {
  label: string
  title?: null | string
  uid?: null | string
  updatedAt?: null | string
  value: string
}

type BlogPostListItem = {
  id: number
  title?: null | string
  uid?: null | string
  updatedAt?: null | string
}

type ConversionResponse = {
  detail: WriterRunDetail
  editorPath: string
  operation: 'created' | 'replaced'
  post: {
    id: number
    lang: string
    title: string
    uid: string
    updatedAt: string
  }
}

type Props = {
  disabled?: boolean
  onComplete: (detail: WriterRunDetail) => void
  runID: number
}

async function readJson(response: Response) {
  const rawText = await response.text()
  let payload: Record<string, unknown> = {}

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    const fallbackText = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    throw new Error(
      message ||
        fallbackText ||
        `AI Writer request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`,
    )
  }

  return payload
}

function formatUpdatedAt(value: null | string | undefined) {
  if (!value) return 'Unknown update time'

  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatPostOptionLabel(post: Pick<BlogPostListItem, 'title' | 'uid'>) {
  const title = post.title || 'Untitled post'
  const slug = post.uid || 'missing-slug'

  return `${title} (${slug})`
}

export function WriterArticleConversionWidget({ disabled, onComplete, runID }: Props) {
  const { config } = useConfig()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [replaceOptions, setReplaceOptions] = useState<BlogPostOption[]>([])
  const [selectedPostID, setSelectedPostID] = useState<null | string>(null)
  const selectedPost = replaceOptions.find((post) => post.value === selectedPostID) ?? null

  useEffect(() => {
    const query = stringify(
      {
        depth: 0,
        limit: 200,
        pagination: false,
        sort: '-updatedAt',
        where: {
          lang: {
            equals: DEFAULT_LANGUAGE_CODE,
          },
        },
      },
      { addQueryPrefix: true },
    )

    let cancelled = false

    void fetch(`${config.routes.api}/blog-posts${query}`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load blog posts: ${response.status}`)
        }

        return (await response.json()) as { docs?: BlogPostListItem[] }
      })
      .then((result) => {
        if (cancelled) {
          return
        }

        const docs = Array.isArray(result.docs)
          ? result.docs.map((doc) => ({
              ...doc,
              label: formatPostOptionLabel(doc),
              value: String(doc.id),
            }))
          : []
        setReplaceOptions(docs)

        if (selectedPostID && !docs.some((doc) => doc.value === selectedPostID)) {
          setSelectedPostID(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReplaceOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [config.routes.api, selectedPostID])

  function handleCreate() {
    if (
      !window.confirm(
        'Create a new English blog post from the current AI Writer article?',
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        setError('')

        const result = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/convert-blog-post`, {
            method: 'POST',
          }),
        )) as ConversionResponse

        onComplete(result.detail)
        router.push(result.editorPath)
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to create the English blog post.',
        )
      }
    })
  }

  function handleReplace() {
    if (!selectedPostID) {
      setError('Select the English blog post to replace.')
      return
    }

    if (
      !window.confirm(
        'Replace the selected English blog post draft content with the current AI Writer article and preserve its existing slug?',
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        setError('')

        const result = (await readJson(
          await fetch(`/api/ai-writer/runs/${runID}/replace-blog-post`, {
            body: JSON.stringify({
              postId: Number(selectedPostID),
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }),
        )) as ConversionResponse

        onComplete(result.detail)
        router.push(result.editorPath)
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Failed to replace the selected blog post.',
        )
      }
    })
  }

  return (
    <section
      style={{
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '.75rem',
        boxSizing: 'border-box',
        display: 'grid',
        gap: '1rem',
        minWidth: 0,
        padding: '1rem 1.25rem',
        width: '100%',
      }}
    >
      <div style={{ display: 'grid', gap: '.2rem' }}>
        <strong>Blog post actions</strong>
        <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.875rem' }}>
          Create or replace the English blog post now. All CMS content is managed in English only.
        </span>
      </div>

      {error ? (
        <p className="field-error" style={{ color: 'var(--theme-error-500)', margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div style={{ boxSizing: 'border-box', maxWidth: '100%', minWidth: 0, width: '100%' }}>
          <Button
            buttonStyle="primary"
            disabled={Boolean(disabled) || isPending}
            margin={false}
            onClick={handleCreate}
            type="button"
          >
            {isPending ? 'Working…' : 'Convert to new blog post'}
          </Button>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--theme-elevation-100)',
            display: 'grid',
            gap: '.75rem',
            paddingTop: '.9rem',
          }}
        >
          <label className="field-label" style={{ marginBottom: 0 }}>
            <span>Replace existing article</span>
          </label>

          <div className="field-type select" style={{ marginBottom: 0, minWidth: 0 }}>
            <ReactSelect
              disabled={Boolean(disabled) || isPending || !replaceOptions.length}
              getOptionValue={(option) => String((option as BlogPostOption).value)}
              isClearable={false}
              isSearchable
              onChange={(option) => {
                const selectedOption = Array.isArray(option) ? option[0] : option
                setSelectedPostID(
                  typeof selectedOption?.value === 'string' ? selectedOption.value : null,
                )
              }}
              options={replaceOptions}
              placeholder={
                replaceOptions.length
                  ? 'Select an English blog post'
                  : 'No English blog posts available'
              }
              value={selectedPost ?? undefined}
            />
          </div>

          {selectedPost ? (
            <div
              style={{
                background: 'var(--theme-elevation-50)',
                border: '1px solid var(--theme-elevation-150)',
                borderRadius: '.6rem',
                display: 'grid',
                gap: '.15rem',
                padding: '.7rem .8rem',
              }}
            >
              <strong>{selectedPost.title || 'Untitled post'}</strong>
              <span style={{ color: 'var(--theme-elevation-500)', fontSize: '.82rem' }}>
                slug: {selectedPost.uid || 'missing'} · updated{' '}
                {formatUpdatedAt(selectedPost.updatedAt)}
              </span>
            </div>
          ) : null}

          <div style={{ boxSizing: 'border-box', maxWidth: '100%', minWidth: 0, width: '100%' }}>
            <Button
              buttonStyle="secondary"
              disabled={Boolean(disabled) || isPending || !selectedPostID}
              margin={false}
              onClick={handleReplace}
              type="button"
            >
              {isPending ? 'Working…' : 'Replace selected article'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
