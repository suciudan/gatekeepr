import {
  BlocksFeature,
  CodeBlock,
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  defaultEditorLexicalConfig,
  defaultEditorFeatures,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  lexicalEditor,
  convertHTMLToLexical,
  sanitizeServerEditorConfig,
} from '@payloadcms/richtext-lexical'
import type { HTMLConvertersFunctionAsync } from '@payloadcms/richtext-lexical/html-async'
import { randomBytes } from 'node:crypto'
import type { SerializedEditorState } from 'lexical'
import { JSDOM } from 'jsdom'

function getWordPressLikeFeatures() {
  return [
    ...defaultEditorFeatures.filter(
      (feature) => !['relationship', 'toolbarInline', 'upload'].includes(feature.key),
    ),
    EXPERIMENTAL_TableFeature(),
    BlocksFeature({
      blocks: [CodeBlock()],
    }),
    FixedToolbarFeature(),
  ]
}

const legacyHtmlEditorConfigPromise = sanitizeServerEditorConfig(
  {
    features: getWordPressLikeFeatures(),
    lexical: defaultEditorLexicalConfig,
  },
  {
    collections: [],
  } as unknown as Parameters<typeof sanitizeServerEditorConfig>[1],
)

export function wordPressLikeEditor(placeholder?: string) {
  return lexicalEditor({
    admin: {
      placeholder,
    },
    features: () => getWordPressLikeFeatures(),
  })
}

export function isLexicalState(value: unknown): value is SerializedEditorState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'root' in value &&
    typeof value.root === 'object' &&
    value.root !== null
  )
}

function hasLexicalRootChildren(value: SerializedEditorState): boolean {
  return Array.isArray(value.root.children) && value.root.children.length > 0
}

type LexicalObjectNode = Record<string, unknown>

type LegacyCodeBlockPlaceholder = {
  code: string
  language: string
  marker: string
}

function createEmptyParagraphNode() {
  return {
    type: 'paragraph',
    children: [
      {
        type: 'text',
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: '',
        version: 1,
      },
    ],
    direction: 'ltr' as const,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
  }
}

export function ensureLexicalState(value: null | SerializedEditorState | undefined): SerializedEditorState {
  if (value && hasLexicalRootChildren(value)) {
    return normalizeLexicalCodeBlockLanguages(value)
  }

  return createEmptyLexicalState()
}

