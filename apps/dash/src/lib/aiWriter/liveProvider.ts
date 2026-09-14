import { callAIWriterGeneratedFile as callAnthropicGeneratedFile } from './provider'
import { fetchReadableArticleWithBrightData, searchKeywordWithBrightData } from './brightdata'
import { convertHtmlToMarkdownDocument } from './htmlToMarkdown'
import { createWriterTraceEvent } from './repository'
import type { WriterAutomationProvider } from './engine'

const MAX_MARKDOWN_INPUT_CHARS = 250_000
const MARKDOWN_GENERATION_TIMEOUT_MS = 5 * 60 * 1000
const BLOCKS_GENERATION_TIMEOUT_MS = 3 * 60 * 1000
const FACTPACK_GENERATION_TIMEOUT_MS = 5 * 60 * 1000

type ClaudeBlock = {
  heading: null | string
  kind: string
  markdown: string
  plain_text: string
  word_count: number
}

type ClaudeFactpackItem = {
  needs_verification: boolean
  source_block_id: string
  source_url: string
  text: string
}

type ClaudeFactpack = {
  claims: ClaudeFactpackItem[]
  definitions: ClaudeFactpackItem[]
  quotes: Array<ClaudeFactpackItem & { speaker?: string }>
  stats: ClaudeFactpackItem[]
  steps: ClaudeFactpackItem[]
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorFactory: () => Error) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(errorFactory())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toWordCount(value: string) {
  return value.split(/\s+/u).filter(Boolean).length
}

