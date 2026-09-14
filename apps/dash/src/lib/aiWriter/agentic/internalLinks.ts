import type { Payload } from 'payload'

export type InternalLinksDocument = {
  articleSiteHostname: string
  content: string
  droppedEntryCount: number
  entryCount: number
  filename: string
  generatedAt: null | string
  siteKey: string
  sourcePath: string
  sourceSitemaps: string[]
}

export type InternalLinksDatasetRejection = {
  filename: null | string
  reason: string
  reasonCode:
    | 'ambiguous_site_domain'
    | 'empty_entries'
    | 'invalid_json'
    | 'missing_internal_links_array'
    | 'no_valid_entries'
  siteKey: string
  sourcePath: null | string
}

export type InternalLinksResolution = {
  availableSiteKeys: string[]
  document: InternalLinksDocument | null
  rejectedDatasets: InternalLinksDatasetRejection[]
  resolvedSiteKey: null | string
  resolutionStrategy: 'generated_sitemap' | 'none'
  targetSiteKey: null | string
  targetSiteRejection: InternalLinksDatasetRejection | null
}

type PayloadClient = Payload

const DEFAULT_INTERNAL_LINK_SITE_KEY = 'gatekeepr'
const DEFAULT_INTERNAL_LINKS_FETCH_TIMEOUT_MS = 10_000
const DEFAULT_INTERNAL_LINKS_GENERATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const DEFAULT_INTERNAL_LINK_LOCALE = 'en'
const DEFAULT_INTERNAL_LINKS_SITEMAP_PATH = '/sitemap.xml'
const DEFAULT_SITE_ORIGIN_BY_SITE_KEY: Record<string, string> = {
  gatekeepr: 'https://gatekeepr.io',
}
const LEGAL_SLUG_ALLOWLIST = new Set([
  'cookie-policy',
  'gdpr',
  'privacy-policy',
  'service-agreement',
  'terms-of-service',
])
const EXCLUDED_INTERNAL_LINK_PATHS = new Set([
  '/',
  '/blog',
  '/contact',
  '/contact/billing',
  '/contact/technical',
  '/get-free-api-key',
  '/pricing',
  '/sign-in',
  '/verify-email',
])
const EXCLUDED_INTERNAL_LINK_PREFIXES = ['/blog/authors/', '/category/', '/dashboard', '/legal/', '/sitemap/']
const UPPERCASE_WORDS = new Set([
  'api',
  'apis',
  'csv',
  'faq',
  'gdpr',
  'html',
  'json',
  'llm',
  'seo',
  'sem',
  'serp',
  'sdk',
  'url',
])

const sitemapDocumentCache = new Map<
  string,
  {
    document: InternalLinksDocument | null
    expiresAt: number
    inFlight: null | Promise<InternalLinksDocument | null>
  }
>()

function normalizeEntries(entries: string[]) {
  const seen = new Set<string>()

  return entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase()

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function readOptionalNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return fallback
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractUrl(entry: string) {
  const url = entry.match(/\((https?:\/\/[^)\s]+)\)\s*$/i)?.[1] ?? entry.match(/https?:\/\/\S+/i)?.[0] ?? ''

  return /^https?:\/\//i.test(url) ? url : null
}

function normalizeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function collapseHostnameToSiteDomain(hostname: string) {
  const labels = hostname.replace(/^www\./, '').split('.').filter(Boolean)

  if (labels.length <= 2) {
    return labels.join('.')
  }

  const topLevelLabel = labels[labels.length - 1] ?? ''
  const secondLevelLabel = labels[labels.length - 2] ?? ''

  if (topLevelLabel.length === 2 && secondLevelLabel.length <= 3 && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }

  return labels.slice(-2).join('.')
}

function normalizeSiteDomain(value: string) {
  const hostname = normalizeHostname(value)
  return hostname ? collapseHostnameToSiteDomain(hostname) : null
}

function normalizeUrlPath(value: string) {
  return value.length > 1 ? value.replace(/\/+$/, '') : value
}

function readSiteOriginFromEnv(siteKey: string) {
  const envKey = `AI_WRITER_INTERNAL_LINKS_${siteKey.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_ORIGIN`
  const candidate = readOptionalString(process.env[envKey])

  if (candidate) {
    return candidate
  }

  return readOptionalString(process.env.AI_WRITER_INTERNAL_LINKS_SITE_ORIGIN)
}

