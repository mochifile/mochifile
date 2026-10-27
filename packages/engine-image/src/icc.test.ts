// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { readHeifIccProfile } from './heif.ts'
import { convertToSrgb } from './icc.ts'
import { readHeic } from './testing/fixtures.ts'
import {
  ADOBE_RGB_D50,
  ascii,
  gamma,
  iccProfile,
  matrixProfile,
  SRGB_D50,
  srgbPara,
} from './testing/icc-profile.ts'

const rgba = (...colors: number[][]) =>
  new Uint8ClampedArray(colors.flatMap(([r = 0, g = 0, b = 0, a = 255]) => [r, g, b, a]))
const rgb = (pixels: Uint8ClampedArray, index: number) => [
  ...pixels.subarray(index * 4, index * 4 + 3),
]
const near = (actual: number[], expected: number[], tolerance = 1) =>
  actual.every((v, i) => Math.abs(v - (expected[i] ?? 0)) <= tolerance)

describe('convertToSrgb', () => {
  let displayP3: Uint8Array
  beforeAll(async () => {
    const profile = readHeifIccProfile(await readHeic('display-p3-chart'))
    if (!profile) throw new Error('The fixture lost its profile')
    displayP3 = profile
  })

  it("converts with Apple's Display P3 profile, matching ColorSync", () => {
    // Expected values: `sips -m "sRGB Profile.icc"` on a lossless Display P3 PNG.
    const pixels = rgba([60, 200, 90], [200, 150, 120], [40, 90, 230], [128, 128, 128], [0, 0, 0])
    expect(convertToSrgb(pixels, displayP3)).toBe(true)
    expect(rgb(pixels, 0)).toEqual([0, 203, 73])
    expect(near(rgb(pixels, 1), [209, 147, 115])).toBe(true)
    expect(near(rgb(pixels, 2), [10, 91, 239])).toBe(true)
    expect(rgb(pixels, 3)).toEqual([128, 128, 128])
    expect(rgb(pixels, 4)).toEqual([0, 0, 0])
  })

  it('keeps grays gray and leaves alpha alone', () => {
    const grays = [0, 1, 17, 64, 100, 128, 200, 254, 255]
    const pixels = rgba(...grays.map((v, i) => [v, v, v, 10 + i * 20]))
    convertToSrgb(pixels, displayP3)
    grays.forEach((v, i) => {
      expect(near(rgb(pixels, i), [v, v, v]), `gray ${v}`).toBe(true)
      expect(pixels[i * 4 + 3]).toBe(10 + i * 20)
    })
  })

  it('clips colours outside the sRGB gamut instead of wrapping around', () => {
    const pixels = rgba([255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255])
    convertToSrgb(pixels, displayP3)
    expect(rgb(pixels, 0)).toEqual([255, 0, 0])
    expect(rgb(pixels, 1)).toEqual([0, 255, 0])
    expect(rgb(pixels, 2)).toEqual([0, 0, 255])
    expect(rgb(pixels, 3)).toEqual([0, 255, 255])
  })

  it('handles a gamma curve (`curv`) profile: Adobe RGB, matching ColorSync', () => {
    // Expected values: `sips -m "sRGB Profile.icc"` on a PNG tagged with AdobeRGB1998.icc.
    const pixels = rgba([100, 150, 200], [200, 80, 40], [30, 160, 60], [128, 128, 128])
    expect(convertToSrgb(pixels, matrixProfile(ADOBE_RGB_D50, gamma(2.19921875)))).toBe(true)
    expect(near(rgb(pixels, 0), [66, 151, 203], 2)).toBe(true)
    expect(near(rgb(pixels, 1), [230, 79, 32], 2)).toBe(true)
    expect(near(rgb(pixels, 2), [0, 161, 46], 2)).toBe(true)
    expect(near(rgb(pixels, 3), [129, 129, 129], 1)).toBe(true)
  })

  it('does not touch pixels whose profile already is sRGB', () => {
    const pixels = rgba([60, 200, 90], [1, 2, 3], [255, 254, 253])
    const before = pixels.slice()
    expect(convertToSrgb(pixels, matrixProfile(SRGB_D50, srgbPara()))).toBe(false)
    expect(pixels).toEqual(before)
  })

  describe('leaves the pixels alone when the profile cannot be used', () => {
    const cases: Array<[string, () => Uint8Array]> = [
      ['empty', () => new Uint8Array(0)],
      ['shorter than a header', () => displayP3.slice(0, 100)],
      ['cut in the middle of its tags', () => displayP3.slice(0, 300)],
      ['without the acsp signature', () => displayP3.slice().fill(0, 36, 40)],
      ['a gray profile', () => iccProfile([], { space: 'GRAY' })],
      ['a CMYK profile', () => iccProfile([], { space: 'CMYK', pcs: 'Lab ' })],
      ['an RGB profile on a Lab connection space', () => iccProfile([], { pcs: 'Lab ' })],
      ['a profile without colorants', () => iccProfile([{ name: 'rTRC', body: srgbPara() }])],
      [
        'a lookup-table profile',
        () =>
          matrixProfile(SRGB_D50, srgbPara(), [
            { name: 'A2B0', body: [...ascii('mft2'), 0, 0, 0, 0] },
          ]),
      ],
    ]
    it.each(cases)('%s', (_, make) => {
      const pixels = rgba([60, 200, 90], [10, 20, 30])
      const before = pixels.slice()
      expect(convertToSrgb(pixels, make())).toBe(false)
      expect(pixels).toEqual(before)
    })
  })

  it('converts every pixel of a 12 megapixel photo, first to last, and leaves alpha alone', () => {
    // Wall-clock limits are flaky on shared CI runners (a 90 ms conversion took 2 s there), so
    // this checks the work, not the time; timings are measured by hand and recorded in the PR.
    const pixels = new Uint8ClampedArray(3024 * 4032 * 4)
    for (let i = 0; i < pixels.length; i += 4) pixels.set([60, 200, 90, 200], i)
    expect(convertToSrgb(pixels, displayP3)).toBe(true)
    let wrong = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (
        pixels[i] !== 0 ||
        pixels[i + 1] !== 203 ||
        pixels[i + 2] !== 73 ||
        pixels[i + 3] !== 200
      ) {
        wrong += 1
      }
    }
    expect(wrong).toBe(0)
  }, 30_000)
})

describe('readHeifIccProfile', () => {
  it("reads the iPhone photo's Display P3 profile", async () => {
    const profile = readHeifIccProfile(await readHeic('iphone-grid'))
    // The `colr` box is 548 bytes: 8 of box header, 4 of type 'prof' and the profile.
    expect(profile?.length).toBe(536)
    expect(String.fromCharCode(...(profile?.subarray(36, 40) ?? []))).toBe('acsp')
  })

  it('reads the profile of a synthetic Display P3 file', async () => {
    expect(readHeifIccProfile(await readHeic('display-p3-chart'))?.length).toBe(536)
  })

  it('returns undefined for files whose colour is described by nclx only', async () => {
    expect(readHeifIccProfile(await readHeic('synthetic'))).toBeUndefined()
    expect(readHeifIccProfile(await readHeic('synthetic-alpha'))).toBeUndefined()
  })

  it('returns undefined for bytes that are not HEIF, and never throws on truncated files', async () => {
    expect(readHeifIccProfile(new Uint8Array([1, 2, 3, 4, 5]))).toBeUndefined()
    const heic = await readHeic('display-p3-chart')
    for (let length = 0; length < heic.length; length += 37) {
      expect(() => readHeifIccProfile(heic.subarray(0, length))).not.toThrow()
    }
  })
})
