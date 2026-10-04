/**
 * Worker entry. The UI starts it with
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
 * The engine is created once per worker: `prepare` (called on the first sign of intent)
 * loads every codec, so nothing is fetched after a file is chosen. HEIC and AVIF are probed
 * natively first; the wasm decoders load only where the browser cannot read them (ADR 0022).
 */
import { type BrowserEngine, createBrowserEngine } from '@mochifile/engine-image'
import { defineTool } from '@mochifile/tool-kit'
import { exposeTool } from '@mochifile/tool-kit/worker'
import { manifest } from './manifest.ts'
import { createProcess } from './process.ts'

let engine: Promise<BrowserEngine> | undefined
const getEngine = () => {
  engine ??= createBrowserEngine({ extraFormats: ['heic', 'avif'] }).catch((error: unknown) => {
    engine = undefined
    throw error
  })
  return engine
}

exposeTool(
  defineTool(manifest, createProcess(getEngine), {
    prepare: async () => {
      await getEngine()
    },
  }),
)
