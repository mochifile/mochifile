/**
 * Creating the engine in the browser: choose the decode path with probes and load every codec
 * the session can need, so nothing is fetched after the user picks a file (ADR 0016).
 */
import { loadCodecs } from './codecs.ts'
import type { ImageEngine } from './compress.ts'
import { chooseDecodePath, type DecodePath, decodeImage } from './decode.ts'

export interface BrowserEngine extends ImageEngine {
  decodePath: DecodePath
}

/** Runs the probes and loads the codecs. Call once per worker (e.g. from a tool's `prepare`). */
export async function createBrowserEngine(): Promise<BrowserEngine> {
  const decodePath = await chooseDecodePath()
  const codecs = await loadCodecs({ decoders: decodePath === 'wasm' })
  return {
    decodePath,
    codecs,
    decode: (bytes, info, target) => decodeImage({ path: decodePath, bytes, info, target, codecs }),
  }
}

/** The parts of `navigator` the idle-preload policy reads. */
export interface NavigatorLike {
  connection?: { saveData?: boolean; effectiveType?: string }
}

/**
 * Whether to preload the engine (~300 KB of WebAssembly) while the page is idle, before any
 * sign of intent. Not on connections where the visitor asked to save data or that are very
 * slow. Browsers without the Network Information API (Safari, Firefox) preload. Preloading on
 * intent (pointer, focus, touch, drag on the tool) always happens regardless (ADR 0016).
 */
export function shouldPreloadOnIdle(navigator: NavigatorLike): boolean {
  const connection = navigator.connection
  if (!connection) return true
  if (connection.saveData === true) return false
  return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g'
}
