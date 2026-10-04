/**
 * Reads an image's format, dimensions and EXIF orientation from its header bytes, without
 * decoding it. Used to reject oversized images before spending memory on them and to plan
 * the decode size. Every read is bounds-checked: the input is untrusted.
 */
import { ToolError } from '@mochifile/tool-kit'
import { detectHeif, readHeifHeader } from './heif.ts'

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif'
/** Formats the engine can write. HEIC and AVIF are read only. */
export type EncodableFormat = 'jpeg' | 'png' | 'webp'

/** EXIF orientation, 1 (upright) to 8. Values 5–8 swap width and height when displayed. */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface ImageInfo {
  format: ImageFormat
  /** Stored (coded) width and height, before applying orientation. */
  width: number
  height: number
  /**
   * From EXIF for JPEG and from the `irot` rotation for HEIC/AVIF (as the equivalent EXIF
   * value); browsers ignore EXIF orientation in PNG and WebP.
   */
  orientation: Orientation
  /** Whether the format and header allow transparent pixels (the pixels decide in the end). */
  mayHaveAlpha: boolean
}

const invalid = (why: string) => new ToolError('invalid-file', `Not a valid image: ${why}`)

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16)
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 0x10000 + u16be(b, i + 2)
const u32le = (b: Uint8Array, i: number) => u16le(b, i) + u16le(b, i + 2) * 0x10000
const ascii = (b: Uint8Array, i: number, n: number) =>
  String.fromCharCode(...b.subarray(i, Math.min(b.length, i + n)))

export function detectFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  return detectHeif(bytes)
}

/** Reads the header of a JPEG, PNG, WebP, HEIC or AVIF file. Throws `ToolError('invalid-file')`. */
export function sniffImage(bytes: Uint8Array): ImageInfo {
  const format = detectFormat(bytes)
  if (format === 'jpeg') return sniffJpeg(bytes)
  if (format === 'png') return sniffPng(bytes)
  if (format === 'webp') return sniffWebp(bytes)
  if (format === 'heic' || format === 'avif') return sniffHeif(bytes, format)
  throw invalid('unknown format')
}

/**
 * `irot` counts quarter turns anticlockwise; as EXIF orientation, one turn is 8 (display
 * rotated 90° anticlockwise), two are 3 and three are 6. Mirroring (`imir`) is left to the
 * decoders, which apply every transformation; here it matters only whether sides swap.
 */
const ROTATION_TO_ORIENTATION: Record<0 | 1 | 2 | 3, Orientation> = { 0: 1, 1: 8, 2: 3, 3: 6 }

function sniffHeif(bytes: Uint8Array, format: 'heic' | 'avif'): ImageInfo {
  const header = readHeifHeader(bytes)
  return {
    format,
    width: header.width,
    height: header.height,
    orientation: ROTATION_TO_ORIENTATION[header.rotation],
    mayHaveAlpha: header.mayHaveAlpha,
  }
}

/** Width and height as displayed, after applying the orientation. */
export function displaySize(info: Pick<ImageInfo, 'width' | 'height' | 'orientation'>): {
  width: number
  height: number
} {
  return info.orientation >= 5
    ? { width: info.height, height: info.width }
    : { width: info.width, height: info.height }
}

/** Markers with no length field: TEM, RST0–7 (SOI and EOI are handled by the callers). */
export const isStandaloneMarker = (marker: number) =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)

/** SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC). */
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

function sniffJpeg(bytes: Uint8Array): ImageInfo {
  let orientation: Orientation = 1
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw invalid('bad JPEG marker')
    // Any number of 0xFF fill bytes may precede a marker.
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset] ?? 0
    offset += 1
    if (isStandaloneMarker(marker)) continue
    if (marker === 0xd9 || marker === 0xda) break // EOI or SOS before any frame header
    const length = u16be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) throw invalid('truncated JPEG segment')
    if (marker === 0xe1 && ascii(bytes, offset + 2, 6) === 'Exif\0\0') {
      orientation = readExifOrientation(bytes.subarray(offset + 8, offset + length)) ?? orientation
    }
    if (isStartOfFrame(marker)) {
      const height = u16be(bytes, offset + 3)
      const width = u16be(bytes, offset + 5)
      if (width === 0 || height === 0) throw invalid('JPEG without dimensions')
      return { format: 'jpeg', width, height, orientation, mayHaveAlpha: false }
    }
    offset += length
  }
  throw invalid('JPEG without a frame header')
}

/** Reads tag 0x0112 from IFD0 of a TIFF/EXIF block. Undefined if absent or malformed. */
export function readExifOrientation(tiff: Uint8Array): Orientation | undefined {
  const order = ascii(tiff, 0, 2)
  if (order !== 'II' && order !== 'MM') return undefined
  const u16 = order === 'II' ? u16le : u16be
  const u32 = order === 'II' ? u32le : u32be
  if (u16(tiff, 2) !== 42) return undefined
  const ifd = u32(tiff, 4)
  if (ifd + 2 > tiff.length) return undefined
  const count = u16(tiff, ifd)
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > tiff.length) return undefined
    if (u16(tiff, entry) === 0x0112) {
      const value = u16(tiff, entry + 8)
      return value >= 1 && value <= 8 ? (value as Orientation) : undefined
    }
  }
  return undefined
}

function sniffPng(bytes: Uint8Array): ImageInfo {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== 'IHDR') throw invalid('PNG without IHDR')
  const width = u32be(bytes, 16)
  const height = u32be(bytes, 20)
  if (width === 0 || height === 0) throw invalid('PNG without dimensions')
  const colorType = bytes[25]
  // Color types 4 and 6 carry alpha; any other type can still have a tRNS chunk.
  let mayHaveAlpha = colorType === 4 || colorType === 6
  for (let offset = 8; !mayHaveAlpha && offset + 8 <= bytes.length; ) {
    const length = u32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    if (type === 'tRNS') mayHaveAlpha = true
    if (type === 'IDAT' || type === 'IEND') break
    offset += 12 + length
  }
  return { format: 'png', width, height, orientation: 1, mayHaveAlpha }
}

function sniffWebp(bytes: Uint8Array): ImageInfo {
  const chunk = ascii(bytes, 12, 4)
  const data = 20
  if (chunk === 'VP8X') {
    if (bytes.length < data + 10) throw invalid('truncated VP8X')
    const flags = bytes[data] ?? 0
    return {
      format: 'webp',
      width: u24le(bytes, data + 4) + 1,
      height: u24le(bytes, data + 7) + 1,
      orientation: 1,
      mayHaveAlpha: (flags & 0x10) !== 0,
    }
  }
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), start code 9D 01 2A, then 14-bit width and height.
    if (bytes.length < data + 10 || u24le(bytes, data + 3) !== 0x2a019d) {
      throw invalid('bad VP8 frame')
    }
    const width = u16le(bytes, data + 6) & 0x3fff
    const height = u16le(bytes, data + 8) & 0x3fff
    if (width === 0 || height === 0) throw invalid('VP8 without dimensions')
    return { format: 'webp', width, height, orientation: 1, mayHaveAlpha: false }
  }
  if (chunk === 'VP8L') {
    if (bytes.length < data + 5 || bytes[data] !== 0x2f) throw invalid('bad VP8L header')
    const bits = u32le(bytes, data + 1)
    return {
      format: 'webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      orientation: 1,
      mayHaveAlpha: ((bits >>> 28) & 1) === 1,
    }
  }
  throw invalid('unknown WebP chunk')
}
