// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { readHeifIccProfile } from './heif.ts'
import { convertToSrgb } from './icc.ts'
import { readHeic } from './testing/fixtures.ts'

const s15 = (v: number) => Math.round(v * 65536)

interface Tag {
  name: string
  body: number[]
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
const xyz = (x: number, y: number, z: number) => [
  ...ascii('XYZ '),
  0, 0, 0, 0,
  ...u32(s15(x)),
  ...u32(s15(y)),
  ...u32(s15(z)),
] // biome-ignore format: bytes

/** A `curv` tag with a single gamma value (u8Fixed8). */
const gamma = (g: number) => [
  ...ascii('curv'),
  0,
  0,
  0,
  0,
  ...u32(1),
  ...[Math.round(g * 256) >> 8, Math.round(g * 256) & 255],
  0,
  0,
]
/** The sRGB transfer curve as a `para` tag of function type 3. */
const srgbPara = () => [
  ...ascii('para'), 0, 0, 0, 0, 0, 3, 0, 0,
  ...[2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045].flatMap((v) => u32(s15(v))),
] // biome-ignore format: bytes

/** Builds a minimal ICC profile from tags, with a valid header and tag table. */
function iccProfile(tags: Tag[], space = 'RGB ', pcs = 'XYZ '): Uint8Array {
  let offset = 132 + tags.length * 12
  const table: number[] = []
  const data: number[] = []
  for (const tag of tags) {
    table.push(...ascii(tag.name), ...u32(offset), ...u32(tag.body.length))
    data.push(...tag.body)
    offset += tag.body.length
  }
  const bytes = new Uint8Array(132 + tags.length * 12 + data.length)
  bytes.set(u32(bytes.length), 0)
  bytes.set(ascii(space), 16)
  bytes.set(ascii(pcs), 20)
  bytes.set(ascii('acsp'), 36)
  bytes.set(u32(tags.length), 128)
  bytes.set(table, 132)
  bytes.set(data, 132 + tags.length * 12)
  return bytes
}

const matrixProfile = (
  [r, g, b]: [number[], number[], number[]],
  curve: number[],
  extra: Tag[] = [],
): Uint8Array =>
  iccProfile([
    { name: 'rXYZ', body: xyz(...(r as [number, number, number])) },
    { name: 'gXYZ', body: xyz(...(g as [number, number, number])) },
    { name: 'bXYZ', body: xyz(...(b as [number, number, number])) },
    { name: 'rTRC', body: curve },
    { name: 'gTRC', body: curve },
    { name: 'bTRC', body: curve },
    ...extra,
  ])

// Colorants adapted to the D50 white of the ICC connection space.
const SRGB_D50: [number[], number[], number[]] = [
  [0.4360747, 0.2225045, 0.0139322],
  [0.3850649, 0.7168786, 0.0971045],
  [0.1430804, 0.0606169, 0.7141733],
]
const ADOBE_RGB_D50: [number[], number[], number[]] = [
  [0.60974, 0.31111, 0.01947],
  [0.20528, 0.62567, 0.06087],
  [0.14919, 0.06322, 0.74457],
]

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
      ['a gray profile', () => iccProfile([], 'GRAY')],
      ['a CMYK profile', () => iccProfile([], 'CMYK', 'Lab ')],
      ['an RGB profile on a Lab connection space', () => iccProfile([], 'RGB ', 'Lab ')],
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

  it('never throws on a damaged profile, whatever byte is damaged', () => {
    // Every byte of a real profile set to 0x00, 0xff and 0x80 in turn, as bit rot or an attack.
    const pixels = rgba([60, 200, 90])
    for (let i = 0; i < displayP3.length; i += 1) {
      for (const value of [0x00, 0xff, 0x80]) {
        const damaged = displayP3.slice()
        damaged[i] = value
        expect(() => convertToSrgb(pixels.slice(), damaged)).not.toThrow()
      }
    }
  })

  it('rejects tag sizes and offsets that point outside the profile', () => {
    const huge = displayP3.slice()
    new DataView(huge.buffer).setUint32(132 + 4, 0xffff_fff0) // first tag: offset
    new DataView(huge.buffer).setUint32(132 + 8, 0xffff_ffff) // first tag: size
    const pixels = rgba([60, 200, 90])
    expect(() => convertToSrgb(pixels, huge)).not.toThrow()
  })

  it('takes well under a second for a 12 megapixel photo', () => {
    const pixels = new Uint8ClampedArray(3024 * 4032 * 4).fill(150)
    const started = performance.now()
    convertToSrgb(pixels, displayP3)
    expect(performance.now() - started).toBeLessThan(1000)
  })
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
