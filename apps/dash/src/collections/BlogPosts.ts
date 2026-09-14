import type { CollectionConfig } from 'payload'

import { externalImageField } from '../fields/externalImage'
import { trackPublishedBlogPostSlugRedirect } from '../lib/blogPostRedirects'
import {
  createSlugHook,
  hydrateRichTextFromHtml,
  setLocalizedKey,
  setBodyText,
  setCategoryNameFromRelationship,
  setCategorySlugFromRelationship,
  setHtmlFromRichText,
  setHeroImageFromMedia,
  setReadTimeFromContent,
  setTextFromRichText,
} from '../lib/contentHooks'
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_SELECT_OPTIONS } from '../lib/languages'
import { createEmptyLexicalState } from '../lib/richText'

const DERIVED_BODY_TEXT_MAX_LENGTH = 1_000_000

function normalizeHost(value: null | string | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getPreviewSiteOrigin(host: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL

  if (configuredSiteUrl) {
    return configuredSiteUrl
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://${host}:3000`
  }

  return `https://gatekeepr.io`
}

function getBlogPostPreviewUrl(
  doc: Record<string, unknown>,
  options: Parameters<NonNullable<NonNullable<CollectionConfig['admin']>['preview']>>[1],
) {
  const slug = pickString(doc.uid).replace(/^\/+|\/+$/g, '')

  if (!slug) {
    return null
  }

  const host = normalizeHost(
    options.req.headers.get('x-forwarded-host') || options.req.headers.get('host'),
  )
  const siteOrigin = getPreviewSiteOrigin(host)

  return new URL(`/${slug}`, siteOrigin).toString()
}

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'uid', 'category', 'author', 'publishedAt', 'updatedAt'],
    baseListFilter: () => ({
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    }),
    preview: getBlogPostPreviewUrl,
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: true,
  },
  hooks: {
    afterChange: [trackPublishedBlogPostSlugRedirect],
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
            exportName: 'BlogPostPrismicIdField',
            path: './components/blog-posts/BlogPostPrismicIdField.tsx',
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
        placeholder: 'Title',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'seoDescription',
      type: 'textarea',
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      defaultValue: createEmptyLexicalState,
      hooks: {
        afterRead: [hydrateRichTextFromHtml('bodyHtml')],
        beforeValidate: [hydrateRichTextFromHtml('bodyHtml')],
      },
    },
    {
      name: 'categoryRef',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
      filterOptions: {
        lang: {
          equals: DEFAULT_LANGUAGE_CODE,
        },
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      index: true,
      filterOptions: {
        lang: {
          equals: DEFAULT_LANGUAGE_CODE,
        },
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'heroImageMedia',
      label: 'Hero Image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'category',
      type: 'text',
      index: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [setCategoryNameFromRelationship],
      },
    },
    {
      name: 'categorySlug',
      type: 'text',
      index: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [setCategorySlugFromRelationship],
      },
    },
    externalImageField('heroImage', 'Hero Image', {
      hidden: true,
      hooks: {
        beforeChange: [setHeroImageFromMedia],
      },
    }),
    {
      name: 'bodyHtml',
      type: 'code',
      admin: {
        editorOptions: {
          language: 'html',
        },
        hidden: true,
      },
      hooks: {
        beforeChange: [setHtmlFromRichText('body')],
      },
    },
    {
      name: 'bodyText',
      type: 'textarea',
      maxLength: DERIVED_BODY_TEXT_MAX_LENGTH,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [setTextFromRichText('body', 'bodyHtml')],
        beforeValidate: [setBodyText],
      },
    },
    {
      name: 'readTime',
      type: 'text',
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [setReadTimeFromContent],
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
