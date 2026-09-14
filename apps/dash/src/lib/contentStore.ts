import type { Where } from 'payload'

import type { Author, BlogPost, Category, ContentPage } from '../payload-types'
import { getCmsPayload } from './payload'
import { DEFAULT_LANGUAGE_CODE } from './languages'
import { slugifySegment } from './slugify'

type CmsDocumentType = 'author' | 'blog_post' | 'content_page'

type CmsDocumentIdentitySource = {
  id: number
  lang?: null | string
  lastPublishedAt?: null | string
  prismicId?: null | string
  uid?: null | string
  updatedAt?: null | string
}

type BlogListItemDocument = Partial<BlogPost> &
  Pick<BlogPost, 'createdAt' | 'id' | 'lang' | 'title' | 'uid' | 'updatedAt'>

type ExternalImage = {
  alt?: string | null
  height?: number | null
  url?: string | null
  width?: number | null
} | null | undefined

export interface CmsImageProjection {
  alt: string
  height: null | number
  url: string
  width: null | number
}

export interface CmsTocItem {
  id: string
  label: string
  level: number
}

export interface CmsArticleSection {
  body: string
  heading: string
  id: string
  level: number
}

export interface CmsDocumentIdentityProjection {
  collection: 'authors' | 'blog-posts' | 'content-pages'
  id: number
  lang: string
  lastPublishedAt: null | string
  prismicId: null | string
  type: CmsDocumentType
  uid: string
}

export interface BlogListItemProjection extends CmsDocumentIdentityProjection {
  author: string
  authorSlug: null | string
  category: string
  categorySlug: string
  date: string
  excerpt: string
  featured: boolean
  heroImage: CmsImageProjection | null
  publishedAt: null | string
  readTime: string
  slug: string
  title: string
  updatedAt: null | string
}

export interface BlogArticleProjection extends BlogListItemProjection {
  authorAvatar: CmsImageProjection | null
  authorBio: string
  authorGithubUrl: string
  authorHandle: string
  authorLinkedinUrl: string
  authorRole: string
  bodyHtml: string
  sections: CmsArticleSection[]
  toc: CmsTocItem[]
}

export interface AuthorProjection extends CmsDocumentIdentityProjection {
  articleCount: number
  avatar: CmsImageProjection | null
  bio: string
  credentials: string[]
  earliestPublishedAt: null | string
  githubUrl: string
  knowsAbout: string[]
  latestPublishedAt: null | string
  linkedinUrl: string
  name: string
  path: string
  posts: BlogListItemProjection[]
  role: string
  shortBio: string
  slug: string
}

function pickAuthorRole(author: Author): string {
  return pickString('role' in author ? author.role : '') || pickString('position' in author ? author.position : '')
}

export interface ContentPageProjection extends CmsDocumentIdentityProjection {
  html: string
  seoDescription: string
  slug: string
  title: string
}

export interface PaginatedBlogProjection {
  page: number
  pageSize: number
  posts: BlogListItemProjection[]
  totalDocs: number
  totalPages: number
}

export interface BlogCategoryProjection {
  allCategories: string[]
  category: string
  categoryCounts: Record<string, number>
  categorySlug: string
  posts: BlogListItemProjection[]
}

