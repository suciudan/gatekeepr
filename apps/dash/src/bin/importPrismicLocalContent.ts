import 'dotenv/config'

import { getCmsPayload } from '../lib/payload'
import {
  importPrismicLocalContent,
  resolveEnglishPrismicLocalStores,
} from '../lib/importPrismicLocalContent'

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const stores = await resolveEnglishPrismicLocalStores(process.cwd())
  const payload = await getCmsPayload()
  const result = await importPrismicLocalContent(payload, {
    dryRun: options.dryRun,
    stores,
  })

  console.log(JSON.stringify(result, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
