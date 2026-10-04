import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResultRow } from './ResultRow.tsx'
import type { QueueItem } from './use-file-queue.ts'

const file = new File(['before'], 'photo.jpg', { type: 'image/jpeg' })
const base = { id: 1, file, settings: {}, progress: 0 } as const

afterEach(cleanup)

const props = {
  index: 0,
  labels: {
    waiting: 'Waiting',
    cancelled: 'Cancelled',
    download: 'Download',
    downloadNamed: (name: string) => `Download ${name}`,
    progressLabel: (name: string) => `Processing ${name}`,
  },
  formatBytes: (bytes: number) => `${bytes} B`,
  sizeSummary: (before: number, after: number) => `${before} B → ${after} B`,
  stageMessage: (stage: string | undefined) => stage ?? 'Working',
  errorMessage: () => 'Try another photo',
}

function row(item: QueueItem<object, object>) {
  return render(
    <ul>
      <ResultRow {...props} item={item} resultDetails={<span>Ready</span>} />
    </ul>,
  )
}

describe('ResultRow', () => {
  it('shows progress with an accessible label and status', () => {
    const view = row({ ...base, status: 'working', progress: 0.5, stage: 'Encoding' })
    expect(screen.getByText('Encoding')).toBeDefined()
    expect(screen.getByRole('progressbar', { name: 'Processing photo.jpg' })).toBeDefined()
    expect(view.container.querySelector('li[data-status="working"]')).not.toBeNull()
  })

  it('keeps the result download and error announcement semantics', () => {
    const view = row({
      ...base,
      status: 'done',
      result: { blob: new Blob(['after']), url: 'blob:result', name: 'photo-small.jpg', meta: {} },
    })
    expect(screen.getByText('Ready')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Download photo-small.jpg' })).toHaveProperty(
      'download',
      'photo-small.jpg',
    )
    view.rerender(
      <ul>
        <ResultRow
          {...props}
          item={{ ...base, status: 'error', error: { code: 'invalid-file', details: undefined } }}
        />
      </ul>,
    )
    expect(screen.getByRole('alert').textContent).toBe('Try another photo')
  })
})
