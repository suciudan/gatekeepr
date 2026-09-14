import type { CollectionConfig } from 'payload'

import { writerJobKinds, writerJobStatuses, writerStageOrder } from '@/lib/aiWriter/types'

export const WriterJobs: CollectionConfig = {
  slug: 'writer-jobs',
  admin: {
    hidden: true,
    useAsTitle: 'kind',
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
      name: 'kind',
      type: 'select',
      required: true,
      options: writerJobKinds.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: writerJobStatuses.map((value) => ({
        label: value,
        value,
      })),
    },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'writer-sources',
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
      name: 'leaseOwner',
      type: 'text',
    },
    {
      name: 'leaseToken',
      type: 'text',
    },
    {
      name: 'leaseExpiresAt',
      type: 'date',
    },
    {
      name: 'leaseHeartbeatAt',
      type: 'date',
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
