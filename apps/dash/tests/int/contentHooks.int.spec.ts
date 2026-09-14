import { describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/richtext-lexical/html-async', () => ({
  convertLexicalToHTMLAsync: vi.fn(),
}))

const { convertLexicalToHTMLAsync } = await import('@payloadcms/richtext-lexical/html-async')
const { hydrateRichTextFromHtml, setHtmlFromRichText } = await import('@/lib/contentHooks')

function createLexicalValue() {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text: 'example',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

describe('setHtmlFromRichText', () => {
  it('preserves imported html when lexical regeneration drops legacy pre blocks and inline images', async () => {
    vi.mocked(convertLexicalToHTMLAsync).mockResolvedValueOnce(
      '<p><code>node -v</code></p><p><code>npm -v</code></p>',
    )

    const sourceHtml = [
      '<p>Intro</p>',
      '<pre><code>node -v\nnpm -v</code></pre>',
      '<img src="https://example.com/inline.png" alt="inline image" />',
    ].join('')

    const result = await setHtmlFromRichText('body')({
      siblingData: {
        body: createLexicalValue(),
      },
      value: sourceHtml,
    } as never)

    expect(result).toBe(sourceHtml)
  })

  it('uses regenerated html when it does not lose preserved legacy structures', async () => {
    const generatedHtml = '<p>Intro</p><pre><code>node -v</code></pre><img src="https://example.com/inline.png" alt="inline image" />'
    vi.mocked(convertLexicalToHTMLAsync).mockResolvedValueOnce(generatedHtml)

    const result = await setHtmlFromRichText('body')({
      siblingData: {
        body: createLexicalValue(),
      },
      value: '<p>Old</p>',
    } as never)

    expect(result).toBe(generatedHtml)
  })
})

describe('hydrateRichTextFromHtml', () => {
  it('rehydrates stored lexical state from legacy html when pre/code blocks are missing', async () => {
    const legacyHtml = [
      '<p>Example</p>',
      '<pre><code class="language-html">&lt;!doctype html&gt;\n&lt;html&gt;\n  &lt;body&gt;Hello&lt;/body&gt;\n&lt;/html&gt;</code></pre>',
    ].join('')

    const result = await hydrateRichTextFromHtml('bodyHtml')({
      siblingData: {
        bodyHtml: legacyHtml,
      },
      value: createLexicalValue(),
    } as never)

    const codeBlock = (result as { root: { children: Array<{ type?: string; fields?: { blockType?: string; code?: string } }> } }).root
      .children[1]

    expect(codeBlock?.type).toBe('block')
    expect(codeBlock?.fields?.blockType).toBe('Code')
    expect(codeBlock?.fields?.code).toContain('<!doctype html>')
  })

  it('rehydrates stored lexical state from legacy multiline code paragraphs when code blocks are missing', async () => {
    const legacyHtml = [
      '<p>Example</p>',
      '<p>&lt;!doctype html&gt;<br /><br />&lt;html&gt;<br /><br />  &lt;body&gt;Hello&lt;/body&gt;<br /><br />&lt;/html&gt;</p>',
    ].join('')

    const result = await hydrateRichTextFromHtml('bodyHtml')({
      siblingData: {
        bodyHtml: legacyHtml,
      },
      value: createLexicalValue(),
    } as never)

    const codeBlock = (result as { root: { children: Array<{ type?: string; fields?: { blockType?: string; code?: string } }> } }).root
      .children[1]

    expect(codeBlock?.type).toBe('block')
    expect(codeBlock?.fields?.blockType).toBe('Code')
    expect(codeBlock?.fields?.code).toContain('<!doctype html>')
  })
})
