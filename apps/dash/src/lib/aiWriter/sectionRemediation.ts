import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'

import { getLatestWriterFinalArticleArtifact, invalidateWriterCheckArtifactsForArticle, syncWriterArticleRevisionFromMarkdown } from './articleRevision'
import { callAIWriterJson } from './provider'
import { parseWriterCheckReport } from './checkReport'
import { runWriterCheckIssue } from './manualStages'
import {
  createWriterJob,
  createWriterTraceEvent,
  getWriterRunDetail,
  updateWriterJob,
  updateWriterRun,
  upsertWriterStageExecution,
} from './repository'
import type {
  WriterArtifactRecord,
  WriterCheckIssue,
  WriterRelationshipID,
  WriterRunDetail,
} from './types'

type PayloadClient = Payload

type MissingSectionBudgetItem = {
  notes: string
  targetWords: number
  title: string
}

type MissingDifferentiatorItem = {
  text: string
}

type MissingGapItem = {
  text: string
}

type BriefOutlineItem = {
  level: number
  notes: string
  title: string
  wordBudget: number
}

type GeneratedMissingSection = {
  heading?: unknown
  markdown?: unknown
  title?: unknown
}

type GeneratedMissingSectionsResponse = {
  sections?: GeneratedMissingSection[]
}

type GeneratedDifferentiatorPatch = {
  differentiator?: unknown
  insertionHeading?: unknown
  markdown?: unknown
}

type GeneratedDifferentiatorResponse = {
  patches?: GeneratedDifferentiatorPatch[]
}

type GeneratedGapPatch = {
  gap?: unknown
  insertionHeading?: unknown
  markdown?: unknown
}

type GeneratedGapResponse = {
  patches?: GeneratedGapPatch[]
}

async function withPayload(payload?: PayloadClient) {
  return payload ?? getCmsPayload()
}

function nowIso() {
  return new Date().toISOString()
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHeadingKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitIssueNotes(value: string) {
  return value
    .split(/;\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function extractMissingSectionBudgetItems(notes: string): MissingSectionBudgetItem[] {
  return splitIssueNotes(notes)
    .map((item) => {
      const match = item.match(/^(.+?):\s*missing section\s*\(budget:\s*(\d+)\)$/iu)

      if (!match) {
        return null
      }

      const targetWords = Number.parseInt(match[2] ?? '', 10)

      if (!Number.isFinite(targetWords) || targetWords <= 0) {
        return null
      }

      return {
        notes: item,
        targetWords,
        title: match[1]?.trim() ?? '',
      }
    })
    .filter((item): item is MissingSectionBudgetItem => Boolean(item?.title))
}

export function extractMissingDifferentiatorItems(notes: string): MissingDifferentiatorItem[] {
  const match = notes.match(/\bMissing:\s*([\s\S]+)$/iu)
  const missingText = match?.[1]
    ?.replace(/\s+All present\.?$/iu, '')
    .trim() ?? ''

  return splitIssueNotes(missingText)
    .map((text) => ({ text }))
    .filter((item) => item.text.length > 0)
}

export function extractMissingGapItems(notes: string): MissingGapItem[] {
  const match = notes.match(/\bMissing:\s*([\s\S]+)$/iu)
  const missingText = match?.[1]
    ?.replace(/\s+All addressed\.?$/iu, '')
    .trim() ?? ''

  return splitIssueNotes(missingText)
    .map((text) => ({ text }))
    .filter((item) => item.text.length > 0)
}

function readBriefOutlineItems(finalizedBriefJson: string): unknown[] {
  const parsed = JSON.parse(finalizedBriefJson) as Record<string, unknown>
  const brief = parsed.SeoBrief && typeof parsed.SeoBrief === 'object' ? parsed.SeoBrief as Record<string, unknown> : parsed
  const outline = brief.recommended_outline ?? brief.outline

  return Array.isArray(outline) ? outline : []
}

function normalizeOutlineLevel(value: unknown, depth: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.round(value))
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    const match = normalized.match(/^H?(\d+)$/u)

    if (match) {
      return Number.parseInt(match[1] ?? '', 10)
    }
  }

  return depth > 0 ? 3 : 2
}

export function extractBriefOutline(finalizedBriefJson: string): BriefOutlineItem[] {
  const outline = readBriefOutlineItems(finalizedBriefJson)
  const items: BriefOutlineItem[] = []

  const visit = (entries: unknown[], depth = 0) => {
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue
      }

      const record = entry as Record<string, unknown>
      const title = pickString(record.heading) || pickString(record.title)
      const wordBudget =
        typeof record.word_budget === 'number' && Number.isFinite(record.word_budget)
          ? Math.round(record.word_budget)
          : 0
      const level = normalizeOutlineLevel(record.level, depth)
      const notes = pickString(record.notes)

      if (title) {
        items.push({
          level,
          notes,
          title,
          wordBudget,
        })
      }

      if (Array.isArray(record.children)) {
        visit(record.children, depth + 1)
      }
    }
  }

  visit(outline)
  return items
}

