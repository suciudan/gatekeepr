import * as migration_20260421_075331_add_blog_post_seo_description_column from './20260421_075331_add_blog_post_seo_description_column';
import * as migration_20260423_112500_reconcile_writer_sources_schema from './20260423_112500_reconcile_writer_sources_schema';
import * as migration_20260426_204200_add_writer_revision_richtext_artifact_type from './20260426_204200_add_writer_revision_richtext_artifact_type';
import * as migration_20260427_092939_add_writer_trace_fetch_provider from './20260427_092939_add_writer_trace_fetch_provider';
import * as migration_20260429_053607_add_blog_post_redirects from './20260429_053607_add_blog_post_redirects';
import * as migration_20260430_120000_add_blog_post_read_time from './20260430_120000_add_blog_post_read_time';
import * as migration_20260506_161800_add_ai_writer_settings from './20260506_161800_add_ai_writer_settings';
import * as migration_20260508_093400_add_claude_opus_4_7_ai_writer_model from './20260508_093400_add_claude_opus_4_7_ai_writer_model';

export const migrations = [
  {
    up: migration_20260421_075331_add_blog_post_seo_description_column.up,
    down: migration_20260421_075331_add_blog_post_seo_description_column.down,
    name: '20260421_075331_add_blog_post_seo_description_column',
  },
  {
    up: migration_20260423_112500_reconcile_writer_sources_schema.up,
    down: migration_20260423_112500_reconcile_writer_sources_schema.down,
    name: '20260423_112500_reconcile_writer_sources_schema',
  },
  {
    up: migration_20260426_204200_add_writer_revision_richtext_artifact_type.up,
    down: migration_20260426_204200_add_writer_revision_richtext_artifact_type.down,
    name: '20260426_204200_add_writer_revision_richtext_artifact_type',
  },
  {
    up: migration_20260427_092939_add_writer_trace_fetch_provider.up,
    down: migration_20260427_092939_add_writer_trace_fetch_provider.down,
    name: '20260427_092939_add_writer_trace_fetch_provider',
  },
  {
    up: migration_20260429_053607_add_blog_post_redirects.up,
    down: migration_20260429_053607_add_blog_post_redirects.down,
    name: '20260429_053607_add_blog_post_redirects'
  },
  {
    up: migration_20260430_120000_add_blog_post_read_time.up,
    down: migration_20260430_120000_add_blog_post_read_time.down,
    name: '20260430_120000_add_blog_post_read_time',
  },
  {
    up: migration_20260506_161800_add_ai_writer_settings.up,
    down: migration_20260506_161800_add_ai_writer_settings.down,
    name: '20260506_161800_add_ai_writer_settings',
  },
  {
    up: migration_20260508_093400_add_claude_opus_4_7_ai_writer_model.up,
    down: migration_20260508_093400_add_claude_opus_4_7_ai_writer_model.down,
    name: '20260508_093400_add_claude_opus_4_7_ai_writer_model',
  },
];
