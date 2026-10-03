import { manifest as templateManifest } from '@mochifile/tool-template/manifest'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * Mobile fold rule (ADR 0020): on a 390 × 844 phone, every tool page and variant, in every
 * language, shows its primary action (`[data-primary-action]`, e.g. "Choose photos") fully on
 * first view, without scrolling. Pages come from the sitemap, so new tools and variants are
 * covered automatically. The template tool is a development example and is skipped.
 */

/** iPhone 13/14 size in CSS pixels. */
const PHONE = { width: 390, height: 844 }

const templateSlugs = new Set(
  [templateManifest.meta, ...(templateManifest.variants ?? []).map((variant) => variant.meta)]
    .flatMap((meta) => Object.values(meta))
    .map((meta) => meta.slug),
)

/** Tool pages of the sitemap: everything but the home pages and the template tool. */
async function toolPaths(request: { get: (url: string) => Promise<{ text(): Promise<string> }> }) {
  const xml = await (await request.get('/sitemap-0.xml')).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1] ?? '').pathname)
    .filter((path) => {
      const slug = path.split('/').filter(Boolean).at(-1)
      return slug !== undefined && slug !== 'pt' && !templateSlugs.has(slug)
    })
}

test('the primary action is fully visible on first view, on every tool page', async ({
  testBrowser,
  request,
}) => {
  test.setTimeout(120_000)
  const paths = await toolPaths(request)
  // Both languages of compress-image and its variants, at least.
  expect(paths.filter((path) => path.startsWith('/pt/')).length).toBeGreaterThanOrEqual(2)
  expect(paths.filter((path) => !path.startsWith('/pt/')).length).toBeGreaterThanOrEqual(2)

  const failures: string[] = []
  for (const path of paths) {
    // The browser's language matches the page, so no language suggestion is shown.
    const locale = path.startsWith('/pt/') ? 'pt-BR' : 'en-US'
    const context = await testBrowser.newContext({
      ...projectContextOptions(),
      viewport: PHONE,
      locale,
    })
    try {
      const page = await context.newPage()
      await page.goto(path)
      const action = page.locator('[data-primary-action]')
      await expect(action).toHaveCount(1)
      await expect(action).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      const scrollY = await page.evaluate(() => window.scrollY)
      const box = await action.boundingBox()
      if (!box) throw new Error(`${path}: no box`)
      const bottom = Math.ceil(box.y + box.height)
      const hit = await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-primary-action]')),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
      if (scrollY !== 0 || box.y < 0 || bottom > PHONE.height || box.x < 0 || !hit) {
        failures.push(`${path}: top ${Math.floor(box.y)}, bottom ${bottom}, reachable ${hit}`)
      }
    } finally {
      await context.close()
    }
  }
  expect(failures, `primary action not fully on screen at ${PHONE.width}×${PHONE.height}`).toEqual(
    [],
  )
})
