'use client'

import { useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

export function AIWriterNavLink() {
  const pathname = usePathname()
  const { config } = useConfig()
  const href = `${config.routes.admin}/ai-writer`
  const isActive = pathname === href

  return (
    <div className="ai-writer-nav-link">
      <a
        className={['ai-writer-nav-link__anchor', isActive && 'ai-writer-nav-link__anchor--active']
          .filter(Boolean)
          .join(' ')}
        href={href}
      >
        <span aria-hidden="true" className="ai-writer-nav-link__icon">
          <svg fill="none" viewBox="0 0 24 24">
            <path
              d="M6.5 5.75H15.5C17.1569 5.75 18.5 7.09315 18.5 8.75V15.25C18.5 16.9069 17.1569 18.25 15.5 18.25H8.5L5.5 20.25V8.75C5.5 7.09315 6.84315 5.75 8.5 5.75"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
            <path
              d="M9 10H15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
            <path
              d="M9 13H13.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          </svg>
        </span>
        <span className="ai-writer-nav-link__copy">
          <span className="ai-writer-nav-link__title">AI Writer</span>
          <span className="ai-writer-nav-link__subtitle">Runs and article generation</span>
        </span>
      </a>
    </div>
  )
}
