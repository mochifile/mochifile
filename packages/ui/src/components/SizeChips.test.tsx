import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SizeChips } from './SizeChips.tsx'

afterEach(cleanup)

const options = [
  { value: 'small', label: '50 KB' },
  { value: 'large', label: '1 MB' },
] as const

describe('SizeChips', () => {
  it('is a labelled radio group with the current value checked', () => {
    render(<SizeChips legend="Target size" options={options} value="large" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Target size' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: '1 MB' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '50 KB' }) as HTMLInputElement).checked).toBe(false)
  })

  it('reports the chosen value', () => {
    const onChange = vi.fn()
    render(<SizeChips legend="Target size" options={options} value="large" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '50 KB' }))
    expect(onChange).toHaveBeenCalledWith('small')
  })

  it('fills the selected chip with the category block and the panel ground otherwise', () => {
    render(
      <SizeChips legend="Size" options={options} value="small" onChange={() => {}} block="ube" />,
    )
    const chip = screen.getByRole('radio', { name: '50 KB' }).closest('label')
    expect(chip?.className).toContain('has-checked:bg-ube')
    expect(chip?.className).toContain('bg-surface-page')
    expect(chip?.className).toContain('has-checked:border-ink')
  })

  it('disables every option', () => {
    render(<SizeChips legend="Size" options={options} value="small" onChange={() => {}} disabled />)
    for (const radio of screen.getAllByRole('radio')) {
      expect((radio as HTMLInputElement).matches(':disabled')).toBe(true)
    }
  })
})
