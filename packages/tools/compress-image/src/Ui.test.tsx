// @vitest-environment jsdom
import { ToolError, type ToolResult } from '@mochifile/tool-kit'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The panel's flow with the worker replaced by a stub: what only the UI decides. The worker's
 * own work (sizes, formats, errors) is covered in process.test.ts and the engine's tests, and
 * the real flow in apps/web/e2e/compress-image.spec.ts.
 */

const run = vi.fn()
const prepare = vi.fn()
vi.mock('@mochifile/tool-kit/client', () => ({
  createToolClient: () => ({ prepare, run }),
}))

const { default: CompressImageUi } = await import('./Ui.tsx')

const photo = (name = 'paisagem-serra.jpg') =>
  new File([new Uint8Array(6_200_000)], name, { type: 'image/jpeg' })

const meta = {
  outcome: 'compressed',
  format: 'jpeg',
  converted: false,
  resized: false,
  flattenedTransparency: false,
  originalWidth: 4000,
  originalHeight: 3000,
  width: 4000,
  height: 3000,
}
const fits = (name: string, bytes: number): ToolResult => ({
  file: new Blob([new Uint8Array(bytes)]),
  name,
  meta,
})
const unreachable = () =>
  new ToolError('target-unreachable', 'smallest', { details: { smallestBytes: 61_000 } })

function add(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('no file input')
  fireEvent.change(input, { target: { files } })
}

beforeEach(() => {
  run.mockReset()
  prepare.mockReset()
  prepare.mockResolvedValue(undefined)
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:result', revokeObjectURL: () => {} }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('a photo that cannot reach the size', () => {
  it('says so, offers the next size that fits, and tries again with it', async () => {
    run.mockRejectedValueOnce(unreachable())
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 20_000 }} />)
    add(photo())
    // Listed, not compressed: nothing runs until the person asks.
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 1 photo' }))

    expect(await screen.findByText("This photo can't get under 20 KB.")).toBeTruthy()
    expect(screen.getByText('The smallest we could make is 61 KB.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose another size' })).toBeTruthy()

    run.mockResolvedValueOnce([fits('paisagem-serra-100kb.jpg', 90_000)])
    fireEvent.click(screen.getByRole('button', { name: 'Try 100 KB' }))
    expect(await screen.findByText('Ready! It fits your 100 KB limit.')).toBeTruthy()
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]?.[1]).toMatchObject({ targetBytes: 100_000 })
  })

  it('"Choose another size" puts the photo back in the list, without compressing it', async () => {
    run.mockRejectedValueOnce(unreachable())
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 20_000 }} />)
    add(photo())
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 1 photo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Choose another size' }))

    // The options are back, the photo is listed again, and nothing has run a second time.
    const start = await screen.findByRole('button', { name: 'Compress 1 photo' })
    expect(screen.getByRole('radio', { name: '20 KB' })).toBeTruthy()
    expect(screen.getByText('paisagem-serra.jpg')).toBeTruthy()
    expect(run).toHaveBeenCalledTimes(1)

    run.mockResolvedValueOnce([fits('paisagem-serra-200kb.jpg', 150_000)])
    fireEvent.click(screen.getByRole('radio', { name: '200 KB' }))
    fireEvent.click(start)
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(run.mock.calls[1]?.[1]).toMatchObject({ targetBytes: 200_000 })
    expect(await screen.findByText('Ready! It fits your 200 KB limit.')).toBeTruthy()
  })

  it('offers no "Try" button when no preset is big enough', async () => {
    run.mockRejectedValueOnce(
      new ToolError('target-unreachable', 'smallest', { details: { smallestBytes: 3_000_000 } }),
    )
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 20_000 }} />)
    add(photo())
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 1 photo' }))
    expect(await screen.findByText('The smallest we could make is 3 MB.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Try / })).toBeNull()
    expect(screen.getByRole('button', { name: 'Choose another size' })).toBeTruthy()
  })
})

describe('the Portuguese panel', () => {
  it('words the staged flow', async () => {
    run.mockResolvedValueOnce([fits('foto-50kb.jpg', 40_000)])
    render(<CompressImageUi locale="pt" initialOptions={{ targetBytes: 50_000 }} />)
    add(photo('foto.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Comprimir 1 foto' }))
    expect(await screen.findByText('Pronto! Cabe no seu limite de 50 KB.')).toBeTruthy()
  })
})

describe('the states between the click and the result', () => {
  it('says the compressor is getting ready, and the photos wait; Cancel stops them', async () => {
    // The compressor never finishes loading.
    prepare.mockReturnValue(new Promise(() => {}))
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 50_000 }} />)
    add(photo('IMG_0412.jpg'), photo('IMG_0413.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 2 photos' }))

    expect(await screen.findByText('Getting the compressor ready…')).toBeTruthy()
    expect(screen.getByText('It runs here, on your device. 2 photos waiting.')).toBeTruthy()
    expect(screen.getAllByText('Waiting…')).toHaveLength(2)
    expect(run).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('You cancelled.')).toBeTruthy()
    expect(screen.getByText('No photo was compressed.')).toBeTruthy()
    // The way on: the same settings again.
    expect(screen.getByRole('button', { name: 'Compress again with these settings' })).toBeTruthy()
  })

  it('counts a batch while it works, and offers Cancel', async () => {
    run.mockReturnValue(new Promise(() => {}))
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 50_000 }} />)
    add(photo('IMG_0412.jpg'), photo('IMG_0413.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 2 photos' }))
    expect(await screen.findByText('Compressing your photos…')).toBeTruthy()
    expect(screen.getByText('0 of 2 ready')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Compressing your photos…' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    // The options are out of the way while the photos are on their way.
    expect(screen.queryByRole('radio', { name: '50 KB' })).toBeNull()
  })

  it('shows an unexpected error as a plain sentence, with no internals', async () => {
    run.mockRejectedValueOnce(new Error('worker exploded: secret-path.wasm'))
    render(<CompressImageUi locale="en" initialOptions={{ targetBytes: 50_000 }} />)
    add(photo('IMG_0533.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Compress 1 photo' }))
    expect(
      await screen.findByText('Something went wrong with this photo. Please try again.'),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret-path')
    expect(screen.getByRole('button', { name: 'Remove IMG_0533.jpg' })).toBeTruthy()
  })
})
