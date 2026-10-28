import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures.ts'

/**
 * The guides list and the articles, in English and Portuguese. The filter, the search field
 * and "Show more guides" work without a script: each is checked for what it does, and for what
 * it does not pretend to do.
 */

const LOCALES = {
  en: {
    list: '/guides/',
    title: 'Guides — Mochifile',
    h1: 'File and image guides',
    article: '/guides/compress-photo-to-50kb/',
    articleTitle: 'How to compress a photo to 50 KB for an online form',
    toc: 'On this page',
    privacy: 'Privacy',
    all: 'All',
    draft: 'Draft',
    more: 'Show more guides',
    search: 'Filter guides, for example HEIC, passport or WebP',
    searchNote: 'Typing here does not filter yet. Pick a topic below to narrow the list.',
    cta: 'Compress to 50 KB',
    tool: '/compress-image-to-50kb/',
  },
  pt: {
    list: '/pt/guias/',
    title: 'Guias — Mochifile',
    h1: 'Guias de arquivos e imagens',
    article: '/pt/guias/comprimir-foto-para-50kb/',
    articleTitle: 'Como comprimir uma foto para 50 KB em um formulário online',
    toc: 'Nesta página',
    privacy: 'Privacidade',
    all: 'Todos',
    draft: 'Rascunho',
    more: 'Mostrar mais guias',
    search: 'Filtrar guias, por exemplo HEIC, passaporte ou WebP',
    searchNote: 'Digitar aqui ainda não filtra a lista. Escolha um assunto abaixo para reduzi-la.',
    cta: 'Comprimir para 50 KB',
    tool: '/pt/comprimir-imagem-para-50kb/',
  },
} as const

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

for (const locale of ['en', 'pt'] as const) {
  const copy = LOCALES[locale]
  const other = locale === 'en' ? 'pt' : 'en'

  test(`${copy.list} has its title, alternates and the guides' links`, async ({
    page,
    request,
  }) => {
    await page.goto(copy.list)
    await expect(page).toHaveTitle(copy.title)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.h1)
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3)
    await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
      'href',
      new RegExp(`${LOCALES[other].list}$`),
    )
    await expect(page.locator('[data-language-switch]').first()).toHaveAttribute(
      'href',
      LOCALES[other].list,
    )
    await expect(page.locator('main [style]')).toHaveCount(0)

    // Every link works. A draft is a card without a link, and no card has a date.
    const main = page.getByRole('main')
    const hrefs = await main
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    for (const href of new Set(hrefs)) expect((await request.get(href)).status(), href).toBe(200)
    const drafts = main.locator('article', { hasText: copy.draft })
    expect(await drafts.count()).toBeGreaterThan(0)
    await expect(drafts.locator('a')).toHaveCount(0)
    expect(await main.innerText()).not.toMatch(/\b(19|20)\d\d\b/)
    // The count in the eyebrow is the number of guides that can be opened.
    const eyebrow = await page.locator('header p', { hasText: /·/ }).first().innerText()
    const published = new Set(
      hrefs.filter((href) => href.startsWith(`${copy.list}`) && href !== copy.list),
    )
    expect(eyebrow).toContain(String(published.size))
  })

  test(`${copy.list} filters by topic with the chips, with the keyboard too`, async ({ page }) => {
    await page.goto(copy.list)
    const list = page.getByRole('region', { name: /./ }).locator('ul').last()
    const cards = list.locator('> li')
    const total = await cards.count()
    expect(total).toBeGreaterThan(8)
    const group = page.getByRole('group')
    await expect(group.getByRole('radio', { name: copy.all })).toBeChecked()

    await group.getByText(copy.privacy, { exact: true }).click()
    await expect(group.getByRole('radio', { name: copy.privacy })).toBeChecked()
    const shown = await cards.evaluateAll(
      (items) => items.filter((item) => getComputedStyle(item).display !== 'none').length,
    )
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan(total)
    for (const card of await cards.all()) {
      if (await card.isVisible()) await expect(card).toHaveAttribute('data-topic', 'privacy')
    }

    // Arrow keys move through the chips, as in any radio group.
    await group.getByRole('radio', { name: copy.privacy }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(group.getByRole('radio', { name: copy.privacy })).not.toBeChecked()
    await group.getByText(copy.all, { exact: true }).click()
    expect(
      await cards.evaluateAll(
        (items) => items.filter((item) => getComputedStyle(item).display !== 'none').length,
      ),
    ).toBe(total)
  })

  test(`${copy.list} does not pretend to search or to have more guides`, async ({ page }) => {
    await page.goto(copy.list)
    const field = page.getByRole('searchbox')
    const note = page.getByText(copy.searchNote)
    await expect(field).toHaveAccessibleName(copy.search)
    await expect(note).toBeHidden()
    const before = await page.locator('main li[data-topic]:visible').count()
    await field.fill('webp')
    await expect(note).toBeVisible()
    expect(await page.locator('main li[data-topic]:visible').count()).toBe(before)
    await field.fill('')
    await expect(note).toBeHidden()

    const notice = page.locator('#guides-no-more')
    await expect(notice).toBeHidden()
    await page.getByRole('button', { name: copy.more }).click()
    await expect(notice).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(notice).toBeHidden()
    expect(new URL(page.url()).pathname).toBe(copy.list)
  })

  test(`${copy.article} reads as an article, with a list of its sections`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(copy.article)
    await expect(page).toHaveTitle(`${copy.articleTitle} — Mochifile`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.articleTitle)
    await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
      'href',
      new RegExp(`${LOCALES[other].article}$`),
    )
    const crumbs = page.getByRole('navigation').filter({ has: page.locator('ol') })
    await expect(crumbs.getByRole('link').nth(1)).toHaveAttribute('href', copy.list)

    // Each entry of "On this page" leads to a heading that exists.
    const toc = page.getByRole('navigation', { name: copy.toc })
    const links = toc.getByRole('link')
    const count = await links.count()
    expect(count).toBeGreaterThan(3)
    for (let index = 0; index < count; index++) {
      const id = ((await links.nth(index).getAttribute('href')) ?? '').slice(1)
      await expect(page.locator(`h2[id="${id}"]`)).toHaveCount(1)
    }
    // The way to the size page.
    const cta = page.getByRole('main').getByRole('link', { name: copy.cta })
    await expect(cta).toHaveAttribute('href', copy.tool)
    await expect(page.locator('main [style]')).toHaveCount(0)
    // No author and no date: the byline says what it is and how long it takes.
    expect(await page.getByRole('main').innerText()).not.toMatch(/\b(19|20)\d\d\b/)
  })

  for (const viewport of VIEWPORTS) {
    for (const path of [copy.list, copy.article]) {
      test(`${path} fits ${viewport.width} px, is accessible and its images load`, async ({
        page,
        request,
      }) => {
        await page.setViewportSize(viewport)
        await page.goto(path)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          'sideways scrolling',
        ).toBeLessThanOrEqual(viewport.width)
        // Some pictures are hidden on a phone (the featured mascot, the tool card).
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
        for (const href of new Set(hrefs))
          expect((await request.get(href)).status(), href).toBe(200)
      })
    }
  }
}

test('the guides name no real author and promise no tool that is not published', async ({
  page,
}) => {
  await page.goto('/guides/heic-vs-jpg/')
  const text = await page.getByRole('main').innerText()
  expect(text).toContain('does not open HEIC files yet')
  await page.goto('/guides/what-is-a-webp-file/')
  await expect(page.getByRole('link', { name: 'Compress image' }).first()).toHaveAttribute(
    'href',
    '/compress-image/',
  )
})
