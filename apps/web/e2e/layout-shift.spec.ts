import { expect, projectContextOptions, test } from './fixtures.ts'
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
        await page.addInitScript(() => {
          type Shift = { value: number; moved: string[] }
          const shifts: Shift[] = []
          ;(window as unknown as { __shifts: Shift[] }).__shifts = shifts
          /** What moved, so a failure says where to look, e.g. `A «Home» x24→26 y92→92`. */
          const describe = (source: {
            node?: Node | null
            previousRect: DOMRectReadOnly
            currentRect: DOMRectReadOnly
          }) => {
            const node = source.node
            const text = (node?.textContent ?? '').trim().slice(0, 30)
            const { previousRect: a, currentRect: b } = source
            return `${node?.nodeName ?? '?'} «${text}» x${a.x}→${b.x} y${a.y}→${b.y} w${a.width}→${b.width}`
          }
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as unknown as {
                value: number
                sources: Parameters<typeof describe>[0][]
              }
              shifts.push({ value: shift.value, moved: shift.sources.map(describe) })
            }
          }).observe({ type: 'layout-shift', buffered: true })
        })
        await page.goto(path)
        await page.locator('[data-primary-action]').waitFor()
        await page.evaluate(() => document.fonts.ready)
        // Let any late layout (fonts, the island) settle before reading the entries.
        await page.waitForTimeout(500)
        const shifts = await page.evaluate(
          () => (window as unknown as { __shifts: { value: number; moved: string[] }[] }).__shifts,
        )
        const total = shifts.reduce((sum, shift) => sum + shift.value, 0)
        if (total > 0) {
          const moved = shifts.flatMap((shift) => shift.moved).join('; ')
          failures.push(`${path}: ${total.toFixed(4)} (${moved})`)
        }
      } finally {
        await context.close()
      }
    }
    expect(failures, 'cumulative layout shift while loading').toEqual([])
  })
}
