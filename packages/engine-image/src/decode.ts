/**
 * Decoding in the browser (ADR 0016). Three paths, chosen once per session by small probes:
 *
 * 1. `image-decoder`: WebCodecs `ImageDecoder` for JPEG, when a probe proves it decodes at a
 *    reduced size (JPEG DCT scaling) and applies EXIF orientation (Chromium today). It has the
 *    lowest memory use but is slower, so it is used only for photos above
 *    `IMAGE_DECODER_MIN_PIXELS`; smaller ones take the `bitmap` route.
 * 2. `bitmap`: `createImageBitmap` with orientation and resize options, then a canvas readback.
 * 3. `wasm`: jSquash decoders at full size, then a WebAssembly resize. Used when the canvas
 *    readback is not exact, as when a browser's anti-fingerprinting adds noise to it (private
 *    browsing in Safari, Brave, Firefox with resistFingerprinting). Needs more memory, so it
 *    has a lower pixel limit.
 *
 * Every path returns pixels in display orientation (EXIF applied), at most at the target size,
 * with non-premultiplied alpha.
 */
import { ToolError } from '@mochifile/tool-kit'
import type { Codecs } from './codecs.ts'
import { displaySize, type ImageInfo } from './sniff.ts'

export type DecodePath = 'image-decoder' | 'bitmap' | 'wasm'

export interface Size {
  width: number
  height: number
}

/** Display pixels the WebAssembly path accepts: a full-size decode of 24 MP needs ~200 MB. */
export const WASM_MAX_PIXELS = 24_000_000
/**
 * Below this, `ImageDecoder` is not worth it: in Chromium on an M2 it took 1.8–1.9 s for a
 * 12–42 MP photo against 0.2–0.4 s for `createImageBitmap` (ADR 0016), and below 24 MP the
 * bitmap route's memory use is safe on phones.
 */
export const IMAGE_DECODER_MIN_PIXELS = 24_000_000

/**
 * The WebAssembly path decodes at full size; keep the last decode so asking for a preview and
 * then for the working size decodes the file once. Keyed by the bytes object of one run.
 */
let lastFullDecode: { bytes: Uint8Array; image: ImageData } | undefined

// 4×4 PNG with distinct opaque pixels; the readback must return exactly `CANARY_PIXELS`.
const CANARY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGElEQVR42mNk+M8g8EEVgpgcDkyBI9wcADcdF2ZoIzGbAAAAAElFTkSuQmCC'
// biome-ignore format: 16 RGBA pixels
export const CANARY_PIXELS = [
  0, 255, 0, 255, 16, 239, 37, 255, 32, 223, 74, 255, 48, 207, 111, 255,
  64, 191, 148, 255, 80, 175, 185, 255, 96, 159, 222, 255, 112, 143, 3, 255,
  128, 127, 40, 255, 144, 111, 77, 255, 160, 95, 114, 255, 176, 79, 151, 255,
  192, 63, 188, 255, 208, 47, 225, 255, 224, 31, 6, 255, 240, 15, 43, 255,
]
/**
 * 64×32 JPEG, left quarter red and the rest blue, with EXIF orientation 6. Displayed it is
 * 32×64 with red on top. Generated with mozjpeg plus `orientationOnlyExif(6)`.
 */
const ORIENTED_JPEG =
  '/9j/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/2wCEAAgICAgJCAkKCgkNDgwODRMREBARExwUFhQWFBwrGx8bGx8bKyYuJSMlLiZENS8vNUROQj5CTl9VVV93cXecnNEBCAgICAkICQoKCQ0ODA4NExEQEBETHBQWFBYUHCsbHxsbHxsrJi4lIyUuJkQ1Ly81RE5CPkJOX1VVX3dxd5yc0f/CABEIACAAQAMBIgACEQEDEQH/xAAqAAEBAAAAAAAAAAAAAAAAAAAABgEBAQEBAAAAAAAAAAAAAAAAAAgGB//aAAwDAQACEAMQAAAAixlO/wAgKqmsACvEq0pICqprAA//xAAUEAEAAAAAAAAAAAAAAAAAAABQ/9oACAEBAAE/AAP/xAAUEQEAAAAAAAAAAAAAAAAAAAAw/9oACAECAQE/AA//xAAUEQEAAAAAAAAAAAAAAAAAAAAw/9oACAEDAQE/AA//2Q=='

export const probeImages = {
  canaryPng: () => base64Bytes(CANARY_PNG),
  orientedJpeg: () => base64Bytes(ORIENTED_JPEG),
}

function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Minimal WebCodecs `ImageDecoder` typing; not every TypeScript DOM library declares it. */
interface ImageDecoderLike {
  decode(): Promise<{ image: VideoFrame }>
  close(): void
}
type ImageDecoderConstructor = new (init: {
  data: BufferSource
  type: string
  desiredWidth?: number
  desiredHeight?: number
}) => ImageDecoderLike

