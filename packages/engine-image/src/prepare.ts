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

export { type NavigatorLike, shouldPreloadOnIdle } from './preload-policy.ts'
