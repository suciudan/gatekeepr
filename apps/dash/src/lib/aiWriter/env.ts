type EnvMap = {
  anthropicApiKey: string
  anthropicModel: string
  anthropicVersion: string
  brightDataApiKey: string
  brightDataBrowserPassword: string
  brightDataBrowserUsername: string
  brightDataSerpZone: string
  openaiApiKey: string
  openaiModel: string
}

function readAIWriterEnv(): EnvMap {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() ?? '',
    anthropicVersion: process.env.ANTHROPIC_VERSION?.trim() || '2023-06-01',
    brightDataApiKey: process.env.BRIGHTDATA_API_KEY?.trim() ?? '',
    brightDataBrowserPassword: process.env.BRIGHTDATA_BROWSER_PASSWORD?.trim() ?? '',
    brightDataBrowserUsername: process.env.BRIGHTDATA_BROWSER_USERNAME?.trim() ?? '',
    brightDataSerpZone: process.env.BRIGHTDATA_SERP_ZONE?.trim() ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    openaiModel: process.env.OPENAI_MODEL?.trim() ?? '',
  }
}

export function getAIWriterEnv(): EnvMap {
  return readAIWriterEnv()
}

export function requireAIWriterEnv(name: keyof EnvMap) {
  const value = readAIWriterEnv()[name]

  if (!value) {
    throw new Error(`Missing AI Writer environment variable: ${name}`)
  }

  return value
}
