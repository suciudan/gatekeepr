import type { SeoCheckerResult } from '@/lib/aiWriter/agentic/checkers/seo-checker'
import {
  formatSectionBudgetCheckLabel,
  isSectionBudgetCheckLabel,
  seoCheckerCheckLabels,
  type SeoCheckerCheckId,
  type SeoCheckerRuntimeConfig,
} from '@/lib/aiWriter/agentic/seo-checker-settings'

import type {
  WriterArtifactType,
  WriterCheckCoverage,
  WriterCheckIssue,
  WriterCheckLink,
  WriterCheckReport,
  WriterCheckResultStatus,
  WriterCheckVerificationMode,
  WriterRelationshipID,
} from './types'

const DEFAULT_STALE_NOTE = 'This rule has not been verified against the current saved article revision.'

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isWriterCheckResultStatus(value: unknown): value is WriterCheckResultStatus {
  return value === 'fail' || value === 'pass' || value === 'warn'
}

function isWriterCheckVerificationMode(value: unknown): value is WriterCheckVerificationMode {
  return value === 'full' || value === 'targeted'
}

function isWriterArtifactType(value: unknown): value is WriterArtifactType {
  return typeof value === 'string' && value.length > 0
}

function toSeverity(status: null | WriterCheckResultStatus) {
  if (status === 'fail') {
    return 'error' as const
  }

  if (status === 'warn') {
    return 'warning' as const
  }

  return null
}

function humanizeCheckKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function normalizeCheckLinks(value: unknown): WriterCheckLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  const uniqueLinks = new Map<string, WriterCheckLink>()

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const candidate = item as Record<string, unknown>
    const url = pickString(candidate.url)

    if (!url) {
      continue
    }

    uniqueLinks.set(url, {
      anchorText: pickString(candidate.anchorText),
      hostname: pickString(candidate.hostname),
      url,
    })
  }

  return [...uniqueLinks.values()]
}

