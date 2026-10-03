/**
 * Removes metadata (EXIF, including GPS location and camera details, XMP, comments, text
 * chunks) from an image file without re-encoding it, so its pixels stay exactly the same.
 * Used when a file is already under the size target. Everything after the image data (for
 * example a motion-photo video appended after a JPEG) is dropped too.
 */
import { ToolError } from '@mochifile/tool-kit'
import { type ImageInfo, isStandaloneMarker, type Orientation } from './sniff.ts'

const invalid = (why: string) => new ToolError('invalid-file', `Cannot strip metadata: ${why}`)

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const u32be = (b: Uint8Array, i: number) => u16be(b, i) * 0x10000 + u16be(b, i + 2)
const u32le = (b: Uint8Array, i: number) =>
  ((b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16)) + (b[i + 3] ?? 0) * 0x1000000
const ascii = (b: Uint8Array, i: number, n: number) =>
  String.fromCharCode(...b.subarray(i, Math.min(b.length, i + n)))

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Returns a copy of the file without metadata. The input is not modified. */
export function stripMetadata(bytes: Uint8Array, info: ImageInfo): Uint8Array {
  if (info.format === 'jpeg') return stripJpeg(bytes, info.orientation)
  if (info.format === 'png') return stripPng(bytes)
  return stripWebp(bytes)
}

/**
 * A minimal EXIF segment holding only the orientation, so a rotated photo still displays
 * upright after the original EXIF block (with location, camera, dates…) is removed.
 */
export function orientationOnlyExif(orientation: Orientation): Uint8Array {
  // biome-ignore format: one TIFF field per line is easier to check against the spec
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0"
  const length = payload.length + 2
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload])
}

/**
 * Segments kept: JFIF (APP0), ICC profiles (APP2 "ICC_PROFILE"), Adobe (APP14, which tells
 * decoders how to read the colors) and every segment that encodes the image. Dropped: EXIF
 * and XMP (APP1), all other APPn, and comments (COM).
 */
function keepJpegSegment(marker: number, bytes: Uint8Array, offset: number): boolean {
  if (marker === 0xfe) return false
  if (marker === 0xe0 || marker === 0xee) return true
  if (marker === 0xe2) return ascii(bytes, offset + 2, 12) === 'ICC_PROFILE\0'
  return !(marker >= 0xe0 && marker <= 0xef)
}

function stripJpeg(bytes: Uint8Array, orientation: Orientation): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let insertedOrientation = orientation === 1
  let offset = 2
  for (;;) {
    if (bytes[offset] !== 0xff) throw invalid('bad JPEG marker')
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset] ?? -1
    offset += 1
    if (marker === -1) throw invalid('truncated JPEG')
    if (marker === 0xd9) {
      parts.push(new Uint8Array([0xff, 0xd9]))
      return concat(parts)
    }
    if (isStandaloneMarker(marker)) {
      parts.push(new Uint8Array([0xff, marker]))
      continue
    }
    const length = u16be(bytes, offset)
    const end = offset + length
    if (length < 2 || end > bytes.length) throw invalid('truncated JPEG segment')
    // Keep the orientation right after JFIF (if any), before the frame-defining segments.
    if (!insertedOrientation && marker !== 0xe0) {
      parts.push(orientationOnlyExif(orientation))
      insertedOrientation = true
    }
    if (keepJpegSegment(marker, bytes, offset)) parts.push(bytes.subarray(offset - 2, end))
    offset = end
    if (marker === 0xda) {
      // Entropy-coded data runs until the next marker that is not a stuffed 0xFF00 or RSTn.
      const start = offset
      while (offset < bytes.length) {
        if (bytes[offset] === 0xff) {
          const next = bytes[offset + 1] ?? 0
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break
          offset += 2
        } else {
          offset += 1
        }
      }
      if (offset >= bytes.length) throw invalid('JPEG without an end marker')
      parts.push(bytes.subarray(start, offset))
    }
  }
}

const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf'])

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    const end = offset + 12 + length
    if (end > bytes.length) throw invalid('truncated PNG chunk')
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(bytes.subarray(offset, end))
    if (type === 'IEND') return concat(parts)
    offset = end
  }
  throw invalid('PNG without IEND')
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  const riffEnd = Math.min(bytes.length, 8 + u32le(bytes, 4))
  let offset = 12
  while (offset + 8 <= riffEnd) {
    const type = ascii(bytes, offset, 4)
    const size = u32le(bytes, offset + 4)
    // Chunks are padded to an even size.
    const end = offset + 8 + size + (size % 2)
    if (offset + 8 + size > riffEnd) throw invalid('truncated WebP chunk')
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = bytes.slice(offset, Math.min(end, riffEnd))
      // VP8X flags: clear "has EXIF" (0x08) and "has XMP" (0x04).
      if (type === 'VP8X') chunk[8] = (chunk[8] ?? 0) & ~0x0c
      parts.push(chunk)
    }
    offset = end
  }
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 4), 0) // "RIFF"
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  header.set(bytes.subarray(8, 12), 8) // "WEBP"
  return concat([header, body])
}
