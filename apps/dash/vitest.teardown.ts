import os from 'os'
import path from 'path'
import { existsSync, readFileSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
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

async function dropRegisteredDatabases() {
  const registryPath = process.env.DASH_TEST_DB_REGISTRY_PATH || getDatabaseRegistryPath()

  if (!existsSync(registryPath)) {
    return
  }

  const entries = readFileSync(registryPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { databaseName: string, databaseURL: string })

  for (const entry of entries.reverse()) {
    const client = new Client({
      connectionString: createMaintenanceDatabaseURL(entry.databaseURL),
    })

    try {
      await client.connect()
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(entry.databaseName)} WITH (FORCE)`)
    } finally {
      await client.end().catch(() => {})
    }
  }

  rmSync(registryPath, { force: true })
}

export default async function setup() {
  rmSync(process.env.DASH_TEST_DB_REGISTRY_PATH || getDatabaseRegistryPath(), { force: true })

  return async function teardown() {
    await dropRegisteredDatabases()
  }
}
