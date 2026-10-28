import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * The V2 pricing page (docs/design-ref/v2, MFPricing). Visual first: everything the artboard draws
 * is there, although nothing paid can be bought, so every paid button is disabled and no step of
 * a purchase exists. The Monthly / Yearly switch and the questions work without JavaScript.
 */

const PAGES = {
  en: {
    path: '/pricing/',
    other: '/pt/precos/',
    title: 'Pricing — Mochifile',
    h1: 'Simple, honest pricing',
    toggle: 'Billing period',
    monthly: 'Monthly',
    yearly: 'Yearly',
    soon: 'Coming soon',
    plans: [
      { name: 'Mochi Starter', month: '$1.99', year: '$1.49', save: 'Save 25%' },
      { name: 'Mochi Pro', month: '$2.99', year: '$1.99', save: 'Save 33%' },
      { name: 'Mochi Max', month: '$5.99', year: '$4.49', save: 'Save 25%' },
    ],
    yearlyRow: ['$17.88 ($1.49/mo)', '$23.88 ($1.99/mo)', '$53.88 ($4.49/mo)'],
    free: 'Free',
    freeTools: 'Use the free tools',
    freeHref: '/compress-image/',
    compare: 'Full comparison',
    faq: 'Common questions',
    questions: 6,
    learnMore: 'Learn more →',
    popular: 'Most popular',
  },
  pt: {
    path: '/pt/precos/',
    other: '/pricing/',
    title: 'Preços — Mochifile',
    h1: 'Preços simples e honestos',
    toggle: 'Período de cobrança',
    monthly: 'Mensal',
    yearly: 'Anual',
    soon: 'Em breve',
    plans: [
      { name: 'Mochi Starter', month: 'US$ 1,99', year: 'US$ 1,49', save: 'Economize 25%' },
      { name: 'Mochi Pro', month: 'US$ 2,99', year: 'US$ 1,99', save: 'Economize 33%' },
      { name: 'Mochi Max', month: 'US$ 5,99', year: 'US$ 4,49', save: 'Economize 25%' },
    ],
    yearlyRow: ['US$ 17,88 (US$ 1,49/mês)', 'US$ 23,88 (US$ 1,99/mês)', 'US$ 53,88 (US$ 4,49/mês)'],
    free: 'Grátis',
    freeTools: 'Usar as ferramentas grátis',
    freeHref: '/pt/comprimir-imagem/',
    compare: 'Comparação completa',
    faq: 'Perguntas frequentes',
    questions: 6,
    learnMore: 'Saiba mais →',
    popular: 'Mais popular',
  },
} as const

/** Text with no-break spaces turned into plain ones, as `Intl` writes "US$ 1,99". */
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()
const plan = (page: Page, name: string) => page.locator('[data-plan]').filter({ hasText: name })
const notice = (page: Page) => page.locator('#pricing-soon:popover-open')

