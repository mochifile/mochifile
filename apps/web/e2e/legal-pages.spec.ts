import AxeBuilder from '@axe-core/playwright'
import { legalSections } from '../src/lib/legal.ts'
import { expect, test } from './fixtures.ts'

/**
 * The four legal pages, in English and Portuguese. Their text is not written (it must come from
 * a lawyer), so the pages must say they are drafts, show no date and make no claim beyond what
 * the project documents, and keep every clause out of the accessibility tree.
 */

const PAGES = [
  {
    id: 'privacy',
    en: { path: '/privacy-policy/', title: 'Privacy Policy — Mochifile', h1: 'Privacy Policy' },
    pt: {
      path: '/pt/politica-de-privacidade/',
      title: 'Política de Privacidade — Mochifile',
      h1: 'Política de Privacidade',
    },
  },
  {
    id: 'terms-of-service',
    en: {
      path: '/terms-of-service/',
      title: 'Terms of Service — Mochifile',
      h1: 'Terms of Service',
    },
    pt: {
      path: '/pt/termos-de-servico/',
      title: 'Termos de Serviço — Mochifile',
      h1: 'Termos de Serviço',
    },
  },
  {
    id: 'terms-and-conditions',
    en: {
      path: '/terms-and-conditions/',
      title: 'Terms and Conditions of Use — Mochifile',
      h1: 'Terms and Conditions of Use',
    },
    pt: {
      path: '/pt/termos-e-condicoes/',
      title: 'Termos e Condições de Uso — Mochifile',
      h1: 'Termos e Condições de Uso',
    },
  },
  {
    id: 'dpa',
    en: {
      path: '/data-processing-agreement/',
      title: 'Data Processing Agreement — Mochifile',
      h1: 'Data Processing Agreement',
    },
    pt: {
      path: '/pt/acordo-de-processamento-de-dados/',
      title: 'Acordo de Processamento de Dados — Mochifile',
      h1: 'Acordo de Processamento de Dados',
    },
  },
] as const

const COPY = {
  en: {
    notice: 'Draft layout. The text of this page is pending review by a lawyer',
    pending: 'Pending',
    eyebrow: 'Legal',
    fact: 'Documented fact.',
    download: 'Download DPA (PDF)',
    unavailable: 'The PDF is not available yet',
  },
  pt: {
    notice: 'Rascunho de layout. O texto desta página aguarda a revisão de um advogado',
    pending: 'Pendente',
    eyebrow: 'Jurídico',
    fact: 'Fato documentado.',
    download: 'Baixar o acordo (PDF)',
    unavailable: 'O PDF ainda não está disponível',
  },
} as const

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

