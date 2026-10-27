// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { ImageEngine } from './compress.ts'
import { convertImage } from './convert.ts'
import { displaySize, type EncodableFormat, sniffImage } from './sniff.ts'
import { readHeic } from './testing/fixtures.ts'
import { createNodeEngine } from './testing/node-engine.ts'

/**
 * `display-p3-chart.heic` is a 128 × 128 chart of 4 × 4 flat patches of 32 px, written by macOS
 * `sips` from a lossless PNG tagged Display P3 (`fixtures/README.md`). It carries Apple's
 * Display P3 ICC profile, as iPhone photos do. A browser shows these patches in sRGB as
 * `expected`; the values were made by ColorSync (`sips -m "sRGB Profile.icc"`) from the same
 * lossless P3 chart, so they are a colour-managed reference and not a result of this code.
 */
const PATCHES: ReadonlyArray<{ name: string; patch: number; p3: number[]; expected: number[] }> = [
  { name: 'mid gray', patch: 8, p3: [128, 128, 128], expected: [128, 128, 128] },
  { name: 'skin', patch: 7, p3: [200, 150, 120], expected: [209, 147, 115] },
  { name: 'saturated red', patch: 13, p3: [230, 60, 60], expected: [250, 31, 49] },
  { name: 'saturated green', patch: 14, p3: [60, 200, 90], expected: [0, 203, 73] },
  { name: 'saturated blue', patch: 15, p3: [40, 90, 230], expected: [10, 91, 239] },
  { name: 'teal', patch: 12, p3: [0, 128, 128], expected: [0, 130, 129] },
  { name: 'dark red', patch: 11, p3: [128, 0, 0], expected: [141, 0, 0] },
]

/** Mean RGB of the 8 × 8 block at the centre of chart patch `index` (row-major, 4 per row). */
function patchColor(image: ImageData, index: number): number[] {
  const sum = [0, 0, 0]
  const x0 = (index % 4) * 32 + 12
  const y0 = Math.floor(index / 4) * 32 + 12
  for (let y = y0; y < y0 + 8; y += 1) {
    for (let x = x0; x < x0 + 8; x += 1) {
      for (let c = 0; c < 3; c += 1)
        sum[c] = (sum[c] ?? 0) + (image.data[(y * 128 + x) * 4 + c] ?? 0)
    }
  }
  return sum.map((v) => v / 64)
}

let engine: ImageEngine
beforeAll(async () => {
  engine = await createNodeEngine()
})

const near = (actual: number[], expected: number[], tolerance: number) =>
  actual.every((v, i) => Math.abs(v - (expected[i] ?? 0)) <= tolerance)

describe('HEIC with a Display P3 profile, decoded with WebAssembly', () => {
  it('returns sRGB values, not the file’s Display P3 numbers', async () => {
    const bytes = (await readHeic('display-p3-chart')) as Uint8Array<ArrayBuffer>
    const info = sniffImage(bytes)
    const image = await engine.decode(bytes, info, displaySize(info))
    for (const { name, patch, expected } of PATCHES) {
      const actual = patchColor(image, patch)
      // HEVC is lossy and 4:2:0 shifts saturated patches by a couple of levels.
      expect(near(actual, expected, 4), `${name}: ${actual.map(Math.round)} vs ${expected}`).toBe(
        true,
      )
    }
  })

  it('actually differs from the untouched P3 numbers for saturated colours', () => {
    // Guards the test data: if P3 and sRGB numbers were close, the test above would prove nothing.
    for (const { name, p3, expected } of PATCHES.filter((p) => p.name.startsWith('saturated'))) {
      expect(near(p3, expected, 20), name).toBe(false)
    }
  })

  // JPEG and WebP are lossy: the tolerance is wider than for the decode alone.
  it.each([
    ['png', 4],
    ['jpeg', 8],
    ['webp', 8],
  ] as const)(
    'writes sRGB values into the %s output',
    async (format: EncodableFormat, tolerance) => {
      const { bytes } = await convertImage(
        new Blob([(await readHeic('display-p3-chart')) as Uint8Array<ArrayBuffer>]),
        { format },
        { engine, signal: new AbortController().signal },
      )
      const output = await engine.codecs.decode(format, bytes)
      for (const { name, patch, expected } of PATCHES) {
        const actual = patchColor(output, patch)
        expect(
          near(actual, expected, tolerance),
          `${format} ${name}: ${actual.map(Math.round)} vs ${expected}`,
        ).toBe(true)
      }
    },
  )
})
