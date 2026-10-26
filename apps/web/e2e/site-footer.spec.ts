import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * The site footer: one group of links per tool category from the registry, the "Mochifile"
 * group, the licenses and the other language. Only destinations that exist are linked.
 */

const PAGES = [
  { locale: 'en', path: '/compress-image/', other: '/pt/comprimir-imagem/', language: 'Português' },
  { locale: 'pt', path: '/pt/comprimir-imagem/', other: '/compress-image/', language: 'English' },
] as const
const WIDTHS = [320, 360, 390, 768, 1024, 1440]
const GITHUB = 'https://github.com/mochifile/mochifile'

const footer = (page: Page) => page.getByRole('contentinfo')

/** The key that moves focus to the next link (WebKit on macOS follows the system setting). */
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'

for (const { locale, path, other, language } of PAGES) {
  test(`footer links only to destinations that exist (${locale})`, async ({ page, request }) => {
    await page.goto(path)
    const nav = footer(page).getByRole('navigation', {
      name: locale === 'en' ? 'Footer' : 'Rodapé',
    })
    await expect(nav).toBeVisible()
    // One labelled list per group; the tool groups come from the registry, so the first group
    // is a category with at least one link, and the last one is always Mochifile.
    const lists = nav.getByRole('list')
    const names = await lists.evaluateAll((els) =>
      els.map(
        (el) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent,
      ),
    )
    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(names[0]).toBe(locale === 'en' ? 'Image' : 'Imagem')
    expect(names.at(-1)).toBe('Mochifile')
    await expect(footer(page).getByRole('link', { name: 'Mochifile' })).toHaveAttribute(
      'href',
      locale === 'en' ? '/' : '/pt/',
    )

    const hrefs = await footer(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    // No page that is not published yet: legal pages, About, Help, pricing, API, contact.
    expect(
      hrefs.filter((href) => /privacy|terms|cookie|about|help|pric|api|mailto:/i.test(href)),
    ).toEqual([])
    expect(new Set(hrefs).size, 'no link is listed twice').toBe(hrefs.length)
    expect(hrefs).toContain(GITHUB)
    expect(hrefs).toContain('/third-party-licenses.txt')
    expect(hrefs).toContain(other)
    for (const href of hrefs.filter((href) => href.startsWith('/'))) {
      expect((await request.get(href)).status(), href).toBe(200)
    }
    const switcher = footer(page).getByRole('link', { name: language })
    await expect(switcher).toHaveAttribute('hreflang', locale === 'en' ? 'pt' : 'en')
    await expect(switcher).toHaveAttribute('lang', locale === 'en' ? 'pt' : 'en')
    // The page's own tool link says where you are.
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', path)
  })

  test(`footer fits, with 44 px targets, from 320 to 1440 px (${locale})`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      // Reflow at 200% and 400% zoom is a viewport this narrow (WCAG 1.4.10).
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${width}px: sideways scrolling`,
      ).toBeLessThanOrEqual(width)
      const box = await footer(page).boundingBox()
      if (!box) throw new Error('no footer')
      const small = await footer(page)
        .getByRole('link')
        .evaluateAll((links) =>
          links
            // The logo is a smaller target by design: it is also the header's, and the
            // footer's own links are what this checks.
            .filter((link) => !link.hasAttribute('data-logo'))
            .map((link) => {
              const r = link.getBoundingClientRect()
              return { name: link.textContent?.trim(), w: r.width, h: r.height, right: r.right }
            })
            .filter((r) => r.h < 44 || r.right > document.documentElement.clientWidth),
        )
      expect(small, `${width}px: links under 44 px or cut off`).toEqual([])
    }
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`footer has no axe violations (${locale}, ${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(path)
        const result = await new AxeBuilder({ page }).include('footer').analyze()
        expect(result.violations, `${width}px`).toEqual([])
      }
    })
  }
}

test('keyboard: Tab goes through the footer in reading order with a visible focus ring', async ({
  page,
  browserName,
}) => {
  const TAB = tabKey(browserName)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/compress-image/')
  const links = footer(page).getByRole('link')
  await links.first().focus()
  const expected = await links.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''),
  )
  expect(expected.at(-1)).toBe('Português')
  const seen: string[] = []
  const rings: string[] = []
  for (let i = 0; i < expected.length; i++) {
    const state = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
        ring: `${style.outlineStyle} ${style.outlineWidth}`,
        inView: box.top >= 0 && box.bottom <= innerHeight,
      }
    })
    seen.push(state?.name ?? '')
    rings.push(state?.ring ?? '')
    expect(state?.inView, `${state?.name} is scrolled into view`).toBe(true)
    if (i < expected.length - 1) await page.keyboard.press(TAB)
  }
  expect(seen).toEqual(expected)
  // The design system's 3px ring, on every stop (the first was focused by script, which the
  // browsers do not always treat as keyboard focus, so it is not asked for one).
  expect(rings.slice(1).every((ring) => ring === 'solid 3px')).toBe(true)
})

test('the language link follows the page: a tool page, and the home page', async ({ page }) => {
  await page.goto('/')
  await expect(footer(page).getByRole('link', { name: 'Português' })).toHaveAttribute(
    'href',
    '/pt/',
  )
  await page.goto('/pt/')
  await expect(footer(page).getByRole('link', { name: 'English' })).toHaveAttribute('href', '/')
})

test('the footer does not move when the brand fonts replace their fallbacks', async ({
  testBrowser,
}) => {
  /** Where each footer element is, in the page, after the fonts settle or fail. */
  async function layout(blockFonts: boolean, width: number) {
    const context = await testBrowser.newContext({
      ...projectContextOptions(),
      viewport: { width, height: 800 },
    })
    try {
      const page = await context.newPage()
      if (blockFonts) await page.route('**/*.woff2', (route) => route.abort())
      await page.goto('/pt/comprimir-imagem/')
      await page.evaluate(() => document.fonts.ready)
      return await page.evaluate(() =>
        [document.querySelector('footer'), ...document.querySelectorAll('footer a, footer p')].map(
          (el) => {
            const r = (el as Element).getBoundingClientRect()
            return [
              Math.round(r.x),
              Math.round(r.y + scrollY),
              Math.round(r.width),
              Math.round(r.height),
            ]
          },
        ),
      )
    } finally {
      await context.close()
    }
  }
  for (const width of [360, 1440]) {
    const fallback = await layout(true, width)
    const brand = await layout(false, width)
    expect(brand.length).toBe(fallback.length)
    // Text is as wide as its font draws it, so a line's width may differ between the fallback and
    // Figtree, and the link that follows it on the same line moves sideways by that much. What
    // must not change is what wraps: every height, and every vertical position in the footer. The
    // sideways move stays within a few pixels (12 px in WebKit, whose fallback is the widest).
    const relative = (rows: number[][]) =>
      rows.map(([x = 0, y = 0, w = 0, h = 0]) => [x, y - (rows[0]?.[1] ?? 0), w, h])
    const a = relative(fallback)
    const b = relative(brand)
    a.forEach((row, i) => {
      const [x = 0, y = 0, , h = 0] = row
      const [bx = 0, by = 0, , bh = 0] = b[i] ?? []
      const where = `${width}px, element ${i}`
      expect(Math.abs(y - by), `${where}: top`).toBeLessThanOrEqual(2)
      expect(Math.abs(h - bh), `${where}: height`).toBeLessThanOrEqual(2)
      expect(Math.abs(x - bx), `${where}: left`).toBeLessThanOrEqual(12)
    })
  }
})
