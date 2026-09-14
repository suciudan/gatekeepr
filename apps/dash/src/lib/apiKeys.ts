import { randomUUID } from 'crypto'

import { getUsage } from '@repo/core/usage'
import knex from '@repo/db/knex'

type RawUser = {
  apiKey: string
  createdAt?: Date | string | null
  disabled?: boolean | number | null
  email?: string | null
  updatedAt?: Date | string | null
  website?: string | null
}

type UsageWindow = 'LFT' | '1H' | '24H' | '30D'

export type ApiKeyRecord = {
  apiKey: string
  createdAt: string
  disabled: boolean
  email: string
  updatedAt: string
  usage: Record<UsageWindow, number | string>
  website: string
}

export type ApiKeyInput = {
  email: string
  website: string
}

function formatDate(value: RawUser['createdAt']): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function normalizeUsage(usage: Partial<Record<UsageWindow, number | string>>): Record<UsageWindow, number | string> {
  return {
    LFT: usage.LFT ?? 0,
    '1H': usage['1H'] ?? 0,
    '24H': usage['24H'] ?? 0,
    '30D': usage['30D'] ?? 0,
  }
}

async function serializeApiKeyUser(user: RawUser): Promise<ApiKeyRecord> {
  const usage = await getUsage(user.apiKey)

  return {
    apiKey: user.apiKey,
    createdAt: formatDate(user.createdAt),
    disabled: user.disabled === true || user.disabled === 1,
    email: user.email ?? '',
    updatedAt: formatDate(user.updatedAt),
    usage: normalizeUsage(usage),
    website: user.website ?? '',
  }
}

export async function getApiKeys(): Promise<ApiKeyRecord[]> {
  const users = await knex<RawUser>('user')
    .whereNotNull('apiKey')
    .orderBy('createdAt', 'desc')

  return Promise.all(users.map((user) => serializeApiKeyUser(user)))
}

export async function getApiKey(apiKey: string): Promise<ApiKeyRecord | null> {
  const user = await knex<RawUser>('user').where({ apiKey }).first()

  return user ? serializeApiKeyUser(user) : null
}

export async function createApiKey({ email, website }: ApiKeyInput): Promise<string> {
  const apiKey = randomUUID()

  await knex('user').insert({
    apiKey,
    disabled: false,
    email,
    website,
  })

  return apiKey
}

export async function updateApiKey(apiKey: string, { email, website }: ApiKeyInput): Promise<void> {
  await knex('user')
    .where({ apiKey })
    .update({
      email,
      website,
    })
}

export async function toggleApiKey(apiKey: string): Promise<boolean> {
  const user = await knex<RawUser>('user').where({ apiKey }).first()

  if (!user) {
    throw new Error('API key not found')
  }

  const disabled = !(user.disabled === true || user.disabled === 1)

  await knex('user')
    .where({ apiKey })
    .update({ disabled })

  return disabled
}