function extractCodeLanguage(className: string): string {
  const languageClass = className
    .split(/\s+/)
    .map((value) => value.trim())
    .find((value) => value.startsWith('language-'))

  return normalizeCodeBlockLanguage(languageClass ? languageClass.replace(/^language-/, '') : '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function readDefaultCodeBlockLanguageValues() {
  const codeBlock = CodeBlock()
  const languageField = codeBlock.fields.find(
    (field) =>
      typeof field === 'object' &&
      field !== null &&
      'name' in field &&
      (field as { name?: unknown }).name === 'language',
  ) as { options?: unknown } | undefined
  const options = Array.isArray(languageField?.options) ? languageField.options : []

  return new Set(
    options
      .map((option) =>
        typeof option === 'object' &&
        option !== null &&
        typeof (option as { value?: unknown }).value === 'string'
          ? (option as { value: string }).value
          : '',
      )
      .filter(Boolean),
  )
}

const codeBlockLanguageValues = readDefaultCodeBlockLanguageValues()

const codeBlockLanguageAliases: Record<string, string> = {
  bash: 'shell',
  c: 'cpp',
  'c#': 'csharp',
  'c++': 'cpp',
  docker: 'dockerfile',
  golang: 'go',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  plaintext: 'plaintext',
  plain: 'plaintext',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  psql: 'pgsql',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  shellscript: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  yml: 'yaml',
  zsh: 'shell',
}

export function normalizeCodeBlockLanguage(language: string): string {
  const normalizedLanguage = language.trim().toLowerCase().replace(/^language-/, '')

  if (!normalizedLanguage) {
    return 'plaintext'
  }

  const aliasedLanguage = codeBlockLanguageAliases[normalizedLanguage] ?? normalizedLanguage

  return codeBlockLanguageValues.has(aliasedLanguage) ? aliasedLanguage : 'plaintext'
}

function isObjectNode(value: unknown): value is LexicalObjectNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCodeBlockNode(node: LexicalObjectNode) {
  const fields = node.fields
  return isObjectNode(fields) && node.type === 'block' && fields.blockType === 'Code'
}

function normalizeLexicalNodeCodeBlockLanguages(node: unknown): unknown {
  if (!isObjectNode(node)) {
    return node
  }

  let nextNode = node
  const fields = node.fields

  if (isCodeBlockNode(node) && isObjectNode(fields)) {
    const currentLanguage = typeof fields.language === 'string' ? fields.language : ''
    const normalizedLanguage = normalizeCodeBlockLanguage(currentLanguage)

    if (currentLanguage !== normalizedLanguage) {
      nextNode = {
        ...nextNode,
        fields: {
          ...fields,
          language: normalizedLanguage,
        },
      }
    }
  }

  const children = Array.isArray(nextNode.children) ? nextNode.children : null
  if (!children) {
    return nextNode
  }

  const normalizedChildren = children.map(normalizeLexicalNodeCodeBlockLanguages)
  const changedChildren = normalizedChildren.some((child, index) => child !== children[index])

  return changedChildren
    ? {
        ...nextNode,
        children: normalizedChildren,
      }
    : nextNode
}

function normalizeLexicalCodeBlockLanguages(value: SerializedEditorState): SerializedEditorState {
  const normalizedRoot = normalizeLexicalNodeCodeBlockLanguages(value.root)

  return normalizedRoot === value.root
    ? value
    : {
        ...value,
        root: normalizedRoot as SerializedEditorState['root'],
      }
}

function extractLegacyCodeParagraphText(paragraphElement: Element): string {
  let text = ''

  for (const childNode of Array.from(paragraphElement.childNodes)) {
    if (childNode.nodeType === childNode.TEXT_NODE) {
      text += childNode.textContent ?? ''
      continue
    }

    if (childNode.nodeType !== childNode.ELEMENT_NODE) {
      continue
    }

    const childElement = childNode as Element
    const tagName = childElement.tagName.toLowerCase()

    if (tagName === 'br') {
      text += '\n'
      continue
    }

    if (tagName === 'code') {
      text += childElement.textContent ?? ''
      continue
    }

    return ''
  }

  return text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
}

function looksLikeLegacyCodeParagraph(text: string): boolean {
  const nonEmptyLines = text
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim())

  if (nonEmptyLines.length < 2) {
    return false
  }

  const htmlLikeLines = nonEmptyLines.filter((line) => /^\s*(<!doctype|<\/?[a-z][^>]*>)\s*$/i.test(line)).length
  if (htmlLikeLines >= 2) {
    return true
  }

  const codeLikeLines = nonEmptyLines.filter((line) => {
    if (/^\s*(const|let|var|function|if|for|while|return|document\.|window\.|console\.|elements?\.|p_tag\b|sum\b)/.test(line)) {
      return true
    }

    if (/^[\s{}()[\]]+;?\s*$/.test(line)) {
      return true
    }

    return /[;{}=]$/.test(line) || /^\s{2,}\S/.test(line)
  }).length

  return codeLikeLines >= 2
}

export function normalizeLegacyHtmlCodeBlocks(html: string): string {
  const normalizedHtml = html.trim()
  if (!normalizedHtml) {
    return normalizedHtml
  }

  const dom = new JSDOM(`<body>${normalizedHtml}</body>`)
  let didNormalize = false

  for (const paragraphElement of dom.window.document.querySelectorAll('p')) {
    const elementChildren = Array.from(paragraphElement.children)

    if (!elementChildren.length || !elementChildren.every((child) => ['br', 'code'].includes(child.tagName.toLowerCase()))) {
      continue
    }

    if (paragraphElement.querySelectorAll('br').length < 2) {
      continue
    }

    const codeText = extractLegacyCodeParagraphText(paragraphElement)
    if (!codeText || !looksLikeLegacyCodeParagraph(codeText)) {
      continue
    }

    const preElement = dom.window.document.createElement('pre')
    const codeElement = dom.window.document.createElement('code')
    codeElement.textContent = codeText
    preElement.appendChild(codeElement)
    paragraphElement.replaceWith(preElement)
    didNormalize = true
  }

  return didNormalize ? dom.window.document.body.innerHTML : normalizedHtml
}

export function countLegacyCodeBlocksInHtml(html: string): number {
  const normalizedHtml = normalizeLegacyHtmlCodeBlocks(html)
  const matches = normalizedHtml.match(/<pre\b/gi)
  return matches ? matches.length : 0
}

function extractLegacyCodeBlockPlaceholders(html: string): {
  normalizedHtml: string
  placeholders: LegacyCodeBlockPlaceholder[]
} {
  const dom = new JSDOM(`<body>${normalizeLegacyHtmlCodeBlocks(html)}</body>`)
  const placeholders: LegacyCodeBlockPlaceholder[] = []

  for (const preElement of dom.window.document.querySelectorAll('pre')) {
    const codeElement = preElement.querySelector('code')
    const code = codeElement?.textContent ?? preElement.textContent ?? ''
    const marker = `__LEGACY_CODE_BLOCK_${placeholders.length}__`
    const language = extractCodeLanguage(codeElement?.className ?? '')

    placeholders.push({
      code,
      language,
      marker,
    })

    const replacement = dom.window.document.createElement('p')
    replacement.textContent = marker
    preElement.replaceWith(replacement)
  }

  return {
    normalizedHtml: dom.window.document.body.innerHTML,
    placeholders,
  }
}

