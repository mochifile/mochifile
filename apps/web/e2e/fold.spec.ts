import { expect, projectContextOptions, test } from './fixtures.ts'
import { PHONES, toolPaths } from './tool-pages.ts'

/**
 * Mobile fold rule (ADR 0020): on common phones (390 × 844, and 360 × 800, the most common
 * Android size), every tool page and variant, in every language, shows its primary action
 * (`[data-primary-action]`, e.g. "Choose photos") fully on first view, without scrolling.
 * Pages come from the sitemap (see tool-pages.ts).
 */

for (const PHONE of PHONES) {
  test(`the primary action is fully visible on first view, on every tool page (${PHONE.width}×${PHONE.height})`, async ({
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
    expect(
      failures,
      `primary action not fully on screen at ${PHONE.width}×${PHONE.height}`,
    ).toEqual([])
  })
}
