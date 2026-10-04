import type { Browser, BrowserContextOptions, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { readLayoutShifts, recordLayoutShifts } from './layout-shifts.ts'

/**
 * The language suggestion banner (ADR 0019): offers the page in the visitor's preferred
 * language, never redirects, and stays away once dismissed or after a language choice.
 */

const banner = (page: Page) => page.locator('aside[data-language-suggestion]:not([hidden])')

/** A context whose browser prefers `locale`, collecting page errors like the default fixture. */
async function visitorPage(browser: Browser, locale: string, extra: BrowserContextOptions = {}) {
  const context = await browser.newContext({ ...projectContextOptions(), locale, ...extra })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return { context, page, errors }
}

test('suggests Portuguese on "/" for a pt-BR browser, without redirecting', async ({
  testBrowser,
}) => {
  const { context, page, errors } = await visitorPage(testBrowser, 'pt-BR')
  try {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toHaveAttribute('lang', 'pt')
    await expect(banner(page)).toHaveAccessibleName('Sugestão de idioma')
    await expect(banner(page)).toContainText('Ver esta página em português?')
    // The link is the page's own hreflang alternate.
    const alternate = await page
      .locator('link[rel="alternate"][hreflang="pt"]')
      .getAttribute('href')
    const link = banner(page).getByRole('link', { name: 'Ver em português' })
    await expect(link).toHaveAttribute('href', new URL(alternate ?? '').pathname)
    await expect(link).toHaveAttribute('href', '/pt/')

    // Still no redirect a moment later.
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/')
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('shows no banner on "/pt/" for a pt-BR browser', async ({ testBrowser }) => {
  const { context, page } = await visitorPage(testBrowser, 'pt-BR')
  try {
    await page.goto('/pt/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
    await expect(banner(page)).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('suggests English on a Portuguese page for an English browser', async ({ testBrowser }) => {
  const { context, page } = await visitorPage(testBrowser, 'en-US')
  try {
    await page.goto('/pt/comprimir-imagem-para-50kb/')
    await expect(banner(page)).toContainText('View this page in English?')
    await expect(banner(page).getByRole('link', { name: 'View in English' })).toHaveAttribute(
      'href',
      '/compress-image-to-50kb/',
    )
  } finally {
    await context.close()
  }
})

test('follows the order of preference: English first means no banner on "/"', async ({
  testBrowser,
}) => {
  const { context, page } = await visitorPage(testBrowser, 'en-US')
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'pt-BR'] })
    })
    await page.goto('/')
    await expect(page.locator('aside[data-language-suggestion]')).toBeHidden()
  } finally {
    await context.close()
  }
})

test('dismissal is remembered across reloads and pages', async ({ testBrowser }) => {
  const { context, page, errors } = await visitorPage(testBrowser, 'pt-BR')
  try {
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Agora não' }).click()
    await expect(banner(page)).toHaveCount(0)
    await page.reload()
    await expect(page.locator('aside[data-language-suggestion]')).toBeHidden()
    await page.goto('/compress-image/')
    await expect(page.locator('aside[data-language-suggestion]')).toBeHidden()
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('never shows after arriving through the language switcher', async ({ testBrowser }) => {
  const { context, page } = await visitorPage(testBrowser, 'pt-BR')
  try {
    // A Portuguese speaker deliberately switches to English.
    await page.goto('/pt/')
    await page
      .getByRole('navigation', { name: 'Idioma' })
      .getByRole('link', { name: 'English' })
      .click()
    await expect(page).toHaveURL('/')
    await expect(page.locator('aside[data-language-suggestion]')).toBeHidden()
    await page.goto('/compress-image/')
    await expect(page.locator('aside[data-language-suggestion]')).toBeHidden()
  } finally {
    await context.close()
  }
})

test('still works, without errors, when storage is blocked', async ({ testBrowser }) => {
  const { context, page, errors } = await visitorPage(testBrowser, 'pt-BR')
  try {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get: () => {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    })
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await banner(page).getByRole('button', { name: 'Agora não' }).click()
    await expect(banner(page)).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('is keyboard accessible, axe-clean and shifts nothing', async ({
  testBrowser,
  browserName,
}) => {
  const { context, page } = await visitorPage(testBrowser, 'pt-BR')
  try {
    await recordLayoutShifts(page)
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    // An overlay: fixed position, so nothing else on the page moves.
    expect(await banner(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    if (browserName === 'chromium') {
      const { total, moved } = await readLayoutShifts(page)
      expect(total, moved).toBe(0)
    }

    const { default: AxeBuilder } = await import('@axe-core/playwright')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    // Reachable with the keyboard, and Enter on "Not now" closes it.
    const dismiss = banner(page).getByRole('button', { name: 'Agora não' })
    await dismiss.focus()
    await expect(dismiss).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toHaveCount(0)
  } finally {
    await context.close()
  }
})

/** Phone size (iPhone 13/14: 390 × 844 CSS pixels). */
const PHONE = { width: 390, height: 844 }

for (const [locale, path] of [
  ['pt-BR', '/compress-image/'],
  ['pt-BR', '/compress-image-to-50kb/'],
  ['en-US', '/pt/comprimir-imagem-para-50kb/'],
] as const) {
  test(`on a phone, never covers the file picker on first view (${locale} on ${path})`, async ({
    testBrowser,
  }) => {
    const { context, page } = await visitorPage(testBrowser, locale, { viewport: PHONE })
    try {
      await page.goto(path)
      const dropzone = page.locator('label').filter({ has: page.locator('input[type="file"]') })
      await expect(dropzone).toBeVisible()
      await expect(banner(page)).toBeVisible()

      const zone = await dropzone.boundingBox()
      const panel = await banner(page).boundingBox()
      if (!zone || !panel) throw new Error('missing boxes')
      const overlaps =
        panel.x < zone.x + zone.width &&
        zone.x < panel.x + panel.width &&
        panel.y < zone.y + zone.height &&
        zone.y < panel.y + panel.height
      expect(overlaps).toBe(false)

      // A tap on the part of the file picker visible on first view reaches it, not the banner.
      // With taller text (fonts differ between systems) the picker can start below the fold;
      // then nothing on screen can cover it and there is nothing to tap.
      const visibleTop = Math.max(zone.y, 0)
      const visibleBottom = Math.min(zone.y + zone.height, PHONE.height)
      if (visibleBottom > visibleTop) {
        const x = zone.x + zone.width / 2
        const y = (visibleTop + visibleBottom) / 2
        expect(
          await page.evaluate(
            (point) =>
              Boolean(
                document
                  .elementFromPoint(point.x, point.y)
                  ?.closest('label')
                  ?.querySelector('input[type="file"]'),
              ),
            { x, y },
          ),
        ).toBe(true)
      }

      // Clear of the iOS safe areas at whichever edge it uses.
      const classes = (await banner(page).getAttribute('class')) ?? ''
      expect(classes).toContain('env(safe-area-inset-top)')
      expect(classes).toContain('env(safe-area-inset-bottom)')
    } finally {
      await context.close()
    }
  })
}

test('on wider screens, sits at the bottom', async ({ testBrowser }) => {
  const { context, page } = await visitorPage(testBrowser, 'pt-BR', {
    viewport: { width: 1280, height: 800 },
  })
  try {
    await page.goto('/')
    const panel = await banner(page).boundingBox()
    expect(panel && panel.y + panel.height).toBeGreaterThan(700)
  } finally {
    await context.close()
  }
})
