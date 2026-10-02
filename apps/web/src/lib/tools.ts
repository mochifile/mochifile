import { type Locale, localePath, locales } from '@mochifile/i18n'
import { assertUniqueTools, type ToolManifest } from '@mochifile/tool-kit'

export interface RegisteredTool {
  /** Folder name under `packages/tools/`, used to lazy-load the tool's UI. */
  dir: string
  manifest: ToolManifest
}

/**
 * Tool registry. Every `packages/tools/<dir>/src/manifest.ts` is picked up automatically,
 * so adding a tool never requires touching the site. The `_template` tool is included in
 * development (try it at /template-tool/) and in e2e builds (`MOCHIFILE_INCLUDE_TEMPLATE=true`),
 * never in production.
 */
const modules = import.meta.glob<{ manifest: ToolManifest }>(
  '../../../../packages/tools/*/src/manifest.ts',
  { eager: true },
)

const TEMPLATE_DIR = '_template'

export function loadTools(
  entries: Record<string, { manifest: ToolManifest }>,
  { includeTemplate }: { includeTemplate: boolean },
): RegisteredTool[] {
  const tools = Object.entries(entries)
    .map(([path, mod]) => ({ dir: toolDirOf(path), manifest: mod.manifest }))
    .filter((tool) => includeTemplate || tool.dir !== TEMPLATE_DIR)
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
  assertUniqueTools(tools.map((tool) => tool.manifest))
  return tools
}

/** `.../packages/tools/compress-image/src/manifest.ts` → `compress-image` */
export function toolDirOf(path: string): string {
  const match = /\/tools\/([^/]+)\/src\//.exec(path)
  if (!match?.[1]) throw new Error(`Unexpected tool path: ${path}`)
  return match[1]
}

export const tools = loadTools(modules, {
  includeTemplate: import.meta.env.DEV || process.env.MOCHIFILE_INCLUDE_TEMPLATE === 'true',
})

export interface ToolPageProps {
  tool: RegisteredTool
  locale: Locale
  /** Path of this tool's page in every locale, for hreflang and the language switcher. */
  paths: Record<Locale, string>
}

export function toolPaths(manifest: ToolManifest): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, manifest.meta[locale].slug)]),
  ) as Record<Locale, string>
}

/** `getStaticPaths()` entries for one locale's `[tool].astro` route. */
export function buildToolRoutes(registered: readonly RegisteredTool[], locale: Locale) {
  return registered.map((tool) => ({
    params: { tool: tool.manifest.meta[locale].slug },
    props: { tool, locale, paths: toolPaths(tool.manifest) } satisfies ToolPageProps,
  }))
}
