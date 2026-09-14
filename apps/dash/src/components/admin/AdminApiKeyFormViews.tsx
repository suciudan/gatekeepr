import { DefaultTemplate } from '@payloadcms/next/templates'
import { Button, Gutter } from '@payloadcms/ui'
import { notFound } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import type React from 'react'

import { getApiKey, type ApiKeyRecord } from '@/lib/apiKeys'
import { requireDashboardAdmin } from '@/lib/dashboardAuth'

import { createAdminApiKeyAction, updateAdminApiKeyAction } from './apiKeyAdminActions'

type ApiKeyFormProps = {
  action: (formData: FormData) => void | Promise<void>
  apiKey?: ApiKeyRecord
  submitLabel: string
  title: string
}

function AdminTemplate(props: AdminViewServerProps & { children: React.ReactNode }) {
  return (
    <DefaultTemplate
      i18n={props.i18n}
      locale={props.locale}
      params={props.params}
      payload={props.payload}
      permissions={props.initPageResult.permissions}
      req={props.initPageResult.req}
      searchParams={props.searchParams}
      user={props.initPageResult.req.user ?? undefined}
      viewActions={props.viewActions}
      viewType={props.viewType}
      visibleEntities={props.initPageResult.visibleEntities}
    >
      {props.children}
    </DefaultTemplate>
  )
}

function ApiKeyForm({ action, apiKey, submitLabel, title }: ApiKeyFormProps) {
  return (
    <main className="gatekeepr-admin-form-view">
      <Gutter>
        <header className="list-header">
          <div className="list-header__content">
            <div className="list-header__title-and-actions">
              <h1 className="list-header__title">{title}</h1>
            </div>
          </div>
        </header>

        <form action={action} className="gatekeepr-admin-form">
          {apiKey ? (
            <label className="gatekeepr-admin-field">
              <span>API Key</span>
              <output className="gatekeepr-admin-readonly-field">{apiKey.apiKey}</output>
            </label>
          ) : null}

          <label className="gatekeepr-admin-field">
            <span>Client Email</span>
            <input
              autoComplete="email"
              defaultValue={apiKey?.email}
              name="email"
              placeholder="client@example.com"
              required
              type="email"
            />
          </label>

          <label className="gatekeepr-admin-field">
            <span>Client Site</span>
            <input defaultValue={apiKey?.website} name="website" placeholder="example.com" required type="text" />
          </label>

          <div className="gatekeepr-admin-form-actions">
            <Button buttonStyle="secondary" el="link" to="/admin/api-keys">
              Cancel
            </Button>
            <Button buttonStyle="primary" el="button" type="submit">
              {submitLabel}
            </Button>
          </div>
        </form>
      </Gutter>
    </main>
  )
}

export async function AdminAddApiKeyView(props: AdminViewServerProps) {
  await requireDashboardAdmin()

  return (
    <AdminTemplate {...props}>
      <ApiKeyForm action={createAdminApiKeyAction} submitLabel="Create" title="Add API Key" />
    </AdminTemplate>
  )
}

export async function AdminEditApiKeyView(props: AdminViewServerProps) {
  await requireDashboardAdmin()

  const segments = props.params?.segments
  const encodedApiKey = Array.isArray(segments) ? segments[2] : undefined

  if (!encodedApiKey) {
    notFound()
  }

  const decodedApiKey = decodeURIComponent(encodedApiKey)
  const apiKey = await getApiKey(decodedApiKey)

  if (!apiKey) {
    notFound()
  }

  return (
    <AdminTemplate {...props}>
      <ApiKeyForm
        action={updateAdminApiKeyAction.bind(null, decodedApiKey)}
        apiKey={apiKey}
        submitLabel="Update"
        title="Edit API Key"
      />
    </AdminTemplate>
  )
}
