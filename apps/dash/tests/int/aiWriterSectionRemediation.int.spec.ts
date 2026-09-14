import { describe, expect, it } from 'vitest'

import {
  extractBriefOutline,
  extractMissingDifferentiatorItems,
  extractMissingGapItems,
  extractMissingSectionBudgetItems,
  insertDifferentiatorPatchesIntoArticleMarkdown,
  insertGapPatchesIntoArticleMarkdown,
  insertMissingSectionsIntoArticleMarkdown,
} from '@/lib/aiWriter/sectionRemediation'

describe('ai writer missing section remediation helpers', () => {
  it('extracts missing section budget items from checker notes', () => {
    expect(
      extractMissingSectionBudgetItems(
        [
          'Feature-by-Feature Comparison: 494/100 (+394.0%)',
          'Parsing and Selectors: missing section (budget: 100)',
          'Speed and Concurrency: missing section (budget: 100)',
          'Data Export and Pipelines: missing section (budget: 100)',
        ].join('; '),
      ),
    ).toEqual([
      {
        notes: 'Parsing and Selectors: missing section (budget: 100)',
        targetWords: 100,
        title: 'Parsing and Selectors',
      },
      {
        notes: 'Speed and Concurrency: missing section (budget: 100)',
        targetWords: 100,
        title: 'Speed and Concurrency',
      },
      {
        notes: 'Data Export and Pipelines: missing section (budget: 100)',
        targetWords: 100,
        title: 'Data Export and Pipelines',
      },
    ])
  })

  it('inserts generated missing sections in finalized brief outline order', () => {
    const outline = extractBriefOutline(
      JSON.stringify({
        SeoBrief: {
          recommended_outline: [
            {
              heading: 'Feature-by-Feature Comparison',
              level: 2,
              word_budget: 100,
            },
            {
              heading: 'Parsing and Selectors',
              level: 3,
              word_budget: 100,
            },
            {
              heading: 'Speed and Concurrency',
              level: 3,
              word_budget: 100,
            },
            {
              heading: 'Data Export and Pipelines',
              level: 3,
              word_budget: 100,
            },
            {
              heading: 'Handling JavaScript-Rendered Pages',
              level: 2,
              word_budget: 130,
            },
          ],
        },
      }),
    )
    const articleMarkdown = [
      '# Scrapy vs Beautiful Soup',
      '',
      'Intro copy.',
      '',
      '## Feature-by-Feature Comparison',
      '',
      'Existing comparison table.',
      '',
      '## Handling JavaScript-Rendered Pages',
      '',
      'Existing JS section.',
    ].join('\n')

    const patched = insertMissingSectionsIntoArticleMarkdown({
      articleMarkdown,
      generatedSections: [
        {
          markdown: '## Data Export and Pipelines\n\nScrapy ships feed exports and pipelines, while Beautiful Soup relies on Python helpers.',
          title: 'Data Export and Pipelines',
        },
        {
          markdown: 'Scrapy and Beautiful Soup both support CSS-style selection, but Scrapy also exposes XPath through Parsel.',
          title: 'Parsing and Selectors',
        },
        {
          markdown: 'Scrapy is built for concurrent crawls, while Beautiful Soup is best used after a page has already been fetched.',
          title: 'Speed and Concurrency',
        },
      ],
      outline,
    })

    expect(patched).toContain('## Parsing and Selectors\n\nScrapy and Beautiful Soup both support CSS-style selection')
    expect(patched).toContain('## Data Export and Pipelines\n\nScrapy ships feed exports')
    expect(patched.indexOf('## Feature-by-Feature Comparison')).toBeLessThan(patched.indexOf('## Parsing and Selectors'))
    expect(patched.indexOf('## Parsing and Selectors')).toBeLessThan(patched.indexOf('## Speed and Concurrency'))
    expect(patched.indexOf('## Speed and Concurrency')).toBeLessThan(patched.indexOf('## Data Export and Pipelines'))
    expect(patched.indexOf('## Data Export and Pipelines')).toBeLessThan(patched.indexOf('## Handling JavaScript-Rendered Pages'))
  })

  it('extracts missing differentiator items from checker notes', () => {
    expect(
      extractMissingDifferentiatorItems(
        '4/5 present. Missing: Position email intelligence as an early, low-friction gate within a broader defense system rather than as a standalone cure.',
      ),
    ).toEqual([
      {
        text: 'Position email intelligence as an early, low-friction gate within a broader defense system rather than as a standalone cure.',
      },
    ])
  })

  it('extracts missing gap items from checker notes', () => {
    expect(
      extractMissingGapItems(
        '6/7 addressed. Missing: Specific guidance for SaaS free-trial abuse and newsletter or waitlist sign-ups, which competitors largely ignore in favor of social or financial platforms.',
      ),
    ).toEqual([
      {
        text: 'Specific guidance for SaaS free-trial abuse and newsletter or waitlist sign-ups, which competitors largely ignore in favor of social or financial platforms.',
      },
    ])
  })

  it('inserts differentiator patches into an existing article section without rewriting the article', () => {
    const articleMarkdown = [
      '# Disposable Email Detection',
      '',
      'Intro copy.',
      '',
      '## Why Email Intelligence Matters',
      '',
      'Existing email intelligence copy.',
      '',
      '## Conclusion',
      '',
      'Existing conclusion.',
    ].join('\n')

    const patched = insertDifferentiatorPatchesIntoArticleMarkdown({
      articleMarkdown,
      patches: [
        {
          insertionHeading: 'Why Email Intelligence Matters',
          markdown: 'Email intelligence works best as an early, low-friction gate in a broader abuse defense system. It can stop obvious disposable or risky signups before accounts are created, while leaving room for IP reputation, device signals, rate limits, and step-up challenges to handle more ambiguous cases.',
        },
      ],
    })

    expect(patched).toContain('Existing email intelligence copy.')
    expect(patched).toContain('Email intelligence works best as an early, low-friction gate')
    expect(patched.indexOf('Email intelligence works best')).toBeLessThan(patched.indexOf('## Conclusion'))
    expect(patched).not.toContain('## Email intelligence works best')
  })

  it('inserts gap patches into an existing article section without rewriting the article', () => {
    const articleMarkdown = [
      '# Fake Signup Prevention',
      '',
      'Intro copy.',
      '',
      '## Signup Flow Controls',
      '',
      'Existing signup controls copy.',
      '',
      '## Conclusion',
      '',
      'Existing conclusion.',
    ].join('\n')

    const patched = insertGapPatchesIntoArticleMarkdown({
      articleMarkdown,
      patches: [
        {
          insertionHeading: 'Signup Flow Controls',
          markdown: 'For SaaS free-trial, newsletter, and waitlist sign-ups, the useful default is a light gate before account, credit, or list access is created. Check the email domain, IP, and user agent at submission time, then allow normal users, challenge uncertain sign-ups, and block clear disposable or automated attempts.',
        },
      ],
    })

    expect(patched).toContain('Existing signup controls copy.')
    expect(patched).toContain('For SaaS free-trial, newsletter, and waitlist sign-ups')
    expect(patched.indexOf('For SaaS free-trial')).toBeLessThan(patched.indexOf('## Conclusion'))
    expect(patched).not.toContain('## For SaaS free-trial')
  })
})
