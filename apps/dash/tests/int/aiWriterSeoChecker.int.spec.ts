import { describe, expect, it } from 'vitest'

import { runSeoChecklist } from '@/lib/aiWriter/agentic/checkers/seo-checker'
import { defaultSeoCheckerConfigJson } from '@/lib/aiWriter/agentic/seo-checker-settings'

function makeBrief(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    SeoBrief: {
      target_keyword: 'How to Scrape Expedia',
      title_ideas: ['How to Scrape Expedia'],
      secondary_keywords: [],
      differentiators: [],
      gaps_to_fill: [],
      internal_links: [],
      recommended_outline: [
        { heading: 'Frequently Asked Questions About How to Scrape Expedia', level: 'H2', word_budget: 120 },
      ],
      target_word_count: 200,
      section_word_budget_total: 120,
      meta_descriptions: ['x'.repeat(155)],
      faq_questions: ['Is it legal to scrape Expedia?', 'What programming language is best?'],
      ...overrides,
    },
  })
}

describe('ai writer seo checker', () => {
  it('detects FAQ entries written with Q/A formatting', () => {
    const result = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\n## Frequently Asked Questions About How to Scrape Expedia\n\n**Q:** Is it legal to scrape Expedia?\n**A:** It depends on jurisdiction and the site's terms, so review both before you automate collection.\n\n**Q:** What programming language is best?\n**A:** Python is a strong default because its scraping ecosystem is broad and mature.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const faqPresence = result.checks.find((check) => check.check === 'FAQ section present (2-5 Q&As)')
    const faqFrontLoaded = result.checks.find((check) => check.check === 'FAQ answers front-loaded')

    expect(faqPresence?.status).toBe('pass')
    expect(faqPresence?.notes).toContain('2 Q&A(s)')
    expect(faqFrontLoaded?.status).toBe('warn')
    expect(faqFrontLoaded?.notes).toContain('Q1')
  })

  it('detects FAQ entries when the full question is bolded on the Q line', () => {
    const result = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\n## Frequently Asked Questions About How to Scrape Expedia\n\n**Q: Is it legal to scrape Expedia?**\n**A:** It depends on jurisdiction and the site's terms, so review both before you automate collection.\n\n**Q: What programming language is best?**\n**A:** Python is a strong default because its scraping ecosystem is broad and mature.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const faqPresence = result.checks.find((check) => check.check === 'FAQ section present (2-5 Q&As)')

    expect(faqPresence?.status).toBe('pass')
    expect(faqPresence?.notes).toContain('2 Q&A(s)')
  })

  it('detects FAQ entries under a short FAQ heading', () => {
    const result = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\n## FAQ\n\n### Is it legal to scrape Expedia?\nYes. Review the site's terms and applicable laws before you automate collection.\n\n### What programming language is best?\nPython is a strong default because its scraping ecosystem is broad and mature.\n`,
      makeBrief({ recommended_outline: [{ heading: 'FAQ', level: 'H2', word_budget: 120 }] }),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const faqPresence = result.checks.find((check) => check.check === 'FAQ section present (2-5 Q&As)')
    const faqFrontLoaded = result.checks.find((check) => check.check === 'FAQ answers front-loaded')

    expect(faqPresence?.status).toBe('pass')
    expect(faqFrontLoaded?.status).toBe('pass')
  })

  it('uses the stored article title when markdown H1 is intentionally omitted', () => {
    const result = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
      { fallbackTitle: 'How to Scrape Expedia' },
    )

    const singleH1 = result.checks.find((check) => check.check === 'Single H1')
    const keywordInH1 = result.checks.find((check) => check.check === 'Keyword in H1')

    expect(singleH1?.status).toBe('pass')
    expect(singleH1?.notes).toContain('stored article title')
    expect(keywordInH1?.status).toBe('pass')
  })

  it('fails when no authoritative external markdown links are present and passes when one exists', () => {
    const withoutExternalLink = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nSee our [disposable email checker](https://gatekeepr.io/disposable-email-checker) for internal context.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
    )
    const withExternalLink = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nReview [Expedia's robots.txt](https://www.expedia.com/robots.txt) before you automate collection.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const missingExternal = withoutExternalLink.checks.find(
      (check) => check.check === 'Authoritative external links present',
    )
    const presentExternal = withExternalLink.checks.find(
      (check) => check.check === 'Authoritative external links present',
    )

    expect(missingExternal?.status).toBe('fail')
    expect(missingExternal?.notes).toContain('Raw URLs and site-owned links do not count')
    expect(presentExternal?.status).toBe('pass')
    expect(presentExternal?.notes).toContain('expedia.com')
  })

  it('requires at least three selected site-owned internal markdown links when internal-link candidates exist', () => {
    const internalLinks = [
      'Disposable Email Checker (https://gatekeepr.io/disposable-email-checker)',
      'Disposable Email Data (https://gatekeepr.io/disposable-email-data)',
      'Signup Protection Guide (https://gatekeepr.io/blog/signup-protection-guide)',
    ]

    const withoutInternalLinks = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nReview [Expedia's robots.txt](https://www.expedia.com/robots.txt) before you automate collection.\n`,
      makeBrief({
        internal_links: internalLinks,
      }),
      JSON.parse(defaultSeoCheckerConfigJson),
    )
    const withOnlyTwoInternalLinksDraft = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nSee our [disposable email checker](https://gatekeepr.io/disposable-email-checker) for internal context.\n\nCompare results with the [disposable email data](https://gatekeepr.io/disposable-email-data) when you need search result data.\n`,
      makeBrief({
        internal_links: internalLinks,
      }),
      JSON.parse(defaultSeoCheckerConfigJson),
    )
    const withThreeInternalLinks = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nSee our [disposable email checker](https://gatekeepr.io/disposable-email-checker) for internal context.\n\nCompare results with the [disposable email data](https://gatekeepr.io/disposable-email-data) when you need search result data.\n\nIf you want a setup walkthrough, start with the [signup protection guide](https://gatekeepr.io/blog/signup-protection-guide).\n`,
      makeBrief({
        internal_links: internalLinks,
      }),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const missingInternal = withoutInternalLinks.checks.find(
      (check) => check.check === 'Internal links present',
    )
    const underMinimumInternal = withOnlyTwoInternalLinksDraft.checks.find(
      (check) => check.check === 'Internal links present',
    )
    const presentInternal = withThreeInternalLinks.checks.find(
      (check) => check.check === 'Internal links present',
    )

    expect(missingInternal?.status).toBe('fail')
    expect(underMinimumInternal?.status).toBe('fail')
    expect(underMinimumInternal?.notes).toContain('Add at least 3 site-owned markdown links')
    expect(presentInternal?.status).toBe('pass')
  })

  it('does not count competitor markdown links as authoritative external links', () => {
    const competitorOnly = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nCompare [Castle](https://castle.io/), [Fingerprint](https://fingerprint.com/), and [Sift](https://sift.com/) if you want alternative tools.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
    )

    const externalLinkCheck = competitorOnly.checks.find(
      (check) => check.check === 'Authoritative external links present',
    )

    expect(externalLinkCheck?.status).toBe('fail')
    expect(externalLinkCheck?.notes).toContain('Raw URLs and site-owned links do not count')
  })

  it('does not count original-source hostnames as authoritative external links', () => {
    const sourceOnly = runSeoChecklist(
      `<!-- Meta: ${'x'.repeat(155)} -->\n\n# How to Scrape Expedia\n\nHow to Scrape Expedia is a practical workflow. How to Scrape Expedia helps teams collect travel data. How to Scrape Expedia requires JavaScript rendering. How to Scrape Expedia also needs retries. How to Scrape Expedia benefits from structured extraction. How to Scrape Expedia works best with testing. How to Scrape Expedia needs selector monitoring. How to Scrape Expedia can support dashboards. How to Scrape Expedia often uses Python. How to Scrape Expedia should include FAQs.\n\nSee the [ScraperAPI guide](https://www.scraperapi.com/web-scraping/yelp/) for another walkthrough.\n`,
      makeBrief(),
      JSON.parse(defaultSeoCheckerConfigJson),
      { disallowedExternalHostnames: ['scraperapi.com'] },
    )

    const externalLinkCheck = sourceOnly.checks.find(
      (check) => check.check === 'Authoritative external links present',
    )

    expect(externalLinkCheck?.status).toBe('fail')
    expect(externalLinkCheck?.notes).toContain('Source/competitor links also do not count')
  })
})
