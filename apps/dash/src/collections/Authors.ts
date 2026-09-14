import type { CollectionConfig } from 'payload'

import { externalImageField } from '../fields/externalImage'
import {
  createSlugHook,
  setExternalImageFromMedia,
  setLocalizedKey,
  setStringFromSibling,
} from '../lib/contentHooks'
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_SELECT_OPTIONS } from '../lib/languages'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'position', 'updatedAt'],
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
      name: 'uid',
      type: 'text',
      required: true,
      index: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeValidate: [createSlugHook('slug')],
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
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      hooks: {
        beforeValidate: [createSlugHook('name')],
      },
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
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'position',
      type: 'text',
    },
    {
      name: 'role',
      type: 'text',
      admin: {
        hidden: true,
      },
      hooks: {
        beforeChange: [setStringFromSibling('position')],
      },
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'shortBio',
      type: 'textarea',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'avatarMedia',
      label: 'Avatar',
      type: 'upload',
      relationTo: 'media',
      admin: {
        position: 'sidebar',
      },
    },
    externalImageField('avatar', 'Avatar', {
      hidden: true,
      hooks: {
        beforeChange: [setExternalImageFromMedia('avatarMedia')],
      },
    }),
    {
      name: 'handle',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'linkedinUrl',
      type: 'text',
      label: 'linkedin_url',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'githubUrl',
      type: 'text',
      label: 'github_url',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'credentials',
      type: 'array',
      admin: {
        hidden: true,
      },
      fields: [
        {
          name: 'value',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'knowsAbout',
      type: 'array',
      admin: {
        hidden: true,
      },
      fields: [
        {
          name: 'value',
          type: 'text',
          required: true,
        },
      ],
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
