function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pushUnique(values: string[], value: string) {
  const normalized = value.trim()

  if (!normalized || values.includes(normalized)) {
    return
  }

  values.push(normalized)
}

function collectErrorFragments(value: unknown, fragments: string[], visited: Set<unknown>) {
  if (value == null || visited.has(value)) {
    return
  }

  if (typeof value === 'object' || typeof value === 'function') {
    visited.add(value)
  }

  if (typeof value === 'string') {
    pushUnique(fragments, value)
    return
  }

  if (value instanceof Error) {
    const code = pickString((value as Error & { code?: unknown }).code)
    const message = pickString(value.message) || pickString(value.name)

    if (code && message && !message.includes(code)) {
      pushUnique(fragments, `${code}: ${message}`)
    } else {
      pushUnique(fragments, message || code)
    }

    collectErrorFragments((value as Error & { cause?: unknown }).cause, fragments, visited)
    return
  }

  if (isRecord(value)) {
    const code = pickString(value.code)
    const errno = pickString(value.errno)
    const message = pickString(value.message)

    if (code && message && !message.includes(code)) {
      pushUnique(fragments, `${code}: ${message}`)
    } else {
      pushUnique(fragments, message || code || errno)
    }

    if ('cause' in value) {
      collectErrorFragments(value.cause, fragments, visited)
    }
  }
}

function isGenericTopLevelMessage(value: string) {
  const normalized = value.trim().toLowerCase()

  return (
    normalized === 'fetch failed' ||
    normalized === 'network request failed' ||
    normalized === 'request failed' ||
    normalized === 'failed to fetch'
  )
}

export function describeAIWriterError(error: unknown, fallback: string) {
  const fallbackPrefix = fallback.trim().replace(/[.:]\s*$/, '')
  const fragments: string[] = []
  collectErrorFragments(error, fragments, new Set())

  if (!fragments.length) {
    return fallback
  }

  const [primary, ...rest] = fragments

  if (!primary) {
    return fallback
  }

  if (isGenericTopLevelMessage(primary)) {
    return rest.length > 0 ? `${fallbackPrefix}: ${primary} (${rest.join('; ')})` : `${fallbackPrefix}: ${primary}`
  }

  return primary
}
