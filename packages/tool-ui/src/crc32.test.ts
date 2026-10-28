// @vitest-environment node
import { crc32 as nodeCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32Update } from './crc32.ts'

/** Deterministic bytes, so a failure can be reproduced. */
function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length)
  let x = seed
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out[i] = x >>> 24
  }
  return out
}

describe('crc32Update', () => {
  it('matches the published check value of "123456789"', () => {
    expect(crc32Update(0, new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('is 0 for no data', () => {
    expect(crc32Update(0, new Uint8Array())).toBe(0)
  })

  it('matches Node for every length around the 8-byte steps, and for big inputs', () => {
    for (const length of [...Array.from({ length: 40 }, (_, n) => n), 255, 256, 4097, 1_000_003]) {
      const data = bytes(length, length + 7)
      expect(crc32Update(0, data), `length ${length}`).toBe(nodeCrc32(data))
    }
  })

  it('reads a view that does not start at the beginning of its buffer', () => {
    const data = bytes(1000)
    expect(crc32Update(0, data.subarray(3, 997))).toBe(nodeCrc32(data.subarray(3, 997)))
  })

  it('continues from a previous result, so a file can be fed in pieces', () => {
    const data = bytes(100_000, 3)
    let crc = 0
    for (let start = 0; start < data.length; start += 7777) {
      crc = crc32Update(crc, data.subarray(start, start + 7777))
    }
    expect(crc).toBe(nodeCrc32(data))
  })
})
