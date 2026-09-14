import type { CollectionConfig } from 'payload'

import { slugifySegment } from './slugify'
import type { BlogPost, Category } from '../payload-types'

type CategoryAfterChangeHook = NonNullable<NonNullable<CollectionConfig['hooks']>['afterChange']>[number]

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasCategoryLabelChanged(args: Parameters<CategoryAfterChangeHook>[0]) {
  if (args.operation !== 'update') return false

  const previousDoc = args.previousDoc as Partial<Category> | undefined
  const doc = args.doc as Category

  return previousDoc?.name !== doc.name || previousDoc?.slug !== doc.slug
}

async function updateRelatedBlogPosts(args: {
  categoryId: number | string
  categoryName: string
  categorySlug: string
  req: Parameters<CategoryAfterChangeHook>[0]['req']
}) {
  let page = 1

  while (true) {
    const posts = await args.req.payload.find({
      collection: 'blog-posts',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
      req: args.req,
      sort: 'id',
      where: {
        categoryRef: {
          equals: args.categoryId,
        },
      },
    })

    for (const post of posts.docs as BlogPost[]) {
      if (post.category === args.categoryName && post.categorySlug === args.categorySlug) {
        continue
      }

      await args.req.payload.update({
        collection: 'blog-posts',
        data: {
          category: args.categoryName,
          categorySlug: args.categorySlug,
        },
        draft: post._status === 'draft',
        id: post.id,
        overrideAccess: true,
        req: args.req,
      })
    }

    if (!posts.hasNextPage) {
      break
    }

    page += 1
  }
}

export const syncBlogPostCategoriesAfterCategoryChange: CategoryAfterChangeHook = async (args) => {
  if (!hasCategoryLabelChanged(args)) return

  const doc = args.doc as Category
  const categoryName = pickString(doc.name)
  const categorySlug = slugifySegment(pickString(doc.slug) || categoryName)

  if (!categoryName || !categorySlug) return

  await updateRelatedBlogPosts({
    categoryId: doc.id,
    categoryName,
    categorySlug,
    req: args.req,
  })
}
