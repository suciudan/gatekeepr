import type { BlogPost } from '../payload-types'

import {
  convertLegacyHtmlToLexicalState,
  countCodeBlocksInLexicalState,
  countLegacyCodeBlocksInHtml,
  isLexicalState,
  normalizeLegacyHtmlCodeBlocks,
} from './richText'

export type LegacyCodeBlockBackfillAnalysis = {
  htmlPreCount: number
  lexicalCodeBlockCount: number
  needsBackfill: boolean
}

export type LegacyCodeBlockBackfillSource = {
  analysis: LegacyCodeBlockBackfillAnalysis
  body?: BlogPost['body'] | null | unknown
  bodyHtml?: null | string
  source: 'current' | 'draft'
  status?: null | string
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function analyzeLegacyCodeBlockBackfill(doc: {
  body?: BlogPost['body'] | null | unknown
  bodyHtml?: null | string
}): LegacyCodeBlockBackfillAnalysis {
  const bodyHtml = pickString(doc.bodyHtml)
  const htmlPreCount = countLegacyCodeBlocksInHtml(bodyHtml)
  const lexicalCodeBlockCount = isLexicalState(doc.body) ? countCodeBlocksInLexicalState(doc.body) : 0

  return {
    htmlPreCount,
    lexicalCodeBlockCount,
    needsBackfill: htmlPreCount > lexicalCodeBlockCount,
  }
}

export async function buildLegacyCodeBlockBackfillData(doc: {
  body?: BlogPost['body'] | null | unknown
  bodyHtml?: null | string
}): Promise<null | Pick<BlogPost, 'body' | 'bodyHtml'>> {
  const bodyHtml = pickString(doc.bodyHtml)
  const normalizedBodyHtml = normalizeLegacyHtmlCodeBlocks(bodyHtml)
  const analysis = analyzeLegacyCodeBlockBackfill(doc)

  if (!analysis.needsBackfill || !normalizedBodyHtml) {
    return null
  }

  const body = await convertLegacyHtmlToLexicalState(normalizedBodyHtml)
  if (!body) {
    return null
  }

  return {
    body: body as BlogPost['body'],
    bodyHtml: normalizedBodyHtml,
  }
}

export function selectLegacyCodeBlockBackfillSource(doc: {
  body?: BlogPost['body'] | null | unknown
  bodyHtml?: null | string
  draftBody?: BlogPost['body'] | null | unknown
  draftBodyHtml?: null | string
  draftStatus?: null | string
  status?: null | string
}): LegacyCodeBlockBackfillSource | null {
  if (doc.draftStatus === 'draft') {
    const draftAnalysis = analyzeLegacyCodeBlockBackfill({
      body: doc.draftBody,
      bodyHtml: doc.draftBodyHtml,
    })

    if (draftAnalysis.needsBackfill) {
      return {
        analysis: draftAnalysis,
        body: doc.draftBody,
        bodyHtml: doc.draftBodyHtml,
        source: 'draft',
        status: doc.draftStatus,
      }
    }
  }

  const currentAnalysis = analyzeLegacyCodeBlockBackfill({
    body: doc.body,
    bodyHtml: doc.bodyHtml,
  })

  if (!currentAnalysis.needsBackfill) {
    return null
  }

  return {
    analysis: currentAnalysis,
    body: doc.body,
    bodyHtml: doc.bodyHtml,
    source: 'current',
    status: doc.status,
  }
}
