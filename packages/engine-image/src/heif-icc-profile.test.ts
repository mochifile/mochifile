// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readHeifIccProfile } from './heif.ts'
import { ascii, box, colr, heifFile, u16, u32 } from './testing/icc-profile.ts'

const PROFILE = [10, 20, 30, 40, 50]
const nclx = box('colr', ascii('nclx'), u16(1), u16(13), u16(6), [0x80])
const other = box('pixi', [0, 0, 0, 0], [3, 8, 8, 8])

const read = (bytes: Uint8Array) => {
  const profile = readHeifIccProfile(bytes)
  return profile && [...profile]
}

describe('readHeifIccProfile: which colour property belongs to the primary image', () => {
  it('reads the profile associated with the primary item', () => {
    const file = heifFile({
      properties: [other, colr('prof', PROFILE)],
      associations: [{ item: 1, indexes: [1, 2] }],
    })
    expect(read(file)).toEqual(PROFILE)
  })

  it('reads a restricted ICC profile (rICC)', () => {
    const file = heifFile({
      properties: [colr('rICC', PROFILE)],
      associations: [{ item: 1, indexes: [1] }],
    })
    expect(read(file)).toEqual(PROFILE)
  })

  it('ignores a profile associated only with another item', () => {
    const file = heifFile({
      properties: [colr('prof', PROFILE), other],
      associations: [
        { item: 2, indexes: [1] },
        { item: 1, indexes: [2] },
      ],
    })
    expect(read(file)).toBeUndefined()
  })

  it('follows the primary item id, not the first item listed', () => {
    const file = heifFile({
      primary: 7,
      properties: [colr('prof', [1, 1, 1, 1]), colr('prof', PROFILE)],
      associations: [
        { item: 3, indexes: [1] },
        { item: 7, indexes: [2] },
      ],
    })
    expect(read(file)).toEqual(PROFILE)
  })

  it('reads a 32-bit primary item id and 15-bit property indexes', () => {
    const file = heifFile({
      pitmVersion: 1,
      primary: 5,
      wideIndexes: true,
      properties: [other, colr('prof', PROFILE)],
      associations: [{ item: 5, indexes: [2] }],
    })
    expect(read(file)).toEqual(PROFILE)
  })

  it('takes the profile when the file also has nclx, in either order', () => {
    for (const properties of [
      [nclx, colr('prof', PROFILE)],
      [colr('prof', PROFILE), nclx],
    ]) {
      const file = heifFile({ properties, associations: [{ item: 1, indexes: [1, 2] }] })
      expect(read(file)).toEqual(PROFILE)
    }
  })

  it('returns undefined for nclx only and for unknown colour types', () => {
    for (const properties of [[nclx], [colr('abcd', PROFILE)]]) {
      const file = heifFile({ properties, associations: [{ item: 1, indexes: [1] }] })
      expect(read(file)).toBeUndefined()
    }
  })
})

describe('readHeifIccProfile: malformed files', () => {
  it.each([
    ['property index 0, which means none', [0]],
    ['an index past the last property', [9]],
    ['the largest 7-bit index', [0x7f]],
  ])('returns undefined for %s', (_, indexes) => {
    const file = heifFile({
      properties: [colr('prof', PROFILE)],
      associations: [{ item: 1, indexes }],
    })
    expect(read(file)).toBeUndefined()
  })

  it('returns undefined for an empty profile', () => {
    const file = heifFile({
      properties: [colr('prof', [])],
      associations: [{ item: 1, indexes: [1] }],
    })
    expect(read(file)).toBeUndefined()
  })

  it('returns undefined when the colr box is cut short or lies about its size', () => {
    const whole = heifFile({
      properties: [colr('prof', PROFILE)],
      associations: [{ item: 1, indexes: [1] }],
    })
    // Cutting the file anywhere never throws and never returns bytes past the end.
    for (let length = 0; length < whole.length; length += 1) {
      const cut = whole.subarray(0, length)
      let result: Uint8Array | undefined
      expect(() => {
        result = readHeifIccProfile(cut)
      }).not.toThrow()
      expect(result === undefined || result.byteOffset + result.length <= cut.length).toBe(true)
    }
    // A colr box whose size field runs past its parent.
    const lying = Uint8Array.from(whole)
    const at = [...lying].findIndex(
      (_, i) => String.fromCharCode(...lying.subarray(i, i + 4)) === 'colr',
    )
    lying.set(u32(0x7fff_ffff), at - 4)
    expect(readHeifIccProfile(lying)).toBeUndefined()
  })

  it('terminates on an association count that is far larger than the data', () => {
    const file = heifFile({
      properties: [colr('prof', PROFILE)],
      associations: [{ item: 2, indexes: [1] }],
      associationCount: 0xffff_ffff,
    })
    const started = Date.now()
    expect(read(file)).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it.each([
    ['empty', new Uint8Array(0)],
    ['not an ISO file', new Uint8Array(64).fill(0xff)],
    ['a meta box with nothing in it', Uint8Array.from(box('meta', [0, 0, 0, 0]))],
    [
      'properties but no pitm',
      Uint8Array.from(box('meta', [0, 0, 0, 0], box('iprp', box('ipco', colr('prof', PROFILE))))),
    ],
  ])('returns undefined for %s', (_, bytes) => {
    expect(readHeifIccProfile(bytes)).toBeUndefined()
  })
})
