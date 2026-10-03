/**
 * Finds the best lossy encoding of an image that is at most `targetBytes` (ADR 0017).
 *
 * At each scale it tries the maximum quality, then the minimum. If even the minimum quality is
 * too big, it shrinks the image and tries again. Otherwise it searches the quality between the
 * two by interpolating on log(size), which converges in a few encodes because file size grows
 * roughly exponentially with quality. Only encodings that were measured to fit are ever
 * returned, so the result is guaranteed to be at or below the target.
 *
 * Pure and codec-agnostic: the caller supplies `encode(quality, scale)`.
 */
import { ToolError, throwIfAborted } from '@mochifile/tool-kit'

export interface QualityRange {
  min: number
  max: number
}

/** Below 40, JPEG and WebP artifacts get distracting; shrinking the image looks better. */
export const DEFAULT_QUALITY: QualityRange = { min: 40, max: 90 }
/** Results never get smaller than this on their longest side. */
export const MIN_LONG_SIDE = 64
/**
 * How file size grows with pixel count at a fixed quality: size ∝ pixels^0.75. Smaller copies
 * of a photo pack more detail into each pixel, so size falls slower than pixel count
 * (measured 0.70–0.83 with mozjpeg on the test photos).
 */
export const SIZE_PIXEL_EXPONENT = 0.75
/** A downscale aims the minimum quality at this share of the target. */
const TARGET_MARGIN = 0.92
/** The search stops once a result uses this share of the target: closer is not visible. */
export const CLOSE_ENOUGH = 0.97
/** Measured encodes per scale, including the min and max probes. */
export const MAX_ENCODES_PER_SCALE = 7

export interface FitToSizeOptions {
  targetBytes: number
  /** Size of the image at scale 1. */
  width: number
  height: number
  /** Encodes the image scaled by `scale` (0 < scale ≤ 1) at `quality` (integer). */
  encode: (quality: number, scale: number) => Promise<Uint8Array>
  /** Scale to start from (≤ 1). See `estimateStartScale()`. */
  startScale?: number
  /**
   * Predicted sizes at the start scale, at the minimum and maximum quality (e.g. from a
   * small preview). They only let the search skip encodes that are predicted to fail or
   * fit; results are always measured.
   */
  predicted?: { low?: number; high?: number }
  quality?: QualityRange
  minLongSide?: number
  signal: AbortSignal
  /** Called after each encode with the number of encodes so far. */
  onAttempt?: (attempts: number) => void
}

export interface FitToSizeResult {
  bytes: Uint8Array
  quality: number
  scale: number
  width: number
  height: number
  attempts: number
}

/** Pixel size at a scale. Never 0, never larger than the original. */
export function scaledSize(width: number, height: number, scale: number) {
  return {
    width: Math.min(width, Math.max(1, Math.round(width * scale))),
    height: Math.min(height, Math.max(1, Math.round(height * scale))),
  }
}

/**
 * Largest scale worth trying first. `minBitsPerPixel` is a deliberately low bound on what a
 * photo needs at minimum quality (0.05 bits per pixel), so this only skips encodes that are
 * certain to be too big; it never shrinks an image that could have fit.
 */
export function estimateStartScale({
  pixels,
  targetBytes,
  maxPixels = Number.POSITIVE_INFINITY,
  minBitsPerPixel = 0.05,
}: {
  pixels: number
  targetBytes: number
  maxPixels?: number
  minBitsPerPixel?: number
}): number {
  const byTarget = Math.sqrt((targetBytes * 8) / minBitsPerPixel / pixels)
  const byMemory = Math.sqrt(maxPixels / pixels)
  return Math.min(1, byTarget, byMemory)
}

