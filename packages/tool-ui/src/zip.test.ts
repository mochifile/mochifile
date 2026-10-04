import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadZip, zipEntries } from './zip.ts'

const zip = vi.fn(() => ({ blob: async () => new Blob(['PK']) }))
vi.mock('client-zip', () => ({ downloadZip: zip }))

describe('ZIP downloads', () => {
  beforeEach(() => {
    zip.mockClear()
  })

  it('numbers duplicate names without colliding with names already in the batch', () => {
    const blob = new Blob(['image'])
    expect(
      zipEntries([
        { name: 'photo.jpg', blob },
        { name: 'photo (2).jpg', blob },
        { name: 'photo.jpg', blob },
        { name: 'photo.jpg', blob },
      ]).map((entry) => entry.name),
    ).toEqual(['photo.jpg', 'photo (2).jpg', 'photo (3).jpg', 'photo (4).jpg'])
  })

  it('builds a browser download with the requested ZIP name', async () => {
    const createObjectURL = vi.fn(() => 'blob:archive')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    try {
      await downloadZip([{ name: 'photo.jpg', blob: new Blob(['image']) }], 'photos.zip')
      expect(zip).toHaveBeenCalledOnce()
      expect(createObjectURL).toHaveBeenCalledOnce()
      expect(click).toHaveBeenCalledOnce()
      expect(click.mock.instances[0]).toMatchObject({ download: 'photos.zip' })
    } finally {
      click.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
