// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { ImageEngine } from './compress.ts'
import { CONVERT_QUALITY, convertImage } from './convert.ts'
import { hasTransparency } from './pixels.ts'
import { type EncodableFormat, sniffImage } from './sniff.ts'
import {
  contains,
  encodeAvif,
  exifSegment,
  readHeic,
  readPhoto,
  SECRET,
  samePixels,
  syntheticImage,
  withJpegSegments,
} from './testing/fixtures.ts'
import { createNodeEngine } from './testing/node-engine.ts'

const signal = new AbortController().signal
let engine: ImageEngine
beforeAll(async () => {
  engine = await createNodeEngine()
})

const blob = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>])
const convert = (bytes: Uint8Array, format: EncodableFormat) =>
  convertImage(blob(bytes), { format }, { engine, signal })
const decoded = (bytes: Uint8Array) => engine.codecs.decode(sniffImage(bytes).format, bytes)

describe('convertImage', () => {
  it.each([
    ['jpeg', 'png'],
    ['jpeg', 'webp'],
    ['png', 'jpeg'],
    ['png', 'webp'],
    ['webp', 'jpeg'],
    ['webp', 'png'],
  ] as const)('converts %s to %s at full size', async (from, to) => {
    const photo = await readPhoto('flowers')
    const input =
      from === 'jpeg'
        ? photo
        : from === 'png'
          ? await engine.codecs.encodePng(await decoded(photo))
          : await engine.codecs.encodeWebp(await decoded(photo), 90)
    const { bytes, meta } = await convert(input, to)
    expect(sniffImage(bytes)).toMatchObject({ format: to, width: 1200, height: 900 })
    expect(meta).toMatchObject({
      outcome: 'converted',
      format: to,
      originalFormat: from,
      width: 1200,
      height: 900,
      quality: to === 'png' ? 0 : CONVERT_QUALITY[to],
      outputBytes: bytes.length,
      metadataRemoved: true,
      decodedWith: 'wasm',
    })
  })

  it('fills transparency with white for JPG and says so; keeps it for PNG and WebP', async () => {
    const png = await engine.codecs.encodePng(syntheticImage(200, 100, { alpha: true }))
    const jpeg = await convert(png, 'jpeg')
    expect(jpeg.meta.flattenedTransparency).toBe(true)
    // The fully transparent left edge becomes white.
    const [r, g, b] = (await decoded(jpeg.bytes)).data
    expect(Math.min(r ?? 0, g ?? 0, b ?? 0)).toBeGreaterThan(245)
    for (const format of ['png', 'webp'] as const) {
      const out = await convert(png, format)
      expect(out.meta.flattenedTransparency).toBe(false)
      expect(hasTransparency(await decoded(out.bytes))).toBe(true)
    }
    // An opaque image never reports flattening.
    const opaque = await engine.codecs.encodePng(syntheticImage(200, 100))
    expect((await convert(opaque, 'jpeg')).meta.flattenedTransparency).toBe(false)
  })

  it('applies EXIF orientation, so the result is upright without metadata', async () => {
    const photo = await readPhoto('landscape')
    const rotated = withJpegSegments(photo, exifSegment(6))
    const { bytes, meta } = await convert(rotated, 'png')
    expect([meta.width, meta.height]).toEqual([798, 1200])
    expect(sniffImage(bytes)).toMatchObject({ width: 798, height: 1200 })
  })

  it('never carries metadata into the result', async () => {
    const photo = withJpegSegments(await readPhoto('flowers'), exifSegment(1))
    expect(contains(photo, SECRET)).toBe(true)
    for (const format of ['png', 'webp'] as const) {
      expect(contains((await convert(photo, format)).bytes, SECRET)).toBe(false)
    }
  })

  it('keeps a file already in the wanted format, without its metadata and without re-encoding', async () => {
    const photo = await readPhoto('portrait')
    const withSecret = withJpegSegments(photo, exifSegment(1))
    const { bytes, meta } = await convert(withSecret, 'jpeg')
    expect(meta).toMatchObject({
      outcome: 'already-in-format',
      format: 'jpeg',
      quality: 0,
      decodedWith: 'none',
    })
    expect(contains(bytes, SECRET)).toBe(false)
    expect(samePixels(await decoded(bytes), await decoded(photo))).toBe(true)
  })

  describe('HEIC', () => {
    it('converts the iPhone grid photo upright at full size', async () => {
      const { bytes, meta } = await convert(await readHeic('iphone-grid'), 'jpeg')
      expect(meta).toMatchObject({
        outcome: 'converted',
        originalFormat: 'heic',
        format: 'jpeg',
        width: 3024,
        height: 4032,
        flattenedTransparency: false,
      })
      expect(sniffImage(bytes)).toMatchObject({ format: 'jpeg', width: 3024, height: 4032 })
    })

    it('fills HEIC transparency for JPG and keeps it for PNG', async () => {
      const heic = await readHeic('synthetic-alpha')
      expect((await convert(heic, 'jpeg')).meta.flattenedTransparency).toBe(true)
      const png = await convert(heic, 'png')
      expect(hasTransparency(await decoded(png.bytes))).toBe(true)
    })
  })

  describe('AVIF', () => {
    it('converts AVIF to every output format', async () => {
      const avif = await encodeAvif(syntheticImage(160, 120))
      for (const format of ['jpeg', 'png', 'webp'] as const) {
        const { bytes, meta } = await convert(avif, format)
        expect(meta).toMatchObject({ originalFormat: 'avif', format, width: 160, height: 120 })
        expect(sniffImage(bytes).format).toBe(format)
      }
    })
  })

  it('rejects images over 100 megapixels before decoding', async () => {
    // A PNG header claiming 20000 × 20000; there is no image data to decode.
    const header = new Uint8Array(33)
    header.set([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    ])
    new DataView(header.buffer).setUint32(16, 20_000)
    new DataView(header.buffer).setUint32(20, 20_000)
    header[24] = 8
    header[25] = 2
    await expect(convert(header, 'jpeg')).rejects.toMatchObject({
      code: 'dimensions-too-large',
      details: { maxMegapixels: 100 },
    })
  })

  it('reports unreadable files as invalid', async () => {
    await expect(convert(new Uint8Array([1, 2, 3, 4, 5]), 'jpeg')).rejects.toMatchObject({
      code: 'invalid-file',
    })
    const heic = await readHeic('synthetic')
    await expect(convert(heic.subarray(0, heic.length / 2), 'jpeg')).rejects.toMatchObject({
      code: 'invalid-file',
    })
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      convertImage(
        blob(await readPhoto('flowers')),
        { format: 'png' },
        {
          engine,
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})
