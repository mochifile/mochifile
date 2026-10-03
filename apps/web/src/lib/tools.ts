import { type Locale, localePath, locales } from '@mochifile/i18n'
import {
  assertUniqueTools,
  MAIN_PAGE_KEY,
  type ToolLocaleMeta,
  type ToolManifest,
  type ToolVariant,
} from '@mochifile/tool-kit'

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
  includeTemplate: import.meta.env.DEV || import.meta.env.MOCHIFILE_INCLUDE_TEMPLATE,
})

/** One page of a tool: its main page or one of its variants. */
export interface ToolPage {
  tool: RegisteredTool
  /** `index` for the main page, otherwise the variant key. Also names the content file. */
  key: string
  /** The variant shown on this page, or `null` on the main page. */
  variant: ToolVariant | null
  meta: Record<Locale, ToolLocaleMeta>
  /** Path of this page in every locale, for hreflang and the language switcher. */
  paths: Record<Locale, string>
}

export interface ToolPageProps {
  page: ToolPage
  locale: Locale
}

function pathsOf(meta: Record<Locale, ToolLocaleMeta>): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, localePath(locale, meta[locale].slug)]),
  ) as Record<Locale, string>
}

export function toolPaths(manifest: ToolManifest): Record<Locale, string> {
  return pathsOf(manifest.meta)
}

/** The main page of every tool, each followed by its variants, in a stable order. */
export function toolPages(registered: readonly RegisteredTool[]): ToolPage[] {
  return registered.flatMap((tool) => [
    {
      tool,
      key: MAIN_PAGE_KEY,
      variant: null,
      meta: tool.manifest.meta,
      paths: pathsOf(tool.manifest.meta),
    },
    ...(tool.manifest.variants ?? []).map((variant) => ({
      tool,
      key: variant.key,
      variant,
      meta: variant.meta,
      paths: pathsOf(variant.meta),
    })),
  ])
}

/** `getStaticPaths()` entries for one locale's `[tool].astro` route. */
export function buildToolRoutes(registered: readonly RegisteredTool[], locale: Locale) {
  return toolPages(registered).map((page) => ({
    params: { tool: page.meta[locale].slug },
    props: { page, locale } satisfies ToolPageProps,
  }))
}

/** Id of a page's long-form copy in the `toolContent` collection: `<dir>/<locale>/<key>`. */
export function contentId(page: Pick<ToolPage, 'tool' | 'key'>, locale: Locale): string {
  return `${page.tool.dir}/${locale}/${page.key}`
}

/**
 * Throws, listing every gap, unless each page has its copy in every locale. Called while
 * building the routes, so a missing translation fails the build instead of shipping a page
 * without content.
 */
export function assertContentComplete(
  pages: readonly ToolPage[],
  available: ReadonlySet<string>,
): void {
  const missing = pages.flatMap((page) =>
    locales.map((locale) => contentId(page, locale)).filter((id) => !available.has(id)),
  )
  if (missing.length > 0) {
    throw new Error(
      `Missing tool page content (packages/tools/<dir>/content/<locale>/<key>.md):\n- ${missing.join('\n- ')}`,
    )
  }
}
