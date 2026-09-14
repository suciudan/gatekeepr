import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TYPE "enum_writer_trace_events_provider"
    ADD VALUE IF NOT EXISTS 'fetch'
    AFTER 'brightdata';
  `)
}

export async function down(args: MigrateDownArgs): Promise<void> {
  void args
  // PostgreSQL cannot drop enum values safely without rebuilding dependent columns.
}
