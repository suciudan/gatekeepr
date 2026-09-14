import type { CollectionConfig } from 'payload'

export const WriterRemoteFiles: CollectionConfig = {
  slug: 'writer-remote-files',
  admin: {
    hidden: true,
    useAsTitle: 'fileId',
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
      name: 'artifact',
      type: 'relationship',
      relationTo: 'writer-artifacts',
      index: true,
    },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'writer-sources',
      index: true,
    },
    {
      name: 'provider',
      type: 'text',
      required: true,
    },
    {
      name: 'fileId',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'artifactHash',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'text',
      required: true,
      defaultValue: 'active',
    },
    {
      name: 'metadata',
      type: 'json',
    },
    {
      name: 'errorText',
      type: 'textarea',
    },
    {
      name: 'lastUsedAt',
      type: 'date',
    },
    {
      name: 'deleteAttemptedAt',
      type: 'date',
    },
    {
      name: 'deletedAt',
      type: 'date',
    },
  ],
}