for (const [locale, copy] of Object.entries(PAGES)) {
  test.describe(`pricing (${locale})`, () => {
    test('has its title, language, canonical and hreflang alternates', async ({ page }) => {
      await page.goto(copy.path)
      await expect(page).toHaveTitle(copy.title)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${copy.path}$`),
      )
      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
        )
      expect(alternates.map(([lang]) => lang).sort()).toEqual(['en', 'pt', 'x-default'])
      expect(alternates.some(([, href]) => href?.endsWith(copy.other))).toBe(true)
    })

    test('draws the three plans, the free plan and the closing card as designed', async ({
      page,
      request,
    }) => {
      await page.goto(copy.path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.h1)
      await expect(page.locator('[data-plan]')).toHaveCount(3)
      for (const { name, month, save } of copy.plans) {
        const card = plan(page, name)
        await expect(card.getByRole('heading', { name })).toBeVisible()
        await expect(card.locator('[data-monthly].prc-price')).toHaveText(month)
        await expect(card.getByText(save)).toBeVisible()
        // Dashed "Coming soon" pill, and a disabled button: nothing can be bought.
        await expect(card.locator('.prc-pill--soon')).toHaveText(copy.soon)
        const button = card.getByRole('button')
        await expect(button).toBeDisabled()
        await expect(button).toHaveText(copy.soon)
        await expect(button).toHaveAccessibleName(`${name}: ${copy.soon.toLowerCase()}`, {
          ignoreCase: true,
        })
        expect(await card.getByRole('listitem').count()).toBeGreaterThanOrEqual(4)
      }
      // Only Pro is the popular one, with its pill and purple border.
      await expect(page.getByText(copy.popular)).toHaveCount(1)
      await expect(plan(page, 'Mochi Pro').getByText(copy.popular)).toBeVisible()
      expect(
        await plan(page, 'Mochi Pro').evaluate((el) => getComputedStyle(el).borderTopWidth),
      ).toBe('2px')

      // The free plan: $0, four reasons, and the way to the free tools (a page that exists).
      const free = page.locator('section[aria-labelledby="pricing-free"]')
      await expect(free.getByRole('heading', { name: copy.free, exact: true })).toBeVisible()
      await expect(free.locator('.prc-price--small')).toContainText('0')
      await expect(free.getByRole('listitem')).toHaveCount(4)
      for (const link of await page.getByRole('link', { name: copy.freeTools }).all()) {
        await expect(link).toHaveAttribute('href', copy.freeHref)
      }
      expect((await request.get(copy.freeHref)).status()).toBe(200)
      await expect(page.getByRole('link', { name: copy.freeTools })).toHaveCount(2)
      await expect(page.getByRole('heading', { name: copy.compare })).toBeVisible()
      await expect(page.getByRole('heading', { name: copy.faq })).toBeVisible()
      await expect(page.locator('.prc-cta img')).toHaveAttribute('alt', '')
    })

    test('the Monthly / Yearly switch changes the prices and works from the keyboard', async ({
      page,
    }) => {
      await page.goto(copy.path)
      const group = page.getByRole('group', { name: copy.toggle })
      await expect(group).toBeVisible()
      await expect(group.getByRole('radio', { name: copy.monthly })).toBeChecked()
      const visiblePrices = () =>
        page
          .locator('.prc-plan .prc-price')
          .evaluateAll((els) =>
            els
              .filter((el) => getComputedStyle(el).display !== 'none')
              .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
          )
      expect(await visiblePrices()).toEqual(copy.plans.map((p) => plain(p.month)))

      await group.getByText(copy.yearly, { exact: true }).click()
      await expect(group.getByRole('radio', { name: copy.yearly })).toBeChecked()
      expect(await visiblePrices()).toEqual(copy.plans.map((p) => plain(p.year)))
      // The yearly line replaces the monthly one in each card.
      await expect(
        page.locator('.prc-plan [data-yearly].prc-small, .prc-plan span[data-yearly]').first(),
      ).toBeVisible()
      // The table keeps both billing rows, as designed.
      for (const cell of copy.yearlyRow)
        await expect(page.getByRole('cell', { name: plain(cell) })).toBeVisible()

      // Back with the arrow keys, from the focused radio.
      await group.getByRole('radio', { name: copy.yearly }).focus()
      await page.keyboard.press('ArrowLeft')
      await expect(group.getByRole('radio', { name: copy.monthly })).toBeChecked()
      expect(await visiblePrices()).toEqual(copy.plans.map((p) => plain(p.month)))
    })

    test('the comparison table is a real table with the canvas rows', async ({ page }) => {
      await page.goto(copy.path)
      const table = page.getByRole('table', { name: copy.compare })
      await expect(table.locator('thead').getByRole('columnheader')).toHaveCount(5)
      await expect(table.getByRole('row')).toHaveCount(1 + 3 + 5 + 8 + 3)
      // Checks and dashes have text for assistive technology.
      const included = locale === 'en' ? 'Included' : 'Incluído'
      const notIncluded = locale === 'en' ? 'Not included' : 'Não incluído'
      expect(await table.getByText(notIncluded).count()).toBeGreaterThan(5)
      expect(await table.getByText(included).count()).toBeGreaterThan(10)
      // Nothing paid is on sale: the last row says so in every paid column.
      const availability = table.getByRole('row').last()
      await expect(availability.getByRole('cell')).toHaveCount(4)
      expect(plain(await availability.getByRole('cell').nth(1).textContent())).toBe(copy.soon)
    })

    test('"Learn more" says coming soon and goes nowhere; the questions open and close', async ({
      page,
    }) => {
      await page.goto(copy.path)
      await page.getByRole('button', { name: new RegExp(copy.learnMore) }).click()
      await expect(notice(page)).toBeVisible()
      await expect(notice(page)).toHaveAttribute('role', 'status')
      expect(new URL(page.url()).pathname).toBe(copy.path)
      await page.keyboard.press('Escape')
      await expect(notice(page)).toHaveCount(0)

      const items = page.locator('.prc-faq details')
      await expect(items).toHaveCount(copy.questions)
      const first = items.first()
      await expect(first).not.toHaveAttribute('open', '')
      await first.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(first).toHaveAttribute('open', '')
      await expect(first.locator('p')).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(first).not.toHaveAttribute('open', '')
    })

    test('stays light and has no axe violations, in a light and a dark system theme', async ({
      page,
    }) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(copy.path)
          // Light only: the page is cream and its text ink, whatever the system prefers.
          const colours = await page.locator('.prc').evaluate((el) => {
            const style = getComputedStyle(el)
            return [style.backgroundColor, style.color]
          })
          expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
          const results = await new AxeBuilder({ page }).include('[data-pricing]').analyze()
          expect(results.violations, `${colorScheme}, ${width}px`).toEqual([])
        }
      }
    })

    test('fits from 320 to 1440 px; only the table scrolls, inside its own box', async ({
      page,
    }) => {
      for (const width of [320, 360, 390, 640, 768, 1024, 1100, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(copy.path)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${width}px: sideways scrolling`,
        ).toBeLessThanOrEqual(width)
        // The plans: three columns from 1101 px, one column up to 520 px wide below.
        const boxes = await page.locator('[data-plan]').evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width }
          }),
        )
        if (width > 1100) expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1)
        else {
          expect(new Set(boxes.map((b) => Math.round(b.x))).size).toBe(1)
          expect(boxes[0]?.w ?? 0).toBeLessThanOrEqual(520)
        }
        for (const box of boxes) expect(box.x).toBeGreaterThanOrEqual(0)
      }
      // At phone width the table is wider than its box and the box takes the keyboard.
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(copy.path)
      const wrap = page.locator('.prc-table-wrap')
      await expect(wrap).toHaveAttribute('role', 'region')
      expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await wrap.focus()
      await expect(wrap).toBeFocused()
    })
  })
}

