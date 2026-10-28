import { expect, projectContextOptions, test } from './fixtures.ts'
import { PHONES, toolPaths } from './tool-pages.ts'

/**
 * Mobile fold rule: on common phones (390 × 844, and 360 × 800, the most common Android size),
 * every tool page and variant, in every language, shows the start of its tool panel on first
 * view, without scrolling: its first option, fully, and the tool's primary action
 * (`[data-primary-action]`, e.g. "Choose photos") in the page. In the V2 design the options
 * come first and the drop area follows them, so on a phone "Choose photos" sits below the fold
 * by design (screenshots/mobile/04-tool-compress-image.png); the rule is that the panel starts
 * in the first view and nothing before it grows. Pages come from the sitemap (see tool-pages.ts).
 */

for (const PHONE of PHONES) {
  test(`the tool panel starts on first view, on every tool page (${PHONE.width}×${PHONE.height})`, async ({
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
        await expect(page.locator('[data-primary-action]')).toHaveCount(1)
        // The panel's first option: the selected chip of the first group.
        const action = page
          .locator('.tool-reserve label')
          .filter({ has: page.locator('input:checked') })
          .first()
        await expect(action).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const scrollY = await page.evaluate(() => window.scrollY)
        const box = await action.boundingBox()
        if (!box) throw new Error(`${path}: no box`)
        const bottom = Math.ceil(box.y + box.height)
        const hit = await action.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== null
        })
        if (scrollY !== 0 || box.y < 0 || bottom > PHONE.height || box.x < 0 || !hit) {
          failures.push(`${path}: top ${Math.floor(box.y)}, bottom ${bottom}, reachable ${hit}`)
        }
      } finally {
        await context.close()
      }
    }
    expect(failures, `panel start not fully on screen at ${PHONE.width}×${PHONE.height}`).toEqual(
      [],
    )
  })
}
