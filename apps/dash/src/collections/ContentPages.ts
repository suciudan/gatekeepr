import type { CollectionConfig } from 'payload'

import {
  createSlugHook,
  hydrateRichTextFromHtml,
  setLocalizedKey,
  setHtmlFromRichText,
} from '../lib/contentHooks'
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_SELECT_OPTIONS } from '../lib/languages'
import { createEmptyLexicalState } from '../lib/richText'

export const ContentPages: CollectionConfig = {
  slug: 'content-pages',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'uid', 'lastPublishedAt', 'updatedAt'],
    baseListFilter: () => ({
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    }),
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'prismicId',
      label: 'Legacy Prismic ID',
      type: 'text',
      unique: true,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'prismicIdField',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: {
            exportName: 'ContentPagePrismicIdField',
            path: './components/content-pages/ContentPagePrismicIdField.tsx',
          },
        },
      },
    },
    {
      name: 'uid',
      type: 'text',
      required: true,
      index: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeValidate: [createSlugHook('title')],
      },
    },
    {
      name: 'uidLocaleKey',
      type: 'text',
      unique: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeValidate: [setLocalizedKey('uid')],
      },
    },
    {
      name: 'lang',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_LANGUAGE_CODE,
      index: true,
      options: LANGUAGE_SELECT_OPTIONS,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Page title shown to editors and downstream consumers.',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      defaultValue: createEmptyLexicalState,
      admin: {
        description: 'Primary page content editor.',
      },
      hooks: {
        afterRead: [hydrateRichTextFromHtml('contentHtml')],
        beforeValidate: [hydrateRichTextFromHtml('contentHtml')],
      },
    },
    {
      name: 'seoDescription',
      type: 'textarea',
    },
    {
      name: 'contentHtml',
      type: 'code',
      admin: {
        editorOptions: {
          language: 'html',
        },
        hidden: true,
      },
      hooks: {
        beforeChange: [setHtmlFromRichText('content')],
      },
    },
    {
      name: 'firstPublishedAt',
      type: 'date',
      index: true,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'lastPublishedAt',
      type: 'date',
      index: true,
      admin: {
        hidden: true,
      },
    },
  ],
}
