import { ToolError } from '@mochifile/tool-kit'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type CompressResult,
  compressToTarget,
  type ImageEngine,
  type OutputFormat,
} from './compress.ts'
import { hasTransparency } from './pixels.ts'
import { type ImageFormat, sniffImage } from './sniff.ts'
import {
  commentSegment,
  contains,
  exifSegment,
  type PHOTOS,
  readPhoto,
  SECRET,
  samePixels,
  syntheticImage,
  withJpegSegments,
  withPngMetadata,
} from './testing/fixtures.ts'
import { createNodeEngine } from './testing/node-engine.ts'

/** The tool's presets. */
const PRESETS = [20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000]
const signal = new AbortController().signal

let engine: ImageEngine
beforeAll(async () => {
  engine = await createNodeEngine()
})

const blob = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>])
const compress = (bytes: Uint8Array, targetBytes: number, format: OutputFormat = 'original') =>
  compressToTarget(blob(bytes), { targetBytes, format }, { engine, signal })

/** The same photo as PNG and WebP, generated once from the JPEG fixture. */
const inputs = new Map<string, Promise<Uint8Array>>()
function photoAs(name: (typeof PHOTOS)[number], format: ImageFormat): Promise<Uint8Array> {
  const key = `${name}.${format}`
  let input = inputs.get(key)
  if (!input) {
    input = (async () => {
      const jpeg = await readPhoto(name)
      if (format === 'jpeg') return jpeg
      const pixels = await engine.codecs.decode('jpeg', jpeg)
      return format === 'png'
        ? engine.codecs.encodePng(pixels)
        : engine.codecs.encodeWebp(pixels, 92)
    })()
    inputs.set(key, input)
  }
  return input
}

/** Checks every promise the tool makes about a result. */
async function expectValidResult(result: CompressResult, targetBytes: number, format: ImageFormat) {
  expect(result.bytes.length).toBeLessThanOrEqual(targetBytes)
  expect(result.meta.outputBytes).toBe(result.bytes.length)
  const info = sniffImage(result.bytes)
  expect(info.format).toBe(format)
  expect(result.meta.format).toBe(format)
  // Never upscaled.
  expect(result.meta.width).toBeLessThanOrEqual(result.meta.originalWidth)
  expect(result.meta.height).toBeLessThanOrEqual(result.meta.originalHeight)
  expect(contains(result.bytes, SECRET)).toBe(false)
  const decoded = await engine.codecs.decode(format, result.bytes)
  expect([decoded.width, decoded.height]).toEqual([result.meta.width, result.meta.height])
}

describe('every preset, input format and output format (landscape photo)', () => {
  const cases = (['jpeg', 'png', 'webp'] as const).flatMap((input) =>
    (['original', 'jpeg', 'webp'] as const).flatMap((format) =>
      PRESETS.map((target) => ({ input, format, target })),
    ),
  )
  it.each(cases)(
    '$input → $format at $target bytes',
    async ({ input, format, target }) => {
      const bytes = await photoAs('landscape', input)
      const result = await compress(bytes, target, format)
      // "Same as original" keeps the format, except PNG that cannot fit losslessly becomes JPEG.
      const expected: ImageFormat =
        format !== 'original'
          ? format
          : input === 'png' && result.meta.format === 'jpeg'
            ? 'jpeg'
            : input
      await expectValidResult(result, target, expected)
      expect(result.meta.converted).toBe(expected !== input)
    },
    60_000,
  )
})

describe('other photos, same format', () => {
  const cases = (['flowers', 'portrait'] as const).flatMap((photo) =>
    PRESETS.map((target) => ({ photo, target })),
  )
  it.each(cases)(
    '$photo at $target bytes',
    async ({ photo, target }) => {
      const result = await compress(await readPhoto(photo), target)
      await expectValidResult(result, target, 'jpeg')
    },
    60_000,
  )

  it('gets close to the target, not just under it', async () => {
    const result = await compress(await readPhoto('landscape'), 100_000)
    expect(result.meta.outcome).toBe('compressed')
    expect(result.bytes.length).toBeGreaterThan(80_000)
  }, 60_000)

  it('keeps full size when lowering quality is enough, and shrinks only when needed', async () => {
    const roomy = await compress(await readPhoto('landscape'), 200_000)
    expect(roomy.meta).toMatchObject({ resized: false, width: 1200, height: 798 })
    const tight = await compress(await readPhoto('landscape'), 20_000)
    expect(tight.meta.resized).toBe(true)
    expect(tight.meta.quality).toBeGreaterThanOrEqual(40)
  }, 60_000)
})