function getLatestArtifact(
  artifacts: WriterArtifactRecord[],
  artifactType: WriterArtifactRecord['artifactType'],
) {
  return [...artifacts]
    .filter((artifact) => artifact.artifactType === artifactType)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
}

function getCurrentCheckIssue(detail: WriterRunDetail, checkKey: string) {
  const checkArtifact = getLatestArtifact(detail.artifacts, 'check_report_json')

  if (!checkArtifact) {
    throw new Error('Run the local check before generating a targeted fix.')
  }

  const report = parseWriterCheckReport(checkArtifact.content)
  if (!report) {
    throw new Error('The latest check report could not be parsed.')
  }

  const issue = report.issues.find((candidate) => candidate.checkKey === checkKey)

  if (!issue || issue.status === 'resolved') {
    throw new Error(`No open ${checkKey} issue is available for targeted remediation.`)
  }

  return issue
}

function getCurrentSectionBudgetIssue(detail: WriterRunDetail) {
  return getCurrentCheckIssue(detail, 'section_budgets')
}

function ensureSectionBudgetCheck(checkKey: string) {
  if (checkKey !== 'section_budgets') {
    throw new Error('Missing-section remediation is only supported for the section budget check.')
  }
}

function stripMatchingHeading(markdown: string, title: string) {
  const normalizedTitle = normalizeHeadingKey(title)
  const lines = markdown.trim().split(/\r?\n/u)
  const firstLine = lines[0]?.trim() ?? ''
  const match = firstLine.match(/^#{2,3}\s+(.+?)\s*#*$/u)

  if (match && normalizeHeadingKey(match[1] ?? '') === normalizedTitle) {
    return lines.slice(1).join('\n').trim()
  }

  return markdown.trim()
}

function stripLeadingMarkdownHeading(markdown: string) {
  const lines = markdown.trim().split(/\r?\n/u)
  const firstLine = lines[0]?.trim() ?? ''

  if (/^#{1,6}\s+.+?\s*#*$/u.test(firstLine)) {
    return lines.slice(1).join('\n').trim()
  }

  return markdown.trim()
}

function formatSectionBlock(title: string, markdown: string) {
  return `## ${title.trim()}\n\n${stripMatchingHeading(markdown, title)}`.trim()
}

type MarkdownSection = {
  body: string
  key: string
  title: string
}

function splitMarkdownIntoH2Sections(markdown: string) {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*#*\s*$/gmu)]

  if (!matches.length) {
    return {
      leading: markdown.trim(),
      sections: [] as MarkdownSection[],
    }
  }

  const leading = markdown.slice(0, matches[0]?.index ?? 0).trim()
  const sections = matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? markdown.length
    const title = match[1]?.trim() ?? 'Untitled'

    return {
      body: markdown.slice(start, end).trim(),
      key: normalizeHeadingKey(title),
      title,
    }
  })

  return {
    leading,
    sections,
  }
}

function findOutlineIndex(outline: BriefOutlineItem[], title: string) {
  const key = normalizeHeadingKey(title)
  return outline.findIndex((item) => normalizeHeadingKey(item.title) === key)
}

function findInsertionIndex(sections: MarkdownSection[], outline: BriefOutlineItem[], missingTitle: string) {
  const outlineIndex = findOutlineIndex(outline, missingTitle)

  if (outlineIndex < 0) {
    return sections.length
  }

  const sectionKeys = new Set(sections.map((section) => section.key))
  const previousOutlineItem = [...outline]
    .slice(0, outlineIndex)
    .reverse()
    .find((item) => sectionKeys.has(normalizeHeadingKey(item.title)))
  const nextOutlineItem = outline
    .slice(outlineIndex + 1)
    .find((item) => sectionKeys.has(normalizeHeadingKey(item.title)))

  if (previousOutlineItem) {
    const previousIndex = sections.findIndex((section) => section.key === normalizeHeadingKey(previousOutlineItem.title))
    return previousIndex >= 0 ? previousIndex + 1 : sections.length
  }

  if (nextOutlineItem) {
    const nextIndex = sections.findIndex((section) => section.key === normalizeHeadingKey(nextOutlineItem.title))
    return nextIndex >= 0 ? nextIndex : sections.length
  }

  return sections.length
}

