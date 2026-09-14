import type { CollectionConfig } from 'payload'

import { writerStageOrder, writerTraceProviders, writerTraceStatuses } from '@/lib/aiWriter/types'

export const WriterTraceEvents: CollectionConfig = {
  slug: 'writer-trace-events',
  admin: {
    hidden: true,
    useAsTitle: 'eventType',
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
      name: 'stageKey',
      type: 'select',
      index: true,
      options: writerStageOrder.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'writer-sources',
      index: true,
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      options: writerTraceProviders.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'eventType',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: writerTraceStatuses.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'requestPayload',
      type: 'json',
    },
    {
      name: 'responsePayload',
      type: 'json',
    },
    {
      name: 'errorText',
      type: 'textarea',
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