function inferBlockKind(markdown: string, heading: null | string): string {
  if (heading) {
    return 'section'
  }

  if (/^\s*[-*+]\s+/m.test(markdown) || /^\s*\d+\.\s+/m.test(markdown)) {
    return 'list'
  }

  if (/^\s*\|.+\|\s*$/m.test(markdown)) {
    return 'table'
  }

  if (/^\s*```/m.test(markdown)) {
    return 'code'
  }

  return 'paragraph'
}

function convertMarkdownToStructuredBlocks(markdown: string): ClaudeBlock[] {
  const sections: ClaudeBlock[] = []
  const lines = markdown.split(/\r?\n/u)
  let currentHeading: null | string = null
  let currentLines: string[] = []

  const pushCurrent = () => {
    const content = currentLines.join('\n').trim()

    if (!content) {
      currentLines = []
      return
    }

    const plainText = markdownToPlainText(content)

    sections.push({
      heading: currentHeading,
      kind: inferBlockKind(content, currentHeading),
      markdown: content,
      plain_text: plainText,
      word_count: toWordCount(plainText),
    })
    currentLines = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/u)

    if (headingMatch) {
      pushCurrent()
      currentHeading = headingMatch[1]?.trim() || null
      currentLines = [line]
      continue
    }

    currentLines.push(line)
  }

  pushCurrent()

  return sections.length > 0
    ? sections
    : [
        {
          heading: null,
          kind: inferBlockKind(markdown, null),
          markdown: markdown.trim(),
          plain_text: markdownToPlainText(markdown),
          word_count: toWordCount(markdownToPlainText(markdown)),
        },
      ]
}

function makeFactpackItem(text: string, sourceBlockId: string, sourceUrl: string): ClaudeFactpackItem {
  return {
    needs_verification: false,
    source_block_id: sourceBlockId,
    source_url: sourceUrl,
    text,
  }
}

function sentenceCandidates(value: string) {
  return value
    .split(/(?<=[.!?])\s+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 40)
}

function buildLocalFactpack(sources: Array<{
  blocks: Array<{
    block_id: string
    heading: null | string
    kind: string
    markdown: string
    plain_text: string
    word_count: number
  }>
  source: {
    url: string
  }
}>) {
  const claims: ClaudeFactpackItem[] = []
  const definitions: ClaudeFactpackItem[] = []
  const quotes: Array<ClaudeFactpackItem & { speaker?: string }> = []
  const stats: ClaudeFactpackItem[] = []
  const steps: ClaudeFactpackItem[] = []

  for (const source of sources) {
    for (const block of source.blocks) {
      const text = block.plain_text.trim()

      if (!text) {
        continue
      }

      const sourceItem = makeFactpackItem(text, block.block_id, source.source.url)

      if (claims.length < 8) {
        const claimSentence = sentenceCandidates(text)[0]
        if (claimSentence) {
          claims.push(makeFactpackItem(claimSentence, block.block_id, source.source.url))
        }
      }

      if (definitions.length < 4 && block.heading) {
        definitions.push(
          makeFactpackItem(`${block.heading}: ${sentenceCandidates(text)[0] ?? text}`, block.block_id, source.source.url),
        )
      }

      if (stats.length < 6 && /\b\d[\d.,%]*\b/.test(text)) {
        stats.push(sourceItem)
      }

      if (quotes.length < 4 && /["“”']/.test(block.markdown)) {
        quotes.push({
          ...sourceItem,
          speaker: block.heading ?? undefined,
        })
      }

      if (steps.length < 8) {
        const stepMatches = block.markdown.match(/^\s*(?:[-*+]|\d+\.)\s+.+$/gmu) ?? []
        for (const match of stepMatches) {
          if (steps.length >= 8) {
            break
          }

          steps.push(
            makeFactpackItem(match.replace(/^\s*(?:[-*+]|\d+\.)\s+/u, '').trim(), block.block_id, source.source.url),
          )
        }
      }
    }
  }

  return {
    claims,
    definitions,
    quotes,
    stats,
    steps,
  } satisfies ClaudeFactpack
}

export function createLiveWriterAutomationProvider(): WriterAutomationProvider {
  return {
    async buildFactpack({ run, sources }) {
      const sourceBlocksPayload = {
        sources: sources.map((source) => ({
          blocks: source.blocks,
          sourceUrl: source.source.url,
        })),
        targetKeyword: run.targetKeyword,
        targetWordCount: run.targetWordCount,
      }

      try {
        const generated = await withTimeout(
          callAnthropicGeneratedFile(
            {
              filename: 'FactPack.json',
              inputFiles: [
                {
                  content: JSON.stringify(sourceBlocksPayload, null, 2),
                  filename: 'SourceBlocks.json',
                  mimeType: 'application/json',
                },
              ],
              maxTokens: 12_000,
              prompt: [
                'Build a factpack from the uploaded SourceBlocks.json file.',
                'Write the final JSON object to FactPack.json.',
                'Create FactPack.json with bash_code_execution so it is returned as a downloadable file artifact.',
                'Do not use text_editor_code_execution for the output file.',
                'Use exactly these top-level keys: claims, stats, definitions, steps, quotes.',
                'Each item must include text, source_block_id, source_url, needs_verification.',
                'Quotes may also include speaker.',
                'Do not paste JSON into the chat response.',
                'Reply with a short confirmation only after FactPack.json is returned as a downloadable file artifact.',
              ].join('\n'),
              system:
                'You compile source-backed editorial factpacks for a content writer. Read uploaded files from the workspace and write the final JSON to the requested output file.',
            },
            {
              eventType: 'factpack_generate',
              runID: run.id,
              stageKey: 'build_factpack',
            },
          ),
          FACTPACK_GENERATION_TIMEOUT_MS,
          () =>
            new Error(
              `Anthropic factpack generation timed out after ${Math.round(FACTPACK_GENERATION_TIMEOUT_MS / 1000)} seconds.`,
            ),
        )
        const factpack = JSON.parse(generated.file.content) as ClaudeFactpack

        return {
          factpack,
          markdown: [
            '# Factpack',
            '',
            ...factpack.claims.map((item) => `- ${item.text} (${item.source_url})`),
          ].join('\n'),
          raw: {
            confirmationText: generated.text,
            generatedFile: generated.file,
            modelOutput: factpack,
          },
        }
      } catch (error) {
        const factpack = buildLocalFactpack(sources)
        const fallbackReason = error instanceof Error ? error.message : 'Anthropic factpack generation failed.'

        await createWriterTraceEvent({
          completedAt: new Date().toISOString(),
          eventType: 'factpack_generate_local_fallback',
          provider: 'local',
          requestPayload: {
            sourceCount: sources.length,
            targetKeyword: run.targetKeyword,
          },
          responsePayload: {
            claimCount: factpack.claims.length,
            fallbackReason,
            stepCount: factpack.steps.length,
          },
          runID: run.id,
          stageKey: 'build_factpack',
          startedAt: new Date().toISOString(),
          status: 'completed',
        })

        return {
          factpack,
          markdown: [
            '# Factpack',
            '',
            ...factpack.claims.map((item) => `- ${item.text} (${item.source_url})`),
          ].join('\n'),
          raw: {
            fallbackReason,
            modelOutput: factpack,
          },
        }
      }
    },
    async convertArticleToMarkdown({ article, run, source }) {
      if (article.html.length > MAX_MARKDOWN_INPUT_CHARS) {
        throw new Error(
          `Markdown conversion HTML input too large after extraction: ${article.html.length} chars > ${MAX_MARKDOWN_INPUT_CHARS} maximum`,
        )
      }

      try {
        const generated = await withTimeout(
          callAnthropicGeneratedFile(
            {
              filename: 'article.md',
              inputFiles: [
                {
                  content: article.html,
                  filename: 'SourceArticle.html',
                  mimeType: 'text/html',
                },
              ],
              maxTokens: 12_000,
              prompt: [
                'Convert the uploaded SourceArticle.html file into a complete markdown document.',
                `Source URL: ${source.url}`,
                `Source title: ${article.title}`,
                'Preserve headings, lists, tables, and links.',
                'Start the document with exactly one H1.',
                'If the source HTML does not contain a clear H1, synthesize one from the provided title.',
                'Do not summarize beyond the source.',
                'Do not omit short paragraphs just because the source is brief.',
                'Write the final markdown to article.md.',
                'Create article.md with bash_code_execution so it is returned as a downloadable file artifact.',
                'Do not use text_editor_code_execution for the output file.',
                'Do not paste markdown into the chat response.',
                'Reply with a short confirmation only after article.md is returned as a downloadable file artifact.',
              ].join('\n'),
              system:
                'You convert article HTML into a complete markdown document for a content production pipeline. Read uploaded files from the workspace and write the final markdown to the requested output file.',
            },
            {
              eventType: 'markdown_convert',
              runID: run.id,
              sourceID: source.id,
              stageKey: 'convert_markdown',
            },
          ),
          MARKDOWN_GENERATION_TIMEOUT_MS,
          () =>
            new Error(
              `Anthropic markdown conversion timed out after ${Math.round(MARKDOWN_GENERATION_TIMEOUT_MS / 1000)} seconds.`,
            ),
        )

        return {
          markdown: generated.file.content,
          raw: {
            confirmationText: generated.text,
            generatedFile: generated.file,
            sourceUrl: source.url,
          },
        }
      } catch (error) {
        const fallbackMarkdown = convertHtmlToMarkdownDocument({
          html: article.html,
          title: article.title,
        })

        if (!fallbackMarkdown.trim()) {
          throw error
        }
        const fallbackReason = error instanceof Error ? error.message : 'Anthropic markdown conversion failed.'

        await createWriterTraceEvent({
          completedAt: new Date().toISOString(),
          eventType: 'markdown_convert_local_fallback',
          provider: 'local',
          requestPayload: {
            sourceUrl: source.url,
            title: article.title,
          },
          responsePayload: {
            fallbackReason,
            markdownLength: fallbackMarkdown.length,
            preview: fallbackMarkdown.slice(0, 2000),
          },
          runID: run.id,
          sourceID: source.id,
          stageKey: 'convert_markdown',
          startedAt: new Date().toISOString(),
          status: 'completed',
        })

        return {
          markdown: fallbackMarkdown,
          raw: {
            fallbackReason,
            sourceUrl: source.url,
          },
        }
      }
    },
    async convertMarkdownToBlocks({ markdown, run, source }) {
      try {
        const generated = await withTimeout(
          callAnthropicGeneratedFile(
            {
              filename: 'blocks.json',
              inputFiles: [
                {
                  content: markdown,
                  filename: 'SourceArticle.md',
                  mimeType: 'text/markdown',
                },
              ],
              maxTokens: 12_000,
              prompt: [
                'Transform the uploaded SourceArticle.md file into a JSON array of structured content blocks.',
                'Write the JSON array to blocks.json.',
                'Create blocks.json with bash_code_execution so it is returned as a downloadable file artifact.',
                'Do not use text_editor_code_execution for the output file.',
                'Each block must contain: kind, heading, markdown, plain_text, word_count.',
                'Use heading = null when no heading applies.',
                'Do not paste JSON into the chat response.',
                'Reply with a short confirmation only after blocks.json is returned as a downloadable file artifact.',
              ].join('\n'),
              system:
                'You convert markdown articles into structured editorial blocks. Read uploaded files from the workspace and write the final JSON to the requested output file.',
            },
            {
              eventType: 'blocks_extract',
              runID: run.id,
              sourceID: source.id,
              stageKey: 'extract_blocks',
            },
          ),
          BLOCKS_GENERATION_TIMEOUT_MS,
          () =>
            new Error(
              `Anthropic block extraction timed out after ${Math.round(BLOCKS_GENERATION_TIMEOUT_MS / 1000)} seconds.`,
            ),
        )
        const blocks = JSON.parse(generated.file.content) as ClaudeBlock[]
        const normalizedBlocks = blocks.map((block, index) => ({
          block_id: `B${index + 1}`,
          heading: block.heading ?? null,
          kind: block.kind || 'paragraph',
          markdown: block.markdown,
          order: index + 1,
          plain_text: block.plain_text,
          word_count: block.word_count,
        }))

        return {
          blocks: normalizedBlocks,
          raw: {
            confirmationText: generated.text,
            generatedFile: generated.file,
            modelOutput: blocks,
          },
        }
      } catch (error) {
        const blocks = convertMarkdownToStructuredBlocks(markdown)
        const fallbackReason = error instanceof Error ? error.message : 'Anthropic block extraction failed.'

        await createWriterTraceEvent({
          completedAt: new Date().toISOString(),
          eventType: 'blocks_extract_local_fallback',
          provider: 'local',
          requestPayload: {
            markdownLength: markdown.length,
            sourceUrl: source.url,
          },
          responsePayload: {
            blockCount: blocks.length,
            fallbackReason,
            preview: JSON.stringify(blocks.slice(0, 3)),
          },
          runID: run.id,
          sourceID: source.id,
          stageKey: 'extract_blocks',
          startedAt: new Date().toISOString(),
          status: 'completed',
        })

        const normalizedBlocks = blocks.map((block, index) => ({
          block_id: `B${index + 1}`,
          heading: block.heading ?? null,
          kind: block.kind || 'paragraph',
          markdown: block.markdown,
          order: index + 1,
          plain_text: block.plain_text,
          word_count: block.word_count,
        }))

        return {
          blocks: normalizedBlocks,
          raw: {
            fallbackReason,
            modelOutput: blocks,
          },
        }
      }
    },
    async fetchReadableArticle({ run, source }) {
      return fetchReadableArticleWithBrightData(source.url, {
        eventType: 'article_fetch',
        runID: run.id,
        sourceID: source.id,
        stageKey: 'convert_markdown',
      })
    },
    async searchKeyword({ run }) {
      return searchKeywordWithBrightData(run.targetKeyword, {
        eventType: 'serp_search',
        runID: run.id,
        stageKey: 'discover_serp',
      })
    },
  }
}
