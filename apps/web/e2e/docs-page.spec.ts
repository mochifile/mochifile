import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures.ts'

/**
 * The API reference, in English and Portuguese. The API does not exist, so the page must say
 * so, show no real-looking key or number, and make nothing on it look callable.
 */

const LOCALES = {
  en: {
    path: '/docs/',
    other: '/pt/docs/',
    lang: 'en',
    title: 'API reference — Mochifile',
    h1: 'API reference',
    notice: 'Preview: the API does not exist yet.',
    menu: 'On this page',
    sections: 'API sections',
    language: 'Language',
    planned: 'Planned',
    help: 'Email us',
  },
  pt: {
    path: '/pt/docs/',
    other: '/docs/',
    lang: 'pt',
    title: 'Referência da API — Mochifile',
    h1: 'Referência da API',
    notice: 'Prévia: a API ainda não existe.',
    menu: 'Nesta página',
    sections: 'Seções da API',
    language: 'Linguagem',
    planned: 'Planejado',
    help: 'Escrever para nós',
  },
} as const

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

for (const locale of ['en', 'pt'] as const) {
  const copy = LOCALES[locale]

  test(`${copy.path} has its title, alternates and an honest notice`, async ({ page }) => {
    await page.goto(copy.path)
    await expect(page).toHaveTitle(copy.title)
    await expect(page.locator('html')).toHaveAttribute('lang', copy.lang)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.h1)
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3)
    await expect(page.locator('[data-language-switch]').first()).toHaveAttribute('href', copy.other)
    await expect(page.getByText(copy.notice)).toBeVisible()
    await expect(page.locator('main [style]')).toHaveCount(0)

    const text = await page.getByRole('main').innerText()
    // No real-looking key, no placeholder, no date.
    expect(text).not.toMatch(/mf_(live|test)_|•••|\bN MB\b|to be provided/i)
    expect(text).not.toMatch(/\b(19|20)\d\d\b/)
    // The approved routes, not the artboard's shorter names.
    for (const route of [
      '/v1/images/compress',
      '/v1/images/convert',
      '/v1/pdfs/merge',
      '/v1/jobs/{id}',
    ]) {
      expect(text).toContain(route)
    }
    expect(text).not.toContain('/v1/usage')
    // The tools that do not exist are marked as planned.
    await expect(page.getByText(copy.planned, { exact: true })).toHaveCount(3)
  })

  test(`${copy.path} lists every section, and each entry leads to one`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(copy.path)
    const links = page
      .getByRole('navigation', { name: copy.sections })
      .locator('visible=true')
      .getByRole('link')
    const count = await links.count()
    expect(count).toBe(10)
    for (let index = 0; index < count; index++) {
      const id = ((await links.nth(index).getAttribute('href')) ?? '').slice(1)
      await expect(page.locator(`[id="${id}"]`), id).toHaveCount(1)
    }
    // Following a link in the list lands on its section.
    await links.nth(6).click()
    await expect(page).toHaveURL(/#errors$/)
    await expect(page.locator('#errors')).toBeInViewport()
  })

  test(`${copy.path}: the section menu opens on a phone and the list shows from 1024 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(copy.path)
    const menu = page.locator('details.docs-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link').first()).toBeHidden()
    await menu.getByText(copy.menu).click()
    await expect(menu.getByRole('link').first()).toBeVisible()
    await menu.getByRole('link', { name: /v1\/pdfs\/merge/ }).click()
    await expect(page).toHaveURL(/#pdf-merge$/)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(menu).toBeHidden()
  })

  test(`${copy.path}: the example tabs show one language at a time, with the keyboard too`, async ({
    page,
  }) => {
    await page.goto(copy.path)
    const tabs = page.locator('#compress .docs-tabs')
    const panels = tabs.locator('pre')
    await expect(panels).toHaveCount(3)
    await expect(tabs.getByRole('radio', { name: 'cURL' })).toBeChecked()
    await expect(panels.nth(0)).toBeVisible()
    await expect(panels.nth(1)).toBeHidden()

    await tabs.getByText('Python', { exact: true }).click()
    await expect(panels.nth(2)).toBeVisible()
    await expect(panels.nth(0)).toBeHidden()
    await expect(panels.nth(2)).toContainText('requests.post')

    await tabs.getByRole('radio', { name: 'Python' }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(tabs.getByRole('radio', { name: 'JavaScript' })).toBeChecked()
    await expect(panels.nth(1)).toContainText('fetch(')
    // Another example's tabs are not affected.
    await expect(page.locator('#convert .docs-tabs pre').first()).toBeVisible()
    await expect(page.getByRole('group', { name: copy.language }).first()).toBeVisible()
    // Code never carries a real key: it reads it from the environment.
    expect(await panels.nth(0).innerText()).toContain('$MOCHIFILE_KEY')
  })

  test(`${copy.path}: the way to ask for help is real`, async ({ page }) => {
    await page.goto(copy.path)
    await expect(page.getByRole('link', { name: copy.help })).toHaveAttribute(
      'href',
      'mailto:hello@mochifile.com',
    )
    await expect(page.getByRole('main').getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/mochifile/mochifile',
    )
  })

  for (const viewport of VIEWPORTS) {
    test(`${copy.path} fits ${viewport.width} px, is accessible and its images load`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto(copy.path)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'sideways scrolling',
      ).toBeLessThanOrEqual(viewport.width)
      for (const image of await page.locator('main img:visible').all()) {
        await expect(image).toHaveAttribute('alt', '')
        await image.scrollIntoViewIfNeeded()
        await expect
          .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
          .toBeGreaterThan(0)
      }
      const hrefs = await page
        .locator('main a[href^="/"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      for (const href of new Set(hrefs)) expect((await request.get(href)).status(), href).toBe(200)
      // Every table keeps its header cells, which a phone shows as stacked rows.
      expect(await page.locator('table').count()).toBe(4)
      for (const table of await page.locator('table').all()) {
        await expect(table.getByRole('columnheader').first()).toBeAttached()
      }
    })
  }
}
