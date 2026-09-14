import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { Payload } from 'payload'

import { DEFAULT_LANGUAGE_CODE } from '@/lib/languages'
import { getCmsPayload } from '@/lib/payload'
import { importPrismicLocalContent, type PrismicLocalImportStores } from '@/lib/importPrismicLocalContent'

let payload: Payload
let server: http.Server
let baseUrl = ''

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0P8AAAAASUVORK5CYII=',
  'base64',
)

const stores: PrismicLocalImportStores = {
  authors: {
    authors: {
      'import-author': {
        avatar: '',
        bio: 'Imported author bio.',
        credentials: ['Credited on imported content.'],
        earliestPublishedAt: '2024-01-03',
        githubUrl: 'https://github.com/import-author',
        knowsAbout: ['Engineering'],
        latestPublishedAt: '2024-02-04',
        linkedinUrl: 'https://linkedin.com/in/import-author',
        name: 'Imported Author',
        role: 'Developer Advocate',
        shortBio: 'Imported short bio.',
        slug: 'import-author',
      },
    },
  },
  blog: {
    articles: {
      'import-post': {
        author: 'Imported Author',
        authorBio: 'Imported author bio.',
        authorGithubUrl: 'https://github.com/import-author',
        authorLinkedinUrl: 'https://linkedin.com/in/import-author',
        authorRole: 'Developer Advocate',
        authorSlug: 'import-author',
        bodyHtml: '<h2>Overview</h2><p>Imported body.</p>',
        category: 'Engineering',
        excerpt: 'Imported excerpt.',
        heroImage: '',
        publishedAt: '2024-01-03',
        slug: 'import-post',
        title: 'Imported Post',
        updatedAt: '2024-02-04T12:00:00.000Z',
      },
    },
    posts: [
      {
        author: 'Imported Author',
        category: 'Engineering',
        excerpt: 'Imported excerpt.',
        featured: true,
        id: 'prismic-import-post-id',
        image: '',
        imageHeight: 600,
        imageWidth: 1200,
        publishedAt: '2024-01-03',
        slug: 'import-post',
        title: 'Imported Post',
        updatedAt: '2024-02-04T12:00:00.000Z',
      },
    ],
  },
  pages: {
    pages: {
      'import-page': {
        html: '<h2>Overview</h2><p>Imported page.</p>',
        lastPublicationDate: '2024-02-05T00:00:00.000Z',
        seoDescription: 'Imported seo description.',
        slug: 'import-page',
        title: 'Imported Page',
      },
    },
  },
}

describe('importPrismicLocalContent', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()
    server = http.createServer((req, res) => {
      if (req.url === '/avatar.png' || req.url === '/hero.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(pngBytes)
        return
      }

      res.writeHead(404)
      res.end()
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`
        }

        stores.authors.authors['import-author']!.avatar = `${baseUrl}/avatar.png`
        stores.blog.articles['import-post']!.heroImage = `${baseUrl}/hero.png`
        stores.blog.posts[0]!.image = `${baseUrl}/hero.png`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  it('imports english local content stores idempotently', async () => {
    await payload.delete({
      collection: 'authors',
      overrideAccess: true,
      where: {
        and: [
          {
            slug: {
              equals: 'import-author',
            },
          },
          {
            lang: {
              not_equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    await payload.delete({
      collection: 'blog-posts',
      overrideAccess: true,
      where: {
        and: [
          {
            uid: {
              equals: 'import-post',
            },
          },
          {
            lang: {
              not_equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    await payload.delete({
      collection: 'blog-posts',
      overrideAccess: true,
      where: {
        uid: {
          equals: 'import-post',
        },
      },
    })

    await payload.delete({
      collection: 'content-pages',
      overrideAccess: true,
      where: {
        and: [
          {
            uid: {
              equals: 'import-page',
            },
          },
          {
            lang: {
              not_equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    await payload.delete({
      collection: 'authors',
      overrideAccess: true,
      where: {
        slug: {
          equals: 'import-author',
        },
      },
    })

    await payload.delete({
      collection: 'categories',
      overrideAccess: true,
      where: {
        slug: {
          equals: 'engineering',
        },
      },
    })

    await payload.delete({
      collection: 'media',
      overrideAccess: true,
      where: {
        sourceUrl: {
          like: `${baseUrl}/`,
        },
      },
    })

    const firstRun = await importPrismicLocalContent(payload, {
      stores,
    })
    const secondRun = await importPrismicLocalContent(payload, {
      stores,
    })

    expect(firstRun).toEqual({
      authors: { created: 1, updated: 0 },
      categories: { created: 1, updated: 0 },
      media: { created: 2, updated: 0 },
      pages: { created: 1, updated: 0 },
      posts: { created: 1, updated: 0 },
    })

    expect(secondRun).toEqual({
      authors: { created: 0, updated: 1 },
      categories: { created: 0, updated: 1 },
      media: { created: 0, updated: 0 },
      pages: { created: 0, updated: 1 },
      posts: { created: 0, updated: 1 },
    })

    const author = await payload.find({
      collection: 'authors',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          {
            slug: {
              equals: 'import-author',
            },
          },
          {
            lang: {
              equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    const category = await payload.find({
      collection: 'categories',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: {
          equals: 'engineering',
        },
      },
    })

    const post = await payload.find({
      collection: 'blog-posts',
      depth: 1,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          {
            uid: {
              equals: 'import-post',
            },
          },
          {
            lang: {
              equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    const page = await payload.find({
      collection: 'content-pages',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          {
            uid: {
              equals: 'import-page',
            },
          },
          {
            lang: {
              equals: DEFAULT_LANGUAGE_CODE,
            },
          },
        ],
      },
    })

    const media = await payload.find({
      collection: 'media',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      pagination: false,
      where: {
        sourceUrl: {
          like: `${baseUrl}/`,
        },
      },
    })

    expect(author.docs[0]?.role).toBe('Developer Advocate')
    expect(author.docs[0]?.avatarMedia).toBeTruthy()
    expect(category.docs[0]?.name).toBe('Engineering')
    expect(media.docs).toHaveLength(2)
    expect(post.docs[0]?.prismicId).toBe('prismic-import-post-id')
    expect(post.docs[0]?.categorySlug).toBe('engineering')
    expect(post.docs[0]?.heroImageMedia).toBeTruthy()
    expect(post.docs[0]?.lastPublishedAt).toBe('2024-02-04T12:00:00.000Z')
    expect(page.docs[0]?.title).toBe('Imported Page')
  })
})