describe('already under the target', () => {
  it('returns the original pixels without metadata', async () => {
    const original = withJpegSegments(await readPhoto('flowers'), exifSegment(1), commentSegment())
    const result = await compress(original, 1_000_000)
    expect(result.meta).toMatchObject({
      outcome: 'already-under',
      quality: 0,
      resized: false,
      converted: false,
    })
    expect(contains(result.bytes, SECRET)).toBe(false)
    expect(
      samePixels(
        await engine.codecs.decode('jpeg', result.bytes),
        await engine.codecs.decode('jpeg', original),
      ),
    ).toBe(true)
  }, 60_000)

  it('still converts when another output format is asked for', async () => {
    const result = await compress(await readPhoto('flowers'), 1_000_000, 'webp')
    expect(result.meta).toMatchObject({ outcome: 'compressed', format: 'webp', converted: true })
    expect(result.bytes.length).toBeLessThanOrEqual(1_000_000)
  }, 60_000)

  it('strips PNG text chunks too', async () => {
    const png = withPngMetadata(await engine.codecs.encodePng(syntheticImage(100, 80)))
    const result = await compress(png, 1_000_000)
    expect(result.meta.outcome).toBe('already-under')
    expect(contains(result.bytes, SECRET)).toBe(false)
  })
})

describe('metadata and orientation', () => {
  it('removes EXIF from compressed results', async () => {
    const original = withJpegSegments(
      await readPhoto('landscape'),
      exifSegment(1),
      commentSegment(),
    )
    const result = await compress(original, 50_000)
    expect(result.meta.outcome).toBe('compressed')
    expect(contains(result.bytes, SECRET)).toBe(false)
    expect(contains(result.bytes, 'Exif')).toBe(false)
  }, 60_000)

  it('applies EXIF orientation so the result is upright', async () => {
    const rotated = withJpegSegments(await readPhoto('landscape'), exifSegment(6))
    const result = await compress(rotated, 50_000)
    expect([result.meta.originalWidth, result.meta.originalHeight]).toEqual([798, 1200])
    expect(result.meta.height).toBeGreaterThan(result.meta.width)
    expect(sniffImage(result.bytes).orientation).toBe(1)
  }, 60_000)
})

describe('transparency', () => {
  const transparentPng = () => engine.codecs.encodePng(syntheticImage(400, 300, { alpha: true }))

  it('stays PNG with transparency when the lossless file fits', async () => {
    const result = await compress(await transparentPng(), 1_000_000)
    // Fits as-is: already under, transparency untouched.
    expect(result.meta.format).toBe('png')
    expect(hasTransparency(await engine.codecs.decode('png', result.bytes))).toBe(true)
  })

  it('becomes JPEG on white when PNG cannot fit, and says so', async () => {
    const result = await compress(await transparentPng(), 20_000)
    expect(result.meta).toMatchObject({
      format: 'jpeg',
      converted: true,
      flattenedTransparency: true,
    })
    const decoded = await engine.codecs.decode('jpeg', result.bytes)
    // The fully transparent left edge is now white.
    expect(Array.from(decoded.data.subarray(0, 3)).every((v) => v > 235)).toBe(true)
  })

  it('keeps transparency when WebP is chosen', async () => {
    const result = await compress(await transparentPng(), 20_000, 'webp')
    expect(result.meta).toMatchObject({ format: 'webp', flattenedTransparency: false })
    expect(result.bytes.length).toBeLessThanOrEqual(20_000)
    expect(hasTransparency(await engine.codecs.decode('webp', result.bytes))).toBe(true)
  })

  it('flattens when JPG is chosen', async () => {
    const result = await compress(await transparentPng(), 1_000_000, 'jpeg')
    expect(result.meta).toMatchObject({ format: 'jpeg', flattenedTransparency: true })
  })

  it('does not report flattening for opaque PNGs', async () => {
    const opaque = await engine.codecs.encodePng(syntheticImage(400, 300))
    const result = await compress(opaque, 20_000)
    expect(result.meta).toMatchObject({ format: 'jpeg', flattenedTransparency: false })
  })
})

