import {
  formatSectionBudgetCheckLabel,
  orderSeoChecks,
  resolveSeoCheckerConfig,
  seoCheckerCheckLabels,
  type SeoCheckerRuntimeConfig,
} from "../seo-checker-settings";
import { safeJsonParse, wordCount } from "../utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OutlineItem = {
  level?: string;
  heading?: string;
  title?: string;
  word_budget?: number;
  children?: OutlineItem[];
};

type BriefRecord = {
  target_keyword?: string;
  title?: string;
  title_ideas?: string[];
  secondary_keywords?: string[];
  differentiators?: string[];
  gaps_to_fill?: string[];
  internal_links?: string[];
  recommended_outline?: OutlineItem[];
  target_word_count?: number;
  section_word_budget_total?: number;
  meta_descriptions?: string[];
  faq_questions?: string[];
};

type FinalizedBriefPayload = {
  SeoBrief?: BriefRecord;
} & BriefRecord;

type SeoCheckerConfig = {
  targetKeyword: string;
  title: string;
  secondaryKeywords: string[];
  differentiators: string[];
  gaps: string[];
  faqQuestions: string[];
  internalLinks: string[];
  targetWordCount: number;
  sectionBudgetTotal: number;
  metaDescription: string;
  sectionBudgets: Map<string, { title: string; budget: number }>;
};

export type SectionBudgetAnalysisItem = {
  title: string;
  matchedSectionTitle: string | null;
  normalizedTitle: string;
  targetWords: number;
  actualWords: number | null;
  deltaPercent: number | null;
  withinTolerance: boolean;
  missing: boolean;
  note: string;
};

export type SectionBudgetAnalysis = {
  items: SectionBudgetAnalysisItem[];
  allWithinBudget: boolean;
  tolerancePercent: number;
};

export type SeoCheckStatus = "pass" | "warn" | "fail";

export type SeoCheck = {
  check: string;
  status: SeoCheckStatus;
  notes: string;
};

export type SeoCheckerLink = {
  anchorText: string;
  hostname: string;
  url: string;
};

