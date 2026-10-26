import {
  convertImage,
  type EncodableFormat,
  type ImageEngine,
  type ImageFormat,
} from '@mochifile/engine-image'
import {
  type ProcessFn,
  renameFile,
  splitFileName,
  ToolError,
  type ToolResult,
} from '@mochifile/tool-kit'
import type { ConvertImageOptions } from './manifest.ts'

const MIME: Record<EncodableFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const EXTENSION: Record<EncodableFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/**
 * `IMG_1.HEIC` → `IMG_1.jpg`. A file that is already in the wanted format keeps its own
 * extension (`.jpeg` stays `.jpeg`), since it was not re-encoded.
 */
export function outputName(name: string, from: ImageFormat, to: EncodableFormat) {
  const keep = from === to && splitFileName(name).ext
  return renameFile(name, keep ? {} : { ext: EXTENSION[to] })
}

/**
 * Converts each file to `options.format`. The engine (codecs and decoders) is injected: the
 * worker passes the browser engine, tests a Node one. Pure otherwise: no DOM, no network, no
 * logging.
 */
export function createProcess(
  getEngine: () => Promise<ImageEngine>,
): ProcessFn<ConvertImageOptions> {
  return async (files, options, { signal, onProgress }) => {
    const { format } = options
    if (!(format in MIME)) throw new ToolError('processing-failed', 'unknown output format')
    const engine = await getEngine()
    const results: ToolResult[] = []
    for (const [index, file] of files.entries()) {
      const { bytes, meta } = await convertImage(
        file,
        { format },
        {
          engine,
          signal,
          onProgress: (ratio, stage) =>
            onProgress({ ratio: (index + ratio) / files.length, stage }),
        },
      )
      results.push({
        file: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[meta.format] }),
        name: outputName(file.name, meta.originalFormat, meta.format),
        meta: { ...meta },
      })
      onProgress({ ratio: (index + 1) / files.length })
    }
    return results
  }
}
