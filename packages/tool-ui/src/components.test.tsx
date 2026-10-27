import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BatchStatus } from './BatchStatus.tsx'
import { FileName } from './FileName.tsx'
import { FileTile, ImageIcon } from './FileTile.tsx'
import { PrivacyNote } from './PrivacyNote.tsx'
import { StateBlock } from './StateBlock.tsx'

afterEach(cleanup)

describe('FileName', () => {
  it('keeps the extension apart from the part that may be cut, and the full name readable', () => {
    const { container } = render(<FileName name="formatura-turma-3o-ano-final.jpeg" />)
    const [full, stem, extension] = Array.from(container.querySelectorAll('span span'))
    expect(full?.textContent).toBe('formatura-turma-3o-ano-final.jpeg')
    expect(full?.className).toContain('sr-only')
    expect(stem?.textContent).toBe('formatura-turma-3o-ano-final')
    expect(stem?.getAttribute('aria-hidden')).toBe('true')
    expect(extension?.textContent).toBe('.jpeg')
    expect(container.firstElementChild?.getAttribute('title')).toBe(
      'formatura-turma-3o-ano-final.jpeg',
    )
  })

  it('treats names without a short extension as all stem', () => {
    for (const name of ['README', '.hidden', 'archive.backup-2024']) {
      const { container } = render(<FileName name={name} />)
      const parts = container.querySelectorAll('span[aria-hidden="true"]')
      expect(parts[0]?.textContent).toBe(name)
      expect(parts[1]?.textContent).toBe('')
      cleanup()
    }
  })
})

describe('BatchStatus', () => {
  it('keeps one live region across tones, so every change is announced', () => {
    const { rerender } = render(<BatchStatus tone="working" title="Ready: 1 of 3" />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('Ready: 1 of 3')
    rerender(<BatchStatus tone="ready" title="All photos are ready" detail="1 MB → 90 KB" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe('All photos are ready1 MB → 90 KB')
    rerender(<BatchStatus tone="plain" title="" />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.className).toContain('empty:sr-only')
  })

  it('shows the mascot only on a block or tile, and the actions', () => {
    const { container, rerender } = render(
      <BatchStatus tone="plain" title="" actions={<button type="button">Clear</button>} />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDefined()
    rerender(<BatchStatus tone="cancelled" title="Cancelled" />)
    expect(container.querySelector('[data-batch-status="cancelled"] svg')).not.toBeNull()
  })
})

describe('StateBlock', () => {
  it('announces its text as an alert and keeps the action outside it', () => {
    render(
      <StateBlock mascot="error" action={<button type="button">Try again</button>}>
        The compressor didn't load.
      </StateBlock>,
    )
    expect(screen.getByRole('alert').textContent).toBe("The compressor didn't load.")
    expect(screen.getByRole('alert').contains(screen.getByRole('button'))).toBe(false)
  })
})

describe('FileTile', () => {
  it('is decorative', () => {
    const { container } = render(
      <FileTile tint="mango">
        <ImageIcon />
      </FileTile>,
    )
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(container.firstElementChild?.className).toContain('bg-mango-tint')
  })
})

describe('PrivacyNote', () => {
  it('puts the promise first, in bold, and keeps the lock out of the accessibility tree', () => {
    const { container } = render(
      <PrivacyNote lead="Your photos never leave your device.">
        Hidden details are removed.
      </PrivacyNote>,
    )
    const note = container.querySelector('p')
    expect(note?.textContent).toBe(
      'Your photos never leave your device. Hidden details are removed.',
    )
    expect(note?.querySelector('strong')?.textContent).toBe('Your photos never leave your device.')
    expect(note?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('stands alone without a detail', () => {
    const { container } = render(<PrivacyNote lead="Nothing is uploaded." />)
    expect(container.querySelector('p')?.textContent).toBe('Nothing is uploaded.')
  })
})
