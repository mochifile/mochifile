// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadZip, ZipError } from './zip.ts'

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

const files = [{ name: 'a.jpg', blob: new Blob(['x']) }]
const unreadable = () =>
  Object.assign(new Blob(['x']), {
    slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }),
  }) as unknown as Blob

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
    await downloadZip(files, 'photos.zip')
    vi.advanceTimersByTime(59_999)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:archive')
  })
})

describe('when "Download all" fails', () => {
  /** Nothing downloaded, no URL held, no timer left running. */
  const expectNothingLeft = () => {
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(link.click).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  }

  it('says `failed`, keeping the cause apart, when a file cannot be read', async () => {
    vi.useFakeTimers()
    const error = await downloadZip(
      [
        { name: 'ok.jpg', blob: new Blob(['fine']) },
        { name: 'bad.jpg', blob: unreadable() },
      ],
      'photos.zip',
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ZipError)
    expect(error).toMatchObject({ name: 'ZipError', reason: 'failed' })
    expect((error as Error).cause).toMatchObject({ message: 'read failed' })
    expectNothingLeft()
  })

  it('says `too-large` for what the format cannot hold, before reading anything', async () => {
    vi.useFakeTimers()
    const huge = {
      size: 2 ** 32,
      slice: () => expect.unreachable('read a file'),
    } as unknown as Blob
    await expect(
      downloadZip([{ name: 'big.jpg', blob: huge }], 'photos.zip'),
    ).rejects.toMatchObject({ reason: 'too-large' })
    expectNothingLeft()
  })

  it('says nothing about files, names or modules in its message', async () => {
    const error = (await downloadZip(
      [{ name: 'secret-name.jpg', blob: unreadable() }],
      'photos.zip',
    ).catch((caught: unknown) => caught)) as Error
    expect(error.message).toBe('The ZIP could not be made (failed)')
    expect(error.message).not.toMatch(/secret|\.jpg|zip-archive|read failed/)
  })

  it('says `failed` and releases the URL when the browser refuses the download', async () => {
    link.click.mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.useFakeTimers()
    await expect(downloadZip(files, 'photos.zip')).rejects.toMatchObject({ reason: 'failed' })
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:archive')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('says `failed` when the URL cannot be made, with nothing to release', async () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('no memory')
    })
    await expect(downloadZip(files, 'photos.zip')).rejects.toMatchObject({ reason: 'failed' })
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(link.click).not.toHaveBeenCalled()
  })

  describe('when the builder cannot be loaded', () => {
    it('says `load`, and never throws from preloading', async () => {
      vi.resetModules()
      vi.doMock('./zip-archive.ts', () => {
        throw new Error('offline')
      })
      try {
        const fresh = await import('./zip.ts')
        expect(() => fresh.preloadZip()).not.toThrow()
        const error = await fresh
          .downloadZip(files, 'photos.zip')
          .catch((caught: unknown) => caught)
        expect(error).toMatchObject({ name: 'ZipError', reason: 'load' })
        expect((error as Error).cause).toBeInstanceOf(Error)
        expect(createObjectURL).not.toHaveBeenCalled()
        expect(link.click).not.toHaveBeenCalled()
      } finally {
        vi.doUnmock('./zip-archive.ts')
      }
    })

    it('asks the browser for the builder again on the next try, and succeeds if it can', async () => {
      vi.resetModules()
      vi.doMock('./zip-archive.ts', () => {
        throw new Error('offline')
      })
      try {
        const fresh = await import('./zip.ts')
        await expect(fresh.downloadZip(files, 'photos.zip')).rejects.toMatchObject({
          reason: 'load',
        })
        vi.doUnmock('./zip-archive.ts')
        await fresh.downloadZip(files, 'photos.zip')
        expect(link.click).toHaveBeenCalledOnce()
      } finally {
        vi.doUnmock('./zip-archive.ts')
      }
    })

    it('says `load` again when the browser keeps failing (Chromium keeps a failed module)', async () => {
      vi.resetModules()
      vi.doMock('./zip-archive.ts', () => {
        throw new Error('offline')
      })
      try {
        const fresh = await import('./zip.ts')
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await expect(fresh.downloadZip(files, 'photos.zip')).rejects.toMatchObject({
            reason: 'load',
          })
        }
        expect(link.click).not.toHaveBeenCalled()
      } finally {
        vi.doUnmock('./zip-archive.ts')
      }
    })
  })
})
