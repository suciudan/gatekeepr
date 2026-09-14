import { NextResponse } from 'next/server'

import { createWriterRunAndStart } from '@/lib/aiWriter/engine'
import { createLiveWriterAutomationProvider } from '@/lib/aiWriter/liveProvider'
import { InvalidWriterRunInputError, listWriterRuns, normalizeWriterRunInput } from '@/lib/aiWriter/repository'
import { getCmsPayload } from '@/lib/payload'

type CreateRunRequest = {
  sourceUrl?: string
  targetKeyword?: string
}

async function requireAuthenticatedPayload(request: Request) {
  const payload = await getCmsPayload()
  const authResult = await payload.auth({
    headers: request.headers,
  })

  if (!authResult.user) {
    return null
  }

  return payload
}

export async function GET(request: Request) {
  const payload = await requireAuthenticatedPayload(request)

  if (!payload) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 })
  }

  const runs = await listWriterRuns(payload)
  return NextResponse.json({ runs })
}

export async function POST(request: Request) {
  const payload = await requireAuthenticatedPayload(request)

  if (!payload) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as CreateRunRequest
    const normalizedInput = normalizeWriterRunInput({
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
      targetKeyword: typeof body.targetKeyword === 'string' ? body.targetKeyword : '',
    })

    const detail = await createWriterRunAndStart(
      normalizedInput,
      createLiveWriterAutomationProvider(),
    )

    return NextResponse.json(detail)
  } catch (error) {
    if (error instanceof InvalidWriterRunInputError) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Failed to create AI Writer run.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