export function resolveWriterCheckKey(label: string) {
  if (isSectionBudgetCheckLabel(label)) {
    return 'section_budgets'
  }

  const entry = Object.entries(seoCheckerCheckLabels).find(([, checkLabel]) => checkLabel === label)
  return entry?.[0] ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function getWriterCheckLabel(
  checkKey: string,
  checkerConfig: SeoCheckerRuntimeConfig,
) {
  if (checkKey === 'section_budgets') {
    return formatSectionBudgetCheckLabel(checkerConfig.checks.section_budgets.tolerance_percent)
  }

  return seoCheckerCheckLabels[checkKey as SeoCheckerCheckId] ?? humanizeCheckKey(checkKey)
}

function resolveIssueLabel(
  checkKey: string,
  checkerConfig?: SeoCheckerRuntimeConfig,
) {
  return checkerConfig ? getWriterCheckLabel(checkKey, checkerConfig) : humanizeCheckKey(checkKey)
}

export function getEnabledWriterCheckKeys(checkerConfig: SeoCheckerRuntimeConfig) {
  return checkerConfig.result_order.filter((checkKey) => checkerConfig.checks[checkKey].enabled)
}

function buildCoverage(
  issues: WriterCheckIssue[],
  currentArticleArtifactId: WriterRelationshipID,
  enabledRuleCount: number,
): WriterCheckCoverage {
  const openIssueCount = issues.filter(
    (issue) => issue.status === 'open' && issue.articleArtifactId === currentArticleArtifactId,
  ).length
  const resolvedIssueCount = issues.filter(
    (issue) => issue.status === 'resolved' && issue.articleArtifactId === currentArticleArtifactId,
  ).length
  const staleIssueCount = issues.filter((issue) => issue.status === 'stale').length
  const currentVerifiedRuleCount = issues.filter(
    (issue) => issue.articleArtifactId === currentArticleArtifactId && issue.status !== 'stale',
  ).length

  return {
    complete:
      currentVerifiedRuleCount === enabledRuleCount &&
      staleIssueCount === 0 &&
      openIssueCount === 0,
    currentVerifiedRuleCount,
    enabledRuleCount,
    openIssueCount,
    resolvedIssueCount,
    staleIssueCount,
  }
}

function buildSummary(coverage: WriterCheckCoverage, pass: boolean) {
  if (pass) {
    return `All ${coverage.enabledRuleCount} enabled rules are verified for the current article revision and passing.`
  }

  const summaryParts = [`${coverage.currentVerifiedRuleCount}/${coverage.enabledRuleCount} rules verified for the current article revision`]

  if (coverage.openIssueCount > 0) {
    summaryParts.push(`${coverage.openIssueCount} open`)
  }

  if (coverage.resolvedIssueCount > 0) {
    summaryParts.push(`${coverage.resolvedIssueCount} resolved`)
  }

  if (coverage.staleIssueCount > 0) {
    summaryParts.push(`${coverage.staleIssueCount} stale`)
  }

  return `${summaryParts.join(' · ')}.`
}

function createDefaultIssue(
  checkKey: string,
  checkerConfig: SeoCheckerRuntimeConfig,
): WriterCheckIssue {
  return {
    articleArtifactId: null,
    articleArtifactType: null,
    checkKey,
    id: `check:${checkKey}`,
    label: getWriterCheckLabel(checkKey, checkerConfig),
    notes: DEFAULT_STALE_NOTE,
    resultStatus: null,
    severity: null,
    status: 'stale',
    verificationMode: null,
    verifiedAt: null,
  }
}

function normalizeIssue(
  candidate: Partial<WriterCheckIssue>,
  checkerConfig?: SeoCheckerRuntimeConfig,
): WriterCheckIssue {
  const checkKey = pickString(candidate.checkKey) || resolveWriterCheckKey(pickString(candidate.label) || 'issue')
  const resultStatus = isWriterCheckResultStatus(candidate.resultStatus) ? candidate.resultStatus : null
  const articleArtifactId =
    typeof candidate.articleArtifactId === 'number' && Number.isFinite(candidate.articleArtifactId)
      ? candidate.articleArtifactId
      : null
  const articleArtifactType = isWriterArtifactType(candidate.articleArtifactType)
    ? candidate.articleArtifactType
    : null
  const verificationMode = isWriterCheckVerificationMode(candidate.verificationMode)
    ? candidate.verificationMode
    : null
  const explicitStatus = candidate.status
  const status =
    explicitStatus === 'open' || explicitStatus === 'resolved' || explicitStatus === 'stale'
      ? explicitStatus
      : resultStatus === 'pass'
        ? 'resolved'
        : resultStatus
          ? 'open'
          : 'stale'

  return {
    articleArtifactId,
    articleArtifactType,
    checkKey,
    id: pickString(candidate.id) || `check:${checkKey}`,
    label: pickString(candidate.label) || resolveIssueLabel(checkKey, checkerConfig),
    notes: pickString(candidate.notes) || DEFAULT_STALE_NOTE,
    resultStatus,
    severity:
      candidate.severity === 'error' || candidate.severity === 'warning'
        ? candidate.severity
        : toSeverity(resultStatus),
    status,
    verificationMode,
    verifiedAt: pickString(candidate.verifiedAt) || null,
  }
}

function sortIssues(
  issues: WriterCheckIssue[],
  checkerConfig: SeoCheckerRuntimeConfig,
) {
  const order = new Map<string, number>(getEnabledWriterCheckKeys(checkerConfig).map((checkKey, index) => [checkKey, index]))
  const statusOrder = new Map([
    ['open', 0],
    ['stale', 1],
    ['resolved', 2],
  ] as const)

  return [...issues].sort((left, right) => {
    const statusDelta = (statusOrder.get(left.status) ?? 99) - (statusOrder.get(right.status) ?? 99)

    if (statusDelta !== 0) {
      return statusDelta
    }

    return (order.get(left.checkKey) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.checkKey) ?? Number.MAX_SAFE_INTEGER)
  })
}

