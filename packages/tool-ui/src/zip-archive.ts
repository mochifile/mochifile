/**
 * The ZIP of "Download all", built in the browser (no upload, no server, no library). It is loaded
 * on demand by `zip.ts`, so the tool's first load does not carry it.
 *
 * The ZIP only *stores* the files, so each entry is the file's own bytes between two small headers.
 * The archive is therefore a `Blob` made of parts: the headers are tiny buffers and the files are
 * the existing result Blobs, which the browser references instead of copying. The only work on the
 * bytes is the CRC-32 every ZIP entry carries, read in slices of `CHUNK_BYTES`, so memory stays
 * near the size of one slice plus the headers, whatever the archive's size (ADR 0033).
 *
 * Names: `createZip` gives every entry a name that is safe to extract and different from the
 * others, so no program that extracts the ZIP can overwrite one file with another (see `zipEntries`
 * and ADR 0033). Callers pass the names they have; they cannot skip this.
 *
 * Limits of the format without ZIP64, which this code does not write. Every size and offset in the
 * headers is a 32-bit field whose largest usable value is 0xFFFFFFFE (0xFFFFFFFF means "see the
 * ZIP64 record"), and the entry count is a 16-bit field with 0xFFFF reserved the same way. So: at
 * most 65,534 files, and the files, their headers and the central directory together must end at
 * or before byte 4,294,967,294. That leaves a little less than 4 GiB for one big file: its size
 * plus 76 bytes and twice its name's length (the two headers). `createZip` checks this before
 * reading anything, and throws a `RangeError` instead of writing an archive some programs would
 * read wrongly.
 */
import { crc32Update } from './crc32.ts'

/** Bytes read at a time to compute a file's CRC: bounded memory, and short pauses for the page. */
const CHUNK_BYTES = 2 * 1024 * 1024
/** 0xFFFFFFFF and 0xFFFF are the "look in the ZIP64 record" markers, so they are not usable. */
const MAX_FIELD_32 = 0xffff_fffe
const MAX_ENTRIES = 0xfffe
/** Bytes of a local file header and of a central directory header, before the name. */
const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
/**
 * Longest name of an entry, in UTF-8 bytes. The format allows 65,535, but the file systems people
 * extract to (APFS, ext4, NTFS, exFAT) allow 255 per name, and extractors fail on longer ones.
 */
const MAX_NAME_BYTES = 255
/** An extension longer than this is not treated as one, so it is cut with the rest of the name. */
const MAX_EXTENSION_BYTES = 16

/** A file to put in the archive. */
export interface ZipFile {
  name: string
  blob: Blob
}

/** A file with the name it gets in the archive and the time written for it. */
export interface ZipEntry extends ZipFile {
  lastModified: Date
}

const encoder = new TextEncoder()
const utf8Length = (text: string) => encoder.encode(text).length

/**
 * What Windows will not make a file of. Device names are reserved with any extension (`con.txt`)
 * and trailing spaces; the superscript digits are the ones newer Windows reserves too.
 */
const RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|(?:COM|LPT)[0-9\u00b9\u00b2\u00b3])$/i

/**
 * What two names must have in common to be the same file on a common file system: the same letters
 * whatever their case (NTFS, APFS and exFAT by default, FAT) and whatever the way accents are
 * written (macOS: "é" as one character or as "e" and a combining accent). Folding to upper and
 * back to lower case also joins what only some tables join (`ß` and `SS`, `ς` and `σ`). It joins
 * more than any one system does, which only costs a number on a name that did not need one.
 */
const sameFileKey = (name: string) =>
  name.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')

/** `text` without its unpaired surrogates, which have no UTF-8 form: each becomes U+FFFD. */
function wellFormed(text: string): string {
  return Array.from(text, (character) =>
    character.length === 1 && character >= '\ud800' && character <= '\udfff' ? '\ufffd' : character,
  ).join('')
}

/** Cuts `text` to at most `limit` UTF-8 bytes, without splitting a character. */
function cutToBytes(text: string, limit: number): string {
  let bytes = 0
  let kept = ''
  for (const character of text) {
    bytes += utf8Length(character)
    if (bytes > limit) break
    kept += character
  }
  return kept
}

/** `name` and its extension (`.jpg`), when it has one: not a leading dot, and a short one. */
function splitExtension(name: string): [stem: string, extension: string] {
  const dot = name.lastIndexOf('.')
  return dot > 0 && utf8Length(name.slice(dot)) <= MAX_EXTENSION_BYTES
    ? [name.slice(0, dot), name.slice(dot)]
    : [name, '']
}

/** Windows drops dots and spaces at the end of a name, so `a.` and `a` would become one file. */
const withoutTrailingDotsAndSpaces = (name: string) => name.replace(/[. ]+$/, '')

/**
 * The name made of `stem` + `suffix` + `extension` within `MAX_NAME_BYTES`, cutting the stem. The
 * stem is cut by characters, and what is left at its end is cleaned again.
 */
function joinName(stem: string, suffix: string, extension: string): string {
  const room = MAX_NAME_BYTES - utf8Length(suffix) - utf8Length(extension)
  const cut = cutToBytes(stem, room)
  const kept = suffix === '' && extension === '' ? withoutTrailingDotsAndSpaces(cut) : cut
  return `${kept === '' ? 'file' : kept}${suffix}${extension}`
}