export interface BlogSearchOptions {
  categorySlug?: string
  lang?: string
  page?: number
  pageSize?: number
  titleQuery?: string
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toIsoDate(value: null | string | undefined): null | string {
  if (!value) return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function formatDate(value: null | string | undefined): string {
  if (!value) return ''

  try {
    return new Date(value).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function estimateReadTime(value: string): string {
  const words = value.split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 225))} min read`
}

function toImageProjection(image: ExternalImage): CmsImageProjection | null {
  const url = pickString(image?.url)
  if (!url) return null

  return {
    alt: pickString(image?.alt),
    height: typeof image?.height === 'number' ? image.height : null,
    url,
    width: typeof image?.width === 'number' ? image.width : null,
  }
}

function buildTocAndSections(bodyHtml: string): {
  sections: CmsArticleSection[]
  toc: CmsTocItem[]
} {
  const toc: CmsTocItem[] = []
  const headingRegex = /<h([2-3])[^>]*>(.*?)<\/h\1>/gi
  const processedHtml = bodyHtml.replace(headingRegex, (_match, level, content) => {
    const label = stripHtml(content)
    const id = slugifySegment(label)
    const numericLevel = Number.parseInt(level, 10)

    toc.push({
      id,
      label,
      level: numericLevel,
    })

    return `<h${level} id="${id}" data-toc-heading>${content}</h${level}>`
  })

  if (toc.length === 0) {
    return {
      sections: [],
      toc: [{ id: 'content', label: 'Article', level: 1 }],
    }
  }

  const sections: CmsArticleSection[] = []
  const sectionParts = processedHtml.split(/<h[2-3][^>]*>/)

  for (let index = 1; index < sectionParts.length; index += 1) {
    const tocItem = toc[index - 1]
    if (!tocItem) continue

    sections.push({
      body: sectionParts[index].replace(/^[^>]*>/, '').trim(),
      heading: tocItem.label,
      id: tocItem.id,
      level: tocItem.level,
    })
  }

  return { sections, toc }
}

function unwrapAuthor(value: BlogPost['author']): Author | null {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    return null
  }

  return value as Author
}

function unwrapCategory(value: BlogPost['categoryRef']): Category | null {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    return null
  }

  return value as Category
}

function toIdentity(
  collection: 'authors' | 'blog-posts' | 'content-pages',
  type: CmsDocumentType,
  doc: CmsDocumentIdentitySource,
): CmsDocumentIdentityProjection {
  const lastPublishedAt =
    typeof doc.lastPublishedAt === 'string'
      ? doc.lastPublishedAt
      : typeof doc.updatedAt === 'string'
        ? doc.updatedAt
      : null

  return {
    collection,
    id: doc.id,
    lang: pickString(doc.lang) || 'en',
    lastPublishedAt: toIsoDate(lastPublishedAt),
    prismicId: pickString(doc.prismicId) || null,
    type,
    uid: pickString(doc.uid),
  }
}

function toBlogListItem(doc: BlogListItemDocument): BlogListItemProjection {
  const author = unwrapAuthor(doc.author)
  const category = unwrapCategory(doc.categoryRef)
  const bodyText = pickString(doc.bodyText) || stripHtml(pickString(doc.bodyHtml))
  const publishedAt = toIsoDate(doc.publishedAt)
  const categoryName = pickString(doc.category) || pickString(category?.name) || 'Guides'
  const categorySlug = pickString(category?.slug) || pickString(doc.categorySlug) || slugifySegment(categoryName)

  return {
    ...toIdentity('blog-posts', 'blog_post', doc),
    author: pickString(author?.name) || 'Gatekeepr Team',
    authorSlug: pickString(author?.slug) || null,
    category: categoryName,
    categorySlug,
    date: formatDate(publishedAt),
    excerpt: pickString(doc.excerpt),
    featured: doc.featured === true,
    heroImage: toImageProjection(doc.heroImage),
    publishedAt,
    readTime: pickString(doc.readTime) || (bodyText ? estimateReadTime(bodyText) : ''),
    slug: pickString(doc.uid),
    title: pickString(doc.title) || 'Untitled',
    updatedAt: toIsoDate(doc.lastPublishedAt) ?? toIsoDate(doc.updatedAt) ?? publishedAt,
  }
}

function toBlogArticle(doc: BlogPost): BlogArticleProjection {
  const listItem = toBlogListItem(doc)
  const author = unwrapAuthor(doc.author)
  const bodyHtml = pickString(doc.bodyHtml)
  const { sections, toc } = buildTocAndSections(bodyHtml)

  return {
    ...listItem,
    authorAvatar: toImageProjection(author?.avatar),
    authorBio: pickString(author?.bio),
    authorGithubUrl: pickString(author?.githubUrl),
    authorHandle: pickString(author?.handle),
    authorLinkedinUrl: pickString(author?.linkedinUrl),
    authorRole: author ? pickAuthorRole(author) : '',
    bodyHtml,
    sections,
    toc,
  }
}

function toAuthorProjection(author: Author, posts: BlogPost[]): AuthorProjection {
  const projectedPosts = posts.map(toBlogListItem)

  return {
    ...toIdentity('authors', 'author', author),
    articleCount: projectedPosts.length,
    avatar: toImageProjection(author.avatar),
    bio: pickString(author.bio),
    credentials: (author.credentials || []).map(({ value }) => pickString(value)).filter(Boolean),
    earliestPublishedAt: projectedPosts[projectedPosts.length - 1]?.publishedAt || null,
    githubUrl: pickString(author.githubUrl),
    knowsAbout: (author.knowsAbout || []).map(({ value }) => pickString(value)).filter(Boolean),
    latestPublishedAt: projectedPosts[0]?.publishedAt || toIsoDate(author.lastPublishedAt),
    linkedinUrl: pickString(author.linkedinUrl),
    name: pickString(author.name) || 'Unknown Author',
    path: `/blog/authors/${pickString(author.slug)}`,
    posts: projectedPosts,
    role: pickAuthorRole(author),
    shortBio: pickString(author.shortBio) || pickString(author.bio),
    slug: pickString(author.slug),
  }
}

function toContentPageProjection(doc: ContentPage): ContentPageProjection {
  return {
    ...toIdentity('content-pages', 'content_page', doc),
    html: pickString(doc.contentHtml),
    seoDescription: pickString(doc.seoDescription),
    slug: pickString(doc.uid),
    title: pickString(doc.title) || 'Untitled',
  }
}

function buildBlogSearchWhere({ categorySlug, titleQuery }: BlogSearchOptions): Where | undefined {
  const clauses: Where[] = [
    {
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    },
  ]

  if (pickString(categorySlug)) {
    clauses.push({
      categorySlug: {
        equals: pickString(categorySlug),
      },
    })
  }

  if (pickString(titleQuery)) {
    clauses.push({
      title: {
        like: pickString(titleQuery),
      },
    })
  }

  if (clauses.length === 0) return undefined
  if (clauses.length === 1) return clauses[0]

  return {
    and: clauses,
  }
}

export async function listBlogPosts(options: BlogSearchOptions = {}): Promise<PaginatedBlogProjection> {
  const payload = await getCmsPayload()
  const page = options.page && options.page > 0 ? options.page : 1
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 20
  const where = buildBlogSearchWhere(options)

  const result = await payload.find({
    collection: 'blog-posts',
    depth: 1,
    limit: pageSize,
    page,
    select: {
      author: true,
      category: true,
      categoryRef: true,
      categorySlug: true,
      createdAt: true,
      excerpt: true,
      featured: true,
      firstPublishedAt: true,
      heroImage: true,
      lastPublishedAt: true,
      lang: true,
      prismicId: true,
      publishedAt: true,
      readTime: true,
      title: true,
      uid: true,
      updatedAt: true,
    },
    sort: '-publishedAt',
    where,
  })

  return {
    page: result.page || page,
    pageSize,
    posts: result.docs.map(toBlogListItem),
    totalDocs: result.totalDocs,
    totalPages: result.totalPages || 1,
  }
}

export async function getBlogPostByUID(uid: string): Promise<BlogArticleProjection | null> {
  const payload = await getCmsPayload()
  const result = await payload.find({
    collection: 'blog-posts',
    depth: 1,
    limit: 1,
    where: {
      and: [
        {
          uid: {
            equals: uid,
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

  const doc = result.docs[0]
  return doc ? toBlogArticle(doc) : null
}

export async function getBlogPostByDocumentID(documentId: number | string): Promise<BlogArticleProjection | null> {
  const payload = await getCmsPayload()
  const rawId = typeof documentId === 'number' ? String(documentId) : pickString(documentId)
  if (!rawId) return null

  if (/^\d+$/.test(rawId)) {
    try {
      const byId = await payload.findByID({
        collection: 'blog-posts',
        depth: 1,
        id: Number.parseInt(rawId, 10),
      })

      if (byId) return toBlogArticle(byId)
    } catch {}
  }

  const result = await payload.find({
    collection: 'blog-posts',
    depth: 1,
    limit: 1,
    where: {
      and: [
        {
          prismicId: {
            equals: rawId,
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

  const doc = result.docs[0]
  return doc ? toBlogArticle(doc) : null
}

export async function getBlogCategory(categorySlug: string): Promise<BlogCategoryProjection | null> {
  const allPosts = await listBlogPosts({ page: 1, pageSize: 500 })
  const filteredPosts = allPosts.posts.filter((post) => post.categorySlug === categorySlug)
  if (filteredPosts.length === 0) return null

  const allCategories = Array.from(new Set(allPosts.posts.map((post) => post.category)))
  const categoryCounts = Object.fromEntries(
    allCategories.map((category) => [
      category,
      allPosts.posts.filter((post) => post.category === category).length,
    ]),
  )

  return {
    allCategories,
    category: filteredPosts[0].category,
    categoryCounts,
    categorySlug,
    posts: filteredPosts,
  }
}

export async function listAuthors(): Promise<AuthorProjection[]> {
  const payload = await getCmsPayload()
  const authors = await payload.find({
    collection: 'authors',
    depth: 0,
    limit: 500,
    sort: 'name',
    where: {
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    },
  })

  const posts = await payload.find({
    collection: 'blog-posts',
    depth: 1,
    limit: 500,
    sort: '-publishedAt',
    where: {
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    },
  })

  return authors.docs.map((author) =>
    toAuthorProjection(
      author,
      posts.docs.filter((post) => {
        const relatedAuthor = unwrapAuthor(post.author)
        return relatedAuthor?.id === author.id
      }),
    ),
  )
}

export async function getAuthorBySlug(slug: string): Promise<AuthorProjection | null> {
  const payload = await getCmsPayload()
  const authorResult = await payload.find({
    collection: 'authors',
    depth: 0,
    limit: 1,
    where: {
      and: [
        {
          slug: {
            equals: slug,
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

  const author = authorResult.docs[0]
  if (!author) return null

  const posts = await payload.find({
    collection: 'blog-posts',
    depth: 1,
    limit: 500,
    sort: '-publishedAt',
    where: {
      and: [
        {
          author: {
            equals: author.id,
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

  return toAuthorProjection(author, posts.docs)
}

export async function listContentPages(): Promise<ContentPageProjection[]> {
  const payload = await getCmsPayload()
  const result = await payload.find({
    collection: 'content-pages',
    depth: 0,
    limit: 500,
    sort: 'title',
    where: {
      lang: {
        equals: DEFAULT_LANGUAGE_CODE,
      },
    },
  })

  return result.docs.map(toContentPageProjection)
}

export async function getContentPageByUID(uid: string): Promise<ContentPageProjection | null> {
  const payload = await getCmsPayload()
  const result = await payload.find({
    collection: 'content-pages',
    depth: 0,
    limit: 1,
    where: {
      and: [
        {
          uid: {
            equals: uid,
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

  const doc = result.docs[0]
  return doc ? toContentPageProjection(doc) : null
}

export async function getContentPageByDocumentID(documentId: number | string): Promise<ContentPageProjection | null> {
  const payload = await getCmsPayload()
  const rawId = typeof documentId === 'number' ? String(documentId) : pickString(documentId)
  if (!rawId) return null

  if (/^\d+$/.test(rawId)) {
    try {
      const byId = await payload.findByID({
        collection: 'content-pages',
        depth: 0,
        id: Number.parseInt(rawId, 10),
      })

      if (byId) return toContentPageProjection(byId)
    } catch {}
  }

  const result = await payload.find({
    collection: 'content-pages',
    depth: 0,
    limit: 1,
    where: {
      and: [
        {
          prismicId: {
            equals: rawId,
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

  const doc = result.docs[0]
  return doc ? toContentPageProjection(doc) : null
}
