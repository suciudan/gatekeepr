import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import path from 'path'

type DatabaseKind = 'postgres' | 'sqlite'

function normalizeDatabaseURL(databaseURL: string): string {
  return databaseURL.trim()
}

export function getDatabaseKind(databaseURL: string): DatabaseKind {
  const normalizedDatabaseURL = normalizeDatabaseURL(databaseURL).toLowerCase()

  if (normalizedDatabaseURL.startsWith('postgres://') || normalizedDatabaseURL.startsWith('postgresql://')) {
    return 'postgres'
  }

  if (
    normalizedDatabaseURL.startsWith('file:')
    || normalizedDatabaseURL.endsWith('.db')
    || normalizedDatabaseURL.endsWith('.sqlite')
  ) {
    return 'sqlite'
  }

  throw new Error(
    `Unsupported DATABASE_URL "${databaseURL}". Expected a Postgres URL or a SQLite file URL.`,
  )
}

export function createDatabaseAdapter(databaseURL: string) {
  const normalizedDatabaseURL = normalizeDatabaseURL(databaseURL)
  const schemaName = process.env.PAYLOAD_DB_SCHEMA?.trim()
  const enablePush =
    process.env.PAYLOAD_ENABLE_DB_PUSH === 'true' &&
    process.env.PAYLOAD_DISABLE_DB_PUSH !== 'true' &&
    process.env.NODE_ENV !== 'production'

  if (!normalizedDatabaseURL) {
    throw new Error('DATABASE_URL is required for Payload CMS')
  }

  if (getDatabaseKind(normalizedDatabaseURL) === 'postgres') {
    return postgresAdapter({
      pool: {
        connectionString: normalizedDatabaseURL,
      },
      push: enablePush,
      schemaName: schemaName && schemaName !== 'public' ? schemaName : undefined,
    })
  }

  return sqliteAdapter({
    client: {
      url: normalizedDatabaseURL,
    },
  })
}

export function resolveSqliteDatabasePath(databaseURL: string): string {
  const normalizedDatabaseURL = normalizeDatabaseURL(databaseURL)

  if (getDatabaseKind(normalizedDatabaseURL) !== 'sqlite') {
    throw new Error(`Expected a SQLite database URL, received "${databaseURL}"`)
  }

  return path.resolve(process.cwd(), normalizedDatabaseURL.replace(/^file:/, ''))
}
