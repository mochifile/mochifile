import type { ToolOptions, ToolProgress, ToolResult } from './contract.ts'
import type { SerializedToolError } from './errors.ts'

/** Outcome of a run, posted back from the worker. Errors travel as data, not exceptions. */
export type RunOutcome =
  | { ok: true; results: ToolResult[] }
  | { ok: false; error: SerializedToolError }

/** Outcome of `prepare()`, posted back from the worker. */
export type PrepareOutcome = { ok: true } | { ok: false; error: SerializedToolError }

/** The API a tool worker exposes through Comlink. Internal to `@mochifile/tool-kit`. */
/** Options arrive as plain data and are merged with the manifest defaults in the worker. */
export interface ToolWorkerApi {
  run(
    jobId: string,
    files: File[],
    options: ToolOptions,
    /** Through Comlink this returns a promise that settles once the UI has received it. */
    onProgress: (progress: ToolProgress) => void | Promise<void>,
  ): Promise<RunOutcome>
  abort(jobId: string): void
  /** Runs the tool's `prepare` hook once; later calls share the result. */
  prepare(): Promise<PrepareOutcome>
}
