import 'dotenv/config'

import { getCmsPayload } from '../lib/payload'
import {
  analyzeLegacyCodeBlockBackfill,
  buildLegacyCodeBlockBackfillData,
  selectLegacyCodeBlockBackfillSource,
} from '../lib/legacyCodeBlockBackfill'
import type { BlogPost } from '../payload-types'

type Options = {
  dryRun: boolean
  id?: number
  lang?: BlogPost['lang']
  limit?: number
  pageSize: number
  uid?: string
  verbose: boolean
}

type BackfillResult = {
  dryRun: boolean
  examined: number
  matched: number
  updated: number
  skipped: number
  docs: Array<{
    currentHtmlPreCount: number
    currentLexicalCodeBlockCount: number
    draftHtmlPreCount: number
    draftLexicalCodeBlockCount: number
    htmlPreCount: number
    id: number
    lexicalCodeBlockCount: number
    matched: boolean
    source: 'current' | 'draft'
    status: null | string
    title: string
    uid: string
  }>
}

type RawBackfillRow = {
  body: unknown
  bodyHtml: null | string
  draftBody: unknown
  draftBodyHtml: null | string
  draftStatus: null | string
  id: number
  status: null | string
  title: string
  uid: string
}

function logProgress(message: string) {
  process.stderr.write(`[backfill:legacy-code-blocks] ${message}\n`)
}

function isPostgresAdapter(adapter: object): adapter is { pool: { query: (query: string, params: unknown[]) => Promise<{ rows: unknown[] }> }, schemaName?: string } {
  return 'pool' in adapter
}

