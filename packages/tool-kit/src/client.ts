/**
 * UI side of a tool. Runs a tool in a Web Worker and turns the worker protocol back into a
 * plain promise. The worker is created lazily on the first run and reused afterwards.
 *
 * ```ts
 * const client = createToolClient(config, () =>
 *   new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
 * )
 * const results = await client.run(files, options, { signal, onProgress })
 * ```
 */
import { type Endpoint, proxy, type Remote, releaseProxy, wrap } from 'comlink'
import type { ToolOptions, ToolProgress, ToolResult, ToolRuntimeConfig } from './contract.ts'
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
   * repeatedly; a failed preparation can be retried. Rejects, as `run()` does, if the worker
   * itself fails (its script could not be loaded, or it crashed).
   */
  prepare(): Promise<void>
  /** Terminates the worker; calls still running reject as aborted. A later call starts a fresh one. */
  dispose(): void
}

type WorkerLike = Endpoint & { terminate?: () => void }

let jobCounter = 0

export function createToolClient<O extends ToolOptions>(
  config: ToolRuntimeConfig<O>,
  createWorker: () => WorkerLike,
): ToolClient<O> {
  let worker: WorkerLike | undefined
  let remote: Remote<ToolWorkerApi> | undefined
  /** Rejects when the current worker fails or is discarded; every call races with it. */
  let failed: Promise<never> | undefined
  let fail: ((reason: unknown) => void) | undefined
  let preparing: Promise<void> | undefined

  /** Discards the worker. Calls still waiting on it reject with `reason`. */
  const dispose = (reason: unknown = new ToolError('aborted', 'The tool was disposed')) => {
    fail?.(reason)
    remote?.[releaseProxy]()
    worker?.terminate?.()
    remote = undefined
    worker = undefined
    failed = undefined
    fail = undefined
    preparing = undefined
  }

  const connect = () => {
    if (!remote || !failed) {
      const created = createWorker()
      worker = created
      remote = wrap<ToolWorkerApi>(created)
      failed = new Promise<never>((_resolve, reject) => {
        fail = reject
      })
      // Observed through the calls that race with it; never an unhandled rejection on its own.
      failed.catch(() => {})
      // comlink never settles a call when the worker itself fails, as when its script cannot be
      // fetched: the `error` event rejects pending calls instead, and the next call starts a
      // fresh worker.
      created.addEventListener(
        'error',
        () => {
          if (worker === created) {
            dispose(new ToolError('processing-failed', 'The worker failed to start or crashed'))
          }
        },
        { once: true },
      )
    }
    return { api: remote, failed }
  }

  return {
    prepare() {
      if (!preparing) {
        const { api, failed: workerFailed } = connect()
        const attempt: Promise<void> = Promise.race([
          api.prepare().then((outcome) => {
            if (!outcome.ok) throw deserializeError(outcome.error)
          }),
          workerFailed,
        ]).catch((error: unknown) => {
          // A worker whose preparation failed may keep failed loads cached (WebAssembly
          // modules, for one), so trying again starts a fresh worker.
          if (preparing === attempt) dispose(error)
          throw error
        })
        preparing = attempt
      }
      return preparing
    },
    async run(files, options = {}, { signal, onProgress } = {}) {
      // Validate before posting anything, for instant feedback. The worker validates again.
      validateFiles(files, config)
      if (signal?.aborted) throw new ToolError('aborted', 'Aborted')

      const { api, failed: workerFailed } = connect()
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
        const outcome = await Promise.race([
          api.run(jobId, files, options as ToolOptions, reportProgress),
          workerFailed,
        ])
        if (!outcome.ok) throw deserializeError(outcome.error)
        return outcome.results
      } finally {
        settled = true
        signal?.removeEventListener('abort', onAbort)
      }
    },
    dispose: () => dispose(),
  }
}
