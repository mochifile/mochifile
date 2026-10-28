import { glob } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { type Locale, localePath, locales } from '@mochifile/i18n'
import { MAIN_PAGE_KEY, type ToolManifest } from '@mochifile/tool-kit'
import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { pageIds, pageSlugs } from '../src/lib/pages.ts'

/**
 * Tool pages for checks that must hold on every page: they come from the sitemap, so new
 * tools and variants are covered automatically. The template tool is a development example
 * and is skipped.
 */

/** Phone sizes in CSS pixels: iPhone 13/14, and the most common Android viewport. */
export const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const

const templateSlugs = new Set(
  [templateManifest.meta, ...(templateManifest.variants ?? []).map((variant) => variant.meta)]
    .flatMap((meta) => Object.values(meta))
    .map((meta) => meta.slug),
)

/** Slugs of the institutional pages (About, Contact…): in the sitemap, but not tools. */
const institutionalSlugs = new Set(pageIds.flatMap((id) => Object.values(pageSlugs[id])))

/**
 * Tool pages of the sitemap: everything but the home pages, the institutional pages and the
 * template tool.
 */
export async function toolPaths(request: {
  get: (url: string) => Promise<{ text(): Promise<string> }>
}) {
  const xml = await (await request.get('/sitemap-0.xml')).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1] ?? '').pathname)
    .filter((path) => {
      const slug = path.split('/').filter(Boolean).at(-1)
      return (
        slug !== undefined &&
        slug !== 'pt' &&
        !templateSlugs.has(slug) &&
        !institutionalSlugs.has(slug)
      )
    })
}

const TOOLS_DIR = fileURLToPath(new URL('../../../packages/tools/', import.meta.url))

/** A tool page in one locale and the Markdown file its copy comes from. */
export interface PageCopySource {
  path: string
  locale: Locale
  /** `<tool dir>/<page key>`, the same in every locale. */
  page: string
  file: string
}

/**
 * Every tool page, including the template tool's, with its copy file
 * (`packages/tools/<dir>/content/<locale>/<key>.md`), read from the tools' manifests like the
 * site's registry does, so new tools are covered automatically.
 */
export async function pageCopySources(): Promise<PageCopySource[]> {
  const sources: PageCopySource[] = []
  for await (const manifestPath of glob('*/src/manifest.ts', { cwd: TOOLS_DIR })) {
    const dir = manifestPath.split('/')[0] ?? ''
    const { manifest } = (await import(pathToFileURL(join(TOOLS_DIR, manifestPath)).href)) as {
      manifest: ToolManifest
    }
    const pages = [
      { key: MAIN_PAGE_KEY, meta: manifest.meta },
      ...(manifest.variants ?? []).map((variant) => ({ key: variant.key, meta: variant.meta })),
    ]
    for (const { key, meta } of pages) {
      for (const locale of locales) {
        sources.push({
          path: localePath(locale, meta[locale].slug),
          locale,
          page: `${dir}/${key}`,
          file: join(TOOLS_DIR, dir, 'content', locale, `${key}.md`),
        })
      }
    }
  }
  return sources
}
