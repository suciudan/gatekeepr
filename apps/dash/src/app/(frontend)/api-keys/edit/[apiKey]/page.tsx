import { redirect } from 'next/navigation'

type EditApiKeyPageProps = {
  params: Promise<{
    apiKey: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function EditApiKeyPage({ params }: EditApiKeyPageProps) {
  const { apiKey } = await params

  redirect(`/admin/api-keys/edit/${apiKey}`)
}
