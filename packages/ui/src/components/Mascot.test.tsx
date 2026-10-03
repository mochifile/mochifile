import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Mascot, type MascotState } from './Mascot.tsx'

afterEach(cleanup)

describe('Mascot', () => {
  it.each<MascotState>(['idle', 'squish', 'happy', 'error'])(
    'draws the %s state with token colours only, hidden from assistive technology',
    (state) => {
      const { container } = render(<Mascot state={state} />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
      expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|fill="(?!none)/i)
    },
  )
})
