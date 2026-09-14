import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_blog_post_redirects_lang" AS ENUM('en');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "blog_post_redirects" (
      "id" serial PRIMARY KEY NOT NULL,
      "from_uid" varchar NOT NULL,
      "to_uid" varchar NOT NULL,
      "lang" "enum_blog_post_redirects_lang" DEFAULT 'en' NOT NULL,
      "redirect_key" varchar,
      "post_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "blog_post_redirects_id" integer;

    DO $$ BEGIN
      ALTER TABLE "blog_post_redirects"
        ADD CONSTRAINT "blog_post_redirects_post_id_blog_posts_id_fk"
        FOREIGN KEY ("post_id")
        REFERENCES "public"."blog_posts"("id")
        ON DELETE set null
        ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_blog_post_redirects_fk"
        FOREIGN KEY ("blog_post_redirects_id")
        REFERENCES "public"."blog_post_redirects"("id")
        ON DELETE cascade
        ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "blog_post_redirects_from_uid_idx" ON "blog_post_redirects" USING btree ("from_uid");
    CREATE INDEX IF NOT EXISTS "blog_post_redirects_to_uid_idx" ON "blog_post_redirects" USING btree ("to_uid");
    CREATE INDEX IF NOT EXISTS "blog_post_redirects_lang_idx" ON "blog_post_redirects" USING btree ("lang");
    CREATE UNIQUE INDEX IF NOT EXISTS "blog_post_redirects_redirect_key_idx" ON "blog_post_redirects" USING btree ("redirect_key");
    CREATE INDEX IF NOT EXISTS "blog_post_redirects_post_idx" ON "blog_post_redirects" USING btree ("post_id");
    CREATE INDEX IF NOT EXISTS "blog_post_redirects_updated_at_idx" ON "blog_post_redirects" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "blog_post_redirects_created_at_idx" ON "blog_post_redirects" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_blog_post_redirects_id_idx"
      ON "payload_locked_documents_rels" USING btree ("blog_post_redirects_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_blog_post_redirects_fk";

    ALTER TABLE "blog_post_redirects"
      DROP CONSTRAINT IF EXISTS "blog_post_redirects_post_id_blog_posts_id_fk";

    DROP INDEX IF EXISTS "payload_locked_documents_rels_blog_post_redirects_id_idx";

    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "blog_post_redirects_id";

    DROP TABLE IF EXISTS "blog_post_redirects" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_blog_post_redirects_lang";
  `)
}
