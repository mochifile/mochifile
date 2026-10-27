import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OptionList, OptionRow } from './OptionList.tsx'

afterEach(cleanup)

function list() {
  return render(
    <OptionList>
      <OptionRow label="Maximum size" value="50 KB" change="Change">
        <fieldset>
          <legend>1. Choose the maximum size</legend>
          <input type="radio" aria-label="50 KB" />
        </fieldset>
      </OptionRow>
    </OptionList>,
  )
}

describe('OptionRow', () => {
  it('names the option, its value and the action, and starts closed on phones', () => {
    list()
    const button = screen.getByRole('button', { name: 'Maximum size, 50 KB, Change' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '')
    // Hidden under 600 px only: from 600 px the control always shows and the button does not.
    expect(panel?.className).toContain('max-sm:hidden')
    expect(button.className).toContain('sm:hidden')
    // The control stays in the page, so its radios keep their state while closed.
    expect(panel?.querySelector('input[type="radio"]')).not.toBeNull()
  })

  it('opens and closes the control in place, keeping focus on the button', () => {
    list()
    const button = screen.getByRole('button', { name: /^Maximum size/ })
    button.focus()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(panel?.className).not.toContain('max-sm:hidden')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })
})