export async function fitToSize(options: FitToSizeOptions): Promise<FitToSizeResult> {
  const {
    targetBytes,
    width,
    height,
    encode,
    signal,
    onAttempt,
    quality: { min: qMin, max: qMax } = DEFAULT_QUALITY,
    minLongSide = MIN_LONG_SIDE,
  } = options
  const longSide = Math.max(width, height)
  // Never shrink below the floor, unless the image is already smaller than it.
  const minScale = Math.min(1, minLongSide / longSide)
  let scale = Math.max(minScale, Math.min(1, options.startScale ?? 1))
  let attempts = 0
  let smallest = Number.POSITIVE_INFINITY

  const tryEncode = async (q: number) => {
    throwIfAborted(signal)
    const bytes = await encode(q, scale)
    attempts += 1
    onAttempt?.(attempts)
    smallest = Math.min(smallest, bytes.length)
    return bytes
  }
  const result = (bytes: Uint8Array, q: number): FitToSizeResult => ({
    bytes,
    quality: q,
    scale,
    ...scaledSize(width, height, scale),
    attempts,
  })

  const area = (at: number) => {
    const size = scaledSize(width, height, at)
    return size.width * size.height
  }
  // Sizes at qMin and qMax carried over from the previous scale.
  let predicted: { low?: number; high?: number } | undefined = options.predicted
  /** Shrinks after the minimum quality was measured too big; false at the floor. */
  const shrink = (lowSize: number, highSize: number) => {
    if (scale <= minScale) return false
    // Aim the minimum quality at a little under the target: pixels must shrink by
    // (target/size)^(1/exponent), so each side by the square root of that.
    const wanted = ((TARGET_MARGIN * targetBytes) / lowSize) ** (1 / (2 * SIZE_PIXEL_EXPONENT))
    const factor = Math.min(0.9, Math.max(0.5, wanted))
    const next = Math.max(minScale, scale * factor)
    const ratio = (area(next) / area(scale)) ** SIZE_PIXEL_EXPONENT
    predicted = { low: lowSize * ratio, high: highSize * ratio }
    scale = next
    return true
  }
  const unreachable = () =>
    new ToolError('target-unreachable', 'Even the smallest result is too big', {
      details: { smallestBytes: smallest },
    })

  for (;;) {
    let best: { bytes: Uint8Array; quality: number } | undefined
    let encodesAtScale = 0
    const measure = async (q: number) => {
      const bytes = await tryEncode(q)
      encodesAtScale += 1
      if (bytes.length <= targetBytes && (!best || q > best.quality)) best = { bytes, quality: q }
      return bytes
    }

    // With predictions (from a preview, or from the previous scale after a shrink), the ends
    // of the quality range are not re-encoded when the outcome is clear: the maximum is far
    // too big, or the minimum comfortably fits. Only measured encodings are ever returned.
    let hi: { q: number; size: number }
    if (predicted?.high !== undefined && predicted.high > targetBytes * 1.1) {
      hi = { q: qMax, size: predicted.high }
    } else {
      const high = await measure(qMax)
      if (high.length <= targetBytes) return result(high, qMax)
      hi = { q: qMax, size: high.length }
    }
    // The search moves `hi`; predictions for a smaller scale need the size at qMax itself.
    const maxQualitySize = hi.size
    let lo: { q: number; size: number }
    let lowMeasured = false
    if (predicted?.low !== undefined && predicted.low < targetBytes * 0.95) {
      lo = { q: qMin, size: predicted.low }
    } else {
      const low = await measure(qMin)
      if (low.length > targetBytes) {
        if (!shrink(low.length, maxQualitySize)) throw unreachable()
        continue
      }
      lo = { q: qMin, size: low.length }
      lowMeasured = true
    }

    // Search between the ends.
    let lastSide: 'lo' | 'hi' | undefined
    let sameSide = 0
    const closeEnough = () => best !== undefined && best.bytes.length >= targetBytes * CLOSE_ENOUGH
    while (hi.q - lo.q > 1 && encodesAtScale < MAX_ENCODES_PER_SCALE && !closeEnough()) {
      // Interpolate on log(size); if the same end keeps moving, bisect instead, so a badly
      // curved size function cannot slow the search down.
      const t =
        (Math.log(targetBytes) - Math.log(lo.size)) / (Math.log(hi.size) - Math.log(lo.size))
      const guess = sameSide >= 2 ? (lo.q + hi.q) / 2 : lo.q + t * (hi.q - lo.q)
      const q = Math.min(hi.q - 1, Math.max(lo.q + 1, Math.round(guess)))
      const bytes = await measure(q)
      const side = bytes.length <= targetBytes ? 'lo' : 'hi'
      sameSide = side === lastSide ? sameSide + 1 : 1
      lastSide = side
      if (side === 'lo') lo = { q, size: bytes.length }
      else hi = { q, size: bytes.length }
    }

    // A predicted minimum that the search never confirmed: measure it now.
    if (!best && !lowMeasured) {
      const low = await measure(qMin)
      if (low.length > targetBytes) {
        if (!shrink(low.length, maxQualitySize)) throw unreachable()
        continue
      }
    }
    if (!best) throw unreachable()
    return result(best.bytes, best.quality)
  }
}
