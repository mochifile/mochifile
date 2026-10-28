import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * The site footer (V2 canvas, ADR 0030): three link columns, two pills, company and legal links,
 * the language row, the credit, GitHub, two badges and the "Ask AI" line. Everything the canvas
 * draws is there; a destination that does not exist yet is a "Coming soon" button, so every link
 * leads somewhere real.
 */

const PAGES = [
  {
    locale: 'en',
    path: '/compress-image/',
    other: '/pt/comprimir-imagem/',
    columns: ['Popular tools', 'Video', 'Install'],
    real: [
      ['Compress image', '/compress-image/'],
      ['Compress to 50 KB', '/compress-image-to-50kb/'],
    ],
    soon: ['HEIC to JPG', 'MP4 to WebM', 'Chrome extension', 'API docs', 'About'],
  },
  {
    locale: 'pt',
    path: '/pt/comprimir-imagem/',
    other: '/compress-image/',
    columns: ['Ferramentas populares', 'Vídeo', 'Instalar'],
    real: [
      ['Comprimir imagem', '/pt/comprimir-imagem/'],
      ['Comprimir para 50 KB', '/pt/comprimir-imagem-para-50kb/'],
    ],
    soon: ['HEIC para JPG', 'MP4 para WebM', 'Extensão do Chrome', 'Sobre'],
  },
] as const
const WIDTHS = [320, 360, 390, 768, 1024, 1440]
const GITHUB = 'https://github.com/mochifile/mochifile'
const CREDIT = 'https://github.com/RaioViajante'

const footer = (page: Page) => page.getByRole('contentinfo')
const notice = (page: Page) => page.locator('#coming-soon:popover-open')

/** The key that moves focus to the next link (WebKit on macOS follows the system setting). */
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'

