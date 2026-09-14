import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Payload } from 'payload'

import type { BlogPost, Category, ContentPage, Media } from '../payload-types'
import { DEFAULT_LANGUAGE_CODE } from './languages'
import { convertLegacyHtmlToLexicalState } from './richText'
import { slugifySegment } from './slugify'

type EnglishAuthorEntry = {
  articleCount?: number
  avatar?: string
  bio?: string
  credentials?: string[]
  earliestPublishedAt?: null | string
  githubUrl?: string
  knowsAbout?: string[]
  latestPublishedAt?: null | string
  linkedinUrl?: string
  name?: string
  path?: string
  postSlugs?: string[]
  role?: string
  shortBio?: string
  slug: string
  sourceHash?: string
}

type EnglishAuthorStore = {
  authors: Record<string, EnglishAuthorEntry>
}

type EnglishBlogPostEntry = {
  author?: string
  category?: string
  date?: string
  excerpt?: string
  featured?: boolean
  id?: string
  image?: string
  imageHeight?: number
  imageWidth?: number
  publishedAt?: string
  readTime?: string
  slug: string
  sourceHash?: string
  title?: string
  updatedAt?: string
}

type EnglishBlogArticleEntry = {
  author?: string
  authorAvatar?: string
  authorBio?: string
  authorGithubUrl?: string
  authorHandle?: string
  authorLinkedinUrl?: string
  authorRole?: string
  authorSlug?: string
  bodyHtml?: string
  category?: string
  date?: string
  excerpt?: string
  heroImage?: string
  publishedAt?: string
  readTime?: string
  sections?: unknown[]
  slug: string
  sourceHash?: string
  title?: string
  toc?: unknown[]
  updatedAt?: string
}

type EnglishBlogStore = {
  articles: Record<string, EnglishBlogArticleEntry>
  posts: EnglishBlogPostEntry[]
}

type EnglishContentPageEntry = {
  html?: string
  lastPublicationDate?: null | string
  seoDescription?: string
  slug: string
  sourceHash?: string
  title?: string
}

type EnglishContentPageStore = {
  pages: Record<string, EnglishContentPageEntry>
}

export type PrismicLocalImportStores = {
  authors: EnglishAuthorStore
  blog: EnglishBlogStore
  pages: EnglishContentPageStore
}

export type ImportPrismicLocalContentOptions = {
  dryRun?: boolean
  stores: PrismicLocalImportStores
}

export type ImportPrismicLocalContentResult = {
  authors: { created: number; updated: number }
  categories: { created: number; updated: number }
  media: { created: number; updated: number }
  pages: { created: number; updated: number }
  posts: { created: number; updated: number }
}

type UpsertResult<TDoc> = {
  created: boolean
  doc: TDoc
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNullableString(value: unknown): null | string {
  const normalized = pickString(value)
  return normalized || null
}

function toDateTime(value: null | string | undefined): null | string {
  if (!value) return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toDateOnly(value: null | string | undefined): null | string {
  const dateTime = toDateTime(value)
  return dateTime ? dateTime.slice(0, 10) : null
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

async function resolvePrismicLocalContentDir(repoRoot: string, language: string): Promise<string> {
  const candidates = [
    path.resolve(repoRoot, `apps/site/prismic-local-content/${language}`),
    path.resolve(repoRoot, `../site/prismic-local-content/${language}`),
    path.resolve(repoRoot, `prismic-local-content/${language}`),
  ]

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'authors.json'))
      return candidate
    } catch {}
  }

  throw new Error(`Could not resolve ${language} local content directory from ${repoRoot}`)
}

export async function resolveEnglishPrismicLocalStores(repoRoot: string): Promise<PrismicLocalImportStores> {
  const contentDir = await resolvePrismicLocalContentDir(repoRoot, 'en')

  return {
    authors: await readJsonFile<EnglishAuthorStore>(path.join(contentDir, 'authors.json')),
    blog: await readJsonFile<EnglishBlogStore>(path.join(contentDir, 'blog-posts.json')),
    pages: await readJsonFile<EnglishContentPageStore>(path.join(contentDir, 'content-pages.json')),
  }
}

async function findOneByField<TDoc>(
  payload: Payload,
  collection: 'authors' | 'blog-posts' | 'categories' | 'content-pages' | 'media',
  field: string,
  value: string,
  lang?: string,
): Promise<null | TDoc> {
  const where =
    collection === 'media' || !lang
      ? {
          [field]: {
            equals: value,
          },
        }
      : {
          and: [
            {
              [field]: {
                equals: value,
              },
            },
            {
              lang: {
                equals: lang,
              },
            },
          ],
        }

  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where,
  })

  return (result.docs[0] as TDoc | undefined) ?? null
}