function buildChecksForCurrentArticle(
  issues: WriterCheckIssue[],
  currentArticleArtifactId: WriterRelationshipID,
  checkerConfig: SeoCheckerRuntimeConfig,
) {
  const checks = issues
    .filter(
      (issue) =>
        issue.articleArtifactId === currentArticleArtifactId &&
        issue.status !== 'stale' &&
        issue.resultStatus != null,
    )
    .map((issue) => ({
      check: issue.label,
      notes: issue.notes,
      status: issue.resultStatus as WriterCheckResultStatus,
    }))

  const order = new Map<string, number>(getEnabledWriterCheckKeys(checkerConfig).map((checkKey, index) => [checkKey, index]))

  return checks.sort((left, right) => {
    return (
      (order.get(resolveWriterCheckKey(left.check)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(resolveWriterCheckKey(right.check)) ?? Number.MAX_SAFE_INTEGER)
    )
  })
}

function finalizeWriterCheckReport(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  authorityLinks?: WriterCheckLink[]
  checkerConfig: SeoCheckerRuntimeConfig
  internalLinks?: WriterCheckLink[]
  issues: WriterCheckIssue[]
  lastRunCheckKey: null | string
  lastRunMode: WriterCheckVerificationMode
}): WriterCheckReport {
  const sortedIssues = sortIssues(input.issues, input.checkerConfig)
  const coverage = buildCoverage(sortedIssues, input.articleArtifactId, getEnabledWriterCheckKeys(input.checkerConfig).length)
  const checks = buildChecksForCurrentArticle(sortedIssues, input.articleArtifactId, input.checkerConfig)
  const failCount = sortedIssues.filter(
    (issue) =>
      issue.articleArtifactId === input.articleArtifactId &&
      issue.status === 'open' &&
      issue.resultStatus === 'fail',
  ).length
  const warnCount = sortedIssues.filter(
    (issue) =>
      issue.articleArtifactId === input.articleArtifactId &&
      issue.status === 'open' &&
      issue.resultStatus === 'warn',
  ).length
  const pass = coverage.complete && failCount === 0 && warnCount === 0

  return {
    articleArtifactId: input.articleArtifactId,
    articleArtifactType: input.articleArtifactType,
    authorityLinks: input.authorityLinks ?? [],
    checks,
    coverage,
    failCount,
    issues: sortedIssues,
    lastRunCheckKey: input.lastRunCheckKey,
    lastRunMode: input.lastRunMode,
    internalLinks: input.internalLinks ?? [],
    pass,
    summary: buildSummary(coverage, pass),
    warnCount,
  }
}

function buildIssueFromCheck(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  check: { check: string; notes: string; status: WriterCheckResultStatus }
  checkerConfig: SeoCheckerRuntimeConfig
  verificationMode: WriterCheckVerificationMode
  verifiedAt: string
}) {
  const checkKey = resolveWriterCheckKey(input.check.check)

  return {
    articleArtifactId: input.articleArtifactId,
    articleArtifactType: input.articleArtifactType,
    checkKey,
    id: `check:${checkKey}`,
    label: input.check.check,
    notes: pickString(input.check.notes),
    resultStatus: input.check.status,
    severity: toSeverity(input.check.status),
    status: input.check.status === 'pass' ? 'resolved' : 'open',
    verificationMode: input.verificationMode,
    verifiedAt: input.verifiedAt,
  } satisfies WriterCheckIssue
}

