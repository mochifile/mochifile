import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar.tsx'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('is a named progressbar with a clamped percentage and no inline style', () => {
    const { rerender } = render(<ProgressBar value={0.426} label="Compressing a.jpg" />)
    const bar = screen.getByRole('progressbar', {
      name: 'Compressing a.jpg',
    }) as HTMLProgressElement
    expect(bar.value).toBe(43)
    expect(bar.max).toBe(100)
    expect(bar.getAttribute('style')).toBeNull()
    rerender(<ProgressBar value={7} label="Compressing a.jpg" />)
    expect(bar.value).toBe(100)
  })

  it('is indeterminate without a value: still named, and never claims a percentage', () => {
    render(<ProgressBar label="Preparing the compressor" />)
    const bar = screen.getByRole('progressbar', { name: 'Preparing the compressor' })
    expect(bar.hasAttribute('aria-valuenow')).toBe(false)
    expect(bar.textContent).toBe('')
    expect(bar.querySelector('[class*="animate-indeterminate"]')).not.toBeNull()
    expect(bar.getAttribute('style')).toBeNull()
  })
})
