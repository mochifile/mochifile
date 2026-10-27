import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('offers a remove button named after the file only when the tool asks for it', () => {
    const onRemove = vi.fn()
    const view = row({ ...base, status: 'queued' })
    expect(screen.queryByRole('button')).toBeNull()
    view.rerender(
      <ul>
        <ResultRow
          {...props}
          labels={{ ...props.labels, remove: 'Remove', removeNamed: (name) => `Remove ${name}` }}
          item={{ ...base, status: 'queued' }}
          onRemove={onRemove}
        />
      </ul>,
    )
    const button = screen.getByRole('button', { name: 'Remove photo.jpg' })
    expect(button.textContent).toBe('Remove')
    fireEvent.click(button)
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('outlines a failed file in danger, and shows an unreachable target as an attention', () => {
    const view = row({
      ...base,
      status: 'error',
      error: { code: 'invalid-file', details: undefined },
    })
    const li = () => view.container.querySelector('li')
    expect(li()?.className).toContain('border-danger')
    expect(screen.getByRole('alert').firstElementChild?.className).toContain('bg-danger-tint')
    view.rerender(
      <ul>
        <ResultRow
          {...props}
          item={{
            ...base,
            status: 'error',
            error: { code: 'target-unreachable', details: { smallestBytes: 61_000 } },
          }}
        />
      </ul>,
    )
    expect(li()?.className).not.toContain('border-danger')
    expect(screen.getByRole('alert').firstElementChild?.className).toContain('bg-warning-tint')
  })

  it('leaves the mascot to a batch status when asked, and shows the icon tile', () => {
    const view = row({ ...base, status: 'working', progress: 0.2 })
    expect(view.container.querySelectorAll('svg')).toHaveLength(1)
    view.rerender(
      <ul>
        <ResultRow
          {...props}
          item={{ ...base, status: 'working', progress: 0.2 }}
          mascot={false}
          icon={<span data-testid="tile" />}
        />
      </ul>,
    )
    expect(view.container.querySelector('svg')).toBeNull()
    expect(screen.getByTestId('tile')).toBeDefined()
    expect(screen.getByText('photo.jpg', { selector: '.sr-only' })).toBeDefined()
  })
})
