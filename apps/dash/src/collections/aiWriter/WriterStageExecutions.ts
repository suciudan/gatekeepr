import type { CollectionConfig } from 'payload'

import { writerStageOrder, writerStageStatuses } from '@/lib/aiWriter/types'

export const WriterStageExecutions: CollectionConfig = {
  slug: 'writer-stage-executions',
  admin: {
    hidden: true,
    useAsTitle: 'stageKey',
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
      required: true,
      index: true,
      options: writerStageOrder.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: writerStageStatuses.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'inputPayload',
      type: 'json',
    },
    {
      name: 'outputPayload',
      type: 'json',
    },
    {
      name: 'errorText',
      type: 'textarea',
    },
    {
      name: 'retryCount',
      type: 'number',
      defaultValue: 0,
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
