import { type ProcessFn, renameFile, throwIfAborted } from '@mochifile/tool-kit'
import type { TemplateOptions } from './manifest.ts'

/**
 * The tool's work. It runs inside a Web Worker and must stay pure: no DOM, no network,
 * no logging of file contents. Check `signal` regularly and report progress.
 *
 * TODO(new tool): replace with the real processing (e.g. call a WebAssembly engine).
 */
export const processFiles: ProcessFn<TemplateOptions> = async (
  files,
  options,
  { signal, onProgress },
) => {
  const results = []
  for (const [index, file] of files.entries()) {
    throwIfAborted(signal)
    const text = await file.text()
    throwIfAborted(signal)
    const output = options.mode === 'upper' ? text.toUpperCase() : text.toLowerCase()
    results.push({
      file: new Blob([output], { type: 'text/plain' }),
      name: renameFile(file.name, { suffix: options.mode === 'upper' ? 'upper' : 'lower' }),
      meta: { characters: output.length },
    })
    onProgress({ ratio: (index + 1) / files.length })
  }
  return results
}
