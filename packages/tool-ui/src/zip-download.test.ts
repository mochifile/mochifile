// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadZip } from './zip.ts'

const link = { href: '', download: '', click: vi.fn() }
let createObjectURL: ReturnType<typeof vi.spyOn>
let revokeObjectURL: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  link.href = ''
  link.download = ''
  link.click.mockReset()
  vi.stubGlobal('document', { createElement: vi.fn(() => link) })
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:archive')
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('downloadZip', () => {
  it('starts one download of a ZIP with the requested name', async () => {
    await downloadZip(
      [
        { name: 'a.jpg', blob: new Blob(['first']) },
        { name: 'a.jpg', blob: new Blob(['second']) },
      ],
      'photos.zip',
    )
    expect(createObjectURL).toHaveBeenCalledOnce()
    const zip = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(zip.type).toBe('application/zip')
    expect(Buffer.from(await zip.arrayBuffer()).subarray(0, 4)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    )
    expect(link).toMatchObject({ href: 'blob:archive', download: 'photos.zip' })
    expect(link.click).toHaveBeenCalledOnce()
  })

  it('releases the object URL a minute later, not before the browser has used it', async () => {
    vi.useFakeTimers()
    await downloadZip([{ name: 'a.jpg', blob: new Blob(['x']) }], 'photos.zip')
    vi.advanceTimersByTime(59_999)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:archive')
  })

  it('loads the builder on demand, and tries again after a failed load', async () => {
    vi.resetModules()
    vi.doMock('./zip-archive.ts', () => {
      throw new Error('offline')
    })
    const fresh = await import('./zip.ts')
    const files = [{ name: 'a.jpg', blob: new Blob(['x']) }]
    try {
      // Preloading never throws, even when the builder cannot be loaded.
      expect(() => fresh.preloadZip()).not.toThrow()
      await expect(fresh.downloadZip(files, 'photos.zip')).rejects.toThrow()
      expect(createObjectURL).not.toHaveBeenCalled()
      expect(link.click).not.toHaveBeenCalled()
      vi.doUnmock('./zip-archive.ts')
      await fresh.downloadZip(files, 'photos.zip')
      expect(link.click).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('./zip-archive.ts')
    }
  })

  it('downloads nothing, and holds no URL, when a file cannot be read', async () => {
    vi.useFakeTimers()
    const unreadable = Object.assign(new Blob(['x']), {
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }),
    }) as unknown as Blob
    await expect(
      downloadZip(
        [
          { name: 'ok.jpg', blob: new Blob(['fine']) },
          { name: 'bad.jpg', blob: unreadable },
        ],
        'photos.zip',
      ),
    ).rejects.toThrow('read failed')
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(link.click).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