export type SeoCheckerResult = {
  passCount: number;
  warnCount: number;
  failCount: number;
  totalWordCount: number;
  sectionCounts: Array<[string, number]>;
  checks: SeoCheck[];
  internalLinks: SeoCheckerLink[];
  authorityLinks: SeoCheckerLink[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRAND_NAME = "Gatekeepr";

const PRODUCTS = [
  {
    name: "Signup Protection API",
    altNames: ["signup protection", "signup protection api", "signup abuse prevention"],
  },
  {
    name: "Email Intelligence",
    altNames: ["email intelligence", "email risk intelligence", "email checks"],
  },
  {
    name: "Disposable Email Detection",
    altNames: ["disposable email detection", "temporary email detection", "disposable domain detection"],
  },
  {
    name: "Disposable MX Detection",
    altNames: ["disposable mx detection", "disposable mx infrastructure", "mx infrastructure checks"],
  },
  {
    name: "IP Reputation Checks",
    altNames: ["ip reputation", "ip risk checks", "tor checks", "blocklist checks"],
  },
  {
    name: "User-Agent Abuse Signals",
    altNames: ["user-agent checks", "user agent checks", "headless browser detection"],
  },
  {
    name: "Free-Trial Abuse Prevention",
    altNames: ["free-trial abuse prevention", "free trial abuse prevention", "trial abuse prevention"],
  },
];

const COMPETITOR_BRANDS = [
  "Arkose Labs",
  "Castle",
  "Cloudflare",
  "DataDome",
  "Fingerprint",
  "Hcaptcha",
  "Persona",
  "Sift",
];
const SITE_OWNED_HOSTNAME = "gatekeepr.io";

// Stopwords excluded from differentiator / gap content-matching
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "may", "might", "must", "can", "could", "about", "above",
  "after", "again", "all", "also", "any", "because", "before", "between",
  "both", "by", "each", "for", "from", "how", "if", "in", "into", "it", "its",
  "just", "like", "more", "most", "no", "nor", "not", "of", "on", "only",
  "other", "our", "out", "over", "own", "same", "so", "some", "such", "than",
  "that", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "under", "until", "up", "very", "what", "when",
  "where", "which", "while", "who", "whom", "why", "with", "you", "your",
  "based", "using", "used", "provide", "include", "article", "section",
  "reader", "content", "cover", "approach", "offer", "unlike", "without",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripCodeBlocks(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function stripMetaComment(markdown: string) {
  return markdown.replace(/^\s*<!--\s*Meta:[\s\S]*?-->\s*(?:\r?\n)?/i, "");
}

function splitH2Sections(markdown: string) {
  const parts = markdown.split(/^## /m);
  const sections: Array<[string, string]> = [];

  for (const [index, part] of parts.entries()) {
    if (index === 0) {
      sections.push(["Introduction", part]);
      continue;
    }

    const [headingLine, ...bodyLines] = part.split("\n");
    sections.push([headingLine?.trim() || "Untitled", bodyLines.join("\n")]);
  }

  return sections;
}

function sectionWordCounts(markdown: string) {
  const prose = stripCodeBlocks(markdown);
  const totalWordCount = wordCount(prose);
  const sectionBudgetMarkdown = stripMetaComment(markdown);
  const sections = splitH2Sections(sectionBudgetMarkdown);
  const sectionCounts = sections.map(([name, body]) => {
    const bodyWordCount = wordCount(body);
    return [name, name === "Introduction" ? bodyWordCount : bodyWordCount + wordCount(name)] as [
      string,
      number,
    ];
  });

  return {
    prose,
    totalWordCount,
    sectionCounts,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHostname(value: string) {
  return value.toLowerCase().replace(/^www\./, "").trim();
}

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${normalizeHostname(url.hostname)}${pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function isSiteOwnedHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return normalized === SITE_OWNED_HOSTNAME || normalized.endsWith(`.${SITE_OWNED_HOSTNAME}`);
}

function isCompetitorHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return COMPETITOR_BRANDS.some((brand) => {
    const token = brand.toLowerCase().replace(/\s+/g, "");
    const hostnameToken = normalized.replace(/[^a-z0-9]/g, "");
    return hostnameToken.includes(token);
  });
}

function extractMarkdownLinks(markdown: string): SeoCheckerLink[] {
  const links: SeoCheckerLink[] = [];
  const pattern = /(^|[^!])\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gm;

  for (const match of markdown.matchAll(pattern)) {
    const anchorText = match[2]?.replace(/\s+/g, " ").trim() ?? "";
    const url = match[3]?.trim();

    if (!url) {
      continue;
    }

    try {
      const hostname = normalizeHostname(new URL(url).hostname);

      links.push({ anchorText, hostname, url });
    } catch {
      continue;
    }
  }

  const unique = new Map<string, SeoCheckerLink>();
  for (const link of links) {
    if (!unique.has(link.url)) {
      unique.set(link.url, link);
    }
  }

  return [...unique.values()];
}

function extractAuthoritativeExternalMarkdownLinks(
  markdown: string,
  disallowedHostnames: Set<string>,
) {
  return extractMarkdownLinks(markdown).filter((link) => {
    if (!link.hostname || isSiteOwnedHostname(link.hostname) || isCompetitorHostname(link.hostname)) {
      return false;
    }

    return !disallowedHostnames.has(normalizeHostname(link.hostname));
  });
}

function extractInternalMarkdownLinks(markdown: string) {
  return extractMarkdownLinks(markdown).filter((link) => isSiteOwnedHostname(link.hostname));
}

function extractUrlFromInternalLinkEntry(entry: string) {
  return entry.match(/\((https?:\/\/[^)\s]+)\)\s*$/i)?.[1] ?? entry.match(/https?:\/\/\S+/i)?.[0] ?? "";
}

function normalizeHeadingKey(value: string) {
  let normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const brandName of [BRAND_NAME, ...COMPETITOR_BRANDS]) {
    const normalizedBrand = brandName
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalizedBrand) {
      continue;
    }

    normalized = normalized.replace(
      new RegExp(`\\b${escapeRegExp(normalizedBrand)}\\b`, "g"),
      "brand",
    );
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function tokenizeHeadingKey(value: string) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !["a", "an", "the", "with"].includes(token))
    .map((token) => {
      if (token === "brand" || token === "scraping") {
        return "api_modifier";
      }

      return token;
    });
}

function findSimilarSectionCountForBudget(
  sectionCountsByKey: Map<string, { name: string; count: number }>,
  headingKey: string,
) {
  const targetTokens = tokenizeHeadingKey(headingKey);

  if (targetTokens.length === 0) {
    return null;
  }

  let bestMatch: { name: string; count: number } | null = null;
  let bestScore = 0;

  for (const [candidateKey, section] of sectionCountsByKey.entries()) {
    const candidateTokens = tokenizeHeadingKey(candidateKey);

    if (candidateTokens.length === 0) {
      continue;
    }

    const targetSet = new Set(targetTokens);
    const candidateSet = new Set(candidateTokens);
    const intersectionCount = [...targetSet].filter((token) => candidateSet.has(token)).length;
    const coverage = intersectionCount / targetSet.size;

    if (coverage > bestScore && coverage >= 0.75) {
      bestScore = coverage;
      bestMatch = section;
    }
  }

  return bestMatch;
}

function resolveSectionCountForBudget(
  sectionCountsByKey: Map<string, { name: string; count: number }>,
  headingKey: string,
) {
  if (headingKey === "introduction") {
    return (
      sectionCountsByKey.get("intro before first h2") ??
      sectionCountsByKey.get("introduction") ??
      null
    );
  }

  if (headingKey === "frequently asked questions") {
    return (
      sectionCountsByKey.get("frequently asked questions") ??
      sectionCountsByKey.get("faq") ??
      null
    );
  }

  return sectionCountsByKey.get(headingKey) ?? findSimilarSectionCountForBudget(sectionCountsByKey, headingKey) ?? null;
}

function extractArticleMetaDescription(markdown: string) {
  const match = markdown.match(/^<!--\s*Meta:\s*([\s\S]*?)\s*-->/i);
  return match?.[1]?.trim() ?? "";
}

/**
 * Extract significant words from a text for content-matching.
 * Strips stopwords, short words (<=3 chars), and returns lowercase tokens.
 */
function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-—/,;:()"']+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

/**
 * Check whether a prose body contains enough significant words from a
 * brief item (gap or differentiator) to count as "covered".
 *
 * Uses a 50% threshold: if at least half the significant words from the
 * brief item appear somewhere in the prose, we consider it addressed.
 */
function isContentCovered(briefItem: string, proseLower: string): boolean {
  const significantWords = extractSignificantWords(briefItem);

  if (!significantWords.length) {
    return true; // nothing meaningful to check
  }

  const matches = significantWords.filter((word) => proseLower.includes(word)).length;
  return matches >= Math.ceil(significantWords.length * 0.5);
}

function isEthicalLegalBestPracticesDifferentiator(briefItem: string) {
  return (
    /\bethical\b|\blegal\b/i.test(briefItem) &&
    /\brobots\.txt\b/i.test(briefItem) &&
    (/\bterms of service\b/i.test(briefItem) || /\btos\b/i.test(briefItem))
  );
}

function isEthicalLegalBestPracticesCovered(markdown: string) {
  const sections = splitH2Sections(stripCodeBlocks(markdown));

  return sections.some(([heading, body]) => {
    const combined = `${heading}\n${body}`.toLowerCase();

    const hasLegalOrEthicalSection = /\blegal\b|\bethical\b|\bbest practices?\b/i.test(combined);
    const hasRobotsTxt = /\brobots\.txt\b/i.test(combined);
    const hasTermsReview =
      /\bterms of service\b/i.test(combined) || /\btos\b/i.test(combined);
    const hasChecklistStructure =
      /\bchecklist\b/i.test(combined) || /^\s*[-*]\s+/m.test(body);

    return (
      hasLegalOrEthicalSection &&
      hasRobotsTxt &&
      hasTermsReview &&
      hasChecklistStructure
    );
  });
}

function isDifferentiatorCovered(briefItem: string, markdown: string, proseLower: string) {
  if (isEthicalLegalBestPracticesDifferentiator(briefItem)) {
    return isEthicalLegalBestPracticesCovered(markdown);
  }

  return isContentCovered(briefItem, proseLower);
}

// ---------------------------------------------------------------------------
// Brief normalisation
// ---------------------------------------------------------------------------

function buildSectionBudgetMap(outline: OutlineItem[]) {
  const flattenedOutline: Array<{
    level: "H2" | "H3";
    title: string;
    wordBudget: number;
  }> = [];

  const flattenOutline = (items: OutlineItem[], depth = 0) => {
    for (const item of items) {
      const title =
        typeof item.title === "string"
          ? item.title.trim()
          : typeof item.heading === "string"
            ? item.heading.trim()
            : "";
      const wordBudget =
        typeof item.word_budget === "number" && Number.isFinite(item.word_budget)
          ? Math.round(item.word_budget)
          : 0;
      const level =
        typeof item.level === "string"
          ? item.level.toUpperCase()
          : depth > 0
            ? "H3"
            : "H2";

      if (title && wordBudget > 0 && (level === "H2" || level === "H3")) {
        flattenedOutline.push({
          level,
          title,
          wordBudget,
        });
      }

      if (Array.isArray(item.children) && item.children.length > 0) {
        flattenOutline(item.children, depth + 1);
      }
    }
  };

  flattenOutline(outline);

  const budgets = new Map<string, { title: string; budget: number }>();
  let currentH2: { title: string; normalizedTitle: string; budget: number } | null = null;

  for (const item of flattenedOutline) {
    const normalizedTitle = normalizeHeadingKey(item.title);

    if (item.level === "H2") {
      if (currentH2) {
        budgets.set(currentH2.normalizedTitle, {
          title: currentH2.title,
          budget: currentH2.budget,
        });
      }

      currentH2 =
        normalizedTitle && item.wordBudget > 0
          ? {
              title: item.title,
              normalizedTitle,
              budget: item.wordBudget,
            }
          : null;
      continue;
    }

    if (item.level === "H3" && currentH2) {
      currentH2.budget += item.wordBudget;
    }
  }

  if (currentH2) {
    budgets.set(currentH2.normalizedTitle, {
      title: currentH2.title,
      budget: currentH2.budget,
    });
  }

  return budgets;
}

export function analyzeSectionBudgets(
  markdown: string,
  finalizedBriefJson: string,
  checkerConfigInput?: SeoCheckerRuntimeConfig,
): SectionBudgetAnalysis {
  const config = normalizeBriefPayload(finalizedBriefJson);
  const checkerConfig = checkerConfigInput ?? resolveSeoCheckerConfig(null);
  const { sectionCounts } = sectionWordCounts(resolveDraftMarkdown(markdown));
  const tolerancePercent = checkerConfig.checks.section_budgets.tolerance_percent;
  const sectionCountsByKey = new Map(
    sectionCounts.map(([name, count]) => [normalizeHeadingKey(name), { name, count }]),
  );
  const items = [...config.sectionBudgets.entries()].map(([headingKey, sectionBudget]) => {
    const section = resolveSectionCountForBudget(sectionCountsByKey, headingKey);

    if (!section) {
      return {
        title: sectionBudget.title,
        matchedSectionTitle: null,
        normalizedTitle: headingKey,
        targetWords: sectionBudget.budget,
        actualWords: null,
        deltaPercent: null,
        withinTolerance: false,
        missing: true,
        note: `${sectionBudget.title}: missing section (budget: ${sectionBudget.budget})`,
      } satisfies SectionBudgetAnalysisItem;
    }

    const deltaPercent = ((section.count - sectionBudget.budget) / sectionBudget.budget) * 100;
    const withinTolerance = Math.abs(deltaPercent) <= tolerancePercent;

    return {
      title: sectionBudget.title,
      matchedSectionTitle: section.name,
      normalizedTitle: headingKey,
      targetWords: sectionBudget.budget,
      actualWords: section.count,
      deltaPercent,
      withinTolerance,
      missing: false,
      note: `${section.name}: ${section.count}/${sectionBudget.budget} (${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(1)}%)`,
    } satisfies SectionBudgetAnalysisItem;
  });

  return {
    items,
    allWithinBudget: items.every((item) => item.withinTolerance),
    tolerancePercent,
  };
}

function normalizeBriefPayload(value: string) {
  const parsed = safeJsonParse<FinalizedBriefPayload>(value);

  if (!parsed) {
    throw new Error("FinalizedBrief.json is not valid JSON.");
  }

  const brief = parsed.SeoBrief ?? parsed;

  return {
    targetKeyword: brief.target_keyword?.trim() || "",
    title:
      (typeof brief.title === "string" && brief.title.trim()) ||
      (Array.isArray(brief.title_ideas) && typeof brief.title_ideas[0] === "string" && brief.title_ideas[0].trim()) ||
      "",
    secondaryKeywords: Array.isArray(brief.secondary_keywords)
      ? brief.secondary_keywords.filter((v): v is string => typeof v === "string")
      : [],
    differentiators: Array.isArray(brief.differentiators)
      ? brief.differentiators.filter((v): v is string => typeof v === "string")
      : [],
    gaps: Array.isArray(brief.gaps_to_fill)
      ? brief.gaps_to_fill.filter((v): v is string => typeof v === "string")
      : [],
    faqQuestions: Array.isArray(brief.faq_questions)
      ? brief.faq_questions.filter((v): v is string => typeof v === "string")
      : [],
    internalLinks: Array.isArray(brief.internal_links)
      ? brief.internal_links.filter((v): v is string => typeof v === "string")
      : [],
    targetWordCount:
      typeof brief.target_word_count === "number" && Number.isFinite(brief.target_word_count)
        ? brief.target_word_count
        : 0,
    sectionBudgetTotal:
      typeof brief.section_word_budget_total === "number" && Number.isFinite(brief.section_word_budget_total)
        ? brief.section_word_budget_total
        : 0,
    metaDescription:
      Array.isArray(brief.meta_descriptions) &&
      typeof brief.meta_descriptions[0] === "string" &&
      brief.meta_descriptions[0].trim()
        ? brief.meta_descriptions[0].trim()
        : "",
    sectionBudgets: buildSectionBudgetMap(
      Array.isArray(brief.recommended_outline) ? brief.recommended_outline : [],
    ),
  } satisfies SeoCheckerConfig;
}

// ---------------------------------------------------------------------------
// Tool-call / article resolution
// ---------------------------------------------------------------------------

function detectToolCallArticleContent(value: string) {
  const toolCallMatch = value.match(/<tool_(?:call|use)>\s*([\s\S]*?)\s*<\/tool_(?:call|use)>/i);
  const toolCallJson = toolCallMatch?.[1]?.trim();

  if (!toolCallJson) {
    return null;
  }

  const parsedToolCall = safeJsonParse<Record<string, unknown>>(toolCallJson);

  if (!parsedToolCall || parsedToolCall.name !== "Write") {
    return null;
  }

  const rawArguments =
    typeof parsedToolCall.arguments === "string"
      ? safeJsonParse<Record<string, unknown>>(parsedToolCall.arguments)
      : parsedToolCall.arguments && typeof parsedToolCall.arguments === "object"
        ? (parsedToolCall.arguments as Record<string, unknown>)
        : null;

  if (!rawArguments || typeof rawArguments.content !== "string") {
    return null;
  }

  return rawArguments.content.trim();
}

function resolveDraftMarkdown(markdown: string) {
  const toolCallContent = detectToolCallArticleContent(markdown);
  if (toolCallContent) {
    return toolCallContent;
  }

  const articleSection = markdown.match(/<article_markdown>\s*([\s\S]*?)\s*<\/article_markdown>/i);
  if (articleSection?.[1]?.trim()) {
    return articleSection[1].trim();
  }

  return markdown.trim();
}

// ---------------------------------------------------------------------------
// Extract FAQ section helper
// ---------------------------------------------------------------------------

function isFaqHeading(value: string) {
  const normalizedValue = value
    .replace(/[*_`:#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\bfaq\b/i.test(normalizedValue) || /\bfrequently\s+asked\s+questions\b/i.test(normalizedValue);
}

function extractFaqSection(draftMarkdown: string): string {
  const lines = draftMarkdown.split(/\r?\n/);
  let startIndex = -1;
  let faqHeadingLevel = 2;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

    if (headingMatch && isFaqHeading(headingMatch[2] ?? "")) {
      startIndex = index;
      faqHeadingLevel = headingMatch[1]?.length ?? 2;
      break;
    }
  }

  if (startIndex < 0) {
    return "";
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);

    if (!headingMatch) {
      continue;
    }

    const headingLevel = headingMatch[1]?.length ?? faqHeadingLevel;
    if (headingLevel <= faqHeadingLevel) {
      return lines.slice(startIndex, index).join("\n").trim();
    }
  }

  return lines.slice(startIndex).join("\n").trim();
}

function extractFaqEntries(faqSection: string) {
  const headingEntries = faqSection
    .split(/^### /gm)
    .slice(1)
    .map((entry) => {
      const [, ...bodyLines] = entry.split("\n");
      return bodyLines.join("\n").trim();
    });

  if (headingEntries.length > 0) {
    return headingEntries.filter(Boolean);
  }

  const qaEntries: string[] = [];
  const lines = faqSection.split(/\r?\n/);
  let currentAnswerLines: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^\*\*Q:\*\*/.test(line) || /^\*\*Q:[\s\S]*\*\*$/.test(line)) {
      if (currentAnswerLines && currentAnswerLines.join("").trim()) {
        qaEntries.push(currentAnswerLines.join("\n").trim());
      }

      currentAnswerLines = null;
      continue;
    }

    const answerMatch = line.match(/^\*\*A:\*\*\s*(.*)$/);
    if (answerMatch) {
      currentAnswerLines = [answerMatch[1] ?? ""];
      continue;
    }

    if (currentAnswerLines) {
      currentAnswerLines.push(rawLine);
    }
  }

  if (currentAnswerLines && currentAnswerLines.join("").trim()) {
    qaEntries.push(currentAnswerLines.join("\n").trim());
  }

  return qaEntries;
}

function extractEffectiveArticleTitle(markdown: string, fallbackTitle = "") {
  const titleMatch = stripMetaComment(markdown).match(/^\s*#\s+(.+?)\s*$/m);
  const headingTitle = titleMatch?.[1]?.trim() ?? "";

  if (headingTitle) {
    return headingTitle;
  }

  return fallbackTitle.trim();
}

// ---------------------------------------------------------------------------
// Main checker
// ---------------------------------------------------------------------------

export function runSeoChecklist(
  markdown: string,
  finalizedBriefJson: string,
  checkerConfigInput?: SeoCheckerRuntimeConfig,
  options?: {
    competitorTerms?: string[];
    disallowedExternalHostnames?: string[];
    fallbackTitle?: string;
  },
): SeoCheckerResult {
  const draftMarkdown = resolveDraftMarkdown(markdown);
  const cleanedDraftMarkdown = stripCodeBlocks(draftMarkdown);
  const config = normalizeBriefPayload(finalizedBriefJson);
  const checkerConfig = checkerConfigInput ?? resolveSeoCheckerConfig(null);
  const competitorTerms =
    options?.competitorTerms?.filter((term) => term.trim().length >= 4) ?? [];
  const disallowedExternalHostnames = new Set(
    (options?.disallowedExternalHostnames ?? []).map((hostname) => normalizeHostname(hostname)).filter(Boolean),
  );
  const { prose, totalWordCount, sectionCounts } = sectionWordCounts(draftMarkdown);
  const proseLower = prose.toLowerCase();
  const keywordLower = config.targetKeyword.toLowerCase();
  const checks: SeoCheck[] = [];

  // -----------------------------------------------------------------------
  // 1. Single H1
  // -----------------------------------------------------------------------
  const h1Lines = prose.split("\n").filter((line) => /^# [^#]/.test(line));
  const h1Count = h1Lines.length;
  const effectiveArticleTitle = extractEffectiveArticleTitle(
    draftMarkdown,
    options?.fallbackTitle || config.title,
  );
  if (checkerConfig.checks.single_h1.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.single_h1,
      status: h1Count === 1 || (h1Count === 0 && Boolean(effectiveArticleTitle)) ? "pass" : "fail",
      notes:
        h1Count === 1
          ? `Found 1 H1 tag. H1: '${h1Lines[0]?.trim()}'`
          : effectiveArticleTitle
            ? `No markdown H1 found. Using stored article title '${effectiveArticleTitle}' as the canonical H1.`
            : "No H1 found",
    });
  }

  // -----------------------------------------------------------------------
  // 2. Keyword in H1
  // -----------------------------------------------------------------------
  const resolvedH1Text = h1Lines[0]?.replace(/^#\s+/, "").trim() || effectiveArticleTitle;
  const h1Text = resolvedH1Text.toLowerCase();
  if (checkerConfig.checks.keyword_in_h1.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.keyword_in_h1,
      status: keywordLower && h1Text.includes(keywordLower) ? "pass" : "fail",
      notes: resolvedH1Text ? `H1/title: '${resolvedH1Text}'` : "No H1 or title",
    });
  }

  // -----------------------------------------------------------------------
  // 3. Keyword in first 100 words
  // -----------------------------------------------------------------------
  const first100Words = prose.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  if (checkerConfig.checks.keyword_in_first_100_words.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.keyword_in_first_100_words,
      status: keywordLower && first100Words.includes(keywordLower) ? "pass" : "fail",
      notes: `'${keywordLower}' ${first100Words.includes(keywordLower) ? "found" : "NOT found"} in first 100 words`,
    });
  }

  // -----------------------------------------------------------------------
  // 4. Keyword in at least one H2
  // -----------------------------------------------------------------------
  const h2Lines = cleanedDraftMarkdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^## [^#]/.test(line));
  const h2WithKeyword = keywordLower
    ? h2Lines.filter((line) => line.toLowerCase().includes(keywordLower))
    : [];
  if (checkerConfig.checks.keyword_in_h2.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.keyword_in_h2,
      status: h2WithKeyword.length ? "pass" : "fail",
      notes: `${h2WithKeyword.length} H2(s) contain '${config.targetKeyword}'`,
    });
  }

  // -----------------------------------------------------------------------
  // 5. Keyword density
  // -----------------------------------------------------------------------
  const keywordPattern = keywordLower
    ? new RegExp(`\\b${escapeRegExp(keywordLower)}\\b`, "g")
    : null;
  const keywordCount = keywordPattern ? (proseLower.match(keywordPattern)?.length ?? 0) : 0;
  const densityPct = totalWordCount ? (keywordCount / totalWordCount) * 100 : 0;
  if (checkerConfig.checks.keyword_density.enabled) {
    const minimumMentions = checkerConfig.checks.keyword_density.minimum_mentions;
    const warnAbovePercent = checkerConfig.checks.keyword_density.warn_above_percent;
    checks.push({
      check: seoCheckerCheckLabels.keyword_density,
      status: keywordCount < minimumMentions ? "fail" : densityPct > warnAbovePercent ? "warn" : "pass",
      notes: `'${config.targetKeyword}' appears ${keywordCount} times (${densityPct.toFixed(2)}%). Minimum: ${minimumMentions}`,
    });
  }

  // -----------------------------------------------------------------------
  // 6. Secondary keywords
  // -----------------------------------------------------------------------
  const foundSecondary = config.secondaryKeywords.filter((kw) =>
    proseLower.includes(kw.toLowerCase()),
  );
  const missingSecondary = config.secondaryKeywords.filter(
    (kw) => !proseLower.includes(kw.toLowerCase()),
  );
  if (checkerConfig.checks.secondary_keywords.enabled) {
    const secondaryThreshold = config.secondaryKeywords.length
      ? Math.max(
          checkerConfig.checks.secondary_keywords.minimum_absolute,
          Math.floor(
            config.secondaryKeywords.length * checkerConfig.checks.secondary_keywords.minimum_ratio,
          ),
        )
      : 0;
    checks.push({
      check: seoCheckerCheckLabels.secondary_keywords,
      status:
        !config.secondaryKeywords.length || foundSecondary.length >= secondaryThreshold
          ? "pass"
          : "fail",
      notes: config.secondaryKeywords.length
        ? `${foundSecondary.length}/${config.secondaryKeywords.length} found (minimum: ${secondaryThreshold}). Missing: ${missingSecondary.join(", ")}`
        : "No secondary keywords configured",
    });
  }

  // -----------------------------------------------------------------------
  // 7. Snippet-friendly block
  // -----------------------------------------------------------------------
  const snippetPatterns = keywordLower
    ? [
        new RegExp(`${escapeRegExp(keywordLower)}\\s+is\\s+`, "i"),
        new RegExp(`${escapeRegExp(keywordLower)}\\s+refers?\\s+to\\s+`, "i"),
        new RegExp(`${escapeRegExp(keywordLower)}\\s+means?\\s+`, "i"),
        new RegExp(`what\\s+is\\s+${escapeRegExp(keywordLower)}`, "i"),
      ]
    : [];
  const hasSnippetDefinition = snippetPatterns.some((p) => p.test(proseLower));
  // Also check for numbered list or table near the top of any section
  const hasSnippetList = /^\s*(?:1\.|step\s+1)/im.test(draftMarkdown);
  const hasSnippetTable = /\|.*\|.*\|/m.test(draftMarkdown);
  const hasSnippet = hasSnippetDefinition || hasSnippetList || hasSnippetTable;
  if (checkerConfig.checks.snippet_friendly_block.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.snippet_friendly_block,
      status: hasSnippet ? "pass" : "fail",
      notes: hasSnippetDefinition
        ? `Definition pattern found for '${config.targetKeyword}'`
        : hasSnippetTable
          ? "Comparison table found (snippet-eligible)"
          : hasSnippetList
            ? "Numbered list/steps found (snippet-eligible)"
            : `No snippet-friendly block found. Add a '${config.targetKeyword} is...' definition, numbered steps, or comparison table`,
    });
  }

  // -----------------------------------------------------------------------
  // 8. Authoritative external markdown links
  // -----------------------------------------------------------------------
  const authoritativeExternalLinks = extractAuthoritativeExternalMarkdownLinks(
    cleanedDraftMarkdown,
    disallowedExternalHostnames,
  );
  const internalCandidateUrls = new Set(
    config.internalLinks
      .map((entry) => extractUrlFromInternalLinkEntry(entry))
      .filter(Boolean)
      .map((url) => normalizeComparableUrl(url)),
  );
  const internalMarkdownLinks = extractInternalMarkdownLinks(cleanedDraftMarkdown);
  const matchingInternalLinks = internalCandidateUrls.size > 0
    ? internalMarkdownLinks.filter((link) => internalCandidateUrls.has(normalizeComparableUrl(link.url)))
    : internalMarkdownLinks;
  if (checkerConfig.checks.internal_links_present.enabled) {
    const minimumCount = checkerConfig.checks.internal_links_present.minimum_count;
    checks.push({
      check: seoCheckerCheckLabels.internal_links_present,
      status:
        config.internalLinks.length === 0 || matchingInternalLinks.length >= minimumCount
          ? "pass"
          : "fail",
      notes:
        config.internalLinks.length === 0
          ? "No internal-link candidates were configured in the brief."
          : matchingInternalLinks.length >= minimumCount
            ? `${matchingInternalLinks.length} qualifying internal markdown link(s): ${matchingInternalLinks
                .map((link) => link.url)
                .join(", ")}`
            : `Found ${matchingInternalLinks.length} qualifying internal markdown link(s). Add at least ${minimumCount} site-owned markdown links from the selected internal-link candidates.`,
    });
  }
  if (checkerConfig.checks.external_authoritative_links.enabled) {
    const minimumCount = checkerConfig.checks.external_authoritative_links.minimum_count;
    checks.push({
      check: seoCheckerCheckLabels.external_authoritative_links,
      status: authoritativeExternalLinks.length >= minimumCount ? "pass" : "fail",
      notes:
        authoritativeExternalLinks.length >= minimumCount
          ? `${authoritativeExternalLinks.length} qualifying external markdown link(s): ${authoritativeExternalLinks
              .map((link) => link.hostname)
              .join(", ")}`
          : `Found ${authoritativeExternalLinks.length} qualifying authoritative external markdown link(s). Add at least ${minimumCount} non-${SITE_OWNED_HOSTNAME} markdown link to an authoritative source. Raw URLs and site-owned links do not count. Source/competitor links also do not count.`,
    });
  }

  // -----------------------------------------------------------------------
  // 9. FAQ section
  // -----------------------------------------------------------------------
  const faqSection = extractFaqSection(cleanedDraftMarkdown);
  const faqEntries = faqSection ? extractFaqEntries(faqSection) : [];
  const faqCount = faqEntries.length;
  if (checkerConfig.checks.faq_section_present.enabled) {
    const minFaqCount = checkerConfig.checks.faq_section_present.min_qas;
    const maxFaqCount = checkerConfig.checks.faq_section_present.max_qas;
    checks.push({
      check: seoCheckerCheckLabels.faq_section_present,
      status: faqCount >= minFaqCount && faqCount <= maxFaqCount ? "pass" : "fail",
      notes: `FAQ section ${faqSection ? "found" : "NOT found"}. ${faqCount} Q&A(s)`,
    });
  }

  // -----------------------------------------------------------------------
  // 10. Word count — compare prose to target_word_count
  //
  // The builder sets target_word_count as the FULL article target.
  // section_word_budget_total ≈ target_word_count - 850 (bookend overhead).
  // We compare the prose word count to the full target since prose includes
  // bookend sections (intro, takeaways, FAQ, conclusion).
  // -----------------------------------------------------------------------
  const target = config.targetWordCount;
  if (checkerConfig.checks.word_count_within_range.enabled) {
    const passTolerance = checkerConfig.checks.word_count_within_range.pass_tolerance_percent / 100;
    const warnTolerance = checkerConfig.checks.word_count_within_range.warn_tolerance_percent / 100;
    let wordCountStatus: SeoCheckStatus = "warn";
    if (target > 0) {
      const lowPass = Math.floor(target * (1 - passTolerance));
      const lowWarn = Math.floor(target * (1 - warnTolerance));
      wordCountStatus =
        totalWordCount >= lowPass
          ? "pass"
          : totalWordCount >= lowWarn
            ? "warn"
            : "fail";
    }
    checks.push({
      check: seoCheckerCheckLabels.word_count_within_range,
      status: wordCountStatus,
      notes: `Prose: ${totalWordCount} words (target: ${target}, minimum for pass: ${Math.floor(target * (1 - passTolerance))}, minimum for warn: ${Math.floor(target * (1 - warnTolerance))})`,
    });
  }

  // -----------------------------------------------------------------------
  // 11. Section budgets — rendered H2 section content vs. outline budget
  // Code fences remain part of section counts so code-heavy sections use the
  // same budget semantics the writer sees in the prompt.
  // -----------------------------------------------------------------------
  const budgetDetails: string[] = [];
  if (checkerConfig.checks.section_budgets.enabled) {
    const budgetAnalysis = analyzeSectionBudgets(
      draftMarkdown,
      finalizedBriefJson,
      checkerConfig,
    );
    budgetDetails.push(...budgetAnalysis.items.map((item) => item.note));
    checks.push({
      check: formatSectionBudgetCheckLabel(
        checkerConfig.checks.section_budgets.tolerance_percent,
      ),
      status: budgetAnalysis.allWithinBudget ? "pass" : "fail",
      notes: budgetDetails.length ? budgetDetails.join("; ") : "No section budgets defined",
    });
  }

  // -----------------------------------------------------------------------
  // 12. Gaps coverage
  // -----------------------------------------------------------------------
  const foundGaps: string[] = [];
  const missingGaps: string[] = [];
  for (const gap of config.gaps) {
    if (isContentCovered(gap, proseLower)) {
      foundGaps.push(gap);
    } else {
      missingGaps.push(gap);
    }
  }
  if (checkerConfig.checks.gaps_addressed.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.gaps_addressed,
      status: !config.gaps.length
        ? "pass"
        : missingGaps.length
          ? "fail"
          : "pass",
      notes: !config.gaps.length
        ? "No gaps defined in brief"
        : `${foundGaps.length}/${config.gaps.length} addressed.${missingGaps.length ? ` Missing: ${missingGaps.join("; ")}` : " All addressed."}`,
    });
  }

  // -----------------------------------------------------------------------
  // 13. Differentiators coverage (generic — no hardcoded keyword map)
  // -----------------------------------------------------------------------
  const foundDifferentiators: string[] = [];
  const missingDifferentiators: string[] = [];
  for (const differentiator of config.differentiators) {
    if (isDifferentiatorCovered(differentiator, cleanedDraftMarkdown, proseLower)) {
      foundDifferentiators.push(differentiator);
    } else {
      missingDifferentiators.push(differentiator);
    }
  }
  if (checkerConfig.checks.differentiators_included.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.differentiators_included,
      status: missingDifferentiators.length ? "fail" : "pass",
      notes: `${foundDifferentiators.length}/${config.differentiators.length} present.${missingDifferentiators.length ? ` Missing: ${missingDifferentiators.join("; ")}` : " All present."}`,
    });
  }

  // -----------------------------------------------------------------------
  // 14. Meta description length
  // -----------------------------------------------------------------------
  if (checkerConfig.checks.meta_description.enabled) {
    const articleMetaDescription = extractArticleMetaDescription(cleanedDraftMarkdown);
    const metaLength = articleMetaDescription.length;
    const metaMin = checkerConfig.checks.meta_description.min_chars;
    const metaMax = checkerConfig.checks.meta_description.max_chars;
    checks.push({
      check: seoCheckerCheckLabels.meta_description,
      status: metaLength >= metaMin && metaLength <= metaMax ? "pass" : metaLength > 0 ? "warn" : "warn",
      notes: metaLength > 0
        ? `${metaLength} characters (target: ${metaMin}-${metaMax})`
        : "No meta description found in the article meta comment",
    });
  }

  // -----------------------------------------------------------------------
  // 15. TL;DR present
  // -----------------------------------------------------------------------
  const hasTldr = [
    />\s*\*?\*?TL;?DR\*?\*?:?/im,
    /^#{1,3}\s*TL;?DR/im,
    /\*\*TL;?DR:?\*\*/i,
  ].some((pattern) => pattern.test(cleanedDraftMarkdown));
  if (checkerConfig.checks.tldr_present.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.tldr_present,
      status: hasTldr ? "pass" : "fail",
      notes: `TL;DR box ${hasTldr ? "found" : "NOT found"} in article`,
    });
  }

  // -----------------------------------------------------------------------
  // 16. Key Takeaways present
  // -----------------------------------------------------------------------
  const takeawaysMatch = cleanedDraftMarkdown.match(/^##?\s*(?:Key\s+)?Takeaways?\b/im);
  let takeawaysStatus: SeoCheckStatus = "fail";
  let takeawaysNotes = "Key Takeaways section NOT found";
  if (takeawaysMatch?.index != null) {
    const afterHeading = cleanedDraftMarkdown.slice(
      takeawaysMatch.index + takeawaysMatch[0].length,
      takeawaysMatch.index + takeawaysMatch[0].length + 500,
    );
    const hasBullets = /^\s*[-*]\s+/m.test(afterHeading);
    takeawaysStatus = hasBullets ? "pass" : "warn";
    takeawaysNotes = `Key Takeaways section found${hasBullets ? " with bullet points" : " but missing bullet points"}`;
  }
  if (checkerConfig.checks.key_takeaways_present.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.key_takeaways_present,
      status: takeawaysStatus,
      notes: takeawaysNotes,
    });
  }

  // -----------------------------------------------------------------------
  // 17. Brand integration — floor (>=1 + CTA) AND ceiling (<=3, 0 in FAQ)
  // -----------------------------------------------------------------------
  const brandPattern = new RegExp(`\\b${escapeRegExp(BRAND_NAME.toLowerCase())}\\b`, "g");
  const brandMentions = proseLower.match(brandPattern)?.length ?? 0;

  const productMentions = PRODUCTS.filter((product) =>
    [product.name.toLowerCase(), ...product.altNames].some((name) =>
      new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(proseLower),
    ),
  ).map((product) => product.name);

  const competitorMentions = competitorTerms.filter((brand) =>
    new RegExp(`\\b${escapeRegExp(brand.toLowerCase())}\\b`, "i").test(proseLower),
  );

  const conclusionMatch = cleanedDraftMarkdown.match(/^## .*Conclusion/im);
  const conclusionSection =
    conclusionMatch?.index != null
      ? cleanedDraftMarkdown.slice(conclusionMatch.index).toLowerCase()
      : prose.split(/\s+/).slice(-500).join(" ").toLowerCase();
  const hasConclusionCta = new RegExp(
    `\\b${escapeRegExp(BRAND_NAME.toLowerCase())}\\b`,
    "i",
  ).test(conclusionSection);

  // Check for brand in FAQ (should be zero)
  const faqSectionLower = faqSection.toLowerCase();
  const brandInFaq = faqSectionLower
    ? (faqSectionLower.match(brandPattern)?.length ?? 0)
    : 0;

  if (checkerConfig.checks.brand_integration.enabled) {
    let brandStatus: SeoCheckStatus = "fail";
    let brandNotes = `${BRAND_NAME} NOT mentioned - this is our blog! Add 1-2 relevant product mentions${checkerConfig.checks.brand_integration.require_conclusion_cta ? " + conclusion CTA" : ""}.`;

    if (competitorMentions.length) {
      brandStatus = "fail";
      brandNotes = `Competitor brands detected: ${competitorMentions.join(", ")} - replace with generic category terms or ${BRAND_NAME}`;
    } else if (brandMentions > checkerConfig.checks.brand_integration.max_mentions) {
      brandStatus = "fail";
      brandNotes = `${BRAND_NAME} mentioned ${brandMentions}x - over the ${checkerConfig.checks.brand_integration.max_mentions}-mention maximum. Remove ${brandMentions - checkerConfig.checks.brand_integration.max_mentions} mention(s) to avoid sounding promotional.`;
    } else if (checkerConfig.checks.brand_integration.disallow_in_faq && brandInFaq > 0) {
      brandStatus = "fail";
      brandNotes = `${BRAND_NAME} found ${brandInFaq}x in FAQ section - FAQ answers must be brand-neutral for snippet eligibility. Move brand mentions to body sections.`;
    } else if (
      brandMentions >= checkerConfig.checks.brand_integration.min_mentions &&
      (!checkerConfig.checks.brand_integration.require_conclusion_cta || hasConclusionCta)
    ) {
      brandStatus = "pass";
      brandNotes = `${BRAND_NAME} mentioned ${brandMentions}x (max ${checkerConfig.checks.brand_integration.max_mentions}), products: ${productMentions.join(", ") || "none"}${checkerConfig.checks.brand_integration.require_conclusion_cta ? ", CTA in conclusion" : ""}`;
    } else if (brandMentions >= checkerConfig.checks.brand_integration.min_mentions) {
      brandStatus = "warn";
      brandNotes = `${BRAND_NAME} mentioned ${brandMentions}x but NOT in conclusion - add soft CTA`;
    }
    checks.push({
      check: seoCheckerCheckLabels.brand_integration,
      status: brandStatus,
      notes: brandNotes,
    });
  }

  // -----------------------------------------------------------------------
  // 18. FAQ answers front-loaded
  // -----------------------------------------------------------------------
  const faqAnswers = faqEntries;
  const weakFaqStarts: string[] = [];
  faqAnswers.forEach((answer, index) => {
    const answerStart = answer.trim().slice(0, 50).toLowerCase();
    const weakPatterns = [
      /^(well|so|basically|actually|honestly|in order to|it depends|that's a)/,
      /^(the answer is|to answer this|this is a|there are many|great question)/,
    ];
    if (weakPatterns.some((pattern) => pattern.test(answerStart))) {
      weakFaqStarts.push(`Q${index + 1}`);
    }
  });
  if (checkerConfig.checks.faq_answers_front_loaded.enabled) {
    checks.push({
      check: seoCheckerCheckLabels.faq_answers_front_loaded,
      status: !faqSection ? "warn" : !faqAnswers.length ? "warn" : weakFaqStarts.length ? "warn" : "pass",
      notes: !faqSection
        ? "No FAQ section to validate answer quality"
        : !faqAnswers.length
          ? "No FAQ answers found to validate"
          : weakFaqStarts.length
            ? `FAQ answers with weak openings: ${weakFaqStarts.join(", ")}`
            : `${faqAnswers.length} FAQ answer(s) start with direct, front-loaded phrasing`,
    });
  }

  // -----------------------------------------------------------------------
  // Done
  // -----------------------------------------------------------------------
  return {
    passCount: checks.filter((c) => c.status === "pass").length,
    warnCount: checks.filter((c) => c.status === "warn").length,
    failCount: checks.filter((c) => c.status === "fail").length,
    totalWordCount,
    sectionCounts,
    checks: orderSeoChecks(checks, checkerConfig),
    internalLinks: matchingInternalLinks,
    authorityLinks: authoritativeExternalLinks,
  };
}

// ---------------------------------------------------------------------------
// Formatter — produces the markdown that gets fed to the draft fixer
// ---------------------------------------------------------------------------

export function formatSeoChecklistFailures(result: SeoCheckerResult) {
  const failingChecks = result.checks
    .map((check, index) => ({ ...check, index: index + 1 }))
    .filter((check) => check.status === "fail" || check.status === "warn");

  const lines = [
    "# SEO Checker Results",
    "",
    `- Summary: ${result.failCount} FAIL / ${result.warnCount} WARN / ${result.passCount} PASS`,
    `- Draft word count: ${result.totalWordCount}`,
  ];

  if (!failingChecks.length) {
    lines.push("");
    lines.push("## Issues");
    lines.push("");
    lines.push("- No failing checklist items.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");
  for (const check of failingChecks) {
    lines.push(`### ${check.status.toUpperCase()} ${check.index}. ${check.check}`);
    lines.push("");
    const noteItems = check.notes
      .split(/;\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (noteItems.length > 1) {
      for (const noteItem of noteItems) {
        lines.push(`- ${noteItem}`);
      }
    } else {
      lines.push(`- ${check.notes}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
