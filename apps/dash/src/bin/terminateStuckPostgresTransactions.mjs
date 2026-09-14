#!/usr/bin/env node

import process from 'node:process'
import pg from 'pg'

const { Client } = pg

const databaseURL = process.env.DATABASE_URL || process.argv[2]
const minAgeSeconds = Number.parseInt(process.env.MIN_AGE_SECONDS || '120', 10)
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase())

function getSslConfig() {
  const pgSslMode = String(process.env.PGSSLMODE || '').toLowerCase()
  const pgSsl = String(process.env.PGSSL || '').toLowerCase()

  if (pgSslMode === 'disable' || pgSsl === 'false') {
    return false
  }

  if (['require', 'prefer', 'no-verify'].includes(pgSslMode) || ['1', 'true', 'yes'].includes(pgSsl)) {
    return {
      rejectUnauthorized: pgSslMode !== 'no-verify' && process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false',
    }
  }

  return undefined
}

function printRows(title, rows) {
  console.log(`\n${title}`)

  if (!rows.length) {
    console.log('  none')
    return
  }

  console.table(
    rows.map((row) => ({
      pid: row.pid,
      terminated: row.terminated,
      state: row.state,
      wait: [row.wait_event_type, row.wait_event].filter(Boolean).join('/') || null,
      age: row.age,
      blocking_pids: row.blocking_pids,
      blocked_pids: row.blocked_pids,
      user: row.usename,
      app: row.application_name,
      client: row.client_addr,
      query: row.query,
    })),
  )
}

if (!databaseURL) {
  console.error('Usage: DATABASE_URL="postgresql://..." node apps/cms/src/bin/terminateStuckPostgresTransactions.mjs')
  console.error('   or: node apps/cms/src/bin/terminateStuckPostgresTransactions.mjs "postgresql://..."')
  console.error('')
  console.error('Optional env vars:')
  console.error('  MIN_AGE_SECONDS=120     Only terminate blockers older than this.')
  console.error('  DRY_RUN=1               Print matching blockers without terminating.')
  console.error('  PGSSLMODE=require       Enable TLS for hosted Postgres if needed.')
  console.error('  PGSSLMODE=no-verify     Enable TLS without certificate verification.')
  process.exit(1)
}

if (!Number.isFinite(minAgeSeconds) || minAgeSeconds < 0) {
  console.error(`MIN_AGE_SECONDS must be a non-negative integer. Received: ${process.env.MIN_AGE_SECONDS}`)
  process.exit(1)
}

const client = new Client({
  connectionString: databaseURL,
  ssl: getSslConfig(),
})

const blockerQuery = `
  with blockers as (
    select
      blocker.pid,
      blocker.usename,
      blocker.application_name,
      blocker.client_addr::text,
      blocker.state,
      blocker.wait_event_type,
      blocker.wait_event,
      now() - blocker.query_start as age,
      left(blocker.query, 240) as query,
      array_agg(distinct blocked.pid order by blocked.pid) as blocked_pids
    from pg_stat_activity blocker
    join pg_stat_activity blocked
      on blocker.pid = any(pg_blocking_pids(blocked.pid))
    where blocker.datname = current_database()
      and blocker.pid <> pg_backend_pid()
      and blocker.state = 'idle in transaction'
      and blocker.query_start < now() - ($1::int * interval '1 second')
    group by
      blocker.pid,
      blocker.usename,
      blocker.application_name,
      blocker.client_addr,
      blocker.state,
      blocker.wait_event_type,
      blocker.wait_event,
      blocker.query_start,
      blocker.query
  )
  select * from blockers order by age desc;
`

const terminateQuery = `
  with blockers as (
    select distinct blocker.pid
    from pg_stat_activity blocker
    join pg_stat_activity blocked
      on blocker.pid = any(pg_blocking_pids(blocked.pid))
    where blocker.datname = current_database()
      and blocker.pid <> pg_backend_pid()
      and blocker.state = 'idle in transaction'
      and blocker.query_start < now() - ($1::int * interval '1 second')
  )
  select pg_terminate_backend(pid) as terminated, pid
  from blockers
  order by pid;
`

const verificationQuery = `
  select
    pid,
    usename,
    application_name,
    client_addr::text,
    state,
    wait_event_type,
    wait_event,
    pg_blocking_pids(pid) as blocking_pids,
    now() - query_start as age,
    left(query, 240) as query
  from pg_stat_activity
  where datname = current_database()
    and pid <> pg_backend_pid()
    and (
      wait_event_type = 'Lock'
      or state = 'idle in transaction'
      or cardinality(pg_blocking_pids(pid)) > 0
    )
  order by query_start;
`

try {
  await client.connect()

  console.log(`Connected to ${client.database}. Looking for stale blockers older than ${minAgeSeconds}s.`)

  const blockers = await client.query(blockerQuery, [minAgeSeconds])
  printRows(dryRun ? 'Matching blockers (dry run)' : 'Matching blockers', blockers.rows)

  if (!dryRun && blockers.rows.length) {
    const terminated = await client.query(terminateQuery, [minAgeSeconds])
    printRows('Terminated blockers', terminated.rows)
  }

  const remaining = await client.query(verificationQuery)
  printRows('Remaining lock waits / idle transactions', remaining.rows)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