/**
 * Makes one name fit for an archive, keeping as much of it as it can:
 * - no folders: `/` and `\` (which would point outside the folder the ZIP is extracted to), and the
 *   characters Windows refuses (`: * ? " < > |`; a `:` makes an alternate data stream there) and
 *   the control characters U+0000–U+001F and U+007F become `_` (the C1 ones are kept);
 * - no dots or spaces at the end, no empty name, no `.` or `..`: `file`;
 * - no Windows device name: when the part before the first dot, without trailing spaces, is `CON`,
 *   `PRN`, `AUX`, `NUL`, or `COM` or `LPT` followed by one digit (0–9, or the superscripts ¹ ² ³),
 *   in any case and with any extension, a `_` goes before the name;
 * - unpaired surrogates become U+FFFD;
 * - at most `MAX_NAME_BYTES` UTF-8 bytes, keeping the extension.
 */
function cleanName(original: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it removes
  const replaced = wellFormed(original).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
  let name = withoutTrailingDotsAndSpaces(replaced)
  if (name === '') name = 'file'
  const device = (name.split('.')[0] ?? '').replace(/ +$/, '')
  if (RESERVED_NAME.test(device)) name = `_${name}`
  if (utf8Length(name) > MAX_NAME_BYTES) {
    const [stem, extension] = splitExtension(name)
    name = joinName(stem, '', extension)
  }
  return name
}

/**
 * Entries for `files`, each with a name that is safe to extract (see `cleanName`) and that no other
 * entry has *for a file system*: a name that is the same as an earlier one in upper or lower case,
 * or written with the other form of an accent, or that only became the same when cleaned, gets
 * ` (2)`, ` (3)`… before its extension: `photo.jpg`, `Photo.JPG` → `photo.jpg`, `Photo (2).JPG`.
 * The names are kept as they are otherwise, in the order of `files`, and a number is never one
 * another entry already has.
 */
export function zipEntries(files: ReadonlyArray<ZipFile>, lastModified = new Date()): ZipEntry[] {
  const taken = new Set<string>()
  // For each name before numbering: the last number tried, so a long run does not start over.
  const lastNumber = new Map<string, number>()
  return files.map(({ name: original, blob }) => {
    const clean = cleanName(original)
    const key = sameFileKey(clean)
    const [stem, extension] = splitExtension(clean)
    let name = clean
    let number = lastNumber.get(key) ?? 1
    while (taken.has(sameFileKey(name))) {
      number += 1
      name = joinName(stem, ` (${number})`, extension)
    }
    lastNumber.set(key, number)
    taken.add(sameFileKey(name))
    return { name, blob, lastModified }
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
 * Throws a `RangeError` if files of these sizes, with names of these lengths in UTF-8 bytes, do not
 * fit a ZIP without ZIP64 (see the limits at the top). Exported for its tests.
 */
export function checkZipLimits(files: ReadonlyArray<{ size: number; nameBytes: number }>): void {
  if (files.length > MAX_ENTRIES) throw new RangeError('Too many files for a ZIP')
  let offset = 0
  let directory = 0
  for (const { size, nameBytes } of files) {
    if (size > MAX_FIELD_32) throw new RangeError('The ZIP is too large')
    offset += LOCAL_HEADER_BYTES + nameBytes + size
    directory += CENTRAL_HEADER_BYTES + nameBytes
  }
  if (offset + directory > MAX_FIELD_32) throw new RangeError('The ZIP is too large')
}

/**
 * Builds the ZIP of `files` as a Blob (`application/zip`) that references their Blobs, naming the
 * entries as `zipEntries` does, so the names a caller gives can never make one file overwrite
 * another when extracted. Rejects, without producing an archive and before reading any file, if the
 * archive would not fit the format, and if a file cannot be read.
 */
export async function createZip(
  files: ReadonlyArray<ZipFile>,
  lastModified = new Date(),
): Promise<Blob> {
  const entries = zipEntries(files, lastModified).map((entry) => ({
    entry,
    name: encoder.encode(entry.name),
  }))
  checkZipLimits(
    entries.map(({ entry, name }) => ({ size: entry.blob.size, nameBytes: name.length })),
  )
  const parts: BlobPart[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  let directoryBytes = 0

  for (const { entry, name } of entries) {
    const size = entry.blob.size
    if (name.length > MAX_NAME_BYTES) throw new RangeError('A file name is too long for a ZIP')
    if (size > MAX_FIELD_32 || offset > MAX_FIELD_32) throw new RangeError('The ZIP is too large')
    const crc = await crc32Blob(entry.blob)
    const { time, date } = dosTime(entry.lastModified)

    const local = new DataView(new ArrayBuffer(LOCAL_HEADER_BYTES + name.length))
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
    new Uint8Array(local.buffer).set(name, LOCAL_HEADER_BYTES)

    const central = new DataView(new ArrayBuffer(CENTRAL_HEADER_BYTES + name.length))
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
    new Uint8Array(central.buffer).set(name, CENTRAL_HEADER_BYTES)

    parts.push(local.buffer, entry.blob)
    directory.push(new Uint8Array(central.buffer))
    offset += local.byteLength + size
    directoryBytes += central.byteLength
  }

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  // 4, 6: this is the only disk, and the one the directory starts on.
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, directoryBytes, true)
  end.setUint32(16, offset, true)
  // 20: no archive comment.
  parts.push(...directory, end.buffer)

  const zip = new Blob(parts, { type: 'application/zip' })
  if (zip.size !== offset + directoryBytes + 22) throw new Error('The ZIP was not built completely')
  return zip
}
