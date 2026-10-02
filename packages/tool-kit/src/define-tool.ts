import type { ProcessFn, ToolDefinition, ToolManifest, ToolOptions } from './contract.ts'

/** Pairs a manifest with its process function. Use it in the tool's worker entry only. */
export function defineTool<O extends ToolOptions>(
  manifest: ToolManifest<O>,
  process: ProcessFn<O>,
): ToolDefinition<O> {
  return { manifest, process }
}