function getSiteOriginForKey(siteKey: string) {
  const configuredOrigin = readSiteOriginFromEnv(siteKey)
  const fallbackOrigin = DEFAULT_SITE_ORIGIN_BY_SITE_KEY[siteKey] ?? ''
  const candidate = configuredOrigin || fallbackOrigin

  if (!candidate) {
    return null
  }

  try {
    return new URL(candidate).toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function shouldDisableSitemapGeneration() {
  const value = readOptionalString(process.env.AI_WRITER_INTERNAL_LINKS_DISABLE_SITEMAP_FETCH).toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function getInternalLinksFetchTimeoutMs() {
  return readOptionalNumber(
    process.env.AI_WRITER_INTERNAL_LINKS_FETCH_TIMEOUT_MS,
    DEFAULT_INTERNAL_LINKS_FETCH_TIMEOUT_MS,
  )
}

function getInternalLinksGenerationCacheTtlMs() {
  return readOptionalNumber(
    process.env.AI_WRITER_INTERNAL_LINKS_CACHE_TTL_MS,
    DEFAULT_INTERNAL_LINKS_GENERATION_CACHE_TTL_MS,
  )
}

function getInternalLinksSitemapPath() {
  const configuredPath = readOptionalString(process.env.AI_WRITER_INTERNAL_LINKS_SITEMAP_PATH)

  if (!configuredPath) {
    return DEFAULT_INTERNAL_LINKS_SITEMAP_PATH
  }

  return configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&apos;/gi, "'")
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&quot;/gi, '"')
    .trim()
}

function extractXmlLocValues(xml: string) {
  return normalizeEntries(
    [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXmlEntities(match[1] ?? '')),
  )
}

function normalizeSitemapUrl(url: string, siteOrigin: string) {
  try {
    const parsed = new URL(url)

    parsed.hash = ''
    parsed.search = ''

    if (!/^https?:$/i.test(parsed.protocol)) {
      return null
    }

    if (normalizeSiteDomain(parsed.origin) !== normalizeSiteDomain(siteOrigin)) {
      return null
    }

    parsed.pathname = normalizeUrlPath(parsed.pathname)

    return parsed.toString()
  } catch {
    return null
  }
}

function shouldIncludeSitemapPath(pathname: string) {
  const normalizedPath = normalizeUrlPath(pathname || '/')

  if (EXCLUDED_INTERNAL_LINK_PATHS.has(normalizedPath)) {
    return false
  }

  return !EXCLUDED_INTERNAL_LINK_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
}

function humanizeSlug(value: string) {
  return decodeURIComponent(value)
    .split(/[-_]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const normalized = segment.toLowerCase()

      if (UPPERCASE_WORDS.has(normalized)) {
        return normalized.toUpperCase()
      }

      if (/^\d+$/.test(segment)) {
        return segment
      }

      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join(' ')
}

function buildGeneratedTitleForPath(pathname: string) {
  const segments = normalizeUrlPath(pathname)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return 'Home'
  }

  if (segments[0] === 'pricing' && segments[1]) {
    return `${humanizeSlug(segments[1])} Pricing`
  }

  if (segments[0] === 'legal' && segments[1]) {
    return humanizeSlug(segments[1])
  }

  return humanizeSlug(segments[segments.length - 1] ?? segments[0] ?? '')
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(getInternalLinksFetchTimeoutMs()),
  })

  if (!response.ok) {
    throw new Error(`Internal links fetch failed for ${url}: ${response.status}`)
  }

  return response.text()
}

function parseSiteLlmsTitleMap(llmsText: string, siteOrigin: string) {
  const titleByPath = new Map<string, string>()
  const siteDomain = normalizeSiteDomain(siteOrigin)

  for (const line of llmsText.split(/\r?\n/)) {
    const match = line.match(/^- \[([^\]]+)\]\((https?:\/\/[^)]+)\):/i)

    if (!match) {
      continue
    }

    const title = readOptionalString(match[1])
    const url = readOptionalString(match[2])

    if (!title || !url) {
      continue
    }

    try {
      const parsed = new URL(url)

      if (normalizeSiteDomain(parsed.origin) !== siteDomain) {
        continue
      }

      titleByPath.set(normalizeUrlPath(parsed.pathname), title)
    } catch {}
  }

  return titleByPath
}

async function loadSiteTitleOverrides(siteOrigin: string) {
  try {
    const llmsText = await fetchText(new URL('/llms.txt', siteOrigin).toString())
    return parseSiteLlmsTitleMap(llmsText, siteOrigin)
  } catch {
    return new Map<string, string>()
  }
}

