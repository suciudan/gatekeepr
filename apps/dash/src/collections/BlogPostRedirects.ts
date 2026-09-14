import type { CollectionConfig, FieldHook } from 'payload'

import { DEFAULT_LANGUAGE_CODE, LANGUAGE_SELECT_OPTIONS } from '../lib/languages'

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const setRedirectKey: FieldHook = ({ siblingData, value }) => {
  const siblingValues = siblingData as Record<string, unknown> | undefined
  const language = pickString(siblingValues?.lang) || DEFAULT_LANGUAGE_CODE
  const fromUid = pickString(siblingValues?.fromUid)

  return fromUid ? `${language}:${fromUid}` : pickString(value)
}

function validateDestinationUid(value: unknown, options: { siblingData?: Record<string, unknown> }): true | string {
  const fromUid = pickString(options.siblingData?.fromUid)
  const toUid = pickString(value)

  if (fromUid && toUid && fromUid === toUid) {
    return 'Destination slug must be different from the source slug.'
  }

  return true
}

export const BlogPostRedirects: CollectionConfig = {
  slug: 'blog-post-redirects',
  admin: {
    group: 'Content',
    useAsTitle: 'fromUid',
    defaultColumns: ['fromUid', 'toUid', 'post', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'fromUid',
      label: 'Source Slug',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'toUid',
      label: 'Destination Slug',
      type: 'text',
      required: true,
      index: true,
      validate: validateDestinationUid,
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
      name: 'redirectKey',
      type: 'text',
      unique: true,
      admin: {
        hidden: true,
      },
      hooks: {
        beforeValidate: [setRedirectKey],
      },
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'blog-posts',
      index: true,
    },
  ],
}
