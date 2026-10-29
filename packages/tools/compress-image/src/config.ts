import type { OutputFormat } from '@mochifile/engine-image'
import type { ToolRuntimeConfig } from '@mochifile/tool-kit'

/** Plain data: posted to the worker with every run. */
export interface CompressImageOptions extends Record<string, unknown> {
  /** Maximum size of each result, in bytes (1 KB = 1,000 bytes). */
  targetBytes: number
  /** `original` keeps the input format when it can reach the target. */
  format: OutputFormat
}

/**
 * What the panel needs at run time: what it accepts, its limits and its defaults. `Ui.tsx` imports
 * this, never `manifest.ts`: the manifest is the data of the pages (titles, descriptions and
 * variants in every language) and its validation, and a UI that imports it ships all of that to
 * the browser. The manifest is built from this, so there is one source (ADR 0034).
 */
export const config: ToolRuntimeConfig<CompressImageOptions> = {
  accepts: ['image/jpeg', 'image/png', 'image/webp'],
  limits: {
    maxFiles: 20,
    maxFileSizeBytes: 50_000_000,
  },
  defaults: { targetBytes: 100_000, format: 'original' },
}
