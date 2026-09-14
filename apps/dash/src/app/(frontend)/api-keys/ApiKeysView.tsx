import Link from 'next/link'

import { getApiKeys } from '@/lib/apiKeys'
import { getDashboardSession } from '@/lib/dashboardAuth'

import { toggleApiKeyAction } from './actions'

type ApiKeysViewProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getSearchFlag(params: Record<string, string | string[] | undefined>, key: string): boolean {
  return params[key] === 'true'
}

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

export default async function ApiKeysView({ searchParams }: ApiKeysViewProps) {
  const session = await getDashboardSession()

  if (!session) {
    return (
      <main className="dashboard-shell dashboard-shell--centered">
        <section className="auth-panel">
          <p className="eyebrow">Gatekeepr Dashboard</p>
          <h1>Sign in with Payload to manage API keys.</h1>
          <Link className="button button--primary" href="/admin/login?redirect=/">
            Sign in
          </Link>
        </section>
      </main>
    )
  }

  if (!session.authorized) {
    return (
      <main className="dashboard-shell dashboard-shell--centered">
        <section className="auth-panel">
          <p className="eyebrow">Access denied</p>
          <h1>This Payload user is not allowed to manage Gatekeepr.</h1>
          <p>{session.email || 'The current user'} is not in the configured admin email list.</p>
          <Link className="button button--secondary" href="/admin">
            Open CMS Admin
          </Link>
        </section>
      </main>
    )
  }

  const [apiKeys, params] = await Promise.all([
    getApiKeys(),
    searchParams ?? Promise.resolve({}),
  ])

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Gatekeepr Dashboard</p>
          <h1>API Keys</h1>
        </div>
        <nav className="topbar__nav" aria-label="Dashboard navigation">
          <Link href="/api-keys">API Keys</Link>
          <Link href="/admin">CMS Admin</Link>
        </nav>
      </header>

      {(getSearchFlag(params, 'created') || getSearchFlag(params, 'updated')) && (
        <div className="notice" role="status">
          {getSearchFlag(params, 'created') ? 'The API key has been created.' : 'The API key has been updated.'}
        </div>
      )}

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Customer keys</h2>
            <p>{apiKeys.length} configured API {apiKeys.length === 1 ? 'key' : 'keys'}</p>
          </div>
          <Link className="button button--primary" href="/api-keys/add">
            Add Key
          </Link>
        </div>

        {apiKeys.length === 0 ? (
          <div className="empty-state">
            <h3>No API keys found.</h3>
            <p>Add a customer API key before issuing integration credentials.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">API Key</th>
                  <th scope="col">Email</th>
                  <th scope="col">Site</th>
                  <th scope="col">State</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">1H</th>
                  <th scope="col">24H</th>
                  <th scope="col">30D</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr key={apiKey.apiKey}>
                    <td>
                      <Link className="api-key" href={`/api-keys/edit/${encodeURIComponent(apiKey.apiKey)}`}>
                        {apiKey.apiKey}
                      </Link>
                    </td>
                    <td>{apiKey.email}</td>
                    <td>{apiKey.website}</td>
                    <td>
                      <span className={apiKey.disabled ? 'badge badge--disabled' : 'badge badge--active'}>
                        {apiKey.disabled ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                    <td>{usageValue(apiKey.usage.LFT)}</td>
                    <td>{usageValue(apiKey.usage['1H'])}</td>
                    <td>{usageValue(apiKey.usage['24H'])}</td>
                    <td>{usageValue(apiKey.usage['30D'])}</td>
                    <td>{formatDateTime(apiKey.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/api-keys/edit/${encodeURIComponent(apiKey.apiKey)}`}>Edit</Link>
                        <form action={toggleApiKeyAction}>
                          <input name="apiKey" type="hidden" value={apiKey.apiKey} />
                          <button type="submit">{apiKey.disabled ? 'Enable' : 'Disable'}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