function appendMarkdownBlock(current: string, addition: string) {
  const normalizedAddition = stripLeadingMarkdownHeading(addition)

  if (!normalizedAddition) {
    return current.trim()
  }

  if (current.includes(normalizedAddition)) {
    return current.trim()
  }

  return [current.trim(), normalizedAddition]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function findPatchSectionIndex(sections: MarkdownSection[], insertionHeading: string) {
  const requestedKey = normalizeHeadingKey(insertionHeading)

  if (requestedKey) {
    const exactIndex = sections.findIndex((section) => section.key === requestedKey)

    if (exactIndex >= 0) {
      return exactIndex
    }
  }

  const conclusionIndex = sections.findIndex((section) =>
    /^(conclusion|final thoughts|key takeaways|frequently asked questions|faqs?)$/u.test(section.key),
  )

  if (conclusionIndex > 0) {
    return conclusionIndex - 1
  }

  return sections.length - 1
}

export function insertDifferentiatorPatchesIntoArticleMarkdown(input: {
  articleMarkdown: string
  patches: Array<{
    insertionHeading: string
    markdown: string
  }>
}) {
  const { leading, sections } = splitMarkdownIntoH2Sections(input.articleMarkdown)
  let mutableLeading = leading
  const mutableSections = [...sections]

  for (const patch of input.patches) {
    const markdown = stripLeadingMarkdownHeading(patch.markdown)

    if (!markdown || input.articleMarkdown.includes(markdown)) {
      continue
    }

    const requestedKey = normalizeHeadingKey(patch.insertionHeading)

    if (!mutableSections.length || requestedKey === 'introduction' || requestedKey === 'intro') {
      mutableLeading = appendMarkdownBlock(mutableLeading, markdown)
      continue
    }

    const sectionIndex = findPatchSectionIndex(mutableSections, patch.insertionHeading)

    if (sectionIndex < 0) {
      mutableLeading = appendMarkdownBlock(mutableLeading, markdown)
      continue
    }

    const section = mutableSections[sectionIndex]

    mutableSections[sectionIndex] = {
      ...section,
      body: appendMarkdownBlock(section.body, markdown),
    }
  }

  return [mutableLeading, ...mutableSections.map((section) => section.body)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function insertGapPatchesIntoArticleMarkdown(input: {
  articleMarkdown: string
  patches: Array<{
    insertionHeading: string
    markdown: string
  }>
}) {
  return insertDifferentiatorPatchesIntoArticleMarkdown(input)
}

export function insertMissingSectionsIntoArticleMarkdown(input: {
  articleMarkdown: string
  generatedSections: Array<{
    markdown: string
    title: string
  }>
  outline: BriefOutlineItem[]
}) {
  const { leading, sections } = splitMarkdownIntoH2Sections(input.articleMarkdown)
  const mutableSections = [...sections]
  const orderedGeneratedSections = [...input.generatedSections].sort((left, right) => {
    const leftIndex = findOutlineIndex(input.outline, left.title)
    const rightIndex = findOutlineIndex(input.outline, right.title)

    if (leftIndex < 0 && rightIndex < 0) {
      return 0
    }

    if (leftIndex < 0) {
      return 1
    }

    if (rightIndex < 0) {
      return -1
    }

    return leftIndex - rightIndex
  })

  for (const section of orderedGeneratedSections) {
    const key = normalizeHeadingKey(section.title)

    if (mutableSections.some((candidate) => candidate.key === key)) {
      continue
    }

    const insertionIndex = findInsertionIndex(mutableSections, input.outline, section.title)

    mutableSections.splice(insertionIndex, 0, {
      body: formatSectionBlock(section.title, section.markdown),
      key,
      title: section.title,
    })
  }

  return [leading, ...mutableSections.map((section) => section.body)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function normalizeGeneratedSections(
  generated: GeneratedMissingSectionsResponse,
  missingSections: MissingSectionBudgetItem[],
) {
  const generatedSections = Array.isArray(generated.sections) ? generated.sections : []

  return missingSections.map((missingSection) => {
    const key = normalizeHeadingKey(missingSection.title)
    const generatedSection = generatedSections.find((section) => {
      const title = pickString(section.heading) || pickString(section.title)
      return normalizeHeadingKey(title) === key
    })
    const markdown = pickString(generatedSection?.markdown)

    if (!markdown) {
      throw new Error(`The selected AI provider did not return content for missing section "${missingSection.title}".`)
    }

    return {
      markdown,
      title: missingSection.title,
    }
  })
}

function normalizeGeneratedDifferentiatorPatches(
  generated: GeneratedDifferentiatorResponse,
  missingDifferentiators: MissingDifferentiatorItem[],
) {
  const generatedPatches = Array.isArray(generated.patches) ? generated.patches : []

  return missingDifferentiators.map((missingDifferentiator, index) => {
    const key = normalizeHeadingKey(missingDifferentiator.text)
    const generatedPatch =
      generatedPatches.find((patch) => normalizeHeadingKey(pickString(patch.differentiator)) === key) ??
      generatedPatches[index]
    const markdown = pickString(generatedPatch?.markdown)

    if (!markdown) {
      throw new Error(`The selected AI provider did not return content for missing differentiator "${missingDifferentiator.text}".`)
    }

    return {
      differentiator: missingDifferentiator.text,
      insertionHeading: pickString(generatedPatch?.insertionHeading) || 'Introduction',
      markdown,
    }
  })
}

function normalizeGeneratedGapPatches(
  generated: GeneratedGapResponse,
  missingGaps: MissingGapItem[],
) {
  const generatedPatches = Array.isArray(generated.patches) ? generated.patches : []

  return missingGaps.map((missingGap, index) => {
    const key = normalizeHeadingKey(missingGap.text)
    const generatedPatch =
      generatedPatches.find((patch) => normalizeHeadingKey(pickString(patch.gap)) === key) ??
      generatedPatches[index]
    const markdown = pickString(generatedPatch?.markdown)

    if (!markdown) {
      throw new Error(`The selected AI provider did not return content for missing gap "${missingGap.text}".`)
    }

    return {
      gap: missingGap.text,
      insertionHeading: pickString(generatedPatch?.insertionHeading) || 'Introduction',
      markdown,
    }
  })
}

function buildMissingSectionsPrompt(input: {
  articleArtifact: WriterArtifactRecord
  briefArtifact: WriterArtifactRecord
  missingSections: MissingSectionBudgetItem[]
  outline: BriefOutlineItem[]
  runDetail: WriterRunDetail
}) {
  const missingSectionSummary = input.missingSections
    .map((section) => {
      const outlineItem = input.outline.find((item) => normalizeHeadingKey(item.title) === normalizeHeadingKey(section.title))
      const notes = outlineItem?.notes || section.notes

      return `- ${section.title}: ${section.targetWords} words. Notes: ${notes || 'No extra notes.'}`
    })
    .join('\n')
  const outlineSummary = input.outline
    .map((item) => `${'  '.repeat(Math.max(0, item.level - 2))}- H${item.level} ${item.title}${item.wordBudget ? ` (${item.wordBudget} words)` : ''}${item.notes ? `: ${item.notes}` : ''}`)
    .join('\n')

  return {
    inputFiles: [
      {
        content: input.articleArtifact.content,
        filename: 'CurrentArticle.md',
        mimeType: 'text/markdown',
      },
      {
        content: input.briefArtifact.content,
        filename: 'FinalizedBrief.json',
        mimeType: 'application/json',
      },
    ],
    prompt: [
      `Target keyword: ${input.runDetail.run.targetKeyword}`,
      '',
      'Write only the missing sections listed below for the current article. Do not rewrite, summarize, or return the complete article.',
      'The application will insert these sections deterministically using the finalized brief outline order.',
      '',
      'Missing sections:',
      missingSectionSummary,
      '',
      'Finalized brief outline order:',
      outlineSummary,
      '',
      'Requirements:',
      '- Return valid JSON only, written to missing-sections.json.',
      '- JSON shape: {"sections":[{"heading":"Exact heading","markdown":"Section body markdown without the heading"}]}',
      '- Include exactly one object for each missing section and use the exact heading text.',
      '- Keep each section within roughly +/-15% of its target word budget.',
      '- Do not include H1 headings, H2 headings, metadata comments, citations you cannot verify, or unrelated sections.',
      '- Match the tone and specificity of CurrentArticle.md.',
    ].join('\n'),
    system:
      'You perform surgical SEO article remediation. You write only requested missing section bodies and preserve the rest of the article unchanged.',
  }
}

function buildGapPatchPrompt(input: {
  articleArtifact: WriterArtifactRecord
  briefArtifact: WriterArtifactRecord
  issue: WriterCheckIssue
  missingGaps: MissingGapItem[]
  runDetail: WriterRunDetail
}) {
  const { leading, sections } = splitMarkdownIntoH2Sections(input.articleArtifact.content)
  const sectionSummary = [
    leading ? '- Introduction' : '',
    ...sections.map((section) => `- ${section.title}`),
  ]
    .filter(Boolean)
    .join('\n')
  const missingSummary = input.missingGaps
    .map((item) => `- ${item.text}`)
    .join('\n')

  return {
    inputFiles: [
      {
        content: input.articleArtifact.content,
        filename: 'CurrentArticle.md',
        mimeType: 'text/markdown',
      },
      {
        content: input.briefArtifact.content,
        filename: 'FinalizedBrief.json',
        mimeType: 'application/json',
      },
      {
        content: JSON.stringify(input.issue, null, 2),
        filename: 'CheckIssue.json',
        mimeType: 'application/json',
      },
    ],
    prompt: [
      `Target keyword: ${input.runDetail.run.targetKeyword}`,
      '',
      'Generate a surgical patch for the current article that adds only the missing gap coverage below.',
      'Do not rewrite the article. Do not return the complete article. The application will insert your patch into the existing article.',
      '',
      'Missing gaps:',
      missingSummary,
      '',
      'Existing H2 sections available for insertion:',
      sectionSummary || '- Introduction',
      '',
      'Requirements:',
      '- Return valid JSON only, written to gap-patch.json.',
      '- JSON shape: {"patches":[{"gap":"Exact missing gap","insertionHeading":"Existing H2 heading or Introduction","markdown":"One concise paragraph of markdown"}]}',
      '- Include exactly one patch object for each missing gap and copy the gap text exactly.',
      '- The markdown must be a paragraph or short bullet block only, with no H1/H2/H3 heading.',
      '- Keep each patch roughly 90-160 words unless a shorter natural insertion fully covers the gap.',
      '- Make the added coverage concrete enough to satisfy the gap, using product and brief context when present.',
      '- Integrate the idea naturally with the article voice and surrounding topic.',
      '- Do not add unverifiable claims, fabricated statistics, competitor brand callouts, or unrelated product promotion.',
    ].join('\n'),
    system:
      'You perform surgical SEO article remediation. You write only the smallest article patch required to satisfy a failing gap-coverage checker while preserving the rest of the article unchanged.',
  }
}

function buildDifferentiatorPatchPrompt(input: {
  articleArtifact: WriterArtifactRecord
  briefArtifact: WriterArtifactRecord
  issue: WriterCheckIssue
  missingDifferentiators: MissingDifferentiatorItem[]
  runDetail: WriterRunDetail
}) {
  const { leading, sections } = splitMarkdownIntoH2Sections(input.articleArtifact.content)
  const sectionSummary = [
    leading ? '- Introduction' : '',
    ...sections.map((section) => `- ${section.title}`),
  ]
    .filter(Boolean)
    .join('\n')
  const missingSummary = input.missingDifferentiators
    .map((item) => `- ${item.text}`)
    .join('\n')

  return {
    inputFiles: [
      {
        content: input.articleArtifact.content,
        filename: 'CurrentArticle.md',
        mimeType: 'text/markdown',
      },
      {
        content: input.briefArtifact.content,
        filename: 'FinalizedBrief.json',
        mimeType: 'application/json',
      },
      {
        content: JSON.stringify(input.issue, null, 2),
        filename: 'CheckIssue.json',
        mimeType: 'application/json',
      },
    ],
    prompt: [
      `Target keyword: ${input.runDetail.run.targetKeyword}`,
      '',
      'Generate a surgical patch for the current article that adds only the missing differentiator coverage below.',
      'Do not rewrite the article. Do not return the complete article. The application will insert your patch into the existing article.',
      '',
      'Missing differentiators:',
      missingSummary,
      '',
      'Existing H2 sections available for insertion:',
      sectionSummary || '- Introduction',
      '',
      'Requirements:',
      '- Return valid JSON only, written to differentiator-patch.json.',
      '- JSON shape: {"patches":[{"differentiator":"Exact missing differentiator","insertionHeading":"Existing H2 heading or Introduction","markdown":"One concise paragraph of markdown"}]}',
      '- Include exactly one patch object for each missing differentiator and copy the differentiator text exactly.',
      '- The markdown must be a paragraph or short bullet block only, with no H1/H2/H3 heading.',
      '- Keep each patch roughly 80-140 words unless a shorter natural insertion fully covers the differentiator.',
      '- Integrate the idea naturally with the article voice and surrounding topic.',
      '- Do not add unverifiable claims, fabricated statistics, or unrelated product promotion.',
    ].join('\n'),
    system:
      'You perform surgical SEO article remediation. You write only the smallest article patch required to satisfy a failing checker while preserving the rest of the article unchanged.',
  }
}

async function markRemediationFailure(input: {
  error: unknown
  eventType?: string
  fallbackMessage?: string
  jobID: WriterRelationshipID
  payload: PayloadClient
  runID: WriterRelationshipID
  startedAt: string
}) {
  const completedAt = nowIso()
  const message = input.error instanceof Error ? input.error.message : input.fallbackMessage ?? 'Failed to generate targeted article fix.'

  await Promise.all([
    updateWriterJob(
      input.jobID,
      {
        completedAt,
        errorText: message,
        status: 'failed',
      },
      input.payload,
    ),
    upsertWriterStageExecution(
      input.runID,
      'check',
      {
        completedAt,
        errorText: message,
        status: 'failed',
      },
      input.payload,
    ),
    updateWriterRun(
      input.runID,
      {
        currentStage: 'check',
        errorMessage: message,
        status: 'failed',
      },
      input.payload,
    ),
    createWriterTraceEvent(
      {
        completedAt,
        errorText: message,
        eventType: input.eventType ?? 'article_check_remediation',
        provider: 'local',
        runID: input.runID,
        stageKey: 'check',
        startedAt: input.startedAt,
        status: 'failed',
      },
      input.payload,
    ),
  ])
}

export async function runWriterMissingSectionRemediation(
  runID: WriterRelationshipID,
  checkKey: string,
  payload?: PayloadClient,
) {
  ensureSectionBudgetCheck(checkKey)

  const cms = await withPayload(payload)
  const detail = await getWriterRunDetail(runID, cms)
  const briefArtifact = getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? getLatestArtifact(detail.artifacts, 'brief_json')
  const articleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)
  const issue = getCurrentSectionBudgetIssue(detail)
  const missingSections = extractMissingSectionBudgetItems(issue.notes)

  if (!briefArtifact || !articleArtifact) {
    throw new Error('Validated brief and article content are required before generating missing sections.')
  }

  if (!missingSections.length) {
    throw new Error('The section budget issue does not list any missing sections to generate.')
  }

  const outline = extractBriefOutline(briefArtifact.content)
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
          missingSections: missingSections.map((section) => ({
            targetWords: section.targetWords,
            title: section.title,
          })),
          mode: 'missing_sections',
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
        missingSections: missingSections.map((section) => ({
          targetWords: section.targetWords,
          title: section.title,
        })),
        mode: 'missing_sections',
      },
      runID,
      stageKey: 'check',
      status: 'running',
    },
    cms,
  )

  try {
    const prompt = buildMissingSectionsPrompt({
      articleArtifact,
      briefArtifact,
      missingSections,
      outline,
      runDetail: detail,
    })
    const generated = await callAIWriterJson<GeneratedMissingSectionsResponse>(
      {
        filename: 'missing-sections.json',
        inputFiles: prompt.inputFiles,
        maxTokens: 12_000,
        prompt: prompt.prompt,
        system: prompt.system,
      },
      {
        eventType: 'article_missing_sections_generate',
        runID,
        stageKey: 'check',
      },
    )
    const normalizedSections = normalizeGeneratedSections(generated, missingSections)
    const revisedArticleMarkdown = insertMissingSectionsIntoArticleMarkdown({
      articleMarkdown: articleArtifact.content,
      generatedSections: normalizedSections,
      outline,
    })
    const { revisionArtifact, richTextArtifact } = await syncWriterArticleRevisionFromMarkdown({
      articleMarkdown: revisedArticleMarkdown,
      payload: cms,
      producedByJobID: job.id,
      runID,
    })

    await invalidateWriterCheckArtifactsForArticle({
      articleArtifact: revisionArtifact,
      payload: cms,
      runDetail: detail,
    })

    const completedAt = nowIso()

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            generatedSectionCount: normalizedSections.length,
            missingSections: normalizedSections.map((section) => section.title),
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          status: 'succeeded',
        },
        cms,
      ),
      createWriterTraceEvent(
        {
          completedAt,
          eventType: 'article_missing_sections_inserted',
          provider: 'local',
          requestPayload: {
            articleArtifactId: articleArtifact.id,
            missingSections: missingSections.map((section) => section.title),
          },
          responsePayload: {
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          runID,
          stageKey: 'check',
          startedAt,
          status: 'completed',
        },
        cms,
      ),
    ])

    return runWriterCheckIssue(runID, checkKey, cms)
  } catch (error) {
    await markRemediationFailure({
      error,
      eventType: 'article_missing_sections_remediation',
      fallbackMessage: 'Failed to generate missing sections.',
      jobID: job.id,
      payload: cms,
      runID,
      startedAt,
    })
    throw error
  }
}