const imageDecoderClass = () =>
  (globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder

/** Draws a bitmap or frame on a canvas and reads its pixels back, then frees the canvas. */
function readback(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new ToolError('processing-failed', 'No 2D canvas context')
  context.drawImage(source, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height)
  // Release the backing store now rather than at garbage collection.
  canvas.width = 0
  canvas.height = 0
  return pixels
}

/**
 * Whether a canvas readback returns exactly what was decoded. False when anti-fingerprinting
 * adds noise, or when OffscreenCanvas is missing.
 */
export async function probeExactReadback(): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([probeImages.canaryPng()], { type: 'image/png' }),
      {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      },
    )
    const pixels = readback(bitmap, bitmap.width, bitmap.height)
    bitmap.close()
    return (
      pixels.data.length === CANARY_PIXELS.length &&
      pixels.data.every((v, i) => v === CANARY_PIXELS[i])
    )
  } catch {
    return false
  }
}

/**
 * Whether `ImageDecoder` decodes a JPEG at a reduced size and applies its orientation. Some
 * engines ignore the requested size and decode at full size, which would defeat the purpose
 * and can use a lot of memory, so this is checked rather than assumed.
 */
export async function probeScaledJpegDecoder(): Promise<boolean> {
  const ImageDecoder = imageDecoderClass()
  if (!ImageDecoder) return false
  try {
    // Ask for a quarter of the displayed size (8×16 of 32×64).
    const decoder = new ImageDecoder({
      data: probeImages.orientedJpeg(),
      type: 'image/jpeg',
      desiredWidth: 8,
      desiredHeight: 16,
    })
    const { image } = await decoder.decode()
    const ok = image.displayWidth === 8 && image.displayHeight === 16 && image.codedWidth <= 16
    const pixels = ok ? readback(image, 8, 16) : undefined
    image.close()
    decoder.close()
    if (!pixels) return false
    const top = pixels.data.subarray(0, 4)
    const bottom = pixels.data.subarray(pixels.data.length - 4)
    return (
      (top[0] ?? 0) > 200 &&
      (top[2] ?? 255) < 60 &&
      (bottom[2] ?? 0) > 200 &&
      (bottom[0] ?? 255) < 60
    )
  } catch {
    return false
  }
}

/**
 * Picks the decode path. The readback check comes first because the two native paths both
 * read pixels back from a canvas.
 */
export async function chooseDecodePath(): Promise<DecodePath> {
  if (!(await probeExactReadback())) return 'wasm'
  return (await probeScaledJpegDecoder()) ? 'image-decoder' : 'bitmap'
}

/** Largest JPEG DCT scale (n/8) whose output is at least `target` on both sides. */
export function dctScaledSize(display: Size, target: Size): Size {
  const eighths = Math.min(
    8,
    Math.max(
      1,
      Math.ceil((8 * target.width) / display.width),
      Math.ceil((8 * target.height) / display.height),
    ),
  )
  return {
    width: Math.ceil((display.width * eighths) / 8),
    height: Math.ceil((display.height * eighths) / 8),
  }
}

/**
 * Decoders reject corrupt or truncated files; report those as `invalid-file`. Errors after
 * decoding (e.g. running out of memory while resizing) keep their own meaning.
 */
async function decoding<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    throw new ToolError('invalid-file', 'The image could not be decoded', { cause: error })
  }
}

/** Decodes `bytes` to display orientation at `target` size (≤ display size). */
export async function decodeImage({
  path,
  bytes,
  info,
  target,
  codecs,
}: {
  path: DecodePath
  bytes: Uint8Array<ArrayBuffer>
  info: ImageInfo
  target: Size
  codecs: Codecs
}): Promise<ImageData> {
  const display = displaySize(info)
  const fit = async (image: ImageData) =>
    image.width > target.width || image.height > target.height
      ? codecs.resize(image, target.width, target.height)
      : image

  if (path === 'wasm') {
    if (display.width * display.height > WASM_MAX_PIXELS) {
      throw new ToolError('dimensions-too-large', 'Too large for the WebAssembly decoder', {
        details: { maxMegapixels: WASM_MAX_PIXELS / 1_000_000 },
      })
    }
    if (lastFullDecode?.bytes !== bytes) {
      // Drop the previous file's pixels before decoding the next one.
      lastFullDecode = undefined
      lastFullDecode = { bytes, image: await decoding(codecs.decode(info.format, bytes)) }
    }
    const full = lastFullDecode.image
    if (full.width > target.width || full.height > target.height) return fit(full)
    // Handed over unresized: the caller may modify it (e.g. flatten transparency), so it must
    // not stay in the cache.
    lastFullDecode = undefined
    return full
  }

  const ImageDecoder = imageDecoderClass()
  if (
    path === 'image-decoder' &&
    info.format === 'jpeg' &&
    ImageDecoder &&
    display.width * display.height > IMAGE_DECODER_MIN_PIXELS
  ) {
    // Ask for the smallest DCT scale that is still at least the target, then resize exactly.
    const desired = dctScaledSize(display, target)
    const decoder = new ImageDecoder({
      data: bytes,
      type: 'image/jpeg',
      desiredWidth: desired.width,
      desiredHeight: desired.height,
    })
    try {
      const { image } = await decoding(decoder.decode())
      const pixels = readback(image, image.displayWidth, image.displayHeight)
      image.close()
      return fit(pixels)
    } finally {
      decoder.close()
    }
  }

  const resized = target.width < display.width || target.height < display.height
  const bitmap = await decoding(
    createImageBitmap(new Blob([bytes]), {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
      ...(resized
        ? { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' as const }
        : {}),
    }),
  )
  try {
    return fit(readback(bitmap, bitmap.width, bitmap.height))
  } finally {
    bitmap.close()
  }
}