async function loadCmsTitleOverrides(payload?: PayloadClient) {
  const titleByPath = new Map<string, string>()

  if (!payload) {
    return titleByPath
  }

  const [blogPosts, contentPages] = await Promise.all([
    payload.find({
      collection: 'blog-posts',
      depth: 0,
      draft: false,
      limit: 1000,
      pagination: false,
      where: {
        and: [
          {
            lang: {
              equals: DEFAULT_INTERNAL_LINK_LOCALE,
            },
          },
          {
            _status: {
              equals: 'published',
            },
          },
        ],
      },
    }),
    payload.find({
      collection: 'content-pages',
      depth: 0,
      limit: 250,
      pagination: false,
      where: {
        lang: {
          equals: DEFAULT_INTERNAL_LINK_LOCALE,
        },
      },
    }),
  ])

  for (const post of blogPosts.docs) {
    const uid = readOptionalString('uid' in post ? post.uid : '')
    const title = readOptionalString('title' in post ? post.title : '')

    if (!uid || !title) {
      continue
    }

    titleByPath.set(`/blog/${uid}`, title)
  }

  for (const page of contentPages.docs) {
    const uid = readOptionalString('uid' in page ? page.uid : '')
    const title = readOptionalString('title' in page ? page.title : '')

    if (!uid || !title) {
      continue
    }

    if (LEGAL_SLUG_ALLOWLIST.has(uid)) {
      titleByPath.set(`/legal/${uid}`, title)
      continue
    }

    titleByPath.set(`/${uid}`, title)
  }

  return titleByPath
}

async function loadTitleOverrides(siteOrigin: string, payload?: PayloadClient) {
  const [siteTitles, cmsTitles] = await Promise.all([
    loadSiteTitleOverrides(siteOrigin),
    loadCmsTitleOverrides(payload),
  ])

  const merged = new Map(siteTitles)

  for (const [pathname, title] of cmsTitles) {
    merged.set(pathname, title)
  }

  return merged
}

function resolveCanonicalSiteDomain(siteDomainCounts: Map<string, number>, preferredSiteDomain?: null | string) {
  const rankedSiteDomains = [...siteDomainCounts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })

  if (preferredSiteDomain) {
    return siteDomainCounts.has(preferredSiteDomain) ? preferredSiteDomain : null
  }

  if (rankedSiteDomains.length === 0) {
    return null
  }

  if (rankedSiteDomains.length === 1) {
    return rankedSiteDomains[0]?.[0] ?? null
  }

  const [topSiteDomain, topCount] = rankedSiteDomains[0] ?? []
  const nextCount = rankedSiteDomains[1]?.[1] ?? 0

  return typeof topSiteDomain === 'string' && topCount > nextCount ? topSiteDomain : null
}

function sanitizeEntries(input: { entries: string[]; preferredSiteDomain?: null | string }) {
  const normalizedEntries = normalizeEntries(input.entries)
  const entryRecords = normalizedEntries
    .map((entry) => {
      const url = extractUrl(entry)
      const hostname = url ? normalizeHostname(url) : null
      const siteDomain = hostname ? collapseHostnameToSiteDomain(hostname) : null

      return {
        entry,
        siteDomain,
      }
    })
    .filter((record): record is { entry: string; siteDomain: string } => Boolean(record.siteDomain))

  const siteDomainCounts = new Map<string, number>()

  for (const record of entryRecords) {
    siteDomainCounts.set(record.siteDomain, (siteDomainCounts.get(record.siteDomain) ?? 0) + 1)
  }

  const canonicalSiteDomain = resolveCanonicalSiteDomain(siteDomainCounts, input.preferredSiteDomain)
  const sanitizedEntries = canonicalSiteDomain
    ? entryRecords.filter((record) => record.siteDomain === canonicalSiteDomain).map((record) => record.entry)
    : []

  return {
    articleSiteHostname: canonicalSiteDomain,
    droppedEntryCount: normalizedEntries.length - sanitizedEntries.length,
    entries: sanitizedEntries,
  }
}

