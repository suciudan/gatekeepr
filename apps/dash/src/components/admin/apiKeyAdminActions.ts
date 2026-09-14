'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createApiKey, updateApiKey, type ApiKeyInput } from '@/lib/apiKeys'
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

export async function createAdminApiKeyAction(formData: FormData): Promise<void> {
  await requireDashboardAdmin()
  await createApiKey(readApiKeyInput(formData))

  revalidatePath('/')
  revalidatePath('/api-keys')
  revalidatePath('/admin')
  revalidatePath('/admin/api-keys')
  redirect('/admin/api-keys?created=true')
}

export async function updateAdminApiKeyAction(apiKey: string, formData: FormData): Promise<void> {
  await requireDashboardAdmin()
  await updateApiKey(apiKey, readApiKeyInput(formData))

  revalidatePath('/')
  revalidatePath('/api-keys')
  revalidatePath('/admin')
  revalidatePath('/admin/api-keys')
  redirect('/admin/api-keys?updated=true')
}
