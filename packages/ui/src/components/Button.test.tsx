import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, buttonClasses } from './Button.tsx'

afterEach(cleanup)

describe('Button', () => {
  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).getAttribute('type')).toBe('button')
  })

  it('calls onClick and respects disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is a 56 px pill; the secondary one has the 2.5 px ink outline', () => {
    expect(buttonClasses()).toContain('min-h-target-primary')
    expect(buttonClasses()).toContain('rounded-pill')
    expect(buttonClasses()).toContain('bg-action')
    expect(buttonClasses('secondary')).toContain('border-strong border-ink bg-transparent')
  })
})
