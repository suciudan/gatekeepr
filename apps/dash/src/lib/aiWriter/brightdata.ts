import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import puppeteer from 'puppeteer-core'

import { createWriterTraceEvent } from './repository'
import { requireAIWriterEnv } from './env'
import type { WriterRelationshipID, WriterSerpResult, WriterStageKey } from './types'

const BRIGHTDATA_REQUEST_ENDPOINT = 'https://api.brightdata.com/request'
const BRIGHTDATA_BROWSER_ENDPOINT = 'brd.superproxy.io:9222'
const DIRECT_FETCH_ARTICLE_HOSTNAMES = new Set(['oxylabs.io', 'www.oxylabs.io'])

type TraceContext = {
  eventType: string
  runID: WriterRelationshipID
  sourceID?: null | WriterRelationshipID
  stageKey: WriterStageKey
}

function normalizeUrl(rawUrl: string) {
  const value = rawUrl.trim()

  try {
    const url = new URL(value)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return value
  }
}

function stripNonContentTags(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .trim()
}

function extractTitleFromHtml(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function extractMetaTagContent(html: string, attribute: 'name' | 'property', key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta\\b[^>]*content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*>`,
      'i',
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    const content = match?.[1]?.replace(/\s+/g, ' ').trim()

    if (content) {
      return decodeHtmlEntities(content)
    }
  }

  return null
}

function extractMetaDescriptionFromHtml(html: string) {
  return (
    extractMetaTagContent(html, 'name', 'description') ??
    extractMetaTagContent(html, 'property', 'og:description') ??
    extractMetaTagContent(html, 'name', 'twitter:description')
  )
}

function extractPreferredHtmlFragment(html: string) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch?.[1]?.trim()) {
    return stripNonContentTags(articleMatch[1])
  }

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  if (mainMatch?.[1]?.trim()) {
    return stripNonContentTags(mainMatch[1])
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch?.[1]?.trim()) {
    return stripNonContentTags(bodyMatch[1])
  }

  return stripNonContentTags(html)
}

function extractReadableDocument(html: string, url: string) {
  let dom: JSDOM | null = null

  try {
    dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const parsed = reader.parse()

    if (!parsed?.content?.trim()) {
      return null
    }

    return {
      content: stripNonContentTags(parsed.content),
      excerpt: parsed.excerpt?.trim() || null,
      title: parsed.title?.trim() || null,
    }
  } catch {
    return null
  } finally {
    dom?.window.close()
  }
}

function shouldFetchArticleWithNode(url: string) {
  try {
    return DIRECT_FETCH_ARTICLE_HOSTNAMES.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

function buildBrowserWSEndpoint() {
  const username = encodeURIComponent(requireAIWriterEnv('brightDataBrowserUsername'))
  const password = encodeURIComponent(requireAIWriterEnv('brightDataBrowserPassword'))
  return `wss://${username}:${password}@${BRIGHTDATA_BROWSER_ENDPOINT}`
}

async function requestBrightData(body: Record<string, unknown>, trace?: TraceContext) {
  const startedAt = new Date().toISOString()

  try {
    const response = await fetch(BRIGHTDATA_REQUEST_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireAIWriterEnv('brightDataApiKey')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payloadText = await response.text()
    const completedAt = new Date().toISOString()

    if (trace) {
      await createWriterTraceEvent({
        completedAt,
        eventType: trace.eventType,
        provider: 'brightdata',
        requestPayload: body,
        responsePayload: {
          ok: response.ok,
          status: response.status,
          textPreview: payloadText.slice(0, 2000),
        },
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: response.ok ? 'completed' : 'failed',
      })
    }

    if (!response.ok) {
      throw new Error(`Bright Data request failed (${response.status}): ${payloadText}`)
    }

    return JSON.parse(payloadText) as unknown
  } catch (error) {
    if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: error instanceof Error ? error.message : 'Bright Data request failed.',
        eventType: trace.eventType,
        provider: 'brightdata',
        requestPayload: body,
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'failed',
      })
    }

    throw error
  }
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function tryParseJsonString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function extractSerpCandidate(entry: unknown, index: number): null | WriterSerpResult {
  if (!isRecord(entry)) {
    return null
  }

  const url = firstString([entry.url, entry.link, entry.href, entry.target_url, entry.display_link])
  const title = firstString([entry.title, entry.name, entry.headline, entry.link_title])

  if (!url || !title) {
    return null
  }

  const snippet = firstString([entry.snippet, entry.description, entry.text, entry.body, entry.summary]) ?? ''
  const position =
    typeof entry.position === 'number'
      ? entry.position
      : typeof entry.rank === 'number'
        ? entry.rank
        : index + 1

  return {
    normalizedUrl: normalizeUrl(url),
    position,
    snippet,
    title,
    url,
  }
}

