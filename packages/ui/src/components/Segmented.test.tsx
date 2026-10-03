import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Segmented } from './Segmented.tsx'

afterEach(cleanup)

const options = [
  { value: 'original', label: 'Same as original', hint: 'Keeps the format' },
  { value: 'jpeg', label: 'JPG', hint: 'Accepted almost everywhere' },
] as const

describe('Segmented', () => {
  it('is a radio group described by the selected option hint', () => {
    render(<Segmented legend="Save as" options={options} value="jpeg" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Save as' })
    expect((screen.getByRole('radio', { name: 'JPG' }) as HTMLInputElement).checked).toBe(true)
    const hint = document.getElementById(group.getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toBe('Accepted almost everywhere')
    expect(screen.queryByText('Keeps the format')).toBeNull()
  })

  it('reports the chosen value', () => {
    const onChange = vi.fn()
    render(<Segmented legend="Save as" options={options} value="jpeg" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Same as original' }))
    expect(onChange).toHaveBeenCalledWith('original')
  })
})
