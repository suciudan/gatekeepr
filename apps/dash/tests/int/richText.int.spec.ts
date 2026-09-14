import { describe, expect, it } from 'vitest'
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'

import {
  countCodeBlocksInLexicalState,
  convertMarkdownToLexicalState,
  convertLegacyHtmlToLexicalState,
  createEmptyLexicalState,
  ensureLexicalState,
  normalizeCodeBlockLanguage,
  wordPressLikeHTMLConvertersAsync,
} from '@/lib/richText'

describe('rich text helpers', () => {
  it('creates a valid non-empty default lexical state', () => {
    const state = createEmptyLexicalState()

    expect(state.root.children).toHaveLength(1)
    expect(state.root.children[0]?.type).toBe('paragraph')
  })

  it('repairs an empty lexical root state', () => {
    const state = ensureLexicalState({
      root: {
        children: [],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    expect(state.root.children).toHaveLength(1)
    expect(state.root.children[0]?.type).toBe('paragraph')
  })

  it('hydrates legacy html into a non-empty lexical state', async () => {
    const state = await convertLegacyHtmlToLexicalState('<p>Hello world</p>')

    expect(state?.root.children.length).toBeGreaterThan(0)
  })

  it('hydrates legacy pre/code html into code block nodes', async () => {
    const state = await convertLegacyHtmlToLexicalState([
      '<p>Example</p>',
      '<pre><code class="language-html">&lt;!doctype html&gt;\n&lt;html&gt;\n  &lt;body&gt;Hello&lt;/body&gt;\n&lt;/html&gt;</code></pre>',
    ].join(''))

    expect(state).not.toBeNull()
    expect(countCodeBlocksInLexicalState(state!)).toBe(1)

    const codeBlock = state!.root.children[1] as {
      fields?: {
        blockType?: string
        code?: string
        language?: string
      }
      type?: string
    }

    expect(codeBlock.type).toBe('block')
    expect(codeBlock.fields?.blockType).toBe('Code')
    expect(codeBlock.fields?.language).toBe('html')
    expect(codeBlock.fields?.code).toContain('<!doctype html>')
    expect(codeBlock.fields?.code).toContain('<body>Hello</body>')
  })

  it('hydrates legacy multiline code paragraphs into code block nodes', async () => {
    const state = await convertLegacyHtmlToLexicalState([
      '<p>Example</p>',
      '<p>&lt;!doctype html&gt;<br /><br />&lt;html&gt;<br /><br />  &lt;body&gt;Hello&lt;/body&gt;<br /><br />&lt;/html&gt;</p>',
    ].join(''))

    expect(state).not.toBeNull()
    expect(countCodeBlocksInLexicalState(state!)).toBe(1)

    const codeBlock = state!.root.children[1] as {
      fields?: {
        blockType?: string
        code?: string
      }
      type?: string
    }

    expect(codeBlock.type).toBe('block')
    expect(codeBlock.fields?.blockType).toBe('Code')
    expect(codeBlock.fields?.code).toContain('<!doctype html>')
    expect(codeBlock.fields?.code).toContain('<body>Hello</body>')
  })

  it('hydrates markdown tables and fenced code blocks into lexical nodes', async () => {
    const state = await convertMarkdownToLexicalState([
      '| Name | Value |',
      '| --- | --- |',
      '| Foo | Bar |',
      '',
      '```js',
      'const answer = 42;',
      '```',
    ].join('\n'))

    expect(state?.root.children.some((node) => node?.type === 'table')).toBe(true)
    expect(state?.root.children.some((node) => node?.type === 'block')).toBe(true)
  })

  it('normalizes code fence language aliases to Payload code block options', async () => {
    const state = await convertMarkdownToLexicalState([
      '```js',
      'const answer = 42;',
      '```',
      '',
      '```bash',
      'curl https://example.com',
      '```',
      '',
      '```json',
      '{"ok": true}',
      '```',
    ].join('\n'))
    const codeBlocks = state!.root.children.filter((node) => node?.type === 'block') as Array<{
      fields?: {
        language?: string
      }
    }>

    expect(codeBlocks.map((node) => node.fields?.language)).toEqual(['javascript', 'shell', 'plaintext'])
  })

  it('repairs invalid code block languages in existing lexical states', () => {
    const existingState = {
      root: {
        children: [
          {
            type: 'block',
            version: 2,
            format: '',
            fields: {
              blockType: 'Code',
              code: 'curl https://example.com',
              language: 'bash',
            },
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }
    const state = ensureLexicalState(existingState as never)
    const codeBlock = state.root.children[0] as {
      fields?: {
        language?: string
      }
    }

    expect(codeBlock.fields?.language).toBe('shell')
  })

  it('falls back unsupported code block languages to plaintext', () => {
    expect(normalizeCodeBlockLanguage('language-json')).toBe('plaintext')
  })

  it('serializes code block nodes back to pre/code html', async () => {
    const state = await convertMarkdownToLexicalState([
      '```ts',
      'const answer = 42 < 100',
      '```',
    ].join('\n'))

    const html = await convertLexicalToHTMLAsync({
      converters: wordPressLikeHTMLConvertersAsync,
      data: state!,
      disableContainer: true,
    })

    expect(html).toContain('<pre><code class="language-typescript">')
    expect(html).toContain('const answer = 42 &lt; 100')
    expect(html).toContain('</code></pre>')
  })
})
