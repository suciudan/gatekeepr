import type { FieldHook } from 'payload'
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'
import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

import {
  countLegacyCodeBlocksInHtml,
  convertLegacyHtmlToLexicalState,
  countCodeBlocksInLexicalState,
  ensureLexicalState,
  isLexicalState,
  wordPressLikeHTMLConvertersAsync,
} from './richText'
import { DEFAULT_LANGUAGE_CODE } from './languages'
import { slugifySegment } from './slugify'

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countTag(html: string, tagName: string): number {
  const matches = html.match(new RegExp(`<${tagName}\\b`, 'gi'))
  return matches ? matches.length : 0
}

function shouldPreserveLegacyHtml(sourceHtml: string, generatedHtml: string): boolean {
  if (!sourceHtml || !generatedHtml) return false

  const tagsToPreserve = ['img', 'table']

  return (
    countLegacyCodeBlocksInHtml(sourceHtml) > countLegacyCodeBlocksInHtml(generatedHtml) ||
    tagsToPreserve.some((tagName) => countTag(sourceHtml, tagName) > countTag(generatedHtml, tagName))
  )
}

function shouldRehydrateRichTextFromLegacyHtml(sourceHtml: string, lexicalState: Parameters<typeof countCodeBlocksInLexicalState>[0]): boolean {
  if (!sourceHtml) return false

  return countLegacyCodeBlocksInHtml(sourceHtml) > countCodeBlocksInLexicalState(lexicalState)
}

export function createSlugHook(sourceField: string): FieldHook {
  return ({ value, data }) => {
    const explicitValue = pickString(value)

    if (explicitValue) {
      return slugifySegment(explicitValue)
    }

    const sourceValue = pickString(data?.[sourceField])
    return sourceValue ? slugifySegment(sourceValue) : explicitValue
  }
}

export const setCategorySlug: FieldHook = ({ value, data }) => {
  const explicitValue = pickString(value)
  if (explicitValue) return slugifySegment(explicitValue)

  const category = pickString(data?.category)
  return category ? slugifySegment(category) : explicitValue
}

function extractRelationshipId(value: unknown): null | number | string {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') {
      return id
    }
  }

  return null
}

function extractRelationshipDoc<T extends { id: number | string }>(value: unknown): null | T {
  if (value && typeof value === 'object' && 'id' in value) {
    return value as T
  }

  return null
}

export const setCategorySlugFromRelationship: FieldHook = async ({ req, siblingData, value }) => {
  const explicitValue = pickString(value)
  const categoryValue = (siblingData as Record<string, unknown> | undefined)?.categoryRef

  if (categoryValue && typeof categoryValue === 'object' && 'slug' in categoryValue) {
    const slug = pickString((categoryValue as { slug?: unknown }).slug)
    if (slug) return slugifySegment(slug)
  }

  const categoryId = extractRelationshipId(categoryValue)
  if (!categoryId) return explicitValue

  try {
    const category = await req.payload.findByID({
      collection: 'categories',
      depth: 0,
      id: categoryId,
      req,
    })

    const slug = pickString(category.slug)
    return slug ? slugifySegment(slug) : explicitValue
  } catch {
    return explicitValue
  }
}

export const setCategoryNameFromRelationship: FieldHook = async ({ req, siblingData, value }) => {
  const explicitValue = pickString(value)
  const categoryValue = (siblingData as Record<string, unknown> | undefined)?.categoryRef

  if (categoryValue && typeof categoryValue === 'object' && 'name' in categoryValue) {
    const name = pickString((categoryValue as { name?: unknown }).name)
    if (name) return name
  }

  const categoryId = extractRelationshipId(categoryValue)
  if (!categoryId) return explicitValue

  try {
    const category = await req.payload.findByID({
      collection: 'categories',
      depth: 0,
      id: categoryId,
      req,
    })

    return pickString(category.name) || explicitValue
  } catch {
    return explicitValue
  }
}

