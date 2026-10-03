import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dropzone } from './Dropzone.tsx'

afterEach(cleanup)

const png = new File(['a'], 'a.png', { type: 'image/png' })
const jpg = new File(['b'], 'b.jpg', { type: 'image/jpeg' })

/** Dispatches a paste carrying `files`, the way a browser does after Ctrl+V. */
function paste(target: EventTarget, files: File[], text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: () => text },
  })
  target.dispatchEvent(event)
  return event
}

describe('Dropzone', () => {
  it('is a file input named by the button, described by the hint', () => {
    render(
      <Dropzone
        onFiles={() => {}}
        stepLabel="3. Choose your photos"
        label="Choose photos"
        hint="JPG or PNG"
        accept="image/*"
      />,
    )
    const input = screen.getByLabelText('Choose photos') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'JPG or PNG',
    )
    expect(screen.getByText('3. Choose your photos')).toBeTruthy()
  })

  it('marks the button as the primary action, for the fold rule', () => {
    render(<Dropzone onFiles={() => {}} label="Choose photos" />)
    expect(screen.getByText('Choose photos').hasAttribute('data-primary-action')).toBe(true)
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

  it('shows the drag-over state', () => {
    const { container } = render(<Dropzone onFiles={() => {}} label="Choose" />)
    const zone = container.querySelector('label') as HTMLLabelElement
    fireEvent.dragOver(zone)
    expect(zone.dataset.dragging).toBe('true')
    expect(zone.className).toContain('border-ink')
    fireEvent.dragLeave(zone)
    expect(zone.dataset.dragging).toBeUndefined()
  })

  it('ignores drops when disabled', () => {
    const onFiles = vi.fn()
    const { container } = render(<Dropzone onFiles={onFiles} label="Choose" disabled />)
    fireEvent.drop(container.querySelector('label') as HTMLLabelElement, {
      dataTransfer: { files: [png] },
    })
    expect(onFiles).not.toHaveBeenCalled()
  })

  describe('paste', () => {
    it('takes files pasted anywhere on the page when a paste hint is shown', () => {
      const onFiles = vi.fn()
      render(<Dropzone onFiles={onFiles} label="Choose" pasteHint="Or paste" multiple />)
      const event = paste(document.body, [png, jpg])
      expect(onFiles).toHaveBeenCalledWith([png, jpg])
      expect(event.defaultPrevented).toBe(true)
    })

    it('leaves text pastes alone', () => {
      const onFiles = vi.fn()
      render(<Dropzone onFiles={onFiles} label="Choose" pasteHint="Or paste" />)
      const event = paste(document.body, [], '75')
      expect(onFiles).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('is off without a paste hint, when disabled, and after unmounting', () => {
      const onFiles = vi.fn()
      const { rerender, unmount } = render(<Dropzone onFiles={onFiles} label="Choose" />)
      paste(document.body, [png])
      rerender(<Dropzone onFiles={onFiles} label="Choose" pasteHint="Or paste" disabled />)
      paste(document.body, [png])
      rerender(<Dropzone onFiles={onFiles} label="Choose" pasteHint="Or paste" />)
      unmount()
      paste(document.body, [png])
      expect(onFiles).not.toHaveBeenCalled()
    })
  })
})
