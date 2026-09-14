export function safeJsonParse<T>(value: string): null | T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function wordCount(value: string) {
  return value.split(/\s+/u).filter(Boolean).length;
}
