// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { readHeifIccProfile } from './heif.ts'
import { convertToSrgb } from './icc.ts'
import { readHeic } from './testing/fixtures.ts'
import {
  ADOBE_RGB_D50,
  ascii,
  curveTable,
  gamma,
  iccProfile,
  matrixProfile,
  matrixTags,
  para,
  SRGB_D50,
  srgbPara,
  u32,
  xyz,
} from './testing/icc-profile.ts'

const colors = () => new Uint8ClampedArray([60, 200, 90, 255, 10, 20, 30, 128, 0, 0, 0, 0])

/** The pixels must come back exactly as they went in, and nothing may throw. */
function expectRejected(profile: Uint8Array) {
  const pixels = colors()
  const before = pixels.slice()
  let converted: boolean | undefined
  expect(() => {
    converted = convertToSrgb(pixels, profile)
  }).not.toThrow()
  expect(converted).toBe(false)
  expect(pixels).toEqual(before)
}

const ADOBE_GAMMA = gamma(2.19921875)

describe('ICC header', () => {
  it('rejects a declared size larger than the bytes there are', () => {
    const profile = matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA)
    profile.set(u32(profile.length + 1000), 0)
    expectRejected(profile)
  })

  it('rejects a declared size that leaves a tag outside the profile', () => {
    const profile = matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA)
    profile.set(u32(200), 0)
    expectRejected(profile)
  })

  it('accepts a declared size that matches, and trailing padding after it', () => {
    const profile = matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA)
    const padded = new Uint8Array(profile.length + 16)
    padded.set(profile)
    for (const bytes of [profile, padded]) {
      const pixels = colors()
      expect(convertToSrgb(pixels, bytes)).toBe(true)
    }
  })

  it.each([
    ['ICC version 5 (iccMAX)', { version: [5, 0, 0, 0] }],
    ['a device link profile', { cls: 'link' }],
    ['an abstract profile', { cls: 'abst' }],
    ['a named colour profile', { cls: 'nmcl' }],
  ])('rejects %s', (_, header) => {
    expectRejected(matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA, [], header))
  })

  it.each(['mntr', 'scnr', 'spac', 'prtr'])('accepts the %s class', (cls) => {
    expect(convertToSrgb(colors(), matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA, [], { cls }))).toBe(
      true,
    )
  })
})

describe('ICC tag table', () => {
  it('rejects a repeated tag, whose meaning would depend on which entry is read', () => {
    const tags = matrixTags(ADOBE_RGB_D50, ADOBE_GAMMA)
    tags.push({ name: 'rXYZ', body: xyz(0.2, 0.2, 0.2) })
    expectRejected(iccProfile(tags))
  })

  it.each(['A2B0', 'A2B1', 'D2B0', 'D2B1'])('rejects a profile with a %s transform', (name) => {
    expectRejected(
      matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA, [{ name, body: [...ascii('mft2'), 0, 0, 0, 0] }]),
    )
  })

  it('rejects more tags than the table can hold', () => {
    const profile = matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA)
    profile.set(u32(0xffff_ffff), 128)
    expectRejected(profile)
  })

  it('rejects tags whose offset or size point outside the profile', () => {
    for (const [offset, size] of [
      [0xffff_fff0, 20],
      [200, 0xffff_ffff],
      [0, 0],
    ] as const) {
      const profile = matrixProfile(ADOBE_RGB_D50, ADOBE_GAMMA)
      profile.set(u32(offset), 132 + 4)
      profile.set(u32(size), 132 + 8)
      expectRejected(profile)
    }
  })

  it('rejects a colorant tag that is too short or of the wrong type', () => {
    const [, ...rest] = matrixTags(ADOBE_RGB_D50, ADOBE_GAMMA)
    expectRejected(iccProfile([{ name: 'rXYZ', body: xyz(0.6, 0.3, 0.02).slice(0, 16) }, ...rest]))
    expectRejected(
      iccProfile([{ name: 'rXYZ', body: [...ascii('text'), ...xyz(0, 0, 0)] }, ...rest]),
    )
  })
})