async function upsertBySlug<TDoc extends { id: number }>(
  payload: Payload,
  collection: 'authors' | 'categories' | 'content-pages',
  slugField: 'slug' | 'uid',
  slug: string,
  data: Record<string, unknown>,
  dryRun: boolean,
): Promise<UpsertResult<TDoc>> {
  const existing = await findOneByField<TDoc>(payload, collection, slugField, slug, DEFAULT_LANGUAGE_CODE)

  if (existing) {
    if (!dryRun) {
      await payload.update({
        collection,
        data,
        depth: 0,
        id: existing.id,
        overrideAccess: true,
      } as any)
    }

    return {
      created: false,
      doc: existing,
    }
  }

  if (dryRun) {
    return {
      created: true,
      doc: { id: -1 } as TDoc,
    }
  }

  const created = await payload.create({
    collection,
    data,
    depth: 0,
    overrideAccess: true,
  } as any)

  return {
    created: true,
    doc: created as unknown as TDoc,
  }
}

async function upsertBlogPost(
  payload: Payload,
  prismicId: string,
  data: Record<string, unknown>,
  dryRun: boolean,
): Promise<UpsertResult<BlogPost>> {
  const existing = await findOneByField<BlogPost>(payload, 'blog-posts', 'prismicId', prismicId, DEFAULT_LANGUAGE_CODE)

  if (existing) {
    if (!dryRun) {
      await payload.update({
        collection: 'blog-posts',
        data,
        depth: 0,
        id: existing.id,
        overrideAccess: true,
      } as any)
    }

    return {
      created: false,
      doc: existing,
    }
  }

  if (dryRun) {
    return {
      created: true,
      doc: { id: -1 } as BlogPost,
    }
  }

  const created = await payload.create({
    collection: 'blog-posts',
    data,
    depth: 0,
    overrideAccess: true,
  } as any)

  return {
    created: true,
    doc: created as unknown as BlogPost,
  }
}

