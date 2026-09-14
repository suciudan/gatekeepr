import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'

import { ensureWriterArticleRevisionRichTextArtifact, getLatestWriterFinalArticleArtifact } from './articleRevision'
import {
  buildWriterCheckReportFailingListMarkdown,
  buildWriterCheckReportFromSeoCheckerResult,
  getEnabledWriterCheckKeys,
  mergeWriterCheckReportForSelectedCheck,
  parseWriterCheckReport,
} from './checkReport'
import { checkedInClaudePromptDefaults } from './agentic/checked-in-claude-prompt-defaults'
import { renderClaudePromptTemplate } from './agentic/checkPrompt'
import { runSeoChecklist } from './agentic/checkers/seo-checker'
import {
  resolveInternalLinksDocument,
  type InternalLinksDocument,
} from './agentic/internalLinks'
import { resolveSeoCheckerConfig } from './agentic/seo-checker-settings'
import {
  callAIWriterGeneratedFile as callAnthropicGeneratedFile,
  callAIWriterJson as callAnthropicJson,
  extractJsonFromResponseText,
  stripTrailingCommasFromJsonLikeText,
  type AIWriterInputFile as AnthropicInputFile,
} from './provider'
import { describeAIWriterError } from './errors'
import { persistAIWriterRemoteFile } from './remoteFiles'
import {
  claimNextQueuedWriterJob,
  createWriterJob,
  createWriterTraceEvent,
  getWriterRunDetail,
  heartbeatWriterJobClaim,
  listWriterJobs,
  listWriterRuns,
  listWriterStageExecutions,
  releaseWriterJobClaim,
  updateWriterJob,
  updateWriterRun,
  upsertWriterArtifact,
  upsertWriterStageExecution,
} from './repository'
import type {
  WriterArtifactRecord,
  WriterArtifactType,
  WriterJobKind,
  WriterJobRecord,
  WriterRelationshipID,
  WriterRunDetail,
  WriterStageKey,
} from './types'

type PayloadClient = Payload

declare global {
  var __cmsAiWriterManualStageWorker:
    | {
        workerId: string
      }
    | undefined
}

const manualStageWorkerState = globalThis.__cmsAiWriterManualStageWorker ?? {
  workerId: `cms-ai-writer-manual-${crypto.randomUUID()}`,
}

globalThis.__cmsAiWriterManualStageWorker = manualStageWorkerState

type SeoBriefOutlineItem = {
  heading: string
  objective: string
}

type SeoBrief = {
  angle: string
  audience: string
  differentiators: string[]
  internalLinks: string[]
  keyPoints: string[]
  metaDescription: string
  outline: SeoBriefOutlineItem[]
  recommendedWordCount: number
  searchIntent: string
  title: string
}

type ValidationResult = {
  FinalizedBrief?: Record<string, unknown>
  ReviewLog?: Record<string, unknown>
  approved: boolean
  finalBrief?: Partial<SeoBrief>
  reviewLog?: string[]
  summary?: string
}

type LinkOverlayOpBase = {
  end: number
  exactText: string
  id: string
  reason: string
  start: number
  url: string
  why: string
}

type InternalLinkOverlayOp = {
  layer: 'internal_links'
} & LinkOverlayOpBase

type ExternalLinkOverlayOp = {
  layer: 'external_links'
} & LinkOverlayOpBase

type MarkdownLinkCandidate = {
  anchorText: string
  hostname: string
  url: string
}

type AnthropicPromptWithFiles = {
  inputFiles: AnthropicInputFile[]
  prompt: string
}

export const manualStageKeys = ['brief', 'validate', 'write', 'check'] as const

const MAX_STORED_WRITE_PROMPT_CHARS = 10_000
const MANUAL_GENERATED_FILE_TIMEOUT_MS = {
  brief: 10 * 60 * 1000,
  validate: 12 * 60 * 1000,
  write: null,
  check: 10 * 60 * 1000,
} satisfies Record<(typeof manualStageKeys)[number], number | null>
const MANUAL_STAGE_JOB_HEARTBEAT_MS = 10_000
const MANUAL_STAGE_JOB_LEASE_MS = 45_000
const MANUAL_LINK_OVERLAY_TIMEOUT_MS = 3 * 60 * 1000
const BRIEF_INSTRUCTION_TEMPLATE =
  'Target keyword: {{targetKeyword}}\nSource article URL: {{sourceUrl}}\nTarget word count: {{targetWordCount}}\nOutput file: BRIEF.json\nBRIEF.json must contain top-level keys SeoBrief and additional_sources.\nThe brief stage succeeds only when BRIEF.json is created by bash_code_execution and returned as a downloadable file artifact. Do not put the JSON in the chat response. Do not use text_editor_code_execution for the output file.\nIf InternalLinks.txt is present, use it as the source of truth for candidate internal links.\nIf SourceMetaDescription.txt is present, use it as a source-backed input for candidate titles and meta descriptions.\n\nRanking alternative file map:\n{{rankingAlternativeFileMap}}\n\n{{briefUserPrompt}}'
const VALIDATE_INSTRUCTION_TEMPLATE =
  'Target keyword: {{targetKeyword}}\nSource article URL: {{sourceUrl}}\nDraft SEO brief file: DraftSeoBrief.json\nFactPack file: FactPack.json\nCompetitor index file: CompetitorIndex.json\nIf InternalLinks.txt is present, use it as the source of truth for internal-link candidates.\nIf SourceMetaDescription.txt is present, use it as a source-backed input when validating title and meta-description fields.\nOutput file: ValidationOutput.json\nValidationOutput.json must contain top-level keys FinalizedBrief and ReviewLog.\nThe validate stage succeeds only when ValidationOutput.json is created by bash_code_execution and returned as a downloadable file artifact. Do not put the JSON in the chat response. Do not use text_editor_code_execution for the output file.\n\n{{validateUserPrompt}}'
const MANUAL_STAGE_JOB_KIND: Record<(typeof manualStageKeys)[number], WriterJobKind> = {
  brief: 'brief.generate',
  validate: 'validate.run',
  write: 'write.generate',
  check: 'check.audit',
}

function nowIso() {
  return new Date().toISOString()
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

function formatTimeoutMinutes(timeoutMs: number) {
  return Math.round(timeoutMs / 60_000)
}

function withManualGeneratedFileTimeout<T>(stageKey: (typeof manualStageKeys)[number], filename: string, promise: Promise<T>) {
  const timeoutMs = MANUAL_GENERATED_FILE_TIMEOUT_MS[stageKey]

  if (timeoutMs == null) {
    return promise
  }

  return withTimeout(
    promise,
    timeoutMs,
    () => new Error(`AI Writer ${stageKey} stage timed out after ${formatTimeoutMinutes(timeoutMs)} minutes while waiting for ${filename}.`),
  )
}

function withManualLinkOverlayTimeout<T>(promise: Promise<T>) {
  return withTimeout(
    promise,
    MANUAL_LINK_OVERLAY_TIMEOUT_MS,
    () => new Error(`AI Writer link overlay timed out after ${formatTimeoutMinutes(MANUAL_LINK_OVERLAY_TIMEOUT_MS)} minutes.`),
  )
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateWritePromptForStorage(value: string) {
  return value.length <= MAX_STORED_WRITE_PROMPT_CHARS
    ? value
    : `${value.slice(0, MAX_STORED_WRITE_PROMPT_CHARS)}\n\n[truncated before storage]`
}

function countWords(value: string) {
  return value.split(/\s+/u).filter(Boolean).length
}

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function ensureStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => pickString(entry)).filter(Boolean) : []
}

function normalizeInternalLinkEntry(value: unknown) {
  if (typeof value === 'string') {
    return pickString(value)
  }

  const entry = ensureObject(value)
  const url = pickString(entry.url ?? entry.href)

  if (!url) {
    return ''
  }

  const title =
    pickString(entry.title) ||
    pickString(entry.label) ||
    pickString(entry.anchorText ?? entry.anchor_text) ||
    inferAnchorTextFromUrl(url)

  return title ? `${title} (${url})` : url
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function getLatestArtifact(
  artifacts: WriterArtifactRecord[],
  artifactType: WriterArtifactType,
  sourceID?: null | WriterRelationshipID,
) {
  return [...artifacts]
    .filter(
      (artifact) =>
        artifact.artifactType === artifactType && (sourceID === undefined || artifact.sourceID === (sourceID ?? null)),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function normalizeBriefOutline(value: unknown): SeoBriefOutlineItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      const item = ensureObject(entry)
      const heading = pickString(item.heading)
      const objective = pickString(item.objective)

      if (!heading || !objective) {
        return null
      }

      return {
        heading,
        objective,
      }
    })
    .filter((entry): entry is SeoBriefOutlineItem => Boolean(entry))
}

function normalizeInternalLinks(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeInternalLinkEntry).filter(Boolean).slice(0, 10) : []
}

function resolveBriefInternalLinks(candidate: Record<string, unknown>) {
  return normalizeInternalLinks(candidate.internalLinks ?? candidate.internal_links)
}

function normalizeBrief(
  input: unknown,
  run: Pick<WriterRunDetail['run'], 'targetKeyword' | 'targetWordCount'>,
  fallbackMetaDescription = '',
): SeoBrief {
  const candidate = resolveSeoBriefCandidate(input)
  const intent = ensureObject(candidate.intent)
  const outline = normalizeCanonicalOutline(candidate.recommended_outline ?? candidate.outline)
  const titleIdeas = ensureStringArray(candidate.title_ideas)
  const metaDescriptions = ensureStringArray(candidate.meta_descriptions)
  const fallbackTitle = run.targetKeyword
    .split(/\s+/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    angle:
      pickString(candidate.angle) ||
      pickString(intent.outcome) ||
      `Practical guide to ${run.targetKeyword}`,
    audience: pickString(candidate.audience) || pickString(intent.reader) || 'Developers and technical teams',
    differentiators: ensureStringArray(candidate.differentiators),
    internalLinks: resolveBriefInternalLinks(candidate),
    keyPoints: ensureStringArray(candidate.keyPoints ?? candidate.gaps_to_fill),
    metaDescription: pickString(candidate.metaDescription) || metaDescriptions[0] || pickString(fallbackMetaDescription),
    outline:
      outline.length > 0
        ? outline
        : [
            {
              heading: 'Overview',
              objective: `Explain the core idea behind ${run.targetKeyword}.`,
            },
          ],
    recommendedWordCount:
      typeof candidate.recommendedWordCount === 'number' && Number.isFinite(candidate.recommendedWordCount)
        ? candidate.recommendedWordCount
        : typeof candidate.target_word_count === 'number' && Number.isFinite(candidate.target_word_count)
          ? candidate.target_word_count
        : run.targetWordCount || 1500,
    searchIntent: pickString(candidate.searchIntent) || pickString(intent.type) || 'Informational',
    title: pickString(candidate.title) || titleIdeas[0] || fallbackTitle,
  }
}

