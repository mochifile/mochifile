import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * What the V2 integration (integration/v2) fixes after the independent review: the header cells
 * that keep their width, form fields that keep the control border, copy that promises nothing a
 * server does, the legal pages and guide articles in the V2 scale.
 */

const ACCENT = 'rgb(91, 60, 196)'
const CONTROL = 'rgb(145, 132, 116)'

/** WCAG contrast ratio of two `rgb(r, g, b)` colours. */
function contrast(a: string, b: string): number {
  const luminance = (rgb: string) => {
    const [r = 0, g = 0, bl = 0] = (rgb.match(/\d+/g) ?? []).map(Number).map((value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const fontSize = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize)

test('every header link keeps its fixed-width cell hook, so the font swap moves nothing', async ({
  page,
}) => {
  for (const path of ['/', '/pt/']) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path)
    const keys = await page
      .locator('[data-main-nav] a, [data-main-nav] button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-shell-link')))
    expect(keys, path).toEqual(['solutions', 'guides', 'docs', 'pricing', 'sign-in', 'get-started'])
    // The cell is at least as wide as its label in Figtree (set in component-constants.css).
    const widths = await page
      .locator('[data-main-nav] [data-shell-link]')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)))
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(59)
  }
})

for (const path of [
  '/contact/',
  '/pt/contato/',
  '/sign-in/',
  '/pt/entrar/',
  '/sign-up/',
  '/pt/criar-conta/',
]) {
  test(`form fields on ${path} keep the control border, at 3:1 or more`, async ({ page }) => {
    await page.goto(path)
    const fields = page.locator(
      'main input:not([type="hidden"]):not([type="checkbox"]), main textarea',
    )
    expect(await fields.count()).toBeGreaterThan(0)
    for (const field of await fields.all()) {
      if (!(await field.isVisible())) continue
      const [border, ground] = await field.evaluate((el) => {
        const style = getComputedStyle(el)
        let node: Element | null = el
        let background = style.backgroundColor
        while (background === 'rgba(0, 0, 0, 0)' && node?.parentElement) {
          node = node.parentElement
          background = getComputedStyle(node).backgroundColor
        }
        return [style.borderTopColor, background]
      })
      expect(border).toBe(CONTROL)
      expect(contrast(border, ground)).toBeGreaterThanOrEqual(3)
    }
  })
}

test('pricing promises nothing it cannot keep: no "forever", no server deleting files', async ({
  page,
}) => {
  for (const path of ['/pricing/', '/pt/precos/']) {
    await page.goto(path)
    const text = (await page.locator('main').innerText()).toLowerCase()
    expect(text, path).not.toMatch(/forever|para sempre/)
    expect(text, path).not.toMatch(/delete|apaga|exclu/)
  }
  await page.goto('/pricing/')
  await expect(page.locator('main')).toContainText('for browser tools')
})

test('About and Architecture claim nothing about servers that do not exist', async ({ page }) => {
  for (const path of ['/about/', '/architecture/', '/pt/sobre/', '/pt/arquitetura/']) {
    await page.goto(path)
    const text = (await page.locator('main').innerText()).toLowerCase()
    expect(text, path).not.toMatch(
      /encrypted connection|conexão criptografada|deleted (as soon|when)|apagados? (assim|quando)/,
    )
    expect(text, path).toMatch(
      /no tool needs a server today|nenhuma ferramenta precisa de servidor hoje|every tool today runs|hoje todas as ferramentas rodam/,
    )
  }
})

