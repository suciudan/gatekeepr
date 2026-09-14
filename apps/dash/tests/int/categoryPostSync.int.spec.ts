import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'
import { convertLegacyHtmlToLexicalState } from '@/lib/richText'
import type { BlogPost } from '@/payload-types'

let payload: Payload

const fixtures = ['draft', 'published'].map((status) => ({
  categorySlug: `category-sync-before-${status}`,
  nextCategorySlug: `category-sync-after-${status}`,
  postUid: `category-sync-post-${status}`,
  status: status as NonNullable<BlogPost['_status']>,
}))

describe('category post sync', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    await payload.delete({
      collection: 'blog-posts',
      overrideAccess: true,
      where: {
        uid: {
          in: fixtures.map((fixture) => fixture.postUid),
        },
      },
    })

    await payload.delete({
      collection: 'categories',
      overrideAccess: true,
      where: {
        slug: {
          in: fixtures.flatMap((fixture) => [fixture.categorySlug, fixture.nextCategorySlug]),
        },
      },
    })
  })

  it.each(fixtures)('refreshes category fields for a $status post without changing publication status', async (fixture) => {
    const category = await payload.create({
      collection: 'categories',
      data: {
        lang: 'en',
        name: 'Category Sync Before',
        slug: fixture.categorySlug,
      },
      overrideAccess: true,
    })

    const post = await payload.create({
      collection: 'blog-posts',
      data: {
        _status: fixture.status,
        body: (await convertLegacyHtmlToLexicalState(
          '<h2>Overview</h2><p>Body content for the article.</p>',
        ))! as NonNullable<BlogPost['body']>,
        bodyHtml: '<h2>Overview</h2><p>Body content for the article.</p>',
        categoryRef: category.id,
        excerpt: 'A category sync test article.',
        lang: 'en',
        publishedAt: '2026-05-13T00:00:00.000Z',
        title: 'Category Sync Post',
        uid: fixture.postUid,
      },
      overrideAccess: true,
    })

    expect(post.category).toBe('Category Sync Before')
    expect(post.categorySlug).toBe(fixture.categorySlug)

    await payload.update({
      collection: 'categories',
      data: {
        name: 'Category Sync After',
        slug: fixture.nextCategorySlug,
      },
      id: category.id,
      overrideAccess: true,
    })

    const updatedPost = await payload.findByID({
      collection: 'blog-posts',
      depth: 0,
      draft: fixture.status === 'draft',
      id: post.id,
      overrideAccess: true,
    })

    expect(updatedPost.category).toBe('Category Sync After')
    expect(updatedPost.categorySlug).toBe(fixture.nextCategorySlug)
    expect(updatedPost._status).toBe(fixture.status)

    if (fixture.status === 'draft') {
      const publishedPosts = await payload.find({
        collection: 'blog-posts',
        depth: 0,
        overrideAccess: true,
        where: {
          and: [
            { id: { equals: post.id } },
            { _status: { equals: 'published' } },
          ],
        },
      })

      expect(publishedPosts.totalDocs).toBe(0)
    }
  })
})