function setExternalImageFromRelationshipField(relationshipFieldName: string): FieldHook {
  return async ({ req, siblingData, value }) => {
    const mediaValue = (siblingData as Record<string, unknown> | undefined)?.[relationshipFieldName]
    const mediaDoc = extractRelationshipDoc<{
      alt?: string | null
      height?: number | null
      url?: string | null
      width?: number | null
      id: number | string
    }>(mediaValue)

    if (mediaDoc) {
      return {
        alt: pickString(mediaDoc.alt),
        height: typeof mediaDoc.height === 'number' ? mediaDoc.height : null,
        url: pickString(mediaDoc.url),
        width: typeof mediaDoc.width === 'number' ? mediaDoc.width : null,
      }
    }

    const mediaId = extractRelationshipId(mediaValue)
    if (!mediaId) {
      return value
    }

    try {
      const media = await req.payload.findByID({
        collection: 'media',
        depth: 0,
        id: mediaId,
        req,
      })

      return {
        alt: pickString(media.alt),
        height: typeof media.height === 'number' ? media.height : null,
        url: pickString(media.url),
        width: typeof media.width === 'number' ? media.width : null,
      }
    } catch {
      return value
    }
  }
}

export function setExternalImageFromMedia(relationshipFieldName: string): FieldHook {
  return setExternalImageFromRelationshipField(relationshipFieldName)
}

export const setHeroImageFromMedia: FieldHook = setExternalImageFromRelationshipField('heroImageMedia')

export function setStringFromSibling(sourceFieldName: string): FieldHook {
  return ({ siblingData, value }) => {
    const explicitValue = pickString(value)
    if (explicitValue) return explicitValue

    const sourceValue = pickString((siblingData as Record<string, unknown> | undefined)?.[sourceFieldName])
    return sourceValue || explicitValue
  }
}

export const setBodyText: FieldHook = ({ value, data }) => {
  const explicitValue = pickString(value)
  if (explicitValue) return explicitValue

  const bodyHtml = pickString(data?.bodyHtml)
  if (!bodyHtml) return explicitValue

  return stripHtml(bodyHtml)
}

export function setLocalizedKey(identifierFieldName: string): FieldHook {
  return ({ data, siblingData, value }) => {
    const values = (data as Record<string, unknown> | undefined) || siblingData
    const language = pickString(values?.lang) || DEFAULT_LANGUAGE_CODE
    const identifier = pickString(values?.[identifierFieldName])

    if (!identifier) return pickString(value)
    return `${language}:${identifier}`
  }
}

export function hydrateRichTextFromHtml(htmlFieldName: string): FieldHook {
  return async ({ siblingData, value }) => {
    const siblingValues = siblingData as Record<string, unknown> | undefined
    const legacyHtml = pickString(siblingValues?.[htmlFieldName])

    if (isLexicalState(value)) {
      if (legacyHtml && shouldRehydrateRichTextFromLegacyHtml(legacyHtml, value)) {
        return (await convertLegacyHtmlToLexicalState(legacyHtml)) ?? ensureLexicalState(value)
      }

      return ensureLexicalState(value)
    }

    return legacyHtml ? (await convertLegacyHtmlToLexicalState(legacyHtml)) ?? value : ensureLexicalState(undefined)
  }
}

export function setHtmlFromRichText(richTextFieldName: string): FieldHook {
  return async ({ siblingData, value }) => {
    const explicitValue = pickString(value)
    const siblingValues = siblingData as Record<string, unknown> | undefined
    const richTextValue = siblingValues?.[richTextFieldName]

    if (!isLexicalState(richTextValue)) {
      return explicitValue
    }

    const generatedHtml = await convertLexicalToHTMLAsync({
      converters: wordPressLikeHTMLConvertersAsync,
      data: richTextValue,
      disableContainer: true,
    })

    return shouldPreserveLegacyHtml(explicitValue, generatedHtml) ? explicitValue : generatedHtml
  }
}

export function setTextFromRichText(richTextFieldName: string, htmlFieldName: string): FieldHook {
  return ({ siblingData, value }) => {
    const explicitValue = pickString(value)
    const siblingValues = siblingData as Record<string, unknown> | undefined
    const richTextValue = siblingValues?.[richTextFieldName]

    if (isLexicalState(richTextValue)) {
      const plainText = convertLexicalToPlaintext({ data: richTextValue }).trim()
      if (plainText) {
        return plainText
      }
    }

    const bodyHtml = pickString(siblingValues?.[htmlFieldName])
    return bodyHtml ? stripHtml(bodyHtml) : explicitValue
  }
}

export function estimateReadTimeFromText(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 225))} min read`
}

export const setReadTimeFromContent: FieldHook = ({ data, siblingData, value }) => {
  const values = (siblingData as Record<string, unknown> | undefined) || data
  const bodyText = pickString(values?.bodyText)
  const bodyHtml = pickString(values?.bodyHtml)
  const text = bodyText || stripHtml(bodyHtml)

  return text ? estimateReadTimeFromText(text) : pickString(value)
}
