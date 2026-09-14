import { JSDOM } from 'jsdom'
import { marked } from 'marked'
import type { Payload } from 'payload'

import { DEFAULT_LANGUAGE_CODE } from '@/lib/languages'
import { getCmsPayload } from '@/lib/payload'
import { convertMarkdownToLexicalState, createEmptyLexicalState } from '@/lib/richText'
import { slugifySegment } from '@/lib/slugify'
import type { BlogPost } from '@/payload-types'

import {
  getLatestWriterFinalArticleArtifact,
  invalidateWriterCheckArtifactsForArticle,
  syncWriterArticleRevisionFromMarkdown,
} from './articleRevision'
import {
  createWriterTraceEvent,
  getWriterRunDetail,
  updateWriterRun,
  upsertWriterArtifact,
} from './repository'
import type { WriterArtifactRecord, WriterRelationshipID, WriterRunDetail } from './types'

type CreateBlogPostDraftResult = {
  draft: Pick<BlogPost, 'id' | 'title' | 'uid' | 'updatedAt'>
  editorPath: string
  finalArticleArtifact: WriterArtifactRecord
  reusedExistingDraft: boolean
  runDetail: WriterRunDetail
}

type BlogPostDocumentSummary = Pick<BlogPost, 'id' | 'lang' | 'title' | 'uid' | 'updatedAt'>

type PreparedBlogPostDraft = {
  body: NonNullable<BlogPost['body']>
  bodyHtml: string
  excerpt: string
  finalArticleArtifact: WriterArtifactRecord
  seoDescription: string
  title: string
  uid: string
}

type ConvertWriterArticleResult = {
  detail: WriterRunDetail
  editorPath: string
  operation: 'created' | 'replaced'
  post: BlogPostDocumentSummary
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function stripLeadingHtmlComments(markdown: string) {
  return markdown.replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/u, '').trimStart()
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractMetaDescription(markdown: string) {
  const match = markdown.match(/<!--\s*(?:meta_description|Meta):\s*([\s\S]*?)\s*-->/i)
  return pickString(match?.[1])
}

function extractArticleTitle(markdown: string) {
  const withoutLeadingComments = stripLeadingHtmlComments(markdown)
  const headingMatch = withoutLeadingComments.match(/^\s*#\s+(.+?)\s*$/m)
  const heading = headingMatch?.[1]?.trim()

  if (heading) {
    return heading
  }

  const firstNonEmptyLine = withoutLeadingComments
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)

  if (firstNonEmptyLine) {
    return firstNonEmptyLine.replace(/^#+\s*/, '').trim()
  }

  throw new Error('The generated article is empty.')
}

function stripLeadingH1(markdown: string, title: string) {
  const withoutLeadingComments = stripLeadingHtmlComments(markdown)
  const normalizedTitlePattern = escapeRegex(title).replace(/\s+/g, '\\s+')
  const exactTitlePatterns = [
    new RegExp(`^\\s*#\\s+${normalizedTitlePattern}\\s*#*\\s*(?:\\r?\\n)+`, 'u'),
    new RegExp(`^\\s*${normalizedTitlePattern}\\s*\\r?\\n=+\\s*(?:\\r?\\n)+`, 'u'),
  ]

  for (const pattern of exactTitlePatterns) {
    const stripped = withoutLeadingComments.replace(pattern, '').trim()
    if (stripped !== withoutLeadingComments.trim()) {
      return stripped
    }
  }

  return withoutLeadingComments
    .replace(/^\s*#\s+.+?\s*#*\s*(?:\r?\n)+/u, '')
    .replace(/^\s*.+\r?\n=+\s*(?:\r?\n)+/u, '')
    .trim()
}

function getLatestArtifactOfType(
  artifacts: WriterArtifactRecord[],
  artifactType: WriterArtifactRecord['artifactType'],
) {
  return (
    [...artifacts]
      .filter((artifact) => artifact.artifactType === artifactType)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  )
}

export function getLatestFinalArticleArtifact(artifacts: WriterArtifactRecord[]) {
  return getLatestWriterFinalArticleArtifact(artifacts)
}

async function withPayload(payload?: Payload) {
  return payload ?? getCmsPayload()
}

async function resolveExistingDraft(
  runDetail: WriterRunDetail,
  cms: Payload,
): Promise<null | BlogPostDocumentSummary> {
  if (!runDetail.run.createdDraftID) {
    return null
  }

  try {
    const existing = (await cms.findByID({
      collection: 'blog-posts',
      depth: 0,
      draft: true,
      id: runDetail.run.createdDraftID,
    })) as BlogPost

    return {
      id: existing.id,
      lang: existing.lang,
      title: existing.title,
      uid: existing.uid,
      updatedAt: existing.updatedAt,
    }
  } catch {
    return null
  }
}

async function resolveUniqueBlogPostUid(cms: Payload, desiredUid: string): Promise<string> {
  const normalizedUid = pickString(desiredUid)

  if (!normalizedUid) {
    throw new Error('Could not derive a valid blog post slug from the generated article title.')
  }

  const existing = await cms.find({
    collection: 'blog-posts',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      or: [
        {
          uid: {
            equals: normalizedUid,
          },
        },
        {
          uidLocaleKey: {
            equals: `${DEFAULT_LANGUAGE_CODE}:${normalizedUid}`,
          },
        },
      ],
    },
  })

  if (!existing.docs.length) {
    return normalizedUid
  }

  let suffix = 2

  while (true) {
    const candidate = `${normalizedUid}-${suffix}`
    const collision = await cms.find({
      collection: 'blog-posts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        uid: {
          equals: candidate,
        },
      },
    })

    if (!collision.docs.length) {
      return candidate
    }

    suffix += 1
  }
}

