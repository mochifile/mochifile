/**
 * "Download all" as one ZIP file, built in the browser (no upload, no server, no library).
 *
 * The ZIP only *stores* the files, so each entry is the file's own bytes between two small headers.
 * The archive is therefore a `Blob` made of parts: the headers are tiny buffers and the files are
 * the existing result Blobs, which the browser references instead of copying. The only work on the
 * bytes is the CRC-32 every ZIP entry carries, read in slices of `CHUNK_BYTES`, so memory stays
 * near the size of one slice plus the headers, whatever the archive's size (ADR 0033).
 *
 * Limits of the format without ZIP64, which this code does not write: at most 65,534 files and
 * 4 GiB (minus 2 bytes) for each file, for the offset of the last one and for the archive. Beyond
 * them `createZip` throws instead of writing an archive some programs would read wrongly.
 */
import { crc32Update } from './crc32.ts'

/** Bytes read at a time to compute a file's CRC: bounded memory, and short pauses for the page. */
const CHUNK_BYTES = 2 * 1024 * 1024
/** 0xFFFFFFFF and 0xFFFF are the "look in the ZIP64 record" markers, so they are not usable. */
const MAX_FIELD_32 = 0xffff_fffe
const MAX_ENTRIES = 0xfffe
const MAX_NAME_BYTES = 0xffff

/** A file to put in the archive. */
export interface ZipFile {
  name: string
  blob: Blob
}

/** A file with the name it gets in the archive and the time written for it. */
export interface ZipEntry extends ZipFile {
  lastModified: Date
}

/**
 * Makes a name safe as an archive path: no folders (`/` and `\` could point outside the folder
 * the ZIP is extracted to), no control characters, and not empty or dots only.
 */
function safeName(name: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  const clean = name.replace(/[\\/\u0000-\u001f\u007f]/g, '_')
  return clean === '' || clean === '.' || clean === '..' ? 'file' : clean
}

/**
 * Entries for `files` with names fit for an archive, numbering repeated ones: `a.jpg`,
 * `a (2).jpg`, `a (3).jpg`.
 */
export function zipEntries(files: ReadonlyArray<ZipFile>, lastModified = new Date()): ZipEntry[] {
  const counts = new Map<string, number>()
  const used = new Set<string>()
  return files.map(({ name: original, blob }) => {
    const name = safeName(original)
    // A generated suffix may already be another file's name, so keep looking for a free one.
    let count = (counts.get(name) ?? 0) + 1
    let unique = count === 1 ? name : name.replace(/(\.[^.]*)?$/, ` (${count})$1`)
    while (used.has(unique)) {
      count += 1
      unique = name.replace(/(\.[^.]*)?$/, ` (${count})$1`)
    }
    counts.set(name, count)
    used.add(unique)
    return { name: unique, blob, lastModified }
  })
}

/** The CRC-32 of a Blob, read `CHUNK_BYTES` at a time. */
async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0
  let read = 0
  for (let start = 0; start < blob.size; start += CHUNK_BYTES) {
    const chunk = new Uint8Array(await blob.slice(start, start + CHUNK_BYTES).arrayBuffer())
    crc = crc32Update(crc, chunk)
    read += chunk.length
  }
  // A file that gave fewer bytes than its size would be stored with a wrong CRC.
  if (read !== blob.size) throw new Error('A file could not be read completely')
  return crc
}

/** MS-DOS time and date, the only timestamp a plain ZIP entry has (local time, 1980–2107). */
function dosTime(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  return {
    time: (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11),
    date: date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9),
  }
}

/** UTF-8 names, flagged as such (bit 11), so accents and other scripts survive. */
const FLAG_UTF8 = 0x0800
/** Version 2.0 is the one that introduced the folders and "stored" method this uses. */
const VERSION = 20
/** "Made on Unix" (3) with the version, so the permissions below are read as such. */
const MADE_BY = (3 << 8) | VERSION
/** Regular file, rw-r--r--: what the archive says about the files once extracted. */
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0

/**
 * Builds the ZIP of `entries` as a Blob (`application/zip`) that references their Blobs. Rejects,
 * without producing an archive, if a file cannot be read or the archive would not fit the format.
 */
export async function createZip(entries: ReadonlyArray<ZipEntry>): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new RangeError('Too many files for a ZIP')
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  let directoryBytes = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const size = entry.blob.size
    if (name.length > MAX_NAME_BYTES) throw new RangeError('A file name is too long for a ZIP')
    if (size > MAX_FIELD_32 || offset > MAX_FIELD_32) throw new RangeError('The ZIP is too large')
    const crc = await crc32Blob(entry.blob)
    const { time, date } = dosTime(entry.lastModified)

    const local = new DataView(new ArrayBuffer(30 + name.length))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, VERSION, true)
    local.setUint16(6, FLAG_UTF8, true)
    // 8: method 0, stored.
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, name.length, true)
    // 28: no extra field.
    new Uint8Array(local.buffer).set(name, 30)

    const central = new DataView(new ArrayBuffer(46 + name.length))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, MADE_BY, true)
    central.setUint16(6, VERSION, true)
    central.setUint16(8, FLAG_UTF8, true)
    // 10: method 0, stored.
    central.setUint16(12, time, true)
    central.setUint16(14, date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, name.length, true)
    // 30, 32, 34, 36: no extra field, comment, disk number or internal attributes.
    central.setUint32(38, UNIX_FILE_MODE, true)
    central.setUint32(42, offset, true)
    new Uint8Array(central.buffer).set(name, 46)

    parts.push(local.buffer, entry.blob)
    directory.push(new Uint8Array(central.buffer))
    offset += local.byteLength + size
    directoryBytes += central.byteLength
  }

  if (offset > MAX_FIELD_32 || offset + directoryBytes > MAX_FIELD_32) {
    throw new RangeError('The ZIP is too large')
  }
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  // 4, 6: this is the only disk, and the one the directory starts on.
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, directoryBytes, true)
  end.setUint32(16, offset, true)
  // 20: no archive comment.
  parts.push(...directory, end.buffer)

  const zip = new Blob(parts, { type: 'application/zip' })
  if (zip.size !== offset + directoryBytes + 22) throw new Error('The ZIP was not built completely')
  return zip
}

/** Builds the ZIP and starts its download as `zipName`. Nothing is downloaded if it fails. */
export async function downloadZip(files: ReadonlyArray<ZipFile>, zipName: string): Promise<void> {
  const url = URL.createObjectURL(await createZip(zipEntries(files)))
  const link = document.createElement('a')
  link.href = url
  link.download = zipName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
