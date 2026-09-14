import { JSDOM } from 'jsdom'

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}

function collectText(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement

  if (element.tagName.toLowerCase() === 'br') {
    return '\n'
  }

  return Array.from(element.childNodes)
    .map((child) => collectText(child))
    .join('')
}

function serializeInline(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? '')
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  const content = Array.from(element.childNodes)
    .map((child) => serializeInline(child))
    .join('')

  switch (tagName) {
    case 'a': {
      const label = normalizeWhitespace(content) || normalizeWhitespace(collectText(element))
      const href = element.getAttribute('href')?.trim()
      return href ? `[${label || href}](${href})` : label
    }
    case 'strong':
    case 'b':
      return content.trim() ? `**${content.trim()}**` : ''
    case 'em':
    case 'i':
      return content.trim() ? `*${content.trim()}*` : ''
    case 'code':
      return element.parentElement?.tagName.toLowerCase() === 'pre'
        ? content
        : content.trim()
          ? `\`${content.trim()}\``
          : ''
    case 'br':
      return '\n'
    case 'img': {
      const alt = normalizeWhitespace(element.getAttribute('alt') ?? '')
      const src = element.getAttribute('src')?.trim()
      if (src) {
        return `![${alt}](${src})`
      }

      return alt
    }
    default:
      return content
  }
}

function normalizeInlineMarkdown(value: string) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function serializeTable(element: HTMLElement) {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map((row) =>
      Array.from(row.querySelectorAll('th, td')).map((cell) => normalizeInlineMarkdown(serializeInline(cell))),
    )
    .filter((row) => row.length > 0)

  if (rows.length === 0) {
    return ''
  }

  const columnCount = Math.max(...rows.map((row) => row.length))
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => escapeMarkdownText(row[index] || '')),
  )
  const header = normalizedRows[0]
  const separator = Array.from({ length: columnCount }, () => '---')
  const body = normalizedRows.slice(1)

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function serializeListItem(element: HTMLElement, ordered: boolean, index: number, depth: number): string[] {
  const prefix = ordered ? `${index + 1}. ` : '- '
  const indent = '  '.repeat(depth)
  const inlineParts: string[] = []
  const nestedBlocks: string[] = []

  for (const child of Array.from(element.childNodes)) {
    if (
      child.nodeType === child.ELEMENT_NODE &&
      ['ul', 'ol', 'pre', 'table', 'blockquote'].includes((child as HTMLElement).tagName.toLowerCase())
    ) {
      nestedBlocks.push(...serializeBlock(child, depth + 1))
      continue
    }

    inlineParts.push(serializeInline(child))
  }

  const firstLine = `${indent}${prefix}${normalizeInlineMarkdown(inlineParts.join(''))}`.trimEnd()
  return [firstLine, ...nestedBlocks]
}

function serializeBlock(node: Node, depth = 0): string[] {
  if (node.nodeType === node.TEXT_NODE) {
    const text = normalizeWhitespace(node.textContent ?? '')
    return text ? [escapeMarkdownText(text)] : []
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return []
  }

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()

  switch (tagName) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tagName.slice(1))
      const content = normalizeInlineMarkdown(serializeInline(element))
      return content ? [`${'#'.repeat(level)} ${content}`] : []
    }
    case 'p': {
      const content = normalizeInlineMarkdown(serializeInline(element))
      return content ? [content] : []
    }
    case 'ul':
    case 'ol': {
      const ordered = tagName === 'ol'
      return Array.from(element.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .flatMap((child, index) => serializeListItem(child as HTMLElement, ordered, index, depth))
    }
    case 'pre': {
      const codeElement = element.querySelector('code')
      const code = (codeElement?.textContent ?? element.textContent ?? '').trimEnd()
      if (!code) {
        return []
      }

      const className = codeElement?.getAttribute('class') ?? ''
      const languageMatch = className.match(/language-([A-Za-z0-9_+-]+)/)
      const language = languageMatch?.[1] ?? ''
      return [`\`\`\`${language}`, code, '```']
    }
    case 'blockquote': {
      const content = normalizeInlineMarkdown(serializeInline(element))
      if (!content) {
        return []
      }

      return content.split('\n').map((line) => `> ${line}`)
    }
    case 'table': {
      const table = serializeTable(element)
      return table ? [table] : []
    }
    case 'hr':
      return ['---']
    case 'article':
    case 'section':
    case 'main':
    case 'header':
    case 'footer':
    case 'div':
    case 'body':
      return Array.from(element.childNodes).flatMap((child) => serializeBlock(child, depth))
    default: {
      const content = normalizeInlineMarkdown(serializeInline(element))
      return content ? [content] : []
    }
  }
}

function cleanMarkdownLines(lines: string[]) {
  const cleaned: string[] = []

  for (const line of lines.map((entry) => entry.trimEnd())) {
    if (!line.trim()) {
      if (cleaned[cleaned.length - 1] !== '') {
        cleaned.push('')
      }
      continue
    }

    cleaned.push(line)
  }

  while (cleaned[0] === '') {
    cleaned.shift()
  }

  while (cleaned[cleaned.length - 1] === '') {
    cleaned.pop()
  }

  return cleaned
}

export function convertHtmlToMarkdownDocument(input: {
  html: string
  title?: null | string
}) {
  const dom = new JSDOM(`<body>${input.html}</body>`)

  try {
    const body = dom.window.document.body

    for (const selector of ['script', 'style', 'noscript']) {
      for (const element of body.querySelectorAll(selector)) {
        element.remove()
      }
    }

    const lines = cleanMarkdownLines(Array.from(body.childNodes).flatMap((child) => serializeBlock(child)))
    const title = normalizeWhitespace(input.title ?? '')
    const hasH1 = lines.some((line) => /^#\s+\S/.test(line))

    if (title && !hasH1) {
      lines.unshift('', `# ${escapeMarkdownText(title)}`)
    }

    const markdown = cleanMarkdownLines(lines).join('\n\n').trim()

    if (!markdown) {
      return title ? `# ${escapeMarkdownText(title)}` : ''
    }

    return markdown
  } finally {
    dom.window.close()
  }
}
