/**
 * The Mochifile Tool contract.
 *
 * Every tool is split in two parts so pages stay light:
 *
 * - a **manifest** (`ToolManifest`): plain, serializable data used to generate pages, routes
 *   and SEO metadata. Pages import only the manifest.
 * - a **process function** (`ProcessFn`): the pure function that does the work. It runs
 *   inside a Web Worker and is never imported by pages directly.
 *
 * See `docs/contributing/adding-a-tool.md` and `packages/tools/_template`.
 */
import type { Locale } from '@mochifile/i18n'

export type { Locale }

export const toolCategories = ['image', 'media', 'pdf'] as const
export type ToolCategory = (typeof toolCategories)[number]

/**
 * Where `process()` runs. `browser` tools never upload user files. `server` tools are
 * reserved for work that cannot run client-side and are implemented in the private
 * cloud repository; they must be justified by an ADR.
 */
export const toolRuntimes = ['browser', 'server'] as const
export type ToolRuntime = (typeof toolRuntimes)[number]

export interface ToolLimits {
  /** Maximum number of files per run. */
  maxFiles: number
  /** Maximum size of a single file, in bytes. */
  maxFileSizeBytes: number
  /** Maximum combined size of all files in a run, in bytes. Defaults to no extra limit. */
  maxTotalSizeBytes?: number
}

/** Per-locale metadata used for routing and SEO. */
export interface ToolLocaleMeta {
  /** URL segment, lowercase ASCII kebab-case. Unique per locale across all tools. */
  slug: string
  /** Page `<title>` and H1. At most 70 characters. */
  title: string
  /** Meta description. At most 160 characters. */
  description: string
}

/**
 * Options must survive `structuredClone` (they are posted to a Web Worker), so keep them
 * to plain data: strings, numbers, booleans, arrays and plain objects.
 */
export type ToolOptions = Record<string, unknown>

export interface ToolManifest<O extends ToolOptions = ToolOptions> {
  /** Stable identifier, lowercase kebab-case. Never change it once released. */
  id: string
  category: ToolCategory
  runtime: ToolRuntime
  /** Accepted MIME types. Wildcards like `image/*` are allowed. */
  accepts: readonly string[]
  limits: ToolLimits
  /** Default options; the UI starts from these and `process()` receives them merged. */
  defaults: O
  meta: Record<Locale, ToolLocaleMeta>
}

export interface ToolProgress {
  /** Completion between 0 and 1. */
  ratio: number
  /** Optional machine-readable stage, e.g. `"decoding"`. Translate it in the UI. */
  stage?: string
}

export interface ProcessContext {
  /** Aborted when the user cancels. Long loops must check it and stop promptly. */
  signal: AbortSignal
  onProgress: (progress: ToolProgress) => void
}

export interface ToolResult {
  file: Blob
  /** Suggested download file name. */
  name: string
  /** Non-sensitive facts about the result, e.g. output dimensions. Never file contents. */
  meta?: Record<string, string | number | boolean>
}

/**
 * The work a tool does. Must be pure: no DOM access, no network, no global state, no logging
 * of file contents. Same inputs give equivalent outputs. It runs inside a Web Worker.
 */
export type ProcessFn<O extends ToolOptions = ToolOptions> = (
  files: File[],
  options: O,
  context: ProcessContext,
) => Promise<ToolResult[]>

/** A manifest bundled with its process function. Only ever built inside a worker entry. */
export interface ToolDefinition<O extends ToolOptions = ToolOptions> {
  manifest: ToolManifest<O>
  process: ProcessFn<O>
}
