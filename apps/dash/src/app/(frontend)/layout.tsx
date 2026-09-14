import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Gatekeepr dashboard and CMS.',
  title: 'Gatekeepr Dashboard',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
