import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { getCmsPayload } from '@/lib/payload'
import type { BlogPost } from '@/payload-types'

let payload: Payload

const fixture = {
  currentUid: 'test-redirect-chain-current-wsa-231',
  firstUid: 'test-redirect-chain-first-wsa-231',
  secondUid: 'test-redirect-chain-second-wsa-231',
}

function createLexicalTextState(text: string): NonNullable<BlogPost['body']> {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

async function findRedirect(fromUid: string) {
  const result = await payload.find({
    collection: 'blog-post-redirects',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      redirectKey: {
        equals: `en:${fromUid}`,
      },
    },
  })

  return result.docs[0] ?? null
}

describe('blog post redirects', () => {
  beforeAll(async () => {
    payload = await getCmsPayload()

    for (const uid of Object.values(fixture)) {
      await payload.delete({
        collection: 'blog-post-redirects',
        where: {
          fromUid: {
            equals: uid,
          },
        },
      })

      await payload.delete({
        collection: 'blog-posts',
        where: {
          uid: {
            equals: uid,
          },
        },
      })
    }
  })

  it('tracks published slug changes and collapses redirect chains to the current slug', async () => {
    const post = await payload.create({
      collection: 'blog-posts',
      context: {
        skipBlogPostTranslationPublish: true,
      },
      data: {
        _status: 'published',
        body: createLexicalTextState('Redirect chain source body.'),
        lang: 'en',
        title: 'Redirect chain source',
        uid: fixture.firstUid,
      },
      draft: false,
    })

    await payload.update({
      collection: 'blog-posts',
      context: {
        skipBlogPostTranslationPublish: true,
      },
      data: {
        _status: 'published',
        uid: fixture.secondUid,
      },
      draft: false,
      id: post.id,
    })

    await payload.update({
      collection: 'blog-posts',
      context: {
        skipBlogPostTranslationPublish: true,
      },
      data: {
        _status: 'published',
        uid: fixture.currentUid,
      },
      draft: false,
      id: post.id,
    })

    const firstRedirect = await findRedirect(fixture.firstUid)
    const secondRedirect = await findRedirect(fixture.secondUid)
    const currentRedirect = await findRedirect(fixture.currentUid)

    expect(firstRedirect?.toUid).toBe(fixture.currentUid)
    expect(secondRedirect?.toUid).toBe(fixture.currentUid)
    expect(currentRedirect).toBeNull()
  })
})
