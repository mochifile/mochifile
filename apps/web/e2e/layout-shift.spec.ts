import { expect, projectContextOptions, test } from './fixtures.ts'
import { readLayoutShifts, recordLayoutShifts } from './layout-shifts.ts'
import { PHONES, toolPaths } from './tool-pages.ts'

/**
 * No layout shift while a tool page loads on a phone: the tool panel reserves the space of the
 * client-only tool (`tool-reserve`) and the self-hosted fonts swap from metric-matched
 * fallbacks. Every tool page and variant, in every language, at each phone size.
 */

for (const PHONE of PHONES) {
  test(`tool pages do not shift while loading (${PHONE.width}×${PHONE.height})`, async ({
    testBrowser,
    browserName,
    request,
  }) => {
    test.skip(browserName !== 'chromium', 'layout-shift entries exist only in Chromium')
    test.setTimeout(120_000)
    const failures: string[] = []
    for (const path of await toolPaths(request)) {
      const locale = path.startsWith('/pt/') ? 'pt-BR' : 'en-US'
      const context = await testBrowser.newContext({
        ...projectContextOptions(),
        viewport: PHONE,
        locale,
      })
      try {
        const page = await context.newPage()
        await recordLayoutShifts(page)
        await page.goto(path)
        await page.locator('[data-primary-action]').waitFor()
        await page.evaluate(() => document.fonts.ready)
        // Let any late layout (fonts, the island) settle before reading the entries.
        await page.waitForTimeout(500)
        const { total, moved } = await readLayoutShifts(page)
        if (total > 0) failures.push(`${path}: ${total.toFixed(4)} (${moved})`)
      } finally {
        await context.close()
      }
    }
    expect(failures, 'cumulative layout shift while loading').toEqual([])
  })
}
