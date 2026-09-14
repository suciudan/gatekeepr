import { safeJsonParse } from "./utils";

export const defaultSectionBudgetTolerancePercent = 15;

export function formatSectionBudgetCheckLabel(tolerancePercent: number) {
  const normalizedTolerance =
    Number.isFinite(tolerancePercent) && tolerancePercent > 0
      ? Number(tolerancePercent)
      : defaultSectionBudgetTolerancePercent;

  return `Section budgets within +/-${normalizedTolerance}%`;
}

export function isSectionBudgetCheckLabel(value: string) {
  return /^Section budgets within \+\/-\d+(?:\.\d+)?%$/i.test(value.trim());
}

export function extractSectionBudgetToleranceFromCheckLabel(value: string) {
  const match = value.trim().match(/^Section budgets within \+\/-(\d+(?:\.\d+)?)%$/i);

  if (!match) {
    return null;
  }

  const tolerancePercent = Number(match[1]);
  return Number.isFinite(tolerancePercent) && tolerancePercent > 0
    ? tolerancePercent
    : null;
}

export const seoCheckerCheckLabels = {
  single_h1: "Single H1",
  keyword_in_h1: "Keyword in H1",
  keyword_in_first_100_words: "Keyword in first 100 words",
  keyword_in_h2: "Keyword in at least one H2",
  keyword_density: "Keyword density",
  secondary_keywords: "Secondary keywords used",
  snippet_friendly_block: "Snippet-friendly block",
  internal_links_present: "Internal links present",
  external_authoritative_links: "Authoritative external links present",
  faq_section_present: "FAQ section present (2-5 Q&As)",
  word_count_within_range: "Word count within range",
  section_budgets: formatSectionBudgetCheckLabel(defaultSectionBudgetTolerancePercent),
  gaps_addressed: "Gaps addressed",
  differentiators_included: "Differentiators included",
  meta_description: "Meta description 150-160 chars",
  tldr_present: "TL;DR present",
  key_takeaways_present: "Key Takeaways present",
  brand_integration: "Brand integration",
  faq_answers_front_loaded: "FAQ answers front-loaded",
} as const;

export type SeoCheckerCheckId = keyof typeof seoCheckerCheckLabels;

type SeoCheckerRuleBase = {
  enabled: boolean;
};

export type SeoCheckerRuntimeConfig = {
  result_order: SeoCheckerCheckId[];
  checks: {
    single_h1: SeoCheckerRuleBase;
    keyword_in_h1: SeoCheckerRuleBase;
    keyword_in_first_100_words: SeoCheckerRuleBase;
    keyword_in_h2: SeoCheckerRuleBase;
    keyword_density: SeoCheckerRuleBase & {
      minimum_mentions: number;
      warn_above_percent: number;
    };
    secondary_keywords: SeoCheckerRuleBase & {
      minimum_ratio: number;
      minimum_absolute: number;
    };
    snippet_friendly_block: SeoCheckerRuleBase;
    internal_links_present: SeoCheckerRuleBase & {
      minimum_count: number;
    };
    external_authoritative_links: SeoCheckerRuleBase & {
      minimum_count: number;
    };
    faq_section_present: SeoCheckerRuleBase & {
      min_qas: number;
      max_qas: number;
    };
    word_count_within_range: SeoCheckerRuleBase & {
      pass_tolerance_percent: number;
      warn_tolerance_percent: number;
    };
    section_budgets: SeoCheckerRuleBase & {
      tolerance_percent: number;
    };
    gaps_addressed: SeoCheckerRuleBase;
    differentiators_included: SeoCheckerRuleBase;
    meta_description: SeoCheckerRuleBase & {
      min_chars: number;
      max_chars: number;
    };
    tldr_present: SeoCheckerRuleBase;
    key_takeaways_present: SeoCheckerRuleBase;
    brand_integration: SeoCheckerRuleBase & {
      min_mentions: number;
      max_mentions: number;
      require_conclusion_cta: boolean;
      disallow_in_faq: boolean;
    };
    faq_answers_front_loaded: SeoCheckerRuleBase;
  };
};

