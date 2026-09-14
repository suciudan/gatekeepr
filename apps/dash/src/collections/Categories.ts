import type { CollectionConfig } from 'payload'

import { createSlugHook, setLocalizedKey } from '../lib/contentHooks'
import { syncBlogPostCategoriesAfterCategoryChange } from '../lib/categoryPostSync'
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_SELECT_OPTIONS } from '../lib/languages'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    baseListFilter: () => ({
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    }),
  },
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [syncBlogPostCategoriesAfterCategoryChange],
  },
  fields: [
    {
      name: 'prismicId',
      label: 'Legacy Prismic ID',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
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
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      hooks: {
        beforeValidate: [createSlugHook('name')],
      },
    },
    {
      name: 'slugLocaleKey',
      type: 'text',
      unique: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeValidate: [setLocalizedKey('slug')],
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
