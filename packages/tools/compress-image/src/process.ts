import {
  compressToTarget,
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
import type { CompressImageOptions } from './manifest.ts'
import { MAX_TARGET, MIN_TARGET, sizeSuffix } from './sizes.ts'

const MIME: Record<EncodableFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const EXTENSION: Record<EncodableFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

/** `IMG_1.JPG` → `IMG_1-50kb.JPG`; the extension changes only with the format. */
export function outputName(
  name: string,
  targetBytes: number,
  from: ImageFormat,
  to: EncodableFormat,
) {
  const ext = from === to && splitFileName(name).ext ? undefined : EXTENSION[to]
  return renameFile(name, { suffix: sizeSuffix(targetBytes), ...(ext ? { ext } : {}) })
}

/**
 * Compresses each file to at most `targetBytes`. The engine (codecs and decoder) is injected:
 * the worker passes the browser engine, tests a Node one. Pure otherwise: no DOM, no network,
 * no logging.
 */
export function createProcess(
  getEngine: () => Promise<ImageEngine>,
): ProcessFn<CompressImageOptions> {
  return async (files, options, { signal, onProgress }) => {
    const { targetBytes, format } = options
    if (!(targetBytes >= MIN_TARGET && targetBytes <= MAX_TARGET)) {
      throw new ToolError('processing-failed', 'targetBytes out of range')
    }
    const engine = await getEngine()
    const results: ToolResult[] = []
    for (const [index, file] of files.entries()) {
      const { bytes, meta } = await compressToTarget(
        file,
        { targetBytes, format },
        {
          engine,
          signal,
          onProgress: (ratio, stage) =>
            onProgress({ ratio: (index + ratio) / files.length, stage }),
        },
      )
      results.push({
        file: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[meta.format] }),
        name: outputName(file.name, targetBytes, meta.originalFormat, meta.format),
        meta: { ...meta },
      })
      onProgress({ ratio: (index + 1) / files.length })
    }
    return results
  }
}
