import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'
import type { BlogPost, ContentPage } from '@/payload-types'
import { convertLegacyHtmlToLexicalState } from '@/lib/richText'
import {
  getAuthorBySlug,
  getBlogCategory,
  getBlogPostByDocumentID,
  getBlogPostByUID,
  getContentPageByUID,
  listAuthors,
  listBlogPosts,
  listContentPages,
} from '@/lib/contentStore'

let payload: Payload

const fixture = {
  authorSlug: 'test-author-wsa-128',
  blogUid: 'test-blog-wsa-128',
  categorySlug: 'engineering',
  contentUid: 'test-legal-page-wsa-128',
}

describe('content store', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    await payload.delete({
      collection: 'blog-posts',
      where: {
        uid: {
          equals: fixture.blogUid,
        },
      },
    })

    await payload.delete({
      collection: 'content-pages',
      where: {
        uid: {
          equals: fixture.contentUid,
        },
      },
    })

    await payload.delete({
      collection: 'authors',
      where: {
        slug: {
          equals: fixture.authorSlug,
        },
      },
    })

    await payload.delete({
      collection: 'categories',
      where: {
        slug: {
          equals: fixture.categorySlug,
        },
      },
    })

    const author = await payload.create({
      collection: 'authors',
      data: {
        avatar: {
          alt: 'Author avatar',
          height: 256,
          url: 'https://example.com/avatar.jpg',
          width: 256,
        },
        bio: 'Writes about production scraping systems.',
        githubUrl: 'https://github.com/example-author',
        lang: 'en',
        linkedinUrl: 'https://linkedin.com/in/example-author',
        name: 'Test Author WSA 128',
        position: 'Staff Engineer',
        slug: fixture.authorSlug,
        uid: fixture.authorSlug,
      },
      draft: false,
    })

    const category = await payload.create({
      collection: 'categories',
      data: {
        description: 'Engineering writing for the blog.',
        lang: 'en',
        name: 'Engineering',
        slug: fixture.categorySlug,
      },
      draft: false,
    })

    await payload.create({
      collection: 'blog-posts',
      data: {
        author: author.id,
        body: (await convertLegacyHtmlToLexicalState(
          '<h2>Overview</h2><p>Body content for the article.</p><h3>Details</h3><p>More article detail.</p>',
        ))! as NonNullable<BlogPost['body']>,
        bodyHtml:
          '<h2>Overview</h2><p>Body content for the article.</p><h3>Details</h3><p>More article detail.</p>',
        bodyText: 'Body content for the article. More article detail.',
        categoryRef: category.id,
        excerpt: 'A typed content store integration test article.',
        featured: true,
        heroImage: {
          alt: 'Blog hero',
          height: 675,
          url: 'https://example.com/hero.jpg',
          width: 1200,
        },
        lang: 'en',
        prismicId: 'prismic-blog-test-128',
        publishedAt: '2026-04-09T00:00:00.000Z',
        title: 'Typed Content Store Article',
        uid: fixture.blogUid,
      },
      draft: false,
    })

    await payload.create({
      collection: 'content-pages',
      data: {
        content: (await convertLegacyHtmlToLexicalState(
          '<h1>Terms</h1><p>Legal content.</p>',
        ))! as NonNullable<ContentPage['content']>,
        contentHtml: '<h1>Terms</h1><p>Legal content.</p>',
        firstPublishedAt: '2026-04-09T00:00:00.000Z',
        lang: 'en',
        lastPublishedAt: '2026-04-10T00:00:00.000Z',
        prismicId: 'prismic-content-test-128',
        seoDescription: 'Legal page description.',
        title: 'Terms of Service',
        uid: fixture.contentUid,
      },
      draft: false,
    })

  })

  it('projects blog posts for listing and article lookups', async () => {
    const listing = await listBlogPosts({ categorySlug: fixture.categorySlug, pageSize: 10 })
    const post = listing.posts.find((entry) => entry.slug === fixture.blogUid)

    expect(post?.title).toBe('Typed Content Store Article')
    expect(post?.author).toBe('Test Author WSA 128')
    expect(post?.categorySlug).toBe(fixture.categorySlug)

    const article = await getBlogPostByUID(fixture.blogUid)

    expect(article?.toc.map((item) => item.label)).toEqual(['Overview', 'Details'])
    expect(article?.authorRole).toBe('Staff Engineer')
    expect(article?.heroImage?.url).toBe('https://example.com/hero.jpg')

    const byDocumentId = await getBlogPostByDocumentID('prismic-blog-test-128')
    expect(byDocumentId?.slug).toBe(fixture.blogUid)
  })

  it('aggregates author profile projections', async () => {
    const author = await getAuthorBySlug(fixture.authorSlug)

    expect(author?.name).toBe('Test Author WSA 128')
    expect(author?.articleCount).toBe(1)
    expect(author?.posts[0]?.slug).toBe(fixture.blogUid)
  })

  it('builds category and legal page projections', async () => {
    const category = await getBlogCategory(fixture.categorySlug)
    expect(category?.posts.some((post) => post.slug === fixture.blogUid)).toBe(true)

    const contentPage = await getContentPageByUID(fixture.contentUid)
    expect(contentPage?.title).toBe('Terms of Service')
    expect(contentPage?.html).toContain('Legal content')
  })

  it('lists only the english CMS documents', async () => {
    const listing = await listBlogPosts({ pageSize: 50 })
    const authors = await listAuthors()
    const pages = await listContentPages()

    expect(listing.posts.filter((post) => post.slug === fixture.blogUid)).toHaveLength(1)
    expect(listing.posts.find((post) => post.slug === fixture.blogUid)?.title).toBe('Typed Content Store Article')
    expect(authors.filter((author) => author.slug === fixture.authorSlug)).toHaveLength(1)
    expect(pages.filter((page) => page.slug === fixture.contentUid)).toHaveLength(1)
  })
})