function createCodeBlockNode(code: string, language: string) {
  return {
    type: 'block',
    version: 2,
    format: '',
    fields: {
      blockType: 'Code',
      code,
      language: normalizeCodeBlockLanguage(language),
      id: randomBytes(12).toString('hex'),
    },
  }
}

function replaceLegacyCodeBlockPlaceholders(
  nodes: Array<Record<string, unknown>>,
  placeholdersByMarker: Map<string, LegacyCodeBlockPlaceholder>,
): Array<Record<string, unknown>> {
  return nodes.map((node) => {
    if (
      node.type === 'paragraph' &&
      Array.isArray(node.children) &&
      node.children.length === 1 &&
      node.children[0] &&
      typeof node.children[0] === 'object' &&
      node.children[0] !== null &&
      node.children[0].type === 'text' &&
      typeof node.children[0].text === 'string'
    ) {
      const placeholder = placeholdersByMarker.get(node.children[0].text)
      if (placeholder) {
        return createCodeBlockNode(placeholder.code, placeholder.language)
      }
    }

    if (!Array.isArray(node.children)) {
      return node
    }

    return {
      ...node,
      children: replaceLegacyCodeBlockPlaceholders(
        node.children as Array<Record<string, unknown>>,
        placeholdersByMarker,
      ),
    }
  })
}

function countLexicalNodesByType(node: unknown, predicate: (value: Record<string, unknown>) => boolean): number {
  if (!node || typeof node !== 'object') {
    return 0
  }

  const currentNode = node as Record<string, unknown>
  const children = Array.isArray(currentNode.children) ? currentNode.children : []
  return (predicate(currentNode) ? 1 : 0) + children.reduce((sum, child) => sum + countLexicalNodesByType(child, predicate), 0)
}

export function countCodeBlocksInLexicalState(value: SerializedEditorState): number {
  return countLexicalNodesByType(
    value.root,
    (node) => node.type === 'block' && (node.fields as { blockType?: unknown } | undefined)?.blockType === 'Code',
  )
}

export const wordPressLikeHTMLConvertersAsync: HTMLConvertersFunctionAsync = ({ defaultConverters }) => ({
  ...defaultConverters,
  blocks: {
    ...defaultConverters.blocks,
    Code: (args: { node: { fields?: { code?: unknown; language?: unknown } } }) => {
      const { node } = args
      const code = typeof node.fields?.code === 'string' ? node.fields.code : ''
      const language = typeof node.fields?.language === 'string' ? normalizeCodeBlockLanguage(node.fields.language) : 'plaintext'
      const languageClass = language && language !== 'plaintext' ? ` class="language-${escapeHtml(language)}"` : ''

      return `<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`
    },
  },
})

export async function convertLegacyHtmlToLexicalState(
  html: string,
): Promise<null | SerializedEditorState> {
  const normalizedHtml = html.trim()
  if (!normalizedHtml) return null

  const editorConfig = await legacyHtmlEditorConfigPromise
  const { normalizedHtml: htmlWithPlaceholders, placeholders } = extractLegacyCodeBlockPlaceholders(normalizedHtml)

  const lexicalState = ensureLexicalState(
    convertHTMLToLexical({
      editorConfig,
      html: htmlWithPlaceholders,
      JSDOM,
    }) as SerializedEditorState,
  )

  if (!placeholders.length) {
    return lexicalState
  }

  return {
    ...lexicalState,
    root: {
      ...lexicalState.root,
      children: replaceLegacyCodeBlockPlaceholders(
        lexicalState.root.children as Array<Record<string, unknown>>,
        new Map(placeholders.map((placeholder) => [placeholder.marker, placeholder])),
      ),
    },
  } as SerializedEditorState
}

export async function convertMarkdownToLexicalState(
  markdown: string,
): Promise<null | SerializedEditorState> {
  const normalizedMarkdown = markdown.trim()
  if (!normalizedMarkdown) return null

  const editorConfig = await legacyHtmlEditorConfigPromise

  return ensureLexicalState(
    convertMarkdownToLexical({
      editorConfig,
      markdown: normalizedMarkdown,
    }) as SerializedEditorState,
  )
}

export async function convertLexicalStateToMarkdown(
  value: SerializedEditorState,
): Promise<string> {
  const editorConfig = await legacyHtmlEditorConfigPromise

  return convertLexicalToMarkdown({
    data: ensureLexicalState(value),
    editorConfig,
  })
}

export function createEmptyLexicalState(): SerializedEditorState {
  return {
    root: {
      type: 'root',
      children: [createEmptyParagraphNode()],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  } as SerializedEditorState
}