for (const { locale, path, other, columns, real, soon } of PAGES) {
  test(`footer shows every element of the canvas, linking only destinations that exist (${locale})`, async ({
    page,
    request,
  }) => {
    await page.goto(path)
    // The three columns, by heading.
    for (const name of columns) {
      await expect(footer(page).getByRole('navigation', { name })).toBeVisible()
    }
    // Tool pages that exist are links; the rest are buttons that say "Coming soon".
    for (const [name, href] of real) {
      await expect(footer(page).getByRole('link', { name })).toHaveAttribute('href', href)
    }
    for (const name of soon) {
      await expect(footer(page).getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
    }
    await expect(
      footer(page).getByRole('button', { name: /^(View all solutions|Ver todas as soluções)/ }),
    ).toBeVisible()
    await expect(
      footer(page).getByRole('button', { name: /^(Read guides|Ler guias)/ }),
    ).toBeVisible()

    const hrefs = await footer(page)
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    // No placeholder and no unpublished page: every link is real.
    expect(hrefs.filter((href) => href === '#' || href === '')).toEqual([])
    expect(hrefs.filter((href) => /x\.com|twitter|tiktok|mailto:/i.test(href))).toEqual([])
    // GitHub is the only social network: the icon and the "Open source" badge both go to the
    // repository, the credit to its author.
    expect(hrefs.filter((href) => href === GITHUB)).toHaveLength(2)
    expect(hrefs).toContain(CREDIT)
    expect(hrefs).toContain('/third-party-licenses.txt')
    expect(hrefs).toContain(other)
    for (const href of hrefs.filter((href) => href.startsWith('/'))) {
      expect((await request.get(href)).status(), href).toBe(200)
    }
    await expect(footer(page).getByRole('img', { name: /love|amor/ })).toHaveText('♥')
    await expect(footer(page).getByRole('link', { name: /Mochifile (on|no) GitHub/ })).toHaveCount(
      2,
    )
    // The Sponsor badge is drawn and honest: no sponsorship exists yet.
    await expect(
      footer(page).getByRole('button', { name: /^(Sponsor|Apoie)\s+Mochifile/ }),
    ).toBeVisible()
    // The "Ask AI" line: its label and three destinations that are not live.
    await expect(footer(page).getByText(/Ask AI about Mochifile|Pergunte a uma IA/)).toBeVisible()
    for (const name of ['ChatGPT', 'Perplexity', 'Google AI Mode']) {
      await expect(footer(page).getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
    }
    // No logo: the footer is the canvas's, on the page ground.
    await expect(footer(page).locator('[data-logo]')).toHaveCount(0)
  })

  test(`footer language row: six languages in their own names, two with pages (${locale})`, async ({
    page,
  }) => {
    await page.goto(path)
    const row = footer(page).getByRole('navigation', {
      name: locale === 'en' ? 'Language' : 'Idioma',
    })
    const names = await row
      .getByRole('listitem')
      .evaluateAll((items) =>
        items.map((item) => item.textContent?.replace(/, (Coming soon|Em breve)$/, '').trim()),
      )
    expect(names).toEqual([
      'English',
      'Português (Brasil)',
      'Español',
      'Français',
      'हिन्दी',
      '简体中文',
    ])
    await expect(row.locator('[aria-current="true"]')).toHaveText(
      locale === 'en' ? 'English' : 'Português (Brasil)',
    )
    const switcher = row.getByRole('link', {
      name: locale === 'en' ? 'Português (Brasil)' : 'English',
    })
    await expect(switcher).toHaveAttribute('href', other)
    await expect(switcher).toHaveAttribute('hreflang', locale === 'en' ? 'pt' : 'en')
    await expect(switcher).toHaveAttribute('lang', locale === 'en' ? 'pt-BR' : 'en')
    // The others are not links: they say "Coming soon" and stay on the page.
    await expect(row.getByRole('link')).toHaveCount(2)
    await row.getByRole('button', { name: /^Español/ }).click()
    await expect(notice(page)).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(path)
  })

  test(`footer fits from 320 to 1440 px, with 36 px rows for links and 44 px for buttons (${locale})`, async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      // Reflow at 200% and 400% zoom is a viewport this narrow (WCAG 1.4.10).
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${width}px: sideways scrolling`,
      ).toBeLessThanOrEqual(width)
      const small = await footer(page)
        .locator('a, button')
        .evaluateAll((controls) =>
          controls
            // The credit is a link inside a sentence, which WCAG 2.5.8 exempts.
            .filter((control) => control.getAttribute('href') !== 'https://github.com/RaioViajante')
            .map((control) => {
              const r = control.getBoundingClientRect()
              return {
                name: control.textContent?.trim(),
                h: r.height,
                left: r.left,
                right: r.right,
              }
            })
            // The canvas's link rows are 36 px (above WCAG 2.5.8's 24 px); pills and icons 44.
            .filter(
              (r) => r.h < 36 || r.left < 0 || r.right > document.documentElement.clientWidth,
            ),
        )
      expect(small, `${width}px: controls under 36 px or cut off`).toEqual([])
      const buttons = await footer(page)
        .locator('a[class*="rounded-pill"], button[class*="rounded-pill"]')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
      expect(buttons.length).toBeGreaterThanOrEqual(3)
      expect(Math.min(...buttons)).toBeGreaterThanOrEqual(44)
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

test('a "Coming soon" control in the footer says so, goes nowhere and clears on Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await footer(page)
    .getByRole('button', { name: /^Privacy Policy/ })
    .click()
  await expect(notice(page)).toBeVisible()
  await expect(notice(page)).toContainText('Coming soon')
  await expect(notice(page)).toHaveAttribute('role', 'status')
  expect(new URL(page.url()).pathname).toBe('/')
  await page.keyboard.press('Escape')
  await expect(notice(page)).toHaveCount(0)
  // It can be asked again, and from another control.
  await footer(page)
    .getByRole('button', { name: /^Sponsor/ })
    .click()
  await expect(notice(page)).toBeVisible()
})

test('keyboard: Tab goes through the footer in reading order with a visible focus ring', async ({
  page,
  browserName,
}) => {
  const TAB = tabKey(browserName)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/compress-image/')
  const controls = footer(page).locator('a, button')
  await controls.first().focus()
  const expected = await controls.evaluateAll((els) =>
    els.map((el) =>
      (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' '),
    ),
  )
  expect(expected[0]).toContain('Compress image')
  expect(expected.at(-1)).toBe('Open-source licenses')
  const seen: string[] = []
  const rings: string[] = []
  for (let i = 0; i < expected.length; i++) {
    // Firefox scrolls a focused element into view smoothly: wait for it to arrive.
    await page
      .waitForFunction(() => {
        const box = document.activeElement?.getBoundingClientRect()
        return box ? box.top >= 0 && box.bottom <= innerHeight : false
      })
      .catch(() => undefined)
    const state = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      return {
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' '),
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

test('the language links follow the page: a tool page, and the home page', async ({ page }) => {
  await page.goto('/')
  await expect(footer(page).getByRole('link', { name: 'Português (Brasil)' })).toHaveAttribute(
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
  async function layout(blockFonts: boolean, width: number, path: string) {
    const context = await testBrowser.newContext({
      ...projectContextOptions(),
      viewport: { width, height: 800 },
    })
    try {
      const page = await context.newPage()
      if (blockFonts) await page.route('**/*.woff2', (route) => route.abort())
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready)
      return await page.evaluate(() =>
        [
          document.querySelector('footer'),
          ...document.querySelectorAll('footer a, footer button, footer p'),
        ].map((el) => {
          const r = (el as Element).getBoundingClientRect()
          return [
            Math.round(r.x),
            Math.round(r.y + scrollY),
            Math.round(r.width),
            Math.round(r.height),
          ]
        }),
      )
    } finally {
      await context.close()
    }
  }
  // At 1440 px the English page: its legal links fit one row in both fonts. The Portuguese
  // row is about 1,040 px, so it wraps in Figtree and not in the fallback; the footer is far
  // below the first view, so that moves nothing a visitor sees.
  // At 360 px the lines wrap wherever the fallback's widths say, which differs by system (WebKit
  // wraps the Portuguese legal links in one more row than Chromium), so there the check is the
  // English page, whose short labels wrap the same way.
  for (const [width, path] of [
    [360, '/compress-image/'],
    [1440, '/compress-image/'],
  ] as const) {
    const fallback = await layout(true, width, path)
    const brand = await layout(false, width, path)
    expect(brand.length).toBe(fallback.length)
    // Text is as wide as its font draws it, so an element's width differs between the fallback and
    // Figtree. What must not change is what wraps: every height, and every vertical position in the
    // footer. Sideways, the footer is centred, so a row of links moves by half the difference
    // between two renderings of its labels (a few pixels, more with some systems' fallback fonts).
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
      expect(Math.abs(x - bx), `${where}: left`).toBeLessThanOrEqual(24)
    })
  }
})
