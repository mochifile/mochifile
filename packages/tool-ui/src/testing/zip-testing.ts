// Helpers for the ZIP tests: bytes, files, and a reader of the archive that does not use the code
// under test.
import { expect } from 'vitest'
import type { ZipFile } from '../zip-archive.ts'

/** Deterministic bytes, so a failure can be reproduced. */
export function bytes(length: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  let x = seed
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out[i] = x >>> 24
  }
  return out
}

export const file = (name: string, data: Uint8Array<ArrayBuffer>, type = ''): ZipFile => ({
  name,
  blob: new Blob([data], { type }),
})

export interface ReadEntry {
  name: string
  flags: number
  method: number
  crc: number
  size: number
  time: number
  date: number
  madeBy: number
  externalAttributes: number
  data: Buffer
}

/**
 * A reader written for these tests, from the format's specification and without the code under
 * test: it checks the end record, the directory, every local header against its directory entry,
 * and that the pieces follow each other with no gaps.
 */
export function readZip(zip: Buffer): ReadEntry[] {
  const end = zip.length - 22
  expect(zip.readUInt32LE(end)).toBe(0x06054b50)
  expect(zip.readUInt16LE(end + 20)).toBe(0) // no comment, so the record is the last 22 bytes
  const count = zip.readUInt16LE(end + 10)
  expect(zip.readUInt16LE(end + 8)).toBe(count)
  const directorySize = zip.readUInt32LE(end + 12)
  const directoryOffset = zip.readUInt32LE(end + 16)
  expect(directoryOffset + directorySize).toBe(end)

  const entries: ReadEntry[] = []
  let at = directoryOffset
  let expectedLocal = 0
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50)
    const nameLength = zip.readUInt16LE(at + 28)
    expect(zip.readUInt16LE(at + 30)).toBe(0) // extra field
    expect(zip.readUInt16LE(at + 32)).toBe(0) // comment
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const crc = zip.readUInt32LE(at + 16)
    const size = zip.readUInt32LE(at + 24)
    expect(zip.readUInt32LE(at + 20), 'compressed size of a stored file').toBe(size)
    const localOffset = zip.readUInt32LE(at + 42)
    expect(localOffset, `${name} follows the previous file`).toBe(expectedLocal)

    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50)
    expect(zip.readUInt16LE(localOffset + 6)).toBe(zip.readUInt16LE(at + 8)) // flags
    expect(zip.readUInt16LE(localOffset + 8)).toBe(0) // stored
    expect(zip.readUInt32LE(localOffset + 14)).toBe(crc)
    expect(zip.readUInt32LE(localOffset + 18)).toBe(size)
    expect(zip.readUInt32LE(localOffset + 22)).toBe(size)
    expect(zip.readUInt16LE(localOffset + 26)).toBe(nameLength)
    expect(zip.readUInt16LE(localOffset + 28)).toBe(0)
    expect(zip.subarray(localOffset + 30, localOffset + 30 + nameLength).toString('utf8')).toBe(
      name,
    )
    const dataStart = localOffset + 30 + nameLength
    expectedLocal = dataStart + size

    entries.push({
      name,
      flags: zip.readUInt16LE(at + 8),
      method: zip.readUInt16LE(at + 10),
      crc,
      size,
      time: zip.readUInt16LE(at + 12),
      date: zip.readUInt16LE(at + 14),
      madeBy: zip.readUInt16LE(at + 4),
      externalAttributes: zip.readUInt32LE(at + 38),
      data: zip.subarray(dataStart, dataStart + size),
    })
    at += 46 + nameLength
  }
  expect(at, 'the directory has no unread bytes').toBe(end)
  expect(expectedLocal, 'the last file ends where the directory starts').toBe(directoryOffset)
  return entries
}
