import { ToolError } from '@mochifile/tool-kit'
import { describe, expect, it } from 'vitest'
import {
  estimateStartScale,
  fitToSize,
  MAX_ENCODES_PER_SCALE,
  MIN_LONG_SIDE,
  scaledSize,
} from './fit-to-size.ts'

/**
 * A fake codec: bytes grow exponentially with quality and linearly with pixel count, which is
 * close to how JPEG and WebP behave. Records every call.
 */
function fakeEncoder(
  width: number,
  height: number,
  bitsPerPixelAt = (q: number) => 0.1 * Math.exp(q / 25),
) {
  const calls: Array<{ quality: number; scale: number }> = []
  const encode = async (quality: number, scale: number) => {
    calls.push({ quality, scale })
    const size = scaledSize(width, height, scale)
    return new Uint8Array(Math.ceil((size.width * size.height * bitsPerPixelAt(quality)) / 8))
  }
  return { encode, calls }
}

const signal = new AbortController().signal

describe('fitToSize', () => {
  it('returns the maximum quality at full size when it already fits', async () => {
    const { encode, calls } = fakeEncoder(100, 100)
    const result = await fitToSize({
      targetBytes: 1_000_000,
      width: 100,
      height: 100,
      encode,
      signal,
    })
    expect(result).toMatchObject({ quality: 90, scale: 1, width: 100, height: 100, attempts: 1 })
    expect(calls).toHaveLength(1)
  })

  it('finds the highest quality that fits, never above the target', async () => {
    // At 3 MP this codec makes 186 KB at quality 40 and 1.37 MB at 90: no shrinking needed.
    const { encode, calls } = fakeEncoder(2000, 1500)
    const targets = [190_000, 300_000, 500_000, 800_000, 1_300_000]
    for (const targetBytes of targets) {
      calls.length = 0
      const result = await fitToSize({ targetBytes, width: 2000, height: 1500, encode, signal })
      expect(result.bytes.length).toBeLessThanOrEqual(targetBytes)
      expect(result.scale).toBe(1)
      // One more quality step would not fit.
      const next = await encode(result.quality + 1, 1)
      if (result.quality < 90) expect(next.length).toBeGreaterThan(targetBytes)
      expect(calls.length - 1).toBeLessThanOrEqual(MAX_ENCODES_PER_SCALE)
    }
  })

  it('usually needs only a few encodes', async () => {
    const { encode, calls } = fakeEncoder(2000, 1500)
    for (const targetBytes of [300_000, 500_000, 800_000]) {
      calls.length = 0
      await fitToSize({ targetBytes, width: 2000, height: 1500, encode, signal })
      expect(calls.length).toBeLessThanOrEqual(5)
    }
  })

  it('shrinks the image only when the minimum quality is still too big', async () => {
    const { encode, calls } = fakeEncoder(4000, 3000)
    const result = await fitToSize({
      targetBytes: 20_000,
      width: 4000,
      height: 3000,
      encode,
      signal,
    })
    expect(result.bytes.length).toBeLessThanOrEqual(20_000)
    expect(result.scale).toBeLessThan(1)
    expect(result.width).toBeLessThan(4000)
    // Every downscale came right after a failed minimum-quality encode.
    for (const [index, call] of calls.entries()) {
      const previous = calls[index - 1]
      if (previous && call.scale < previous.scale) expect(previous.quality).toBe(40)
    }
    // Aspect ratio is kept.
    expect(result.width / result.height).toBeCloseTo(4 / 3, 1)
  })

  it('never upscales, even when asked to start above 1', async () => {
    const { encode, calls } = fakeEncoder(300, 200)
    await fitToSize({
      targetBytes: 1_000_000,
      width: 300,
      height: 200,
      encode,
      signal,
      startScale: 3,
    })
    expect(Math.max(...calls.map((call) => call.scale))).toBe(1)
  })

  it('starts from the given scale', async () => {
    const { encode, calls } = fakeEncoder(8000, 6000)
    await fitToSize({
      targetBytes: 50_000,
      width: 8000,
      height: 6000,
      encode,
      signal,
      startScale: 0.25,
    })
    expect(calls[0]?.scale).toBe(0.25)
  })

  it('reports an unreachable target with the smallest size it reached', async () => {
    const { encode } = fakeEncoder(1000, 1000)
    const error = await fitToSize({
      targetBytes: 10,
      width: 1000,
      height: 1000,
      encode,
      signal,
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ToolError)
    expect((error as ToolError).code).toBe('target-unreachable')
    const smallest = (error as ToolError).details?.smallestBytes
    // The smallest attempt was at the floor size and minimum quality.
    const floor = await encode(40, MIN_LONG_SIDE / 1000)
    expect(smallest).toBe(floor.length)
  })

  it('does not shrink an image that is already below the floor', async () => {
    const { encode, calls } = fakeEncoder(40, 30)
    await expect(
      fitToSize({ targetBytes: 1, width: 40, height: 30, encode, signal }),
    ).rejects.toMatchObject({ code: 'target-unreachable' })
    expect(calls.every((call) => call.scale === 1)).toBe(true)
  })

  it('only returns sizes that were measured to fit, even if size is not monotonic', async () => {
    // A bumpy size curve: some higher qualities produce smaller files.
    const bumpy = (q: number) => 0.1 * Math.exp(q / 25) * (q % 7 === 0 ? 0.8 : 1)
    const { encode } = fakeEncoder(1500, 1000, bumpy)
    const result = await fitToSize({
      targetBytes: 90_000,
      width: 1500,
      height: 1000,
      encode,
      signal,
    })
    expect(result.bytes.length).toBeLessThanOrEqual(90_000)
  })

  it('reports each attempt and stops when aborted', async () => {
    const controller = new AbortController()
    const attempts: number[] = []
    const { encode } = fakeEncoder(2000, 1500)
    const run = fitToSize({
      targetBytes: 150_000,
      width: 2000,
      height: 1500,
      encode: async (q, s) => {
        if (attempts.length === 2) controller.abort()
        return encode(q, s)
      },
      signal: controller.signal,
      onAttempt: (n) => attempts.push(n),
    })
    await expect(run).rejects.toMatchObject({ code: 'aborted' })
    expect(attempts).toEqual([1, 2, 3])
  })
})

describe('estimateStartScale', () => {
  it('keeps full size when the target is generous', () => {
    expect(estimateStartScale({ pixels: 12e6, targetBytes: 5_000_000 })).toBe(1)
  })

  it('skips sizes that cannot fit even at 0.05 bits per pixel', () => {
    // 50 KB at 0.05 bpp is at most 8 MP; a 48 MP photo starts at √(8/48).
    expect(estimateStartScale({ pixels: 48e6, targetBytes: 50_000 })).toBeCloseTo(Math.sqrt(8 / 48))
  })

  it('respects the memory cap', () => {
    expect(
      estimateStartScale({ pixels: 48e6, targetBytes: 50_000_000, maxPixels: 16e6 }),
    ).toBeCloseTo(Math.sqrt(16 / 48))
  })
})

describe('fitToSize with predictions', () => {
  it('skips the maximum-quality encode when it is predicted to be far too big', async () => {
    const { encode, calls } = fakeEncoder(2000, 1500)
    const result = await fitToSize({
      targetBytes: 300_000,
      width: 2000,
      height: 1500,
      encode,
      signal,
      predicted: { high: 1_370_000 },
    })
    expect(calls.some((call) => call.quality === 90)).toBe(false)
    expect(result.bytes.length).toBeLessThanOrEqual(300_000)
  })

  it('stays correct when the prediction is wrong', async () => {
    const { encode } = fakeEncoder(2000, 1500)
    // Says the maximum fits easily; it does not.
    const result = await fitToSize({
      targetBytes: 300_000,
      width: 2000,
      height: 1500,
      encode,
      signal,
      predicted: { low: 10_000, high: 20_000 },
    })
    expect(result.bytes.length).toBeLessThanOrEqual(300_000)
  })
})
