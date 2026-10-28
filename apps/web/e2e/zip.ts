import { crc32 } from 'node:zlib'
import { expect } from './fixtures.ts'

/** One file of a ZIP, read back from the archive. */
export interface ZipFileEntry {
  name: string
  data: Buffer
}

/**
 * Reads a ZIP of stored (uncompressed) files the way an extractor would, from its directory, and
 * fails the test if anything is off: the end record, a header that disagrees with the directory,
 * a size, a gap between files, or a CRC-32 that is not the one of the bytes. Written from the
 * format's specification, without the code that builds the archive.
 */
export function readZip(zip: Buffer): ZipFileEntry[] {
  const end = zip.length - 22
  expect(end, 'the archive is at least an end record long').toBeGreaterThanOrEqual(0)
  expect(zip.readUInt32LE(end), 'end of central directory signature').toBe(0x06054b50)
  const count = zip.readUInt16LE(end + 10)
  const directoryOffset = zip.readUInt32LE(end + 16)
  expect(directoryOffset + zip.readUInt32LE(end + 12), 'the directory ends at the end record').toBe(
    end,
  )

  const entries: ZipFileEntry[] = []
  let at = directoryOffset
  let nextLocal = 0
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(at), 'central directory entry signature').toBe(0x02014b50)
    const nameLength = zip.readUInt16LE(at + 28)
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const crc = zip.readUInt32LE(at + 16)
    const size = zip.readUInt32LE(at + 24)
    const local = zip.readUInt32LE(at + 42)
    expect(local, `${name} starts where the previous file ends`).toBe(nextLocal)
    expect(zip.readUInt32LE(local), `${name}: local header signature`).toBe(0x04034b50)
    expect(zip.readUInt16LE(local + 8), `${name} is stored`).toBe(0)
    expect(zip.readUInt32LE(local + 14), `${name}: CRC in both headers`).toBe(crc)
    expect(zip.readUInt32LE(local + 22), `${name}: size in both headers`).toBe(size)
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const data = zip.subarray(start, start + size)
    expect(data.length, `${name} is complete`).toBe(size)
    expect(crc32(data), `${name}: CRC-32 of its bytes`).toBe(crc)
    nextLocal = start + size
    entries.push({ name, data })
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
  }
  expect(at, 'every directory entry was read').toBe(end)
  expect(nextLocal, 'the files end where the directory starts').toBe(directoryOffset)
  return entries
}
