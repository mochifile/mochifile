import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * Solutions, the catalogue of every tool (docs/design-ref/v2, artboard MFSolutions). Visual
 * first: all 27 cards are drawn, but only Compress image and its size pages exist, so the checks
 * are that those lead to real pages and that the rest say so, with no script and no simulated
 * result.
 */

const SITE = 'https://mochifile.com'

const LOCALES = [
  {
    locale: 'en',
    browserLocale: 'en-US',
    path: '/solutions/',
    other: '/pt/solucoes/',
    h1: 'Image converters and tools',
    categories: [
      'Compress',
      'Convert photos',
      'Web formats',
      'Product and marketplace',
      'HDR',
      'PDF',
      'Video',
    ],
    sections: [
      'Which tool do I need?',
      'Tool pages, Ask Mochifile or the API?',
      'What happens to your files',
      'Frequently asked questions',
    ],
    live: [
      ['Compress image', '/compress-image/'],
      ['Compress to 50 KB', '/compress-image-to-50kb/'],
      ['Compress to 100 KB', '/compress-image-to-100kb/'],
      ['Compress to 200 KB', '/compress-image-to-200kb/'],
    ],
    soonCard: 'HEIC to JPG',
    soon: 'Not available yet',
    gotIt: 'Got it',
    search: 'Search tools',
    ask: 'Ask Mochifile',
    tool: '/compress-image/',
    faqClosed: 'Are my files uploaded?',
    faqAnswer: /Not by the browser tools/,
  },
  {
    locale: 'pt',
    browserLocale: 'pt-BR',
    path: '/pt/solucoes/',
    other: '/solutions/',
    h1: 'Conversores de imagem e ferramentas',
    categories: [
      'Comprimir',
      'Converter fotos',
      'Formatos para a web',
      'Produtos e marketplaces',
      'HDR',
      'PDF',
      'Vídeo',
    ],
    sections: [
      'Qual ferramenta eu preciso?',
      'Páginas de ferramenta, Ask Mochifile ou a API?',
      'O que acontece com seus arquivos',
      'Perguntas frequentes',
    ],
    live: [
      ['Comprimir imagem', '/pt/comprimir-imagem/'],
      ['Comprimir para 50 KB', '/pt/comprimir-imagem-para-50kb/'],
      ['Comprimir para 100 KB', '/pt/comprimir-imagem-para-100kb/'],
      ['Comprimir para 200 KB', '/pt/comprimir-imagem-para-200kb/'],
    ],
    soonCard: 'HEIC para JPG',
    soon: 'Ainda não está disponível',
    gotIt: 'Entendi',
    search: 'Buscar ferramentas',
    ask: 'Ask Mochifile',
    tool: '/pt/comprimir-imagem/',
    faqClosed: 'Meus arquivos são enviados?',
    faqAnswer: /Não pelas ferramentas do navegador/,
  },
] as const

const WIDTHS = [320, 390, 640, 768, 1024, 1440]

const main = (page: Page) => page.getByRole('main')

async function openPage(
  testBrowser: Browser,
  c: (typeof LOCALES)[number],
  options: { width: number; height?: number },
) {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    viewport: { width: options.width, height: options.height ?? 900 },
    locale: c.browserLocale,
  })
  const page = await context.newPage()
  await page.goto(c.path)
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

