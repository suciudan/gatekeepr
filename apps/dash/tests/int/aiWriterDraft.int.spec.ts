import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import {
  convertWriterArticleToBlogPost,
  createBlogPostDraftFromWriterRun,
  restoreWriterDraftAsFinalArticle,
} from '@/lib/aiWriter/articleDraft'
import {
  createWriterRun,
  getWriterRunDetail,
  upsertWriterArtifact,
} from '@/lib/aiWriter/repository'
import { getCmsPayload } from '@/lib/payload'

let payload: Payload

const fixture = {
  convertReuseUid: 'wsa-199-cms-convert-reuse-title',
  collisionUid: 'wsa-uid-collision-title',
  draftUid: 'wsa-199-cms-draft-title',
  runKeyword: 'WSA 199 CMS Draft Handoff',
  replaceRunKeyword: 'WSA 272 CMS Replace Handoff',
  replaceUid: 'wsa-272-existing-slug',
  selectiveTranslationUid: 'wsa-199-selective-translation-title',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ai writer draft handoff', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    await payload.delete({
      collection: 'writer-runs',
      where: {
        targetKeyword: {
          contains: fixture.runKeyword,
        },
      },
    })

    await payload.delete({
      collection: 'blog-posts',
      where: {
        uid: {
          in: [
            fixture.collisionUid,
            `${fixture.collisionUid}-2`,
            fixture.convertReuseUid,
            fixture.draftUid,
            fixture.replaceUid,
            fixture.selectiveTranslationUid,
          ],
        },
      },
    })
  })

  it('creates and reuses a cms blog post draft from the latest final article artifact', async () => {
    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-199-source',
        targetKeyword: fixture.runKeyword,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_draft_md',
        content: [
          '<!-- meta_description: Draft meta description for the CMS handoff. -->',
          '',
          '# WSA 199 CMS Draft Title',
          '',
          'The generated excerpt paragraph for the CMS draft.',
          '',
          '## Overview',
          '',
          'This is the generated article body.',
          '',
          '| Signal | Value |',
          '| --- | --- |',
          '| Reviews | 120 |',
          '',
          '```js',
          "const hotel = 'Expedia';",
          '```',
        ].join('\n'),
        filename: 'article-draft.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const created = await createBlogPostDraftFromWriterRun(run.id, payload)
    const refreshedRun = await getWriterRunDetail(run.id, payload)
    const storedDraft = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: created.draft.id,
    })

    expect(created.reusedExistingDraft).toBe(false)
    expect(created.draft.title).toBe('WSA 199 CMS Draft Title')
    expect(created.draft.uid).toBe(fixture.draftUid)
    expect(refreshedRun.run.createdDraftID).toBe(created.draft.id)
    expect(storedDraft.title).toBe('WSA 199 CMS Draft Title')
    expect(storedDraft.excerpt).toBe('The generated excerpt paragraph for the CMS draft.')
    expect(storedDraft.seoDescription).toBe('Draft meta description for the CMS handoff.')
    expect(storedDraft.bodyHtml).not.toContain('<h1>')
    expect(storedDraft.bodyHtml).toContain('<h2>Overview</h2>')
    expect(storedDraft.bodyHtml).toContain('<table')
    expect(storedDraft.bodyHtml).toContain('<pre><code class="language-javascript">')
    expect(storedDraft.bodyHtml).toContain('const hotel = &#39;Expedia&#39;;')
    expect(storedDraft.body?.root?.children?.some((node) => node?.type === 'table')).toBe(true)
    expect(storedDraft.body?.root?.children?.some((node) => node?.type === 'block')).toBe(true)
    expect(storedDraft._status).toBe('draft')

    await payload.update({
      collection: 'blog-posts',
      id: created.draft.id,
      data: {
        bodyHtml: '<h1>WSA 199 CMS Draft Title</h1><p>Stale body.</p>',
        excerpt: 'Stale excerpt',
        seoDescription: 'Stale seo description',
        title: 'Stale title',
      },
      draft: true,
    })

    const reused = await createBlogPostDraftFromWriterRun(run.id, payload)
    const reusedStoredDraft = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: created.draft.id,
    })

    expect(reused.reusedExistingDraft).toBe(true)
    expect(reused.draft.id).toBe(created.draft.id)
    expect(reusedStoredDraft.bodyHtml).not.toContain('<h1>')
    expect(reusedStoredDraft.bodyHtml).toContain('<table')
    expect(reusedStoredDraft.bodyHtml).toContain('<pre><code class="language-javascript">')
    expect(reusedStoredDraft.excerpt).toBe('The generated excerpt paragraph for the CMS draft.')
    expect(reusedStoredDraft.seoDescription).toBe('Draft meta description for the CMS handoff.')
    expect(reusedStoredDraft.title).toBe('WSA 199 CMS Draft Title')
  })

  it('restores the write-stage draft over an overwritten final revision artifact', async () => {
    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-199-restore-source',
        targetKeyword: `${fixture.runKeyword} restore`,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_draft_md',
        content: [
          '<!-- meta_description: Restored draft meta description. -->',
          '',
          '# Restored Draft Title',
          '',
          'This is the original good draft.',
        ].join('\n'),
        filename: 'article-draft.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_revision_md',
        content: 'antl:thinking malformed response',
        filename: 'article-revision.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const restored = await restoreWriterDraftAsFinalArticle(run.id, payload)

    const restoredRevision = restored.artifacts.find(
      (artifact) => artifact.artifactType === 'article_revision_md',
    )
    expect(restoredRevision).toBeTruthy()
    expect(restoredRevision?.content).toContain('This is the original good draft.')
    expect(restoredRevision?.content).not.toContain('antl:thinking malformed response')

    const created = await createBlogPostDraftFromWriterRun(run.id, payload)
    expect(created.finalArticleArtifact.artifactType).toBe('article_revision_md')
    expect(created.finalArticleArtifact.content).toContain('This is the original good draft.')
  })

  it('replaces an existing english blog post and preserves its slug', async () => {
    const externalRequest = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('AI Writer conversion should not call external translation APIs.'))

    const existingEnglishPost = await payload.create({
      collection: 'blog-posts',
      data: {
        _status: 'draft',
        bodyHtml: '<p>Original english body.</p>',
        excerpt: 'Original english excerpt',
        lang: 'en',
        seoDescription: 'Original english seo description',
        title: 'Original English Title',
        uid: fixture.replaceUid,
      },
      draft: true,
    })

    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-272-source',
        targetKeyword: fixture.replaceRunKeyword,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_revision_md',
        content: [
          '<!-- meta_description: Replacement article meta description for the generated blog post. -->',
          '',
          '# Replacement Article Title',
          '',
          'Replacement excerpt paragraph.',
          '',
          '## Updated section',
          '',
          'Replacement body copy.',
          '',
          '| Type | Value |',
          '| --- | --- |',
          '| Listings | 45 |',
          '',
          '```python',
          "print('replacement flow')",
          '```',
        ].join('\n'),
        filename: 'article-revision.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const result = await convertWriterArticleToBlogPost({
      payload,
      replacePostId: Number(existingEnglishPost.id),
      runID: run.id,
    })

    const refreshedEnglishPost = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: existingEnglishPost.id,
    })
    expect(result.operation).toBe('replaced')
    expect(result.post.id).toBe(existingEnglishPost.id)
    expect(result.post.uid).toBe(fixture.replaceUid)
    expect(refreshedEnglishPost.uid).toBe(fixture.replaceUid)
    expect(refreshedEnglishPost.title).toBe('Replacement Article Title')
    expect(refreshedEnglishPost.excerpt).toBe('Replacement excerpt paragraph.')
    expect(refreshedEnglishPost.seoDescription).toBe(
      'Replacement article meta description for the generated blog post.',
    )
    expect(refreshedEnglishPost.bodyHtml).not.toContain('<h1>')
    expect(refreshedEnglishPost.bodyHtml).toContain('<h2>Updated section</h2>')
    expect(refreshedEnglishPost.bodyHtml).toContain('<table')
    expect(refreshedEnglishPost.bodyHtml).toContain('<pre><code class="language-python">')
    expect(refreshedEnglishPost.body?.root?.children?.some((node) => node?.type === 'table')).toBe(
      true,
    )
    expect(refreshedEnglishPost.body?.root?.children?.some((node) => node?.type === 'block')).toBe(
      true,
    )
    expect(externalRequest).not.toHaveBeenCalled()

    const refreshedRun = await getWriterRunDetail(run.id, payload)
    expect(refreshedRun.run.createdDraftID).toBe(existingEnglishPost.id)
  })

  it('reuses an existing run draft when converting to a new blog post', async () => {
    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-199-source-convert',
        targetKeyword: `${fixture.runKeyword} Convert Reuse`,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_draft_md',
        content: [
          '<!-- meta_description: Convert reuse meta description. -->',
          '',
          '# WSA 199 CMS Convert Reuse Title',
          '',
          'Converted article excerpt paragraph.',
          '',
          '## Converted section',
          '',
          '| Column | Value |',
          '| --- | --- |',
          '| Rows | 3 |',
          '',
          '```ts',
          "console.log('convert reuse')",
          '```',
        ].join('\n'),
        filename: 'article-draft-convert.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const draft = await createBlogPostDraftFromWriterRun(run.id, payload)
    const result = await convertWriterArticleToBlogPost({
      payload,
      runID: run.id,
    })

    const refreshedEnglishPost = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: draft.draft.id,
    })
    const refreshedRun = await getWriterRunDetail(run.id, payload)

    expect(result.operation).toBe('created')
    expect(result.post.id).toBe(draft.draft.id)
    expect(refreshedRun.run.createdDraftID).toBe(draft.draft.id)
    expect(refreshedEnglishPost.uid).toBe(draft.draft.uid)
    expect(refreshedEnglishPost.uid).toBe(fixture.convertReuseUid)
    expect(refreshedEnglishPost.title).toBe('WSA 199 CMS Convert Reuse Title')
    expect(refreshedEnglishPost.excerpt).toBe('Converted article excerpt paragraph.')
    expect(refreshedEnglishPost.seoDescription).toBe('Convert reuse meta description.')
    expect(refreshedEnglishPost.bodyHtml).toContain('<table')
    expect(refreshedEnglishPost.bodyHtml).toContain('<pre><code class="language-typescript">')
  })

  it('creates a unique uid for new drafts and conversions when the generated slug already exists', async () => {
    await payload.create({
      collection: 'blog-posts',
      data: {
        _status: 'draft',
        bodyHtml: '<p>Existing english body.</p>',
        excerpt: 'Existing english excerpt',
        lang: 'en',
        seoDescription: 'Existing english seo description',
        title: 'WSA UID Collision Title',
        uid: fixture.collisionUid,
      },
      draft: true,
    })

    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-uid-collision',
        targetKeyword: `${fixture.runKeyword} UID Collision`,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_draft_md',
        content: [
          '<!-- meta_description: UID collision meta description. -->',
          '',
          '# WSA UID Collision Title',
          '',
          'UID collision excerpt paragraph.',
          '',
          '## Collision section',
          '',
          'Collision body.',
        ].join('\n'),
        filename: 'article-draft-collision.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const createdDraft = await createBlogPostDraftFromWriterRun(run.id, payload)
    const converted = await convertWriterArticleToBlogPost({
      payload,
      runID: run.id,
    })
    const refreshedEnglishPost = await payload.findByID({
      collection: 'blog-posts',
      draft: true,
      id: createdDraft.draft.id,
    })

    expect(createdDraft.draft.uid).toBe(`${fixture.collisionUid}-2`)
    expect(converted.post.id).toBe(createdDraft.draft.id)
    expect(converted.post.uid).toBe(`${fixture.collisionUid}-2`)
    expect(refreshedEnglishPost.uid).toBe(`${fixture.collisionUid}-2`)
  })

  it('creates only the english blog post during AI Writer conversion', async () => {
    const externalRequest = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('AI Writer conversion should not call external translation APIs.'))

    const { run } = await createWriterRun(
      {
        sourceUrl: 'https://example.com/wsa-selective-translation-source',
        targetKeyword: `${fixture.runKeyword} selective translation`,
      },
      payload,
    )

    await upsertWriterArtifact(
      {
        artifactRole: 'derived',
        artifactType: 'article_revision_md',
        content: [
          '<!-- meta_description: Selective translation meta description. -->',
          '',
          '# WSA 199 Selective Translation Title',
          '',
          'Selective translation excerpt paragraph.',
          '',
          '## Overview',
          '',
          'Selective translation body copy.',
        ].join('\n'),
        filename: 'article-revision-selective.md',
        mimeType: 'text/markdown',
        runID: run.id,
      },
      payload,
    )

    const result = await convertWriterArticleToBlogPost({
      payload,
      runID: run.id,
    })

    expect(result.operation).toBe('created')
    expect(result.post.uid).toBe(fixture.selectiveTranslationUid)
    expect(result.post.lang).toBe('en')
    expect(externalRequest).not.toHaveBeenCalled()
  })
})
