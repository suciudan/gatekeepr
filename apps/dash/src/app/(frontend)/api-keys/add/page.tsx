import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AddApiKeyPage() {
  redirect('/admin/api-keys/add')
}