function isSqliteAdapter(adapter: object): adapter is { drizzle: { $client: { execute: (query: string) => Promise<{ rows?: unknown[] }> } } } {
  return 'drizzle' in adapter
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toRawBackfillRow(row: Record<string, unknown>): RawBackfillRow {
  return {
    body: parseJsonValue(row.body),
    bodyHtml: typeof row.bodyHtml === 'string' ? row.bodyHtml : null,
    draftBody: parseJsonValue(row.draftBody),
    draftBodyHtml: typeof row.draftBodyHtml === 'string' ? row.draftBodyHtml : null,
    draftStatus: typeof row.draftStatus === 'string' ? row.draftStatus : null,
    id: Number(row.id),
    status: typeof row.status === 'string' ? row.status : null,
    title: typeof row.title === 'string' ? row.title : '',
    uid: typeof row.uid === 'string' ? row.uid : '',
  }
}

function createWhereFragments(options: Options) {
  const sqlFragments: string[] = []
  const params: unknown[] = []

  if (typeof options.id === 'number') {
    params.push(options.id)
    sqlFragments.push(`bp.id = $${params.length}`)
  }

  if (options.lang) {
    params.push(options.lang)
    sqlFragments.push(`bp.lang = $${params.length}`)
  }

  if (options.uid) {
    params.push(options.uid)
    sqlFragments.push(`bp.uid = $${params.length}`)
  }

  return {
    params,
    sql: sqlFragments.length ? `WHERE ${sqlFragments.join(' AND ')}` : '',
  }
}

async function queryRawBackfillRows(options: {
  filters: Options
  offset: number
  pageSize: number
}) {
  const payload = await getCmsPayload()
  const where = createWhereFragments(options.filters)
  const adapter = payload.db as unknown as object

  if (isPostgresAdapter(adapter)) {
    const schemaName = adapter.schemaName || 'public'
    const params = [...where.params, options.pageSize, options.offset]
    const result = await adapter.pool.query(
      `
        SELECT
          bp.id,
          bp.title,
          bp.uid,
          bp._status AS status,
          bp.body,
          bp.body_html AS "bodyHtml",
          v.version__status AS "draftStatus",
          v.version_body AS "draftBody",
          v.version_body_html AS "draftBodyHtml"
        FROM "${schemaName}"."blog_posts" AS bp
        LEFT JOIN "${schemaName}"."_blog_posts_v" AS v
          ON v.parent_id = bp.id
         AND v.latest = true
        ${where.sql}
        ORDER BY bp.id
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `,
      params,
    )

    return (result.rows as Record<string, unknown>[]).map(toRawBackfillRow)
  }

  if (isSqliteAdapter(adapter)) {
    const sqliteWhereSql = where.sql.replaceAll(/\$(\d+)/g, (_match, index) => {
      const value = where.params[Number(index) - 1]
      return typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
    })

    const result = await adapter.drizzle.$client.execute(`
      SELECT
        bp.id,
        bp.title,
        bp.uid,
        bp._status AS status,
        bp.body,
        bp.body_html AS bodyHtml,
        v.version__status AS draftStatus,
        v.version_body AS draftBody,
        v.version_body_html AS draftBodyHtml
      FROM blog_posts AS bp
      LEFT JOIN _blog_posts_v AS v
        ON v.parent_id = bp.id
       AND v.latest = 1
      ${sqliteWhereSql}
      ORDER BY bp.id
      LIMIT ${options.pageSize}
      OFFSET ${options.offset}
    `)

    return ((result.rows || []) as Record<string, unknown>[]).map(toRawBackfillRow)
  }

  throw new Error('Unsupported database adapter for legacy code block backfill.')
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer.`)
  }

  return parsed
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    pageSize: 100,
    verbose: false,
  }

  for (const argument of argv) {
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--help') {
      printUsage()
      process.exit(0)
    }

    if (argument === '--verbose') {
      options.verbose = true
      continue
    }

    if (argument.startsWith('--id=')) {
      options.id = parsePositiveInteger(argument.slice('--id='.length), '--id')
      continue
    }

    if (argument.startsWith('--lang=')) {
      const value = argument.slice('--lang='.length).trim()
      if (!value) {
        throw new Error('--lang requires a value.')
      }

      if (!['en', 'fr', 'de', 'pt', 'zh', 'es'].includes(value)) {
        throw new Error(`Unsupported --lang value "${value}".`)
      }

      options.lang = value as BlogPost['lang']
      continue
    }

    if (argument.startsWith('--uid=')) {
      const value = argument.slice('--uid='.length).trim()
      if (!value) {
        throw new Error('--uid requires a value.')
      }

      options.uid = value
      continue
    }

    if (argument.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(argument.slice('--limit='.length), '--limit')
      continue
    }

    if (argument.startsWith('--page-size=')) {
      options.pageSize = parsePositiveInteger(argument.slice('--page-size='.length), '--page-size')
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

function printUsage() {
  console.log(`Usage: yarn workspace cms backfill:legacy-code-blocks [options]

Options:
  --dry-run            Report affected docs without saving changes.
  --id=NUMBER          Backfill a single blog post ID.
  --lang=CODE          Restrict to a locale (en, fr, de, pt, zh, es).
  --uid=VALUE          Restrict to a specific blog post uid.
  --limit=NUMBER       Stop after examining this many docs.
  --page-size=NUMBER   Pagination size when scanning docs. Default: 100.
  --verbose            Include inspected docs even when they do not match.
  --help               Show this help output.
`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const payload = await getCmsPayload()
  try {
    logProgress(
      `Starting${options.dryRun ? ' dry run' : ''} with page size ${options.pageSize}${
        options.limit ? `, limit ${options.limit}` : ''
      }${options.lang ? `, lang ${options.lang}` : ''}${typeof options.id === 'number' ? `, id ${options.id}` : ''}${
        options.uid ? `, uid ${options.uid}` : ''
      }.`,
    )
    const result: BackfillResult = {
      docs: [],
      dryRun: options.dryRun,
      examined: 0,
      matched: 0,
      skipped: 0,
      updated: 0,
    }

    let page = 1

    while (true) {
      const remaining = options.limit ? Math.max(options.limit - result.examined, 0) : options.pageSize
      if (remaining === 0) {
        break
      }

      const rows = await queryRawBackfillRows({
        filters: options,
        offset: (page - 1) * options.pageSize,
        pageSize: Math.min(options.pageSize, remaining),
      })

      if (rows.length === 0) {
        logProgress(`No rows returned for page ${page}.`)
        break
      }

      logProgress(`Fetched page ${page} with ${rows.length} row${rows.length === 1 ? '' : 's'}.`)

      for (const doc of rows) {
        result.examined += 1
        const currentAnalysis = analyzeLegacyCodeBlockBackfill({
          body: doc.body,
          bodyHtml: doc.bodyHtml,
        })
        const draftAnalysis = analyzeLegacyCodeBlockBackfill({
          body: doc.draftBody,
          bodyHtml: doc.draftBodyHtml,
        })
        const source = selectLegacyCodeBlockBackfillSource({
          body: doc.body,
          bodyHtml: doc.bodyHtml,
          draftBody: doc.draftBody,
          draftBodyHtml: doc.draftBodyHtml,
          draftStatus: doc.draftStatus,
          status: doc.status,
        })

        if (!source) {
          if (options.verbose || options.id === doc.id || options.uid === doc.uid) {
            result.docs.push({
              currentHtmlPreCount: currentAnalysis.htmlPreCount,
              currentLexicalCodeBlockCount: currentAnalysis.lexicalCodeBlockCount,
              draftHtmlPreCount: draftAnalysis.htmlPreCount,
              draftLexicalCodeBlockCount: draftAnalysis.lexicalCodeBlockCount,
              htmlPreCount: 0,
              id: doc.id,
              lexicalCodeBlockCount: 0,
              matched: false,
              source: doc.draftStatus === 'draft' ? 'draft' : 'current',
              status: doc.draftStatus === 'draft' ? doc.draftStatus : doc.status,
              title: doc.title,
              uid: doc.uid,
            })
          }
          result.skipped += 1
          continue
        }

        result.matched += 1
        result.docs.push({
          currentHtmlPreCount: currentAnalysis.htmlPreCount,
          currentLexicalCodeBlockCount: currentAnalysis.lexicalCodeBlockCount,
          draftHtmlPreCount: draftAnalysis.htmlPreCount,
          draftLexicalCodeBlockCount: draftAnalysis.lexicalCodeBlockCount,
          htmlPreCount: source.analysis.htmlPreCount,
          id: doc.id,
          lexicalCodeBlockCount: source.analysis.lexicalCodeBlockCount,
          matched: true,
          source: source.source,
          status: source.status ?? null,
          title: doc.title,
          uid: doc.uid,
        })

        if (options.dryRun) {
          continue
        }

        const data = await buildLegacyCodeBlockBackfillData({
          body: source.body,
          bodyHtml: source.bodyHtml,
        })
        if (!data) {
          continue
        }

        await payload.update({
          collection: 'blog-posts',
          data,
          id: doc.id,
          overrideAccess: true,
          ...((source.source === 'draft' || source.status === 'draft') ? { draft: true } : {}),
        })

        result.updated += 1
      }

      logProgress(
        `Processed ${result.examined} docs so far: matched ${result.matched}, updated ${result.updated}, skipped ${result.skipped}.`,
      )

      if (rows.length < Math.min(options.pageSize, remaining)) {
        break
      }

      page += 1
    }

    logProgress(
      `Finished. Examined ${result.examined}, matched ${result.matched}, updated ${result.updated}, skipped ${result.skipped}.`,
    )
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await payload.destroy()
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
