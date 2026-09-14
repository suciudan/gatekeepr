import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Authors } from './collections/Authors'
import { WriterArtifacts } from './collections/aiWriter/WriterArtifacts'
import { WriterJobs } from './collections/aiWriter/WriterJobs'
import { WriterRemoteFiles } from './collections/aiWriter/WriterRemoteFiles'
import { WriterRuns } from './collections/aiWriter/WriterRuns'
import { WriterSources } from './collections/aiWriter/WriterSources'
import { WriterStageExecutions } from './collections/aiWriter/WriterStageExecutions'
import { WriterTraceEvents } from './collections/aiWriter/WriterTraceEvents'
import { BlogPosts } from './collections/BlogPosts'
import { BlogPostRedirects } from './collections/BlogPostRedirects'
import { Categories } from './collections/Categories'
import { ContentPages } from './collections/ContentPages'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { AIWriterSettings } from './globals/AIWriterSettings'
import { createDatabaseAdapter } from './lib/databaseAdapter'
import { wordPressLikeEditor } from './lib/richText'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const sharpAdapter = sharp as unknown as NonNullable<Parameters<typeof buildConfig>[0]['sharp']>

type CreatePayloadConfigArgs = {
  databaseURL: string
  secret: string
}

export function createPayloadConfig({ databaseURL, secret }: CreatePayloadConfigArgs) {
  return buildConfig({
    admin: {
      user: Users.slug,
      components: {
        beforeDashboard: ['./components/admin/ApiKeysDashboardCard.tsx#ApiKeysDashboardCard'],
        beforeNavLinks: ['./components/admin/GatekeeprNavLinks.tsx#GatekeeprNavLinks'],
        views: {
          apiKeys: {
            Component: './components/admin/AdminApiKeysView.tsx#AdminApiKeysView',
            exact: true,
            path: '/api-keys',
          },
          apiKeysAdd: {
            Component: './components/admin/AdminApiKeyFormViews.tsx#AdminAddApiKeyView',
            exact: true,
            path: '/api-keys/add',
          },
          apiKeysEdit: {
            Component: './components/admin/AdminApiKeyFormViews.tsx#AdminEditApiKeyView',
            exact: true,
            path: '/api-keys/edit/:apiKey',
          },
        },
      },
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      WriterRuns,
      BlogPosts,
      BlogPostRedirects,
      ContentPages,
      Categories,
      Authors,
      WriterSources,
      WriterStageExecutions,
      WriterJobs,
      WriterArtifacts,
      WriterTraceEvents,
      WriterRemoteFiles,
      Media,
      Users,
    ],
    editor: wordPressLikeEditor(),
    globals: [
      AIWriterSettings,
    ],
    secret,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: createDatabaseAdapter(databaseURL),
    sharp: sharpAdapter,
    plugins: [],
  })
}