const defaultSeoCheckerConfigObject = {
  result_order: [
    "single_h1",
    "keyword_in_h1",
    "keyword_in_first_100_words",
    "keyword_in_h2",
    "keyword_density",
    "secondary_keywords",
    "snippet_friendly_block",
    "internal_links_present",
    "external_authoritative_links",
    "faq_section_present",
    "word_count_within_range",
    "section_budgets",
    "gaps_addressed",
    "differentiators_included",
    "meta_description",
    "tldr_present",
    "key_takeaways_present",
    "brand_integration",
    "faq_answers_front_loaded",
  ],
  checks: {
    single_h1: { enabled: true },
    keyword_in_h1: { enabled: true },
    keyword_in_first_100_words: { enabled: true },
    keyword_in_h2: { enabled: true },
    keyword_density: {
      enabled: true,
      minimum_mentions: 10,
      warn_above_percent: 3,
    },
    secondary_keywords: {
      enabled: true,
      minimum_ratio: 0.5,
      minimum_absolute: 1,
    },
    snippet_friendly_block: { enabled: true },
    internal_links_present: {
      enabled: true,
      minimum_count: 3,
    },
    external_authoritative_links: {
      enabled: true,
      minimum_count: 1,
    },
    faq_section_present: {
      enabled: true,
      min_qas: 2,
      max_qas: 5,
    },
    word_count_within_range: {
      enabled: true,
      pass_tolerance_percent: 10,
      warn_tolerance_percent: 15,
    },
    section_budgets: {
      enabled: true,
      tolerance_percent: defaultSectionBudgetTolerancePercent,
    },
    gaps_addressed: { enabled: true },
    differentiators_included: { enabled: true },
    meta_description: {
      enabled: true,
      min_chars: 150,
      max_chars: 160,
    },
    tldr_present: { enabled: true },
    key_takeaways_present: { enabled: true },
    brand_integration: {
      enabled: true,
      min_mentions: 1,
      max_mentions: 3,
      require_conclusion_cta: true,
      disallow_in_faq: true,
    },
    faq_answers_front_loaded: { enabled: true },
  },
} satisfies SeoCheckerRuntimeConfig;

export const defaultSeoCheckerConfigJson = JSON.stringify(
  defaultSeoCheckerConfigObject,
  null,
  2,
);

