import { Button, Card } from '@payloadcms/ui'

export function ApiKeysDashboardCard() {
  return (
    <div className="collections gatekeepr-dashboard-collections">
      <div className="collections__wrap">
        <div className="collections__group">
          <h2 className="collections__label">Gatekeepr</h2>
          <ul className="collections__card-list">
            <li>
              <Card
                actions={
                  <Button
                    aria-label="Open API Keys"
                    buttonStyle="icon-label"
                    el="link"
                    icon="plus"
                    iconStyle="with-border"
                    round
                    to="/admin/api-keys"
                  />
                }
                buttonAriaLabel="Show API Keys"
                href="/admin/api-keys"
                id="card-gatekeepr-api-keys"
                title="API Keys"
                titleAs="h3"
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
