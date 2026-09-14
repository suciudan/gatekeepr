import 'dotenv/config'

import { exportWriterRunJson } from '../lib/aiWriter/runJsonTransfer'
import { closeCmsPayload, getCmsPayload } from '../lib/payload'

type CliOptions = {
  out?: string
  runId?: string
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if ((arg === '--run-id' || arg === '--run') && argv[index + 1]) {
      options.runId = argv[index + 1]
      index += 1
      continue
    }

    if ((arg === '--out' || arg === '--output') && argv[index + 1]) {
      options.out = argv[index + 1]
      index += 1
    }
  }

  return options
}

function requireRunID(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ''), 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Usage: yarn workspace dash export:writer-run -- --run-id 2 --out debugging/writer-run-2.json')
  }

  return parsed
}

async function main() {
  const options = readCliOptions(process.argv.slice(2))
  const runID = requireRunID(options.runId)
  const outputPath = options.out ?? `debugging/writer-run-${runID}.json`
  const payload = await getCmsPayload()
  const result = await exportWriterRunJson({
    outputPath,
    payload,
    runID,
  })

  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeCmsPayload()
  })
