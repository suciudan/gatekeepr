import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_ai_writer_settings_provider" AS ENUM('anthropic', 'openai');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_ai_writer_settings_anthropic_model" AS ENUM(
        'claude-opus-4-1-20250805',
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_ai_writer_settings_openai_model" AS ENUM(
        'gpt-5.5',
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.4-nano',
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5',
        'gpt-5-mini',
        'gpt-4.1'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    ALTER TYPE "enum_ai_writer_settings_openai_model"
    ADD VALUE IF NOT EXISTS 'gpt-5.5'
    BEFORE 'gpt-5.2';

    ALTER TYPE "enum_ai_writer_settings_openai_model"
    ADD VALUE IF NOT EXISTS 'gpt-5.4'
    BEFORE 'gpt-5.2';

    ALTER TYPE "enum_ai_writer_settings_openai_model"
    ADD VALUE IF NOT EXISTS 'gpt-5.4-mini'
    BEFORE 'gpt-5.2';

    ALTER TYPE "enum_ai_writer_settings_openai_model"
    ADD VALUE IF NOT EXISTS 'gpt-5.4-nano'
    BEFORE 'gpt-5.2';

    CREATE TABLE IF NOT EXISTS "ai_writer_settings" (
      "id" serial PRIMARY KEY NOT NULL
    );

    ALTER TABLE "ai_writer_settings"
      ADD COLUMN IF NOT EXISTS "provider" "enum_ai_writer_settings_provider" DEFAULT 'anthropic' NOT NULL,
      ADD COLUMN IF NOT EXISTS "anthropic_model" "enum_ai_writer_settings_anthropic_model" DEFAULT 'claude-sonnet-4-20250514',
      ADD COLUMN IF NOT EXISTS "openai_model" "enum_ai_writer_settings_openai_model" DEFAULT 'gpt-5.2',
      ADD COLUMN IF NOT EXISTS "updated_at" timestamp(3) with time zone DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "created_at" timestamp(3) with time zone DEFAULT now();

    ALTER TABLE "ai_writer_settings"
      ALTER COLUMN "provider" SET DEFAULT 'anthropic',
      ALTER COLUMN "anthropic_model" SET DEFAULT 'claude-sonnet-4-20250514',
      ALTER COLUMN "openai_model" SET DEFAULT 'gpt-5.2',
      ALTER COLUMN "updated_at" SET DEFAULT now(),
      ALTER COLUMN "created_at" SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS "ai_writer_settings_updated_at_idx" ON "ai_writer_settings" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_writer_settings_created_at_idx" ON "ai_writer_settings" USING btree ("created_at");

    ALTER TYPE "enum_writer_trace_events_provider"
    ADD VALUE IF NOT EXISTS 'openai'
    AFTER 'anthropic';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(`
    DROP TABLE IF EXISTS "ai_writer_settings" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_ai_writer_settings_openai_model";
    DROP TYPE IF EXISTS "public"."enum_ai_writer_settings_anthropic_model";
    DROP TYPE IF EXISTS "public"."enum_ai_writer_settings_provider";
  `)
}
