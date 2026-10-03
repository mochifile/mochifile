import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RadioCards } from './RadioCards.tsx'

afterEach(cleanup)

const options = [
  { value: 'small', label: '50 KB' },
  { value: 'large', label: '1 MB', description: 'For email' },
] as const

describe('RadioCards', () => {
  it('is a labelled group of radios with the current value checked', () => {
    render(<RadioCards legend="Target size" options={options} value="large" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Target size' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /1 MB/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '50 KB' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('For email')).toBeTruthy()
  })

  it('reports the chosen value', () => {
    const onChange = vi.fn()
    render(<RadioCards legend="Target size" options={options} value="large" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '50 KB' }))
    expect(onChange).toHaveBeenCalledWith('small')
  })

  it('disables every option', () => {
    render(
      <RadioCards legend="Size" options={options} value="small" onChange={() => {}} disabled />,
    )
    for (const radio of screen.getAllByRole('radio')) {
      expect((radio as HTMLInputElement).matches(':disabled')).toBe(true)
    }
  })
})