for (const locale of ['en', 'pt'] as const) {
  const copy = COPY[locale]
  const other = locale === 'en' ? 'pt' : 'en'

  for (const page of PAGES) {
    const info = page[locale]

    test(`${info.path} is a draft: title, language, alternates, notice, no date`, async ({
      page: tab,
    }) => {
      await tab.goto(info.path)
      await expect(tab).toHaveTitle(info.title)
      await expect(tab.locator('html')).toHaveAttribute('lang', locale)
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(info.h1)
      await expect(tab.locator('link[rel="alternate"][hreflang]')).toHaveCount(3)
      await expect(tab.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
        'href',
        new RegExp(`${page[other].path}$`),
      )
      await expect(tab.locator('[data-language-switch]').first()).toHaveAttribute(
        'href',
        page[other].path,
      )
      await expect(tab.locator('main [style]')).toHaveCount(0)
      const main = tab.getByRole('main')
      await expect(main.getByText(copy.notice)).toBeVisible()
      await expect(main.getByText(copy.eyebrow, { exact: true })).toBeVisible()
      // "Last updated" is marked pending, never dated.
      await expect(main.getByText(copy.pending, { exact: true }).first()).toBeVisible()
      expect(await main.innerText()).not.toMatch(/\b(19|20)\d\d\b/)
      await expect(tab.locator('main [name]:not([name="description"])')).toHaveCount(0)
    })

    test(`${info.path} has every section heading, and its clauses are decoration`, async ({
      page: tab,
    }) => {
      await tab.goto(info.path)
      const sections = legalSections[page.id]
      // One h2 per section, plus the page's own extra ones (definitions, details, signatures, schedules).
      const headings = await tab.getByRole('main').getByRole('heading', { level: 2 }).count()
      expect(headings).toBeGreaterThanOrEqual(sections.length)
      // Every numbered list is hidden from assistive technology, and holds no text.
      const lists = tab.locator('ol.legal-clauses')
      expect(await lists.count()).toBe(sections.length)
      for (const list of await lists.all()) {
        await expect(list).toHaveAttribute('aria-hidden', 'true')
        expect((await list.innerText()).replace(/\s/g, '')).toBe('')
      }
      // The numbers run on through the page, as in the artboards.
      const starts = await lists.evaluateAll((all) =>
        all.map((list) => Number(list.getAttribute('start'))),
      )
      expect(starts[0]).toBe(1)
    })

    for (const viewport of VIEWPORTS) {
      test(`${info.path} fits ${viewport.width} px and is accessible`, async ({
        page: tab,
        request,
      }) => {
        await tab.setViewportSize(viewport)
        await tab.goto(info.path)
        expect((await new AxeBuilder({ page: tab }).analyze()).violations).toEqual([])
        expect(
          await tab.evaluate(() => document.documentElement.scrollWidth),
          'sideways scrolling',
        ).toBeLessThanOrEqual(viewport.width)
        const hrefs = await tab
          .locator('main a[href^="/"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
        for (const href of new Set(hrefs))
          expect((await request.get(href)).status(), href).toBe(200)
      })
    }
  }

  test(`${PAGES[0].id} (${locale}): the short version and three documented facts`, async ({
    page,
  }) => {
    await page.goto(PAGES[0][locale].path)
    const main = page.getByRole('main')
    await expect(
      main.getByText(locale === 'en' ? 'The short version.' : 'A versão curta.'),
    ).toBeVisible()
    await expect(main.getByText(copy.fact)).toHaveCount(3)
    const text = await main.innerText()
    // Only what the project documents: no retention period, no company, no jurisdiction.
    expect(text).not.toMatch(/\b\d+\s*(days|months|years|dias|meses|anos)\b/i)
    // The short version must not promise a policy that does not exist yet.
    expect(text).not.toMatch(/explained below|explicado abaixo/i)
  })

  test(`terms and conditions (${locale}): the operator's details are pending, the contact is real`, async ({
    page,
  }) => {
    await page.goto(PAGES[2][locale].path)
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: 'hello@mochifile.com' })).toHaveAttribute(
      'href',
      'mailto:hello@mochifile.com',
    )
    await expect(main.getByText(copy.pending, { exact: true }).first()).toBeVisible()
  })

  test(`dpa (${locale}): the download says there is no PDF, and the sub-processors are listed`, async ({
    page,
  }) => {
    await page.goto(PAGES[3][locale].path)
    const main = page.getByRole('main')
    const notice = page.locator('#legal-pdf')
    await expect(notice).toBeHidden()
    await main.getByRole('button', { name: copy.download }).click()
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(copy.unavailable)
    await page.keyboard.press('Escape')
    await expect(notice).toBeHidden()
    expect(new URL(page.url()).pathname).toBe(PAGES[3][locale].path)
    // Cloudflare and Paddle, with their region still pending; the signature table keeps its blanks.
    const table = main.locator('table').last()
    await expect(
      table
        .getByRole('row')
        .filter({ hasText: 'Cloudflare' })
        .getByText(copy.pending, { exact: true }),
    ).toBeVisible()
    await expect(
      table.getByRole('row').filter({ hasText: 'Paddle' }).getByText(copy.pending, { exact: true }),
    ).toBeVisible()
    await expect(main.locator('table').nth(0)).toContainText('____')
  })
}

test('terms of service (en): the definitions table keeps its nine terms', async ({ page }) => {
  await page.goto('/terms-of-service/')
  const rows = page.getByRole('main').locator('table').first().getByRole('row')
  expect(await rows.count()).toBe(10)
  await expect(rows.nth(1)).toContainText('Account')
})
