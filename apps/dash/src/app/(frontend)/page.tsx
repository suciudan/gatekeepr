import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Gatekeepr Dashboard',
}

export default function Page() {
  redirect('/admin')
}
