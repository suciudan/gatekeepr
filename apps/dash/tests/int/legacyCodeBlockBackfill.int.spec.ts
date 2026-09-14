import { describe, expect, it } from 'vitest'

import {
  buildLegacyCodeBlockBackfillData,
  analyzeLegacyCodeBlockBackfill,
  selectLegacyCodeBlockBackfillSource,
} from '@/lib/legacyCodeBlockBackfill'
import { convertMarkdownToLexicalState } from '@/lib/richText'

describe('legacy code block backfill helpers', () => {
  it('detects docs whose html contains more pre blocks than lexical code blocks', () => {
    const analysis = analyzeLegacyCodeBlockBackfill({
      body: {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Example',
                  type: 'text',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      },
      bodyHtml: '<p>Example</p><pre><code>const answer = 42</code></pre>',
    })

    expect(analysis.htmlPreCount).toBe(1)
    expect(analysis.lexicalCodeBlockCount).toBe(0)
    expect(analysis.needsBackfill).toBe(true)
  })

  it('does not flag docs that already have matching lexical code blocks', async () => {
    const body = await convertMarkdownToLexicalState(['```js', 'const answer = 42', '```'].join('\n'))
    const analysis = analyzeLegacyCodeBlockBackfill({
      body,
      bodyHtml: '<pre><code class="language-js">const answer = 42</code></pre>',
    })

    expect(analysis.lexicalCodeBlockCount).toBe(1)
    expect(analysis.needsBackfill).toBe(false)
  })

  it('detects legacy multiline code paragraphs whose lexical state has no code blocks', () => {
    const analysis = analyzeLegacyCodeBlockBackfill({
      body: {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Example',
                  type: 'text',
                  version: 1,
                },
              ],
              direction: 'ltr',
              format: '',
              indent: 0,
              type: 'paragraph',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      },
      bodyHtml: '<p>&lt;!doctype html&gt;<br /><br />&lt;html&gt;<br /><br />  &lt;body&gt;Hello&lt;/body&gt;<br /><br />&lt;/html&gt;</p>',
    })

    expect(analysis.htmlPreCount).toBe(1)
    expect(analysis.lexicalCodeBlockCount).toBe(0)
    expect(analysis.needsBackfill).toBe(true)
  })

  it('builds replacement body data from legacy html when backfill is needed', async () => {
    const data = await buildLegacyCodeBlockBackfillData({
      body: null,
      bodyHtml: '<p>Example</p><pre><code class="language-html">&lt;div&gt;Hello&lt;/div&gt;</code></pre>',
    })

    expect(data).not.toBeNull()
    expect(data?.bodyHtml).toContain('<pre><code')
    expect(data?.body.root.children[1]).toMatchObject({
      fields: {
        blockType: 'Code',
        code: '<div>Hello</div>',
        language: 'html',
      },
      type: 'block',
    })
  })

  it('builds replacement body data from legacy multiline code paragraphs', async () => {
    const data = await buildLegacyCodeBlockBackfillData({
      body: null,
      bodyHtml: '<p>&lt;!doctype html&gt;<br /><br />&lt;html&gt;<br /><br />  &lt;body&gt;Hello&lt;/body&gt;<br /><br />&lt;/html&gt;</p>',
    })

    expect(data).not.toBeNull()
    expect(data?.bodyHtml).toContain('<pre><code>')
    expect(data?.body.root.children[0]).toMatchObject({
      fields: {
        blockType: 'Code',
        code: '<!doctype html>\n\n<html>\n\n  <body>Hello</body>\n\n</html>',
      },
      type: 'block',
    })
  })

  it('prefers the draft source when the latest draft is the broken one', async () => {
    const publishedBody = await convertMarkdownToLexicalState(['```txt', 'published ok', '```'].join('\n'))
    const source = selectLegacyCodeBlockBackfillSource({
      body: publishedBody,
      bodyHtml: '<pre><code>published ok</code></pre>',
      draftBody: {
        root: {
          children: [],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      },
      draftBodyHtml: '<pre><code>draft broken</code></pre>',
      draftStatus: 'draft',
      status: 'published',
    })

    expect(source?.source).toBe('draft')
    expect(source?.analysis.needsBackfill).toBe(true)
  })
})
