/**
 * Test-only engine for Node: the real codecs, decoding with the WebAssembly path (the browser
 * paths need a DOM and are covered by end-to-end tests).
 */
import type { ImageEngine } from '../compress.ts'
import { decodeImage } from '../decode.ts'
import { loadNodeCodecs } from './node-codecs.ts'

export async function createNodeEngine(): Promise<ImageEngine> {
  const codecs = await loadNodeCodecs()
  return {
    codecs,
    decode: (bytes, info, target) => decodeImage({ path: 'wasm', bytes, info, target, codecs }),
  }
}
