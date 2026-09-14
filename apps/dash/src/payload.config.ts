import 'dotenv/config'

import { createPayloadConfig } from './payload.base'

export default createPayloadConfig({
  databaseURL: process.env.DATABASE_URL || '',
  secret: process.env.PAYLOAD_SECRET || '',
})