function findOrganicArray(payload: unknown): unknown[] {
  if (isRecord(payload)) {
    for (const key of ['organic', 'organic_results', 'results']) {
      const candidate = payload[key]

      if (Array.isArray(candidate)) {
        const mapped = candidate.map((entry, index) => extractSerpCandidate(entry, index)).filter(Boolean)
        if (mapped.length > 0) {
          return candidate
        }
      }
    }

    const nestedBody = tryParseJsonString(payload.body)
    if (nestedBody) {
      const nestedArray = findOrganicArray(nestedBody)
      if (nestedArray.length > 0) {
        return nestedArray
      }
    }
  }

  const queue = [payload]

  while (queue.length > 0) {
    const current = queue.shift()

    if (Array.isArray(current)) {
      const mapped = current.map((entry, index) => extractSerpCandidate(entry, index)).filter(Boolean)
      if (mapped.length >= 3) {
        return current
      }

      queue.push(...current)
      continue
    }

    if (isRecord(current)) {
      const nestedBody = tryParseJsonString(current.body)
      if (nestedBody) {
        queue.push(nestedBody)
      }

      queue.push(...Object.values(current))
    }
  }

  return []
}

export function extractWriterSerpResults(payload: unknown) {
  const organicEntries = findOrganicArray(payload)
    .map((entry, index) => extractSerpCandidate(entry, index))
    .filter((entry): entry is WriterSerpResult => Boolean(entry))

  const seen = new Set<string>()

  return organicEntries.filter((entry) => {
    if (seen.has(entry.normalizedUrl)) {
      return false
    }

    seen.add(entry.normalizedUrl)
    return true
  })
}

export async function searchKeywordWithBrightData(keyword: string, trace?: TraceContext) {
  const payload = await requestBrightData(
    {
      format: 'json',
      url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=en&gl=us&num=10`,
      zone: requireAIWriterEnv('brightDataSerpZone'),
    },
    trace,
  )

  return {
    raw: payload,
    results: extractWriterSerpResults(payload),
  }
}

async function fetchArticleHtmlWithBrowser(url: string, trace?: TraceContext) {
  const startedAt = new Date().toISOString()
  const browser = await puppeteer.connect({
    browserWSEndpoint: buildBrowserWSEndpoint(),
  })

  try {
    const page = await browser.newPage()
    let navigationWarning: null | string = null

    await page.setViewport({ width: 1440, height: 960 })
    try {
      await page.goto(url, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (!message.toLowerCase().includes('timeout')) {
        throw error
      }

      navigationWarning = message
    }

    await page.waitForSelector('body', { timeout: 15_000 }).catch(() => null)
    await page.waitForNetworkIdle({ idleTime: 750, timeout: 15_000 }).catch(() => null)

    const html = await page.content().catch(() => '')

    if (!html.trim()) {
      throw new Error(navigationWarning || `Bright Data browser returned no HTML for ${url}`)
    }

    const result = {
      finalUrl: page.url(),
      html,
    }

    if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        eventType: trace.eventType,
        provider: 'brightdata',
        requestPayload: { url },
        responsePayload: {
          finalUrl: result.finalUrl,
          htmlLength: result.html.length,
          navigationWarning,
        },
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'completed',
      })
    }

    return result
  } catch (error) {
    if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: error instanceof Error ? error.message : 'Bright Data browser fetch failed.',
        eventType: trace.eventType,
        provider: 'brightdata',
        requestPayload: { url },
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'failed',
      })
    }

    throw error
  } finally {
    await browser.close()
  }
}

async function fetchArticleHtmlWithNode(url: string, trace?: TraceContext) {
  const startedAt = new Date().toISOString()

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    const html = await response.text()
    const completedAt = new Date().toISOString()

    if (trace) {
      await createWriterTraceEvent({
        completedAt,
        eventType: trace.eventType,
        provider: 'fetch',
        requestPayload: { transport: 'node-fetch', url },
        responsePayload: {
          finalUrl: response.url || url,
          htmlLength: html.length,
          ok: response.ok,
          status: response.status,
        },
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: response.ok ? 'completed' : 'failed',
      })
    }

    if (!response.ok) {
      throw new Error(`Node fetch failed (${response.status}) for ${url}: ${html.slice(0, 500)}`)
    }

    if (!html.trim()) {
      throw new Error(`Node fetch returned no HTML for ${url}`)
    }

    return {
      finalUrl: response.url || url,
      html,
    }
  } catch (error) {
    if (trace) {
      await createWriterTraceEvent({
        completedAt: new Date().toISOString(),
        errorText: error instanceof Error ? error.message : 'Node fetch failed.',
        eventType: trace.eventType,
        provider: 'fetch',
        requestPayload: { transport: 'node-fetch', url },
        runID: trace.runID,
        sourceID: trace.sourceID,
        stageKey: trace.stageKey,
        startedAt,
        status: 'failed',
      })
    }

    throw error
  }
}

export async function fetchReadableArticleWithBrightData(url: string, trace?: TraceContext) {
  const { finalUrl, html } = shouldFetchArticleWithNode(url)
    ? await fetchArticleHtmlWithNode(url, trace)
    : await fetchArticleHtmlWithBrowser(url, trace)
  const resolvedUrl = finalUrl || url

  if (!html.trim()) {
    throw new Error(`Article fetch returned no HTML for ${url}`)
  }

  const readableDocument = extractReadableDocument(html, resolvedUrl)
  const extractedHtml = readableDocument?.content || extractPreferredHtmlFragment(html)

  return {
    finalUrl,
    html: extractedHtml,
    metaDescription: readableDocument?.excerpt ?? extractMetaDescriptionFromHtml(html),
    title: readableDocument?.title || extractTitleFromHtml(html) || resolvedUrl,
  }
}
