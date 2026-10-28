import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * The 404 pages (V2 artboard MFNotFound). Cloudflare answers an unknown path with the nearest
 * `404.html` up from it (`not_found_handling: "404-page"`, ADR 0013), and e2e/serve.ts does the
 * same: anything under `/pt/` gets the Portuguese page, everything else the English one, at any
 * depth, always with status 404.
 */

const LOCALES = {
  en: {
    title: 'Page not found — Mochifile',
    label: 'Error 404',
    heading: 'This page wandered off.',
    text: 'The link may be old, or the address may have a typo. Your files are fine: nothing was uploaded.',
    home: '/',
    homeName: 'Go to the home page',
    toolsName: 'See all tools',
    skip: 'Skip to content',
  },
  pt: {
    title: 'Página não encontrada — Mochifile',
    label: 'Erro 404',
    heading: 'Esta página saiu por aí.',
    text: 'O link pode estar antigo, ou o endereço pode ter um erro de digitação. Seus arquivos estão seguros: nada foi enviado.',
    home: '/pt/',
    homeName: 'Ir para o início',
    toolsName: 'Ver todas as ferramentas',
    skip: 'Pular para o conteúdo',
  },
} as const

const CASES = [
  { path: '/does-not-exist/', locale: 'en' },
  { path: '/a/b/c/', locale: 'en' },
  { path: '/no-trailing-slash', locale: 'en' },
  { path: '/compress-image/nope/', locale: 'en' },
  // Only `/pt/` itself is the Portuguese section.
  { path: '/ptx/', locale: 'en' },
  { path: '/pt/nao-existe/', locale: 'pt' },
  { path: '/pt/a/b/c/', locale: 'pt' },
  { path: '/pt/comprimir-imagem/nope/', locale: 'pt' },
  { path: '/pt/photo.png', locale: 'pt' },
] as const

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 800 },
  { width: 1440, height: 900 },
]

/** The key that moves focus to the next link (WebKit on macOS follows the system setting). */
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'

/**
 * Opens an unknown path. Browsers log the document's own 404 as a console error; only that
 * message is dropped, so a CSP violation or a script error still fails the test.
 */
async function openMissing(page: Page, pageErrors: string[], path: string) {
  const response = await page.goto(path)
  const own = (error: string) => /status of 404|404 \(Not Found\)/i.test(error)
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !own(error)))
  return response
}

for (const { path, locale } of CASES) {
  const copy = LOCALES[locale]
  test(`${path} answers 404 with the ${locale} page`, async ({ page, pageErrors, request }) => {
    const response = await openMissing(page, pageErrors, path)
    // A missing page is never turned into a 200.
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page).toHaveTitle(copy.title)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.heading)
    await expect(page.getByText(copy.label, { exact: true })).toBeVisible()
    await expect(page.getByText(copy.text)).toBeVisible()
    await expect(page.getByRole('link', { name: copy.skip })).toHaveAttribute('href', '#content')

    // Not indexable, no address of its own, nothing to suggest (ADR 0014, 0019).
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"], link[rel="alternate"]')).toHaveCount(0)
    await expect(page.locator('script')).toHaveCount(0)
    const headers = (await request.get(path)).headers()
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['x-frame-options']).toBe('DENY')

    // Served at any depth: every stylesheet and font is root-relative and loads.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(background).not.toBe('rgba(0, 0, 0, 0)')
    // The mascot is decoration and arrives, whatever the depth of the address.
    const mascot = page.locator('main img')
    await expect(mascot).toHaveAttribute('alt', '')
    await expect
      .poll(() => mascot.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0)
  })
}

for (const locale of ['en', 'pt'] as const) {
  const copy = LOCALES[locale]
  const missing = locale === 'en' ? '/does-not-exist/' : '/pt/nao-existe/'

  test(`the ${locale} page has the artboard's pieces: marker, two buttons, no list of tools`, async ({
    page,
    pageErrors,
  }) => {
    await openMissing(page, pageErrors, missing)
    const main = page.getByRole('main')
    // The marker sits under the second half of the heading.
    await expect(main.locator('.not-found-mark')).toHaveText(
      copy.heading.split(' ').slice(2).join(' '),
    )
    expect(
      await main
        .locator('.not-found-mark')
        .evaluate((el) => getComputedStyle(el).textDecorationLine),
    ).toBe('underline')
    // Two buttons, side by side from 600 px and stacked under it.
    const home = main.getByRole('link', { name: copy.homeName })
    const tools = main.getByRole('link', { name: copy.toolsName })
    await expect(home).toHaveAttribute('href', copy.home)
    await expect(main.getByRole('link')).toHaveCount(2)
    const [a, b] = [await home.boundingBox(), await tools.boundingBox()]
    // The artboard's large pill is 52 px (V2 `target-lg`), above the 44 px target minimum.
    expect(a?.height).toBeGreaterThanOrEqual(52)
    expect(b?.height).toBeGreaterThanOrEqual(52)
    // The primary button is the dark pill; the other is the soft one.
    expect(await home.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      await tools.evaluate((el) => getComputedStyle(el).backgroundColor),
    )
  })

  test(`the ${locale} page leads home, and "${copy.toolsName}" never leads to a missing page`, async ({
    page,
    pageErrors,
    request,
  }) => {
    await openMissing(page, pageErrors, missing)
    const main = page.getByRole('main')
    const toolsHref = await main.getByRole('link', { name: copy.toolsName }).getAttribute('href')
    expect(toolsHref).toBeTruthy()
    // Solutions when the site has it, a published tool until then: a real page either way.
    expect((await request.get(toolsHref ?? '')).status(), toolsHref ?? '').toBe(200)
    expect(toolsHref).toMatch(locale === 'en' ? /^\/(?!pt\/)/ : /^\/pt\//)
    const action = page.locator('[data-primary-action]')
    await expect(action).toHaveCount(1)
    await action.click()
    await expect(page).toHaveURL(copy.home)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
  })

  test(`the ${locale} page works with the keyboard alone`, async ({
    page,
    pageErrors,
    browserName,
  }) => {
    const TAB = tabKey(browserName)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openMissing(page, pageErrors, missing)
    await page.keyboard.press(TAB)
    await expect(page.getByRole('link', { name: copy.skip })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#content')).toBeFocused()
    // Focus follows the page as drawn: the way home, then "See all tools", each with a ring.
    await page.keyboard.press(TAB)
    const home = page.getByRole('main').getByRole('link', { name: copy.homeName })
    await expect(home).toBeFocused()
    expect(await home.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    await page.keyboard.press(TAB)
    const tools = page.getByRole('main').getByRole('link', { name: copy.toolsName })
    await expect(tools).toBeFocused()
    expect(await tools.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    // Enter on the way home goes home.
    await home.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(copy.home)
  })

  for (const viewport of VIEWPORTS) {
    test(`the ${locale} page has no axe violations and fits (${viewport.width} px)`, async ({
      page,
      pageErrors,
    }) => {
      await page.setViewportSize(viewport)
      await openMissing(page, pageErrors, missing)
      await page.evaluate(() => document.fonts.ready)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'sideways scrolling',
      ).toBeLessThanOrEqual(viewport.width)
      // Nothing is cut: the heading, the text and both buttons are inside the window's width.
      for (const selector of ['h1', 'main p', 'main a']) {
        for (const box of await page
          .locator(selector)
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))) {
          expect(box).toBeLessThanOrEqual(viewport.width)
        }
      }
      // The way home is a full-size target and, on a phone, visible without scrolling.
      const box = await page.locator('[data-primary-action]').boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(52)
      if (viewport.width < 600) {
        expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height)
      }
    })
  }
}
