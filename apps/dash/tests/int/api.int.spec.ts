import { describe, it, beforeAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
