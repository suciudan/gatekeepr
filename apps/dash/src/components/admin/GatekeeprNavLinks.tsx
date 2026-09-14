'use client'

import { Link, NavGroup, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

export function GatekeeprNavLinks() {
  const pathname = usePathname()
  const { config } = useConfig()
  const href = `${config.routes.admin}/api-keys`
  const isActive = pathname === href

  return (
    <NavGroup isOpen label="Gatekeepr">
      {isActive ? (
        <div className="nav__link" id="nav-gatekeepr-api-keys">
          <div className="nav__link-indicator" />
          <span className="nav__link-label">API Keys</span>
        </div>
      ) : (
        <Link className="nav__link" href={href} id="nav-gatekeepr-api-keys" prefetch={false}>
          <span className="nav__link-label">API Keys</span>
        </Link>
      )}
    </NavGroup>
  )
}
