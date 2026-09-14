import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TYPE "enum_ai_writer_settings_anthropic_model"
    ADD VALUE IF NOT EXISTS 'claude-opus-4-7'
    BEFORE 'claude-opus-4-1-20250805';
  `)
}

export async function down({}: MigrateDownArgs): Promise<void> {
  // PostgreSQL does not support removing enum values safely in-place.
}