for (const c of LOCALES) {
  test.describe(`solutions ${c.path}`, () => {
    test('has its own title, language, canonical and alternates', async ({ page }) => {
      const response = await page.goto(c.path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', c.locale)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.h1)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE}${c.path}`,
      )
      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
        )
      expect(alternates).toEqual([
        ['en', `${SITE}/solutions/`],
        ['pt', `${SITE}/pt/solucoes/`],
        ['x-default', `${SITE}/solutions/`],
      ])
    })

    test('draws every category and all 27 cards', async ({ page }) => {
      await page.goto(c.path)
      const headings = await main(page).getByRole('heading', { level: 2 }).allTextContents()
      expect(headings).toEqual([...c.categories, ...c.sections])
      await expect(main(page).locator('[data-tool]')).toHaveCount(27)
      await expect(main(page).locator('[data-category]')).toHaveCount(7)
      // The search field and the four "which tool" cards are drawn too.
      await expect(main(page).getByRole('button', { name: new RegExp(c.search) })).toBeVisible()
      await expect(main(page).getByRole('heading', { level: 3 })).toHaveCount(4 + 0)
    })

    test('published tools are links to real pages; the rest are not links', async ({
      page,
      request,
    }) => {
      await page.goto(c.path)
      const links = main(page).locator('[data-tool][data-available="true"]')
      await expect(links).toHaveCount(c.live.length)
      for (const [title, href] of c.live) {
        const card = main(page).locator('a[data-tool]', { hasText: title })
        await expect(card.first()).toHaveAttribute('href', href)
        expect((await request.get(href)).status(), href).toBe(200)
      }
      const unavailable = main(page).locator('[data-tool][data-available="false"]')
      await expect(unavailable).toHaveCount(23)
      expect(await unavailable.evaluateAll((els) => els.map((el) => el.tagName))).toEqual(
        Array(23).fill('BUTTON'),
      )
    })

    test('a tool that does not exist yet says so, and closes with Esc', async ({ page }) => {
      await page.goto(c.path)
      const message = page.getByRole('dialog', { name: c.soon })
      await expect(message).toBeHidden()
      await main(page)
        .getByRole('button', { name: new RegExp(`^.*${c.soonCard}`) })
        .first()
        .click()
      await expect(message).toBeVisible()
      await expect(message.getByRole('link')).toHaveAttribute('href', c.tool)
      await page.keyboard.press('Escape')
      await expect(message).toBeHidden()
      // Nothing navigated.
      expect(new URL(page.url()).pathname).toBe(c.path)
    })

    test('the search field and the links to unbuilt pages say so too', async ({ page }) => {
      await page.goto(c.path)
      const message = page.getByRole('dialog', { name: c.soon })
      await main(page)
        .getByRole('button', { name: new RegExp(c.search) })
        .click()
      await expect(message).toBeVisible()
      await message.getByRole('button', { name: c.gotIt }).click()
      await expect(message).toBeHidden()
      await main(page).getByRole('button', { name: c.ask, exact: true }).first().click()
      await expect(message).toBeVisible()
    })

    test('links inside the "which tool" lists reach the compressor where it exists', async ({
      page,
    }) => {
      await page.goto(c.path)
      const link = main(page).locator('ul.sol-bullets a').first()
      await expect(link).toHaveAttribute('href', /compress-image|comprimir-imagem/)
    })

    test('the FAQ opens with the keyboard', async ({ page }) => {
      await page.goto(c.path)
      // Every question starts closed, the first one too.
      await expect(page.locator('details[open]')).toHaveCount(0)
      await expect(page.getByText(c.faqAnswer)).toBeHidden()
      await page.locator('summary', { hasText: c.faqClosed }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText(c.faqAnswer)).toBeVisible()
    })

    test('has no script or inline style of its own, and no raw links to the other page', async ({
      page,
    }) => {
      await page.goto(c.path)
      expect(await page.locator('main script').count()).toBe(0)
      expect(await page.locator('main [style]').count()).toBe(0)
      // The language switcher (in the footer only) leads to the translated slug.
      await expect(
        page.getByRole('contentinfo').locator(`a[href="${c.other}"]`).first(),
      ).toBeAttached()
    })
  })
}

for (const c of LOCALES) {
  test(`never scrolls sideways, and nothing leaves the window (${c.path})`, async ({
    testBrowser,
  }) => {
    const failures: string[] = []
    for (const width of WIDTHS) {
      const { context, page } = await openPage(testBrowser, c, { width })
      try {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (overflow > 0) failures.push(`${width}px: page ${overflow}px too wide`)
        const outside = await page.locator('.sol').evaluate((root) => {
          const right = document.documentElement.clientWidth
          return [...root.querySelectorAll('h1, h2, h3, p, a, button, summary, li')]
            .filter((el) => {
              if (el.closest('.sol-soon')) return false
              const r = el.getBoundingClientRect()
              return r.width > 0 && (r.left < -0.5 || r.right > right + 0.5)
            })
            .map((el) => el.textContent?.trim().slice(0, 24) ?? el.nodeName)
        })
        if (outside.length > 0) failures.push(`${width}px: outside: ${outside.join(', ')}`)
      } finally {
        await context.close()
      }
    }
    expect(failures).toEqual([])
  })
}

test('cards have the same width in a row and 44 px targets', async ({ testBrowser }) => {
  const { context, page } = await openPage(testBrowser, LOCALES[0], { width: 1440 })
  try {
    const rows = await page.locator('[data-category="convert"] [data-tool]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), width: Math.round(r.width), height: r.height }
      }),
    )
    // Three columns of equal width, and cards in a row as tall as each other.
    expect(new Set(rows.map((row) => row.width)).size).toBe(1)
    const firstRow = rows.filter((row) => row.top === rows[0]?.top)
    expect(firstRow).toHaveLength(3)
    expect(new Set(firstRow.map((row) => row.height)).size).toBe(1)
    for (const row of rows) expect(row.height).toBeGreaterThanOrEqual(44)
  } finally {
    await context.close()
  }
})

for (const width of [390, 1280]) {
  test(`has no axe violations (${width} px)`, async ({ testBrowser }) => {
    for (const c of LOCALES) {
      const { context, page } = await openPage(testBrowser, c, { width })
      try {
        expect((await new AxeBuilder({ page }).analyze()).violations, c.path).toEqual([])
        await main(page)
          .getByRole('button', { name: new RegExp(`^.*${c.soonCard}`) })
          .first()
          .click()
        await expect(page.getByRole('dialog', { name: c.soon })).toBeVisible()
        const open = await new AxeBuilder({ page }).analyze()
        expect(open.violations, `${c.path} with the message open`).toEqual([])
      } finally {
        await context.close()
      }
    }
  })
}
