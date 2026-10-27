import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * The 404 pages. Cloudflare answers an unknown path with the nearest `404.html` up from it
 * (`not_found_handling: "404-page"`, ADR 0013), and e2e/serve.ts does the same: anything under
 * `/pt/` gets the Portuguese page, everything else the English one, at any depth.
 */

const LOCALES = {
  en: {
    title: 'Page not found — Mochifile',
    heading: "We can't find this page",
    home: '/',
    action: 'Go to the home page',
    tools: 'Or go straight to a tool',
    tool: '/compress-image/',
    skip: 'Skip to content',
  },
  pt: {
    title: 'Página não encontrada — Mochifile',
    heading: 'Não encontramos esta página',
    home: '/pt/',
    action: 'Ir para a página inicial',
    tools: 'Ou vá direto para uma ferramenta',
    tool: '/pt/comprimir-imagem/',
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

const SCHEMES = ['light', 'dark'] as const
const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 1280, height: 800 },
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
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page).toHaveTitle(copy.title)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.heading)
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
  })
}

for (const locale of ['en', 'pt'] as const) {
  const copy = LOCALES[locale]
  const missing = locale === 'en' ? '/does-not-exist/' : '/pt/nao-existe/'

  test(`the ${locale} page leads home and to the published tools`, async ({
    page,
    pageErrors,
    request,
  }) => {
    await openMissing(page, pageErrors, missing)
    // The tools come from the registry, in this locale, and every link works.
    const tools = page.getByRole('region', { name: copy.tools }).getByRole('link')
    const hrefs = await tools.evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toContain(copy.tool)
    for (const href of hrefs) expect((await request.get(href ?? '')).status(), href ?? '').toBe(200)
    const action = page.locator('[data-primary-action]')
    await expect(action).toHaveCount(1)
    await expect(action).toHaveAccessibleName(copy.action)
    await expect(action).toHaveAttribute('href', copy.home)
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
    // The way home is the first stop in the content, with a visible focus ring.
    await page.keyboard.press(TAB)
    const action = page.locator('[data-primary-action]')
    await expect(action).toBeFocused()
    expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(copy.home)
  })

  for (const colorScheme of SCHEMES) {
    for (const viewport of VIEWPORTS) {
      test(`the ${locale} page has no axe violations and fits (${colorScheme}, ${viewport.width} px)`, async ({
        page,
        pageErrors,
      }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme })
        await openMissing(page, pageErrors, missing)
        await page.evaluate(() => document.fonts.ready)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          'sideways scrolling',
        ).toBeLessThanOrEqual(viewport.width)
        // The way home is a full-size target and, on a phone, visible without scrolling.
        const box = await page.locator('[data-primary-action]').boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(56)
        expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height)
      })
    }
  }
}
