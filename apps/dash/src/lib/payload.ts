import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

let payloadPromise: Promise<Payload> | null = null

export function getCmsPayload(): Promise<Payload> {
  if (!payloadPromise) {
    payloadPromise = getPayload({
      config: configPromise,
    })
  }

  return payloadPromise
}

export async function closeCmsPayload(): Promise<void> {
  if (!payloadPromise) {
    return
  }

  const payload = await payloadPromise
  payloadPromise = null

  await payload.db.pool?.end?.().catch(() => {})
}
