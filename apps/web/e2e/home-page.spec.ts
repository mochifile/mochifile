import AxeBuilder from '@axe-core/playwright'
import type { APIRequestContext, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * The home page ("Bloco e cartão"): the "Start here" card, the tool list and the privacy band.
 * Every destination comes from the tool registry; the e2e build also has the template tool (a
 * second tool, in a second category), so the list is checked with two groups here and with one
 * tool in the unit tests (src/lib/home.test.ts).
 */

const LOCALES = [
  {
    locale: 'en',
    browserLocale: 'en-US',
    path: '/',
    heading: 'Your files, the right size.',
    action: 'Compress a photo',
    tool: '/compress-image/',
    toolTitle: 'Compress an image to a target size',
    sizes: 'Popular sizes',
    otherSizes: 'Other target sizes',
    featured: ['50 KB', '100 KB', '200 KB'],
    others: ['20 KB', '500 KB', '1 MB'],
    groups: ['Image', 'PDF'],
    tools: 'Tools',
    privacy: "Your files don't leave your device.",
  },
  {
    locale: 'pt',
    browserLocale: 'pt-BR',
    path: '/pt/',
    heading: 'Seus arquivos do tamanho certo.',
    action: 'Comprimir uma foto',
    tool: '/pt/comprimir-imagem/',
    toolTitle: 'Comprimir imagem para o tamanho que você precisa',
    sizes: 'Tamanhos mais pedidos',
    otherSizes: 'Outros tamanhos',
    featured: ['50 KB', '100 KB', '200 KB'],
    others: ['20 KB', '500 KB', '1 MB'],
    groups: ['Imagem', 'PDF'],
    tools: 'Ferramentas',
    privacy: 'Seus arquivos não saem do seu aparelho.',
  },
] as const

const WIDTHS = [320, 360, 390, 600, 768, 1024, 1440]

/** The key that moves focus to the next link (WebKit on macOS follows the system setting). */
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'

const main = (page: Page) => page.getByRole('main')
const sizesNav = (page: Page, name: string) => main(page).getByRole('navigation', { name })

/** Paths listed in the sitemap: everything published. */
async function publishedPaths(request: APIRequestContext): Promise<Set<string>> {
  const xml = await (await request.get('/sitemap-0.xml')).text()
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname))
}

/** A context whose browser language matches the page, so no language suggestion shows. */
async function openHome(
  testBrowser: import('@playwright/test').Browser,
  c: (typeof LOCALES)[number],
  options: { width: number; height?: number; colorScheme?: 'light' | 'dark' },
) {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    viewport: { width: options.width, height: options.height ?? 900 },
    locale: c.browserLocale,
  })
  const page = await context.newPage()
  // On the page, not the context: in CI, Firefox ignored the context's `colorScheme` and drew
  // the light theme (site-footer.spec.ts sets it the same way).
  await page.emulateMedia({ colorScheme: options.colorScheme ?? 'light' })
  await page.goto(c.path)
  await page.evaluate(() => document.fonts.ready)
  return { context, page }
}

