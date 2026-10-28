import { expect, test } from './fixtures.ts'

/**
 * Variant pages: a tool page with preset options and its own URL, title and copy (ADR 0018).
 * Uses the template tool's `lowercase` variant, which is part of the e2e build.
 */
const SITE = 'https://mochifile.com'

const cases = [
  {
    path: '/template-tool-lowercase/',
    lang: 'en',
    title: 'Template tool: lower case',
    copyHeading: 'About this variant',
    breadcrumbs: ['Home', 'Solutions', 'Template tool', 'Template tool: lower case'],
    lowerLabel: 'lower case',
    alternates: [
      ['en', `${SITE}/template-tool-lowercase/`],
      ['pt', `${SITE}/pt/ferramenta-modelo-minusculas/`],
      ['x-default', `${SITE}/template-tool-lowercase/`],
    ],
    mainPage: { name: 'Template tool', path: '/template-tool/' },
  },
  {
    path: '/pt/ferramenta-modelo-minusculas/',
    lang: 'pt',
    title: 'Ferramenta modelo: minúsculas',
    copyHeading: 'Sobre esta variante',
    breadcrumbs: ['Início', 'Soluções', 'Ferramenta modelo', 'Ferramenta modelo: minúsculas'],
    lowerLabel: 'minúsculas',
    alternates: [
      ['en', `${SITE}/template-tool-lowercase/`],
      ['pt', `${SITE}/pt/ferramenta-modelo-minusculas/`],
      ['x-default', `${SITE}/template-tool-lowercase/`],
    ],
    mainPage: { name: 'Ferramenta modelo', path: '/pt/ferramenta-modelo/' },
  },
]

for (const c of cases) {
  test.describe(`variant page ${c.path}`, () => {
    test('has its own title, copy, breadcrumbs and hreflang', async ({ page }) => {
      const response = await page.goto(c.path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', c.lang)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.title)
      await expect(page.getByRole('heading', { level: 2, name: c.copyHeading })).toBeVisible()

      const crumbs = page.getByRole('navigation', { name: /breadcrumb|trilha/i }).locator('li')
      await expect(crumbs).toHaveText(
        c.breadcrumbs.map((crumb, i) => (i > 0 ? `›${crumb}` : crumb)),
      )
      await expect(crumbs.last().locator('[aria-current="page"]')).toHaveText(c.title)

      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
        )
      expect(alternates).toEqual(c.alternates)

      // Links back to the tool's main page, for people and crawlers.
      await expect(
        page.getByRole('link', { name: c.mainPage.name, exact: true }).last(),
      ).toHaveAttribute('href', c.mainPage.path)
    })

    test('describes itself as a free web application with breadcrumbs', async ({ request }) => {
      const html = await (await request.get(c.path)).text()
      const json = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)?.[1]
      expect(json).toBeDefined()
      const graph = (JSON.parse(json ?? '{}') as { '@graph': Array<Record<string, unknown>> })[
        '@graph'
      ]
      expect(graph[0]).toMatchObject({
        '@type': 'WebApplication',
        name: c.title,
        url: c.alternates.find(([lang]) => lang === c.lang)?.[1],
        inLanguage: c.lang,
        offers: { price: '0' },
      })
      expect(graph[1]).toMatchObject({ '@type': 'BreadcrumbList' })
      // Home › Solutions › the tool › the variant.
      expect(graph[1]?.itemListElement).toHaveLength(4)
    })

    test('starts the tool with the preset options', async ({ page }) => {
      await page.goto(c.path)
      await expect(page.getByRole('radio', { name: c.lowerLabel })).toBeChecked()
      const download = page.waitForEvent('download')
      await page.locator('input[type="file"]').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Hello, Mochifile!'),
      })
      await page.getByRole('link', { name: /notes-lower\.txt/ }).click()
      const file = await download
      expect(file.suggestedFilename()).toBe('notes-lower.txt')
    })
  })
}

// The V2 home leads to the image compressor and its 50 KB page (home-page.spec.ts); every other
// variant is one step further, on the tool's page, where the tool lists its own variants.
test('the home page leads to variant pages through their tool', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('main').getByRole('link', { name: 'Start for free' }).click()
  await expect(page).toHaveURL('/compress-image/')
  await expect(page.getByRole('link', { name: 'Compress an image to 20 KB' })).toHaveAttribute(
    'href',
    '/compress-image-to-20kb/',
  )
})

test('the sitemap lists translated alternates for tool pages', async ({ request }) => {
  const xml = await (await request.get('/sitemap-0.xml')).text()
  const entry =
    /<url><loc>https:\/\/mochifile\.com\/pt\/ferramenta-modelo\/<\/loc>(.*?)<\/url>/.exec(xml)?.[1]
  expect(entry).toContain(`hreflang="en" href="${SITE}/template-tool/"`)
  expect(entry).toContain(`hreflang="x-default" href="${SITE}/template-tool/"`)
})
