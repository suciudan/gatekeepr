import { listWriterRuns } from '@/lib/aiWriter/repository'

import { AIWriterWorkspace } from './AIWriterWorkspace'

export async function AIWriterView() {
  const runs = await listWriterRuns()

  return (
    <div className="gutter ai-writer-view">
      <AIWriterWorkspace initialRuns={runs} />
    </div>
  )
}
