import 'dotenv/config'

import Database from 'better-sqlite3'
import { getPayload, type Payload } from 'payload'
import { Pool, type PoolClient } from 'pg'

import { createPayloadConfig } from '../payload.base'
import { getDatabaseKind, resolveSqliteDatabasePath } from '../lib/databaseAdapter'

type PostgresColumn = {
  column_name: string
  data_type: string
  enumValues?: Set<string>
  udt_name: string
}

const SQLITE_SOURCE_URL = process.env.PAYLOAD_SQLITE_DATABASE_URL || 'file:./cms.db'
const POSTGRES_TARGET_URL = process.env.DATABASE_URL || ''
const POSTGRES_SCHEMA = process.env.PAYLOAD_DB_SCHEMA || 'public'
const BATCH_SIZE = 250
const LEGACY_ENUM_VALUE_ALIASES: Record<string, string> = {
  'en-us': 'en',
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function parseJsonValue(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  return JSON.parse(value)
}

function coerceValueForPostgres(column: PostgresColumn, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null
  }

  if (column.data_type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') return value === 'true' || value === '1'
  }

  if (column.data_type === 'json' || column.data_type === 'jsonb') {
    return parseJsonValue(value)
  }

  if (column.data_type === 'ARRAY' && typeof value === 'string') {
    return parseJsonValue(value)
  }

  if (column.data_type === 'USER-DEFINED' && typeof value === 'string' && column.enumValues) {
    const normalizedValue = LEGACY_ENUM_VALUE_ALIASES[value] || value

    if (column.enumValues.has(normalizedValue)) {
      return normalizedValue
    }

    throw new Error(
      `Value "${value}" is not valid for enum ${column.udt_name} on column ${column.column_name}`,
    )
  }

  return value
}

async function getTargetTables(client: PoolClient, schemaName: string): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
    [schemaName],
  )

  return result.rows.map((row) => row.table_name)
}

function getSourceTables(source: Database.Database): string[] {
  const rows = source
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
    )
    .all() as Array<{ name: string }>

  return rows.map((row) => row.name)
}

async function getTableDependencies(
  client: PoolClient,
  schemaName: string,
  tables: string[],
): Promise<Map<string, Set<string>>> {
  const dependencies = new Map<string, Set<string>>(
    tables.map((tableName) => [tableName, new Set<string>()]),
  )

  if (tables.length === 0) {
    return dependencies
  }

  const result = await client.query<{ table_name: string, referenced_table_name: string }>(
    `
      SELECT
        tc.table_name,
        ccu.table_name AS referenced_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = ANY($2::text[])
    `,
    [schemaName, tables],
  )

  for (const row of result.rows) {
    if (row.table_name === row.referenced_table_name) {
      continue
    }

    if (dependencies.has(row.table_name) && dependencies.has(row.referenced_table_name)) {
      dependencies.get(row.table_name)?.add(row.referenced_table_name)
    }
  }

  return dependencies
}

function orderTablesByDependencies(
  tables: string[],
  dependencies: Map<string, Set<string>>,
): string[] {
  const ordered: string[] = []
  const remaining = new Set(tables)

  while (remaining.size > 0) {
    const ready = [...remaining].filter((tableName) => {
      const tableDependencies = dependencies.get(tableName) || new Set<string>()
      return [...tableDependencies].every((dependency) => !remaining.has(dependency))
    })

    if (ready.length === 0) {
      ordered.push(...[...remaining].sort())
      break
    }

    ready.sort()

    for (const tableName of ready) {
      remaining.delete(tableName)
      ordered.push(tableName)
    }
  }

  return ordered
}

async function getPostgresColumns(
  client: PoolClient,
  schemaName: string,
  tableName: string,
): Promise<PostgresColumn[]> {
  const result = await client.query<PostgresColumn>(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schemaName, tableName],
  )

  return result.rows
}

async function hydrateEnumValues(client: PoolClient, columns: PostgresColumn[]) {
  const enumTypeNames = [...new Set(columns.filter((column) => column.data_type === 'USER-DEFINED').map((column) => column.udt_name))]

  if (enumTypeNames.length === 0) {
    return
  }

  const result = await client.query<{ enumlabel: string, typname: string }>(
    `
      SELECT e.enumlabel, t.typname
      FROM pg_enum AS e
      JOIN pg_type AS t
        ON e.enumtypid = t.oid
      WHERE t.typname = ANY($1::text[])
    `,
    [enumTypeNames],
  )

  const enumValuesByType = new Map<string, Set<string>>()

  for (const row of result.rows) {
    const enumValues = enumValuesByType.get(row.typname) || new Set<string>()
    enumValues.add(row.enumlabel)
    enumValuesByType.set(row.typname, enumValues)
  }

  for (const column of columns) {
    column.enumValues = enumValuesByType.get(column.udt_name)
  }
}

function getSqliteColumns(source: Database.Database, tableName: string): string[] {
  const pragmaRows = source.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{
    name: string
  }>

  return pragmaRows.map((row) => row.name)
}

