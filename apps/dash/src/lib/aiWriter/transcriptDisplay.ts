export type AnthropicTraceContentBlock = {
  content?: unknown
  id?: string
  input?: unknown
  name?: string
  text?: string
  type?: string
}

export type AnthropicToolBlockSummary = {
  details: string[]
  label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function summarizeAnthropicToolBlock(block: AnthropicTraceContentBlock): AnthropicToolBlockSummary {
  const details: string[] = []
  const input = isRecord(block.input) ? block.input : null
  const content = isRecord(block.content) ? block.content : null
  const toolName = pickString(block.name) || block.type || 'tool'

  if (input) {
    const command = pickString(input.command)
    const path = pickString(input.path)

    if (command) {
      details.push(`Command: ${command}`)
    }

    if (path) {
      details.push(`Path: ${path}`)
    }
  }

  if (content) {
    let returnCode: null | number = null

    if (typeof content.return_code === 'number') {
      returnCode = content.return_code
    } else if (typeof content.exit_code === 'number') {
      returnCode = content.exit_code
    }
    const stdout = pickString(content.stdout)
    const stderr = pickString(content.stderr)

    if (returnCode != null) {
      details.push(`Return code: ${returnCode}`)
    }

    if (stdout) {
      details.push(stdout)
    }

    if (stderr) {
      details.push(`stderr: ${stderr}`)
    }
  }

  return {
    details,
    label: toolName.replaceAll('_', ' '),
  }
}

export function getDisplayableAnthropicToolSummaries(blocks: AnthropicTraceContentBlock[]) {
  return blocks
    .filter((block) => block.type !== 'text')
    .map((block) => summarizeAnthropicToolBlock(block))
    .filter((summary) => summary.details.length > 0)
}
