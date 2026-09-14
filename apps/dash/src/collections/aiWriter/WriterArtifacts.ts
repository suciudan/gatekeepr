import type { CollectionConfig } from 'payload'

import { writerArtifactRoles, writerArtifactTypes } from '@/lib/aiWriter/types'

export const WriterArtifacts: CollectionConfig = {
  slug: 'writer-artifacts',
  admin: {
    hidden: true,
    useAsTitle: 'filename',
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
      name: 'source',
      type: 'relationship',
      relationTo: 'writer-sources',
      index: true,
    },
    {
      name: 'artifactType',
      type: 'select',
      required: true,
      index: true,
      options: writerArtifactTypes.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'artifactRole',
      type: 'select',
      required: true,
      defaultValue: 'derived',
      options: writerArtifactRoles.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'schemaName',
      type: 'text',
    },
    {
      name: 'schemaVersion',
      type: 'text',
    },
    {
      name: 'sha256',
      type: 'text',
      index: true,
    },
    {
      name: 'producedByJob',
      type: 'relationship',
      relationTo: 'writer-jobs',
    },
    {
      name: 'supersedesArtifact',
      type: 'relationship',
      relationTo: 'writer-artifacts',
    },
    {
      name: 'mimeType',
      type: 'text',
      required: true,
    },
    {
      name: 'filename',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'code',
      admin: {
        editorOptions: {
          language: 'markdown',
        },
      },
      required: true,
    },
  ],
}