for (const c of LOCALES) {
  test.describe(`home ${c.path}`, () => {
    test('the primary action opens the general Compress image page', async ({ page }) => {
      await page.goto(c.path)
      const action = page.locator('[data-primary-action]')
      await expect(action).toHaveCount(1)
      await expect(action).toHaveAccessibleName(c.action)
      await expect(action).toHaveAttribute('href', c.tool)
      await action.click()
      await expect(page).toHaveURL(c.tool)
      // The general page, not a variant: it starts from the manifest's default target.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.toolTitle)
    })

    test('size presets are real variant pages, labelled with their target', async ({
      page,
      request,
    }) => {
      await page.goto(c.path)
      const published = await publishedPaths(request)
      const nav = sizesNav(page, c.sizes)
      const featured = nav.locator('[data-featured-sizes] a')
      const others = nav.locator('[data-other-sizes] a')
      await expect(featured).toHaveText([...c.featured])
      await expect(others).toHaveText([...c.others])
      await expect(nav.getByRole('list', { name: c.otherSizes })).toBeVisible()

      for (const link of [...(await featured.all()), ...(await others.all())]) {
        const href = (await link.getAttribute('href')) ?? ''
        const label = (await link.textContent()) ?? ''
        expect(published.has(href), `${href} is published`).toBe(true)
        // Named by the page it opens, which contains the visible label (WCAG 2.5.3).
        const name = await link.evaluate((el) => el.getAttribute('aria-label') ?? '')
        expect(name).toContain(label)
        const target = await request.get(href)
        expect(target.status(), href).toBe(200)
        expect(await target.text()).toMatch(new RegExp(`<h1[^>]*>${name}</h1>`))
      }
    })

    test('lists the published tools from the registry, one group per category', async ({
      page,
      request,
    }) => {
      await page.goto(c.path)
      const published = await publishedPaths(request)
      const section = main(page).getByRole('region', { name: c.tools })
      // Two categories in the e2e build (compress-image and the template tool): each group is a
      // labelled list with at least one tool.
      const lists = section.getByRole('list')
      await expect(lists).toHaveCount(c.groups.length)
      for (const [index, group] of c.groups.entries()) {
        await expect(lists.nth(index)).toHaveAccessibleName(group)
        expect(await lists.nth(index).getByRole('link').count()).toBeGreaterThan(0)
      }
      const hrefs = await section
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      expect(hrefs).toContain(c.tool)
      for (const href of hrefs) expect(published.has(href), `${href} is published`).toBe(true)
      // The tool's block is named by its title and purpose; its "MB → KB" picture is hidden.
      await expect(section.getByRole('link', { name: c.toolTitle })).toBeVisible()
      await expect(section.getByText('MB → KB')).toHaveAttribute('aria-hidden', 'true')
    })

    test('links only to published pages and existing files', async ({ page, request }) => {
      await page.goto(c.path)
      const published = await publishedPaths(request)
      const hrefs = await main(page)
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      expect(hrefs.length).toBeGreaterThan(0)
      for (const href of hrefs) {
        if (href.startsWith('https://')) {
          expect(href).toBe('https://github.com/mochifile/mochifile')
          continue
        }
        expect(published.has(href), `${href} is published`).toBe(true)
      }
      // Tools count as released once the registry publishes them (the sitemap check above); no
      // page outside the tools exists yet: search, about, help, pricing, account or API.
      expect(
        hrefs.filter((href) => /search|about|help|pric|login|account|api/i.test(href)),
      ).toEqual([])
    })

    test('decorations are hidden from assistive technology', async ({ page }) => {
      await page.goto(c.path)
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toHaveAccessibleName(c.heading)
      await expect(heading.locator('[data-measure]')).toHaveAttribute('aria-hidden', 'true')
      for (const svg of await main(page).locator('svg').all()) {
        const hidden = await svg.evaluate((el) => Boolean(el.closest('[aria-hidden="true"]')))
        expect(hidden).toBe(true)
      }
      await expect(main(page).getByRole('img')).toHaveCount(0)
    })

    test('has the heading outline: one h1, then sections', async ({ page }) => {
      await page.goto(c.path)
      const headings = await main(page)
        .getByRole('heading')
        .evaluateAll((els) => els.map((el) => `${el.tagName} ${el.textContent?.trim()}`))
      expect(headings[0]).toMatch(/^H1 /)
      expect(headings.filter((h) => h.startsWith('H1'))).toHaveLength(1)
      expect(headings).toContain(`H2 ${c.tools}`)
      expect(headings).toContain(`H2 ${c.privacy}`)
      // Never skip a level going down.
      const levels = headings.map((h) => Number(h[1]))
      for (const [index, level] of levels.entries()) {
        if (index > 0) expect(level - (levels[index - 1] ?? 1)).toBeLessThanOrEqual(1)
      }
    })

    test('keyboard: the action comes first in the content, with a visible focus ring', async ({
      testBrowser,
      browserName,
    }) => {
      const { context, page } = await openHome(testBrowser, c, { width: 1280 })
      try {
        const TAB = tabKey(browserName)
        let found = false
        for (let i = 0; i < 20 && !found; i++) {
          await page.keyboard.press(TAB)
          found = await page.evaluate(() =>
            Boolean(document.activeElement?.matches('[data-primary-action]')),
          )
        }
        expect(found, 'the primary action is reachable with Tab').toBe(true)
        const ring = await page.evaluate(() => {
          const style = getComputedStyle(document.activeElement as Element)
          return { style: style.outlineStyle, width: style.outlineWidth }
        })
        expect(ring).toEqual({ style: 'solid', width: '3px' })
        // Then the sizes, in reading order.
        const next: string[] = []
        for (let i = 0; i < c.featured.length + c.others.length; i++) {
          await page.keyboard.press(TAB)
          next.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''))
        }
        expect(next).toEqual([...c.featured, ...c.others])
      } finally {
        await context.close()
      }
    })
  })
}

