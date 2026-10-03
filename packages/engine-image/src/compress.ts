/**
 * Compresses one image to at most a target size (ADR 0017): the whole pipeline from file bytes
 * to output bytes. Pure apart from the injected engine: no DOM access, no network, no logging.
 */
import { ToolError, throwIfAborted } from '@mochifile/tool-kit'
import type { Codecs } from './codecs.ts'
import type { Size } from './decode.ts'
import { estimateStartScale, fitToSize, scaledSize } from './fit-to-size.ts'
import { flattenOnWhite, hasTransparency } from './pixels.ts'
import { displaySize, type ImageFormat, type ImageInfo, sniffImage } from './sniff.ts'
import { stripMetadata } from './strip-metadata.ts'

/** `original` keeps the input format when it can reach the target (PNG may become JPEG). */
export type OutputFormat = 'original' | 'jpeg' | 'webp'

export interface CompressOptions {
  targetBytes: number
  format: OutputFormat
}

/** Inputs larger than this are rejected before decoding. */
export const MAX_INPUT_PIXELS = 100_000_000
/** Images are processed at most at this size, to keep memory use safe on phones (ADR 0016). */
export const MAX_WORKING_PIXELS = 16_000_000

/** What the browser (or a test) provides: codecs and a way to decode at a given size. */
export interface ImageEngine {
  codecs: Codecs
  decode(bytes: Uint8Array<ArrayBuffer>, info: ImageInfo, target: Size): Promise<ImageData>
}

export type CompressOutcome = 'compressed' | 'already-under'

/** Facts for the UI. Plain values only, never file contents. */
export interface CompressMeta {
  outcome: CompressOutcome
  format: ImageFormat
  originalFormat: ImageFormat
  originalBytes: number
  outputBytes: number
  targetBytes: number
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  /** Encoder quality used, or 0 when not applicable (lossless PNG, untouched original). */
  quality: number
  /** Dimensions were reduced to reach the target or the working-size limit. */
  resized: boolean
  /** The output format differs from the input format. */
  converted: boolean
  /** Transparent areas were filled with white because the output is JPEG. */
  flattenedTransparency: boolean
  /** Always true: outputs never carry EXIF, GPS, XMP or text metadata. */
  metadataRemoved: true
}

export interface CompressResult {
  bytes: Uint8Array
  meta: CompressMeta
}

export interface CompressContext {
  engine: ImageEngine
  signal: AbortSignal
  onProgress?: (ratio: number, stage: 'decoding' | 'optimising' | 'encoding') => void
}

export async function compressToTarget(
  file: Blob,
  { targetBytes, format }: CompressOptions,
  { engine, signal, onProgress }: CompressContext,
): Promise<CompressResult> {
  if (!Number.isFinite(targetBytes) || targetBytes < 1) {
    throw new ToolError('processing-failed', 'targetBytes must be a positive number')
  }
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

  const requested: ImageFormat = format === 'original' ? info.format : format
  const base = {
    originalFormat: info.format,
    originalBytes: bytes.length,
    targetBytes,
    originalWidth: display.width,
    originalHeight: display.height,
    metadataRemoved: true as const,
  }

  // Already small enough in the wanted format: keep the original pixels, drop the metadata.
  if (requested === info.format && bytes.length <= targetBytes) {
    const stripped = stripMetadata(bytes, info)
    return {
      bytes: stripped,
      meta: {
        ...base,
        outcome: 'already-under',
        format: info.format,
        outputBytes: stripped.length,
        width: display.width,
        height: display.height,
        quality: 0,
        resized: false,
        converted: false,
        flattenedTransparency: false,
      },
    }
  }

  onProgress?.(0.05, 'decoding')
  // A lossless PNG attempt wants the full working size; a lossy one can skip sizes that are
  // certain to be too big.
  const tryPngFirst = requested === 'png'
  const memoryScale = estimateStartScale({
    pixels,
    targetBytes: Number.POSITIVE_INFINITY,
    maxPixels: MAX_WORKING_PIXELS,
  })
  const lossyScale = estimateStartScale({ pixels, targetBytes, maxPixels: MAX_WORKING_PIXELS })
  const decodeScale = tryPngFirst ? memoryScale : lossyScale
  const image = await engine.decode(
    bytes,
    info,
    scaledSize(display.width, display.height, decodeScale),
  )
  throwIfAborted(signal)

  const done = (
    output: Uint8Array,
    details: Omit<CompressMeta, keyof typeof base | 'outcome' | 'outputBytes'>,
  ) => {
    // The guarantee: never return a file above the target.
    if (output.length > targetBytes) throw new ToolError('processing-failed', 'Result above target')
    return {
      bytes: output,
      meta: { ...base, ...details, outcome: 'compressed' as const, outputBytes: output.length },
    }
  }

  if (tryPngFirst) {
    onProgress?.(0.2, 'optimising')
    const png = await engine.codecs.encodePng(image)
    throwIfAborted(signal)
    if (png.length <= targetBytes) {
      return done(png, {
        format: 'png',
        width: image.width,
        height: image.height,
        quality: 0,
        resized: image.width < display.width,
        converted: false,
        flattenedTransparency: false,
      })
    }
  }

  const output: 'jpeg' | 'webp' = requested === 'webp' ? 'webp' : 'jpeg'
  const flattened = output === 'jpeg' && info.mayHaveAlpha && hasTransparency(image)
  if (flattened) flattenOnWhite(image)
  const encode = output === 'jpeg' ? engine.codecs.encodeJpeg : engine.codecs.encodeWebp

  // Keep only the most recent downscaled copy, to bound memory.
  let cached: { scale: number; image: ImageData } | undefined
  const imageAt = async (scale: number) => {
    if (scale >= 1) return image
    if (cached?.scale !== scale) {
      const size = scaledSize(image.width, image.height, scale)
      cached = { scale, image: await engine.codecs.resize(image, size.width, size.height) }
    }
    return cached.image
  }

  const fit = await fitToSize({
    targetBytes,
    width: image.width,
    height: image.height,
    startScale: Math.min(1, lossyScale / decodeScale),
    encode: async (quality, scale) => encode(await imageAt(scale), quality),
    signal,
    onAttempt: (attempts) => onProgress?.(Math.min(0.95, 0.25 + attempts * 0.1), 'encoding'),
  })
  return done(fit.bytes, {
    format: output,
    width: fit.width,
    height: fit.height,
    quality: fit.quality,
    resized: fit.width < display.width,
    converted: output !== info.format,
    flattenedTransparency: flattened,
  })
}
