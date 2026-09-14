import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

const serverURL = process.env.PLAYWRIGHT_CMS_BASE_URL?.trim() || 'http://localhost:4000'
const managesLocalServer = serverURL === 'http://localhost:4000'

const targetKeyword = 'how to scrape Yelp'
const sourceUrl = 'https://www.scraperapi.com/web-scraping/yelp/'
const selectedSourceTitles = [
  'How to Scrape Yelp.com (2026 update)',
  'Yelp seems to have cracked down on scraping',
  'How to scrape Yelp data using Python (Places and Reviews)',
]

type RunDetailResponse = {
  artifacts: Array<{
    artifactType: string
    content: string
    filename: string
  }>
  run: {
    currentStage: null | string
    errorMessage: null | string
    id: number
    status: string
  }
  sources: Array<{
    id: number
    role: string
    selected: boolean
    title: null | string
  }>
}

function extractMarkdownLinkUrls(markdown: string) {
  return [...markdown.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1] ?? '')
}

async function apiRequest<T>(
  page: Page,
  path: string,
  options?: {
    body?: unknown
    method?: 'GET' | 'POST'
  },
): Promise<T> {
  const method = options?.method ?? 'GET'

  return page.evaluate(
    async ({ body, method, path }) => {
      const response = await fetch(path, {
        body: body == null ? undefined : JSON.stringify(body),
        credentials: 'include',
        headers: body == null ? undefined : { 'Content-Type': 'application/json' },
        method,
      })

      const json = (await response.json()) as unknown

      if (!response.ok) {
        throw new Error(`API ${method} ${path} failed (${response.status}): ${JSON.stringify(json)}`)
      }

      return json as T
    },
    {
      body: options?.body,
      method,
      path,
    },
  )
}

async function pollRun(page: Page, runID: number, predicate: (detail: RunDetailResponse) => boolean, timeoutMs = 180_000) {
  const startedAt = Date.now()
  const history: Array<{
    currentStage: null | string
    errorMessage: null | string
    status: string
  }> = []

  while (Date.now() - startedAt < timeoutMs) {
    const detail = await apiRequest<RunDetailResponse>(page, `/api/ai-writer/runs/${runID}`)

    history.push({
      currentStage: detail.run.currentStage,
      errorMessage: detail.run.errorMessage,
      status: detail.run.status,
    })

    if (detail.run.status === 'failed') {
      throw new Error(`Run ${runID} failed at ${detail.run.currentStage}: ${detail.run.errorMessage}\n${JSON.stringify(history, null, 2)}`)
    }

    if (predicate(detail)) {
      return {
        detail,
        history,
      }
    }

    await page.waitForTimeout(5_000)
  }

  throw new Error(`Timed out waiting for run ${runID}\n${JSON.stringify(history, null, 2)}`)
}

test.describe('AI Writer Yelp flow', () => {
  test.skip(
    process.env.RUN_LIVE_AI_WRITER_E2E !== 'true',
    'Live AI writer tests contact external sources and paid providers; opt in explicitly.',
  )

  test.beforeAll(async () => {
    if (managesLocalServer) {
      await seedTestUser()
    }
  })

  test.afterAll(async () => {
    if (managesLocalServer) {
      await cleanupTestUser()
    }
  })

  test('generates an article draft and local check report for the Yelp writer flow', async ({ page }) => {
    await login({
      page,
      serverURL,
      user: testUser,
    })

    const created = await apiRequest<RunDetailResponse>(page, '/api/ai-writer/runs', {
      body: {
        sourceUrl,
        targetKeyword,
      },
      method: 'POST',
    })

    const runID = created.run.id
    const selectedSourceIDs = created.sources
      .filter((source) => source.role === 'competitor')
      .filter((source) => selectedSourceTitles.includes(source.title ?? ''))
      .map((source) => source.id)

    expect(selectedSourceIDs).toHaveLength(3)

    await apiRequest<RunDetailResponse>(page, `/api/ai-writer/runs/${runID}/select-sources`, {
      body: {
        sourceIDs: selectedSourceIDs,
      },
      method: 'POST',
    })

    await pollRun(page, runID, (detail) => detail.run.status === 'awaiting_user' && detail.run.currentStage === 'brief')

    await apiRequest<RunDetailResponse>(page, `/api/ai-writer/runs/${runID}/brief`, {
      method: 'POST',
    })

    await pollRun(page, runID, (detail) => detail.run.status === 'awaiting_user' && detail.run.currentStage === 'validate')

    await apiRequest<RunDetailResponse>(page, `/api/ai-writer/runs/${runID}/validate`, {
      method: 'POST',
    })

    await pollRun(page, runID, (detail) => detail.run.status === 'awaiting_user' && detail.run.currentStage === 'write')

    const afterWrite = await apiRequest<RunDetailResponse>(page, `/api/ai-writer/runs/${runID}/write`, {
      method: 'POST',
    })

    const articleArtifact = afterWrite.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')

    expect(articleArtifact).toBeTruthy()
    expect(articleArtifact?.filename).toBe('article-draft.md')
    expect(articleArtifact?.content).toContain('# ')

    await page.goto(`${serverURL}/admin/collections/writer-runs/${runID}`)
    await expect(page).toHaveURL(`${serverURL}/admin/collections/writer-runs/${runID}`)

    const { detail: afterCheck } = await pollRun(
      page,
      runID,
      (detail) =>
        detail.artifacts.some((artifact) => artifact.artifactType === 'check_report_json') &&
        (detail.run.status === 'awaiting_user' || detail.run.status === 'completed'),
      300_000,
    )

    const finalArticleArtifact = afterCheck.artifacts.find(
      (artifact) => artifact.artifactType === 'article_revision_md' || artifact.artifactType === 'article_draft_md',
    )
    const checkArtifact = afterCheck.artifacts.find((artifact) => artifact.artifactType === 'check_report_json')

    expect(finalArticleArtifact).toBeTruthy()
    expect(checkArtifact).toBeTruthy()

    const markdownLinks = extractMarkdownLinkUrls(finalArticleArtifact?.content ?? '')

    expect(markdownLinks.some((url) => url.includes('gatekeepr.io/'))).toBe(true)
    expect(markdownLinks.some((url) => !url.includes('gatekeepr.io/'))).toBe(true)

    await expect(page.getByText('Check results')).toBeVisible()
    await expect(page.getByText('check-report.json')).toBeVisible()
  })
})
