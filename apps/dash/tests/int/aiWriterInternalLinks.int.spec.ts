import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resetInternalLinksResolverCacheForTests,
  resolveInternalLinksDocument,
} from '@/lib/aiWriter/agentic/internalLinks'

function createTextResponse(body: string, status = 200, contentType = 'text/plain') {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
    },
    status,
  })
}

describe('ai writer internal links resolution', () => {
  afterEach(() => {
    delete process.env.AI_WRITER_INTERNAL_LINKS_DISABLE_SITEMAP_FETCH
    delete process.env.AI_WRITER_INTERNAL_LINKS_SITEMAP_PATH
    delete process.env.AI_WRITER_INTERNAL_LINKS_SITE_ORIGIN
    delete process.env.AI_WRITER_INTERNAL_LINKS_GATEKEEPR_ORIGIN
    resetInternalLinksResolverCacheForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('generates InternalLinks.txt from the production sitemap and enriches site pages from llms.txt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === 'https://gatekeepr.io/sitemap.xml') {
        return createTextResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://gatekeepr.io/disposable-email-checker</loc></url>
            <url><loc>https://gatekeepr.io/disposable-email-data</loc></url>
            <url><loc>https://gatekeepr.io/category/guides</loc></url>
            <url><loc>https://gatekeepr.io/blog</loc></url>
            <url><loc>https://gatekeepr.io/legal/terms-of-service</loc></url>
          </urlset>`,
          200,
          'application/xml',
        )
      }

      if (url === 'https://gatekeepr.io/llms.txt') {
        return createTextResponse(
          `# Gatekeepr

- [Disposable Email Checker](https://gatekeepr.io/disposable-email-checker): Check whether an email uses disposable infrastructure.
- [Disposable Email Data](https://gatekeepr.io/disposable-email-data): Daily-refreshed disposable domain and MX intelligence.
`,
        )
      }

      return createTextResponse('', 404)
    })

    vi.stubGlobal('fetch', fetchMock)

    const resolution = await resolveInternalLinksDocument({
      sourceUrl: 'https://www.scrapingbee.com/blog/how-to-scrape-expedia/',
    })

    expect(resolution.resolutionStrategy).toBe('generated_sitemap')
    expect(resolution.resolvedSiteKey).toBe('gatekeepr')
    expect(resolution.document?.sourcePath).toBe('https://gatekeepr.io/sitemap.xml')
    expect(resolution.document?.content).toContain(
      'Disposable Email Checker (https://gatekeepr.io/disposable-email-checker)',
    )
    expect(resolution.document?.content).toContain(
      'Disposable Email Data (https://gatekeepr.io/disposable-email-data)',
    )
    expect(resolution.document?.content).not.toContain('/category/guides')
    expect(resolution.document?.content).not.toContain('https://gatekeepr.io/blog')
    expect(resolution.document?.content).not.toContain('/legal/terms-of-service')
  })

  it('uses CMS titles when a sitemap URL matches existing CMS content', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === 'https://gatekeepr.io/sitemap.xml') {
        return createTextResponse(
          `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://gatekeepr.io/blog/signup-protection-guide</loc></url>
          </urlset>`,
          200,
          'application/xml',
        )
      }

      if (url === 'https://gatekeepr.io/llms.txt') {
        return createTextResponse(
          `# Gatekeepr

- [Fallback Title](https://gatekeepr.io/blog/signup-protection-guide): Placeholder title.
`,
        )
      }

      return createTextResponse('', 404)
    })

    const payload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'blog-posts') {
          return {
            docs: [
              {
                title: 'Signup Protection Guide',
                uid: 'signup-protection-guide',
              },
            ],
          }
        }

        if (collection === 'content-pages') {
          return {
            docs: [],
          }
        }

        throw new Error(`Unexpected collection: ${collection}`)
      }),
    } as unknown as Payload

    vi.stubGlobal('fetch', fetchMock)

    const resolution = await resolveInternalLinksDocument({
      payload,
      sourceUrl: 'https://www.scrapingbee.com/blog/how-to-scrape-expedia/',
    })

    expect(resolution.document?.content).toContain(
      'Signup Protection Guide (https://gatekeepr.io/blog/signup-protection-guide)',
    )
    expect(resolution.document?.content).not.toContain('Fallback Title')
  })

  it('does not fall back to a filesystem dataset when sitemap generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unavailable')
      }),
    )

    const resolution = await resolveInternalLinksDocument({
      sourceUrl: 'https://www.scrapingbee.com/blog/how-to-scrape-expedia/',
    })

    expect(resolution.resolutionStrategy).toBe('none')
    expect(resolution.document).toBeNull()
    expect(resolution.rejectedDatasets).toEqual([])
  })
})