export async function runWriterGapRemediation(
  runID: WriterRelationshipID,
  checkKey: string,
  payload?: PayloadClient,
) {
  if (checkKey !== 'gaps_addressed') {
    throw new Error('Gap remediation is only supported for the gaps addressed check.')
  }

  const cms = await withPayload(payload)
  const detail = await getWriterRunDetail(runID, cms)
  const briefArtifact = getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? getLatestArtifact(detail.artifacts, 'brief_json')
  const articleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)
  const issue = getCurrentCheckIssue(detail, checkKey)
  const missingGaps = extractMissingGapItems(issue.notes)

  if (!briefArtifact || !articleArtifact) {
    throw new Error('Validated brief and article content are required before generating a gap patch.')
  }

  if (!missingGaps.length) {
    throw new Error('The gaps addressed issue does not list any missing gaps to generate.')
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
          missingGaps: missingGaps.map((item) => item.text),
          mode: 'gap_patch',
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
        missingGaps: missingGaps.map((item) => item.text),
        mode: 'gap_patch',
      },
      runID,
      stageKey: 'check',
      status: 'running',
    },
    cms,
  )

  try {
    const prompt = buildGapPatchPrompt({
      articleArtifact,
      briefArtifact,
      issue,
      missingGaps,
      runDetail: detail,
    })
    const generated = await callAIWriterJson<GeneratedGapResponse>(
      {
        filename: 'gap-patch.json',
        inputFiles: prompt.inputFiles,
        maxTokens: 4_000,
        prompt: prompt.prompt,
        system: prompt.system,
      },
      {
        eventType: 'article_gap_patch_generate',
        runID,
        stageKey: 'check',
      },
    )
    const normalizedPatches = normalizeGeneratedGapPatches(generated, missingGaps)
    const revisedArticleMarkdown = insertGapPatchesIntoArticleMarkdown({
      articleMarkdown: articleArtifact.content,
      patches: normalizedPatches,
    })
    const { revisionArtifact, richTextArtifact } = await syncWriterArticleRevisionFromMarkdown({
      articleMarkdown: revisedArticleMarkdown,
      payload: cms,
      producedByJobID: job.id,
      runID,
    })

    await invalidateWriterCheckArtifactsForArticle({
      articleArtifact: revisionArtifact,
      payload: cms,
      runDetail: detail,
    })

    const completedAt = nowIso()

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            generatedPatchCount: normalizedPatches.length,
            missingGaps: normalizedPatches.map((patch) => patch.gap),
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          status: 'succeeded',
        },
        cms,
      ),
      createWriterTraceEvent(
        {
          completedAt,
          eventType: 'article_gap_patch_inserted',
          provider: 'local',
          requestPayload: {
            articleArtifactId: articleArtifact.id,
            missingGaps: normalizedPatches.map((patch) => patch.gap),
          },
          responsePayload: {
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          runID,
          stageKey: 'check',
          startedAt,
          status: 'completed',
        },
        cms,
      ),
    ])

    return runWriterCheckIssue(runID, checkKey, cms)
  } catch (error) {
    await markRemediationFailure({
      error,
      eventType: 'article_gap_patch_remediation',
      fallbackMessage: 'Failed to generate gap patch.',
      jobID: job.id,
      payload: cms,
      runID,
      startedAt,
    })
    throw error
  }
}

