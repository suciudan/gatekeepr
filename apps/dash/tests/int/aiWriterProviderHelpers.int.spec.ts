import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkedInClaudePromptDefaults } from '@/lib/aiWriter/agentic/checked-in-claude-prompt-defaults'
import { callAnthropicGeneratedFile, extractJsonFromResponseText, stripTrailingCommasFromJsonLikeText } from '@/lib/aiWriter/anthropic'
import { extractWriterSerpResults } from '@/lib/aiWriter/brightdata'
import { callOpenAIGeneratedFile, callOpenAIJson } from '@/lib/aiWriter/openai'
import { clearOpenAIModelCacheForTests, resolveOpenAIModel } from '@/lib/aiWriter/openaiModels'

function anthropicStreamingResponse(events: Array<{ data: unknown; event?: string }>) {
  const encoder = new TextEncoder()
  const payload = `${events
    .map(({ data, event }) => `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}`)
    .join('\n\n')}\n\n`
  const midpoint = Math.max(1, Math.floor(payload.length / 2))

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload.slice(0, midpoint)))
        controller.enqueue(encoder.encode(payload.slice(midpoint)))
        controller.close()
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
      },
      status: 200,
    },
  )
}

describe('ai writer provider helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    clearOpenAIModelCacheForTests()
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  it('extracts structured JSON from fenced anthropic output', () => {
    const payload = extractJsonFromResponseText('```json\n{"items":[{"name":"Brief"}]}\n```')

    expect(JSON.parse(payload)).toEqual({
      items: [{ name: 'Brief' }],
    })
  })

  it('removes trailing commas from json-like text', () => {
    const repaired = stripTrailingCommasFromJsonLikeText('{"items":[{"name":"Brief",},],}')

    expect(JSON.parse(repaired)).toEqual({
      items: [{ name: 'Brief' }],
    })
  })

  it('calls OpenAI responses and returns inline generated file content', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.OPENAI_MODEL = 'gpt-test'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ output_text: '# Generated article' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
    )

    const generated = await callOpenAIGeneratedFile({
      filename: 'article.md',
      inputFiles: [
        {
          content: '<h1>Source</h1>',
          filename: 'SourceArticle.html',
          mimeType: 'text/html',
        },
      ],
      prompt: 'Create article.md from SourceArticle.html.',
      system: 'You write complete markdown articles.',
    })
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses')
    expect(requestBody.model).toBe('gpt-test')
    expect(requestBody.instructions).toContain('You write complete markdown articles.')
    expect(requestBody.input).toContain('Provider note: this run is using ChatGPT')
    expect(requestBody.input).toContain('<file name="SourceArticle.html" mime_type="text/html">')
    expect(generated.file).toEqual(
      expect.objectContaining({
        content: '# Generated article',
        downloadable: false,
        filename: 'article.md',
        mimeType: 'text/markdown',
        provider: 'openai',
      }),
    )
    expect(generated.file.fileId).toMatch(/^inline:openai:/)
  })

  it('retries OpenAI generated files when the model returns only a confirmation', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.OPENAI_MODEL = 'gpt-test'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output_text: 'Done.' }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output_text: '{"SeoBrief":{"title":"Retry"},"additional_sources":[]}' }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        }),
      )

    const generated = await callOpenAIGeneratedFile({
      filename: 'BRIEF.json',
      prompt: 'Create BRIEF.json.',
      system: 'Return JSON.',
    })
    const retryBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(retryBody.input).toContain('OpenAI returned a confirmation instead of BRIEF.json content.')
    expect(retryBody.input).toContain('Return valid JSON only.')
    expect(generated.file.content).toContain('"SeoBrief"')
  })

  it('parses OpenAI JSON responses with minor trailing comma repair', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.OPENAI_MODEL = 'gpt-test'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ output_text: '{"ok":true,}' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
    )

    const payload = await callOpenAIJson<{ ok: boolean }>({
      filename: 'output.json',
      prompt: 'Return JSON.',
      system: 'Return JSON only.',
    })

    expect(payload).toEqual({ ok: true })
  })

  it('resolves the selected OpenAI model from models visible to the API key', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'gpt-4.1' },
            { id: 'gpt-image-1' },
            { id: 'text-embedding-3-small' },
          ],
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      ),
    )

    await expect(resolveOpenAIModel('gpt-4.1')).resolves.toBe('gpt-4.1')
    await expect(resolveOpenAIModel('gpt-5.2')).resolves.toBe('gpt-4.1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models')
  })

  it('lets OPENAI_MODEL override account model discovery when explicitly set', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.OPENAI_MODEL = 'gpt-explicit'
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(resolveOpenAIModel('gpt-4.1')).resolves.toBe('gpt-explicit')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps checked-in generated-file prompts explicit about downloadable artifacts', () => {
    expect(checkedInClaudePromptDefaults.brief_user_template).toContain(
      'Create `BRIEF.json` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.brief_user_template).toContain(
      'Reply with a short confirmation only after `BRIEF.json` is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.validate_user_template).toContain(
      'Create `ValidationOutput.json` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.validate_user_template).toContain(
      'Reply with a short confirmation only after `ValidationOutput.json` is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.write_system).toContain(
      'Write the complete Markdown to the runtime output file with `bash_code_execution`',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'Create `article.md` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'Do one compact final export pass. Do not run repeated rewrite/budget-check loops',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'At least one H2 contains the exact `target_keyword` string.',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'The conclusion CTA must mention `Gatekeepr` exactly once',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'Meta description is 150–160 characters.',
    )
    expect(checkedInClaudePromptDefaults.write_system).toContain(
      'The finalized outline may use `h2/subsections/h3` instead of `level/heading`',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'Do not embed the final article as one raw Python triple-quoted string.',
    )
    expect(checkedInClaudePromptDefaults.write_user_template).toContain(
      'assigning a JSON-escaped string via `json.loads(...)`',
    )
    expect(checkedInClaudePromptDefaults.check_system).toContain('downloadable file artifact')
    expect(checkedInClaudePromptDefaults.check_user_template).toContain('downloadable file artifact')
    expect(checkedInClaudePromptDefaults.write_internal_link_overlay_template).toContain(
      'Create `internal-link-ops.json` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    expect(checkedInClaudePromptDefaults.write_external_link_overlay_template).toContain(
      'Create `external-link-ops.json` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
  })

  it('normalizes and deduplicates organic serp results', () => {
    const results = extractWriterSerpResults({
      data: {
        organic_results: [
          {
            description: 'First result',
            position: 1,
            title: 'Competitor A',
            url: 'https://example.com/article/',
          },
          {
            description: 'Duplicate result',
            position: 2,
            title: 'Competitor A Duplicate',
            url: 'https://example.com/article',
          },
          {
            description: 'Second result',
            position: 3,
            title: 'Competitor B',
            url: 'https://example.com/other',
          },
        ],
      },
    })

    expect(results).toHaveLength(2)
    expect(results[0]?.normalizedUrl).toBe('https://example.com/article')
    expect(results[1]?.title).toBe('Competitor B')
  })

  it('extracts organic results from bright data wrapper payloads with a string body', () => {
    const results = extractWriterSerpResults({
      body: JSON.stringify({
        navigation: [
          {
            href: 'https://www.google.com/search?q=How+to+Scrape+Expedia&tbm=vid',
            title: 'Videos',
          },
        ],
        organic: [
          {
            description: 'ScrapingBee tutorial',
            link: 'https://www.scrapingbee.com/blog/how-to-scrape-expedia/',
            rank: 1,
            title: 'How to Scrape Expedia',
          },
          {
            description: 'ZenRows tutorial',
            link: 'https://www.zenrows.com/blog/web-scraping-expedia',
            rank: 2,
            title: 'Web Scraping Expedia',
          },
        ],
      }),
      headers: {
        'content-type': 'application/json',
      },
      status_code: 200,
    })

    expect(results).toHaveLength(2)
    expect(results[0]?.title).toBe('How to Scrape Expedia')
    expect(results[1]?.normalizedUrl).toBe('https://www.zenrows.com/blog/web-scraping-expedia')
  })

  it('fetches Oxylabs article HTML directly with Node fetch', async () => {
    vi.resetModules()

    const createWriterTraceEvent = vi.fn(async () => ({ id: 8282 }))
    let requestUserAgent: null | string = null

    vi.doMock('@/lib/aiWriter/repository', () => ({
      createWriterTraceEvent,
    }))

    try {
      const { fetchReadableArticleWithBrightData } = await import('@/lib/aiWriter/brightdata')

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        expect(_input).toBe('https://oxylabs.io/blog/example')
        requestUserAgent = new Headers(init?.headers).get('user-agent')

        return new Response(
          '<html><head><title>Ignored title</title><meta name="description" content="Meta summary"></head><body><article><h1>Oxylabs guide</h1><p>Readable Oxylabs article content.</p><script>ignored()</script></article></body></html>',
          {
            headers: {
              'content-type': 'text/html',
            },
            status: 200,
          },
        )
      })

      const article = await fetchReadableArticleWithBrightData('https://oxylabs.io/blog/example', {
        eventType: 'article_fetch',
        runID: 41,
        sourceID: 42,
        stageKey: 'convert_markdown',
      })

      expect(requestUserAgent).toContain('Mozilla/5.0')
      expect(article.finalUrl).toBe('https://oxylabs.io/blog/example')
      expect(article.html).toContain('Readable Oxylabs article content.')
      expect(article.html).not.toContain('ignored()')
      expect(article.metaDescription).toBe('Meta summary')
      expect(article.title).toBe('Ignored title')
      expect(createWriterTraceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'article_fetch',
          provider: 'fetch',
          requestPayload: {
            transport: 'node-fetch',
            url: 'https://oxylabs.io/blog/example',
          },
          responsePayload: expect.objectContaining({
            finalUrl: 'https://oxylabs.io/blog/example',
            ok: true,
            status: 200,
          }),
          runID: 41,
          sourceID: 42,
          stageKey: 'convert_markdown',
          status: 'completed',
        }),
      )
    } finally {
      vi.doUnmock('@/lib/aiWriter/repository')
      vi.resetModules()
    }
  })

  it('falls back to preferred HTML extraction when readability parsing throws', async () => {
    vi.resetModules()

    const createWriterTraceEvent = vi.fn(async () => ({ id: 8283 }))

    vi.doMock('@/lib/aiWriter/repository', () => ({
      createWriterTraceEvent,
    }))
    vi.doMock('jsdom', () => ({
      JSDOM: class {
        constructor() {
          throw new Error('")" is expected')
        }
      },
    }))

    try {
      const { fetchReadableArticleWithBrightData } = await import('@/lib/aiWriter/brightdata')

      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(
          '<html><head><title>Fallback title</title><meta name="description" content="Fallback meta"></head><body><main><h1>Fallback article</h1><p>Readable fallback content.</p><script>ignored()</script></main></body></html>',
          {
            headers: {
              'content-type': 'text/html',
            },
            status: 200,
          },
        ),
      )

      const article = await fetchReadableArticleWithBrightData('https://oxylabs.io/blog/fallback', {
        eventType: 'article_fetch',
        runID: 41,
        sourceID: 43,
        stageKey: 'convert_markdown',
      })

      expect(article.html).toContain('Readable fallback content.')
      expect(article.html).not.toContain('ignored()')
      expect(article.metaDescription).toBe('Fallback meta')
      expect(article.title).toBe('Fallback title')
    } finally {
      vi.doUnmock('@/lib/aiWriter/repository')
      vi.doUnmock('jsdom')
      vi.resetModules()
    }
  })

  it('uploads input files and returns the generated downloadable output file', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'
    const uploadedFiles: Array<{ content: string; filename: string; type: string }> = []
    let deletedFileId = ''
    let messageRequestBody: null | Record<string, unknown> = null
    let messageRequestHeaders: null | Record<string, string> = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = formData?.get('file')

        expect(uploadedFile).toBeTruthy()

        const file = uploadedFile as Blob & { arrayBuffer?: () => Promise<ArrayBuffer>; name?: string; size?: number; type?: string }
        const fileContent =
          typeof file.arrayBuffer === 'function' ? Buffer.from(await file.arrayBuffer()).toString('utf8') : String(file)

        uploadedFiles.push({
          content: fileContent,
          filename: file.name ?? 'unknown',
          type: file.type ?? 'application/octet-stream',
        })

        return new Response(
          JSON.stringify({
            filename: file.name ?? 'unknown',
            id: 'file_input_1',
            mime_type: file.type ?? 'application/octet-stream',
            size_bytes: file.size ?? fileContent.length,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/messages')) {
        messageRequestBody =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null
        messageRequestHeaders =
          init && typeof init === 'object' && init.headers && !Array.isArray(init.headers)
            ? (init.headers as Record<string, string>)
            : null

        return anthropicStreamingResponse([
          {
            event: 'message_start',
            data: {
              message: {
                content: [],
                role: 'assistant',
                stop_reason: null,
                type: 'message',
              },
              type: 'message_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                text: '',
                type: 'text',
              },
              index: 0,
              type: 'content_block_start',
            },
          },
          {
            event: 'content_block_delta',
            data: {
              delta: {
                text: 'Created BRIEF.json in the workspace.',
                type: 'text_delta',
              },
              index: 0,
              type: 'content_block_delta',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                content: {
                  content: [
                    {
                      file_id: 'file_output_1',
                      type: 'file',
                    },
                  ],
                  exit_code: 0,
                  stderr: '',
                  stdout: '',
                  type: 'bash_code_execution_result',
                },
                type: 'bash_code_execution_tool_result',
              },
              index: 1,
              type: 'content_block_start',
            },
          },
          {
            event: 'message_delta',
            data: {
              delta: {
                stop_reason: 'end_turn',
              },
              type: 'message_delta',
            },
          },
          {
            event: 'message_stop',
            data: {
              type: 'message_stop',
            },
          },
        ])
      }

      if (url.endsWith('/v1/files/file_output_1')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'BRIEF.json',
            id: 'file_output_1',
            mime_type: 'application/json',
            size_bytes: 42,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_output_1/content')) {
        return new Response('{"SeoBrief":{"target_keyword":"how to scrape yelp"},"additional_sources":[]}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      if (url.endsWith('/v1/files/file_input_1') && init?.method === 'DELETE') {
        deletedFileId = 'file_input_1'
        return new Response(JSON.stringify({ id: 'file_input_1', type: 'file' }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'BRIEF.json',
      inputFiles: [
        {
          content: '# SourceDoc',
          filename: 'SourceDoc.md',
          mimeType: 'text/markdown',
        },
      ],
      prompt: 'Read SourceDoc.md and write BRIEF.json.',
      system: 'You generate structured SEO briefs from uploaded files.',
    })

    expect(uploadedFiles).toEqual([
      {
        content: '[object File]',
        filename: 'SourceDoc.md',
        type: 'text/markdown',
      },
    ])
    expect(messageRequestBody).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Available uploaded files:\n- SourceDoc.md'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('Mandatory write protocol:'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('pathlib.Path(os.environ["INPUT_DIR"])'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('Do not hard-code "/uploads"'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('Do not write the deliverable until after your compact verification pass'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('Each bash_code_execution call can receive a fresh output directory'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('Do not read a previously written absolute path'),
                type: 'text',
              }),
              expect.objectContaining({
                text: expect.stringContaining('A text-only confirmation such as "I created BRIEF.json" is invalid'),
                type: 'text',
              }),
              expect.objectContaining({
                file_id: 'file_input_1',
                type: 'container_upload',
              }),
            ]),
          }),
        ],
        model: 'test-model',
        output_config: {
          effort: 'xhigh',
        },
        stream: true,
        thinking: {
          type: 'adaptive',
        },
        tools: [
          {
            name: 'code_execution',
            type: 'code_execution_20250825',
          },
        ],
      }),
    )
    expect(messageRequestBody).not.toHaveProperty('temperature')
    expect(messageRequestBody).not.toHaveProperty('top_k')
    expect(messageRequestBody).not.toHaveProperty('top_p')
    expect(messageRequestBody).not.toHaveProperty('tool_choice')
    expect(messageRequestHeaders?.['anthropic-beta']).toContain('code-execution-2025-08-25')
    expect(messageRequestHeaders?.['anthropic-beta']).toContain('files-api-2025-04-14')
    expect(generated.file.content).toBe('{"SeoBrief":{"target_keyword":"how to scrape yelp"},"additional_sources":[]}')
    expect(generated.file.downloadable).toBe(true)
    expect(generated.file.fileId).toBe('file_output_1')
    expect(generated.file.filename).toBe('BRIEF.json')
    expect(deletedFileId).toBe('file_input_1')
  })

  it('uses the last matching generated file when Claude rewrites the same filename', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        return anthropicStreamingResponse([
          {
            event: 'message_start',
            data: {
              message: {
                content: [],
                role: 'assistant',
                stop_reason: null,
                type: 'message',
              },
              type: 'message_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                content: {
                  content: [
                    {
                      file_id: 'file_old_article',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: 'first draft too short',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
              index: 0,
              type: 'content_block_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                content: {
                  content: [
                    {
                      file_id: 'file_new_article',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: 'rewritten final draft',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
              index: 1,
              type: 'content_block_start',
            },
          },
          {
            event: 'message_delta',
            data: {
              delta: {
                stop_reason: 'end_turn',
              },
              type: 'message_delta',
            },
          },
          {
            event: 'message_stop',
            data: {
              type: 'message_stop',
            },
          },
        ])
      }

      if (url.endsWith('/v1/files/file_old_article')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'article.md',
            id: 'file_old_article',
            mime_type: 'text/markdown',
            size_bytes: 11,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_new_article')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'article.md',
            id: 'file_new_article',
            mime_type: 'text/markdown',
            size_bytes: 18,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_old_article/content')) {
        return new Response('short draft', { status: 200 })
      }

      if (url.endsWith('/v1/files/file_new_article/content')) {
        return new Response('final corrected draft', { status: 200 })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'article.md',
      prompt: 'Write article.md.',
      system: 'You write markdown files.',
    })

    expect(generated.file.fileId).toBe('file_new_article')
    expect(generated.file.content).toBe('final corrected draft')
  })

  it('continues a pause_turn generated-file request until the downloadable file is returned', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        if (messageBodies.length === 1) {
          return anthropicStreamingResponse([
            {
              event: 'message_start',
              data: {
                container: {
                  id: 'container-pause-turn',
                },
                message: {
                  content: [],
                  role: 'assistant',
                  stop_reason: null,
                  type: 'message',
                },
                type: 'message_start',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  text: '',
                  type: 'text',
                },
                index: 0,
                type: 'content_block_start',
              },
            },
            {
              event: 'content_block_delta',
              data: {
                delta: {
                  text: 'Now I have all the data. Let me build the comprehensive validation output.',
                  type: 'text_delta',
                },
                index: 0,
                type: 'content_block_delta',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  id: 'srvtoolu_create_validation',
                  name: 'text_editor_code_execution',
                  type: 'server_tool_use',
                },
                index: 1,
                type: 'content_block_start',
              },
            },
            {
              event: 'content_block_delta',
              data: {
                delta: {
                  partial_json: '{"command":"create","path":"/tmp/build_validation.py"}',
                  type: 'input_json_delta',
                },
                index: 1,
                type: 'content_block_delta',
              },
            },
            {
              event: 'message_delta',
              data: {
                delta: {
                  stop_reason: 'pause_turn',
                },
                type: 'message_delta',
              },
            },
            {
              event: 'message_stop',
              data: {
                type: 'message_stop',
              },
            },
          ])
        }

        return anthropicStreamingResponse([
          {
            event: 'message_start',
            data: {
              message: {
                content: [],
                role: 'assistant',
                stop_reason: null,
                type: 'message',
              },
              type: 'message_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                text: '',
                type: 'text',
              },
              index: 0,
              type: 'content_block_start',
            },
          },
          {
            event: 'content_block_delta',
            data: {
              delta: {
                text: 'ValidationOutput.json has been written.',
                type: 'text_delta',
              },
              index: 0,
              type: 'content_block_delta',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                content: {
                  content: [
                    {
                      file_id: 'file_output_validation_1',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: '',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
              index: 1,
              type: 'content_block_start',
            },
          },
          {
            event: 'message_delta',
            data: {
              delta: {
                stop_reason: 'end_turn',
              },
              type: 'message_delta',
            },
          },
          {
            event: 'message_stop',
            data: {
              type: 'message_stop',
            },
          },
        ])
      }

      if (url.endsWith('/v1/files/file_output_validation_1')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_output_validation_1',
            mime_type: 'application/json',
            size_bytes: 42,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_output_validation_1/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
    })

    expect(messageBodies).toHaveLength(2)
    expect(messageBodies[0]).not.toHaveProperty('container')
    expect(messageBodies[0]).toEqual(expect.objectContaining({ stream: true }))
    expect(messageBodies[1]).toEqual(
      expect.objectContaining({
        container: 'container-pause-turn',
        messages: [
          expect.objectContaining({
            role: 'user',
          }),
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                name: 'text_editor_code_execution',
                type: 'server_tool_use',
              }),
            ]),
            role: 'assistant',
          }),
        ],
      }),
    )
    expect(generated.file.fileId).toBe('file_output_validation_1')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('stops a pause_turn generated-file request once a downloadable file is exposed', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        return anthropicStreamingResponse([
          {
            event: 'message_start',
            data: {
              container: {
                id: 'container-pause-turn-with-file',
              },
              message: {
                content: [],
                role: 'assistant',
                stop_reason: null,
                type: 'message',
              },
              type: 'message_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                text: '',
                type: 'text',
              },
              index: 0,
              type: 'content_block_start',
            },
          },
          {
            event: 'content_block_delta',
            data: {
              delta: {
                text: 'ValidationOutput.json has been written.',
                type: 'text_delta',
              },
              index: 0,
              type: 'content_block_delta',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                content: {
                  content: [
                    {
                      file_id: 'file_pause_turn_validation_1',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: 'validated sections and wrote ValidationOutput.json',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
              index: 1,
              type: 'content_block_start',
            },
          },
          {
            event: 'message_delta',
            data: {
              delta: {
                stop_reason: 'pause_turn',
              },
              type: 'message_delta',
            },
          },
          {
            event: 'message_stop',
            data: {
              type: 'message_stop',
            },
          },
        ])
      }

      if (url.endsWith('/v1/files/file_pause_turn_validation_1')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_pause_turn_validation_1',
            mime_type: 'application/json',
            size_bytes: 42,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_pause_turn_validation_1/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
    })

    expect(messageBodies).toHaveLength(1)
    expect(generated.file.fileId).toBe('file_pause_turn_validation_1')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('rewrites an invalid generated file in the same Anthropic container until validation passes', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        if (messageBodies.length === 1) {
          return new Response(
            JSON.stringify({
              container: {
                id: 'container-invalid-validation',
              },
              content: [
                {
                  text: 'ValidationOutput.json has been written.',
                  type: 'text',
                },
                {
                  content: {
                    content: [
                      {
                        file_id: 'file_invalid_validation_1',
                        type: 'file',
                      },
                    ],
                    return_code: 0,
                    stderr: '',
                    stdout: '',
                    type: 'code_execution_result',
                  },
                  type: 'code_execution_tool_result',
                },
              ],
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        return new Response(
          JSON.stringify({
            content: [
              {
                text: 'ValidationOutput.json has been corrected.',
                type: 'text',
              },
              {
                content: {
                  content: [
                    {
                      file_id: 'file_valid_validation_2',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: '',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
            ],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_invalid_validation_1')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_invalid_validation_1',
            mime_type: 'application/json',
            size_bytes: 32,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_invalid_validation_1/content')) {
        return new Response('{"overall_score":{"value":88}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      if (url.endsWith('/v1/files/file_valid_validation_2')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_valid_validation_2',
            mime_type: 'application/json',
            size_bytes: 64,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_valid_validation_2/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
      validateFileContent: async (file) => {
        const parsed = JSON.parse(file.content) as Record<string, unknown>

        return parsed.FinalizedBrief && parsed.ReviewLog
          ? null
          : {
              reason: 'Validation response must contain top-level FinalizedBrief and ReviewLog objects.',
            }
      },
    })

    expect(messageBodies).toHaveLength(2)
    expect(messageBodies[1]).toEqual(
      expect.objectContaining({
        container: 'container-invalid-validation',
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining('Validation response must contain top-level FinalizedBrief and ReviewLog objects.'),
                type: 'text',
              }),
            ]),
            role: 'user',
          }),
        ],
      }),
    )
    expect(generated.file.fileId).toBe('file_valid_validation_2')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('retries with a Python-only artifact prompt after text editor output returns no file', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        if (messageBodies.length === 1) {
          return new Response(
            JSON.stringify({
              container: {
                id: 'container-text-editor-no-file',
              },
              content: [
                {
                  text: 'I built ValidationOutput.json with the text editor.',
                  type: 'text',
                },
                {
                  id: 'srvtoolu_text_editor_validation',
                  input: {
                    command: 'create',
                    path: '/tmp/ValidationOutput.json',
                  },
                  name: 'text_editor_code_execution',
                  type: 'server_tool_use',
                },
              ],
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        return new Response(
          JSON.stringify({
            content: [
              {
                text: 'ValidationOutput.json has been written with Python code execution.',
                type: 'text',
              },
              {
                content: {
                  content: [
                    {
                      file_id: 'file_text_editor_retry_validation',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: '-rw-r--r-- 1 sandbox sandbox 57 ValidationOutput.json',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
            ],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_text_editor_retry_validation')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_text_editor_retry_validation',
            mime_type: 'application/json',
            size_bytes: 57,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_text_editor_retry_validation/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
    })

    expect(messageBodies).toHaveLength(2)
    expect(messageBodies[1]).toEqual(
      expect.objectContaining({
        container: 'container-text-editor-no-file',
      }),
    )
    expect(JSON.stringify(messageBodies[1])).toContain('previous attempt used text_editor_code_execution')
    expect(JSON.stringify(messageBodies[1])).toContain('Do not use text_editor_code_execution again.')
    expect(JSON.stringify(messageBodies[1])).toContain('Use bash_code_execution now')
    expect(generated.file.fileId).toBe('file_text_editor_retry_validation')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('retries with a Python-only artifact prompt after text editor tool result output returns no file', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        if (messageBodies.length === 1) {
          return new Response(
            JSON.stringify({
              container: {
                id: 'container-text-editor-result-no-file',
              },
              content: [
                {
                  text: 'ValidationOutput.json has been written.',
                  type: 'text',
                },
                {
                  content: {
                    return_code: 0,
                    stderr: '',
                    stdout: 'Tool activity was recorded for this response.',
                    type: 'text_editor_code_execution_result',
                  },
                  type: 'text_editor_code_execution_tool_result',
                },
              ],
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        return new Response(
          JSON.stringify({
            content: [
              {
                text: 'ValidationOutput.json has been written with Python code execution.',
                type: 'text',
              },
              {
                content: {
                  content: [
                    {
                      file_id: 'file_text_editor_result_retry_validation',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: '-rw-r--r-- 1 sandbox sandbox 57 ValidationOutput.json',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
            ],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_text_editor_result_retry_validation')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_text_editor_result_retry_validation',
            mime_type: 'application/json',
            size_bytes: 57,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_text_editor_result_retry_validation/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
    })

    expect(messageBodies).toHaveLength(2)
    expect(messageBodies[1]).toEqual(
      expect.objectContaining({
        container: 'container-text-editor-result-no-file',
      }),
    )
    expect(JSON.stringify(messageBodies[1])).toContain('previous attempt used text_editor_code_execution')
    expect(JSON.stringify(messageBodies[1])).toContain('Use bash_code_execution now')
    expect(generated.file.fileId).toBe('file_text_editor_result_retry_validation')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('surfaces a distinct error when text editor recovery still returns no downloadable file', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (!url.endsWith('/v1/messages')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      if (init && typeof init === 'object' && 'body' in init && typeof init.body === 'string') {
        messageBodies.push(JSON.parse(init.body) as Record<string, unknown>)
      }

      return new Response(
        JSON.stringify({
          container: {
            id: 'container-repeated-text-editor-no-file',
          },
          content: [
            {
              text: 'ValidationOutput.json has been written with the editor.',
              type: 'text',
            },
            {
              content: {
                return_code: 0,
                stderr: '',
                stdout: 'Tool activity was recorded for this response.',
                type: 'text_editor_code_execution_result',
              },
              type: 'text_editor_code_execution_tool_result',
            },
          ],
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    })

    await expect(
      callAnthropicGeneratedFile({
        filename: 'ValidationOutput.json',
        prompt: 'Validate the draft brief and write ValidationOutput.json.',
        system: 'You validate draft SEO briefs and write JSON output files.',
      }),
    ).rejects.toThrow(
      'Anthropic used text_editor_code_execution without returning the expected downloadable output file ValidationOutput.json.',
    )

    expect(messageBodies).toHaveLength(4)
    expect(JSON.stringify(messageBodies[1])).toContain('Do not use text_editor_code_execution again.')
    expect(JSON.stringify(messageBodies[2])).toContain('Do not use text_editor_code_execution again.')
    expect(JSON.stringify(messageBodies[3])).toContain('Do not use text_editor_code_execution again.')
  })

  it('persists partial running trace payloads during pause_turn generated-file requests', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    vi.resetModules()

    const createWriterTraceEvent = vi.fn(async () => ({ id: 4242 }))
    const updateWriterTraceEvent = vi.fn(async () => ({}))

    vi.doMock('@/lib/aiWriter/repository', () => ({
      createWriterTraceEvent,
      updateWriterTraceEvent,
    }))

    try {
      const { callAnthropicGeneratedFile: callAnthropicGeneratedFileWithMockedTrace } = await import('@/lib/aiWriter/anthropic')

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

        if (url.endsWith('/v1/messages')) {
          const body =
            init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : {}

          if (!('container' in body)) {
            return anthropicStreamingResponse([
              {
                event: 'message_start',
                data: {
                  container: {
                    id: 'container-trace-progress',
                  },
                  message: {
                    content: [],
                    role: 'assistant',
                    stop_reason: null,
                    type: 'message',
                  },
                  type: 'message_start',
                },
              },
              {
                event: 'content_block_start',
                data: {
                  content_block: {
                    text: '',
                    type: 'text',
                  },
                  index: 0,
                  type: 'content_block_start',
                },
              },
              {
                event: 'content_block_delta',
                data: {
                  delta: {
                    text: 'Now I have all the data. Let me build the comprehensive validation output.',
                    type: 'text_delta',
                  },
                  index: 0,
                  type: 'content_block_delta',
                },
              },
              {
                event: 'content_block_start',
                data: {
                  content_block: {
                    id: 'srvtoolu_create_validation',
                    name: 'text_editor_code_execution',
                    type: 'server_tool_use',
                  },
                  index: 1,
                  type: 'content_block_start',
                },
              },
              {
                event: 'content_block_delta',
                data: {
                  delta: {
                    partial_json: '{"command":"create","path":"/tmp/build_validation.py"}',
                    type: 'input_json_delta',
                  },
                  index: 1,
                  type: 'content_block_delta',
                },
              },
              {
                event: 'message_delta',
                data: {
                  delta: {
                    stop_reason: 'pause_turn',
                  },
                  type: 'message_delta',
                },
              },
              {
                event: 'message_stop',
                data: {
                  type: 'message_stop',
                },
              },
            ])
          }

          return anthropicStreamingResponse([
            {
              event: 'message_start',
              data: {
                message: {
                  content: [],
                  role: 'assistant',
                  stop_reason: null,
                  type: 'message',
                },
                type: 'message_start',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  text: '',
                  type: 'text',
                },
                index: 0,
                type: 'content_block_start',
              },
            },
            {
              event: 'content_block_delta',
              data: {
                delta: {
                  text: 'ValidationOutput.json has been written.',
                  type: 'text_delta',
                },
                index: 0,
                type: 'content_block_delta',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  content: {
                    content: [
                      {
                        file_id: 'file_trace_progress_validation',
                        type: 'file',
                      },
                    ],
                    return_code: 0,
                    stderr: '',
                    stdout: '',
                    type: 'code_execution_result',
                  },
                  type: 'code_execution_tool_result',
                },
                index: 1,
                type: 'content_block_start',
              },
            },
            {
              event: 'message_delta',
              data: {
                delta: {
                  stop_reason: 'end_turn',
                },
                type: 'message_delta',
              },
            },
            {
              event: 'message_stop',
              data: {
                type: 'message_stop',
              },
            },
          ])
        }

        if (url.endsWith('/v1/files/file_trace_progress_validation')) {
          return new Response(
            JSON.stringify({
              downloadable: true,
              filename: 'ValidationOutput.json',
              id: 'file_trace_progress_validation',
              mime_type: 'application/json',
              size_bytes: 42,
              type: 'file',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        if (url.endsWith('/v1/files/file_trace_progress_validation/content')) {
          return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          })
        }

        throw new Error(`Unexpected fetch request: ${url}`)
      })

      await callAnthropicGeneratedFileWithMockedTrace(
        {
          filename: 'ValidationOutput.json',
          prompt: 'Validate the draft brief and write ValidationOutput.json.',
          system: 'You validate draft SEO briefs and write JSON output files.',
        },
        {
          eventType: 'brief_validate',
          runID: 21,
          stageKey: 'validate',
        },
      )

      expect(createWriterTraceEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'brief_validate',
          status: 'running',
        }),
      )
      expect(updateWriterTraceEvent.mock.calls).toEqual(
        expect.arrayContaining([
          [
            4242,
            expect.objectContaining({
              responsePayload: expect.objectContaining({
                containerId: 'container-trace-progress',
                stopReason: 'pause_turn',
                text: expect.stringContaining('build the comprehensive validation output'),
              }),
              status: 'running',
            }),
          ],
        ]),
      )
    } finally {
      vi.doUnmock('@/lib/aiWriter/repository')
      vi.resetModules()
    }
  })

  it('streams plain-text Anthropic responses into a running trace before completion', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    vi.resetModules()

    const createWriterTraceEvent = vi.fn(async () => ({ id: 6262 }))
    const updateWriterTraceEvent = vi.fn(async () => ({}))
    let messageRequestBody: null | Record<string, unknown> = null

    vi.doMock('@/lib/aiWriter/repository', () => ({
      createWriterTraceEvent,
      updateWriterTraceEvent,
    }))

    try {
      const { callAnthropicText: callAnthropicTextWithMockedTrace } = await import('@/lib/aiWriter/anthropic')

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

        if (!url.endsWith('/v1/messages')) {
          throw new Error(`Unexpected fetch request: ${url}`)
        }

        messageRequestBody =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null

        return anthropicStreamingResponse([
          {
            event: 'message_start',
            data: {
              message: {
                content: [],
                role: 'assistant',
                stop_reason: null,
                type: 'message',
              },
              type: 'message_start',
            },
          },
          {
            event: 'content_block_start',
            data: {
              content_block: {
                text: '',
                type: 'text',
              },
              index: 0,
              type: 'content_block_start',
            },
          },
          {
            event: 'content_block_delta',
            data: {
              delta: {
                text: 'First streamed sentence. ',
                type: 'text_delta',
              },
              index: 0,
              type: 'content_block_delta',
            },
          },
          {
            event: 'content_block_delta',
            data: {
              delta: {
                text: 'Second streamed sentence.',
                type: 'text_delta',
              },
              index: 0,
              type: 'content_block_delta',
            },
          },
          {
            event: 'message_delta',
            data: {
              delta: {
                stop_reason: 'end_turn',
              },
              type: 'message_delta',
            },
          },
          {
            event: 'message_stop',
            data: {
              type: 'message_stop',
            },
          },
        ])
      })

      const text = await callAnthropicTextWithMockedTrace(
        {
          prompt: 'Explain the validation result briefly.',
          system: 'You explain AI Writer step results clearly.',
        },
        {
          eventType: 'brief_explain',
          runID: 21,
          stageKey: 'validate',
        },
      )

      expect(text).toBe('First streamed sentence. Second streamed sentence.')
      expect(messageRequestBody).toEqual(expect.objectContaining({ stream: true }))
      expect(updateWriterTraceEvent).toHaveBeenCalledWith(
        6262,
        expect.objectContaining({
          responsePayload: expect.objectContaining({
            stopReason: 'end_turn',
            text: 'First streamed sentence. Second streamed sentence.',
          }),
          status: 'running',
        }),
      )
      expect(updateWriterTraceEvent).toHaveBeenCalledWith(
        6262,
        expect.objectContaining({
          status: 'completed',
        }),
      )
    } finally {
      vi.doUnmock('@/lib/aiWriter/repository')
      vi.resetModules()
    }
  })

  it('streams generated-file Anthropic events into a running trace before completion', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    vi.resetModules()

    const createWriterTraceEvent = vi.fn(async () => ({ id: 5252 }))
    const updateWriterTraceEvent = vi.fn(async () => ({}))

    vi.doMock('@/lib/aiWriter/repository', () => ({
      createWriterTraceEvent,
      updateWriterTraceEvent,
    }))

    try {
      const { callAnthropicGeneratedFile: callAnthropicGeneratedFileWithMockedTrace } = await import('@/lib/aiWriter/anthropic')

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input) => {
        const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

        if (url.endsWith('/v1/messages')) {
          return anthropicStreamingResponse([
            {
              event: 'message_start',
              data: {
                type: 'message_start',
                message: {
                  content: [],
                  role: 'assistant',
                  stop_reason: null,
                  type: 'message',
                },
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  text: '',
                  type: 'text',
                },
                index: 0,
                type: 'content_block_start',
              },
            },
            {
              event: 'content_block_delta',
              data: {
                delta: {
                  text: 'Let me write the article now.',
                  type: 'text_delta',
                },
                index: 0,
                type: 'content_block_delta',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  id: 'srvtoolu_stream_article',
                  name: 'code_execution',
                  type: 'server_tool_use',
                },
                index: 1,
                type: 'content_block_start',
              },
            },
            {
              event: 'content_block_delta',
              data: {
                delta: {
                  partial_json: '{"code":"from pathlib import Path\\nPath(\\\"article.md\\\").write_text(\\\"# Article\\\\n\\\\nGenerated from the stream.\\\")\\nprint(Path(\\\"article.md\\\").stat().st_size)"}',
                  type: 'input_json_delta',
                },
                index: 1,
                type: 'content_block_delta',
              },
            },
            {
              event: 'content_block_start',
              data: {
                content_block: {
                  content: {
                    content: [
                      {
                        file_id: 'file_stream_article_1',
                        type: 'file',
                      },
                    ],
                    return_code: 0,
                    stderr: '',
                    stdout: '',
                    type: 'code_execution_result',
                  },
                  tool_use_id: 'srvtoolu_stream_article',
                  type: 'code_execution_tool_result',
                },
                index: 2,
                type: 'content_block_start',
              },
            },
            {
              event: 'message_delta',
              data: {
                delta: {
                  stop_reason: 'end_turn',
                },
                type: 'message_delta',
              },
            },
            {
              event: 'message_stop',
              data: {
                type: 'message_stop',
              },
            },
          ])
        }

        if (url.endsWith('/v1/files/file_stream_article_1')) {
          return new Response(
            JSON.stringify({
              downloadable: true,
              filename: 'article.md',
              id: 'file_stream_article_1',
              mime_type: 'text/markdown',
              size_bytes: 64,
              type: 'file',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        if (url.endsWith('/v1/files/file_stream_article_1/content')) {
          return new Response('# Article\n\nGenerated from the stream.', {
            headers: {
              'content-type': 'text/markdown',
            },
            status: 200,
          })
        }

        throw new Error(`Unexpected fetch request: ${url}`)
      })

      const generated = await callAnthropicGeneratedFileWithMockedTrace(
        {
          filename: 'article.md',
          prompt: 'Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.',
          system: 'You write complete markdown articles and export them as files.',
        },
        {
          eventType: 'article_write',
          runID: 21,
          stageKey: 'write',
        },
      )

      expect(generated.file.fileId).toBe('file_stream_article_1')
      expect(generated.file.filename).toBe('article.md')
      expect(updateWriterTraceEvent).toHaveBeenCalledWith(
        5252,
        expect.objectContaining({
          responsePayload: expect.objectContaining({
            fileIds: expect.arrayContaining(['file_stream_article_1']),
            stopReason: 'end_turn',
            text: expect.stringContaining('Let me write the article now.'),
          }),
          status: 'running',
        }),
      )
    } finally {
      vi.doUnmock('@/lib/aiWriter/repository')
      vi.resetModules()
    }
  })

  it('retries transient anthropic fetch failures and surfaces the underlying network cause on final failure', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    let messageRequestCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (!url.endsWith('/v1/messages')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      messageRequestCount += 1

      const cause = Object.assign(new Error('socket hang up'), {
        code: 'ECONNRESET',
      })
      const error = new TypeError('fetch failed') as TypeError & {
        cause?: unknown
      }
      error.cause = cause

      throw error
    })

    await expect(
      callAnthropicGeneratedFile({
        filename: 'article.md',
        prompt: 'Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.',
        system: 'You write complete markdown articles and export them as files.',
      }),
    ).rejects.toThrow('Anthropic request failed: fetch failed (ECONNRESET: socket hang up)')

    expect(messageRequestCount).toBe(2)
  })

  it('retries a max-token no-artifact response without requiring an Anthropic container id', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/messages')) {
        const body =
          init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : {}

        messageBodies.push(body)

        if (messageBodies.length === 1) {
          return new Response(
            JSON.stringify({
              content: [
                {
                  text: 'I inspected the uploaded files but ran out of output before writing ValidationOutput.json.',
                  type: 'text',
                },
                {
                  content: {
                    abort_reason: null,
                    content: [],
                    return_code: 0,
                    stderr: '',
                    stdout: 'Large inspection output...',
                    type: 'code_execution_result',
                  },
                  type: 'code_execution_tool_result',
                },
              ],
              stop_reason: 'max_tokens',
            }),
            {
              headers: {
                'content-type': 'application/json',
              },
              status: 200,
            },
          )
        }

        return new Response(
          JSON.stringify({
            content: [
              {
                text: 'ValidationOutput.json has been written.',
                type: 'text',
              },
              {
                content: {
                  content: [
                    {
                      file_id: 'file_retry_after_max_tokens',
                      type: 'file',
                    },
                  ],
                  return_code: 0,
                  stderr: '',
                  stdout: 'ValidationOutput.json 57 bytes',
                  type: 'code_execution_result',
                },
                type: 'code_execution_tool_result',
              },
            ],
            stop_reason: 'end_turn',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_retry_after_max_tokens')) {
        return new Response(
          JSON.stringify({
            downloadable: true,
            filename: 'ValidationOutput.json',
            id: 'file_retry_after_max_tokens',
            mime_type: 'application/json',
            size_bytes: 57,
            type: 'file',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url.endsWith('/v1/files/file_retry_after_max_tokens/content')) {
        return new Response('{"FinalizedBrief":{"SeoBrief":{}},"ReviewLog":{"summary":"ok"}}', {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      throw new Error(`Unexpected fetch request: ${url}`)
    })

    const generated = await callAnthropicGeneratedFile({
      filename: 'ValidationOutput.json',
      prompt: 'Validate the draft brief and write ValidationOutput.json.',
      system: 'You validate draft SEO briefs and write JSON output files.',
    })

    expect(messageBodies).toHaveLength(2)
    expect(messageBodies[0]).not.toHaveProperty('container')
    expect(messageBodies[1]).not.toHaveProperty('container')
    expect(JSON.stringify(messageBodies[1])).toContain('The previous attempt did not leave a reusable container.')
    expect(JSON.stringify(messageBodies[1])).toContain('Use bash_code_execution now')
    expect(JSON.stringify(messageBodies[1])).toContain('keep stdout compact')
    expect(generated.file.fileId).toBe('file_retry_after_max_tokens')
    expect(generated.file.filename).toBe('ValidationOutput.json')
  })

  it('fails instead of using an inline fallback when anthropic does not return a downloadable output file', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    let messageRequestCount = 0
    const messageBodies: Record<string, unknown>[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (!url.includes('/v1/messages')) {
        throw new Error(`Unexpected fetch request: ${url}`)
      }

      messageRequestCount += 1
      if (init && typeof init === 'object' && 'body' in init && typeof init.body === 'string') {
        messageBodies.push(JSON.parse(init.body) as Record<string, unknown>)
      }

      return new Response(
        JSON.stringify({
          content: [
            {
              text: 'Created BRIEF.json in the workspace. I can provide the file content directly if needed.',
              type: 'text',
            },
          ],
          container: {
            id: 'container-no-file',
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    })

    await expect(
      callAnthropicGeneratedFile({
        filename: 'BRIEF.json',
        prompt: 'Generate a brief for the provided source materials.',
        system: 'You produce valid JSON briefs for a content production pipeline.',
      }),
    ).rejects.toThrow('Anthropic did not create the expected output file BRIEF.json.')

    expect(messageRequestCount).toBe(4)
    expect(messageBodies[0]).not.toHaveProperty('container')
    for (const retryBody of messageBodies.slice(1)) {
      expect(retryBody).toEqual(
        expect.objectContaining({
          container: 'container-no-file',
        }),
      )
      expect(JSON.stringify(retryBody)).toContain('Your next response must fix only that contract failure.')
      expect(JSON.stringify(retryBody)).toContain('Do not claim success unless the response includes the downloadable file artifact')
    }
  })
})
