/**
 * Worker entry. The UI starts it with
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
 * Keep this file tiny: it only wires the manifest and process function together.
 */
import { defineTool } from '@mochifile/tool-kit'
import { exposeTool } from '@mochifile/tool-kit/worker'
import { manifest } from './manifest.ts'
import { processFiles } from './process.ts'

exposeTool(defineTool(manifest, processFiles))
