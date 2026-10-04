// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectHeif, readHeifHeader } from './heif.ts'
import { displaySize, sniffImage } from './sniff.ts'
import { encodeAvif, installImageData, readHeic, syntheticImage } from './testing/index.ts'

/** A minimal `ftyp` box with a major brand and compatible brands. */
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const brands = [major, '\0\0\0\0', ...compatible].join('')
  const size = 8 + brands.length
  const bytes = new Uint8Array(size)
  new DataView(bytes.buffer).setUint32(0, size)
  bytes.set(
    [...'ftyp'].map((c) => c.charCodeAt(0)),
    4,
  )
  bytes.set(
    [...brands].map((c) => c.charCodeAt(0)),
    8,
  )
  return bytes
}

describe('detectHeif', () => {
  it('reads HEIC and AVIF from the ftyp brands', () => {
    expect(detectHeif(ftyp('heic', 'mif1', 'heic'))).toBe('heic')
    expect(detectHeif(ftyp('mif1', 'heix'))).toBe('heic')
    expect(detectHeif(ftyp('avif', 'mif1', 'miaf'))).toBe('avif')
    // A generic HEIF major brand with an AVIF compatible brand is AVIF.
    expect(detectHeif(ftyp('mif1', 'avif'))).toBe('avif')
    expect(detectHeif(ftyp('mif1'))).toBe('heic')
  })

  it('ignores other ISO media files and non-media bytes', () => {
    expect(detectHeif(ftyp('isom', 'mp41'))).toBeUndefined()
    expect(detectHeif(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })
})

describe('HEIC headers', () => {
  it('reads the iPhone grid photo: stored landscape, shown portrait', async () => {
    const info = sniffImage(await readHeic('iphone-grid'))
    expect(info).toMatchObject({ format: 'heic', width: 4032, height: 3024, mayHaveAlpha: false })
    // `irot` three quarter turns anticlockwise, i.e. EXIF 6.
    expect(info.orientation).toBe(6)
    expect(displaySize(info)).toEqual({ width: 3024, height: 4032 })
  })

  it('reads synthetic HEIC files, with and without alpha', async () => {
    expect(sniffImage(await readHeic('synthetic'))).toMatchObject({
      format: 'heic',
      width: 400,
      height: 300,
      orientation: 1,
      mayHaveAlpha: false,
    })
    expect(sniffImage(await readHeic('synthetic-alpha')).mayHaveAlpha).toBe(true)
  })

  it('rejects truncated or malformed files as invalid', async () => {
    const heic = await readHeic('synthetic')
    expect(() => readHeifHeader(heic.subarray(0, 40))).toThrow(
      expect.objectContaining({ code: 'invalid-file' }),
    )
    expect(() => sniffImage(ftyp('heic', 'mif1'))).toThrow(
      expect.objectContaining({ code: 'invalid-file' }),
    )
  })
})

describe('AVIF headers', () => {
  it('reads size and alpha', async () => {
    installImageData()
    const opaque = sniffImage(await encodeAvif(syntheticImage(64, 48)))
    expect(opaque).toMatchObject({ format: 'avif', width: 64, height: 48, orientation: 1 })
    expect(sniffImage(await encodeAvif(syntheticImage(64, 48, { alpha: true }))).mayHaveAlpha).toBe(
      true,
    )
  })
})