function reconcileIssuesForCurrentArticle(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  checkerConfig: SeoCheckerRuntimeConfig
  existingReport: null | WriterCheckReport
}) {
  const enabledCheckKeys = getEnabledWriterCheckKeys(input.checkerConfig)
  const issueByKey = new Map(
    (input.existingReport?.issues ?? []).map((issue) => [issue.checkKey, normalizeIssue(issue, input.checkerConfig)]),
  )

  return enabledCheckKeys.map((checkKey) => {
    const existingIssue = issueByKey.get(checkKey)

    if (!existingIssue) {
      return createDefaultIssue(checkKey, input.checkerConfig)
    }

    if (existingIssue.articleArtifactId !== input.articleArtifactId || existingIssue.status === 'stale') {
      return {
        ...existingIssue,
        articleArtifactId: existingIssue.articleArtifactId,
        articleArtifactType: existingIssue.articleArtifactType,
        label: getWriterCheckLabel(checkKey, input.checkerConfig),
        status: 'stale' as const,
      }
    }

    return {
      ...existingIssue,
      articleArtifactType: input.articleArtifactType,
      label: getWriterCheckLabel(checkKey, input.checkerConfig),
    }
  })
}

export function parseWriterCheckReport(content: string): null | WriterCheckReport {
  try {
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const candidate = parsed as Record<string, unknown>
    const articleArtifactId =
      typeof candidate.articleArtifactId === 'number' && Number.isFinite(candidate.articleArtifactId)
        ? candidate.articleArtifactId
        : null
    const articleArtifactType = isWriterArtifactType(candidate.articleArtifactType)
      ? candidate.articleArtifactType
      : null

    if (articleArtifactId == null || articleArtifactType == null) {
      return null
    }

    const normalizedIssues = Array.isArray(candidate.issues)
      ? candidate.issues
          .map((issue, index) => {
            if (issue && typeof issue === 'object' && !Array.isArray(issue)) {
              return normalizeIssue(issue as Partial<WriterCheckIssue>)
            }

            if (typeof issue === 'string') {
              return normalizeIssue({
                checkKey: `legacy_${index + 1}`,
                id: `legacy_${index + 1}`,
                label: `Issue ${index + 1}`,
                notes: issue,
                resultStatus: 'fail',
                severity: 'error',
                status: 'open',
              })
            }

            return null
          })
          .filter((issue): issue is WriterCheckIssue => Boolean(issue))
      : []

    const normalizedChecks = Array.isArray(candidate.checks)
      ? candidate.checks
          .map((check) => {
            if (!check || typeof check !== 'object' || Array.isArray(check)) {
              return null
            }

            const checkCandidate = check as Record<string, unknown>
            const status = isWriterCheckResultStatus(checkCandidate.status) ? checkCandidate.status : null

            if (!status) {
              return null
            }

            return {
              check: pickString(checkCandidate.check) || 'Unknown check',
              notes: pickString(checkCandidate.notes),
              status,
            }
          })
          .filter(
            (
              check,
            ): check is {
              check: string
              notes: string
              status: WriterCheckResultStatus
            } => Boolean(check),
          )
      : normalizedIssues
          .filter(
            (issue) =>
              issue.articleArtifactId === articleArtifactId &&
              issue.status !== 'stale' &&
              issue.resultStatus != null,
          )
          .map((issue) => ({
            check: issue.label,
            notes: issue.notes,
            status: issue.resultStatus as WriterCheckResultStatus,
          }))

    const openIssueCount = normalizedIssues.filter(
      (issue) => issue.status === 'open' && issue.articleArtifactId === articleArtifactId,
    ).length
    const resolvedIssueCount = normalizedIssues.filter(
      (issue) => issue.status === 'resolved' && issue.articleArtifactId === articleArtifactId,
    ).length
    const staleIssueCount = normalizedIssues.filter((issue) => issue.status === 'stale').length
    const currentVerifiedRuleCount = normalizedIssues.filter(
      (issue) => issue.articleArtifactId === articleArtifactId && issue.status !== 'stale',
    ).length
    const coverageCandidate =
      candidate.coverage && typeof candidate.coverage === 'object' && !Array.isArray(candidate.coverage)
        ? (candidate.coverage as Record<string, unknown>)
        : null
    const enabledRuleCount =
      typeof coverageCandidate?.enabledRuleCount === 'number' && Number.isFinite(coverageCandidate.enabledRuleCount)
        ? coverageCandidate.enabledRuleCount
        : normalizedIssues.length
    const coverage = {
      complete:
        typeof coverageCandidate?.complete === 'boolean'
          ? coverageCandidate.complete
          : currentVerifiedRuleCount === enabledRuleCount &&
            staleIssueCount === 0 &&
            openIssueCount === 0,
      currentVerifiedRuleCount,
      enabledRuleCount,
      openIssueCount,
      resolvedIssueCount,
      staleIssueCount,
    } satisfies WriterCheckCoverage
    const failCount =
      typeof candidate.failCount === 'number' && Number.isFinite(candidate.failCount)
        ? candidate.failCount
        : normalizedIssues.filter(
            (issue) =>
              issue.articleArtifactId === articleArtifactId &&
              issue.status === 'open' &&
              issue.resultStatus === 'fail',
          ).length
    const warnCount =
      typeof candidate.warnCount === 'number' && Number.isFinite(candidate.warnCount)
        ? candidate.warnCount
        : normalizedIssues.filter(
            (issue) =>
              issue.articleArtifactId === articleArtifactId &&
              issue.status === 'open' &&
              issue.resultStatus === 'warn',
          ).length
    const pass =
      typeof candidate.pass === 'boolean'
        ? candidate.pass
        : coverage.complete && failCount === 0 && warnCount === 0

    return {
      articleArtifactId,
      articleArtifactType,
      authorityLinks: normalizeCheckLinks(candidate.authorityLinks),
      checks: normalizedChecks,
      coverage,
      failCount,
      issues: normalizedIssues,
      lastRunCheckKey: pickString(candidate.lastRunCheckKey) || null,
      lastRunMode: isWriterCheckVerificationMode(candidate.lastRunMode) ? candidate.lastRunMode : 'full',
      internalLinks: normalizeCheckLinks(candidate.internalLinks),
      pass,
      summary: pickString(candidate.summary) || buildSummary(coverage, pass),
      warnCount,
    }
  } catch {
    return null
  }
}