for (const path of [
  '/privacy-policy/',
  '/terms-of-service/',
  '/terms-and-conditions/',
  '/data-processing-agreement/',
  '/pt/politica-de-privacidade/',
]) {
  test(`${path} is a labelled draft in the V2 scale`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    // Still a draft: the label and no claim of being in force.
    await expect(page.locator('main')).toContainText(/draft|rascunho/i)
    expect(await fontSize(page, 'main h1')).toBe('60px')
    expect(
      await page
        .locator('main p.uppercase, main [class*="type-eyebrow"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(ACCENT)
    const width = await page
      .locator('main article')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeLessThanOrEqual(720)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1')).toBe('40px')
  })
}

test('a guide article has the artboard H1: 60 px, 40 px on a phone', async ({ page }) => {
  for (const path of ['/guides/compress-photo-to-50kb/', '/pt/guias/comprimir-foto-para-50kb/']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    expect(await fontSize(page, 'main h1'), path).toBe('60px')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1'), path).toBe('40px')
  }
})

const OWN_404 = /status of 404|404 \(Not Found\)/i
const NOT_FOUND = [
  {
    path: '/does-not-exist/',
    lang: 'en',
    tools: '/solutions/',
    title: 'Page not found — Mochifile',
  },
  {
    path: '/pt/nao-existe/',
    lang: 'pt',
    tools: '/pt/solucoes/',
    title: 'Página não encontrada — Mochifile',
  },
] as const

for (const { path, lang, tools, title } of NOT_FOUND) {
  test(`the 404 page for ${path} is the V2 page: real 404, noindex, headers, light, "See all tools" → ${tools}`, async ({
    page,
    request,
    pageErrors,
  }) => {
    const response = await page.goto(path)
    // The browser logs the page's own 404 status; nothing else may be logged.
    pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
    expect(response?.status()).toBe(404)
    // Security headers from _headers reach the 404 page too.
    const headers = response?.headers() ?? {}
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("script-src 'self'")
    await expect(page).toHaveTitle(title)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    // "See all tools" goes to Solutions, a page that exists.
    const all = page.getByRole('main').getByRole('link').last()
    await expect(all).toHaveAttribute('href', tools)
    expect((await request.get(tools)).status()).toBe(200)

    // V2 scale and tokens: 60 px H1 (40 on a phone), accent eyebrow, shadowed buttons, mascot radius.
    await page.setViewportSize({ width: 1440, height: 900 })
    expect(await fontSize(page, 'main h1')).toBe('60px')
    expect(
      await page
        .locator('main .type-eyebrow')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(ACCENT)
    expect(
      await page.locator('[data-primary-action]').evaluate((el) => getComputedStyle(el).boxShadow),
    ).not.toBe('none')
    expect(
      await page
        .locator('main img')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    ).toBe('22px')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1')).toBe('40px')
  })

  test(`the 404 page for ${path} stays light under a dark system theme`, async ({
    page,
    pageErrors,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(path)
    pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
    const colours = await page.locator('.nf').evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.backgroundColor, style.color]
    })
    expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
  })
}

const TOOL_PAGES = [
  { path: '/compress-image/', home: '/', solutions: '/solutions/', label: 'Solutions' },
  { path: '/compress-image-to-50kb/', home: '/', solutions: '/solutions/', label: 'Solutions' },
  { path: '/pt/comprimir-imagem/', home: '/pt/', solutions: '/pt/solucoes/', label: 'Soluções' },
  {
    path: '/pt/comprimir-imagem-para-50kb/',
    home: '/pt/',
    solutions: '/pt/solucoes/',
    label: 'Soluções',
  },
] as const

for (const { path, home, solutions, label } of TOOL_PAGES) {
  test(`the tool page ${path}: Home › ${label} › the tool, and light under a dark system theme`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(path)
    const crumbs = page.getByRole('navigation', { name: /breadcrumb|trilha/i }).locator('li a')
    await expect(crumbs.nth(0)).toHaveAttribute('href', home)
    await expect(crumbs.nth(1)).toHaveText(label)
    await expect(crumbs.nth(1)).toHaveAttribute('href', solutions)
    expect((await request.get(solutions)).status()).toBe(200)
    // Light only: the page and its panel keep the light tokens whatever the system prefers.
    const colours = await page.locator('.tp').evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.backgroundColor, style.color]
    })
    expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
    const card = await page
      .locator('.tp-panel-card')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(card).toBe('rgb(255, 255, 255)')
  })
}
