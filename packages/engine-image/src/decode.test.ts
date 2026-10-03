import { beforeAll, describe, expect, it } from 'vitest'
import type { Codecs } from './codecs.ts'
import {
  CANARY_PIXELS,
  dctScaledSize,
  decodeImage,
  probeImages,
  WASM_MAX_PIXELS,
} from './decode.ts'
import { sniffImage } from './sniff.ts'
import { readPhoto, syntheticImage } from './testing/fixtures.ts'
import { loadNodeCodecs } from './testing/node-codecs.ts'

let codecs: Codecs
beforeAll(async () => {
  codecs = await loadNodeCodecs()
})

describe('probe images', () => {
  // The browser probes compare against these facts, so the embedded bytes must match them.
  it('the canary PNG decodes to exactly CANARY_PIXELS', async () => {
    const decoded = await codecs.decode('png', probeImages.canaryPng())
    expect([...decoded.data]).toEqual(CANARY_PIXELS)
  })

  it('the oriented JPEG displays 32 × 64, red on top and blue at the bottom', async () => {
    const bytes = probeImages.orientedJpeg()
    expect(sniffImage(bytes)).toMatchObject({ width: 64, height: 32, orientation: 6 })
    const decoded = await codecs.decode('jpeg', bytes)
    expect([decoded.width, decoded.height]).toEqual([32, 64])
    expect(decoded.data[0]).toBeGreaterThan(200)
    expect(decoded.data[2]).toBeLessThan(60)
    expect(decoded.data.at(-2)).toBeGreaterThan(200)
  })
})

describe('dctScaledSize', () => {
  it('picks the smallest eighth that still covers the target', () => {
    // 8000 → 4619 needs 5/8 (5000), not 4/8 (4000).
    expect(dctScaledSize({ width: 8000, height: 6000 }, { width: 4619, height: 3464 })).toEqual({
      width: 5000,
      height: 3750,
    })
  })

  it('never goes below 1/8 or above full size', () => {
    expect(dctScaledSize({ width: 8000, height: 6000 }, { width: 10, height: 8 })).toEqual({
      width: 1000,
      height: 750,
    })
    expect(dctScaledSize({ width: 800, height: 600 }, { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    })
  })
})

describe('decodeImage (WebAssembly path)', () => {
  it('decodes at the target size', async () => {
    const bytes = (await readPhoto('landscape')) as Uint8Array<ArrayBuffer>
    const image = await decodeImage({
      path: 'wasm',
      bytes,
      info: sniffImage(bytes),
      target: { width: 600, height: 399 },
      codecs,
    })
    expect([image.width, image.height]).toEqual([600, 399])
  })

  it('refuses images above its pixel limit without decoding them', async () => {
    const bytes = (await readPhoto('landscape')) as Uint8Array<ArrayBuffer>
    const huge = { ...sniffImage(bytes), width: 6000, height: 4001 }
    expect(huge.width * huge.height).toBeGreaterThan(WASM_MAX_PIXELS)
    await expect(
      decodeImage({ path: 'wasm', bytes, info: huge, target: { width: 100, height: 100 }, codecs }),
    ).rejects.toMatchObject({ code: 'dimensions-too-large', details: { maxMegapixels: 24 } })
  })

  // Like browsers, the JPEG decoder shows what it can of a damaged JPEG. A PNG with corrupt
  // compressed data cannot be decoded at all.
  it('reports an undecodable file as invalid', async () => {
    const png = await codecs.encodePng(syntheticImage(64, 64))
    const bytes = png.slice() as Uint8Array<ArrayBuffer>
    const idat = bytes.findIndex(
      (_, i) => String.fromCharCode(...bytes.subarray(i, i + 4)) === 'IDAT',
    )
    bytes.fill(0xff, idat + 6, idat + 40)
    await expect(
      decodeImage({
        path: 'wasm',
        bytes,
        info: sniffImage(bytes),
        target: { width: 64, height: 64 },
        codecs,
      }),
    ).rejects.toMatchObject({ code: 'invalid-file' })
  })
})

describe('decodeImage (WebAssembly path) cache', () => {
  it('decodes a file once for a preview and a working size, and hands over full size safely', async () => {
    const bytes = (await readPhoto('flowers')) as Uint8Array<ArrayBuffer>
    const info = sniffImage(bytes)
    let decodes = 0
    const counting: Codecs = {
      ...codecs,
      decode: (format, input) => {
        decodes += 1
        return codecs.decode(format, input)
      },
    }
    const decode = (width: number, height: number) =>
      decodeImage({ path: 'wasm', bytes, info, target: { width, height }, codecs: counting })
    await decode(300, 225)
    await decode(600, 450)
    expect(decodes).toBe(1)
    // A full-size result leaves the cache, so changing it cannot affect a later decode.
    const full = await decode(1200, 900)
    full.data.fill(0)
    const again = await decode(1200, 900)
    expect(again.data.some((v) => v !== 0)).toBe(true)
    expect(decodes).toBe(2)
  })
})
