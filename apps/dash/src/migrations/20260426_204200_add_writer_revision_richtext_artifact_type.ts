import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TYPE "enum_writer_artifacts_artifact_type"
    ADD VALUE IF NOT EXISTS 'article_revision_richtext_json'
    BEFORE 'article_revision_md';
  `)
}

export async function down(args: MigrateDownArgs): Promise<void> {
  void args
  // PostgreSQL cannot drop enum values safely without rebuilding dependent columns.
}
