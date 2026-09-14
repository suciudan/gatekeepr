import 'dotenv/config'

import { getCmsPayload } from '../lib/payload'
import { slugifySegment } from '../lib/slugify'
import type { BlogPost, Category } from '../payload-types'

type SyncResult = {
  checked: number
  dryRun: boolean
  skipped: number
  updated: Array<{
    category: string
    categorySlug: string
    id: number
    previousCategory: string | null | undefined
    previousCategorySlug: string | null | undefined
    title: string
    uid: string
  }>
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
  }
}

function unwrapCategory(value: BlogPost['categoryRef']): Category | null {
  if (value && typeof value === 'object') {
    return value
  }

  return null
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const payload = await getCmsPayload()
  const result: SyncResult = {
    checked: 0,
    dryRun: options.dryRun,
    skipped: 0,
    updated: [],
  }
  let page = 1

  while (true) {
    const posts = await payload.find({
      collection: 'blog-posts',
      depth: 1,
      limit: 100,
      overrideAccess: true,
      page,
      pagination: true,
    })

    for (const post of posts.docs as BlogPost[]) {
      result.checked += 1
      const category = unwrapCategory(post.categoryRef)

      if (!category) {
        result.skipped += 1
        continue
      }

      const categoryName = category.name
      const categorySlug = slugifySegment(category.slug || categoryName)

      if (post.category === categoryName && post.categorySlug === categorySlug) {
        result.skipped += 1
        continue
      }

      result.updated.push({
        category: categoryName,
        categorySlug,
        id: post.id,
        previousCategory: post.category,
        previousCategorySlug: post.categorySlug,
        title: post.title,
        uid: post.uid,
      })

      if (!options.dryRun) {
        await payload.update({
          collection: 'blog-posts',
          data: {
            category: categoryName,
            categorySlug,
          },
          draft: post._status === 'draft',
          id: post.id,
          overrideAccess: true,
        })
      }
    }

    if (!posts.hasNextPage) {
      break
    }

    page += 1
  }

  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