export async function importPrismicLocalContent(
  payload: Payload,
  options: ImportPrismicLocalContentOptions,
): Promise<ImportPrismicLocalContentResult> {
  const { dryRun = false, stores } = options

  const result: ImportPrismicLocalContentResult = {
    authors: { created: 0, updated: 0 },
    categories: { created: 0, updated: 0 },
    media: { created: 0, updated: 0 },
    pages: { created: 0, updated: 0 },
    posts: { created: 0, updated: 0 },
  }

  const authorIdsBySlug = new Map<string, number>()
  const categoryIdsBySlug = new Map<string, number>()
  const mediaIdsBySourceUrl = new Map<string, number>()
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cms-prismic-import-'))

  async function upsertRemoteMedia(args: {
    alt: string
    sourceUrl: string
  }): Promise<null | number> {
    const sourceUrl = pickString(args.sourceUrl)
    if (!sourceUrl) return null

    const cachedId = mediaIdsBySourceUrl.get(sourceUrl)
    if (cachedId) return cachedId

    const existing = await findOneByField<Media>(payload, 'media', 'sourceUrl', sourceUrl)

    if (existing?.id) {
      mediaIdsBySourceUrl.set(sourceUrl, existing.id)
      return existing.id
    }

    if (dryRun) {
      result.media.created += 1
      return null
    }

    const response = await fetch(sourceUrl)
    if (!response.ok) {
      throw new Error(`Failed to download media from ${sourceUrl}: ${response.status}`)
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer())
    const sourceUrlObject = new URL(sourceUrl)
    const filename = decodeURIComponent(path.basename(sourceUrlObject.pathname) || 'asset').replace(/[^a-zA-Z0-9._-]+/g, '-')
    const filePath = path.join(tempDir, filename)

    await writeFile(filePath, fileBuffer)

    const created = await payload.create({
      collection: 'media',
      data: {
        alt: pickString(args.alt) || filename,
        sourceUrl,
      },
      depth: 0,
      filePath,
      overrideAccess: true,
    } as any)

    result.media.created += 1
    mediaIdsBySourceUrl.set(sourceUrl, (created as unknown as Media).id)
    return (created as unknown as Media).id
  }

  try {
    const categoryNames = Array.from(
      new Set(
        stores.blog.posts
          .map((post) => pickString(post.category))
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right))

    for (const categoryName of categoryNames) {
      const categorySlug = slugifySegment(categoryName)
      const upserted = await upsertBySlug<Category>(
        payload,
        'categories',
        'slug',
        categorySlug,
        {
          description: '',
          lang: 'en',
          name: categoryName,
          slug: categorySlug,
        },
        dryRun,
      )

      if (upserted.created) result.categories.created += 1
      else result.categories.updated += 1

      if (upserted.doc.id > 0) {
        categoryIdsBySlug.set(categorySlug, upserted.doc.id)
      }
    }

    const authorEntries = Object.values(stores.authors.authors).sort((left, right) => left.slug.localeCompare(right.slug))

    for (const author of authorEntries) {
      const slug = pickString(author.slug)
      const position = pickString(author.role)
      const avatarSourceUrl = pickString(author.avatar)
      const avatarMedia = await upsertRemoteMedia({
        alt: pickString(author.name),
        sourceUrl: avatarSourceUrl,
      })

      const upserted = await upsertBySlug(
        payload,
        'authors',
        'slug',
        slug,
        {
          avatar: avatarSourceUrl
            ? {
                alt: pickString(author.name),
                height: null,
                url: avatarSourceUrl,
                width: null,
              }
            : undefined,
          avatarMedia: avatarMedia ?? undefined,
          bio: pickString(author.bio),
          credentials: (author.credentials || []).map((value) => ({ value })),
          firstPublishedAt: toDateOnly(author.earliestPublishedAt),
          githubUrl: pickString(author.githubUrl),
          knowsAbout: (author.knowsAbout || []).map((value) => ({ value })),
          lang: 'en',
          lastPublishedAt: toDateOnly(author.latestPublishedAt),
          linkedinUrl: pickString(author.linkedinUrl),
          name: pickString(author.name) || slug,
          position,
          role: position,
          shortBio: pickString(author.shortBio),
          slug,
          uid: slug,
        },
        dryRun,
      )

      if (upserted.created) result.authors.created += 1
      else result.authors.updated += 1

      if (upserted.doc.id > 0) {
        authorIdsBySlug.set(slug, upserted.doc.id)
      }
    }

    const pageEntries = Object.values(stores.pages.pages).sort((left, right) => left.slug.localeCompare(right.slug))

    for (const page of pageEntries) {
      const html = pickString(page.html)
      const upserted = await upsertBySlug<ContentPage>(
        payload,
        'content-pages',
        'uid',
        page.slug,
        {
          content: (await convertLegacyHtmlToLexicalState(html)) ?? undefined,
          contentHtml: html,
          firstPublishedAt: toDateOnly(page.lastPublicationDate),
          lang: 'en',
          lastPublishedAt: toDateOnly(page.lastPublicationDate),
          seoDescription: pickString(page.seoDescription),
          title: pickString(page.title) || page.slug,
          uid: page.slug,
        },
        dryRun,
      )

      if (upserted.created) result.pages.created += 1
      else result.pages.updated += 1
    }

    const postEntries = [...stores.blog.posts].sort((left, right) => left.slug.localeCompare(right.slug))

    for (const post of postEntries) {
      const article = stores.blog.articles[post.slug]
      const categorySlug = slugifySegment(pickString(post.category))
      const authorSlug = pickString(article?.authorSlug)
      const publishedAt = toDateOnly(post.publishedAt)
      const updatedAt = toDateTime(article?.updatedAt || post.updatedAt)
      const bodyHtml = pickString(article?.bodyHtml)
      const prismicId = pickString(post.id) || post.slug
      const heroImageSourceUrl = pickString(post.image)
      const heroImageMedia = await upsertRemoteMedia({
        alt: pickString(post.title),
        sourceUrl: heroImageSourceUrl,
      })

      const upserted = await upsertBlogPost(
        payload,
        prismicId,
        {
          author: authorIdsBySlug.get(authorSlug) ?? undefined,
          body: ((await convertLegacyHtmlToLexicalState(bodyHtml)) ?? undefined) as NonNullable<BlogPost['body']> | undefined,
          bodyHtml,
          bodyText: bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          category: pickString(post.category),
          categoryRef: categoryIdsBySlug.get(categorySlug) ?? undefined,
          categorySlug,
          excerpt: pickString(post.excerpt),
          featured: post.featured === true,
          firstPublishedAt: publishedAt,
          heroImage: heroImageSourceUrl
            ? {
                alt: pickString(post.title),
                height: typeof post.imageHeight === 'number' ? post.imageHeight : null,
                url: heroImageSourceUrl,
                width: typeof post.imageWidth === 'number' ? post.imageWidth : null,
              }
            : undefined,
          heroImageMedia: heroImageMedia ?? undefined,
          lang: 'en',
          lastPublishedAt: updatedAt ?? publishedAt,
          prismicId,
          publishedAt,
          title: pickString(post.title) || post.slug,
          uid: post.slug,
        },
        dryRun,
      )

      if (upserted.created) result.posts.created += 1
      else result.posts.updated += 1
    }

    return result
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}