async function truncateTargetTables(client: PoolClient, schemaName: string, tables: string[]) {
  if (tables.length === 0) return

  const qualifiedTables = tables
    .map((tableName) => `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`)
    .join(', ')

  await client.query(`TRUNCATE TABLE ${qualifiedTables} RESTART IDENTITY CASCADE`)
}

async function syncTableSequence(client: PoolClient, schemaName: string, tableName: string) {
  const sequenceResult = await client.query<{ sequence_name: null | string }>(
    'SELECT pg_get_serial_sequence($1, $2) AS sequence_name',
    [`${schemaName}.${tableName}`, 'id'],
  )

  const sequenceName = sequenceResult.rows[0]?.sequence_name

  if (!sequenceName) {
    return
  }

  await client.query(
    `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}), 0) + 1, false)`,
    [sequenceName],
  )
}

async function insertBatch(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  columns: PostgresColumn[],
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) {
    return
  }

  const columnNames = columns.map((column) => column.column_name)
  const values: unknown[] = []
  const valueGroups = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(coerceValueForPostgres(column, row[column.column_name]))
      return `$${rowIndex * columns.length + columnIndex + 1}`
    })

    return `(${placeholders.join(', ')})`
  })

  const insertSQL = `
    INSERT INTO ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} (${columnNames
      .map(quoteIdentifier)
      .join(', ')})
    VALUES ${valueGroups.join(', ')}
  `

  await client.query(insertSQL, values)
}

async function copyTable(
  source: Database.Database,
  client: PoolClient,
  schemaName: string,
  tableName: string,
): Promise<number> {
  const postgresColumns = await getPostgresColumns(client, schemaName, tableName)
  await hydrateEnumValues(client, postgresColumns)
  const sqliteColumns = new Set(getSqliteColumns(source, tableName))
  const commonColumns = postgresColumns.filter((column) => sqliteColumns.has(column.column_name))

  if (commonColumns.length === 0) {
    return 0
  }

  const selectSQL = `SELECT ${commonColumns.map((column) => quoteIdentifier(column.column_name)).join(', ')} FROM ${quoteIdentifier(tableName)}`
  const statement = source.prepare(selectSQL)

  let insertedCount = 0
  let batch: Record<string, unknown>[] = []

  for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
    batch.push(row)

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(client, schemaName, tableName, commonColumns, batch)
      insertedCount += batch.length
      batch = []
    }
  }

  if (batch.length > 0) {
    await insertBatch(client, schemaName, tableName, commonColumns, batch)
    insertedCount += batch.length
  }

  await syncTableSequence(client, schemaName, tableName)

  return insertedCount
}

async function initializeTargetSchema(targetDatabaseURL: string): Promise<Payload> {
  return getPayload({
    config: createPayloadConfig({
      databaseURL: targetDatabaseURL,
      secret: process.env.PAYLOAD_SECRET || 'cms-postgres-migration',
    }),
  })
}

async function main() {
  if (getDatabaseKind(SQLITE_SOURCE_URL) !== 'sqlite') {
    throw new Error('PAYLOAD_SQLITE_DATABASE_URL must point to a SQLite database file')
  }

  if (!POSTGRES_TARGET_URL || getDatabaseKind(POSTGRES_TARGET_URL) !== 'postgres') {
    throw new Error('DATABASE_URL must point to the Postgres target database')
  }

  const payload = await initializeTargetSchema(POSTGRES_TARGET_URL)

  const sqlitePath = resolveSqliteDatabasePath(SQLITE_SOURCE_URL)
  const source = new Database(sqlitePath, { readonly: true })
  const pool = new Pool({ connectionString: POSTGRES_TARGET_URL })
  const client = await pool.connect()

  try {
    const sourceTables = new Set(getSourceTables(source))
    const targetTables = await getTargetTables(client, POSTGRES_SCHEMA)
    const commonTables = targetTables.filter((tableName) => sourceTables.has(tableName))
    const dependencies = await getTableDependencies(client, POSTGRES_SCHEMA, commonTables)
    const orderedTables = orderTablesByDependencies(commonTables, dependencies)

    await truncateTargetTables(client, POSTGRES_SCHEMA, commonTables)

    const copiedRowsByTable: Record<string, number> = {}

    for (const tableName of orderedTables) {
      const rowCount = await copyTable(source, client, POSTGRES_SCHEMA, tableName)
      copiedRowsByTable[tableName] = rowCount
      console.log(`Copied ${rowCount} rows into ${POSTGRES_SCHEMA}.${tableName}`)
    }

    console.log(JSON.stringify({ copiedRowsByTable, source: sqlitePath, targetSchema: POSTGRES_SCHEMA }, null, 2))
  } finally {
    client.release()
    void pool.end().catch(() => {})
    void payload.db.pool.end().catch(() => {})
    source.close()
  }
}

void main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