export function buildWriterCheckReportFromSeoCheckerResult(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  checkerConfig: SeoCheckerRuntimeConfig
  checkerResult: SeoCheckerResult
  verifiedAt: string
}): WriterCheckReport {
  const issueByKey = new Map(
    input.checkerResult.checks.map((check) => {
      const issue = buildIssueFromCheck({
        articleArtifactId: input.articleArtifactId,
        articleArtifactType: input.articleArtifactType,
        check,
        checkerConfig: input.checkerConfig,
        verificationMode: 'full',
        verifiedAt: input.verifiedAt,
      })

      return [issue.checkKey, issue]
    }),
  )

  const issues = getEnabledWriterCheckKeys(input.checkerConfig).map((checkKey) => {
    return issueByKey.get(checkKey) ?? createDefaultIssue(checkKey, input.checkerConfig)
  })

  return finalizeWriterCheckReport({
    articleArtifactId: input.articleArtifactId,
    articleArtifactType: input.articleArtifactType,
    authorityLinks: normalizeCheckLinks(input.checkerResult.authorityLinks),
    checkerConfig: input.checkerConfig,
    internalLinks: normalizeCheckLinks(input.checkerResult.internalLinks),
    issues,
    lastRunCheckKey: null,
    lastRunMode: 'full',
  })
}

export function invalidateWriterCheckReport(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  checkerConfig: SeoCheckerRuntimeConfig
  existingReport: null | WriterCheckReport
}) {
  const issues = reconcileIssuesForCurrentArticle(input).map((issue) => ({
    ...issue,
    status: 'stale' as const,
  }))

  return finalizeWriterCheckReport({
    articleArtifactId: input.articleArtifactId,
    articleArtifactType: input.articleArtifactType,
    authorityLinks: input.existingReport?.authorityLinks ?? [],
    checkerConfig: input.checkerConfig,
    internalLinks: input.existingReport?.internalLinks ?? [],
    issues,
    lastRunCheckKey: input.existingReport?.lastRunCheckKey ?? null,
    lastRunMode: input.existingReport?.lastRunMode ?? 'full',
  })
}

