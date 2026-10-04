/**
 * Converts one image to another format at full resolution (ADR 0016, ADR 0022): JPG, PNG, WebP,
 * HEIC or AVIF in; JPG, PNG or WebP out. Pure apart from the injected engine: no DOM access, no
 * network, no logging.
 */
import { ToolError, throwIfAborted } from '@mochifile/tool-kit'
import { type ImageEngine, MAX_INPUT_PIXELS } from './compress.ts'
import { flattenOnWhite, hasTransparency } from './pixels.ts'
import { displaySize, type EncodableFormat, type ImageFormat, sniffImage } from './sniff.ts'
import { stripMetadata } from './strip-metadata.ts'

/**
 * Encoder qualities, chosen once rather than per image: high enough that a converted photo
 * looks like the original, without the bloat of near-lossless settings. A converter should not
 * surprise people with heavy compression; compress-image exists for small files.
 */
export const CONVERT_QUALITY = { jpeg: 85, webp: 82 } as const

export interface ConvertOptions {
  format: EncodableFormat
}

export type ConvertOutcome = 'converted' | 'already-in-format'

/** Facts for the UI. Plain values only, never file contents. */
export interface ConvertMeta {
  outcome: ConvertOutcome
  format: EncodableFormat
  originalFormat: ImageFormat
  originalBytes: number
  outputBytes: number
  width: number
  height: number
  /** Encoder quality used, or 0 when not applicable (lossless PNG, untouched original). */
  quality: number
  /** Transparent areas were filled with white because the output is JPEG. */
  flattenedTransparency: boolean
  /** Always true: outputs never carry EXIF, GPS, XMP or text metadata. */
  metadataRemoved: true
  /** Which decoder read the file, for diagnostics. */
  decodedWith: 'native' | 'wasm' | 'none'
}

export interface ConvertResult {
  bytes: Uint8Array
  meta: ConvertMeta
}

export interface ConvertContext {
  engine: ImageEngine
  signal: AbortSignal
  onProgress?: (ratio: number, stage: 'decoding' | 'encoding') => void
}

export async function convertImage(
  file: Blob,
  { format }: ConvertOptions,
  { engine, signal, onProgress }: ConvertContext,
): Promise<ConvertResult> {
  throwIfAborted(signal)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = sniffImage(bytes)
  const display = displaySize(info)
  const pixels = display.width * display.height
  if (pixels > MAX_INPUT_PIXELS) {
    throw new ToolError('dimensions-too-large', `${pixels} pixels`, {
      details: { maxMegapixels: MAX_INPUT_PIXELS / 1_000_000 },
    })
  }
  const base = {
    format,
    originalFormat: info.format,
    originalBytes: bytes.length,
    width: display.width,
    height: display.height,
    metadataRemoved: true as const,
  }

  // Already in the wanted format: keep the original pixels, drop the metadata.
  if (info.format === format) {
    const stripped = stripMetadata(bytes, info)
    return {
      bytes: stripped,
      meta: {
        ...base,
        outcome: 'already-in-format',
        outputBytes: stripped.length,
        quality: 0,
        flattenedTransparency: false,
        decodedWith: 'none',
      },
    }
  }

  onProgress?.(0.1, 'decoding')
  const image = await engine.decode(bytes, info, display)
  throwIfAborted(signal)
  const flattenedTransparency = format === 'jpeg' && info.mayHaveAlpha && hasTransparency(image)
  if (flattenedTransparency) flattenOnWhite(image)

  onProgress?.(0.5, 'encoding')
  const output =
    format === 'png'
      ? await engine.codecs.encodePng(image)
      : format === 'webp'
        ? await engine.codecs.encodeWebp(image, CONVERT_QUALITY.webp)
        : await engine.codecs.encodeJpeg(image, CONVERT_QUALITY.jpeg)
  throwIfAborted(signal)
  return {
    bytes: output,
    meta: {
      ...base,
      outcome: 'converted',
      outputBytes: output.length,
      width: image.width,
      height: image.height,
      quality: format === 'png' ? 0 : CONVERT_QUALITY[format],
      flattenedTransparency,
      decodedWith: engine.decoderFor?.(info.format) ?? 'wasm',
    },
  }
}
