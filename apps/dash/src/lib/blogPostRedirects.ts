import type { CollectionConfig } from 'payload'
import type { BlogPostRedirect } from '../payload-types'

import { DEFAULT_LANGUAGE_CODE, DEFAULT_LANGUAGES } from './languages'

type BlogPostAfterChangeHook = NonNullable<NonNullable<CollectionConfig['hooks']>['afterChange']>[number]
type LanguageCode = (typeof DEFAULT_LANGUAGES)[number]['code']

const LANGUAGE_CODES = new Set<string>(DEFAULT_LANGUAGES.map(({ code }) => code))

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pickNumericId(value: unknown): null | number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numericValue = Number(value)
    return Number.isInteger(numericValue) ? numericValue : null
  }

  return null
}

function extractRelationshipId(value: unknown): null | number {
  const directId = pickNumericId(value)

  if (directId !== null) {
    return directId
  }

  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return pickNumericId(id)
  }

  return null
}

function pickLanguageCode(value: unknown): LanguageCode {
  const language = pickString(value)

  if (LANGUAGE_CODES.has(language)) {
    return language as LanguageCode
  }

  return DEFAULT_LANGUAGE_CODE
}

function getRedirectKey(lang: LanguageCode, fromUid: string): string {
  return `${lang}:${fromUid}`
}

async function findRedirectByKey(args: {
  key: string
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
}): Promise<BlogPostRedirect | null> {
  const result = await args.req.payload.find({
    collection: 'blog-post-redirects',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req: args.req,
    where: {
      redirectKey: {
        equals: args.key,
      },
    },
  })

  return (result.docs[0] as BlogPostRedirect | undefined) ?? null
}

async function findRedirectsForPost(args: {
  lang: LanguageCode
  postId: number
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
}): Promise<BlogPostRedirect[]> {
  const result = await args.req.payload.find({
    collection: 'blog-post-redirects',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    pagination: false,
    req: args.req,
    where: {
      and: [
        {
          post: {
            equals: args.postId,
          },
        },
        {
          lang: {
            equals: args.lang,
          },
        },
      ],
    },
  })

  return result.docs as BlogPostRedirect[]
}

async function deleteRedirect(args: {
  id: number
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
}) {
  await args.req.payload.delete({
    collection: 'blog-post-redirects',
    id: args.id,
    overrideAccess: true,
    req: args.req,
  })
}

async function updateRedirect(args: {
  id: number
  fromUid?: string
  lang: LanguageCode
  postId: number
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
  toUid: string
}) {
  await args.req.payload.update({
    collection: 'blog-post-redirects',
    context: {
      ...args.req.context,
      skipBlogPostRedirectTracking: true,
    },
    data: {
      ...(args.fromUid ? { fromUid: args.fromUid } : {}),
      lang: args.lang,
      post: args.postId,
      toUid: args.toUid,
    },
    id: args.id,
    overrideAccess: true,
    req: args.req,
  })
}

async function createRedirect(args: {
  fromUid: string
  lang: LanguageCode
  postId: number
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
  toUid: string
}) {
  await args.req.payload.create({
    collection: 'blog-post-redirects',
    context: {
      ...args.req.context,
      skipBlogPostRedirectTracking: true,
    },
    data: {
      fromUid: args.fromUid,
      lang: args.lang,
      post: args.postId,
      toUid: args.toUid,
    },
    overrideAccess: true,
    req: args.req,
  })
}

async function upsertBlogPostRedirectChain(args: {
  fromUid: string
  lang: LanguageCode
  postId: number
  req: Parameters<BlogPostAfterChangeHook>[0]['req']
  toUid: string
}) {
  const currentSlugRedirect = await findRedirectByKey({
    key: getRedirectKey(args.lang, args.toUid),
    req: args.req,
  })

  if (currentSlugRedirect) {
    await deleteRedirect({
      id: currentSlugRedirect.id,
      req: args.req,
    })
  }

  const existingForPost = await findRedirectsForPost({
    lang: args.lang,
    postId: args.postId,
    req: args.req,
  })
  const deletedRedirectIds = new Set(currentSlugRedirect ? [String(currentSlugRedirect.id)] : [])
  let previousSlugRedirect =
    existingForPost.find((redirect) => pickString(redirect.fromUid) === args.fromUid) ?? null

  for (const redirect of existingForPost) {
    if (deletedRedirectIds.has(String(redirect.id))) {
      continue
    }

    if (pickString(redirect.fromUid) === args.toUid) {
      await deleteRedirect({
        id: redirect.id,
        req: args.req,
      })
      deletedRedirectIds.add(String(redirect.id))
      continue
    }

    if (pickString(redirect.toUid) !== args.toUid || extractRelationshipId(redirect.post) !== args.postId) {
      await updateRedirect({
        id: redirect.id,
        lang: args.lang,
        postId: args.postId,
        req: args.req,
        toUid: args.toUid,
      })
    }
  }

  if (!previousSlugRedirect || deletedRedirectIds.has(String(previousSlugRedirect.id))) {
    previousSlugRedirect = await findRedirectByKey({
      key: getRedirectKey(args.lang, args.fromUid),
      req: args.req,
    })
  }

  if (previousSlugRedirect && !deletedRedirectIds.has(String(previousSlugRedirect.id))) {
    await updateRedirect({
      id: previousSlugRedirect.id,
      fromUid: args.fromUid,
      lang: args.lang,
      postId: args.postId,
      req: args.req,
      toUid: args.toUid,
    })
    return
  }

  await createRedirect(args)
}

export const trackPublishedBlogPostSlugRedirect: BlogPostAfterChangeHook = async ({
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if ((context as Record<string, unknown> | undefined)?.skipBlogPostRedirectTracking) {
    return doc
  }

  if (
    operation === 'create' ||
    doc?.id == null ||
    doc._status !== 'published' ||
    previousDoc?._status !== 'published'
  ) {
    return doc
  }

  const postId = extractRelationshipId(doc.id)

  const previousUid = pickString(previousDoc.uid)
  const nextUid = pickString(doc.uid)

  if (!postId || !previousUid || !nextUid || previousUid === nextUid) {
    return doc
  }

  await upsertBlogPostRedirectChain({
    fromUid: previousUid,
    lang: pickLanguageCode(doc.lang),
    postId,
    req,
    toUid: nextUid,
  })

  return doc
}