export function mergeWriterCheckReportForSelectedCheck(input: {
  articleArtifactId: WriterRelationshipID
  articleArtifactType: WriterArtifactType
  checkKey: string
  checkerConfig: SeoCheckerRuntimeConfig
  checkerResult: SeoCheckerResult
  existingReport: null | WriterCheckReport
  verifiedAt: string
}) {
  const enabledCheckKeys = new Set<string>(getEnabledWriterCheckKeys(input.checkerConfig))

  if (!enabledCheckKeys.has(input.checkKey)) {
    throw new Error(`Unsupported check key "${input.checkKey}" for the current checker configuration.`)
  }

  const reconciledIssues = reconcileIssuesForCurrentArticle(input)
  const selectedCheck = input.checkerResult.checks
    .map((check) => ({
      issue: buildIssueFromCheck({
        articleArtifactId: input.articleArtifactId,
        articleArtifactType: input.articleArtifactType,
        check,
        checkerConfig: input.checkerConfig,
        verificationMode: 'targeted',
        verifiedAt: input.verifiedAt,
      }),
      key: resolveWriterCheckKey(check.check),
    }))
    .find((entry) => entry.key === input.checkKey)

  if (!selectedCheck) {
    throw new Error(`The targeted rerun for "${input.checkKey}" did not return a matching checker result.`)
  }

  const issues = reconciledIssues.map((issue) => (issue.checkKey === input.checkKey ? selectedCheck.issue : issue))

  return finalizeWriterCheckReport({
    articleArtifactId: input.articleArtifactId,
    articleArtifactType: input.articleArtifactType,
    authorityLinks: normalizeCheckLinks(input.checkerResult.authorityLinks),
    checkerConfig: input.checkerConfig,
    internalLinks: normalizeCheckLinks(input.checkerResult.internalLinks),
    issues,
    lastRunCheckKey: input.checkKey,
    lastRunMode: 'targeted',
  })
}

export function buildWriterCheckReportFailingListMarkdown(report: WriterCheckReport) {
  const actionableIssues = report.issues.filter((issue) => issue.status === 'open' || issue.status === 'stale')
  const lines = [
    '# SEO Checker Results',
    '',
    `- Summary: ${report.failCount} FAIL / ${report.warnCount} WARN / ${report.coverage.resolvedIssueCount} RESOLVED / ${report.coverage.staleIssueCount} STALE`,
    `- Rule coverage: ${report.coverage.currentVerifiedRuleCount}/${report.coverage.enabledRuleCount} verified for current revision`,
  ]

  if (!actionableIssues.length) {
    lines.push('')
    lines.push('## Issues')
    lines.push('')
    lines.push('- No open or stale issues remain.')
    return lines.join('\n')
  }

  lines.push('')
  lines.push('## Issues')
  lines.push('')

  actionableIssues.forEach((issue, index) => {
    const headline =
      issue.status === 'stale'
        ? `### STALE ${index + 1}. ${issue.label}`
        : `### ${(issue.resultStatus ?? 'warn').toUpperCase()} ${index + 1}. ${issue.label}`

    lines.push(headline)
    lines.push('')

    const noteText = issue.notes || DEFAULT_STALE_NOTE
    const noteItems = noteText
      .split(/;\s+/)
      .map((item) => item.trim())
      .filter(Boolean)

    if (noteItems.length > 1) {
      noteItems.forEach((noteItem) => lines.push(`- ${noteItem}`))
    } else {
      lines.push(`- ${noteText}`)
    }

    if (issue.status === 'stale') {
      lines.push('- Rerun this rule against the current saved article revision.')
    }

    lines.push('')
  })

  return lines.join('\n').trim()
}
