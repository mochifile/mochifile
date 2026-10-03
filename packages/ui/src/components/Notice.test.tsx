import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Notice, Tag } from './Notice.tsx'

afterEach(cleanup)

describe('Notice and Tag', () => {
  it('colour-codes by meaning, with errors in the danger pair (never strawberry)', () => {
    render(
      <>
        <Notice tone="danger">Try a smaller copy.</Notice>
        <Tag tone="success">Metadata removed</Tag>
      </>,
    )
    const notice = screen.getByText('Try a smaller copy.').parentElement
    expect(notice?.className).toContain('bg-danger-tint')
    expect(notice?.className).not.toContain('strawberry')
    expect(screen.getByText('Metadata removed').className).toContain('bg-matcha-tint')
  })

  it('keeps the icon away from assistive technology', () => {
    const { container } = render(<Notice>Saved as JPG.</Notice>)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
