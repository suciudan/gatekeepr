import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$
    BEGIN
      CREATE TYPE "enum_writer_sources_role" AS ENUM ('original', 'competitor');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `)

  await db.execute(`
    DO $$
    BEGIN
      CREATE TYPE "enum_writer_sources_fetch_status" AS ENUM ('pending', 'fetching', 'completed', 'failed');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `)

  await db.execute(`
    ALTER TYPE "enum_writer_sources_fetch_status" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "enum_writer_sources_fetch_status" ADD VALUE IF NOT EXISTS 'fetching';
    ALTER TYPE "enum_writer_sources_fetch_status" ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE "enum_writer_sources_fetch_status" ADD VALUE IF NOT EXISTS 'failed';
  `)

  await db.execute(`
    ALTER TYPE "enum_writer_sources_role" ADD VALUE IF NOT EXISTS 'original';
    ALTER TYPE "enum_writer_sources_role" ADD VALUE IF NOT EXISTS 'competitor';
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "writer_sources" (
      "id" serial PRIMARY KEY NOT NULL,
      "run_id" integer NOT NULL,
      "role" "enum_writer_sources_role" NOT NULL,
      "url" varchar NOT NULL,
      "normalized_url" varchar NOT NULL,
      "title" varchar,
      "meta_description" varchar,
      "serp_position" numeric,
      "snippet" varchar,
      "selected" boolean DEFAULT false,
      "fetch_status" "enum_writer_sources_fetch_status" DEFAULT 'pending' NOT NULL,
      "fetch_error" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)

  await db.execute(`
    ALTER TABLE "writer_sources"
    ADD COLUMN IF NOT EXISTS "run_id" integer,
    ADD COLUMN IF NOT EXISTS "role" "enum_writer_sources_role",
    ADD COLUMN IF NOT EXISTS "url" varchar,
    ADD COLUMN IF NOT EXISTS "normalized_url" varchar,
    ADD COLUMN IF NOT EXISTS "title" varchar,
    ADD COLUMN IF NOT EXISTS "meta_description" varchar,
    ADD COLUMN IF NOT EXISTS "serp_position" numeric,
    ADD COLUMN IF NOT EXISTS "snippet" varchar,
    ADD COLUMN IF NOT EXISTS "selected" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "fetch_status" "enum_writer_sources_fetch_status" DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "fetch_error" varchar;
  `)

  await db.execute(`
    UPDATE "writer_sources"
    SET
      "normalized_url" = COALESCE(NULLIF("normalized_url", ''), "url"),
      "selected" = COALESCE("selected", false),
      "fetch_status" = COALESCE("fetch_status", 'pending'::"enum_writer_sources_fetch_status")
    WHERE
      "normalized_url" IS NULL
      OR "normalized_url" = ''
      OR "selected" IS NULL
      OR "fetch_status" IS NULL;
  `)

  await db.execute(`
    ALTER TABLE "writer_sources"
    ALTER COLUMN "run_id" SET NOT NULL,
    ALTER COLUMN "role" SET NOT NULL,
    ALTER COLUMN "url" SET NOT NULL,
    ALTER COLUMN "normalized_url" SET NOT NULL,
    ALTER COLUMN "selected" SET DEFAULT false,
    ALTER COLUMN "fetch_status" SET DEFAULT 'pending',
    ALTER COLUMN "fetch_status" SET NOT NULL;
  `)

  await db.execute(`
    DO $$
    BEGIN
      ALTER TABLE "writer_sources"
      ADD CONSTRAINT "writer_sources_run_id_writer_runs_id_fk"
      FOREIGN KEY ("run_id") REFERENCES "writer_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "writer_sources_run_idx" ON "writer_sources" ("run_id");
    CREATE INDEX IF NOT EXISTS "writer_sources_role_idx" ON "writer_sources" ("role");
    CREATE INDEX IF NOT EXISTS "writer_sources_normalized_url_idx" ON "writer_sources" ("normalized_url");
    CREATE INDEX IF NOT EXISTS "writer_sources_selected_idx" ON "writer_sources" ("selected");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP INDEX IF EXISTS "writer_sources_selected_idx";
    DROP INDEX IF EXISTS "writer_sources_normalized_url_idx";
  `)

  await db.execute(`
    ALTER TABLE "writer_sources"
    DROP COLUMN IF EXISTS "fetch_error",
    DROP COLUMN IF EXISTS "fetch_status",
    DROP COLUMN IF EXISTS "selected",
    DROP COLUMN IF EXISTS "snippet",
    DROP COLUMN IF EXISTS "serp_position",
    DROP COLUMN IF EXISTS "meta_description",
    DROP COLUMN IF EXISTS "title",
    DROP COLUMN IF EXISTS "normalized_url";
  `)
}
