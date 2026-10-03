import { beforeAll, describe, expect, it } from 'vitest'
import type { Codecs } from './codecs.ts'
import { detectFormat, displaySize, readExifOrientation, sniffImage } from './sniff.ts'
import { exifSegment, readPhoto, syntheticImage, withJpegSegments } from './testing/fixtures.ts'
import { loadNodeCodecs } from './testing/node-codecs.ts'

let codecs: Codecs
beforeAll(async () => {
  codecs = await loadNodeCodecs()
})

describe('sniffImage', () => {
  it('reads JPEG dimensions without decoding', async () => {
    expect(sniffImage(await readPhoto('portrait'))).toEqual({
      format: 'jpeg',
      width: 756,
      height: 1200,
      orientation: 1,
      mayHaveAlpha: false,
    })
  })

  it('reads the EXIF orientation and swaps the displayed size for 5–8', async () => {
    const jpeg = await codecs.encodeJpeg(syntheticImage(300, 200), 80)
    const info = sniffImage(withJpegSegments(jpeg, exifSegment(6)))
    expect(info).toMatchObject({ width: 300, height: 200, orientation: 6 })
    expect(displaySize(info)).toEqual({ width: 200, height: 300 })
    expect(displaySize({ width: 300, height: 200, orientation: 3 })).toEqual({
      width: 300,
      height: 200,
    })
  })

  it('reads PNG dimensions and whether it can be transparent', async () => {
    const opaque = await codecs.encodePng(syntheticImage(120, 80))
    const clear = await codecs.encodePng(syntheticImage(120, 80, { alpha: true }))
    expect(sniffImage(opaque)).toMatchObject({
      format: 'png',
      width: 120,
      height: 80,
      mayHaveAlpha: false,
    })
    expect(sniffImage(clear)).toMatchObject({
      format: 'png',
      width: 120,
      height: 80,
      mayHaveAlpha: true,
    })
  })

  it('reads lossy and lossless WebP dimensions', async () => {
    const lossy = await codecs.encodeWebp(syntheticImage(321, 123), 75)
    expect(sniffImage(lossy)).toMatchObject({
      format: 'webp',
      width: 321,
      height: 123,
      mayHaveAlpha: false,
    })
    const transparent = await codecs.encodeWebp(syntheticImage(64, 48, { alpha: true }), 75)
    expect(sniffImage(transparent)).toMatchObject({
      format: 'webp',
      width: 64,
      height: 48,
      mayHaveAlpha: true,
    })
  })

  it('rejects unknown, truncated and malformed files with invalid-file', async () => {
    const jpeg = await readPhoto('flowers')
    for (const bytes of [
      new Uint8Array([1, 2, 3, 4]),
      new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '),
      jpeg.subarray(0, 40),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]),
      new TextEncoder().encode('\x89PNG\r\n\x1a\n'),
    ]) {
      expect(() => sniffImage(bytes)).toThrow(expect.objectContaining({ code: 'invalid-file' }))
    }
  })

  it('detects formats by magic bytes, not names', () => {
    expect(detectFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe('jpeg')
    expect(detectFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeUndefined()
  })
})

describe('readExifOrientation', () => {
  it('ignores malformed TIFF data', () => {
    expect(
      readExifOrientation(new Uint8Array([0x4d, 0x4d, 0, 0x2a, 0, 0, 0xff, 0xff])),
    ).toBeUndefined()
    expect(readExifOrientation(new Uint8Array([1, 2]))).toBeUndefined()
  })

  it('reads little-endian TIFF too', () => {
    // biome-ignore format: TIFF layout
    const tiff = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
      0, 0, 0, 0,
    ])
    expect(readExifOrientation(tiff)).toBe(8)
  })
})
