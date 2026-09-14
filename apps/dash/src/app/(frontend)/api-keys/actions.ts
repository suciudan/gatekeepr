'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  createApiKey,
  toggleApiKey,
  updateApiKey,
  type ApiKeyInput,
} from '@/lib/apiKeys'
import { requireDashboardAdmin } from '@/lib/dashboardAuth'

function readApiKeyInput(formData: FormData): ApiKeyInput {
  const email = String(formData.get('email') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim()

  if (!email) {
    throw new Error('Client email is required.')
  }

  if (!website) {
    throw new Error('Client site is required.')
  }

  return { email, website }
}

export async function createApiKeyAction(formData: FormData): Promise<void> {
  await requireDashboardAdmin()
  await createApiKey(readApiKeyInput(formData))

  revalidatePath('/')
  revalidatePath('/api-keys')
  redirect('/api-keys?created=true')
}

export async function updateApiKeyAction(apiKey: string, formData: FormData): Promise<void> {
  await requireDashboardAdmin()
  await updateApiKey(apiKey, readApiKeyInput(formData))

  revalidatePath('/')
  revalidatePath('/api-keys')
  redirect('/api-keys?updated=true')
}

export async function toggleApiKeyAction(formData: FormData): Promise<void> {
  await requireDashboardAdmin()
  const apiKey = String(formData.get('apiKey') ?? '').trim()

  if (!apiKey) {
    throw new Error('API key is required.')
  }

  await toggleApiKey(apiKey)

  revalidatePath('/')
  revalidatePath('/api-keys')
}
