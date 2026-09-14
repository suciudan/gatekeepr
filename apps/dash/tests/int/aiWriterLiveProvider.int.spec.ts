import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callAnthropicGeneratedFileMock, createWriterTraceEventMock } = vi.hoisted(() => ({
  callAnthropicGeneratedFileMock: vi.fn(),
  createWriterTraceEventMock: vi.fn(),
}))

vi.mock('@/lib/aiWriter/provider', () => ({
  callAIWriterGeneratedFile: callAnthropicGeneratedFileMock,
}))

vi.mock('@/lib/aiWriter/repository', () => ({
  createWriterTraceEvent: createWriterTraceEventMock,
}))

import { convertHtmlToMarkdownDocument } from '@/lib/aiWriter/htmlToMarkdown'
import { createLiveWriterAutomationProvider } from '@/lib/aiWriter/liveProvider'

describe('ai writer live provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('builds a complete markdown document from short html without a heading', () => {
    const markdown = convertHtmlToMarkdownDocument({
      html: `<div><p>UPDATE: The method I came up with was remaking the script to take in a list of Yelp URLs from a text file.</p><p>The URLs I'll get from a chrome extension called "Instant Data Scraper", which works since it just runs in the browser.</p></div>`,
      title: 'Yelp seems to have cracked down on scraping',
    })

    expect(markdown).toContain('# Yelp seems to have cracked down on scraping')
    expect(markdown).toContain('UPDATE: The method I came up with was remaking the script')
    expect(markdown).toContain('The URLs I\'ll get from a chrome extension called "Instant Data Scraper"')
  })

  it('falls back to local html-to-markdown when anthropic does not return article.md', async () => {
    callAnthropicGeneratedFileMock.mockRejectedValue(
      new Error('Anthropic did not create the expected output file article.md.'),
    )

    const provider = createLiveWriterAutomationProvider()

    const result = await provider.convertArticleToMarkdown({
      article: {
        html: `<div><p>UPDATE: The method I came up with was remaking the script to take in a list of Yelp URLs from a text file.</p><p>The URLs I'll get from a chrome extension called "Instant Data Scraper", which works since it just runs in the browser.</p></div>`,
        title: 'Yelp seems to have cracked down on scraping',
      },
      run: {
        id: 12,
      } as never,
      source: {
        id: 85,
        url: 'https://www.reddit.com/r/webscraping/comments/1g2sd32/yelp_seems_to_have_cracked_down_on_scraping/',
      } as never,
    })

    expect(result.markdown).toContain('# Yelp seems to have cracked down on scraping')
    expect(result.markdown).toContain('UPDATE: The method I came up with was remaking the script')
    expect(result.raw).toEqual(
      expect.objectContaining({
        fallbackReason: 'Anthropic did not create the expected output file article.md.',
      }),
    )
    expect(callAnthropicGeneratedFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'article.md',
        inputFiles: [
          expect.objectContaining({
            content: expect.stringContaining('UPDATE: The method I came up with was remaking the script'),
            filename: 'SourceArticle.html',
            mimeType: 'text/html',
          }),
        ],
        prompt: expect.stringContaining('Convert the uploaded SourceArticle.html file into a complete markdown document.'),
      }),
      expect.anything(),
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Create article.md with bash_code_execution so it is returned as a downloadable file artifact.',
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Reply with a short confirmation only after article.md is returned as a downloadable file artifact.',
    )
    expect(createWriterTraceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'markdown_convert_local_fallback',
        provider: 'local',
        runID: 12,
        sourceID: 85,
        stageKey: 'convert_markdown',
        status: 'completed',
      }),
    )
  })

  it('falls back to local html-to-markdown when anthropic markdown generation times out', async () => {
    vi.useFakeTimers()
    callAnthropicGeneratedFileMock.mockImplementation(() => new Promise(() => {}))

    const provider = createLiveWriterAutomationProvider()

    const resultPromise = provider.convertArticleToMarkdown({
      article: {
        html: `<div><p>UPDATE: The method I came up with was remaking the script to take in a list of Yelp URLs from a text file.</p><p>The URLs I'll get from a chrome extension called "Instant Data Scraper", which works since it just runs in the browser.</p></div>`,
        title: 'Yelp seems to have cracked down on scraping',
      },
      run: {
        id: 12,
      } as never,
      source: {
        id: 85,
        url: 'https://www.reddit.com/r/webscraping/comments/1g2sd32/yelp_seems_to_have_cracked_down_on_scraping/',
      } as never,
    })

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    const result = await resultPromise

    expect(result.markdown).toContain('# Yelp seems to have cracked down on scraping')
    expect(result.raw).toEqual(
      expect.objectContaining({
        fallbackReason: 'Anthropic markdown conversion timed out after 300 seconds.',
      }),
    )
    expect(createWriterTraceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'markdown_convert_local_fallback',
        provider: 'local',
      }),
    )
  })

  it('falls back to local markdown-to-blocks extraction when anthropic does not return blocks.json', async () => {
    callAnthropicGeneratedFileMock.mockRejectedValue(
      new Error('Anthropic did not create the expected output file blocks.json.'),
    )

    const provider = createLiveWriterAutomationProvider()

    const result = await provider.convertMarkdownToBlocks({
      markdown: [
        '# How to Scrape Yelp',
        '',
        'Scraping Yelp requires careful request handling and parser stability.',
        '',
        '## Build the Request Layer',
        '',
        '- Normalize search URLs before scraping.',
        '- Rotate headers and back off on retries.',
      ].join('\n'),
      run: {
        id: 12,
      } as never,
      source: {
        id: 85,
        url: 'https://www.reddit.com/r/webscraping/comments/1g2sd32/yelp_seems_to_have_cracked_down_on_scraping/',
      } as never,
    })

    expect(result.blocks.length).toBeGreaterThan(0)
    expect(result.blocks[0]?.heading).toBe('How to Scrape Yelp')
    expect(result.raw).toEqual(
      expect.objectContaining({
        fallbackReason: 'Anthropic did not create the expected output file blocks.json.',
      }),
    )
    expect(callAnthropicGeneratedFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'blocks.json',
        inputFiles: [
          expect.objectContaining({
            content: expect.stringContaining('# How to Scrape Yelp'),
            filename: 'SourceArticle.md',
            mimeType: 'text/markdown',
          }),
        ],
        prompt: expect.stringContaining('Transform the uploaded SourceArticle.md file into a JSON array of structured content blocks.'),
      }),
      expect.anything(),
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Create blocks.json with bash_code_execution so it is returned as a downloadable file artifact.',
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Reply with a short confirmation only after blocks.json is returned as a downloadable file artifact.',
    )
    expect(createWriterTraceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'blocks_extract_local_fallback',
        provider: 'local',
        runID: 12,
        sourceID: 85,
        stageKey: 'extract_blocks',
        status: 'completed',
      }),
    )
  })

  it('falls back to a local factpack when anthropic does not return FactPack.json', async () => {
    callAnthropicGeneratedFileMock.mockRejectedValue(
      new Error('Anthropic did not create the expected output file FactPack.json.'),
    )

    const provider = createLiveWriterAutomationProvider()

    const result = await provider.buildFactpack({
      run: {
        id: 12,
        targetKeyword: 'how to scrape Yelp',
        targetWordCount: 4000,
      } as never,
      sources: [
        {
          blocks: [
            {
              block_id: 'B1',
              heading: 'How to Scrape Yelp',
              kind: 'section',
              markdown: '## How to Scrape Yelp\n\nScraping Yelp requires careful request handling. 25% of pages may trigger anti-bot checks.',
              order: 1,
              plain_text: 'Scraping Yelp requires careful request handling. 25% of pages may trigger anti-bot checks.',
              word_count: 13,
            },
            {
              block_id: 'B2',
              heading: 'Build the Request Layer',
              kind: 'list',
              markdown: '- Normalize search URLs before scraping.\n- Rotate headers and back off on retries.',
              order: 2,
              plain_text: 'Normalize search URLs before scraping. Rotate headers and back off on retries.',
              word_count: 12,
            },
          ],
          markdown: '',
          source: {
            url: 'https://example.com/yelp-guide',
          } as never,
        },
      ],
    })
    const factpack = result.factpack as {
      claims: unknown[]
      steps: unknown[]
    }

    expect(factpack.claims.length).toBeGreaterThan(0)
    expect(factpack.steps.length).toBeGreaterThan(0)
    expect(result.raw).toEqual(
      expect.objectContaining({
        fallbackReason: 'Anthropic did not create the expected output file FactPack.json.',
      }),
    )
    expect(callAnthropicGeneratedFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'FactPack.json',
        inputFiles: [
          expect.objectContaining({
            content: expect.stringContaining('"targetKeyword": "how to scrape Yelp"'),
            filename: 'SourceBlocks.json',
            mimeType: 'application/json',
          }),
        ],
        prompt: expect.stringContaining('Build a factpack from the uploaded SourceBlocks.json file.'),
      }),
      expect.anything(),
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Create FactPack.json with bash_code_execution so it is returned as a downloadable file artifact.',
    )
    expect(callAnthropicGeneratedFileMock.mock.calls[0]?.[0].prompt).toContain(
      'Reply with a short confirmation only after FactPack.json is returned as a downloadable file artifact.',
    )
    expect(createWriterTraceEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'factpack_generate_local_fallback',
        provider: 'local',
        runID: 12,
        stageKey: 'build_factpack',
        status: 'completed',
      }),
    )
  })

  it('waits for a slow anthropic FactPack before using local fallback', async () => {
    vi.useFakeTimers()
    const generatedFactpack = {
      claims: [
        {
          needs_verification: false,
          source_block_id: 'B1',
          source_url: 'https://example.com/yelp-guide',
          text: 'Scrapy Playwright renders JavaScript-heavy pages inside Scrapy.',
        },
      ],
      definitions: [],
      quotes: [],
      stats: [],
      steps: [],
    }
    callAnthropicGeneratedFileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              file: {
                content: JSON.stringify(generatedFactpack),
                downloadable: true,
                fileId: 'file_factpack',
                filename: 'FactPack.json',
                mimeType: 'application/json',
                sizeBytes: 100,
              },
              text: 'Created FactPack.json',
            })
          }, 95_000)
        }),
    )

    const provider = createLiveWriterAutomationProvider()
    const resultPromise = provider.buildFactpack({
      run: {
        id: 12,
        targetKeyword: 'Scrapy Playwright',
        targetWordCount: 4000,
      } as never,
      sources: [
        {
          blocks: [
            {
              block_id: 'B1',
              heading: 'How to Scrape Yelp',
              kind: 'section',
              markdown: '## How to Scrape Yelp\n\nScraping Yelp requires careful request handling.',
              order: 1,
              plain_text: 'Scraping Yelp requires careful request handling.',
              word_count: 6,
            },
          ],
          markdown: '',
          source: {
            url: 'https://example.com/yelp-guide',
          } as never,
        },
      ],
    })

    await vi.advanceTimersByTimeAsync(95_000)
    const result = await resultPromise

    expect(result.factpack).toEqual(generatedFactpack)
    expect(result.raw).toEqual(
      expect.objectContaining({
        confirmationText: 'Created FactPack.json',
      }),
    )
    expect(createWriterTraceEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'factpack_generate_local_fallback',
      }),
    )
  })
})