test('the Yearly switch and the questions work with JavaScript disabled', async ({
  testBrowser,
}) => {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    javaScriptEnabled: false,
  })
  try {
    const page = await context.newPage()
    await page.goto('/pricing/')
    await page.locator('label[for="billing-yearly"]').click()
    await expect(plan(page, 'Mochi Starter').locator('.prc-price[data-yearly]')).toBeVisible()
    await expect(plan(page, 'Mochi Starter').locator('.prc-price[data-monthly]')).toBeHidden()
    await page.locator('.prc-faq summary').first().click()
    await expect(page.locator('.prc-faq details').first().locator('p')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('nothing on the page can start a purchase', async ({ page }) => {
  await page.goto('/pricing/')
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  // Every paid button is disabled, so a press does nothing; the page has no form.
  for (const button of await page.locator('[data-plan] button').all()) {
    await button.click({ force: true }).catch(() => undefined)
  }
  await expect(page.locator('form')).toHaveCount(0)
  const hrefs = await page
    .locator('[data-pricing] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(
    hrefs.filter((href) => /checkout|buy|subscribe|paddle|stripe|billing/i.test(href)),
  ).toEqual([])
  expect(requests.filter((path) => /checkout|buy|subscribe/i.test(path))).toEqual([])
  expect(new URL(page.url()).pathname).toBe('/pricing/')
})

test('the sitemap lists both pricing pages with their alternates', async ({ request }) => {
  const index = await (await request.get('/sitemap-index.xml')).text()
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname)
  const bodies = await Promise.all(files.map(async (file) => (await request.get(file)).text()))
  const sitemap = bodies.join('\n')
  expect(sitemap).toContain('/pricing/')
  expect(sitemap).toContain('/pt/precos/')
})