function normalizeValidationResult(input: unknown, currentBrief: SeoBrief): Required<ValidationResult> {
  const candidate = ensureObject(input)
  const reviewLog = ensureObject(candidate.ReviewLog)
  const changesMade = Array.isArray(reviewLog.changes_made)
    ? reviewLog.changes_made
        .map((entry) => {
          const item = ensureObject(entry)
          const field = pickString(item.field)
          const action = pickString(item.action)
          const reason = pickString(item.reason)
          return [field, action, reason].filter(Boolean).join(' | ')
        })
        .filter(Boolean)
    : []
  const warnings = Array.isArray(reviewLog.warnings)
    ? reviewLog.warnings
        .map((entry) => {
          const item = ensureObject(entry)
          const field = pickString(item.field)
          const note = pickString(item.note)
          const severity = pickString(item.severity)
          return [severity, field, note].filter(Boolean).join(' | ')
        })
        .filter(Boolean)
    : []

  return {
    FinalizedBrief: ensureObject(candidate.FinalizedBrief),
    ReviewLog: reviewLog,
    approved: candidate.approved !== false,
    finalBrief: normalizeBrief(candidate.FinalizedBrief ?? candidate.finalBrief ?? currentBrief, {
      targetKeyword: currentBrief.title,
      targetWordCount: currentBrief.recommendedWordCount,
    }, currentBrief.metaDescription),
    reviewLog: ensureStringArray(candidate.reviewLog).concat(changesMade, warnings),
    summary: pickString(reviewLog.summary) || pickString(candidate.summary) || 'Validation completed.',
  }
}

function coerceBriefForAgenticChecker(
  finalizedBriefJson: string,
  run: Pick<WriterRunDetail['run'], 'targetKeyword' | 'targetWordCount'>,
) {
  try {
    const parsed = JSON.parse(finalizedBriefJson) as unknown
    const candidate = ensureObject(parsed)
    const seoBrief = ensureObject(candidate.SeoBrief)

    if (pickString(seoBrief.target_keyword)) {
      return finalizedBriefJson
    }

    const outline = normalizeBriefOutline(candidate.outline).map((item) => ({
      heading: item.heading,
      level: 'H2',
      word_budget: 0,
    }))
    const targetWordCount =
      typeof candidate.recommendedWordCount === 'number' && Number.isFinite(candidate.recommendedWordCount)
        ? candidate.recommendedWordCount
        : run.targetWordCount || 1500
    const perSectionBudget =
      outline.length > 0 ? Math.max(100, Math.round(Math.max(targetWordCount - 850, 600) / outline.length)) : 0
    const recommendedOutline = outline.map((item) => ({
      ...item,
      word_budget: perSectionBudget,
    }))

    return stringifyJson({
      SeoBrief: {
        target_keyword: run.targetKeyword,
        secondary_keywords: [],
        differentiators: ensureStringArray(candidate.differentiators),
        gaps_to_fill: ensureStringArray(candidate.keyPoints),
        internal_links: resolveBriefInternalLinks(candidate),
        recommended_outline: recommendedOutline,
        target_word_count: targetWordCount,
        section_word_budget_total: recommendedOutline.reduce((sum, item) => sum + item.word_budget, 0),
        meta_descriptions: pickString(candidate.metaDescription) ? [pickString(candidate.metaDescription)] : [],
        faq_questions: [],
        needs_additional_research: false,
      },
    })
  } catch {
    return finalizedBriefJson
  }
}

function extractSourceHostnames(detail: WriterRunDetail) {
  return detail.sources
    .map((source) => {
      try {
        return new URL(source.url).hostname
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

function createAnthropicInputFile(filename: string, content: string, mimeType?: string): AnthropicInputFile {
  return {
    content,
    filename,
    mimeType,
  }
}

function getOriginalSourceMetaDescription(detail: WriterRunDetail) {
  return detail.sources.find((source) => source.role === 'original')?.metaDescription ?? ''
}

function buildSourceMetaDescriptionInputFiles(metaDescription: string) {
  const content = pickString(metaDescription)

  return content ? [createAnthropicInputFile('SourceMetaDescription.txt', content, 'text/plain')] : []
}

function seoBriefDocumentName(index: number) {
  return `RankingAlternative-${String(index + 1).padStart(2, '0')}.md`
}

function extractUrlFromInternalLinkEntry(entry: string) {
  return entry.match(/\((https?:\/\/[^)\s]+)\)\s*$/i)?.[1] ?? entry.match(/https?:\/\/\S+/i)?.[0] ?? ''
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()

      if (upper === 'API' || upper === 'SEO' || upper === 'JSON' || upper === 'HTML') {
        return upper
      }

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function inferAnchorTextFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const slug = parsedUrl.pathname.split('/').filter(Boolean).pop()

    if (slug) {
      return humanizeSlug(slug)
    }

    const hostname = normalizeHostname(parsedUrl.hostname).split('.').filter(Boolean)[0] ?? ''
    return humanizeSlug(hostname)
  } catch {
    return ''
  }
}

function extractAnchorTextFromInternalLinkEntry(entry: string) {
  const markdownLinkMatch = entry.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/i)

  if (markdownLinkMatch?.[1]) {
    return pickString(markdownLinkMatch[1])
  }

  return inferAnchorTextFromUrl(extractUrlFromInternalLinkEntry(entry))
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, '')
}

function extractMarkdownLinks(markdown: string) {
  const links: MarkdownLinkCandidate[] = []
  const pattern = /(^|[^!])\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gm

  for (const match of markdown.matchAll(pattern)) {
    const anchorText = pickString(match[2])
    const url = pickString(match[3])

    if (!anchorText || !url) {
      continue
    }

    try {
      links.push({
        anchorText,
        hostname: normalizeHostname(new URL(url).hostname),
        url,
      })
    } catch {
      continue
    }
  }

  const unique = new Map<string, MarkdownLinkCandidate>()
  for (const link of links) {
    if (!unique.has(link.url)) {
      unique.set(link.url, link)
    }
  }

  return [...unique.values()]
}