function buildExcerptFromHtml(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`)
  const paragraphs = [...dom.window.document.querySelectorAll('p')]
    .map((node) => pickString(node.textContent))
    .filter(Boolean)

  const firstParagraph = paragraphs[0]
  if (firstParagraph) {
    return firstParagraph
  }

  return stripHtml(html).slice(0, 220).trim()
}

function stripLeadingH1FromHtml(html: string, title: string) {
  const dom = new JSDOM(`<body>${html}</body>`)
  const body = dom.window.document.body
  const firstElement = body.firstElementChild

  if (!firstElement) {
    return html
  }

  if (
    firstElement.tagName.toLowerCase() === 'h1' &&
    (!pickString(title) || pickString(firstElement.textContent) === pickString(title))
  ) {
    firstElement.remove()
  }

  return body.innerHTML.trim()
}

function buildEditorPath(cms: Payload, draftID: number | string) {
  return `${cms.config.routes.admin}/collections/blog-posts/${draftID}`
}

function summarizeBlogPost(post: BlogPost): BlogPostDocumentSummary {
  return {
    id: post.id,
    lang: post.lang,
    title: post.title,
    uid: post.uid,
    updatedAt: post.updatedAt,
  }
}

async function prepareBlogPostDraft(runDetail: WriterRunDetail): Promise<PreparedBlogPostDraft> {
  const finalArticleArtifact = getLatestFinalArticleArtifact(runDetail.artifacts)

  if (!finalArticleArtifact) {
    throw new Error(
      'No final article artifact is available yet. Finish the write/check stages before creating a draft.',
    )
  }

  const title = extractArticleTitle(finalArticleArtifact.content)
  const uid = slugifySegment(title)

  if (!uid) {
    throw new Error('Could not derive a valid blog post slug from the generated article title.')
  }

  const bodyMarkdown = stripLeadingH1(finalArticleArtifact.content, title)
  if (!bodyMarkdown) {
    throw new Error('The generated article body is empty.')
  }

  const renderedBodyHtml = await marked.parse(bodyMarkdown, {
    async: true,
    gfm: true,
  })
  const bodyHtml = stripLeadingH1FromHtml(renderedBodyHtml, title)
  const body = ((await convertMarkdownToLexicalState(bodyMarkdown)) ??
    createEmptyLexicalState()) as NonNullable<BlogPost['body']>

  return {
    body,
    bodyHtml,
    excerpt: buildExcerptFromHtml(bodyHtml),
    finalArticleArtifact,
    seoDescription: extractMetaDescription(finalArticleArtifact.content),
    title,
    uid,
  }
}

export async function createBlogPostDraftFromWriterRun(
  runID: WriterRelationshipID,
  payload?: Payload,
): Promise<CreateBlogPostDraftResult> {
  const cms = await withPayload(payload)
  const runDetail = await getWriterRunDetail(runID, cms)
  const preparedDraft = await prepareBlogPostDraft(runDetail)

  const existingDraft = await resolveExistingDraft(runDetail, cms)
  if (existingDraft) {
    const updatedDraft = (await cms.update({
      collection: 'blog-posts',
      id: existingDraft.id,
      data: {
        _status: 'draft',
        body: preparedDraft.body,
        bodyHtml: preparedDraft.bodyHtml,
        excerpt: preparedDraft.excerpt,
        seoDescription: preparedDraft.seoDescription,
        title: preparedDraft.title,
        uid: existingDraft.uid,
      },
      draft: true,
    })) as BlogPost

    return {
      draft: {
        id: updatedDraft.id,
        title: updatedDraft.title,
        uid: updatedDraft.uid,
        updatedAt: updatedDraft.updatedAt,
      },
      editorPath: buildEditorPath(cms, updatedDraft.id),
      finalArticleArtifact: preparedDraft.finalArticleArtifact,
      reusedExistingDraft: true,
      runDetail,
    }
  }

  const createdDraft = (await cms.create({
    collection: 'blog-posts',
    data: {
      _status: 'draft',
      body: preparedDraft.body,
      bodyHtml: preparedDraft.bodyHtml,
      excerpt: preparedDraft.excerpt,
      lang: DEFAULT_LANGUAGE_CODE,
      seoDescription: preparedDraft.seoDescription,
      title: preparedDraft.title,
      uid: await resolveUniqueBlogPostUid(cms, preparedDraft.uid),
    },
    draft: true,
  })) as BlogPost

  const completedAt = new Date().toISOString()

  await Promise.all([
    updateWriterRun(
      runID,
      {
        createdDraft: createdDraft.id,
      },
      cms,
    ),
    upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'debug_output',
        content: JSON.stringify(
          {
            articleArtifactId: preparedDraft.finalArticleArtifact.id,
            blogPostId: createdDraft.id,
            editorPath: buildEditorPath(cms, createdDraft.id),
            excerpt: preparedDraft.excerpt,
            seoDescription: preparedDraft.seoDescription,
            title: preparedDraft.title,
            uid: preparedDraft.uid,
          },
          null,
          2,
        ),
        filename: 'cms-blog-post-draft.json',
        mimeType: 'application/json',
        runID,
        schemaName: 'cms.blog_post_draft.response',
        schemaVersion: 'v1',
      },
      cms,
    ),
    createWriterTraceEvent(
      {
        completedAt,
        eventType: 'cms_blog_post_draft_created',
        provider: 'local',
        requestPayload: {
          articleArtifactId: preparedDraft.finalArticleArtifact.id,
        },
        responsePayload: {
          blogPostId: createdDraft.id,
          editorPath: buildEditorPath(cms, createdDraft.id),
          title: preparedDraft.title,
          uid: preparedDraft.uid,
        },
        runID,
        stageKey: 'check',
        startedAt: completedAt,
        status: 'completed',
      },
      cms,
    ),
  ])

  return {
    draft: {
      id: createdDraft.id,
      title: createdDraft.title,
      uid: createdDraft.uid,
      updatedAt: createdDraft.updatedAt,
    },
    editorPath: buildEditorPath(cms, createdDraft.id),
    finalArticleArtifact: preparedDraft.finalArticleArtifact,
    reusedExistingDraft: false,
    runDetail: await getWriterRunDetail(runID, cms),
  }
}

export async function restoreWriterDraftAsFinalArticle(
  runID: WriterRelationshipID,
  payload?: Payload,
): Promise<WriterRunDetail> {
  const cms = await withPayload(payload)
  const runDetail = await getWriterRunDetail(runID, cms)
  const draftArtifact = getLatestArtifactOfType(runDetail.artifacts, 'article_draft_md')
  const existingRevisionArtifact = getLatestArtifactOfType(
    runDetail.artifacts,
    'article_revision_md',
  )

  if (!draftArtifact) {
    throw new Error('No write-stage article draft is available to restore.')
  }

  const completedAt = new Date().toISOString()
  const { revisionArtifact: restoredArtifact } = await syncWriterArticleRevisionFromMarkdown({
    articleMarkdown: draftArtifact.content,
    payload: cms,
    runID,
  })

  await invalidateWriterCheckArtifactsForArticle({
    articleArtifact: restoredArtifact,
    payload: cms,
    runDetail,
  })

  await createWriterTraceEvent(
    {
      completedAt,
      eventType: 'article_draft_restored',
      provider: 'local',
      requestPayload: {
        draftArtifactId: draftArtifact.id,
        replacedRevisionArtifactId: existingRevisionArtifact?.id ?? null,
      },
      responsePayload: {
        restoredArtifactId: restoredArtifact.id,
      },
      runID,
      stageKey: 'check',
      startedAt: completedAt,
      status: 'completed',
    },
    cms,
  )

  return getWriterRunDetail(runID, cms)
}

async function resolveEnglishBlogPost(
  postID: WriterRelationshipID,
  cms: Payload,
): Promise<BlogPost> {
  const post = (await cms.findByID({
    collection: 'blog-posts',
    depth: 0,
    draft: true,
    id: postID,
  })) as BlogPost

  if (post.lang !== DEFAULT_LANGUAGE_CODE) {
    throw new Error('Select an English blog post when replacing an existing article.')
  }

  return post
}

export async function convertWriterArticleToBlogPost(args: {
  payload?: Payload
  replacePostId?: WriterRelationshipID
  runID: WriterRelationshipID
}): Promise<ConvertWriterArticleResult> {
  const cms = await withPayload(args.payload)
  const runDetail = await getWriterRunDetail(args.runID, cms)
  const preparedDraft = await prepareBlogPostDraft(runDetail)

  const existingSourcePost = args.replacePostId
    ? await resolveEnglishBlogPost(args.replacePostId, cms)
    : null
  const existingDraft = existingSourcePost ? null : await resolveExistingDraft(runDetail, cms)

  const savedPost = (
    existingSourcePost || existingDraft
      ? await cms.update({
          collection: 'blog-posts',
          id: existingSourcePost?.id ?? existingDraft!.id,
          data: {
            _status: 'draft',
            body: preparedDraft.body,
            bodyHtml: preparedDraft.bodyHtml,
            excerpt: preparedDraft.excerpt,
            seoDescription: preparedDraft.seoDescription,
            title: preparedDraft.title,
            uid: existingSourcePost?.uid ?? existingDraft!.uid,
          },
          draft: true,
        })
      : await cms.create({
          collection: 'blog-posts',
          data: {
            _status: 'draft',
            body: preparedDraft.body,
            bodyHtml: preparedDraft.bodyHtml,
            excerpt: preparedDraft.excerpt,
            lang: DEFAULT_LANGUAGE_CODE,
            seoDescription: preparedDraft.seoDescription,
            title: preparedDraft.title,
            uid: await resolveUniqueBlogPostUid(cms, preparedDraft.uid),
          },
          draft: true,
        })
  ) as BlogPost

  const completedAt = new Date().toISOString()
  const editorPath = buildEditorPath(cms, savedPost.id)
  const operation = existingSourcePost ? 'replaced' : 'created'

  await Promise.all([
    updateWriterRun(
      args.runID,
      {
        createdDraft: savedPost.id,
      },
      cms,
    ),
    upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'debug_output',
        content: JSON.stringify(
          {
            articleArtifactId: preparedDraft.finalArticleArtifact.id,
            blogPostId: savedPost.id,
            editorPath,
            operation,
            preservedUid: existingSourcePost?.uid ?? existingDraft?.uid ?? null,
            title: savedPost.title,
            uid: savedPost.uid,
          },
          null,
          2,
        ),
        filename: 'cms-ai-writer-blog-post-sync.json',
        mimeType: 'application/json',
        runID: args.runID,
        schemaName: 'cms.blog_post_sync.response',
        schemaVersion: 'v1',
      },
      cms,
    ),
    createWriterTraceEvent(
      {
        completedAt,
        eventType: existingSourcePost ? 'cms_blog_post_replaced' : 'cms_blog_post_created',
        provider: 'local',
        requestPayload: {
          articleArtifactId: preparedDraft.finalArticleArtifact.id,
          replacePostId: existingSourcePost?.id ?? null,
          reusedDraftId: existingDraft?.id ?? null,
        },
        responsePayload: {
          blogPostId: savedPost.id,
          editorPath,
          operation,
          uid: savedPost.uid,
        },
        runID: args.runID,
        stageKey: 'check',
        startedAt: completedAt,
        status: 'completed',
      },
      cms,
    ),
  ])

  return {
    detail: await getWriterRunDetail(args.runID, cms),
    editorPath,
    operation,
    post: summarizeBlogPost(savedPost),
  }
}
