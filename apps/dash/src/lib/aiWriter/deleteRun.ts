import type { CollectionSlug, PayloadRequest } from 'payload'

const writerRunChildCollections = [
  'writer-remote-files',
  'writer-trace-events',
  'writer-artifacts',
  'writer-jobs',
  'writer-stage-executions',
  'writer-sources',
] as const satisfies CollectionSlug[]

export async function deleteWriterRunChildren(runID: number | string, req: PayloadRequest) {
  for (const collection of writerRunChildCollections) {
    await req.payload.delete({
      collection,
      req,
      where: {
        run: {
          equals: runID,
        },
      },
    })
  }
}
