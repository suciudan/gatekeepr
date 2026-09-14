import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

// Keep the generated JSON snapshot as the baseline for future schema diffs,
// but make the executable migration production-safe for an already-live DB.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "blog_posts"
    ADD COLUMN IF NOT EXISTS "seo_description" varchar;
  `)

  await db.execute(`
    ALTER TABLE "_blog_posts_v"
    ADD COLUMN IF NOT EXISTS "version_seo_description" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "_blog_posts_v"
    DROP COLUMN IF EXISTS "version_seo_description";
  `)

  await db.execute(`
    ALTER TABLE "blog_posts"
    DROP COLUMN IF EXISTS "seo_description";
  `)
}
