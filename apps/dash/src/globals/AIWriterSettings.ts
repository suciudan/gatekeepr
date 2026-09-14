import type { GlobalConfig } from 'payload'

export const aiWriterProviders = ['anthropic', 'openai'] as const

export type AIWriterProvider = (typeof aiWriterProviders)[number]

export const anthropicModelOptions = [
  {
    label: 'Claude Opus 4.7',
    value: 'claude-opus-4-7',
  },
  {
    label: 'Claude Opus 4.1',
    value: 'claude-opus-4-1-20250805',
  },
  {
    label: 'Claude Opus 4',
    value: 'claude-opus-4-20250514',
  },
  {
    label: 'Claude Sonnet 4',
    value: 'claude-sonnet-4-20250514',
  },
  {
    label: 'Claude Sonnet 3.7',
    value: 'claude-3-7-sonnet-20250219',
  },
] as const

export const openAIModelOptions = [
  {
    label: 'GPT-5.5',
    value: 'gpt-5.5',
  },
  {
    label: 'GPT-5.4',
    value: 'gpt-5.4',
  },
  {
    label: 'GPT-5.4 mini',
    value: 'gpt-5.4-mini',
  },
  {
    label: 'GPT-5.4 nano',
    value: 'gpt-5.4-nano',
  },
  {
    label: 'GPT-5.2',
    value: 'gpt-5.2',
  },
  {
    label: 'GPT-5.1',
    value: 'gpt-5.1',
  },
  {
    label: 'GPT-5',
    value: 'gpt-5',
  },
  {
    label: 'GPT-5 mini',
    value: 'gpt-5-mini',
  },
  {
    label: 'GPT-4.1',
    value: 'gpt-4.1',
  },
] as const

export const AIWriterSettings: GlobalConfig = {
  slug: 'ai-writer-settings',
  admin: {
    group: 'Management',
  },
  access: {
    read: () => true,
    update: () => true,
  },
  fields: [
    {
      name: 'provider',
      type: 'select',
      defaultValue: 'anthropic',
      label: 'Provider',
      options: [
        {
          label: 'Anthropic',
          value: 'anthropic',
        },
        {
          label: 'ChatGPT',
          value: 'openai',
        },
      ],
      required: true,
    },
    {
      name: 'anthropicModel',
      type: 'select',
      admin: {
        condition: (_, siblingData) => siblingData?.provider === 'anthropic',
      },
      defaultValue: 'claude-sonnet-4-20250514',
      label: 'Anthropic version',
      options: [...anthropicModelOptions],
      required: true,
    },
    {
      name: 'openaiModel',
      type: 'select',
      admin: {
        condition: (_, siblingData) => siblingData?.provider === 'openai',
      },
      defaultValue: 'gpt-5.5',
      label: 'ChatGPT version',
      options: [...openAIModelOptions],
      required: true,
    },
  ],
  label: 'AI Writer',
}