function buildSiteOwnedHostnameSet(internalLinks: string[]) {
  return new Set(
    internalLinks
      .map((entry) => extractUrlFromInternalLinkEntry(entry))
      .filter(Boolean)
      .map((url) => {
        try {
          return normalizeHostname(new URL(url).hostname)
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  )
}

function buildSiteOwnedHostnameSetFromContext(input: {
  internalLinks: string[]
  internalLinksDocument?: InternalLinksDocument | null
}) {
  const hostnames = buildSiteOwnedHostnameSet(input.internalLinks)
  const documentHostname = pickString(input.internalLinksDocument?.articleSiteHostname)

  if (documentHostname) {
    hostnames.add(normalizeHostname(documentHostname))
  }

  return hostnames
}

function dedupeMarkdownLinkCandidates(entries: MarkdownLinkCandidate[]) {
  const unique = new Map<string, MarkdownLinkCandidate>()

  for (const entry of entries) {
    if (!unique.has(entry.url)) {
      unique.set(entry.url, entry)
    }
  }

  return [...unique.values()]
}

function extractFallbackInternalLinkEntries(input: { articleMarkdown: string; siteOwnedHostnames: Set<string> }) {
  if (!input.articleMarkdown || input.siteOwnedHostnames.size === 0) {
    return []
  }

  return dedupeMarkdownLinkCandidates(
    extractMarkdownLinks(input.articleMarkdown).filter((link) => input.siteOwnedHostnames.has(link.hostname)),
  )
    .map((link) => `${link.anchorText} (${link.url})`)
    .slice(0, 8)
}

function renderSelectedInternalLinksList(entries: string[]) {
  return entries.map((entry, index) => `${index + 1}. ${entry}`).join('\n')
}

function renderAllowedExternalSourcesList(entries: MarkdownLinkCandidate[]) {
  return entries
    .map((entry, index) => `${index + 1}. ${entry.anchorText} (${entry.url})`)
    .join('\n')
}

function extractAdditionalSourceLinkCandidates(input: {
  briefArtifactContent: string
  disallowedHostnames: string[]
  siteOwnedHostnames: Set<string>
}) {
  if (!input.briefArtifactContent) {
    return []
  }

  const disallowed = new Set(input.disallowedHostnames.map((hostname) => normalizeHostname(hostname)).filter(Boolean))

  try {
    const candidate = ensureObject(JSON.parse(input.briefArtifactContent) as unknown)
    const additionalSources = Array.isArray(candidate.additional_sources) ? candidate.additional_sources : []

    return dedupeMarkdownLinkCandidates(
      additionalSources
        .map((entry) => {
          const item = ensureObject(entry)
          const url = pickString(item.url)

          if (!url) {
            return null
          }

          try {
            const parsedUrl = new URL(url)
            const hostname = normalizeHostname(parsedUrl.hostname)

            if (!hostname || input.siteOwnedHostnames.has(hostname) || disallowed.has(hostname)) {
              return null
            }

            return {
              anchorText: pickString(item.title) || hostname,
              hostname,
              url: parsedUrl.toString(),
            } satisfies MarkdownLinkCandidate
          } catch {
            return null
          }
        })
        .filter((entry): entry is MarkdownLinkCandidate => Boolean(entry)),
    )
  } catch {
    return []
  }
}

function buildAllowedExternalSources(input: {
  articleMarkdown: string
  briefArtifactContent: string
  disallowedHostnames: string[]
  siteOwnedHostnames: Set<string>
}) {
  return dedupeMarkdownLinkCandidates([
    ...extractPreservableExternalLinkSources({
      articleMarkdown: input.articleMarkdown,
      disallowedHostnames: input.disallowedHostnames,
      siteOwnedHostnames: input.siteOwnedHostnames,
    }),
    ...extractAdditionalSourceLinkCandidates({
      briefArtifactContent: input.briefArtifactContent,
      disallowedHostnames: input.disallowedHostnames,
      siteOwnedHostnames: input.siteOwnedHostnames,
    }),
  ])
}

function resolveSeoBriefCandidate(input: unknown) {
  const candidate = ensureObject(input)
  const finalizedBrief = ensureObject(candidate.FinalizedBrief)
  const seoBrief = ensureObject(finalizedBrief.SeoBrief)
  const topLevelSeoBrief = ensureObject(candidate.SeoBrief)

  if (Object.keys(seoBrief).length > 0) {
    return seoBrief
  }

  if (Object.keys(topLevelSeoBrief).length > 0) {
    return topLevelSeoBrief
  }

  return candidate
}

function normalizeCanonicalOutline(value: unknown): SeoBriefOutlineItem[] {
  const candidate = Array.isArray(value) ? value : []

  return candidate
    .map((entry) => {
      const item = ensureObject(entry)
      const heading = pickString(item.heading ?? item.title)
      const objective = pickString(item.notes ?? item.objective ?? item.summary ?? item.description)

      if (!heading) {
        return null
      }

      return {
        heading,
        objective: objective || `Cover ${heading}.`,
      }
    })
    .filter((entry): entry is SeoBriefOutlineItem => Boolean(entry))
}

function buildCompetitorIndex(detail: WriterRunDetail) {
  return detail.sources
    .filter((source) => source.role === 'competitor' && source.selected)
    .map((source) => ({
      rank: source.serpPosition ?? null,
      snippet: pickString(source.snippet),
      title: pickString(source.title) || source.url,
      url: source.url,
    }))
}

function buildBriefStageDocuments(detail: WriterRunDetail) {
  const sourceDocumentSource = detail.sources.find((source) => source.role === 'original')
  const sourceDocumentArtifact = sourceDocumentSource ? getLatestArtifact(detail.artifacts, 'markdown', sourceDocumentSource.id) : undefined

  if (!sourceDocumentSource || !sourceDocumentArtifact?.content) {
    throw new Error('Original source markdown is missing for brief generation.')
  }

  const alternatives = detail.sources
    .filter((source) => source.role === 'competitor' && source.selected)
    .map((source, index) => {
      const markdownArtifact = getLatestArtifact(detail.artifacts, 'markdown', source.id)

      if (!markdownArtifact?.content) {
        return null
      }

      return {
        filename: seoBriefDocumentName(index),
        markdown: markdownArtifact.content,
        snippet: pickString(source.snippet),
        title: pickString(source.title) || source.url,
        url: source.url,
      }
    })
    .filter(
      (
        value,
      ): value is {
        filename: string
        markdown: string
        snippet: string
        title: string
        url: string
      } => Boolean(value),
    )

  return {
    alternatives,
    sourceDocument: {
      markdown: sourceDocumentArtifact.content,
      sourceUrl: sourceDocumentSource.url,
    },
  }
}

function buildInternalLinkOverlayPrompt(input: {
  articleMarkdown: string
  selectedInternalLinks: string[]
  sourceArticleUrl: string
  targetKeyword: string
}): AnthropicPromptWithFiles {
  return {
    inputFiles: [createAnthropicInputFile('article.md', input.articleMarkdown, 'text/markdown')],
    prompt: renderClaudePromptTemplate(checkedInClaudePromptDefaults.write_internal_link_overlay_template, {
      linkCount: input.selectedInternalLinks.length,
      selectedInternalLinksList: renderSelectedInternalLinksList(input.selectedInternalLinks),
      sourceArticleUrl: input.sourceArticleUrl,
      targetKeyword: input.targetKeyword,
    }),
  }
}

function buildExternalLinkOverlayPrompt(input: {
  allowedExternalSources: MarkdownLinkCandidate[]
  articleMarkdown: string
  articleSiteHostname: string
  sourceArticleUrl: string
  targetKeyword: string
}): AnthropicPromptWithFiles {
  return {
    inputFiles: [createAnthropicInputFile('article.md', input.articleMarkdown, 'text/markdown')],
    prompt: renderClaudePromptTemplate(checkedInClaudePromptDefaults.write_external_link_overlay_template, {
      allowedSourcesList: renderAllowedExternalSourcesList(input.allowedExternalSources),
      articleSiteHostnameInstruction: input.articleSiteHostname
        ? `- Article site hostname to avoid citing as external: ${input.articleSiteHostname}`
        : '',
      sourceArticleUrl: input.sourceArticleUrl,
      sourceCount: input.allowedExternalSources.length,
      targetKeyword: input.targetKeyword,
    }),
  }
}

function normalizeInternalLinkOverlayOps(value: unknown, allowedEntries: string[]) {
  if (!Array.isArray(value)) {
    return []
  }

  const allowedUrls = new Set(allowedEntries.map((entry) => extractUrlFromInternalLinkEntry(entry)).filter(Boolean))

  return value
    .map((entry) => {
      const candidate = ensureObject(entry)
      const layer = pickString(candidate.layer)
      const exactText = typeof candidate.exactText === 'string' ? candidate.exactText : ''
      const url = pickString(candidate.url)
      const start = typeof candidate.start === 'number' && Number.isInteger(candidate.start) ? candidate.start : -1
      const end = typeof candidate.end === 'number' && Number.isInteger(candidate.end) ? candidate.end : -1

      if (layer !== 'internal_links' || !exactText || !url || !allowedUrls.has(url) || start < 0 || end <= start) {
        return null
      }

      return {
        end,
        exactText,
        id: pickString(candidate.id) || `${start}:${end}:${url}`,
        layer: 'internal_links',
        reason: pickString(candidate.reason),
        start,
        url,
        why: pickString(candidate.why),
      } satisfies InternalLinkOverlayOp
    })
    .filter((entry): entry is InternalLinkOverlayOp => Boolean(entry))
}

function normalizeExternalLinkOverlayOps(value: unknown, allowedSources: MarkdownLinkCandidate[]) {
  if (!Array.isArray(value)) {
    return []
  }

  const allowedUrls = new Set(allowedSources.map((entry) => entry.url))

  return value
    .map((entry) => {
      const candidate = ensureObject(entry)
      const layer = pickString(candidate.layer)
      const exactText = typeof candidate.exactText === 'string' ? candidate.exactText : ''
      const url = pickString(candidate.url)
      const start = typeof candidate.start === 'number' && Number.isInteger(candidate.start) ? candidate.start : -1
      const end = typeof candidate.end === 'number' && Number.isInteger(candidate.end) ? candidate.end : -1

      if (layer !== 'external_links' || !exactText || !url || !allowedUrls.has(url) || start < 0 || end <= start) {
        return null
      }

      return {
        end,
        exactText,
        id: pickString(candidate.id) || `${start}:${end}:${url}`,
        layer: 'external_links',
        reason: pickString(candidate.reason),
        start,
        url,
        why: pickString(candidate.why),
      } satisfies ExternalLinkOverlayOp
    })
    .filter((entry): entry is ExternalLinkOverlayOp => Boolean(entry))
}

function applyLinkOverlayOps<T extends LinkOverlayOpBase>(articleMarkdown: string, ops: T[]) {
  const accepted: T[] = []
  const occupiedRanges: Array<{ end: number; start: number }> = []

  for (const op of [...ops].sort((left, right) => left.start - right.start)) {
    if (articleMarkdown.slice(op.start, op.end) !== op.exactText) {
      continue
    }

    if (occupiedRanges.some((range) => op.start < range.end && range.start < op.end)) {
      continue
    }

    accepted.push(op)
    occupiedRanges.push({ end: op.end, start: op.start })
  }

  const linkedMarkdown = [...accepted]
    .sort((left, right) => right.start - left.start)
    .reduce((current, op) => `${current.slice(0, op.start)}[${op.exactText}](${op.url})${current.slice(op.end)}`, articleMarkdown)

  return {
    acceptedOps: accepted,
    linkedMarkdown,
  }
}

function applyInternalLinkOverlayOps(articleMarkdown: string, ops: InternalLinkOverlayOp[]) {
  return applyLinkOverlayOps(articleMarkdown, ops)
}

function applyExternalLinkOverlayOps(articleMarkdown: string, ops: ExternalLinkOverlayOp[]) {
  return applyLinkOverlayOps(articleMarkdown, ops)
}

function extractTaggedArticleMarkdown(responseText: string, stageKey: 'check' | 'write') {
  const fileMatch = responseText.match(/<FILE\s+path=["']article\.md["']>([\s\S]*?)<\/FILE>/i)
  if (fileMatch?.[1]?.trim()) {
    return fileMatch[1].trim()
  }

  const genericFileMatch = responseText.match(/<file\s+name=["']article\.md["']>([\s\S]*?)<\/file>/i)
  if (genericFileMatch?.[1]?.trim()) {
    return genericFileMatch[1].trim()
  }

  throw new Error(`AI Writer ${stageKey} did not return a valid article.md file payload.`)
}

function coerceArticleMarkdownOutput(responseText: string, stageKey: 'check' | 'write') {
  const trimmed = responseText.trim()

  if (!trimmed) {
    throw new Error(`AI Writer ${stageKey} returned an empty article.md file payload.`)
  }

  if (/<(?:FILE|file)\s+(?:path|name)=["']article\.md["']>/i.test(trimmed)) {
    return extractTaggedArticleMarkdown(trimmed, stageKey)
  }

  return trimmed
}

function extractRevisedArticleMarkdown(responseText: string) {
  return coerceArticleMarkdownOutput(responseText, 'check')
}

function countMatchingInternalLinks(articleMarkdown: string, allowedEntries: string[]) {
  const allowedUrls = new Set(allowedEntries.map((entry) => extractUrlFromInternalLinkEntry(entry)).filter(Boolean))

  if (allowedUrls.size === 0) {
    return 0
  }

  return extractMarkdownLinks(articleMarkdown).filter((link) => allowedUrls.has(link.url)).length
}

function extractPreservableExternalLinkSources(input: {
  articleMarkdown: string
  disallowedHostnames: string[]
  siteOwnedHostnames: Set<string>
}) {
  const disallowed = new Set(input.disallowedHostnames.map((hostname) => normalizeHostname(hostname)).filter(Boolean))

  return extractMarkdownLinks(input.articleMarkdown).filter(
    (link) => !input.siteOwnedHostnames.has(link.hostname) && !disallowed.has(link.hostname),
  )
}

function insertSupplementalSectionBeforeFaq(articleMarkdown: string, sectionMarkdown: string) {
  const trimmedArticle = articleMarkdown.trimEnd()
  const trimmedSection = sectionMarkdown.trim()
  const faqMatch = /^##\s+(?:faq|frequently asked questions)\b/im.exec(trimmedArticle)

  if (faqMatch?.index !== undefined) {
    return `${trimmedArticle.slice(0, faqMatch.index).trimEnd()}\n\n${trimmedSection}\n\n${trimmedArticle.slice(faqMatch.index).trimStart()}`
  }

  return `${trimmedArticle}\n\n${trimmedSection}\n`
}

function appendBestEffortLinkSection(input: {
  articleMarkdown: string
  heading: string
  links: Array<{ label: string; url: string }>
}) {
  const existingUrls = new Set(extractMarkdownLinks(input.articleMarkdown).map((link) => link.url))
  const uniqueLinks = input.links.filter(
    (link, index, allLinks) =>
      Boolean(link.label && link.url) &&
      !existingUrls.has(link.url) &&
      allLinks.findIndex((candidate) => candidate.url === link.url) === index,
  )

  if (uniqueLinks.length === 0) {
    return input.articleMarkdown
  }

  const sectionMarkdown = `## ${input.heading}\n\n${uniqueLinks
    .map((link) => `- [${link.label}](${link.url})`)
    .join('\n')}`

  return insertSupplementalSectionBeforeFaq(input.articleMarkdown, sectionMarkdown)
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function stripBrandSuffixes(value: string) {
  return value
    .replace(/\s+[-|:]\s*Gatekeepr\s*$/i, '')
    .trim()
}

function buildInternalLinkAnchorCandidates(entry: string) {
  const url = extractUrlFromInternalLinkEntry(entry)
  const label = stripBrandSuffixes(extractAnchorTextFromInternalLinkEntry(entry))
  const inferred = stripBrandSuffixes(inferAnchorTextFromUrl(url))
  const basePhrases = uniqueStrings([
    label,
    inferred,
    ...label.split(/\s+[-|:]\s+/).map(stripBrandSuffixes),
    ...inferred.split(/\s+[-|:]\s+/).map(stripBrandSuffixes),
  ])
  const ngramPhrases = basePhrases.flatMap((phrase) => {
    const words = phrase.split(/\s+/).filter(Boolean)
    const phrases: string[] = []

    for (let size = Math.min(6, words.length); size >= 2; size -= 1) {
      for (let index = 0; index <= words.length - size; index += 1) {
        phrases.push(words.slice(index, index + size).join(' '))
      }
    }

    return phrases
  })

  return uniqueStrings([...basePhrases, ...ngramPhrases])
    .filter((phrase) => {
      const words = phrase.split(/\s+/).filter(Boolean)
      return words.length >= 2 || phrase.length >= 8
    })
    .sort((left, right) => right.length - left.length)
}

function collectMarkdownUnsafeRanges(markdown: string) {
  const ranges: Array<{ end: number; start: number }> = []
  const addMatches = (pattern: RegExp) => {
    for (const match of markdown.matchAll(pattern)) {
      if (match.index == null) {
        continue
      }

      ranges.push({
        end: match.index + match[0].length,
        start: match.index,
      })
    }
  }

  addMatches(/```[\s\S]*?```/g)
  addMatches(/`[^`\n]+`/g)
  addMatches(/<!--[\s\S]*?-->/g)
  addMatches(/!?\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\)/g)
  addMatches(/https?:\/\/\S+/g)

  let lineStart = 0
  for (const line of markdown.split('\n')) {
    const lineEnd = lineStart + line.length

    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) {
      ranges.push({
        end: lineEnd,
        start: lineStart,
      })
    }

    lineStart = lineEnd + 1
  }

  return ranges
}

function rangeOverlaps(ranges: Array<{ end: number; start: number }>, start: number, end: number) {
  return ranges.some((range) => start < range.end && range.start < end)
}

function isAnchorBoundary(value: string | undefined) {
  return !value || !/[A-Za-z0-9]/.test(value)
}

function findSafeInlineAnchorMatch(input: {
  articleMarkdown: string
  candidates: string[]
  occupiedRanges: Array<{ end: number; start: number }>
  unsafeRanges: Array<{ end: number; start: number }>
}) {
  const lowerMarkdown = input.articleMarkdown.toLowerCase()

  for (const candidate of input.candidates) {
    const normalizedCandidate = candidate.toLowerCase()
    let index = lowerMarkdown.indexOf(normalizedCandidate)

    while (index >= 0) {
      const end = index + candidate.length
      const before = input.articleMarkdown[index - 1]
      const after = input.articleMarkdown[end]

      if (
        isAnchorBoundary(before) &&
        isAnchorBoundary(after) &&
        !rangeOverlaps(input.unsafeRanges, index, end) &&
        !rangeOverlaps(input.occupiedRanges, index, end)
      ) {
        return {
          end,
          exactText: input.articleMarkdown.slice(index, end),
          start: index,
        }
      }

      index = lowerMarkdown.indexOf(normalizedCandidate, index + 1)
    }
  }

  return null
}

function applyBestEffortInlineInternalLinks(input: {
  articleMarkdown: string
  limit: number
  selectedInternalLinks: string[]
}) {
  const existingUrls = new Set(extractMarkdownLinks(input.articleMarkdown).map((link) => link.url))
  const unsafeRanges = collectMarkdownUnsafeRanges(input.articleMarkdown)
  const occupiedRanges: Array<{ end: number; start: number }> = []
  const ops: InternalLinkOverlayOp[] = []
  const unusedLinks: Array<{ label: string; url: string }> = []
  const uniqueEntriesByUrl = new Map<string, string>()

  for (const entry of input.selectedInternalLinks) {
    const url = extractUrlFromInternalLinkEntry(entry)

    if (url && !uniqueEntriesByUrl.has(url)) {
      uniqueEntriesByUrl.set(url, entry)
    }
  }

  for (const [url, entry] of uniqueEntriesByUrl) {
    const rawLabel = extractAnchorTextFromInternalLinkEntry(entry)
    const label = stripBrandSuffixes(rawLabel) || rawLabel

    if (existingUrls.has(url)) {
      continue
    }

    if (ops.length >= input.limit) {
      unusedLinks.push({ label, url })
      continue
    }

    const match = findSafeInlineAnchorMatch({
      articleMarkdown: input.articleMarkdown,
      candidates: buildInternalLinkAnchorCandidates(entry),
      occupiedRanges,
      unsafeRanges,
    })

    if (!match) {
      unusedLinks.push({ label, url })
      continue
    }

    occupiedRanges.push(match)
    ops.push({
      end: match.end,
      exactText: match.exactText,
      id: `${match.start}:${match.end}:${url}`,
      layer: 'internal_links',
      reason: 'Matched selected internal-link anchor text in article body.',
      start: match.start,
      url,
      why: 'Adds a relevant internal link without another model call.',
    })
  }

  return {
    linkedMarkdown: applyInternalLinkOverlayOps(input.articleMarkdown, ops).linkedMarkdown,
    unusedLinks,
  }
}

function ensureBestEffortInternalLinks(input: {
  articleMarkdown: string
  minimumCount: number
  selectedInternalLinks: string[]
}) {
  const currentInternalLinkCount = countMatchingInternalLinks(input.articleMarkdown, input.selectedInternalLinks)

  if (input.minimumCount <= 0 || currentInternalLinkCount >= input.minimumCount) {
    return input.articleMarkdown
  }

  const inlineResult = applyBestEffortInlineInternalLinks({
    articleMarkdown: input.articleMarkdown,
    limit: input.minimumCount - currentInternalLinkCount,
    selectedInternalLinks: input.selectedInternalLinks,
  })
  const linkedInternalLinkCount = countMatchingInternalLinks(inlineResult.linkedMarkdown, input.selectedInternalLinks)

  if (linkedInternalLinkCount >= input.minimumCount) {
    return inlineResult.linkedMarkdown
  }

  const missingCount = input.minimumCount - linkedInternalLinkCount
  const linksToAdd = inlineResult.unusedLinks.slice(0, missingCount)

  return appendBestEffortLinkSection({
    articleMarkdown: inlineResult.linkedMarkdown,
    heading: 'Related Gatekeepr resources',
    links: linksToAdd,
  })
}

function getExpectedInternalLinkCount(selectedInternalLinks: string[]) {
  return Math.min(
    3,
    new Set(selectedInternalLinks.map((entry) => extractUrlFromInternalLinkEntry(entry)).filter(Boolean)).size,
  )
}

function ensureBestEffortExternalLinks(input: {
  allowedExternalSources: MarkdownLinkCandidate[]
  articleMarkdown: string
  minimumCount: number
  siteOwnedHostnames: Set<string>
  sourceHostnames: string[]
}) {
  const currentExternalLinkCount = extractPreservableExternalLinkSources({
    articleMarkdown: input.articleMarkdown,
    disallowedHostnames: input.sourceHostnames,
    siteOwnedHostnames: input.siteOwnedHostnames,
  }).length

  if (input.minimumCount <= 0 || currentExternalLinkCount >= input.minimumCount) {
    return input.articleMarkdown
  }

  const missingCount = input.minimumCount - currentExternalLinkCount

  return appendBestEffortLinkSection({
    articleMarkdown: input.articleMarkdown,
    heading: 'Authoritative references',
    links: input.allowedExternalSources
      .map((entry) => ({
        label: entry.anchorText || inferAnchorTextFromUrl(entry.url),
        url: entry.url,
      }))
      .filter((entry) => Boolean(entry.label && entry.url))
      .slice(0, missingCount),
  })
}

export const aiWriterManualStageTestInternals = {
  buildWriteFinalizedBriefDocumentContent,
  ensureBestEffortInternalLinks,
}

async function repairArticleLinks(input: {
  allowedExternalSources: MarkdownLinkCandidate[]
  articleMarkdown: string
  selectedInternalLinks: string[]
  runID: WriterRelationshipID
  siteOwnedHostnames: Set<string>
  sourceArticleUrl: string
  sourceHostnames: string[]
  targetKeyword: string
  }) {
  let repairedArticleMarkdown = input.articleMarkdown
  const expectedInternalLinkCount = getExpectedInternalLinkCount(input.selectedInternalLinks)

  try {
    const currentInternalLinkCount = countMatchingInternalLinks(repairedArticleMarkdown, input.selectedInternalLinks)

    if (expectedInternalLinkCount > 0 && currentInternalLinkCount < expectedInternalLinkCount) {
      const internalLinkOverlayPrompt = buildInternalLinkOverlayPrompt({
        articleMarkdown: repairedArticleMarkdown,
        selectedInternalLinks: input.selectedInternalLinks,
        sourceArticleUrl: input.sourceArticleUrl,
        targetKeyword: input.targetKeyword,
      })
      const internalOverlayOps = normalizeInternalLinkOverlayOps(
        await withManualLinkOverlayTimeout(
          callAnthropicJson<InternalLinkOverlayOp[]>(
            {
              filename: 'internal-link-ops.json',
              inputFiles: internalLinkOverlayPrompt.inputFiles,
              maxTokens: 8000,
              prompt: internalLinkOverlayPrompt.prompt,
              system:
                'You generate precise internal-link overlay ops for markdown articles. Read uploaded files from the workspace and write the final JSON to the requested output file.',
            },
            {
              eventType: 'article_internal_link_overlay',
              runID: input.runID,
              stageKey: 'check',
            },
          ),
        ),
        input.selectedInternalLinks,
      )

      repairedArticleMarkdown = applyInternalLinkOverlayOps(repairedArticleMarkdown, internalOverlayOps).linkedMarkdown
    }
  } catch {
    // Preserve the revised article if the repair overlay fails.
  }

  repairedArticleMarkdown = ensureBestEffortInternalLinks({
    articleMarkdown: repairedArticleMarkdown,
    minimumCount: expectedInternalLinkCount,
    selectedInternalLinks: input.selectedInternalLinks,
  })

  try {
    const currentExternalLinkCount = extractPreservableExternalLinkSources({
      articleMarkdown: repairedArticleMarkdown,
      disallowedHostnames: input.sourceHostnames,
      siteOwnedHostnames: input.siteOwnedHostnames,
    }).length

    if (input.allowedExternalSources.length > 0 && currentExternalLinkCount < 1) {
      const articleSiteHostname = [...input.siteOwnedHostnames][0] ?? ''
      const externalLinkOverlayPrompt = buildExternalLinkOverlayPrompt({
        allowedExternalSources: input.allowedExternalSources,
        articleMarkdown: repairedArticleMarkdown,
        articleSiteHostname,
        sourceArticleUrl: input.sourceArticleUrl,
        targetKeyword: input.targetKeyword,
      })
      const externalOverlayOps = normalizeExternalLinkOverlayOps(
        await withManualLinkOverlayTimeout(
          callAnthropicJson<ExternalLinkOverlayOp[]>(
            {
              filename: 'external-link-ops.json',
              inputFiles: externalLinkOverlayPrompt.inputFiles,
              maxTokens: 8000,
              prompt: externalLinkOverlayPrompt.prompt,
              system:
                'You generate precise external-link overlay ops for markdown articles. Read uploaded files from the workspace and write the final JSON to the requested output file.',
            },
            {
              eventType: 'article_external_link_overlay',
              runID: input.runID,
              stageKey: 'check',
            },
          ),
        ),
        input.allowedExternalSources,
      )

      repairedArticleMarkdown = applyExternalLinkOverlayOps(repairedArticleMarkdown, externalOverlayOps).linkedMarkdown
    }
  } catch {
    // Preserve the revised article if the repair overlay fails.
  }

  repairedArticleMarkdown = ensureBestEffortExternalLinks({
    allowedExternalSources: input.allowedExternalSources,
    articleMarkdown: repairedArticleMarkdown,
    minimumCount: input.allowedExternalSources.length > 0 ? 1 : 0,
    siteOwnedHostnames: input.siteOwnedHostnames,
    sourceHostnames: input.sourceHostnames,
  })

  return repairedArticleMarkdown
}

async function withPayload(payload?: PayloadClient) {
  return payload ?? getCmsPayload()
}

function buildBriefPrompt(
  detail: WriterRunDetail,
  sourceDocumentMarkdown: string,
  alternatives: Array<{ filename: string; snippet: string; title: string; url: string; markdown: string }>,
  internalLinksDocument: InternalLinksDocument | null,
): AnthropicPromptWithFiles {
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  const rankingAlternativeFileMap = alternatives.length
    ? alternatives
        .map(
          (file) =>
            `- ${file.filename}: ${file.title} | ${file.url} | ${file.snippet || 'No snippet provided.'}`,
        )
        .join('\n')
    : '- none provided; this is an original-source-only run.'
  const instructionText = renderClaudePromptTemplate(BRIEF_INSTRUCTION_TEMPLATE, {
    briefUserPrompt: checkedInClaudePromptDefaults.brief_user_template,
    rankingAlternativeFileMap,
    sourceUrl: detail.run.sourceUrl,
    targetKeyword: detail.run.targetKeyword,
    targetWordCount: detail.run.targetWordCount || countWords(sourceDocumentMarkdown),
  })

  return {
    inputFiles: [
      createAnthropicInputFile('SourceDoc.md', sourceDocumentMarkdown, 'text/markdown'),
      ...buildSourceMetaDescriptionInputFiles(sourceMetaDescription),
      ...alternatives.map((alternative) => createAnthropicInputFile(alternative.filename, alternative.markdown, 'text/markdown')),
      ...(internalLinksDocument
        ? [createAnthropicInputFile(internalLinksDocument.filename, internalLinksDocument.content, 'text/plain')]
        : []),
    ],
    prompt: instructionText,
  }
}

function buildValidatePrompt(
  detail: WriterRunDetail,
  draftBriefJson: string,
  factpackJson: string,
  competitorIndexJson: string,
  sourceDocumentMarkdown: string,
  internalLinksDocument: InternalLinksDocument | null,
): AnthropicPromptWithFiles {
  const instructionText = renderClaudePromptTemplate(VALIDATE_INSTRUCTION_TEMPLATE, {
    sourceUrl: detail.run.sourceUrl,
    targetKeyword: detail.run.targetKeyword,
    validateUserPrompt: checkedInClaudePromptDefaults.validate_user_template,
  })
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)

  return {
    inputFiles: [
      createAnthropicInputFile('SourceDoc.md', sourceDocumentMarkdown, 'text/markdown'),
      ...buildSourceMetaDescriptionInputFiles(sourceMetaDescription),
      createAnthropicInputFile('DraftSeoBrief.json', draftBriefJson, 'application/json'),
      createAnthropicInputFile('FactPack.json', factpackJson, 'application/json'),
      createAnthropicInputFile('CompetitorIndex.json', competitorIndexJson, 'application/json'),
      ...(internalLinksDocument
        ? [createAnthropicInputFile(internalLinksDocument.filename, internalLinksDocument.content, 'text/plain')]
        : []),
    ],
    prompt: instructionText,
  }
}

function buildWritePrompt(
  detail: WriterRunDetail,
  finalizedBriefJson: string,
  reviewLogJson: string,
  internalLinksDocument: InternalLinksDocument | null,
): AnthropicPromptWithFiles {
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  return {
    inputFiles: [
      createAnthropicInputFile('FinalizedBrief.json', finalizedBriefJson, 'application/json'),
      createAnthropicInputFile('ReviewLog.json', reviewLogJson, 'application/json'),
      ...buildSourceMetaDescriptionInputFiles(sourceMetaDescription),
      ...(internalLinksDocument
        ? [createAnthropicInputFile(internalLinksDocument.filename, internalLinksDocument.content, 'text/plain')]
        : []),
    ],
    prompt: checkedInClaudePromptDefaults.write_user_template,
  }
}

function parseSeoBriefOutput(rawOutput: string) {
  const candidateText = extractJsonFromResponseText(rawOutput)
  let parsed: unknown

  try {
    parsed = JSON.parse(candidateText) as unknown
  } catch {
    parsed = JSON.parse(stripTrailingCommasFromJsonLikeText(candidateText)) as unknown
  }

  const candidate = ensureObject(parsed)
  const seoBrief = ensureObject(candidate.SeoBrief)

  if (Object.keys(seoBrief).length === 0) {
    throw new Error('Brief response must contain a top-level SeoBrief object.')
  }

  return {
    SeoBrief: seoBrief,
    additional_sources: Array.isArray(candidate.additional_sources) ? candidate.additional_sources : [],
  }
}

function parseValidateOutput(rawOutput: string) {
  const candidateText = extractJsonFromResponseText(rawOutput)
  let parsed: unknown

  try {
    parsed = JSON.parse(candidateText) as unknown
  } catch {
    parsed = JSON.parse(stripTrailingCommasFromJsonLikeText(candidateText)) as unknown
  }

  const candidate = ensureObject(parsed)
  const finalizedBrief = ensureObject(candidate.FinalizedBrief)
  const reviewLog = ensureObject(candidate.ReviewLog)

  if (Object.keys(finalizedBrief).length === 0 || Object.keys(reviewLog).length === 0) {
    throw new Error('Validation response must contain top-level FinalizedBrief and ReviewLog objects.')
  }

  return {
    FinalizedBrief: finalizedBrief,
    ReviewLog: reviewLog,
  }
}

function buildValidateOutputSchemaRetryPrompt(reason: string) {
  return `The previous attempt created ValidationOutput.json, but the JSON schema was invalid for this workflow.

Failure reason:
${reason}

You are finalizing DraftSeoBrief.json, not grading SourceDoc.md as a standalone article.
Rewrite ValidationOutput.json so it contains exactly two top-level keys: FinalizedBrief and ReviewLog.
FinalizedBrief must contain one top-level key named SeoBrief.
ReviewLog must describe the brief edits, unresolved warnings, confidence, and word_budget_check for the finalized brief.
Do not emit a standalone scorecard with top-level keys like overall_score, title_validation, content_quality_metrics, outline_coverage, gap_analysis, competitor_comparison, recommendations, or source_files_used.
Use bash_code_execution to run Python that writes the corrected JSON to ./ValidationOutput.json and verifies the file exists with pathlib.
Do not use text_editor_code_execution for the corrected output file.
Do not paste the JSON in chat.
Reply with a short confirmation only after the corrected ValidationOutput.json exists as a downloadable file artifact.`
}

function buildWriteFinalizedBriefDocumentContent(
  finalizedBriefJson: string,
  factpackJson: string | null,
  fallbackMetaDescription = '',
) {
  try {
    const parsed = ensureObject(JSON.parse(finalizedBriefJson) as unknown)
    const seoBrief = ensureObject(parsed.SeoBrief)
    const currentMetaDescriptions = ensureStringArray(seoBrief.meta_descriptions)
    const sourceBackedMetaDescription = pickString(fallbackMetaDescription)

    if (currentMetaDescriptions.length === 0 && sourceBackedMetaDescription && Object.keys(seoBrief).length > 0) {
      seoBrief.meta_descriptions = [sourceBackedMetaDescription]
    }

    if (!factpackJson) {
      return stringifyJson(parsed)
    }

    const factPack = JSON.parse(factpackJson) as unknown

    const existingFactPack = ensureObject(parsed.FactPack)

    if (Object.keys(existingFactPack).length > 0 || Object.keys(seoBrief).length === 0) {
      return stringifyJson(parsed)
    }

    return stringifyJson({
      ...parsed,
      FactPack: factPack,
    })
  } catch {
    return finalizedBriefJson
  }
}

function extractArticleMetaDescription(markdown: string) {
  const match = markdown.match(/<!--\s*Meta:\s*([\s\S]*?)\s*-->/i)
  return pickString(match?.[1])
}

function normalizeArticleMetaComment(markdown: string, fallbackMetaDescription = '') {
  const normalizedMarkdown = markdown.trim()

  if (!normalizedMarkdown) {
    return normalizedMarkdown
  }

  const metaDescription = extractArticleMetaDescription(normalizedMarkdown) || pickString(fallbackMetaDescription)

  if (!metaDescription) {
    return normalizedMarkdown
  }

  const contentWithoutMeta = normalizedMarkdown.replace(/\s*<!--\s*Meta:\s*[\s\S]*?\s*-->\s*/i, '').trimStart()
  return `<!-- Meta: ${metaDescription} -->\n\n${contentWithoutMeta}`.trim()
}

async function markStageFailure(
  runID: WriterRelationshipID,
  stageKey: WriterStageKey,
  jobID: WriterRelationshipID,
  error: unknown,
  payload: PayloadClient,
) {
  const message = describeAIWriterError(error, 'AI Writer stage failed.')
  const completedAt = nowIso()
  const stages = await listWriterStageExecutions(runID, payload)
  const stage = stages.find((entry) => entry.stageKey === stageKey)
  const nextRetryCount = (stage?.retryCount ?? 0) + 1

  await Promise.all([
    updateWriterJob(
      jobID,
      {
        completedAt,
        errorText: message,
        responsePayload: {
          error: message,
        },
        status: 'failed',
      },
      payload,
    ),
    upsertWriterStageExecution(
      runID,
      stageKey,
      {
        completedAt,
        errorText: message,
        retryCount: nextRetryCount,
        status: 'failed',
      },
      payload,
    ),
    updateWriterRun(
      runID,
      {
        currentStage: stageKey,
        errorMessage: message,
        status: 'failed',
      },
      payload,
    ),
    createWriterTraceEvent(
      {
        completedAt,
        errorText: message,
        eventType: `${stageKey}_failed`,
        provider: 'local',
        runID,
        stageKey,
        startedAt: completedAt,
        status: 'failed',
      },
      payload,
    ),
  ])
}

async function startManualStage(
  detail: WriterRunDetail,
  stageKey: (typeof manualStageKeys)[number],
  jobKind: WriterJobKind,
  requestPayload: Record<string, unknown>,
  payload: PayloadClient,
  existingJob?: WriterJobRecord,
) {
  const startedAt = existingJob?.startedAt ?? nowIso()

  await Promise.all([
    upsertWriterStageExecution(
      detail.run.id,
      stageKey,
      {
        completedAt: null,
        errorText: null,
        startedAt,
        status: 'running',
      },
      payload,
    ),
    updateWriterRun(
      detail.run.id,
      {
        currentStage: stageKey,
        errorMessage: null,
        status: 'processing',
      },
      payload,
    ),
  ])

  if (existingJob) {
    return updateWriterJob(
      existingJob.id,
      {
        requestPayload,
        startedAt,
        status: 'running',
      },
      payload,
    )
  }

  const job = await createWriterJob(
    {
      kind: jobKind,
      requestPayload,
      runID: detail.run.id,
      stageKey,
      status: 'running',
    },
    payload,
  )

  return updateWriterJob(
    job.id,
    {
      startedAt,
      status: 'running',
    },
    payload,
  )
}

async function loadStageContext(runID: WriterRelationshipID, payload: PayloadClient) {
  const detail = await getWriterRunDetail(runID, payload)

  return {
    detail,
    factpackMarkdown: getLatestArtifact(detail.artifacts, 'factpack_md')?.content ?? '',
  }
}

function buildScopedSeoCheckerConfig(
  selectedCheckKey: string,
  checkerConfig: ReturnType<typeof resolveSeoCheckerConfig>,
) {
  const scopedConfig = structuredClone(checkerConfig)

  scopedConfig.result_order = [selectedCheckKey as (typeof scopedConfig.result_order)[number]]

  for (const checkKey of Object.keys(scopedConfig.checks) as Array<keyof typeof scopedConfig.checks>) {
    scopedConfig.checks[checkKey].enabled = checkKey === selectedCheckKey
  }

  return scopedConfig
}

async function runBriefStage(runID: WriterRelationshipID, payload: PayloadClient, existingJob?: WriterJobRecord) {
  const { detail } = await loadStageContext(runID, payload)
  const internalLinksResolution = await resolveInternalLinksDocument({
    payload,
    sourceUrl: detail.run.sourceUrl,
  })
  const { alternatives, sourceDocument } = buildBriefStageDocuments(detail)
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)

  const job = await startManualStage(
    detail,
    'brief',
    MANUAL_STAGE_JOB_KIND.brief,
    {
      sourceCount: alternatives.length + 1,
      targetKeyword: detail.run.targetKeyword,
      targetWordCount: detail.run.targetWordCount,
    },
    payload,
    existingJob,
  )

  try {
    const briefPrompt = buildBriefPrompt(detail, sourceDocument.markdown, alternatives, internalLinksResolution.document)
    const generated = await withManualGeneratedFileTimeout(
      'brief',
      'BRIEF.json',
      callAnthropicGeneratedFile(
        {
          filename: 'BRIEF.json',
          inputFiles: briefPrompt.inputFiles,
          maxTokens: 10000,
          prompt: briefPrompt.prompt,
          system: '',
        },
        {
          eventType: 'brief_generate',
          runID,
          stageKey: 'brief',
        },
      ),
    )
    const rawOutput = generated.file.content
    const briefDocument = parseSeoBriefOutput(rawOutput)
    const brief = normalizeBrief(briefDocument, detail.run, sourceMetaDescription)
    const completedAt = nowIso()
    const rawArtifact = await upsertWriterArtifact(
      {
        artifactRole: 'model_output_raw',
        artifactType: 'brief_raw_json',
        content: rawOutput,
        filename: 'brief-raw.json',
        mimeType: 'application/json',
        producedByJobID: job.id,
        runID,
        schemaName: 'ai_writer.brief',
        schemaVersion: 'v1',
      },
      payload,
    )
    await persistAIWriterRemoteFile({
      artifact: rawArtifact,
      generatedFile: generated.file,
      runID,
      stageKey: 'brief',
    })

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            outlineCount: brief.outline.length,
            title: brief.title,
          },
          status: 'succeeded',
        },
        payload,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'model_output_normalized',
          artifactType: 'brief_json',
          content: stringifyJson(briefDocument),
          filename: 'brief.json',
          mimeType: 'application/json',
          producedByJobID: job.id,
          runID,
          schemaName: 'ai_writer.brief',
          schemaVersion: 'v1',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'brief',
        {
          completedAt,
          outputPayload: {
            outlineCount: brief.outline.length,
            title: brief.title,
          },
          status: 'completed',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'validate',
        {
          errorText: null,
          status: 'awaiting_user',
        },
        payload,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: 'validate',
          status: 'awaiting_user',
        },
        payload,
      ),
    ])

    return getWriterRunDetail(runID, payload)
  } catch (error) {
    await markStageFailure(runID, 'brief', job.id, error, payload)
    throw error
  }
}

async function runValidateStage(runID: WriterRelationshipID, payload: PayloadClient, existingJob?: WriterJobRecord) {
  const { detail } = await loadStageContext(runID, payload)
  const internalLinksResolution = await resolveInternalLinksDocument({
    payload,
    sourceUrl: detail.run.sourceUrl,
  })
  const { sourceDocument } = buildBriefStageDocuments(detail)
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  const briefArtifact = getLatestArtifact(detail.artifacts, 'brief_json')
  const factpackArtifact = getLatestArtifact(detail.artifacts, 'factpack_json')

  if (!briefArtifact) {
    throw new Error('Brief artifact is missing. Generate the brief before running validation.')
  }

  if (!factpackArtifact) {
    throw new Error('FactPack artifact is missing. Complete preparation before running validation.')
  }

  const currentBrief = normalizeBrief(JSON.parse(briefArtifact.content), detail.run, sourceMetaDescription)
  const competitorIndexJson = stringifyJson(buildCompetitorIndex(detail))
  const job = await startManualStage(
    detail,
    'validate',
    MANUAL_STAGE_JOB_KIND.validate,
    {
      briefArtifactId: briefArtifact.id,
      targetKeyword: detail.run.targetKeyword,
    },
    payload,
    existingJob,
  )

  try {
    const validatePrompt = buildValidatePrompt(
      detail,
      briefArtifact.content,
      factpackArtifact.content,
      competitorIndexJson,
      sourceDocument.markdown,
      internalLinksResolution.document,
    )
    const generated = await withManualGeneratedFileTimeout(
      'validate',
      'ValidationOutput.json',
      callAnthropicGeneratedFile(
        {
          filename: 'ValidationOutput.json',
          inputFiles: validatePrompt.inputFiles,
          maxTokens: 16000,
          prompt: validatePrompt.prompt,
          system: '',
          validateFileContent: async (file) => {
            try {
              parseValidateOutput(file.content)
              return null
            } catch (error) {
              const reason =
                error instanceof Error
                  ? error.message
                  : 'Validation response must contain top-level FinalizedBrief and ReviewLog objects.'

              return {
                reason,
                retryPrompt: buildValidateOutputSchemaRetryPrompt(reason),
              }
            }
          },
        },
        {
          eventType: 'brief_validate',
          runID,
          stageKey: 'validate',
        },
      ),
    )
    const rawOutput = generated.file.content
    const rawValidationArtifact = await upsertWriterArtifact(
      {
        artifactRole: 'model_output_raw',
        artifactType: 'debug_output',
        content: rawOutput,
        filename: 'validation-output.json',
        mimeType: 'application/json',
        producedByJobID: job.id,
        runID,
        schemaName: 'ai_writer.brief_validation',
        schemaVersion: 'v1',
      },
      payload,
    )
    await persistAIWriterRemoteFile({
      artifact: rawValidationArtifact,
      generatedFile: generated.file,
      runID,
      stageKey: 'validate',
    })
    const validation = parseValidateOutput(rawOutput)
    const normalizedValidation = normalizeValidationResult(validation, currentBrief)
    const completedAt = nowIso()

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            approved: normalizedValidation.approved,
            issueCount: normalizedValidation.reviewLog.length,
          },
          status: 'succeeded',
        },
        payload,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'review',
          artifactType: 'review_log_json',
          content: stringifyJson(validation.ReviewLog),
          filename: 'brief-review-log.json',
          mimeType: 'application/json',
          producedByJobID: job.id,
          runID,
          schemaName: 'ai_writer.brief_review',
          schemaVersion: 'v1',
        },
        payload,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'model_output_normalized',
          artifactType: 'finalized_brief_json',
          content: stringifyJson(validation.FinalizedBrief),
          filename: 'finalized-brief.json',
          mimeType: 'application/json',
          producedByJobID: job.id,
          runID,
          schemaName: 'ai_writer.finalized_brief',
          schemaVersion: 'v1',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'validate',
        {
          completedAt,
          outputPayload: {
            approved: normalizedValidation.approved,
            summary: normalizedValidation.summary,
          },
          status: 'completed',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'write',
        {
          errorText: null,
          status: 'awaiting_user',
        },
        payload,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: 'write',
          status: 'awaiting_user',
        },
        payload,
      ),
    ])

    return getWriterRunDetail(runID, payload)
  } catch (error) {
    await markStageFailure(runID, 'validate', job.id, error, payload)
    throw error
  }
}

async function runWriteStage(runID: WriterRelationshipID, payload: PayloadClient, existingJob?: WriterJobRecord) {
  const { detail } = await loadStageContext(runID, payload)
  const internalLinksResolution = await resolveInternalLinksDocument({
    payload,
    sourceUrl: detail.run.sourceUrl,
  })
  const briefSourceArtifact = getLatestArtifact(detail.artifacts, 'brief_json')
  const finalBriefArtifact =
    getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? briefSourceArtifact
  const reviewLogArtifact = getLatestArtifact(detail.artifacts, 'review_log_json')
  const factpackArtifact = getLatestArtifact(detail.artifacts, 'factpack_json')
  const previousFinalArticleArtifact =
    getLatestArtifact(detail.artifacts, 'article_revision_md') ?? getLatestArtifact(detail.artifacts, 'article_draft_md')

  if (!finalBriefArtifact || !reviewLogArtifact) {
    throw new Error('Validated brief and review log are required before writing the article.')
  }

  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  const sourceHostnames = extractSourceHostnames(detail)
  const brief = normalizeBrief(JSON.parse(finalBriefArtifact.content), detail.run, sourceMetaDescription)
  const siteOwnedHostnames = buildSiteOwnedHostnameSetFromContext({
    internalLinks: brief.internalLinks,
    internalLinksDocument: internalLinksResolution.document,
  })
  const selectedInternalLinks =
    brief.internalLinks.length > 0
      ? brief.internalLinks
      : extractFallbackInternalLinkEntries({
          articleMarkdown: previousFinalArticleArtifact?.content ?? '',
          siteOwnedHostnames,
        })
  const allowedExternalSources = buildAllowedExternalSources({
    articleMarkdown: previousFinalArticleArtifact?.content ?? '',
    briefArtifactContent: briefSourceArtifact?.content ?? '',
    disallowedHostnames: sourceHostnames,
    siteOwnedHostnames,
  })
  const finalizedBriefDocumentContent = buildWriteFinalizedBriefDocumentContent(
    finalBriefArtifact.content,
    factpackArtifact?.content ?? null,
    brief.metaDescription,
  )
  const writePrompt = buildWritePrompt(
    detail,
    finalizedBriefDocumentContent,
    reviewLogArtifact.content,
    internalLinksResolution.document,
  )
  const job = await startManualStage(
    detail,
    'write',
    MANUAL_STAGE_JOB_KIND.write,
    {
      briefArtifactId: finalBriefArtifact.id,
      targetKeyword: detail.run.targetKeyword,
    },
    payload,
    existingJob,
  )

  try {
    const generated = await withManualGeneratedFileTimeout(
      'write',
      'article.md',
      callAnthropicGeneratedFile(
        {
          filename: 'article.md',
          inputFiles: writePrompt.inputFiles,
          maxTokens: 32000,
          prompt: writePrompt.prompt,
          system: checkedInClaudePromptDefaults.write_system,
        },
        {
          eventType: 'article_write',
          runID,
          stageKey: 'write',
        },
      ),
    )
    const articleMarkdown = coerceArticleMarkdownOutput(generated.file.content, 'write')

    if (!articleMarkdown) {
      throw new Error('Anthropic returned an empty article draft.')
    }

    const articleWithInternalLinks = ensureBestEffortInternalLinks({
      articleMarkdown,
      minimumCount: getExpectedInternalLinkCount(selectedInternalLinks),
      selectedInternalLinks,
    })
    const repairedArticleMarkdown = await repairArticleLinks({
      allowedExternalSources,
      articleMarkdown: articleWithInternalLinks,
      selectedInternalLinks,
      runID,
      siteOwnedHostnames,
      sourceArticleUrl: detail.run.sourceUrl,
      sourceHostnames,
      targetKeyword: detail.run.targetKeyword,
    })
    const normalizedArticleMarkdown = normalizeArticleMetaComment(repairedArticleMarkdown, brief.metaDescription)
    const internalLinkCount = countMatchingInternalLinks(normalizedArticleMarkdown, selectedInternalLinks)

    const completedAt = nowIso()
    const articleDraftArtifact = await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_draft_md',
        content: normalizedArticleMarkdown,
        filename: 'article-draft.md',
        mimeType: 'text/markdown',
        producedByJobID: job.id,
        runID,
        schemaName: 'ai_writer.article_draft',
        schemaVersion: 'v1',
      },
      payload,
    )
    await persistAIWriterRemoteFile({
      artifact: articleDraftArtifact,
      generatedFile: generated.file,
      runID,
      stageKey: 'write',
    })

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            characterCount: normalizedArticleMarkdown.length,
            internalLinkCount,
          },
          status: 'succeeded',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'write',
        {
          completedAt,
          outputPayload: {
            characterCount: normalizedArticleMarkdown.length,
            internalLinkCount,
          },
          status: 'completed',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'check',
        {
          errorText: null,
          status: 'awaiting_user',
        },
        payload,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: 'check',
          status: 'awaiting_user',
          writeUserPrompt: truncateWritePromptForStorage(writePrompt.prompt),
        },
        payload,
      ),
    ])

    return getWriterRunDetail(runID, payload)
  } catch (error) {
    await markStageFailure(runID, 'write', job.id, error, payload)
    throw error
  }
}

async function runCheckStage(runID: WriterRelationshipID, payload: PayloadClient, existingJob?: WriterJobRecord) {
  const detail = await getWriterRunDetail(runID, payload)
  const briefSourceArtifact = getLatestArtifact(detail.artifacts, 'brief_json')
  const briefArtifact =
    getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? briefSourceArtifact
  const articleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)

  if (!briefArtifact || !articleArtifact) {
    throw new Error('Validated brief and article content are required before running the editorial check.')
  }
  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  const brief = normalizeBrief(JSON.parse(briefArtifact.content), detail.run, sourceMetaDescription)

  const job = await startManualStage(
    detail,
    'check',
    MANUAL_STAGE_JOB_KIND.check,
    {
      articleArtifactId: articleArtifact.id,
      briefArtifactId: briefArtifact.id,
    },
    payload,
    existingJob,
  )

  try {
    const checkerConfig = resolveSeoCheckerConfig(null)
    const checkerBriefJson = coerceBriefForAgenticChecker(briefArtifact.content, detail.run)
    const sourceHostnames = extractSourceHostnames(detail)
    const verifiedAt = nowIso()
    await ensureWriterArticleRevisionRichTextArtifact({
      articleMarkdown: articleArtifact.content,
      payload,
      producedByJobID: job.id,
      runID,
    })
    const finalCheckerResult = runSeoChecklist(articleArtifact.content, checkerBriefJson, checkerConfig, {
      disallowedExternalHostnames: sourceHostnames,
      fallbackTitle: brief.title,
    })
    const result = buildWriterCheckReportFromSeoCheckerResult({
      articleArtifactId: articleArtifact.id,
      articleArtifactType: articleArtifact.artifactType,
      checkerConfig,
      checkerResult: finalCheckerResult,
      verifiedAt,
    })
    const finalFailingListMarkdown = buildWriterCheckReportFailingListMarkdown(result)
    const completedAt = verifiedAt

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            articleArtifactId: result.articleArtifactId,
            articleArtifactType: result.articleArtifactType,
            currentVerifiedRuleCount: result.coverage.currentVerifiedRuleCount,
            failCount: result.failCount,
            issueCount: result.issues.length,
            pass: result.pass,
            staleIssueCount: result.coverage.staleIssueCount,
            warnCount: result.warnCount,
          },
          status: 'succeeded',
        },
        payload,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'review',
          artifactType: 'failing_list_md',
          content: finalFailingListMarkdown,
          filename: 'failing-list.md',
          mimeType: 'text/markdown',
          producedByJobID: job.id,
          runID,
          schemaName: 'ai_writer.failing_list',
          schemaVersion: 'v1',
        },
        payload,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'review',
          artifactType: 'check_report_json',
          content: stringifyJson(result),
          filename: 'check-report.json',
          mimeType: 'application/json',
          producedByJobID: job.id,
          runID,
          schemaName: 'ai_writer.check_report',
          schemaVersion: 'v1',
        },
        payload,
      ),
      upsertWriterStageExecution(
        runID,
        'check',
        {
          completedAt,
          outputPayload: {
            articleArtifactId: result.articleArtifactId,
            currentVerifiedRuleCount: result.coverage.currentVerifiedRuleCount,
            issueCount: result.issues.length,
            pass: result.pass,
            staleIssueCount: result.coverage.staleIssueCount,
          },
          status: result.pass ? 'completed' : 'awaiting_user',
        },
        payload,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: 'check',
          status: result.pass ? 'completed' : 'awaiting_user',
        },
        payload,
      ),
    ])

    return getWriterRunDetail(runID, payload)
  } catch (error) {
    await markStageFailure(runID, 'check', job.id, error, payload)
    throw error
  }
}

export async function runWriterCheckIssue(
  runID: WriterRelationshipID,
  checkKey: string,
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const detail = await getWriterRunDetail(runID, cms)
  const briefSourceArtifact = getLatestArtifact(detail.artifacts, 'brief_json')
  const briefArtifact =
    getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? briefSourceArtifact
  const articleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)
  const existingCheckArtifact = getLatestArtifact(detail.artifacts, 'check_report_json')

  if (!briefArtifact || !articleArtifact) {
    throw new Error('Validated brief and article content are required before rerunning a selected editorial check.')
  }

  const sourceMetaDescription = getOriginalSourceMetaDescription(detail)
  const brief = normalizeBrief(JSON.parse(briefArtifact.content), detail.run, sourceMetaDescription)
  const checkerConfig = resolveSeoCheckerConfig(null)
  const enabledCheckKeys = new Set<string>(getEnabledWriterCheckKeys(checkerConfig))

  if (!enabledCheckKeys.has(checkKey)) {
    throw new Error(`Unsupported check key "${checkKey}".`)
  }

  const startedAt = nowIso()

  await Promise.all([
    upsertWriterStageExecution(
      runID,
      'check',
      {
        completedAt: null,
        errorText: null,
        inputPayload: {
          checkKey,
          mode: 'targeted',
        },
        startedAt,
        status: 'running',
      },
      cms,
    ),
    updateWriterRun(
      runID,
      {
        currentStage: 'check',
        errorMessage: null,
        status: 'processing',
      },
      cms,
    ),
  ])

  const job = await createWriterJob(
    {
      kind: 'check.revise',
      requestPayload: {
        articleArtifactId: articleArtifact.id,
        briefArtifactId: briefArtifact.id,
        checkKey,
      },
      runID,
      stageKey: 'check',
      status: 'running',
    },
    cms,
  )

  const runningJob = await updateWriterJob(
    job.id,
    {
      startedAt,
      status: 'running',
    },
    cms,
  )

  try {
    const scopedCheckerConfig = buildScopedSeoCheckerConfig(checkKey, checkerConfig)
    const checkerBriefJson = coerceBriefForAgenticChecker(briefArtifact.content, detail.run)
    const sourceHostnames = extractSourceHostnames(detail)
    const existingReport = existingCheckArtifact ? parseWriterCheckReport(existingCheckArtifact.content) : null
    const checkerResult = runSeoChecklist(articleArtifact.content, checkerBriefJson, scopedCheckerConfig, {
      disallowedExternalHostnames: sourceHostnames,
      fallbackTitle: brief.title,
    })
    const completedAt = nowIso()
    const result = mergeWriterCheckReportForSelectedCheck({
      articleArtifactId: articleArtifact.id,
      articleArtifactType: articleArtifact.artifactType,
      checkKey,
      checkerConfig,
      checkerResult,
      existingReport,
      verifiedAt: completedAt,
    })
    const failingListMarkdown = buildWriterCheckReportFailingListMarkdown(result)

    await Promise.all([
      updateWriterJob(
        runningJob.id,
        {
          completedAt,
          responsePayload: {
            articleArtifactId: result.articleArtifactId,
            articleArtifactType: result.articleArtifactType,
            checkKey,
            currentVerifiedRuleCount: result.coverage.currentVerifiedRuleCount,
            failCount: result.failCount,
            issueCount: result.issues.length,
            pass: result.pass,
            staleIssueCount: result.coverage.staleIssueCount,
            warnCount: result.warnCount,
          },
          status: 'succeeded',
        },
        cms,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'review',
          artifactType: 'failing_list_md',
          content: failingListMarkdown,
          filename: 'failing-list.md',
          mimeType: 'text/markdown',
          producedByJobID: runningJob.id,
          runID,
          schemaName: 'ai_writer.failing_list',
          schemaVersion: 'v1',
        },
        cms,
      ),
      upsertWriterArtifact(
        {
          artifactRole: 'review',
          artifactType: 'check_report_json',
          content: stringifyJson(result),
          filename: 'check-report.json',
          mimeType: 'application/json',
          producedByJobID: runningJob.id,
          runID,
          schemaName: 'ai_writer.check_report',
          schemaVersion: 'v1',
        },
        cms,
      ),
      upsertWriterStageExecution(
        runID,
        'check',
        {
          completedAt,
          inputPayload: {
            checkKey,
            mode: 'targeted',
          },
          outputPayload: {
            articleArtifactId: result.articleArtifactId,
            checkKey,
            currentVerifiedRuleCount: result.coverage.currentVerifiedRuleCount,
            issueCount: result.issues.length,
            pass: result.pass,
            staleIssueCount: result.coverage.staleIssueCount,
          },
          status: result.pass ? 'completed' : 'awaiting_user',
        },
        cms,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: 'check',
          status: result.pass ? 'completed' : 'awaiting_user',
        },
        cms,
      ),
      createWriterTraceEvent(
        {
          completedAt,
          eventType: 'article_check_issue_rerun',
          provider: 'local',
          requestPayload: {
            articleArtifactId: articleArtifact.id,
            checkKey,
          },
          responsePayload: {
            issueCount: result.issues.length,
            pass: result.pass,
            staleIssueCount: result.coverage.staleIssueCount,
          },
          runID,
          stageKey: 'check',
          startedAt,
          status: 'completed',
        },
        cms,
      ),
    ])

    return getWriterRunDetail(runID, cms)
  } catch (error) {
    await markStageFailure(runID, 'check', runningJob.id, error, cms)
    throw error
  }
}

function isManualStageKey(value: WriterStageKey): value is (typeof manualStageKeys)[number] {
  return manualStageKeys.includes(value as (typeof manualStageKeys)[number])
}

function startManualJobHeartbeat(jobID: WriterRelationshipID, leaseToken: string) {
  const timer = setInterval(() => {
    void heartbeatWriterJobClaim(jobID, leaseToken, MANUAL_STAGE_JOB_LEASE_MS)
  }, MANUAL_STAGE_JOB_HEARTBEAT_MS)

  timer.unref?.()

  return () => {
    clearInterval(timer)
  }
}

function hasActiveManualStageJob(jobs: WriterJobRecord[], stageKey: (typeof manualStageKeys)[number]) {
  return jobs.some(
    (job) =>
      job.stageKey === stageKey &&
      (job.status === 'queued' || job.status === 'running'),
  )
}

export async function enqueueWriterManualStage(
  runID: WriterRelationshipID,
  stageKey: (typeof manualStageKeys)[number],
  payload?: PayloadClient,
) {
  const cms = await withPayload(payload)
  const jobs = await listWriterJobs(runID, cms)

  if (!hasActiveManualStageJob(jobs, stageKey)) {
    await Promise.all([
      upsertWriterStageExecution(
        runID,
        stageKey,
        {
          completedAt: null,
          errorText: null,
          startedAt: null,
          status: 'queued',
        },
        cms,
      ),
      updateWriterRun(
        runID,
        {
          currentStage: stageKey,
          errorMessage: null,
          status: 'processing',
        },
        cms,
      ),
      createWriterJob(
        {
          kind: MANUAL_STAGE_JOB_KIND[stageKey],
          requestPayload: {
            queuedAt: nowIso(),
          },
          runID,
          stageKey,
          status: 'queued',
        },
        cms,
      ),
    ])
  }

  return getWriterRunDetail(runID, cms)
}

export async function processNextQueuedWriterManualStage(payload?: PayloadClient) {
  const cms = await withPayload(payload)
  const runs = await listWriterRuns(cms)

  for (const run of runs) {
    const claim = await claimNextQueuedWriterJob(
      {
        leaseMs: MANUAL_STAGE_JOB_LEASE_MS,
        runID: run.id,
        workerId: manualStageWorkerState.workerId,
      },
      cms,
    )

    if (!claim) {
      continue
    }

    if (!isManualStageKey(claim.job.stageKey)) {
      await releaseWriterJobClaim(claim.job.id, claim.leaseToken, cms)
      continue
    }

    const stopHeartbeat = startManualJobHeartbeat(claim.job.id, claim.leaseToken)

    try {
      return await runWriterManualStage(claim.job.runID, claim.job.stageKey, cms, {
        job: claim.job,
      })
    } finally {
      stopHeartbeat()
      await releaseWriterJobClaim(claim.job.id, claim.leaseToken, cms)
    }
  }

  return null
}

export async function runWriterManualStage(
  runID: WriterRelationshipID,
  stageKey: (typeof manualStageKeys)[number],
  payload?: PayloadClient,
  options: {
    job?: WriterJobRecord
  } = {},
) {
  const cms = await withPayload(payload)

  switch (stageKey) {
    case 'brief':
      return runBriefStage(runID, cms, options.job)
    case 'validate':
      return runValidateStage(runID, cms, options.job)
    case 'write':
      return runWriteStage(runID, cms, options.job)
    case 'check':
      return runCheckStage(runID, cms, options.job)
    default:
      throw new Error(`Unsupported AI Writer manual stage: ${stageKey}`)
  }
}
