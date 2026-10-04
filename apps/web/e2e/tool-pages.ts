import { manifest as templateManifest } from '@mochifile/tool-template/manifest'

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

/** Tool pages of the sitemap: everything but the home pages and the template tool. */
export async function toolPaths(request: {
  get: (url: string) => Promise<{ text(): Promise<string> }>
}) {
  const xml = await (await request.get('/sitemap-0.xml')).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1] ?? '').pathname)
    .filter((path) => {
      const slug = path.split('/').filter(Boolean).at(-1)
      return slug !== undefined && slug !== 'pt' && !templateSlugs.has(slug)
    })
}
