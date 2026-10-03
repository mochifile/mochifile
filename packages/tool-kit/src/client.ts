/**
 * UI side of a tool. Runs a tool in a Web Worker and turns the worker protocol back into a
 * plain promise. The worker is created lazily on the first run and reused afterwards.
 *
 * ```ts
 * const client = createToolClient(manifest, () =>
 *   new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
 * )
 * const results = await client.run(files, options, { signal, onProgress })
 * ```
 */
import { type Endpoint, proxy, type Remote, releaseProxy, wrap } from 'comlink'
import type { ToolManifest, ToolOptions, ToolProgress, ToolResult } from './contract.ts'
import { deserializeError, ToolError } from './errors.ts'
import { validateFiles } from './files.ts'
import type { ToolWorkerApi } from './protocol.ts'

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: (progress: ToolProgress) => void
}

export interface ToolClient<O extends ToolOptions> {
  run(files: File[], options?: Partial<O>, runOptions?: RunOptions): Promise<ToolResult[]>
  /**
   * Starts the worker and runs the tool's `prepare` hook (e.g. loads WebAssembly). Call it on
   * the first sign of intent so no request happens after the user picks a file. Safe to call
   * repeatedly; a failed preparation can be retried.
   */
  prepare(): Promise<void>
  /** Terminates the worker. A later `run()` starts a fresh one. */
  dispose(): void
}

type WorkerLike = Endpoint & { terminate?: () => void }

let jobCounter = 0

export function createToolClient<O extends ToolOptions>(
  manifest: ToolManifest<O>,
  createWorker: () => WorkerLike,
): ToolClient<O> {
  let worker: WorkerLike | undefined
  let remote: Remote<ToolWorkerApi> | undefined
  let preparing: Promise<void> | undefined

  const connect = () => {
    if (!remote) {
      worker = createWorker()
      remote = wrap<ToolWorkerApi>(worker)
    }
    return remote
  }

  return {
    prepare() {
      preparing ??= connect()
        .prepare()
        .then((outcome) => {
          if (!outcome.ok) throw deserializeError(outcome.error)
        })
        .catch((error: unknown) => {
          preparing = undefined
          throw error
        })
      return preparing
    },
    async run(files, options = {}, { signal, onProgress } = {}) {
      // Validate before posting anything, for instant feedback. The worker validates again.
      validateFiles(files, manifest)
      if (signal?.aborted) throw new ToolError('aborted', 'Aborted')

      const api = connect()
      jobCounter += 1
      const jobId = `job-${jobCounter}`
      const onAbort = () => void api.abort(jobId)
      signal?.addEventListener('abort', onAbort, { once: true })
      // The worker delivers all progress before the result. This guard also drops anything a
      // misbehaving tool reports later, so callers never see progress after `run()` settles.
      let settled = false
      const reportProgress = proxy((progress: ToolProgress) => {
        if (!settled) onProgress?.(progress)
      })
      try {
        const outcome = await api.run(jobId, files, options as ToolOptions, reportProgress)
        if (!outcome.ok) throw deserializeError(outcome.error)
        return outcome.results
      } finally {
        settled = true
        signal?.removeEventListener('abort', onAbort)
      }
    },
    dispose() {
      remote?.[releaseProxy]()
      worker?.terminate?.()
      remote = undefined
      worker = undefined
      preparing = undefined
    },
  }
}
