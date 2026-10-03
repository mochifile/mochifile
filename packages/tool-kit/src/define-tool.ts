import type { PrepareFn, ProcessFn, ToolDefinition, ToolManifest, ToolOptions } from './contract.ts'

/**
 * Pairs a manifest with its process function, and optionally a `prepare` hook. Use it in the
 * tool's worker entry only.
 */
export function defineTool<O extends ToolOptions>(
  manifest: ToolManifest<O>,
  process: ProcessFn<O>,
  { prepare }: { prepare?: PrepareFn } = {},
): ToolDefinition<O> {
  return prepare ? { manifest, process, prepare } : { manifest, process }
}
