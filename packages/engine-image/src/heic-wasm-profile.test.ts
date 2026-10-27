// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { displaySize, sniffImage } from './sniff.ts'
import { readHeic } from './testing/fixtures.ts'
import { createNodeEngine } from './testing/node-engine.ts'

// The conversion is replaced by one that fails in an unforeseen way.
vi.mock('./icc.ts', () => ({
  convertToSrgb: () => {
    throw new RangeError('unexpected')
  },
}))

describe('HEIC decoding when the colour profile cannot be applied', () => {
  it('still decodes the photo, with the colours as libheif returned them', async () => {
    const engine = await createNodeEngine()
    const bytes = (await readHeic('display-p3-chart')) as Uint8Array<ArrayBuffer>
    const info = sniffImage(bytes)
    const image = await engine.decode(bytes, info, displaySize(info))
    expect([image.width, image.height]).toEqual([128, 128])
    // Patch 14 is P3 (60, 200, 90): unconverted, it comes back as those numbers, not (0, 203, 73).
    const at = ((3 * 32 + 16) * 128 + 2 * 32 + 16) * 4
    expect(Math.abs((image.data[at] ?? 0) - 60)).toBeLessThanOrEqual(6)
  })
})
