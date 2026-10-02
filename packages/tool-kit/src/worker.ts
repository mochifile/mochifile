/**
 * Worker side of a tool. Import this only from a tool's worker entry:
 *
 * ```ts
 * import { exposeTool } from '@mochifile/tool-kit/worker'
 * exposeTool(defineTool(manifest, process))
 * ```
 */
import { type Endpoint, expose } from 'comlink'
import type { ToolDefinition, ToolOptions, ToolProgress } from './contract.ts'
import { serializeError } from './errors.ts'
import { validateFiles } from './files.ts'
import type { RunOutcome, ToolWorkerApi } from './protocol.ts'

/** Builds the worker API for a tool. Exported separately so it can be tested without a worker. */
export function createWorkerApi<O extends ToolOptions>(tool: ToolDefinition<O>): ToolWorkerApi {
  const jobs = new Map<string, AbortController>()

  return {
    async run(jobId, files, options, onProgress): Promise<RunOutcome> {
      const controller = new AbortController()
      jobs.set(jobId, controller)
      // Progress is posted on its own MessagePort, which is not ordered with the result.
      // Track delivery so the result is only sent once every progress update has arrived.
      const inFlight = new Set<Promise<void>>()
      const report = (progress: ToolProgress) => {
        const delivery = Promise.resolve(
          onProgress({ ...progress, ratio: Math.min(1, Math.max(0, progress.ratio)) }),
        ).catch(() => {})
        inFlight.add(delivery)
        void delivery.finally(() => inFlight.delete(delivery))
      }
      try {
        validateFiles(files, tool.manifest)
        const merged = { ...tool.manifest.defaults, ...options } as O
        const results = await tool.process(files, merged, {
          signal: controller.signal,
          onProgress: report,
        })
        await Promise.all(inFlight)
        if (controller.signal.aborted)
          return { ok: false, error: { code: 'aborted', message: 'Aborted' } }
        return { ok: true, results }
      } catch (error) {
        if (controller.signal.aborted)
          return { ok: false, error: { code: 'aborted', message: 'Aborted' } }
        return { ok: false, error: serializeError(error) }
      } finally {
        jobs.delete(jobId)
      }
    },
    abort(jobId) {
      jobs.get(jobId)?.abort()
    },
  }
}

/** Exposes a tool over Comlink. Defaults to the current worker global scope. */
export function exposeTool<O extends ToolOptions>(
  tool: ToolDefinition<O>,
  endpoint: Endpoint = globalThis as unknown as Endpoint,
): void {
  expose(createWorkerApi(tool), endpoint)
}
