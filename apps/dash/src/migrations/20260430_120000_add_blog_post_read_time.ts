import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "blog_posts"
    ADD COLUMN IF NOT EXISTS "read_time" varchar;
  `)

  await db.execute(`
    ALTER TABLE "_blog_posts_v"
    ADD COLUMN IF NOT EXISTS "version_read_time" varchar;
  `)

  await db.execute(`
    WITH source AS (
      SELECT
        id,
        COALESCE(
          NULLIF(TRIM("body_text"), ''),
          NULLIF(
            TRIM(
              regexp_replace(
                regexp_replace(
                  regexp_replace(COALESCE("body_html", ''), '<(script|style)[^>]*>.*?</\\1>', ' ', 'gis'),
                  '<[^>]+>',
                  ' ',
                  'g'
                ),
                '\\s+',
                ' ',
                'g'
              )
            ),
            ''
          ),
          ''
        ) AS content_text
      FROM "blog_posts"
    ),
    word_counts AS (
      SELECT
        id,
        CASE
          WHEN content_text = '' THEN 0
          ELSE cardinality(regexp_split_to_array(content_text, '\\s+'))
        END AS word_count
      FROM source
    )
    UPDATE "blog_posts" AS posts
    SET "read_time" = GREATEST(1, CEIL(word_counts.word_count / 225.0))::int::text || ' min read'
    FROM word_counts
    WHERE posts.id = word_counts.id;
  `)

  await db.execute(`
    WITH source AS (
      SELECT
        id,
        COALESCE(
          NULLIF(TRIM("version_body_text"), ''),
          NULLIF(
            TRIM(
              regexp_replace(
                regexp_replace(
                  regexp_replace(COALESCE("version_body_html", ''), '<(script|style)[^>]*>.*?</\\1>', ' ', 'gis'),
                  '<[^>]+>',
                  ' ',
                  'g'
                ),
                '\\s+',
                ' ',
                'g'
              )
            ),
            ''
          ),
          ''
        ) AS content_text
      FROM "_blog_posts_v"
    ),
    word_counts AS (
      SELECT
        id,
        CASE
          WHEN content_text = '' THEN 0
          ELSE cardinality(regexp_split_to_array(content_text, '\\s+'))
        END AS word_count
      FROM source
    )
    UPDATE "_blog_posts_v" AS versions
    SET "version_read_time" = GREATEST(1, CEIL(word_counts.word_count / 225.0))::int::text || ' min read'
    FROM word_counts
    WHERE versions.id = word_counts.id;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "_blog_posts_v"
    DROP COLUMN IF EXISTS "version_read_time";
  `)

  await db.execute(`
    ALTER TABLE "blog_posts"
    DROP COLUMN IF EXISTS "read_time";
  `)
}
