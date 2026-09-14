import 'dotenv/config'

import { createHash } from 'node:crypto'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { BlogPost, Media } from '../payload-types'
import { closeCmsPayload, getCmsPayload } from '../lib/payload'

type BackfillResult = {
  created: number
  errors: string[]
  linked: number
  skipped: number
}

const defaultDownloadTimeoutMs = 20_000
const payloadShutdownTimeoutMs = 5_000
const localSiteImageExtensions = ['.webp', '.png', '.jpg', '.jpeg']

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getDownloadTimeoutMs(): number {
  const value = Number(process.env.BLOG_HERO_MEDIA_DOWNLOAD_TIMEOUT_MS)

  return Number.isFinite(value) && value > 0 ? value : defaultDownloadTimeoutMs
}

function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }

  return null
}

function makeFilename(sourceUrl: string): string {
  const sourceUrlObject = new URL(sourceUrl)
  const extension = path.extname(sourceUrlObject.pathname).replace(/[^a-zA-Z0-9.]+/g, '')
  const basename = path.basename(sourceUrlObject.pathname, extension) || 'asset'
  const safeBasename = basename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10)

  return `${safeBasename}-${hash}${extension}`
}

function getRepoRoot(): string {
  const cwd = process.cwd()

  if (path.basename(cwd) === 'dash' && path.basename(path.dirname(cwd)) === 'apps') {
    return path.resolve(cwd, '../..')
  }

  return cwd
}

function getSiteImageSourceUrl(filename: string): string {
  return `site-image:${filename}`
}

async function resolveLocalSiteImage(uid: unknown): Promise<null | { filePath: string; filename: string; sourceUrl: string }> {
  const slug = pickString(uid)

  if (!slug) {
    return null
  }

  const imagesDir = path.join(getRepoRoot(), 'apps/site/src/images')

  for (const extension of localSiteImageExtensions) {
    const filename = `${slug}${extension}`
    const filePath = path.join(imagesDir, filename)

    try {
      await access(filePath)

      return {
        filename,
        filePath,
        sourceUrl: getSiteImageSourceUrl(filename),
      }
    } catch {}
  }

  return null
}

async function findExistingMedia(payload: Awaited<ReturnType<typeof getCmsPayload>>, sourceUrl: string): Promise<Media | null> {
  const result = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      sourceUrl: {
        equals: sourceUrl,
      },
    },
  })

  return (result.docs[0] as Media | undefined) ?? null
}

async function createMediaFromUrl(args: {
  alt: string
  payload: Awaited<ReturnType<typeof getCmsPayload>>
  sourceUrl: string
  tempDir: string
}): Promise<Media> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), getDownloadTimeoutMs())
  let response: Response

  try {
    response = await fetch(args.sourceUrl, {
      signal: abortController.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`download timed out after ${getDownloadTimeoutMs()}ms`)
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`download failed with HTTP ${response.status}`)
  }

  const filename = makeFilename(args.sourceUrl)
  const filePath = path.join(args.tempDir, filename)

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()))

  return await args.payload.create({
    collection: 'media',
    data: {
      alt: args.alt || filename,
      sourceUrl: args.sourceUrl,
    },
    depth: 0,
    filePath,
    overrideAccess: true,
  } as any) as Media
}

async function createMediaFromLocalFile(args: {
  alt: string
  filePath: string
  payload: Awaited<ReturnType<typeof getCmsPayload>>
  sourceUrl: string
}): Promise<Media> {
  return await args.payload.create({
    collection: 'media',
    data: {
      alt: args.alt || path.basename(args.filePath),
      sourceUrl: args.sourceUrl,
    },
    depth: 0,
    filePath: args.filePath,
    overrideAccess: true,
  } as any) as Media
}

async function closePayloadWithTimeout(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    await Promise.race([
      closeCmsPayload(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`Payload shutdown timed out after ${payloadShutdownTimeoutMs}ms; forcing CLI exit.`)
          resolve()
        }, payloadShutdownTimeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict')
  const payload = await getCmsPayload()
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dash-blog-hero-media-'))
  const result: BackfillResult = {
    created: 0,
    errors: [],
    linked: 0,
    skipped: 0,
  }

  try {
    console.log('Loading blog posts for hero media backfill...')

    const posts = await payload.find({
      collection: 'blog-posts',
      depth: 0,
      limit: 1000,
      overrideAccess: true,
    })

    console.log(`Found ${posts.docs.length} blog posts.`)

    for (const [index, post] of (posts.docs as BlogPost[]).entries()) {
      const postLabel = `${index + 1}/${posts.docs.length} ${post.id} ${post.title}`

      if (getRelationshipId(post.heroImageMedia)) {
        console.log(`Skipping linked post: ${postLabel}`)
        result.skipped += 1
        continue
      }

      let sourceUrl = pickString(post.heroImage?.url)
      const localSiteImage = sourceUrl ? null : await resolveLocalSiteImage(post.uid)

      if (!sourceUrl && localSiteImage) {
        sourceUrl = localSiteImage.sourceUrl
      }

      if (!sourceUrl) {
        console.log(`Skipping post without hero image source: ${postLabel}`)
        result.skipped += 1
        continue
      }

      try {
        console.log(`Backfilling hero media for post: ${postLabel}`)
        const existingMedia = await findExistingMedia(payload, sourceUrl)
        const media = existingMedia ?? (localSiteImage
          ? await createMediaFromLocalFile({
              alt: pickString(post.heroImage?.alt) || pickString(post.title),
              filePath: localSiteImage.filePath,
              payload,
              sourceUrl,
            })
          : await createMediaFromUrl({
              alt: pickString(post.heroImage?.alt) || pickString(post.title),
              payload,
              sourceUrl,
              tempDir,
            }))

        if (!existingMedia) {
          result.created += 1
          console.log(`Created media ${media.id} for post: ${postLabel}`)
        } else {
          console.log(`Reusing media ${media.id} for post: ${postLabel}`)
        }

        await payload.update({
          collection: 'blog-posts',
          data: {
            heroImageMedia: media.id,
          },
          depth: 0,
          id: post.id,
          overrideAccess: true,
        })

        result.linked += 1
        console.log(`Linked hero media for post: ${postLabel}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.errors.push(`${post.id} ${post.title}: ${message}`)
        console.error(`Failed to backfill hero media for post: ${postLabel}`)
        console.error(message)
      }
    }
  } finally {
    console.log('Cleaning up blog hero media backfill...')
    await rm(tempDir, { force: true, recursive: true })
    await closePayloadWithTimeout()
  }

  console.log(JSON.stringify(result, null, 2))

  if (strict && result.errors.length) {
    process.exit(1)
  }

  process.exit(0)
}

void main().catch(async (error) => {
  await closePayloadWithTimeout()
  console.error(error)
  process.exit(1)
})