describe('tone curves', () => {
  // Tags are written last, so a short tag ends exactly where the profile ends and any read past
  // its end is outside the buffer, not just outside the tag.
  const withLastCurve = (curve: number[]) =>
    iccProfile([
      ...matrixTags(ADOBE_RGB_D50, ADOBE_GAMMA).slice(0, 5),
      { name: 'bTRC', body: curve },
    ])

  it.each([
    ['curv with no count', ascii('curv').concat(u32(0)).slice(0, 8)],
    ['curv cut inside its count', [...ascii('curv'), 0, 0, 0, 0, 0, 0]],
    ['curv promising more entries than it holds', [...curveTable([0, 65535]), 0].slice(0, 14)],
    ['para with no function type', ascii('para').concat(u32(0)).slice(0, 8)],
    ['para cut inside its parameters', para(3, [2.4, 0.9, 0.05, 0.08, 0.04]).slice(0, 30)],
    ['para of an unknown function type', para(5, [2.2])],
    ['a tag of an unknown curve type', [...ascii('mAB '), ...u32(0), ...u32(0)]],
  ])('rejects %s without reading outside the profile', (_, curve) => {
    expectRejected(withLastCurve(curve))
  })

  it.each([
    ['a=0, type 1 (division by zero)', para(1, [2.2, 0, 0])],
    ['a=0, b=0, type 2', para(2, [2.2, 0, 0, 0])],
    ['gamma of 0: a flat curve', gamma(0)],
    ['a negative exponent', para(0, [-3])],
    ['a curve that falls while the input rises', curveTable([65535, 32768, 0])],
    ['a two-entry curve that is inverted', curveTable([65535, 0])],
    ['a curve that never reaches white', para(3, [1, 0.5, 0, 0.5, 0])],
    ['a curve with a lifted black', para(3, [1, 0.5, 0.5, 0, 0])],
  ])('rejects %s', (_, curve) => {
    expectRejected(matrixProfile(ADOBE_RGB_D50, curve))
  })

  it('accepts an identity table curve, a gamma of 1 and a 1024-point sRGB table', () => {
    const table = Array.from({ length: 1024 }, (_, i) => {
      const v = i / 1023
      return Math.round(65535 * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    })
    for (const curve of [curveTable([]), gamma(1), curveTable([0, 65535]), curveTable(table)]) {
      expect(convertToSrgb(colors(), matrixProfile(ADOBE_RGB_D50, curve))).toBe(true)
    }
    // The table with sRGB primaries is plain sRGB: nothing to do.
    expect(convertToSrgb(colors(), matrixProfile(SRGB_D50, curveTable(table)))).toBe(false)
  })

  it('never produces a non-finite curve value, whatever the parameters', () => {
    const extremes = [-32768, -1, 0, 1e-5, 1, 32767.99]
    for (const kind of [0, 1, 2, 3, 4]) {
      const length = [1, 3, 4, 5, 7][kind] ?? 1
      for (const value of extremes) {
        for (let hot = 0; hot < length; hot += 1) {
          const params = [1, 1, 0, 0, 0, 0, 0].slice(0, length)
          params[hot] = value
          const pixels = colors()
          expect(() =>
            convertToSrgb(pixels, matrixProfile(ADOBE_RGB_D50, para(kind, params))),
          ).not.toThrow()
          // Either rejected untouched or converted to valid 8-bit values.
          expect(pixels.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true)
        }
      }
    }
  })
})

describe('colorants', () => {
  it.each([
    ['a colorant far outside any real gamut', [[20, 20, 20], ADOBE_RGB_D50[1], ADOBE_RGB_D50[2]]],
    ['negative colorants', [[-0.6, 0.3, 0.02], ADOBE_RGB_D50[1], ADOBE_RGB_D50[2]]],
    [
      'all-zero colorants',
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    ],
    [
      'a white that is not the D50 white of the connection space',
      [
        [0.4, 0.2, 0.01],
        [0.3, 0.6, 0.1],
        [0.1, 0.05, 0.6],
      ],
    ],
  ] as const)('rejects %s', (_, colorants) => {
    expectRejected(
      matrixProfile(colorants as unknown as [number[], number[], number[]], ADOBE_GAMMA),
    )
  })
})

describe('real profile, bytes damaged', () => {
  let displayP3: Uint8Array
  beforeAll(async () => {
    const profile = readHeifIccProfile(await readHeic('display-p3-chart'))
    if (!profile) throw new Error('The fixture lost its profile')
    displayP3 = profile
  })

  it('never throws, never touches alpha, and either converts or leaves the pixels alone', () => {
    expect(convertToSrgb(colors(), displayP3)).toBe(true)
    // Each byte set to 0x00, 0xff and 0x80, then a truncation at every length.
    const variants: Uint8Array[] = []
    for (let i = 0; i < displayP3.length; i += 1) {
      for (const value of [0x00, 0xff, 0x80]) {
        const damaged = displayP3.slice()
        damaged[i] = value
        variants.push(damaged)
      }
    }
    for (let length = 0; length < displayP3.length; length += 1) {
      variants.push(displayP3.slice(0, length))
    }
    for (const variant of variants) {
      const pixels = colors()
      const before = pixels.slice()
      let converted = false
      expect(() => {
        converted = convertToSrgb(pixels, variant)
      }).not.toThrow()
      if (!converted) expect(pixels).toEqual(before)
      // Alpha is never touched, converted or not.
      expect([pixels[3], pixels[7], pixels[11]]).toEqual([255, 128, 0])
    }
  }, 30_000)
})

describe('sRGB-like profiles', () => {
  it('leaves an sRGB profile with a v4 parametric curve and a table curve alone', () => {
    for (const curve of [
      srgbPara(),
      para(3, [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045]),
    ]) {
      const pixels = colors()
      const before = pixels.slice()
      expect(convertToSrgb(pixels, matrixProfile(SRGB_D50, curve))).toBe(false)
      expect(pixels).toEqual(before)
    }
  })
})
