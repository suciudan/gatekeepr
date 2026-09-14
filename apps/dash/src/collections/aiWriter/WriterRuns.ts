import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { deleteWriterRunChildren } from '@/lib/aiWriter/deleteRun'
import { writerRunStatuses, writerStageOrder } from '@/lib/aiWriter/types'

const deleteWriterRunChildrenBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await deleteWriterRunChildren(id, req)
}

export const WriterRuns: CollectionConfig = {
  slug: 'writer-runs',
  admin: {
    defaultColumns: ['targetKeyword', 'status', 'currentStage', 'createdDraft', 'updatedAt'],
    group: '',
    components: {
      edit: {
        editMenuItems: [
          {
            exportName: 'WriterRunExportMenuItem',
            path: './components/ai-writer/WriterRunExportMenuItem.tsx',
          },
        ],
        SaveButton: {
          exportName: 'WriterRunSaveButton',
          path: './components/ai-writer/WriterRunSaveButton.tsx',
        },
      },
    },
  },
  labels: {
    plural: 'AI Writer',
    singular: 'AI Flow',
  },
  access: {
    create: () => true,
    delete: () => true,
    read: () => true,
    update: () => true,
  },
  hooks: {
    beforeDelete: [deleteWriterRunChildrenBeforeDelete],
  },
  fields: [
    {
      name: 'flowDetail',
      type: 'ui',
      admin: {
        components: {
          Field: {
            exportName: 'WriterRunFlowField',
            path: './components/ai-writer/WriterRunFlowField.tsx',
          },
        },
      },
    },
    {
      name: 'targetKeyword',
      type: 'text',
      required: true,
      index: true,
      admin: {
        condition: (data) => !data?.id,
        description: 'Primary keyword or topic the article should target.',
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      required: true,
      admin: {
        condition: (data) => !data?.id,
        description: 'Original source URL the workflow should analyze before discovering competitors.',
      },
    },
    {
      name: 'titleBehavior',
      type: 'ui',
      admin: {
        components: {
          Field: {
            exportName: 'WriterRunTitleField',
            path: './components/ai-writer/WriterRunTitleField.tsx',
          },
        },
      },
    },
    {
      name: 'continueFlow',
      type: 'ui',
      admin: {
        components: {
          Field: {
            exportName: 'WriterRunContinueField',
            path: './components/ai-writer/WriterRunContinueField.tsx',
          },
        },
      },
    },
    {
      name: 'normalizedSourceUrl',
      type: 'text',
      required: true,
      index: true,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'writeUserPrompt',
      type: 'textarea',
      defaultValue: '',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: writerRunStatuses.map((value) => ({
        label: value,
        value,
      })),
      admin: {
        hidden: true,
      },
    },
    {
      name: 'currentStage',
      type: 'select',
      index: true,
      options: writerStageOrder.map((value) => ({
        label: value,
        value,
      })),
      admin: {
        hidden: true,
      },
    },
    {
      name: 'originalWordCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'targetWordCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'errorMessage',
      type: 'textarea',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'createdDraft',
      type: 'relationship',
      relationTo: 'blog-posts',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'automationLeaseOwner',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'automationLeaseToken',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'automationLeaseExpiresAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'automationHeartbeatAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
  ],
}