for (const width of WIDTHS) {
  test(`fits ${width} px without overflow, hidden focusable content or small targets`, async ({
    testBrowser,
  }) => {
    for (const c of LOCALES) {
      const { context, page } = await openHome(testBrowser, c, { width })
      try {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `${c.path} scrolls sideways`).toBeLessThanOrEqual(0)

        const problems = await main(page)
          .locator('a, button, [tabindex]:not([tabindex="-1"])')
          .evaluateAll((els) =>
            els.flatMap((el) => {
              const r = el.getBoundingClientRect()
              const name = el.textContent?.trim()
              if (!el.checkVisibility({ visibilityProperty: true })) return [`${name}: hidden`]
              return r.height < 44 || r.width < 44 ? [`${name}: ${r.width}×${r.height}`] : []
            }),
          )
        expect(problems, c.path).toEqual([])

        // No hero text runs under the mascot or the drops, and the card clips nothing.
        const overlaps = await page.evaluate(() => {
          const decorations = [...document.querySelectorAll('[data-decoration]')]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0)
          if (decorations.length === 0) return ['no mascot']
          const hero = document.querySelector('#home-heading')?.closest('section')
          const texts = [...(hero?.querySelectorAll('h1, p, li') ?? [])].filter(
            (el) => !el.closest('[data-start-card]') && !el.closest('ol'),
          )
          return texts.flatMap((el) => {
            const r = el.getBoundingClientRect()
            const hit = decorations.some(
              (d) =>
                r.width > 0 &&
                r.left < d.right &&
                r.right > d.left &&
                r.top < d.bottom &&
                r.bottom > d.top,
            )
            return hit ? [el.textContent?.trim().slice(0, 30)] : []
          })
        })
        expect(overlaps, `${c.path} text under a decoration`).toEqual([])
        const clipped = await page.locator('[data-start-card]').evaluate((card) => {
          const box = card.getBoundingClientRect()
          return [...card.querySelectorAll('*')]
            .filter((el) => {
              const r = el.getBoundingClientRect()
              return (
                r.width > 0 && (r.left < box.left || r.right > box.right || r.bottom > box.bottom)
              )
            })
            .map((el) => el.textContent?.trim().slice(0, 30))
        })
        expect(clipped, `${c.path} card content outside the card`).toEqual([])
      } finally {
        await context.close()
      }
    }
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    test(`has no axe violations (${colorScheme} theme, ${width} px)`, async ({ testBrowser }) => {
      for (const c of LOCALES) {
        const { context, page } = await openHome(testBrowser, c, { width, colorScheme })
        try {
          // The theme really applies: the page ground follows the colour scheme.
          const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
          expect(ground).toBe(colorScheme === 'light' ? 'rgb(255, 247, 236)' : 'rgb(23, 20, 31)')
          const result = await new AxeBuilder({ page }).analyze()
          expect(result.violations, c.path).toEqual([])
        } finally {
          await context.close()
        }
      }
    })
  }
}

test('nothing moves on its own, and presses do not animate under reduced motion', async ({
  testBrowser,
}) => {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    reducedMotion: 'reduce',
  })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    const transition = await page
      .locator('[data-primary-action]')
      .evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(transition).toBe('0s')
  } finally {
    await context.close()
  }
})
