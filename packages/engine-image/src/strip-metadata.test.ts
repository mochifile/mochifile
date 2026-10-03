import { beforeAll, describe, expect, it } from 'vitest'
import type { Codecs } from './codecs.ts'
import { sniffImage } from './sniff.ts'
import { stripMetadata } from './strip-metadata.ts'
import {
  commentSegment,
  concat,
  contains,
  exifSegment,
  readPhoto,
  SECRET,
  samePixels,
  syntheticImage,
  withJpegSegments,
  withPngMetadata,
  withWebpMetadata,
  xmpSegment,
} from './testing/fixtures.ts'
import { loadNodeCodecs } from './testing/node-codecs.ts'

let codecs: Codecs
beforeAll(async () => {
  codecs = await loadNodeCodecs()
})

const strip = (bytes: Uint8Array) => stripMetadata(bytes, sniffImage(bytes))

describe('stripMetadata: JPEG', () => {
  it('removes EXIF, XMP and comments, keeping the pixels identical', async () => {
    const clean = await readPhoto('landscape')
    const dirty = withJpegSegments(clean, exifSegment(1), xmpSegment(), commentSegment())
    expect(contains(dirty, SECRET)).toBe(true)

    const stripped = strip(dirty)
    expect(contains(stripped, SECRET)).toBe(false)
    expect(contains(stripped, 'Exif')).toBe(false)
    expect(stripped.length).toBeLessThan(dirty.length)
    expect(
      samePixels(await codecs.decode('jpeg', stripped), await codecs.decode('jpeg', clean)),
    ).toBe(true)
  })

  it('keeps the orientation so the photo still displays upright', async () => {
    const jpeg = await codecs.encodeJpeg(syntheticImage(300, 200), 80)
    const stripped = strip(withJpegSegments(jpeg, exifSegment(6), commentSegment()))
    expect(contains(stripped, SECRET)).toBe(false)
    expect(sniffImage(stripped).orientation).toBe(6)
    const decoded = await codecs.decode('jpeg', stripped)
    expect([decoded.width, decoded.height]).toEqual([200, 300])
  })

  it('drops data appended after the image, such as a motion-photo video', async () => {
    const clean = await readPhoto('flowers')
    const stripped = strip(concat(clean, new TextEncoder().encode(`ftypmp42${SECRET}`)))
    expect(contains(stripped, SECRET)).toBe(false)
    expect(stripped.at(-2)).toBe(0xff)
    expect(stripped.at(-1)).toBe(0xd9)
  })

  it('keeps every scan of a progressive JPEG', async () => {
    // mozjpeg writes progressive JPEGs: many SOS segments with tables in between.
    const progressive = await readPhoto('portrait')
    const stripped = strip(progressive)
    expect(stripped.length).toBe(progressive.length)
    expect(
      samePixels(await codecs.decode('jpeg', stripped), await codecs.decode('jpeg', progressive)),
    ).toBe(true)
  })

  it('rejects a JPEG cut off in the middle', async () => {
    const jpeg = await readPhoto('flowers')
    expect(() => strip(jpeg.subarray(0, jpeg.length - 100))).toThrow(
      expect.objectContaining({ code: 'invalid-file' }),
    )
  })
})

describe('stripMetadata: PNG', () => {
  it('removes text and time chunks, keeping the pixels identical', async () => {
    const image = syntheticImage(160, 120, { alpha: true })
    const clean = await codecs.encodePng(image)
    const dirty = withPngMetadata(clean)
    expect(contains(dirty, SECRET)).toBe(true)
    const stripped = strip(dirty)
    expect(contains(stripped, SECRET)).toBe(false)
    expect(contains(stripped, 'tIME')).toBe(false)
    expect(stripped).toEqual(clean)
    expect(samePixels(await codecs.decode('png', stripped), image)).toBe(true)
  })
})

describe('stripMetadata: WebP', () => {
  it('removes EXIF and XMP chunks and their VP8X flags', async () => {
    const clean = await codecs.encodeWebp(syntheticImage(200, 150), 80)
    const dirty = withWebpMetadata(clean, 200, 150)
    expect(contains(dirty, SECRET)).toBe(true)
    const stripped = strip(dirty)
    expect(contains(stripped, SECRET)).toBe(false)
    // VP8X flags no longer announce EXIF (0x08) or XMP (0x04).
    expect((stripped[20] ?? 0) & 0x0c).toBe(0)
    // The RIFF size matches the new length.
    expect(new DataView(stripped.buffer).getUint32(4, true)).toBe(stripped.length - 8)
    expect(
      samePixels(await codecs.decode('webp', stripped), await codecs.decode('webp', clean)),
    ).toBe(true)
  })

  it('leaves a simple WebP without metadata unchanged', async () => {
    const clean = await codecs.encodeWebp(syntheticImage(64, 64), 80)
    expect(strip(clean)).toEqual(clean)
  })
})