async function buildSitemapInternalLinksDocument(siteKey: string, payload?: PayloadClient) {
  if (shouldDisableSitemapGeneration()) {
    return null
  }

  const siteOrigin = getSiteOriginForKey(siteKey)

  if (!siteOrigin) {
    return null
  }

  const cacheKey = `${siteKey}:${siteOrigin}:${DEFAULT_INTERNAL_LINK_LOCALE}`
  const cached = sitemapDocumentCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    if (cached.inFlight) {
      return cached.inFlight
    }

    return cached.document
  }

  const inFlight = (async () => {
    const sitemapUrl = new URL(getInternalLinksSitemapPath(), siteOrigin).toString()
    const sitemapXml = await fetchText(sitemapUrl)
    const titleByPath = await loadTitleOverrides(siteOrigin, payload)
    const siteDomain = normalizeSiteDomain(siteOrigin)
    const entries = extractXmlLocValues(sitemapXml)
      .map((url) => normalizeSitemapUrl(url, siteOrigin))
      .filter((url): url is string => Boolean(url))
      .filter((url) => shouldIncludeSitemapPath(new URL(url).pathname))
      .map((url) => {
        const pathname = normalizeUrlPath(new URL(url).pathname)
        const title = titleByPath.get(pathname) ?? buildGeneratedTitleForPath(pathname)

        return `${title} (${url})`
      })

    const sanitized = sanitizeEntries({
      entries,
      preferredSiteDomain: siteDomain,
    })

    if (!sanitized.entries.length || !sanitized.articleSiteHostname) {
      return null
    }

    return {
      articleSiteHostname: sanitized.articleSiteHostname,
      content: `${sanitized.entries.join('\n')}\n`,
      droppedEntryCount: sanitized.droppedEntryCount,
      entryCount: sanitized.entries.length,
      filename: 'InternalLinks.txt',
      generatedAt: new Date().toISOString(),
      siteKey,
      sourcePath: sitemapUrl,
      sourceSitemaps: [sitemapUrl],
    } satisfies InternalLinksDocument
  })()

  sitemapDocumentCache.set(cacheKey, {
    document: cached?.document ?? null,
    expiresAt: Date.now() + getInternalLinksGenerationCacheTtlMs(),
    inFlight,
  })

  try {
    const document = await inFlight

    sitemapDocumentCache.set(cacheKey, {
      document,
      expiresAt: Date.now() + getInternalLinksGenerationCacheTtlMs(),
      inFlight: null,
    })

    return document
  } catch {
    sitemapDocumentCache.set(cacheKey, {
      document: null,
      expiresAt: Date.now() + Math.min(getInternalLinksGenerationCacheTtlMs(), 5 * 60 * 1000),
      inFlight: null,
    })

    return null
  }
}

export async function resolveInternalLinksDocument(input: {
  payload?: PayloadClient
  sourceUrl: string
  targetSiteKey?: null | string
}): Promise<InternalLinksResolution> {
  const targetSiteKey = input.targetSiteKey ?? DEFAULT_INTERNAL_LINK_SITE_KEY
  const generatedDocument = await buildSitemapInternalLinksDocument(targetSiteKey, input.payload)

  if (!generatedDocument) {
    return {
      availableSiteKeys: [],
      document: null,
      rejectedDatasets: [],
      resolvedSiteKey: null,
      resolutionStrategy: 'none',
      targetSiteKey,
      targetSiteRejection: null,
    }
  }

  return {
    availableSiteKeys: [generatedDocument.siteKey],
    document: generatedDocument,
    rejectedDatasets: [],
    resolvedSiteKey: generatedDocument.siteKey,
    resolutionStrategy: 'generated_sitemap',
    targetSiteKey,
    targetSiteRejection: null,
  }
}

export function buildBriefInternalLinksInstruction(entryCount: number) {
  return [
    'You may also receive InternalLinks.txt, a generated list of site-owned pages from the live production sitemap that can be used as article internal links.',
    `If InternalLinks.txt is present, SeoBrief.internal_links should usually contain the most relevant 3 to 8 entries from that file, copied exactly as written. The file currently contains ${entryCount} candidate links.`,
    'Do not invent URLs, do not include links that are off-topic, and do not include generic pages like pricing, contact, or legal unless they directly help the reader intent.',
    'Only leave SeoBrief.internal_links empty as a last resort when none of the candidates genuinely fit. If you do that, add a brief explanation to SeoBrief.on_page_requirements so the omission is explicit rather than silent.',
  ].join('\n')
}

export function buildValidateInternalLinksInstruction(entryCount: number) {
  return [
    'If InternalLinks.txt is present, treat it as the source of truth for internal linking candidates.',
    `Ensure FinalizedBrief.SeoBrief.internal_links contains only relevant entries copied from InternalLinks.txt, usually 3 to 8 items out of the ${entryCount} available candidates.`,
    'Preserve relevant internal links from the draft brief unless they are clearly a bad fit. Remove invented, duplicate, broken-fit, or overly promotional entries. Prefer educational pages that naturally support the article topic.',
    'If the finalized internal_links array is empty while InternalLinks.txt was provided, ReviewLog must explicitly explain why no candidate links were appropriate.',
  ].join('\n')
}

export function buildWriteInternalLinksInstruction(entryCount: number) {
  return [
    'InternalLinks.txt is a sitemap-backed list of site-owned pages available for natural internal linking.',
    `Use it to place at least 3 relevant markdown links in the article when the draft provides enough natural opportunities, typically 3 to 5 links chosen from the ${entryCount} available candidates.`,
    'Spread links across the article, with most of them in body sections rather than clustering them all in the conclusion.',
    'Only link when the destination genuinely supports the surrounding paragraph. Use the exact URL from InternalLinks.txt, write natural anchor text, avoid link stuffing, and do not link generic pricing/contact/legal pages unless the context clearly calls for them.',
  ].join('\n')
}

export function resetInternalLinksResolverCacheForTests() {
  sitemapDocumentCache.clear()
}
