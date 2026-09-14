// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'
import os from 'os'
import path from 'path'
import { appendFileSync, existsSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { afterAll } from 'vitest'
import { Client } from 'pg'

const dirname = path.dirname(fileURLToPath(import.meta.url))

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function createMaintenanceDatabaseURL(databaseURL: string): string {
  const url = new URL(databaseURL)
  url.pathname = '/postgres'
  return url.toString()
}

function getDatabaseRegistryPath(): string {
  const projectKey = Buffer.from(dirname).toString('hex')
  return path.join(os.tmpdir(), `gatekeepr-cms-int-dbs-${projectKey}.jsonl`)
}

async function createTemporaryPostgresDatabase(databaseURL: string): Promise<null | string> {
  const databaseName = `gatekeepr_cms_int_${process.pid}_${Date.now()}`
  const maintenanceClient = new Client({
    connectionString: createMaintenanceDatabaseURL(databaseURL),
  })

  try {
    await maintenanceClient.connect()
    await maintenanceClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
  } catch {
    return null
  } finally {
    await maintenanceClient.end().catch(() => {})
  }

  const testDatabaseURL = new URL(databaseURL)
  testDatabaseURL.pathname = `/${databaseName}`
  const registryPath = process.env.DASH_TEST_DB_REGISTRY_PATH || getDatabaseRegistryPath()

  process.env.DASH_TEST_DB_REGISTRY_PATH = registryPath
  appendFileSync(registryPath, `${JSON.stringify({ databaseName, databaseURL })}\n`)

  return testDatabaseURL.toString()
}

function createTemporarySqliteDatabaseURL(): string {
  const integrationDbPath = path.join(os.tmpdir(), `gatekeepr-cms-int-${process.pid}-${Date.now()}.db`)
  afterAll(async () => {
    const { closeCmsPayload } = await import('./src/lib/payload')
    await closeCmsPayload()
    if (existsSync(integrationDbPath)) {
      rmSync(integrationDbPath)
    }
  }, 60_000)

  return `file:${integrationDbPath}`
}

const configuredDatabaseURL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || ''
const temporaryPostgresDatabaseURL = configuredDatabaseURL.startsWith('postgres://') || configuredDatabaseURL.startsWith('postgresql://')
  ? await createTemporaryPostgresDatabase(configuredDatabaseURL)
  : null

process.env.DATABASE_URL = temporaryPostgresDatabaseURL || createTemporarySqliteDatabaseURL()
// The URL above is always a newly created test database, never the configured database itself.
process.env.PAYLOAD_ENABLE_DB_PUSH = 'true'
process.env.PAYLOAD_DISABLE_DB_PUSH = 'false'
