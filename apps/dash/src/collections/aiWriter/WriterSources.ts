import type { CollectionConfig } from 'payload'

import { writerSourceFetchStatuses, writerSourceRoles } from '@/lib/aiWriter/types'

export const WriterSources: CollectionConfig = {
  slug: 'writer-sources',
  admin: {
    hidden: true,
    useAsTitle: 'url',
  },
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
    update: () => true,
  },
  fields: [
    {
      name: 'run',
      type: 'relationship',
      relationTo: 'writer-runs',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      index: true,
      options: writerSourceRoles.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'normalizedUrl',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'metaDescription',
      type: 'textarea',
    },
    {
      name: 'serpPosition',
      type: 'number',
    },
    {
      name: 'snippet',
      type: 'textarea',
    },
    {
      name: 'selected',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'fetchStatus',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: writerSourceFetchStatuses.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'fetchError',
      type: 'textarea',
    },
  ],
}
