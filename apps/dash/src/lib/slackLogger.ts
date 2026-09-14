type SlackLogContext = Record<string, boolean | null | number | string | undefined>

type SlackLogArgs = {
  context?: SlackLogContext
  error?: unknown
  title: string
}

const MAX_FIELD_LENGTH = 1200
const MAX_STACK_LENGTH = 2400
const SLACK_LOGGED_KEY = '__wsaCmsSlackLogged'

type SlackLoggedError = {
  [SLACK_LOGGED_KEY]?: boolean
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function formatError(error: unknown): SlackLogContext {
  if (error instanceof Error) {
    return {
      errorMessage: truncate(error.message, MAX_FIELD_LENGTH),
      errorName: error.name,
      errorStack: error.stack ? truncate(error.stack, MAX_STACK_LENGTH) : undefined,
    }
  }

  if (typeof error === 'string') {
    return {
      errorMessage: truncate(error, MAX_FIELD_LENGTH),
    }
  }

  return {
    errorMessage: 'Unknown error',
  }
}

function formatContext(context: SlackLogContext = {}): string {
  return Object.entries(context)
    .filter((entry): entry is [string, boolean | number | string] => {
      const value = entry[1]
      return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
    })
    .map(([key, value]) => `*${key}:* ${truncate(String(value), MAX_FIELD_LENGTH)}`)
    .join('\n')
}

function hasSlackLogMarker(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Boolean((error as SlackLoggedError)[SLACK_LOGGED_KEY])
}

function markSlackLogged(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    const loggedError = error as SlackLoggedError
    loggedError[SLACK_LOGGED_KEY] = true
  }
}

export async function logToSlack(args: SlackLogArgs): Promise<void> {
  if (hasSlackLogMarker(args.error)) {
    return
  }

  const webhookUrl = process.env.SLACK_LOGGER_URL?.trim()

  if (!webhookUrl) {
    return
  }

  const context = {
    ...args.context,
    ...formatError(args.error),
  }
  const contextText = formatContext(context)

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [`:warning: ${args.title}`, contextText].filter(Boolean).join('\n'),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (slackError) {
    console.error('Failed to send Slack log', slackError)
  } finally {
    markSlackLogged(args.error)
  }
}
