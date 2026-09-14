import 'dotenv/config'

import { importWriterRunJson } from '../lib/aiWriter/runJsonTransfer'
import { closeCmsPayload, getCmsPayload } from '../lib/payload'

type CliOptions = {
  createBlogPost: boolean
  file?: string
  publish: boolean
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    createBlogPost: false,
    publish: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if ((arg === '--file' || arg === '--input') && argv[index + 1]) {
      options.file = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--create-blog-post') {
      options.createBlogPost = true
      continue
    }

    if (arg === '--publish') {
      options.publish = true
      options.createBlogPost = true
    }
  }

  return options
}

function requireFile(value: string | undefined) {
  if (!value) {
    throw new Error('Usage: yarn workspace dash import:writer-run -- --file debugging/writer-run-2.json --publish')
  }

  return value
}

async function main() {
  const options = readCliOptions(process.argv.slice(2))
  const payload = await getCmsPayload()
  const result = await importWriterRunJson({
    filePath: requireFile(options.file),
    options: {
      createBlogPost: options.createBlogPost,
      publish: options.publish,
    },
    payload,
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
