import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { createBlogPostDraftFromWriterRun } from '@/lib/aiWriter/articleDraft'
import { checkedInClaudePromptDefaults } from '@/lib/aiWriter/agentic/checked-in-claude-prompt-defaults'
import { createWriterRunAndStart, selectWriterSourcesAndContinue, type WriterAutomationProvider } from '@/lib/aiWriter/engine'
import {
  aiWriterManualStageTestInternals,
  enqueueWriterManualStage,
  processNextQueuedWriterManualStage,
  runWriterManualStage,
} from '@/lib/aiWriter/manualStages'
import { getWriterRunDetail } from '@/lib/aiWriter/repository'
import { getCmsPayload } from '@/lib/payload'

let payload: Payload

const fixture = {
  draftUid: 'wsa-202-manual-stage-article',
  keyword: 'WSA 202 manual stage pipeline',
}

const provider: WriterAutomationProvider = {
  async buildFactpack({ sources }) {
    return {
      factpack: {
        claims: sources.map((source) => ({
          source: source.source.url,
          summary: source.blocks[0]?.plain_text ?? '',
        })),
      },
      markdown: '# Factpack\n\n- Built from test provider',
      raw: {
        sourceCount: sources.length,
      },
    }
  },
  async convertArticleToMarkdown({ article, source }) {
    return {
      markdown: `# ${article.title}\n\nContent for ${source.url}.`,
      raw: {
        title: article.title,
      },
    }
  },
  async convertMarkdownToBlocks({ markdown, source }) {
    return {
      blocks: [
        {
          block_id: `${source.id}-1`,
          heading: 'Overview',
          kind: 'paragraph',
          markdown,
          order: 1,
          plain_text: markdown.replace(/[#\n]/g, ' ').trim(),
          word_count: markdown.split(/\s+/).filter(Boolean).length,
        },
      ],
      raw: {
        ok: true,
      },
    }
  },
  async fetchReadableArticle({ source }) {
    return {
      html: `<article><h1>${source.title ?? 'Article'}</h1><p>Readable content for ${source.url}.</p></article>`,
      metaDescription: `Source meta description for ${source.url}.`,
      title: source.title ?? `Readable ${source.id}`,
    }
  },
  async searchKeyword({ run }) {
    return {
      raw: {
        query: run.targetKeyword,
      },
      results: [
        {
          normalizedUrl: 'https://example.com/competitor-one',
          position: 1,
          snippet: 'Competitor one',
          title: 'Competitor One',
          url: 'https://example.com/competitor-one',
        },
        {
          normalizedUrl: 'https://example.com/competitor-two',
          position: 2,
          snippet: 'Competitor two',
          title: 'Competitor Two',
          url: 'https://example.com/competitor-two',
        },
      ],
    }
  },
}

function anthropicResponse(text: string) {
  return new Response(
    JSON.stringify({
      content: [
        {
          text,
          type: 'text',
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

function anthropicGeneratedFileResponse(fileId: string, filename: string) {
  return new Response(
    JSON.stringify({
      content: [
        {
          text: `Created ${filename}.`,
          type: 'text',
        },
        {
          content: {
            content: [
              {
                file_id: fileId,
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

function anthropicGeneratedFileResponseWithContainer(containerId: string, fileId: string, filename: string) {
  return new Response(
    JSON.stringify({
      container: {
        id: containerId,
      },
      content: [
        {
          text: `Created ${filename}.`,
          type: 'text',
        },
        {
          content: {
            content: [
              {
                file_id: fileId,
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

function anthropicContainerResponse(containerId: string, text: string) {
  return new Response(
    JSON.stringify({
      container: {
        id: containerId,
      },
      content: [
        {
          text,
          type: 'text',
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

function anthropicFileMetadataResponse(fileId: string, filename: string, mimeType = 'text/plain') {
  return new Response(
    JSON.stringify({
      created_at: '2026-04-24T00:00:00.000Z',
      downloadable: true,
      filename,
      id: fileId,
      mime_type: mimeType,
      size_bytes: 128,
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

function anthropicFileContentResponse(content: string, mimeType = 'text/plain') {
  return new Response(content, {
    headers: {
      'content-type': mimeType,
    },
    status: 200,
  })
}

function anthropicFileUploadResponse(fileId: string, filename: string, mimeType = 'text/plain', sizeBytes = 128) {
  return new Response(
    JSON.stringify({
      filename,
      id: fileId,
      mime_type: mimeType,
      size_bytes: sizeBytes,
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

function anthropicFileDeleteResponse(fileId: string) {
  return new Response(
    JSON.stringify({
      id: fileId,
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

async function readMultipartUploadedFile(uploadedFile: FormDataEntryValue | null) {
  if (!uploadedFile || typeof uploadedFile === 'string') {
    throw new Error('Expected Anthropic file upload payload.')
  }

  const file = uploadedFile as Blob & { arrayBuffer?: () => Promise<ArrayBuffer>; name?: string; size?: number; text?: () => Promise<string>; type?: string }
  const content =
    typeof file.text === 'function'
      ? await file.text()
      : typeof file.arrayBuffer === 'function'
        ? Buffer.from(await file.arrayBuffer()).toString('utf8')
        : String(file)

  return {
    content,
    filename: file.name ?? 'unknown',
    mimeType: file.type || 'text/plain',
    sizeBytes: file.size ?? content.length,
  }
}

function extractAnthropicRequestBody(init: RequestInit | undefined) {
  return init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
    ? (JSON.parse(init.body) as {
        container?: { id?: string }
        max_tokens?: number
        messages?: Array<{
          content?: Array<{ file_id?: string; text?: string; type?: string }> | string
        }>
        system?: string
      })
    : null
}

function extractAnthropicPrompt(init: RequestInit | undefined) {
  const payloadBody = extractAnthropicRequestBody(init)
  const content = payloadBody?.messages?.[0]?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => (block && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''))
      .join('\n')
  }

  return ''
}

function extractAnthropicUploadedFileIds(init: RequestInit | undefined) {
  const payloadBody = extractAnthropicRequestBody(init)
  const content = payloadBody?.messages?.[0]?.content

  if (!Array.isArray(content)) {
    return []
  }

  return content
    .filter((block) => block && typeof block === 'object' && block.type === 'container_upload' && typeof block.file_id === 'string')
    .map((block) => block.file_id as string)
}

function buildOverlayOp(input: {
  articleMarkdown: string
  exactText: string
  id: string
  layer: 'external_links' | 'internal_links'
  reason: string
  url: string
  why: string
}) {
  const start = input.articleMarkdown.indexOf(input.exactText)

  if (start < 0) {
    throw new Error(`Could not find overlay text "${input.exactText}" in article markdown.`)
  }

  return {
    end: start + input.exactText.length,
    exactText: input.exactText,
    id: input.id,
    layer: input.layer,
    reason: input.reason,
    start,
    url: input.url,
    why: input.why,
  }
}

describe('ai writer manual stages', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_MODEL = 'test-model'

    await payload.delete({
      collection: 'writer-runs',
      where: {
        targetKeyword: {
          contains: fixture.keyword,
        },
      },
    })

    await payload.delete({
      collection: 'blog-posts',
      where: {
        uid: {
          equals: fixture.draftUid,
        },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('places best-effort internal links inline before appending related resources', () => {
    const selectedInternalLinks = [
      'Signup Protection Guide - Gatekeepr (https://gatekeepr.io/blog/signup-protection-guide)',
    ]

    const inlineMarkdown = aiWriterManualStageTestInternals.ensureBestEffortInternalLinks({
      articleMarkdown: [
        '# WSA 202 Manual Stage Article',
        '',
        'A signup protection guide helps teams wire the workflow into production.',
      ].join('\n'),
      minimumCount: 1,
      selectedInternalLinks,
    })

    expect(inlineMarkdown).toContain(
      '[signup protection guide](https://gatekeepr.io/blog/signup-protection-guide)',
    )
    expect(inlineMarkdown).not.toContain('Related Gatekeepr resources')

    const fallbackMarkdown = aiWriterManualStageTestInternals.ensureBestEffortInternalLinks({
      articleMarkdown: [
        '# WSA 202 Manual Stage Article',
        '',
        'The article explains the workflow without a natural destination phrase.',
      ].join('\n'),
      minimumCount: 1,
      selectedInternalLinks,
    })

    expect(fallbackMarkdown).toContain('Related Gatekeepr resources')
    expect(fallbackMarkdown).toContain(
      '- [Signup Protection Guide](https://gatekeepr.io/blog/signup-protection-guide)',
    )
  })

  it('injects the FactPack into the write-stage finalized brief upload', () => {
    const finalizedBrief = JSON.stringify({
      SeoBrief: {
        meta_descriptions: [],
        target_keyword: 'Scrapy Playwright',
      },
    })
    const factpack = JSON.stringify({
      claims: [
        {
          needs_verification: false,
          source_block_id: 'B1',
          source_url: 'https://example.com/source',
          text: 'Scrapy Playwright helps Scrapy render JavaScript-heavy pages.',
        },
      ],
    })
    const documentContent = aiWriterManualStageTestInternals.buildWriteFinalizedBriefDocumentContent(
      finalizedBrief,
      factpack,
      'Source-backed meta description.',
    )
    const parsed = JSON.parse(documentContent) as {
      FactPack?: { claims?: Array<{ text?: string }> }
      SeoBrief?: { meta_descriptions?: string[]; target_keyword?: string }
    }

    expect(parsed.SeoBrief?.target_keyword).toBe('Scrapy Playwright')
    expect(parsed.SeoBrief?.meta_descriptions).toEqual(['Source-backed meta description.'])
    expect(parsed.FactPack?.claims?.[0]?.text).toContain('JavaScript-heavy pages')
  })

  it('processes a queued manual brief stage outside the original request', async () => {
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType: string }>()
    let generatedFileCount = 0
    let uploadedFileCount = 0
    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `queued_manual_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        differentiators: ['Runs without an open browser tab'],
        gaps_to_fill: ['Explain background processing'],
        internal_links: [],
        meta_descriptions: ['Queued manual stage test.'],
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Explain the queue.',
            word_budget: 400,
          },
        ],
        target_keyword: `${fixture.keyword} queued`,
        target_word_count: 1200,
        title_ideas: ['Queued Manual Stage Test'],
      },
      additional_sources: [],
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body as FormData
        const uploadedFile = await readMultipartUploadedFile(formData.get('file'))
        uploadedFileCount += 1
        const fileId = `queued_input_${uploadedFileCount}`

        return anthropicFileUploadResponse(fileId, uploadedFile.filename, uploadedFile.mimeType, uploadedFile.sizeBytes)
      }

      if (url.includes('/v1/files/')) {
        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-queued-source',
        targetKeyword: `${fixture.keyword} queued`,
      },
      provider,
    )
    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)
    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    const queued = await enqueueWriterManualStage(ready.run.id, 'brief', payload)
    expect(queued.run.status).toBe('processing')
    expect(queued.run.currentStage).toBe('brief')
    expect(queued.stages.find((stage) => stage.stageKey === 'brief')?.status).toBe('queued')

    const processed = await processNextQueuedWriterManualStage(payload)
    expect(processed?.run.currentStage).toBe('validate')
    expect(processed?.run.status).toBe('awaiting_user')
    expect(processed?.stages.find((stage) => stage.stageKey === 'brief')?.status).toBe('completed')
    expect(processed?.stages.find((stage) => stage.stageKey === 'validate')?.status).toBe('awaiting_user')
    expect(processed?.artifacts.find((artifact) => artifact.artifactType === 'brief_json')).toBeTruthy()
  })

  it('runs brief, validate, write, and check stages and creates a cms draft from the final output', async () => {
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        brand_voice: 'Technical and direct',
        differentiators: ['Source-backed guidance'],
        faq_questions: ['What is this?', 'Why does it matter?'],
        gaps_to_fill: ['Use the CMS-native flow'],
        intent: {
          outcome: 'Understand how the CMS manual-stage flow works.',
          reader: 'Engineers',
          type: 'informational',
        },
        internal_links: ['Signup Protection Guide - Gatekeepr (https://gatekeepr.io/blog/signup-protection-guide)'],
        meta_descriptions: ['Manual stage integration test.'],
        needs_additional_research: false,
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Introduce the workflow.',
            word_budget: 400,
          },
          {
            heading: 'Implementation',
            level: 'H2',
            notes: 'Explain how each stage works.',
            word_budget: 400,
          },
        ],
        secondary_keywords: ['cms workflow'],
        section_word_budget_total: 800,
        serp_expectations: {
          average_word_count_estimate: 1600,
          common_formats: ['tutorial'],
          common_topics: ['workflow'],
          content_type: 'technical guide',
          top_competitors: [
            {
              strengths: 'Direct walkthrough',
              title: 'Competitor One',
              url: 'https://example.com/competitor-one',
            },
          ],
        },
        target_keyword: fixture.keyword,
        target_word_count: 1600,
        title_ideas: ['WSA 202 Manual Stage Article'],
      },
      additional_sources: [
        {
          relevance: 'Official source for the cited API reference.',
          snippet: 'Official Yelp Fusion API documentation.',
          title: 'Yelp Fusion API docs',
          url: 'https://docs.developer.yelp.com/docs/fusion-intro',
        },
      ],
    })
    const validateResponse = JSON.stringify({
      FinalizedBrief: {
        SeoBrief: {
          audience: 'Engineers',
          brand_voice: 'Technical and direct',
          differentiators: ['Source-backed guidance'],
          faq_questions: ['What is this?', 'Why does it matter?'],
          gaps_to_fill: ['Use the CMS-native flow'],
          intent: {
            outcome: 'Understand how the CMS manual-stage flow works.',
            reader: 'Engineers',
            type: 'informational',
          },
          internal_links: [
            {
              title: 'Signup Protection Guide - Gatekeepr',
              url: 'https://gatekeepr.io/blog/signup-protection-guide',
            },
          ],
          meta_descriptions: ['Manual stage integration test.'],
          needs_additional_research: false,
          recommended_outline: [
            {
              heading: 'Overview',
              level: 'H2',
              notes: 'Introduce the workflow.',
              word_budget: 400,
            },
            {
              heading: 'Implementation',
              level: 'H2',
              notes: 'Explain how each stage works.',
              word_budget: 400,
            },
          ],
          research_notes: [],
          secondary_keywords: ['cms workflow'],
          section_word_budget_total: 800,
          serp_expectations: {
            average_word_count_estimate: 1600,
            common_formats: ['tutorial'],
            common_topics: ['workflow'],
            content_type: 'technical guide',
            top_competitors: [
              {
                strengths: 'Direct walkthrough',
                title: 'Competitor One',
                url: 'https://example.com/competitor-one',
              },
            ],
          },
          target_keyword: fixture.keyword,
          target_word_count: 1600,
          title_ideas: ['WSA 202 Manual Stage Article'],
        },
      },
      ReviewLog: {
        changes_made: [
          {
            action: 'recalculated',
            after: 'Budgets aligned to 800 body words.',
            before: 'Outline budget was implied.',
            field: 'SeoBrief.section_word_budget_total',
            phase: '4',
            reason: 'Keep budget math explicit.',
          },
        ],
        confidence_score: 92,
        review_verdict: 'finalized',
        summary: 'Brief approved.',
        warnings: [],
        word_budget_check: {
          bookend_overhead: 850,
          expected_body_budget: 750,
          final_budget_sum: 800,
          original_budget_sum: 800,
          target_word_count: 1600,
          tl_dr_h2_removed: false,
        },
      },
    })
    const generatedArticleMarkdown = `# WSA 202 Manual Stage Article

This is the generated article draft.

## Overview

It explains the workflow and references the [Yelp Fusion API docs](https://docs.developer.yelp.com/docs/fusion-intro).
A signup protection guide helps teams wire the workflow into production.

## Implementation

It details each stage.`
    const rewrittenArticleMarkdown = `# WSA 202 Manual Stage Article

This is the rewritten article draft.

## Overview

It explains the workflow again and references the Yelp Fusion API docs.
A signup protection guide helps teams wire the workflow into production.

## Implementation

It details each stage again.`
    const reviewedArticleMarkdown = `# WSA 202 Manual Stage Article

This is the reviewed article draft.

## TL;DR

A short summary.

## Overview

It explains the workflow and references the Yelp Fusion API docs.

## Implementation

It details each stage with a cleaner editorial pass.

## Key Takeaways

- One
- Two

## FAQ

### What is this?
Answer.

### Why does it matter?
Answer.`
    const reviewedArticleWithMeta = `<!-- Meta: Manual stage integration test. -->\n\n${reviewedArticleMarkdown}`
    const reviewedArticleWithMetaAndInternalLink = reviewedArticleWithMeta.replace(
      'workflow',
      '[workflow](https://gatekeepr.io/blog/signup-protection-guide)',
    )
    const writeResponse = generatedArticleMarkdown
    const rewrittenWriteResponse = rewrittenArticleMarkdown
    const writeInternalOverlayResponse = JSON.stringify([
      buildOverlayOp({
        articleMarkdown: generatedArticleMarkdown,
        exactText: 'workflow',
        id: 'internal-1',
        layer: 'internal_links',
        reason: 'Links to the quick start guide.',
        url: 'https://gatekeepr.io/blog/signup-protection-guide',
        why: 'Helpful next step.',
      }),
    ])
    const rewrittenArticleWithInternalLink = rewrittenArticleMarkdown.replace(
      'signup protection guide',
      '[signup protection guide](https://gatekeepr.io/blog/signup-protection-guide)',
    )
    const rewrittenRepairInternalOverlayResponse = JSON.stringify([
      buildOverlayOp({
        articleMarkdown: rewrittenArticleMarkdown,
        exactText: 'workflow',
        id: 'internal-rewrite-repair-1',
        layer: 'internal_links',
        reason: 'Restores the quick start guide link after rewrite.',
        url: 'https://gatekeepr.io/blog/signup-protection-guide',
        why: 'Helpful next step.',
      }),
    ])
    const checkExternalOverlayResponse = JSON.stringify([
      buildOverlayOp({
        articleMarkdown: reviewedArticleWithMetaAndInternalLink,
        exactText: 'Yelp Fusion API docs',
        id: 'external-restore-1',
        layer: 'external_links',
        reason: 'Restores the authoritative Yelp citation after the revision pass.',
        url: 'https://docs.developer.yelp.com/docs/fusion-intro',
        why: 'Supports the API claim with official documentation.',
      }),
    ])
    const rewrittenExternalOverlayResponse = JSON.stringify([
      buildOverlayOp({
        articleMarkdown: rewrittenArticleWithInternalLink,
        exactText: 'Yelp Fusion API docs',
        id: 'external-rewrite-1',
        layer: 'external_links',
        reason: 'Restores the authoritative Yelp citation after rewrite.',
        url: 'https://docs.developer.yelp.com/docs/fusion-intro',
        why: 'Supports the API claim with official documentation.',
      }),
    ])
    const checkResponse = reviewedArticleMarkdown
    let writeCallCount = 0
    let internalOverlayCallCount = 0
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType?: string }>()
    const uploadedFiles = new Map<string, { content: string; filename: string; mimeType: string }>()
    let generatedFileCount = 0
    let uploadedFileCount = 0
    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `file_manual_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = await readMultipartUploadedFile(formData?.get('file') ?? null)

        uploadedFileCount += 1
        const fileId = `input_manual_${uploadedFileCount}`
        uploadedFiles.set(fileId, {
          content: uploadedFile.content,
          filename: uploadedFile.filename,
          mimeType: uploadedFile.mimeType,
        })

        return anthropicFileUploadResponse(fileId, uploadedFile.filename, uploadedFile.mimeType, uploadedFile.sizeBytes)
      }

      if (url.includes('/v1/files/')) {
        const deleteMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (deleteMatch && init?.method === 'DELETE') {
          return anthropicFileDeleteResponse(deleteMatch[1])
        }

        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)
      const uploadedFileContents = extractAnthropicUploadedFileIds(init)
        .map((fileId) => uploadedFiles.get(fileId)?.content ?? '')
        .join('\n\n')

      if (prompt.includes('You are generating internal-link overlay ops for a markdown article draft.')) {
        internalOverlayCallCount += 1

        return queueGeneratedFile(
          'internal-link-ops.json',
          internalOverlayCallCount === 1
            ? writeInternalOverlayResponse
            : internalOverlayCallCount === 2
              ? '[]'
              : rewrittenRepairInternalOverlayResponse,
          'application/json',
        )
      }

      if (prompt.includes('You are generating external-link overlay ops for a markdown article draft.')) {
        return queueGeneratedFile(
          'external-link-ops.json',
          uploadedFileContents.includes('This is the rewritten article draft.')
            ? rewrittenExternalOverlayResponse
            : checkExternalOverlayResponse,
          'application/json',
        )
      }

      if (prompt.includes('Revise article.md to address the failing list.')) {
        return queueGeneratedFile('article.md', checkResponse, 'text/markdown')
      }

      if (prompt.includes('Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.')) {
        writeCallCount += 1
        return queueGeneratedFile('article.md', writeCallCount === 1 ? writeResponse : rewrittenWriteResponse, 'text/markdown')
      }

      if (prompt.includes('Draft SEO brief file: DraftSeoBrief.json')) {
        return queueGeneratedFile('ValidationOutput.json', validateResponse, 'application/json')
      }

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-source',
        targetKeyword: fixture.keyword,
      },
      provider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)
    expect(ready.run.currentStage).toBe('brief')

    const afterBrief = await runWriterManualStage(ready.run.id, 'brief', payload)
    expect(afterBrief.run.currentStage).toBe('validate')
    expect(afterBrief.stages.find((stage) => stage.stageKey === 'brief')?.status).toBe('completed')
    expect(afterBrief.artifacts.find((artifact) => artifact.artifactType === 'brief_json')).toBeTruthy()

    const afterValidate = await runWriterManualStage(ready.run.id, 'validate', payload)
    expect(afterValidate.run.currentStage).toBe('write')
    expect(afterValidate.artifacts.find((artifact) => artifact.artifactType === 'finalized_brief_json')).toBeTruthy()

    const afterWrite = await runWriterManualStage(ready.run.id, 'write', payload)
    const articleDraftMarkdown = afterWrite.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')?.content
    expect(afterWrite.run.currentStage).toBe('check')
    expect(articleDraftMarkdown).toContain(
      '[signup protection guide](https://gatekeepr.io/blog/signup-protection-guide)',
    )
    expect(articleDraftMarkdown).not.toContain(
      'Related Gatekeepr resources',
    )
    expect(articleDraftMarkdown).toContain(
      '[Yelp Fusion API docs](https://docs.developer.yelp.com/docs/fusion-intro)',
    )
    expect(articleDraftMarkdown).toContain(
      '<!-- Meta: Manual stage integration test. -->',
    )

    const afterCheck = await runWriterManualStage(ready.run.id, 'check', payload)
    expect(['awaiting_user', 'completed']).toContain(afterCheck.run.status)
    expect(afterCheck.run.currentStage).toBe('check')
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'article_revision_md')).toBeFalsy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'check_report_json')).toBeTruthy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'failing_list_md')).toBeTruthy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'check_report_json')?.content).toContain(
      '"summary":',
    )

    const draft = await createBlogPostDraftFromWriterRun(ready.run.id, payload)
    const storedDraft = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: draft.draft.id,
    })
    const refreshed = await getWriterRunDetail(ready.run.id, payload)
    const anthropicCalls = fetchSpy.mock.calls.map((call) => {
      const init = call[1]
      const attachedFiles = extractAnthropicUploadedFileIds(init as RequestInit | undefined).map((fileId) => ({
        content: uploadedFiles.get(fileId)?.content ?? '',
        fileId,
        filename: uploadedFiles.get(fileId)?.filename ?? '',
        mimeType: uploadedFiles.get(fileId)?.mimeType ?? '',
      }))

      return {
        body: init && typeof init === 'object' && 'body' in init ? init.body : null,
        attachedFiles,
        prompt: extractAnthropicPrompt(init as RequestInit | undefined),
      }
    })
    const overlayCalls = anthropicCalls.filter((call) =>
      call.prompt.includes('You are generating internal-link overlay ops for a markdown article draft.'),
    )
    const checkCall = anthropicCalls.find((call) => call.prompt.includes('Revise article.md to address the failing list.'))
    expect(overlayCalls).toHaveLength(0)
    expect(checkCall).toBeFalsy()
    const briefCall = anthropicCalls.find((call) => call.prompt.includes('Output file: BRIEF.json'))
    const validateCall = anthropicCalls.find((call) => call.prompt.includes('Draft SEO brief file: DraftSeoBrief.json'))
    const writeCall = anthropicCalls.find((call) =>
      call.prompt.includes('Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.'),
    )
    expect(briefCall?.prompt).toContain(checkedInClaudePromptDefaults.brief_user_template.trim().slice(0, 60))
    expect(briefCall?.prompt).toContain(
      'The brief stage succeeds only when BRIEF.json is created by bash_code_execution and returned as a downloadable file artifact.',
    )
    expect(briefCall?.prompt).not.toContain('<file name="SourceDoc.md">')
    expect(briefCall?.attachedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'SourceDoc.md',
        }),
        expect.objectContaining({
          filename: 'SourceMetaDescription.txt',
        }),
        expect.objectContaining({
          filename: 'RankingAlternative-01.md',
        }),
      ]),
    )
    expect(validateCall?.prompt).toContain(checkedInClaudePromptDefaults.validate_user_template.trim().slice(0, 60))
    expect(validateCall?.prompt).toContain(
      'The validate stage succeeds only when ValidationOutput.json is created by bash_code_execution and returned as a downloadable file artifact.',
    )
    expect(validateCall?.prompt).not.toContain('<file name="DraftSeoBrief.json">')
    expect(validateCall?.attachedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'DraftSeoBrief.json' }),
        expect.objectContaining({ filename: 'FactPack.json' }),
        expect.objectContaining({ filename: 'CompetitorIndex.json' }),
        expect.objectContaining({ filename: 'SourceMetaDescription.txt' }),
      ]),
    )
    expect(writeCall?.prompt).not.toContain('<file name="FinalizedBrief.json">')
    expect(writeCall?.attachedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'FinalizedBrief.json' }),
        expect.objectContaining({ filename: 'ReviewLog.json' }),
        expect.objectContaining({ filename: 'SourceMetaDescription.txt' }),
      ]),
    )
    expect(writeCall?.prompt).toContain('at least one authoritative external markdown link')
    expect(writeCall?.prompt).toContain('leave natural anchor opportunities for at least 3 internal links')
    expect(writeCall?.prompt).toContain('At least one H2 contains the exact `target_keyword` string.')
    expect(writeCall?.prompt).toContain('The conclusion CTA must mention `Gatekeepr` exactly once')
    expect(writeCall?.prompt).toContain(
      'Create `article.md` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    const writeRequestBody = extractAnthropicRequestBody({ body: String(writeCall?.body), method: 'POST' })
    expect(writeRequestBody?.max_tokens).toBe(32000)
    expect(writeRequestBody?.system).toBe(
      checkedInClaudePromptDefaults.write_system,
    )
    expect(draft.draft.uid).toBe(fixture.draftUid)
    expect(storedDraft.seoDescription).toBe('Manual stage integration test.')
    expect(refreshed.run.createdDraftID).toBe(draft.draft.id)

    const afterRewrite = await runWriterManualStage(ready.run.id, 'write', payload)
    const rewrittenDraftArtifact = [...afterRewrite.artifacts]
      .filter((artifact) => artifact.artifactType === 'article_draft_md')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    const refreshedAnthropicCalls = fetchSpy.mock.calls.map((call) => {
      const init = call[1]
      const attachedFiles = extractAnthropicUploadedFileIds(init as RequestInit | undefined).map((fileId) => ({
        content: uploadedFiles.get(fileId)?.content ?? '',
        filename: uploadedFiles.get(fileId)?.filename ?? '',
      }))

      return {
        body: init && typeof init === 'object' && 'body' in init ? init.body : null,
        attachedFiles,
        prompt: extractAnthropicPrompt(init as RequestInit | undefined),
      }
    })
    const rewrittenExternalOverlayCalls = refreshedAnthropicCalls.filter((call) =>
      call.prompt.includes('You are generating external-link overlay ops for a markdown article draft.'),
    )
    const rewrittenExternalOverlayCall = rewrittenExternalOverlayCalls.at(-1)

    expect(rewrittenExternalOverlayCall?.prompt).toContain(
      'Create `external-link-ops.json` with `bash_code_execution` so it is returned as a downloadable file artifact.',
    )
    expect(afterRewrite.run.currentStage).toBe('check')
    expect(rewrittenDraftArtifact?.content).toContain(
      '[signup protection guide](https://gatekeepr.io/blog/signup-protection-guide)',
    )
    expect(rewrittenDraftArtifact?.content).not.toContain('Related Gatekeepr resources')
    expect(rewrittenDraftArtifact?.content).toContain(
      '[Yelp Fusion API docs](https://docs.developer.yelp.com/docs/fusion-intro)',
    )
    expect(rewrittenDraftArtifact?.content).toContain('<!-- Meta: Manual stage integration test. -->')
    expect(internalOverlayCallCount).toBe(0)
    expect(rewrittenExternalOverlayCall?.prompt).toContain('Verified external sources (1):')
    expect(rewrittenExternalOverlayCall?.prompt).toContain(
      'Yelp Fusion API docs (https://docs.developer.yelp.com/docs/fusion-intro)',
    )
  })

  it('persists local check artifacts without overwriting the article draft when the audit finds issues', async () => {
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        differentiators: [],
        faq_questions: [],
        gaps_to_fill: [],
        intent: {
          outcome: 'Understand the malformed check response path.',
          reader: 'Engineers',
          type: 'informational',
        },
        internal_links: [],
        meta_descriptions: ['Malformed check integration test.'],
        needs_additional_research: false,
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Introduce the workflow.',
            word_budget: 300,
          },
        ],
        secondary_keywords: [],
        section_word_budget_total: 300,
        serp_expectations: {
          average_word_count_estimate: 800,
          common_formats: ['tutorial'],
          common_topics: ['workflow'],
          content_type: 'technical guide',
          top_competitors: [],
        },
        target_keyword: fixture.keyword,
        target_word_count: 800,
        title_ideas: ['WSA 202 Manual Stage Article'],
      },
      additional_sources: [],
    })
    const validateResponse = JSON.stringify({
      FinalizedBrief: {
        SeoBrief: {
          audience: 'Engineers',
          differentiators: [],
          faq_questions: [],
          gaps_to_fill: [],
          intent: {
            outcome: 'Understand the malformed check response path.',
            reader: 'Engineers',
            type: 'informational',
          },
          internal_links: [],
          meta_descriptions: ['Malformed check integration test.'],
          needs_additional_research: false,
          recommended_outline: [
            {
              heading: 'Overview',
              level: 'H2',
              notes: 'Introduce the workflow.',
              word_budget: 300,
            },
          ],
          research_notes: [],
          secondary_keywords: [],
          section_word_budget_total: 300,
          serp_expectations: {
            average_word_count_estimate: 800,
            common_formats: ['tutorial'],
            common_topics: ['workflow'],
            content_type: 'technical guide',
            top_competitors: [],
          },
          target_keyword: fixture.keyword,
          target_word_count: 800,
          title_ideas: ['WSA 202 Manual Stage Article'],
        },
      },
      ReviewLog: {
        changes_made: [],
        confidence_score: 92,
        review_verdict: 'finalized',
        summary: 'Brief approved.',
        warnings: [],
        word_budget_check: {
          bookend_overhead: 850,
          expected_body_budget: 300,
          final_budget_sum: 300,
          original_budget_sum: 300,
          target_word_count: 800,
          tl_dr_h2_removed: false,
        },
      },
    })
    const writeResponse = `# WSA 202 Manual Stage Article

This is the generated article draft.

## Overview

It explains the workflow.`
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType?: string }>()
    let uploadedFileCount = 0
    let generatedFileCount = 0
    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `file_failed_check_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = await readMultipartUploadedFile(formData?.get('file') ?? null)

        uploadedFileCount += 1
        return anthropicFileUploadResponse(
          `input_failed_check_${uploadedFileCount}`,
          uploadedFile.filename,
          uploadedFile.mimeType,
          uploadedFile.sizeBytes,
        )
      }

      if (url.includes('/v1/files/')) {
        const deleteMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (deleteMatch && init?.method === 'DELETE') {
          return anthropicFileDeleteResponse(deleteMatch[1])
        }

        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)

      if (prompt.includes('Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.')) {
        return queueGeneratedFile('article.md', writeResponse, 'text/markdown')
      }

      if (prompt.includes('Draft SEO brief file: DraftSeoBrief.json')) {
        return queueGeneratedFile('ValidationOutput.json', validateResponse, 'application/json')
      }

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-malformed-check-source',
        targetKeyword: fixture.keyword,
      },
      provider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    await runWriterManualStage(ready.run.id, 'brief', payload)
    await runWriterManualStage(ready.run.id, 'validate', payload)

    const afterWrite = await runWriterManualStage(ready.run.id, 'write', payload)
    const afterCheck = await runWriterManualStage(ready.run.id, 'check', payload)

    expect(afterWrite.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')?.content).toContain(
      'This is the generated article draft.',
    )
    expect(afterCheck.run.status).toBe('awaiting_user')
    expect(afterCheck.run.currentStage).toBe('check')
    expect(afterCheck.run.errorMessage).toBeNull()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'article_revision_md')).toBeFalsy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'check_report_json')).toBeTruthy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'failing_list_md')).toBeTruthy()
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'check_report_json')?.content).toContain(
      '"pass": false',
    )
    expect(afterCheck.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')?.content).toContain(
      'This is the generated article draft.',
    )
  })

  it('fails write without saving an article draft when the model does not return article.md', async () => {
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        brand_voice: 'Technical and direct',
        differentiators: ['Source-backed guidance'],
        faq_questions: [],
        gaps_to_fill: ['Use the CMS-native flow'],
        intent: {
          outcome: 'Understand how the CMS manual-stage flow works.',
          reader: 'Engineers',
          type: 'informational',
        },
        internal_links: [],
        meta_descriptions: ['Malformed write integration test.'],
        needs_additional_research: false,
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Introduce the workflow.',
            word_budget: 300,
          },
        ],
        secondary_keywords: [],
        section_word_budget_total: 300,
        serp_expectations: {
          average_word_count_estimate: 800,
          common_formats: ['tutorial'],
          common_topics: ['workflow'],
          content_type: 'technical guide',
          top_competitors: [],
        },
        target_keyword: fixture.keyword,
        target_word_count: 800,
        title_ideas: ['WSA 202 Manual Stage Article'],
      },
      additional_sources: [],
    })
    const validateResponse = JSON.stringify({
      FinalizedBrief: {
        SeoBrief: {
          audience: 'Engineers',
          brand_voice: 'Technical and direct',
          differentiators: ['Source-backed guidance'],
          faq_questions: [],
          gaps_to_fill: ['Use the CMS-native flow'],
          intent: {
            outcome: 'Understand how the CMS manual-stage flow works.',
            reader: 'Engineers',
            type: 'informational',
          },
          internal_links: [],
          meta_descriptions: ['Malformed write integration test.'],
          needs_additional_research: false,
          recommended_outline: [
            {
              heading: 'Overview',
              level: 'H2',
              notes: 'Introduce the workflow.',
              word_budget: 300,
            },
          ],
          research_notes: [],
          secondary_keywords: [],
          section_word_budget_total: 300,
          serp_expectations: {
            average_word_count_estimate: 800,
            common_formats: ['tutorial'],
            common_topics: ['workflow'],
            content_type: 'technical guide',
            top_competitors: [],
          },
          target_keyword: fixture.keyword,
          target_word_count: 800,
          title_ideas: ['WSA 202 Manual Stage Article'],
        },
      },
      ReviewLog: {
        changes_made: [],
        confidence_score: 92,
        review_verdict: 'finalized',
        summary: 'Brief approved.',
        warnings: [],
        word_budget_check: {
          bookend_overhead: 850,
          expected_body_budget: 300,
          final_budget_sum: 300,
          original_budget_sum: 300,
          target_word_count: 800,
          tl_dr_h2_removed: false,
        },
      },
    })
    const malformedWriteResponse =
      "I've completed the article and written it to the output file. Here's a quick summary:\n- Title: WSA 202 Manual Stage Article"
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType?: string }>()
    let uploadedFileCount = 0
    let generatedFileCount = 0
    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `file_failed_write_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = await readMultipartUploadedFile(formData?.get('file') ?? null)

        uploadedFileCount += 1
        return anthropicFileUploadResponse(
          `input_failed_write_${uploadedFileCount}`,
          uploadedFile.filename,
          uploadedFile.mimeType,
          uploadedFile.sizeBytes,
        )
      }

      if (url.includes('/v1/files/')) {
        const deleteMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (deleteMatch && init?.method === 'DELETE') {
          return anthropicFileDeleteResponse(deleteMatch[1])
        }

        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)

      if (prompt.includes('Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.')) {
        return anthropicResponse(malformedWriteResponse)
      }

      if (prompt.includes('Draft SEO brief file: DraftSeoBrief.json')) {
        return queueGeneratedFile('ValidationOutput.json', validateResponse, 'application/json')
      }

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-malformed-write-source',
        targetKeyword: fixture.keyword,
      },
      provider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    await runWriterManualStage(ready.run.id, 'brief', payload)
    await runWriterManualStage(ready.run.id, 'validate', payload)

    await expect(runWriterManualStage(ready.run.id, 'write', payload)).rejects.toThrow(
      'Anthropic did not create the expected output file article.md.',
    )

    const afterFailedWrite = await getWriterRunDetail(ready.run.id, payload)

    expect(afterFailedWrite.run.status).toBe('failed')
    expect(afterFailedWrite.run.currentStage).toBe('write')
    expect(afterFailedWrite.run.errorMessage).toBe('Anthropic did not create the expected output file article.md.')
    expect(afterFailedWrite.stages.find((stage) => stage.stageKey === 'write')?.status).toBe('failed')
    expect(afterFailedWrite.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')).toBeFalsy()
  })

  it('retries generated markdown output in the same Anthropic container when no downloadable file is returned initially', async () => {
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        brand_voice: 'Technical and direct',
        differentiators: ['Source-backed guidance'],
        faq_questions: [],
        gaps_to_fill: ['Use the CMS-native flow'],
        intent: {
          outcome: 'Understand how the CMS manual-stage flow works.',
          reader: 'Engineers',
          type: 'informational',
        },
        internal_links: [],
        meta_descriptions: ['Retry generated file integration test.'],
        needs_additional_research: false,
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Introduce the workflow.',
            word_budget: 300,
          },
        ],
        secondary_keywords: [],
        section_word_budget_total: 300,
        serp_expectations: {
          average_word_count_estimate: 800,
          common_formats: ['tutorial'],
          common_topics: ['workflow'],
          content_type: 'technical guide',
          top_competitors: [],
        },
        target_keyword: fixture.keyword,
        target_word_count: 800,
        title_ideas: ['WSA 202 Manual Stage Article'],
      },
      additional_sources: [],
    })
    const validateResponse = JSON.stringify({
      FinalizedBrief: {
        SeoBrief: {
          audience: 'Engineers',
          brand_voice: 'Technical and direct',
          differentiators: ['Source-backed guidance'],
          faq_questions: [],
          gaps_to_fill: ['Use the CMS-native flow'],
          intent: {
            outcome: 'Understand how the CMS manual-stage flow works.',
            reader: 'Engineers',
            type: 'informational',
          },
          internal_links: [],
          meta_descriptions: ['Retry generated file integration test.'],
          needs_additional_research: false,
          recommended_outline: [
            {
              heading: 'Overview',
              level: 'H2',
              notes: 'Introduce the workflow.',
              word_budget: 300,
            },
          ],
          research_notes: [],
          secondary_keywords: [],
          section_word_budget_total: 300,
          serp_expectations: {
            average_word_count_estimate: 800,
            common_formats: ['tutorial'],
            common_topics: ['workflow'],
            content_type: 'technical guide',
            top_competitors: [],
          },
          target_keyword: fixture.keyword,
          target_word_count: 800,
          title_ideas: ['WSA 202 Manual Stage Article'],
        },
      },
      ReviewLog: {
        changes_made: [],
        confidence_score: 92,
        review_verdict: 'finalized',
        summary: 'Brief approved.',
        warnings: [],
        word_budget_check: {
          bookend_overhead: 850,
          expected_body_budget: 300,
          final_budget_sum: 300,
          original_budget_sum: 300,
          target_word_count: 800,
          tl_dr_h2_removed: false,
        },
      },
    })
    const writeResponse = '# Retry article\n\nClaude rewrote this file on the second attempt.'
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType?: string }>()
    let generatedFileCount = 0
    let writeAttemptCount = 0
    let retryUsedExpectedContainer = false
    let uploadedFileCount = 0

    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `file_retry_write_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = await readMultipartUploadedFile(formData?.get('file') ?? null)

        uploadedFileCount += 1
        return anthropicFileUploadResponse(
          `input_retry_write_${uploadedFileCount}`,
          uploadedFile.filename,
          uploadedFile.mimeType,
          uploadedFile.sizeBytes,
        )
      }

      if (url.includes('/v1/files/')) {
        const deleteMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (deleteMatch && init?.method === 'DELETE') {
          return anthropicFileDeleteResponse(deleteMatch[1])
        }

        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)
      const body =
        init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
          ? (JSON.parse(init.body) as {
              container?: string
            })
          : null
      const bodyText = init && typeof init === 'object' && 'body' in init && typeof init.body === 'string' ? init.body : ''

      if (bodyText.includes('The previous attempt did not return a downloadable file artifact')) {
        retryUsedExpectedContainer = body?.container === 'container_retry_article_md'
        return queueGeneratedFile('article.md', writeResponse, 'text/markdown')
      }

      if (prompt.includes('Write the complete article in markdown based on FinalizedBrief.json and ReviewLog.json.')) {
        writeAttemptCount += 1

        if (writeAttemptCount === 1) {
          return anthropicContainerResponse('container_retry_article_md', 'Created the file in the workspace.')
        }

        return queueGeneratedFile('article.md', writeResponse, 'text/markdown')
      }

      if (prompt.includes('Draft SEO brief file: DraftSeoBrief.json')) {
        return queueGeneratedFile('ValidationOutput.json', validateResponse, 'application/json')
      }

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-generated-file-retry-source',
        targetKeyword: fixture.keyword,
      },
      provider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    await runWriterManualStage(ready.run.id, 'brief', payload)
    await runWriterManualStage(ready.run.id, 'validate', payload)

    const afterWrite = await runWriterManualStage(ready.run.id, 'write', payload)

    expect(writeAttemptCount).toBe(1)
    expect(retryUsedExpectedContainer).toBe(true)
    expect(afterWrite.run.currentStage).toBe('check')
    expect(afterWrite.artifacts.find((artifact) => artifact.artifactType === 'article_draft_md')?.content).toContain(
      'Claude rewrote this file on the second attempt.',
    )
  })

  it('rewrites invalid validate-stage output in the same Anthropic container before advancing to write', async () => {
    const briefResponse = JSON.stringify({
      SeoBrief: {
        audience: 'Engineers',
        brand_voice: 'Technical and direct',
        differentiators: ['Source-backed guidance'],
        faq_questions: [],
        gaps_to_fill: ['Use the CMS-native flow'],
        intent: {
          outcome: 'Understand how the CMS manual-stage flow works.',
          reader: 'Engineers',
          type: 'informational',
        },
        internal_links: [],
        meta_descriptions: ['Retry generated file integration test.'],
        needs_additional_research: false,
        recommended_outline: [
          {
            heading: 'Overview',
            level: 'H2',
            notes: 'Introduce the workflow.',
            word_budget: 300,
          },
        ],
        secondary_keywords: [],
        section_word_budget_total: 300,
        serp_expectations: {
          average_word_count_estimate: 800,
          common_formats: ['tutorial'],
          common_topics: ['workflow'],
          content_type: 'technical guide',
          top_competitors: [],
        },
        target_keyword: fixture.keyword,
        target_word_count: 800,
        title_ideas: ['WSA 202 Manual Stage Article'],
      },
      additional_sources: [],
    })
    const invalidValidateResponse = JSON.stringify({
      overall_score: {
        max_possible_score: 100,
        score: 88,
      },
      recommendations: ['Tighten the title.'],
    })
    const validValidateResponse = JSON.stringify({
      FinalizedBrief: {
        SeoBrief: {
          audience: 'Engineers',
          brand_voice: 'Technical and direct',
          differentiators: ['Source-backed guidance'],
          faq_questions: [],
          gaps_to_fill: ['Use the CMS-native flow'],
          intent: {
            outcome: 'Understand how the CMS manual-stage flow works.',
            reader: 'Engineers',
            type: 'informational',
          },
          internal_links: [],
          meta_descriptions: ['Retry generated file integration test.'],
          needs_additional_research: false,
          recommended_outline: [
            {
              heading: 'Overview',
              level: 'H2',
              notes: 'Introduce the workflow.',
              word_budget: 300,
            },
          ],
          research_notes: [],
          secondary_keywords: [],
          section_word_budget_total: 300,
          serp_expectations: {
            average_word_count_estimate: 800,
            common_formats: ['tutorial'],
            common_topics: ['workflow'],
            content_type: 'technical guide',
            top_competitors: [],
          },
          target_keyword: fixture.keyword,
          target_word_count: 800,
          title_ideas: ['WSA 202 Manual Stage Article'],
        },
      },
      ReviewLog: {
        changes_made: [],
        confidence_score: 92,
        review_verdict: 'finalized',
        summary: 'Brief approved after schema correction.',
        warnings: [],
        word_budget_check: {
          bookend_overhead: 850,
          expected_body_budget: 300,
          final_budget_sum: 300,
          original_budget_sum: 300,
          target_word_count: 800,
          tl_dr_h2_removed: false,
        },
      },
    })
    const generatedFiles = new Map<string, { content: string; filename: string; mimeType?: string }>()
    let generatedFileCount = 0
    let uploadedFileCount = 0
    let validateInitialCallCount = 0
    let validateRetryUsedExpectedContainer = false

    const queueGeneratedFile = (filename: string, content: string, mimeType = 'text/plain') => {
      generatedFileCount += 1
      const fileId = `file_retry_validate_${generatedFileCount}`
      generatedFiles.set(fileId, { content, filename, mimeType })
      return anthropicGeneratedFileResponse(fileId, filename)
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const url = typeof _input === 'string' ? _input : _input instanceof Request ? _input.url : String(_input)

      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        const formData = init.body instanceof FormData ? init.body : null
        const uploadedFile = await readMultipartUploadedFile(formData?.get('file') ?? null)

        uploadedFileCount += 1
        return anthropicFileUploadResponse(
          `input_retry_validate_${uploadedFileCount}`,
          uploadedFile.filename,
          uploadedFile.mimeType,
          uploadedFile.sizeBytes,
        )
      }

      if (url.includes('/v1/files/')) {
        const deleteMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (deleteMatch && init?.method === 'DELETE') {
          return anthropicFileDeleteResponse(deleteMatch[1])
        }

        const metadataMatch = url.match(/\/v1\/files\/([^/]+)$/)
        if (metadataMatch) {
          const entry = generatedFiles.get(metadataMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file metadata request: ${metadataMatch[1]}`)
          }

          return anthropicFileMetadataResponse(metadataMatch[1], entry.filename, entry.mimeType)
        }

        const contentMatch = url.match(/\/v1\/files\/([^/]+)\/content$/)
        if (contentMatch) {
          const entry = generatedFiles.get(contentMatch[1])
          if (!entry) {
            throw new Error(`Unknown generated file download request: ${contentMatch[1]}`)
          }

          return anthropicFileContentResponse(entry.content, entry.mimeType)
        }
      }

      const prompt = extractAnthropicPrompt(init)
      const body =
        init && typeof init === 'object' && 'body' in init && typeof init.body === 'string'
          ? (JSON.parse(init.body) as {
              container?: string
            })
          : null

      if (prompt.includes('Draft SEO brief file: DraftSeoBrief.json')) {
        validateInitialCallCount += 1
        generatedFileCount += 1
        const fileId = `file_retry_validate_${generatedFileCount}`
        generatedFiles.set(fileId, {
          content: invalidValidateResponse,
          filename: 'ValidationOutput.json',
          mimeType: 'application/json',
        })
        return anthropicGeneratedFileResponseWithContainer(
          'container_retry_validate_contract',
          fileId,
          'ValidationOutput.json',
        )
      }

      if (prompt.includes('The previous attempt created ValidationOutput.json, but the JSON schema was invalid for this workflow.')) {
        validateRetryUsedExpectedContainer = body?.container === 'container_retry_validate_contract'
        return queueGeneratedFile('ValidationOutput.json', validValidateResponse, 'application/json')
      }

      if (prompt.includes('Output file: BRIEF.json')) {
        return queueGeneratedFile('BRIEF.json', briefResponse, 'application/json')
      }

      throw new Error(`Unexpected Anthropic prompt: ${prompt.slice(0, 120)}`)
    })

    const discovered = await createWriterRunAndStart(
      {
        sourceUrl: 'https://example.com/wsa-202-validate-schema-retry-source',
        targetKeyword: fixture.keyword,
      },
      provider,
    )

    const selectedCompetitorIDs = discovered.sources
      .filter((source) => source.role === 'competitor')
      .slice(0, 1)
      .map((source) => source.id)

    const ready = await selectWriterSourcesAndContinue(discovered.run.id, selectedCompetitorIDs, provider)

    await runWriterManualStage(ready.run.id, 'brief', payload)
    const afterValidate = await runWriterManualStage(ready.run.id, 'validate', payload)

    expect(validateInitialCallCount).toBe(1)
    expect(validateRetryUsedExpectedContainer).toBe(true)
    expect(afterValidate.run.currentStage).toBe('write')
    expect(afterValidate.stages.find((stage) => stage.stageKey === 'validate')?.status).toBe('completed')
    expect(afterValidate.artifacts.find((artifact) => artifact.artifactType === 'review_log_json')?.content).toContain(
      'Brief approved after schema correction.',
    )
  })
})
