import { admins } from '@repo/config/admins'
import { headers as getHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@/payload.config'

type DashboardUser = {
  email?: string | null
}

export type DashboardSession = {
  authorized: boolean
  email: string
  user: DashboardUser
}

function isConfiguredAdmin(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase()

  return admins.some((adminEmail) => adminEmail.trim().toLowerCase() === normalizedEmail)
}

export async function getDashboardSession(): Promise<DashboardSession | null> {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) return null

  const dashboardUser = user as DashboardUser
  const email = dashboardUser.email ?? ''

  return {
    authorized: isConfiguredAdmin(email),
    email,
    user: dashboardUser,
  }
}

export async function requireDashboardAdmin(): Promise<DashboardSession> {
  const session = await getDashboardSession()

  if (!session) {
    redirect('/admin/login?redirect=/')
  }

  if (!session.authorized) {
    throw new Error('This Payload user is not allowed to manage Gatekeepr API keys.')
  }

  return session
}
