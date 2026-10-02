import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dropzone } from './Dropzone.tsx'

afterEach(cleanup)

const png = new File(['a'], 'a.png', { type: 'image/png' })
const jpg = new File(['b'], 'b.jpg', { type: 'image/jpeg' })

describe('Dropzone', () => {
  it('exposes an accessible file input labelled by the call to action', () => {
    render(<Dropzone onFiles={() => {}} label="Choose an image" accept="image/*" />)
    const input = screen.getByLabelText(/Choose an image/) as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
  })

  it('reports files chosen with the picker', () => {
    const onFiles = vi.fn()
    render(<Dropzone onFiles={onFiles} label="Choose" />)
    fireEvent.change(screen.getByLabelText('Choose'), { target: { files: [png] } })
    expect(onFiles).toHaveBeenCalledWith([png])
  })

  it('reports dropped files, keeping only the first unless multiple', () => {
    const onFiles = vi.fn()
    const { container, rerender } = render(<Dropzone onFiles={onFiles} label="Choose" />)
    const zone = container.querySelector('label') as HTMLLabelElement
    fireEvent.drop(zone, { dataTransfer: { files: [png, jpg] } })
    expect(onFiles).toHaveBeenLastCalledWith([png])

    rerender(<Dropzone onFiles={onFiles} label="Choose" multiple />)
    fireEvent.drop(zone, { dataTransfer: { files: [png, jpg] } })
    expect(onFiles).toHaveBeenLastCalledWith([png, jpg])
  })

  it('ignores drops when disabled', () => {
    const onFiles = vi.fn()
    const { container } = render(<Dropzone onFiles={onFiles} label="Choose" disabled />)
    fireEvent.drop(container.querySelector('label') as HTMLLabelElement, {
      dataTransfer: { files: [png] },
    })
    expect(onFiles).not.toHaveBeenCalled()
  })
})
