/**
 * Creating the engine in the browser: choose the decode path with probes and load every codec
 * the session can need, so nothing is fetched after the user picks a file (ADR 0016).
 */
import { loadCodecs } from './codecs.ts'
import type { ImageEngine } from './compress.ts'
import {
  ALWAYS_NATIVE,
  chooseDecodePath,
  type DecodePath,
  decodeImage,
  decoderFor,
  probeNativeDecode,
} from './decode.ts'
import type { ImageFormat } from './sniff.ts'

export interface BrowserEngine extends ImageEngine {
  decodePath: DecodePath
  /** Formats this browser decodes itself; the rest use WebAssembly. */
  nativeFormats: ReadonlySet<ImageFormat>
}

export interface BrowserEngineOptions {
  /**
   * Formats beyond JPEG, PNG and WebP this engine must read (ADR 0022). Each is probed: where
   * the browser decodes it, nothing more is loaded; elsewhere its WebAssembly decoder is.
   */
  extraFormats?: ReadonlyArray<'heic' | 'avif'>
}

/** Runs the probes and loads the codecs. Call once per worker (e.g. from a tool's `prepare`). */
export async function createBrowserEngine({
  extraFormats = [],
}: BrowserEngineOptions = {}): Promise<BrowserEngine> {
  const decodePath = await chooseDecodePath()
  const nativeFormats = new Set(ALWAYS_NATIVE)
  // With a noisy canvas readback (the `wasm` path) no native decode can be trusted.
  if (decodePath !== 'wasm') {
    for (const format of extraFormats) {
      if (await probeNativeDecode(format)) nativeFormats.add(format)
    }
  }
  const codecs = await loadCodecs({
    decoders: decodePath === 'wasm',
    heic: extraFormats.includes('heic') && !nativeFormats.has('heic'),
    avif: extraFormats.includes('avif') && !nativeFormats.has('avif'),
  })
  return {
    decodePath,
    nativeFormats,
    codecs,
    decoderFor: (format) => decoderFor(decodePath, format, nativeFormats),
    decode: (bytes, info, target) =>
      decodeImage({ path: decodePath, bytes, info, target, codecs, nativeFormats }),
  }
}

export { type NavigatorLike, shouldPreloadOnIdle } from './preload-policy.ts'
