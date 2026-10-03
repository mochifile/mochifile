/**
 * Test-only builders for image inputs: real photos from `fixtures/`, synthetic images, and
 * files carrying metadata that must be removed. Never imported by production code.
 */
import { readFile } from 'node:fs/promises'
import { crc32 } from 'node:zlib'
import type { Orientation } from '../sniff.ts'

export const PHOTOS = ['landscape', 'flowers', 'portrait'] as const
export type Photo = (typeof PHOTOS)[number]

export async function readPhoto(name: Photo): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`../../fixtures/${name}.jpg`, import.meta.url)))
}

/** Text planted in metadata; it must never survive in an output file. */
export const SECRET = 'GPS 37.7749 N 122.4194 W - secret camera serial 0042'

const encoder = new TextEncoder()
const ascii = (text: string) => [...encoder.encode(text)]

export function contains(bytes: Uint8Array, text: string): boolean {
  const needle = encoder.encode(text)
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

export function concat(...parts: ArrayLike<number>[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * A photo-like test image: smooth gradients, a few shapes and deterministic noise, so codecs
 * behave as they do on real photos. With `alpha`, the left half fades to transparent.
 */
export function syntheticImage(width: number, height: number, { alpha = false } = {}): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 7
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const noise = (seed >> 16) % 16
      const i = (y * width + x) * 4
      const inCircle =
        (x - width / 2) ** 2 + (y - height / 2) ** 2 < (Math.min(width, height) / 4) ** 2
      data[i] = inCircle ? 230 : (x * 255) / width + noise
      data[i + 1] = inCircle ? 80 : (y * 255) / height + noise
      data[i + 2] = ((x + y) * 128) / (width + height) + 60 + noise
      data[i + 3] = alpha && x < width / 2 ? Math.round((x / (width / 2)) * 255) : 255
    }
  }
  return new ImageData(data, width, height)
}

/**
 * A JPEG APP1 EXIF segment with the given orientation and an ImageDescription holding
 * `SECRET`, standing in for location and camera data.
 */
export function exifSegment(orientation: Orientation = 1): Uint8Array {
  const text = [...ascii(SECRET), 0]
  const entries = 2
  const ifdEnd = 8 + 2 + entries * 12 + 4
  // biome-ignore format: one TIFF field per line
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, entries,
    0x01, 0x0e, 0x00, 0x02, 0, 0, 0, text.length, 0, 0, 0, ifdEnd, // ImageDescription
    0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation
    0, 0, 0, 0,
    ...text,
  ]
  const payload = [...ascii('Exif'), 0, 0, ...tiff]
  const length = payload.length + 2
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload])
}

/** XMP (APP1) and comment (COM) segments, both holding `SECRET`. */
export function xmpSegment(): Uint8Array {
  const payload = [
    ...ascii('http://ns.adobe.com/xap/1.0/'),
    0,
    ...ascii(`<x:xmpmeta>${SECRET}</x:xmpmeta>`),
  ]
  const length = payload.length + 2
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...payload])
}

export function commentSegment(): Uint8Array {
  const payload = ascii(SECRET)
  const length = payload.length + 2
  return new Uint8Array([0xff, 0xfe, length >> 8, length & 0xff, ...payload])
}

/** Inserts JPEG segments right after SOI, like a camera does. */
export function withJpegSegments(jpeg: Uint8Array, ...segments: Uint8Array[]): Uint8Array {
  return concat(jpeg.subarray(0, 2), ...segments, jpeg.subarray(2))
}

function pngChunk(type: string, data: number[]): Uint8Array {
  const typeAndData = new Uint8Array([...ascii(type), ...data])
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeAndData, 4)
  view.setUint32(8 + data.length, crc32(typeAndData))
  return out
}

/** Adds tEXt, iTXt and tIME chunks holding `SECRET` right after IHDR. */
export function withPngMetadata(png: Uint8Array): Uint8Array {
  const ihdrEnd = 8 + 25
  return concat(
    png.subarray(0, ihdrEnd),
    pngChunk('tEXt', [...ascii('Comment'), 0, ...ascii(SECRET)]),
    pngChunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii(SECRET)]),
    pngChunk('tIME', [0x07, 0xea, 10, 3, 12, 0, 0]),
    png.subarray(ihdrEnd),
  )
}

function riffChunk(type: string, data: ArrayLike<number>): Uint8Array {
  const padded = data.length % 2 === 1 ? concat(data, [0]) : Uint8Array.from(data)
  const out = new Uint8Array(8 + padded.length)
  out.set(ascii(type), 0)
  new DataView(out.buffer).setUint32(4, data.length, true)
  out.set(padded, 8)
  return out
}

/** Wraps a simple (VP8) WebP in an extended VP8X container with EXIF and XMP chunks. */
export function withWebpMetadata(webp: Uint8Array, width: number, height: number): Uint8Array {
  const image = webp.subarray(12) // the VP8 chunk, already padded
  const vp8x = new Uint8Array(10)
  vp8x[0] = 0x08 | 0x04 // EXIF and XMP present
  const w = width - 1
  const h = height - 1
  vp8x.set(
    [w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff],
    4,
  )
  const exif = exifSegment(1).subarray(10) // TIFF data without the JPEG APP1 header
  const body = concat(
    ascii('WEBP'),
    riffChunk('VP8X', vp8x),
    image,
    riffChunk('EXIF', exif),
    riffChunk('XMP ', ascii(`<x:xmpmeta>${SECRET}</x:xmpmeta>`)),
  )
  const header = new Uint8Array(8)
  header.set(ascii('RIFF'), 0)
  new DataView(header.buffer).setUint32(4, body.length, true)
  return concat(header, body)
}

/** Decoded pixels are identical, as they must be after a lossless metadata strip. */
export function samePixels(a: ImageData, b: ImageData): boolean {
  return a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i])
}
