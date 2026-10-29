import type { ToolRuntimeConfig } from '@mochifile/tool-kit'

/**
 * Options for this tool. Keep them plain data: they are posted to a Web Worker.
 * TODO(new tool): replace with your tool's options.
 */
export interface TemplateOptions extends Record<string, unknown> {
  mode: 'upper' | 'lower'
}

/**
 * What the UI needs at run time: what the tool accepts, its limits and its defaults. `Ui.tsx`
 * imports this, never `manifest.ts`: the manifest is the data of the pages (titles, descriptions,
 * variants in every language) and its validation, and a UI that imports it ships all of that to
 * every visitor of the tool. The manifest is built from this, so there is one source (ADR 0034).
 * TODO(new tool): replace.
 */
export const config: ToolRuntimeConfig<TemplateOptions> = {
  accepts: ['text/plain'],
  limits: {
    maxFiles: 1,
    maxFileSizeBytes: 5 * 1000 * 1000,
  },
  defaults: { mode: 'upper' },
}
