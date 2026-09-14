import { DefaultTemplate } from '@payloadcms/next/templates'
import { Button, Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'

import { getApiKeys, type ApiKeyRecord } from '@/lib/apiKeys'
import { getDashboardSession } from '@/lib/dashboardAuth'

function formatDateTime(value: string): string {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function usageValue(value: number | string): string {
  return String(value)
}

function ApiKeysTable({ apiKeys }: { apiKeys: ApiKeyRecord[] }) {
  if (apiKeys.length === 0) {
    return <div className="no-results">No API keys found.</div>
  }

  return (
    <div className="collection-list__tables">
      <div className="table-wrap">
        <div className="table">
          <table cellPadding="0" cellSpacing="0">
            <thead>
              <tr>
                <th id="heading-api-key">API Key</th>
                <th id="heading-email">Email</th>
                <th id="heading-site">Site</th>
                <th id="heading-state">State</th>
                <th id="heading-remaining">Remaining</th>
                <th id="heading-1h">1H</th>
                <th id="heading-24h">24H</th>
                <th id="heading-30d">30D</th>
                <th id="heading-created">Created</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey, index) => (
                <tr className={`row-${index + 1}`} data-id={apiKey.apiKey} key={apiKey.apiKey}>
                  <td className="cell-api-key">
                    <a className="gatekeepr-admin-api-key" href={`/admin/api-keys/edit/${encodeURIComponent(apiKey.apiKey)}`}>
                      {apiKey.apiKey}
                    </a>
                  </td>
                  <td className="cell-email">{apiKey.email}</td>
                  <td className="cell-site">{apiKey.website}</td>
                  <td className="cell-state">
                    <span
                      className={
                        apiKey.disabled
                          ? 'gatekeepr-admin-badge gatekeepr-admin-badge--disabled'
                          : 'gatekeepr-admin-badge gatekeepr-admin-badge--active'
                      }
                    >
                      {apiKey.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td className="cell-remaining">{usageValue(apiKey.usage.LFT)}</td>
                  <td className="cell-1h">{usageValue(apiKey.usage['1H'])}</td>
                  <td className="cell-24h">{usageValue(apiKey.usage['24H'])}</td>
                  <td className="cell-30d">{usageValue(apiKey.usage['30D'])}</td>
                  <td className="cell-created">{formatDateTime(apiKey.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function ApiKeysContent() {
  const session = await getDashboardSession()
  let apiKeys: ApiKeyRecord[] = []
  let loadingError = ''

  if (!session) {
    return (
      <main className="gatekeepr-admin-view collection-list collection-list--api-keys">
        <div className="gatekeepr-admin-panel">
          <p className="gatekeepr-admin-eyebrow">Gatekeepr Dashboard</p>
          <h1>API Keys</h1>
          <p>Sign in with Payload to manage Gatekeepr API keys.</p>
        </div>
      </main>
    )
  }

  if (!session.authorized) {
    return (
      <main className="gatekeepr-admin-view collection-list collection-list--api-keys">
        <div className="gatekeepr-admin-panel">
          <p className="gatekeepr-admin-eyebrow">Access denied</p>
          <h1>API Keys</h1>
          <p>{session.email || 'This Payload user'} is not in the configured Gatekeepr admin email list.</p>
        </div>
      </main>
    )
  }

  try {
    apiKeys = await getApiKeys()
  } catch (error) {
    loadingError = error instanceof Error ? error.message : 'Unknown API key loading error'
  }

  if (loadingError) {
    return (
      <main className="gatekeepr-admin-view collection-list collection-list--api-keys">
        <div className="gatekeepr-admin-panel">
          <p className="gatekeepr-admin-eyebrow">Gatekeepr Dashboard</p>
          <h1>API Keys</h1>
          <p>
            API key data is not available. Check the Gatekeepr MySQL and Redis environment variables for
            the dashboard runtime.
          </p>
          <pre>{loadingError}</pre>
        </div>
      </main>
    )
  }

  return (
    <main className="collection-list collection-list--api-keys gatekeepr-admin-list">
      <Gutter className="collection-list__wrap">
        <header className="list-header">
          <div className="list-header__content">
            <div className="list-header__title-and-actions">
              <h1 className="list-header__title">API Keys</h1>
              <div className="list-header__title-actions">
                <Button
                  aria-label="Create New API Key"
                  buttonStyle="pill"
                  className="list-create-new-doc__create-new-button"
                  el="link"
                  size="small"
                  to="/admin/api-keys/add"
                >
                  Create New
                </Button>
              </div>
            </div>
          </div>
        </header>
        <div className="gatekeepr-admin-list-controls">
          <div className="list-controls">
            <div className="list-controls__wrap">
              <div className="list-controls__buttons" />
            </div>
          </div>
        </div>
        <ApiKeysTable apiKeys={apiKeys} />
      </Gutter>
    </main>
  )
}

export async function AdminApiKeysView(props: AdminViewServerProps) {
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
      <ApiKeysContent />
    </DefaultTemplate>
  )
}
