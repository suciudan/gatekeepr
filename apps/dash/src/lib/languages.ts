export const DEFAULT_LANGUAGE_CODE = 'en'

export const DEFAULT_LANGUAGES = [
  { code: 'en', name: 'English' },
] as const

export const LANGUAGE_SELECT_OPTIONS = DEFAULT_LANGUAGES.map(({ code, name }) => ({
  label: `${name} (${code})`,
  value: code,
}))