describe('failures', () => {
  it('explains an impossible target with the smallest size reached', async () => {
    const error = await compress(await readPhoto('landscape'), 500).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(ToolError)
    expect((error as ToolError).code).toBe('target-unreachable')
    expect((error as ToolError).details?.smallestBytes).toBeGreaterThan(500)
  }, 60_000)

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
    await expect(compress(header, 50_000)).rejects.toMatchObject({
      code: 'dimensions-too-large',
      details: { maxMegapixels: 100 },
    })
  })

  it('reports unreadable files as invalid', async () => {
    await expect(compress(new Uint8Array([1, 2, 3, 4, 5]), 50_000)).rejects.toMatchObject({
      code: 'invalid-file',
    })
    const jpeg = await readPhoto('flowers')
    await expect(compress(jpeg.subarray(0, 2000), 50_000)).rejects.toMatchObject({
      code: 'invalid-file',
    })
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      compressToTarget(
        blob(await readPhoto('flowers')),
        { targetBytes: 50_000, format: 'original' },
        {
          engine,
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ code: 'aborted' })
  })

  it('reports progress by stage', async () => {
    const stages: string[] = []
    await compressToTarget(
      blob(await readPhoto('flowers')),
      { targetBytes: 50_000, format: 'original' },
      {
        engine,
        signal,
        onProgress: (_ratio, stage) => stages.push(stage),
      },
    )
    expect(stages[0]).toBe('decoding')
    expect(stages).toContain('encoding')
  }, 60_000)
})

describe('large photos: preview start', () => {
  /** Wraps the engine to record every encode's pixel count (preview included). */
  function spyEngine() {
    const encodes: number[] = []
    const spied: ImageEngine = {
      ...engine,
      codecs: {
        ...engine.codecs,
        encodeJpeg: (image, quality) => {
          encodes.push(image.width * image.height)
          return engine.codecs.encodeJpeg(image, quality)
        },
        encodeWebp: (image, quality) => {
          encodes.push(image.width * image.height)
          return engine.codecs.encodeWebp(image, quality)
        },
      },
    }
    return { spied, encodes }
  }

  const large = new Map<string, Promise<Uint8Array>>()
  /** A 12 MP synthetic image (compresses very well) and the landscape photo enlarged to 12 MP. */
  function largeInput(kind: 'synthetic' | 'photo'): Promise<Uint8Array> {
    let input = large.get(kind)
    if (!input) {
      input = (async () => {
        if (kind === 'synthetic') return engine.codecs.encodeJpeg(syntheticImage(4000, 3000), 90)
        const photo = await engine.codecs.decode('jpeg', await readPhoto('landscape'))
        return engine.codecs.encodeJpeg(await engine.codecs.resize(photo, 4000, 2660), 90)
      })()
      large.set(kind, input)
    }
    return input
  }

  it.each(['synthetic', 'photo'] as const)(
    'a 12 MP %s image starts the search near its final size (50 KB target)',
    async (kind) => {
      const { spied, encodes } = spyEngine()
      const result = await compressToTarget(
        blob(await largeInput(kind)),
        { targetBytes: 50_000, format: 'original' },
        { engine: spied, signal },
      )
      expect(result.bytes.length).toBeLessThanOrEqual(50_000)
      expect(result.meta.resized).toBe(true)
      // Before the preview, the first encodes ran at 8 MP whatever the final size. Now: a
      // 0.3 MP preview, then nothing much larger than the result.
      const final = result.meta.width * result.meta.height
      expect(Math.max(...encodes)).toBeLessThanOrEqual(final * 1.6)
      expect(encodes.length).toBeLessThanOrEqual(9)
    },
    120_000,
  )

  const targets = [20_000, 100_000, 1_000_000]
  it.each(
    (['synthetic', 'photo'] as const).flatMap((kind) =>
      targets.flatMap((target) =>
        (['jpeg', 'webp'] as const).map((format) => ({ kind, target, format })),
      ),
    ),
  )(
    '$kind 12 MP → $format at $target bytes stays at or under the target',
    async ({ kind, target, format }) => {
      const result = await compressToTarget(
        blob(await largeInput(kind)),
        { targetBytes: target, format },
        { engine, signal },
      )
      await expectValidResult(result, target, format)
      // Close to the target, not just under it.
      expect(result.bytes.length).toBeGreaterThan(target * 0.75)
    },
    120_000,
  )

  it('a large transparent PNG predicts from a flattened preview and keeps the guarantee', async () => {
    // As JPG, so it skips the lossless PNG attempt and goes through the preview.
    const png = await engine.codecs.encodePng(syntheticImage(2400, 1800, { alpha: true }))
    const { spied, encodes } = spyEngine()
    const result = await compressToTarget(
      blob(png),
      { targetBytes: 30_000, format: 'jpeg' },
      { engine: spied, signal },
    )
    // The first encode is the 0.3 MP preview.
    expect(encodes[0]).toBeLessThanOrEqual(310_000)
    expect(result.meta).toMatchObject({ format: 'jpeg', flattenedTransparency: true })
    expect(result.bytes.length).toBeLessThanOrEqual(30_000)
  }, 120_000)
})
