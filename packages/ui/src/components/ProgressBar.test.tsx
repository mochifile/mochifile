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
})