export async function runWriterDifferentiatorRemediation(
  runID: WriterRelationshipID,
  checkKey: string,
  payload?: PayloadClient,
) {
  if (checkKey !== 'differentiators_included') {
    throw new Error('Differentiator remediation is only supported for the differentiators included check.')
  }

  const cms = await withPayload(payload)
  const detail = await getWriterRunDetail(runID, cms)
  const briefArtifact = getLatestArtifact(detail.artifacts, 'finalized_brief_json') ?? getLatestArtifact(detail.artifacts, 'brief_json')
  const articleArtifact = getLatestWriterFinalArticleArtifact(detail.artifacts)
  const issue = getCurrentCheckIssue(detail, checkKey)
  const missingDifferentiators = extractMissingDifferentiatorItems(issue.notes)

  if (!briefArtifact || !articleArtifact) {
    throw new Error('Validated brief and article content are required before generating a differentiator patch.')
  }

  if (!missingDifferentiators.length) {
    throw new Error('The differentiators issue does not list any missing differentiators to generate.')
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
          missingDifferentiators: missingDifferentiators.map((item) => item.text),
          mode: 'differentiator_patch',
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
        missingDifferentiators: missingDifferentiators.map((item) => item.text),
        mode: 'differentiator_patch',
      },
      runID,
      stageKey: 'check',
      status: 'running',
    },
    cms,
  )

  try {
    const prompt = buildDifferentiatorPatchPrompt({
      articleArtifact,
      briefArtifact,
      issue,
      missingDifferentiators,
      runDetail: detail,
    })
    const generated = await callAIWriterJson<GeneratedDifferentiatorResponse>(
      {
        filename: 'differentiator-patch.json',
        inputFiles: prompt.inputFiles,
        maxTokens: 4_000,
        prompt: prompt.prompt,
        system: prompt.system,
      },
      {
        eventType: 'article_differentiator_patch_generate',
        runID,
        stageKey: 'check',
      },
    )
    const normalizedPatches = normalizeGeneratedDifferentiatorPatches(generated, missingDifferentiators)
    const revisedArticleMarkdown = insertDifferentiatorPatchesIntoArticleMarkdown({
      articleMarkdown: articleArtifact.content,
      patches: normalizedPatches,
    })
    const { revisionArtifact, richTextArtifact } = await syncWriterArticleRevisionFromMarkdown({
      articleMarkdown: revisedArticleMarkdown,
      payload: cms,
      producedByJobID: job.id,
      runID,
    })

    await invalidateWriterCheckArtifactsForArticle({
      articleArtifact: revisionArtifact,
      payload: cms,
      runDetail: detail,
    })

    const completedAt = nowIso()

    await Promise.all([
      updateWriterJob(
        job.id,
        {
          completedAt,
          responsePayload: {
            generatedPatchCount: normalizedPatches.length,
            missingDifferentiators: normalizedPatches.map((patch) => patch.differentiator),
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          status: 'succeeded',
        },
        cms,
      ),
      createWriterTraceEvent(
        {
          completedAt,
          eventType: 'article_differentiator_patch_inserted',
          provider: 'local',
          requestPayload: {
            articleArtifactId: articleArtifact.id,
            missingDifferentiators: normalizedPatches.map((patch) => patch.differentiator),
          },
          responsePayload: {
            revisionArtifactId: revisionArtifact.id,
            richTextArtifactId: richTextArtifact.id,
          },
          runID,
          stageKey: 'check',
          startedAt,
          status: 'completed',
        },
        cms,
      ),
    ])

    return runWriterCheckIssue(runID, checkKey, cms)
  } catch (error) {
    await markRemediationFailure({
      error,
      eventType: 'article_differentiator_patch_remediation',
      fallbackMessage: 'Failed to generate differentiator patch.',
      jobID: job.id,
      payload: cms,
      runID,
      startedAt,
    })
    throw error
  }
}

export async function runWriterCheckIssueRemediation(
  runID: WriterRelationshipID,
  checkKey: string,
  payload?: PayloadClient,
) {
  if (checkKey === 'section_budgets') {
    return runWriterMissingSectionRemediation(runID, checkKey, payload)
  }

  if (checkKey === 'gaps_addressed') {
    return runWriterGapRemediation(runID, checkKey, payload)
  }

  if (checkKey === 'differentiators_included') {
    return runWriterDifferentiatorRemediation(runID, checkKey, payload)
  }

  throw new Error('Targeted remediation is not supported for this check yet.')
}