function clampNumber(value: unknown, fallback: number, min: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCheckConfig(
  parsedChecks: Record<string, unknown> | null,
): SeoCheckerRuntimeConfig["checks"] {
  const checks = parsedChecks ?? {};
  const defaults = defaultSeoCheckerConfigObject.checks;

  return {
    single_h1: {
      enabled: asBoolean((checks.single_h1 as Record<string, unknown> | undefined)?.enabled, defaults.single_h1.enabled),
    },
    keyword_in_h1: {
      enabled: asBoolean((checks.keyword_in_h1 as Record<string, unknown> | undefined)?.enabled, defaults.keyword_in_h1.enabled),
    },
    keyword_in_first_100_words: {
      enabled: asBoolean(
        (checks.keyword_in_first_100_words as Record<string, unknown> | undefined)?.enabled,
        defaults.keyword_in_first_100_words.enabled,
      ),
    },
    keyword_in_h2: {
      enabled: asBoolean((checks.keyword_in_h2 as Record<string, unknown> | undefined)?.enabled, defaults.keyword_in_h2.enabled),
    },
    keyword_density: {
      enabled: asBoolean((checks.keyword_density as Record<string, unknown> | undefined)?.enabled, defaults.keyword_density.enabled),
      minimum_mentions: clampNumber(
        (checks.keyword_density as Record<string, unknown> | undefined)?.minimum_mentions,
        defaults.keyword_density.minimum_mentions,
        0,
      ),
      warn_above_percent: clampNumber(
        (checks.keyword_density as Record<string, unknown> | undefined)?.warn_above_percent,
        defaults.keyword_density.warn_above_percent,
        0,
      ),
    },
    secondary_keywords: {
      enabled: asBoolean(
        (checks.secondary_keywords as Record<string, unknown> | undefined)?.enabled,
        defaults.secondary_keywords.enabled,
      ),
      minimum_ratio: clampNumber(
        (checks.secondary_keywords as Record<string, unknown> | undefined)?.minimum_ratio,
        defaults.secondary_keywords.minimum_ratio,
        0,
      ),
      minimum_absolute: clampNumber(
        (checks.secondary_keywords as Record<string, unknown> | undefined)?.minimum_absolute,
        defaults.secondary_keywords.minimum_absolute,
        0,
      ),
    },
    snippet_friendly_block: {
      enabled: asBoolean(
        (checks.snippet_friendly_block as Record<string, unknown> | undefined)?.enabled,
        defaults.snippet_friendly_block.enabled,
      ),
    },
    internal_links_present: {
      enabled: asBoolean(
        (checks.internal_links_present as Record<string, unknown> | undefined)?.enabled,
        defaults.internal_links_present.enabled,
      ),
      minimum_count: clampNumber(
        (checks.internal_links_present as Record<string, unknown> | undefined)?.minimum_count,
        defaults.internal_links_present.minimum_count,
        0,
      ),
    },
    external_authoritative_links: {
      enabled: asBoolean(
        (checks.external_authoritative_links as Record<string, unknown> | undefined)?.enabled,
        defaults.external_authoritative_links.enabled,
      ),
      minimum_count: clampNumber(
        (checks.external_authoritative_links as Record<string, unknown> | undefined)?.minimum_count,
        defaults.external_authoritative_links.minimum_count,
        0,
      ),
    },
    faq_section_present: {
      enabled: asBoolean(
        (checks.faq_section_present as Record<string, unknown> | undefined)?.enabled,
        defaults.faq_section_present.enabled,
      ),
      min_qas: clampNumber(
        (checks.faq_section_present as Record<string, unknown> | undefined)?.min_qas,
        defaults.faq_section_present.min_qas,
        0,
      ),
      max_qas: clampNumber(
        (checks.faq_section_present as Record<string, unknown> | undefined)?.max_qas,
        defaults.faq_section_present.max_qas,
        0,
      ),
    },
    word_count_within_range: {
      enabled: asBoolean(
        (checks.word_count_within_range as Record<string, unknown> | undefined)?.enabled,
        defaults.word_count_within_range.enabled,
      ),
      pass_tolerance_percent: clampNumber(
        (checks.word_count_within_range as Record<string, unknown> | undefined)?.pass_tolerance_percent,
        defaults.word_count_within_range.pass_tolerance_percent,
        0,
      ),
      warn_tolerance_percent: clampNumber(
        (checks.word_count_within_range as Record<string, unknown> | undefined)?.warn_tolerance_percent,
        defaults.word_count_within_range.warn_tolerance_percent,
        0,
      ),
    },
    section_budgets: {
      enabled: asBoolean(
        (checks.section_budgets as Record<string, unknown> | undefined)?.enabled,
        defaults.section_budgets.enabled,
      ),
      tolerance_percent: clampNumber(
        (checks.section_budgets as Record<string, unknown> | undefined)?.tolerance_percent,
        defaults.section_budgets.tolerance_percent,
        0,
      ),
    },
    gaps_addressed: {
      enabled: asBoolean(
        (checks.gaps_addressed as Record<string, unknown> | undefined)?.enabled,
        defaults.gaps_addressed.enabled,
      ),
    },
    differentiators_included: {
      enabled: asBoolean(
        (checks.differentiators_included as Record<string, unknown> | undefined)?.enabled,
        defaults.differentiators_included.enabled,
      ),
    },
    meta_description: {
      enabled: asBoolean(
        (checks.meta_description as Record<string, unknown> | undefined)?.enabled,
        defaults.meta_description.enabled,
      ),
      min_chars: clampNumber(
        (checks.meta_description as Record<string, unknown> | undefined)?.min_chars,
        defaults.meta_description.min_chars,
        0,
      ),
      max_chars: clampNumber(
        (checks.meta_description as Record<string, unknown> | undefined)?.max_chars,
        defaults.meta_description.max_chars,
        0,
      ),
    },
    tldr_present: {
      enabled: asBoolean(
        (checks.tldr_present as Record<string, unknown> | undefined)?.enabled,
        defaults.tldr_present.enabled,
      ),
    },
    key_takeaways_present: {
      enabled: asBoolean(
        (checks.key_takeaways_present as Record<string, unknown> | undefined)?.enabled,
        defaults.key_takeaways_present.enabled,
      ),
    },
    brand_integration: {
      enabled: asBoolean(
        (checks.brand_integration as Record<string, unknown> | undefined)?.enabled,
        defaults.brand_integration.enabled,
      ),
      min_mentions: clampNumber(
        (checks.brand_integration as Record<string, unknown> | undefined)?.min_mentions,
        defaults.brand_integration.min_mentions,
        0,
      ),
      max_mentions: clampNumber(
        (checks.brand_integration as Record<string, unknown> | undefined)?.max_mentions,
        defaults.brand_integration.max_mentions,
        0,
      ),
      require_conclusion_cta: asBoolean(
        (checks.brand_integration as Record<string, unknown> | undefined)?.require_conclusion_cta,
        defaults.brand_integration.require_conclusion_cta,
      ),
      disallow_in_faq: asBoolean(
        (checks.brand_integration as Record<string, unknown> | undefined)?.disallow_in_faq,
        defaults.brand_integration.disallow_in_faq,
      ),
    },
    faq_answers_front_loaded: {
      enabled: asBoolean(
        (checks.faq_answers_front_loaded as Record<string, unknown> | undefined)?.enabled,
        defaults.faq_answers_front_loaded.enabled,
      ),
    },
  };
}

export function resolveSeoCheckerConfig(
  value: string | null | undefined,
): SeoCheckerRuntimeConfig {
  const parsed = safeJsonParse<unknown>(value ?? "");

  if (!isRecord(parsed)) {
    return defaultSeoCheckerConfigObject;
  }

  const parsedResultOrder = Array.isArray(parsed.result_order)
    ? parsed.result_order.filter(
        (entry): entry is SeoCheckerCheckId =>
          typeof entry === "string" && entry in seoCheckerCheckLabels,
      )
    : [];

  return {
    result_order: parsedResultOrder.length
      ? parsedResultOrder
      : defaultSeoCheckerConfigObject.result_order,
    checks: readCheckConfig(isRecord(parsed.checks) ? parsed.checks : null),
  };
}

export function orderSeoChecks<T extends { check: string }>(
  checks: T[],
  config: SeoCheckerRuntimeConfig,
) {
  const orderIndex = new Map(
    config.result_order.map((checkId, index) => [seoCheckerCheckLabels[checkId], index]),
  );

  return [...checks].sort((left, right) => {
    const leftIndex = orderIndex.get(left.check) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.check) ?? Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return 0;
  });
}
