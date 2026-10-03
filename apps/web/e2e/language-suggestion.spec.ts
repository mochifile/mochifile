import type { Browser, BrowserContextOptions, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

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
    await banner(page).getByRole('button', { name: 'Não, obrigado' }).click()
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
    await banner(page).getByRole('button', { name: 'Não, obrigado' }).click()
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
    await page.addInitScript(() => {
      const shifts: number[] = []
      ;(window as unknown as { __shifts: number[] }).__shifts = shifts
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            shifts.push((entry as unknown as { value: number }).value)
        }).observe({ type: 'layout-shift', buffered: true })
      } catch {
        // layout-shift entries exist only in Chromium.
      }
    })
    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    // An overlay: fixed position, so nothing else on the page moves.
    expect(await banner(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    if (browserName === 'chromium') {
      expect(
        await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts),
      ).toEqual([])
    }

    const { default: AxeBuilder } = await import('@axe-core/playwright')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    // Reachable with the keyboard, and Enter on "No, thanks" closes it.
    const dismiss = banner(page).getByRole('button', { name: 'Não, obrigado' })
    await dismiss.focus()
    await expect(dismiss).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toHaveCount(0)
  } finally {
    await context.close()
  }
})
