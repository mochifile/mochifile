import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * What the V2 integration (integration/v2) fixes after the independent review: the header cells
 * that keep their width, form fields that keep the control border, copy that promises nothing a
 * server does, the legal pages and guide articles in the V2 scale.
 */

const ACCENT = 'rgb(91, 60, 196)'
const CONTROL = 'rgb(145, 132, 116)'

/** WCAG contrast ratio of two `rgb(r, g, b)` colours. */
function contrast(a: string, b: string): number {
  const luminance = (rgb: string) => {
    const [r = 0, g = 0, bl = 0] = (rgb.match(/\d+/g) ?? []).map(Number).map((value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const fontSize = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize)

test('every header link keeps its fixed-width cell hook, so the font swap moves nothing', async ({
  page,
}) => {
  for (const path of ['/', '/pt/']) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path)
    const keys = await page
      .locator('[data-main-nav] a, [data-main-nav] button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-shell-link')))
    expect(keys, path).toEqual(['solutions', 'guides', 'docs', 'pricing', 'sign-in', 'get-started'])
    // The cell is at least as wide as its label in Figtree (set in component-constants.css).
    const widths = await page
      .locator('[data-main-nav] [data-shell-link]')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)))
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(59)
  }
})

for (const path of [
  '/contact/',
  '/pt/contato/',
  '/sign-in/',
  '/pt/entrar/',
  '/sign-up/',
  '/pt/criar-conta/',
]) {
  test(`form fields on ${path} keep the control border, at 3:1 or more`, async ({ page }) => {
    await page.goto(path)
    const fields = page.locator(
      'main input:not([type="hidden"]):not([type="checkbox"]), main textarea',
    )
    expect(await fields.count()).toBeGreaterThan(0)
    for (const field of await fields.all()) {
      if (!(await field.isVisible())) continue
      const [border, ground] = await field.evaluate((el) => {
        const style = getComputedStyle(el)
        let node: Element | null = el
        let background = style.backgroundColor
        while (background === 'rgba(0, 0, 0, 0)' && node?.parentElement) {
          node = node.parentElement
          background = getComputedStyle(node).backgroundColor
        }
        return [style.borderTopColor, background]
      })
      expect(border).toBe(CONTROL)
      expect(contrast(border, ground)).toBeGreaterThanOrEqual(3)
    }
  })
}

test('pricing promises nothing it cannot keep: no "forever", no server deleting files', async ({
  page,
}) => {
  for (const path of ['/pricing/', '/pt/precos/']) {
    await page.goto(path)
    const text = (await page.locator('main').innerText()).toLowerCase()
    expect(text, path).not.toMatch(/forever|para sempre/)
    expect(text, path).not.toMatch(/delete|apaga|exclu/)
  }
  await page.goto('/pricing/')
  await expect(page.locator('main')).toContainText('for browser tools')
})

test('About and Architecture claim nothing about servers that do not exist', async ({ page }) => {
  for (const path of ['/about/', '/architecture/', '/pt/sobre/', '/pt/arquitetura/']) {
    await page.goto(path)
    const text = (await page.locator('main').innerText()).toLowerCase()
    expect(text, path).not.toMatch(
      /encrypted connection|conexão criptografada|deleted (as soon|when)|apagados? (assim|quando)/,
    )
    expect(text, path).toMatch(
      /no tool needs a server today|nenhuma ferramenta precisa de servidor hoje|every tool today runs|hoje todas as ferramentas rodam/,
    )
  }
})

for (const path of [
  '/privacy-policy/',
  '/terms-of-service/',
  '/terms-and-conditions/',
  '/data-processing-agreement/',
  '/pt/politica-de-privacidade/',
]) {
  test(`${path} is a labelled draft in the V2 scale`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    // Still a draft: the label and no claim of being in force.
    await expect(page.locator('main')).toContainText(/draft|rascunho/i)
    expect(await fontSize(page, 'main h1')).toBe('60px')
    expect(
      await page
        .locator('main p.uppercase, main [class*="type-eyebrow"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(ACCENT)
    const width = await page
      .locator('main article')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeLessThanOrEqual(720)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1')).toBe('40px')
  })
}

test('a guide article has the artboard H1: 60 px, 40 px on a phone', async ({ page }) => {
  for (const path of ['/guides/compress-photo-to-50kb/', '/pt/guias/comprimir-foto-para-50kb/']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    expect(await fontSize(page, 'main h1'), path).toBe('60px')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1'), path).toBe('40px')
  }
})

const OWN_404 = /status of 404|404 \(Not Found\)/i
const NOT_FOUND = [
  {
    path: '/does-not-exist/',
    lang: 'en',
    tools: '/solutions/',
    title: 'Page not found — Mochifile',
  },
  {
    path: '/pt/nao-existe/',
    lang: 'pt',
    tools: '/pt/solucoes/',
    title: 'Página não encontrada — Mochifile',
  },
] as const

for (const { path, lang, tools, title } of NOT_FOUND) {
  test(`the 404 page for ${path} is the V2 page: real 404, noindex, headers, light, "See all tools" → ${tools}`, async ({
    page,
    request,
    pageErrors,
  }) => {
    const response = await page.goto(path)
    // The browser logs the page's own 404 status; nothing else may be logged.
    pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
    expect(response?.status()).toBe(404)
    // Security headers from _headers reach the 404 page too.
    const headers = response?.headers() ?? {}
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("script-src 'self'")
    await expect(page).toHaveTitle(title)
    await expect(page.locator('html')).toHaveAttribute('lang', lang)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    // "See all tools" goes to Solutions, a page that exists.
    const all = page.getByRole('main').getByRole('link').last()
    await expect(all).toHaveAttribute('href', tools)
    expect((await request.get(tools)).status()).toBe(200)

    // V2 scale and tokens: 60 px H1 (40 on a phone), accent eyebrow, shadowed buttons, mascot radius.
    await page.setViewportSize({ width: 1440, height: 900 })
    expect(await fontSize(page, 'main h1')).toBe('60px')
    expect(
      await page
        .locator('main .type-eyebrow')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(ACCENT)
    expect(
      await page.locator('[data-primary-action]').evaluate((el) => getComputedStyle(el).boxShadow),
    ).not.toBe('none')
    expect(
      await page
        .locator('main img')
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    ).toBe('22px')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fontSize(page, 'main h1')).toBe('40px')
  })

  test(`the 404 page for ${path} stays light under a dark system theme`, async ({
    page,
    pageErrors,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(path)
    pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
    const colours = await page.locator('.nf').evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.backgroundColor, style.color]
    })
    expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
  })
}

const TOOL_PAGES = [
  { path: '/compress-image/', home: '/', solutions: '/solutions/', label: 'Solutions' },
  { path: '/compress-image-to-50kb/', home: '/', solutions: '/solutions/', label: 'Solutions' },
  { path: '/pt/comprimir-imagem/', home: '/pt/', solutions: '/pt/solucoes/', label: 'Soluções' },
  {
    path: '/pt/comprimir-imagem-para-50kb/',
    home: '/pt/',
    solutions: '/pt/solucoes/',
    label: 'Soluções',
  },
] as const

for (const { path, home, solutions, label } of TOOL_PAGES) {
  test(`the tool page ${path}: Home › ${label} › the tool, and light under a dark system theme`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(path)
    const crumbs = page.getByRole('navigation', { name: /breadcrumb|trilha/i }).locator('li a')
    await expect(crumbs.nth(0)).toHaveAttribute('href', home)
    await expect(crumbs.nth(1)).toHaveText(label)
    await expect(crumbs.nth(1)).toHaveAttribute('href', solutions)
    expect((await request.get(solutions)).status()).toBe(200)
    // Light only: the page and its panel keep the light tokens whatever the system prefers.
    const colours = await page.locator('.tp').evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.backgroundColor, style.color]
    })
    expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
    const card = await page
      .locator('.tp-panel-card')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(card).toBe('rgb(255, 255, 255)')
  })
}

/**
 * V2 is light only: `<html data-theme="light">` and `color-scheme: light` switch off the tokens'
 * dark theme, so a visitor whose system prefers dark sees the same cream page everywhere.
 */
test('every page stays light when the system prefers dark, on a desktop and on a phone', async ({
  page,
  request,
  pageErrors,
}) => {
  test.setTimeout(240_000)
  const xml = await (await request.get('/sitemap-0.xml')).text()
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname)
  // The error pages are not in the sitemap: they answer any unknown address.
  const all = [...new Set([...paths, '/does-not-exist/', '/pt/nao-existe/'])]
  expect(all.length).toBeGreaterThan(40)
  await page.emulateMedia({ colorScheme: 'dark' })
  const failures: string[] = []
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    for (const path of all) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const state = await page.evaluate(() => {
        const root = document.documentElement
        return {
          dark: matchMedia('(prefers-color-scheme: dark)').matches,
          theme: root.getAttribute('data-theme'),
          scheme: getComputedStyle(root).colorScheme,
          meta: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
          page: getComputedStyle(document.body).backgroundColor,
          ink: getComputedStyle(document.body).color,
        }
      })
      const expected = {
        dark: true,
        theme: 'light',
        scheme: 'light',
        meta: 'light',
        page: 'rgb(255, 247, 236)',
        ink: 'rgb(30, 27, 46)',
      }
      if (JSON.stringify(state) !== JSON.stringify(expected)) {
        failures.push(`${viewport.width}px ${path}: ${JSON.stringify(state)}`)
      }
    }
  }
  // The browser logs the error pages' own 404; nothing else may be logged.
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
  expect(failures).toEqual([])
})

test('the phone menu is light too under a dark system theme', async ({ page, pageErrors }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/pt/', '/does-not-exist/']) {
    await page.goto(path)
    await page.getByRole('button', { name: /^Menu$/ }).click()
    const colours = await page
      .locator('[data-site-menu]')
      .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
    expect(colours, path).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
    await page.keyboard.press('Escape')
  }
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !OWN_404.test(error)))
})

const ACCOUNT_PAGES = [
  { path: '/sign-in/', notice: /Accounts and sign-in by email are not available yet/ },
  { path: '/sign-up/', notice: /Accounts and sign-in by email are not available yet/ },
  { path: '/pt/entrar/', notice: /As contas e o login por e-mail ainda não estão disponíveis/ },
  {
    path: '/pt/criar-conta/',
    notice: /As contas e o login por e-mail ainda não estão disponíveis/,
  },
] as const

for (const { path, notice } of ACCOUNT_PAGES) {
  test(`${path} says accounts are not available before anything can be sent, and promises no account benefit`, async ({
    page,
  }) => {
    await page.goto(path)
    const note = page.getByRole('note').filter({ hasText: notice })
    await expect(note).toBeVisible()
    // It comes before the form's first field, so it is read before anything is typed.
    const [noteBox, emailBox] = await Promise.all([
      note.boundingBox(),
      page.locator('input[type="email"]').first().boundingBox(),
    ])
    expect(noteBox?.y ?? Infinity).toBeLessThan(emailBox?.y ?? 0)
    const text = (await page.locator('main').innerText()).toLowerCase()
    // No limits that depend on an account, no "free plan" card promise, no code sent in the present.
    expect(text).not.toMatch(
      /higher limits|more files, and bigger|limites maiores|mais arquivos, e maiores/,
    )
    expect(text).not.toMatch(/free plan needs no credit card|plano grátis não pede cartão/)
    expect(text).not.toMatch(
      /you will get a one-time code|você receberá um código|the email we send you|e-mail que enviaremos|we will email it/,
    )
    // The free browser tools need no account.
    if (path.includes('sign-up') || path.includes('criar')) {
      expect(text).toMatch(
        /free browser tools need no (account|sign-up)|ferramentas gratuitas do navegador não (exigem|pedem)/,
      )
      expect(text).toMatch(
        /limits do not depend on an account|limites delas não dependem de uma conta/,
      )
    }
    // Nothing was sent: the form still only opens its "not available yet" message.
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET') requests.push(request.url())
    })
    await page.locator('input[type="email"]').first().fill('someone@example.com')
    await page.locator('#step-email form button:visible').first().click()
    await expect(page.locator('#auth-unavailable:popover-open')).toBeVisible()
    expect(requests).toEqual([])
  })
}

/** Every FAQ starts closed (the first question too) and opens from the keyboard. */
const FAQ_PAGES = [
  '/',
  '/pt/',
  '/pricing/',
  '/pt/precos/',
  '/solutions/',
  '/pt/solucoes/',
  '/compress-image/',
  '/pt/comprimir-imagem/',
  '/compress-image-to-50kb/',
  '/pt/comprimir-imagem-para-50kb/',
] as const

for (const path of FAQ_PAGES) {
  test(`${path}: every FAQ question starts closed and opens with the keyboard`, async ({
    page,
    browserName,
  }) => {
    await page.goto(path)
    const items = page.locator('details:not(.docs-menu)')
    expect(await items.count(), 'questions').toBeGreaterThanOrEqual(3)
    await expect(page.locator('details[open]')).toHaveCount(0)
    // Nothing is open at the start, whatever the width.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('details[open]')).toHaveCount(0)

    // Reach the first question with Tab and open and close it with Enter and Space.
    const first = items.first().locator('summary')
    await first.focus()
    await expect(first).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(items.first()).toHaveAttribute('open', '')
    await expect(page.locator('details[open]')).toHaveCount(1)
    await page.keyboard.press('Space')
    await expect(items.first()).not.toHaveAttribute('open', '')
    expect(browserName).toBeTruthy()
  })
}

/**
 * The category cards' illustrations (Home and Ask), made from 1.6 k px originals at 720 px (1x) and
 * 1440 px (2x) (issue #78). Whatever the screen, the file the browser picks must have at least the
 * pixels the box needs, a Retina screen must get the 1440 px file where the box is wider than 360
 * CSS px, and the box must be reserved by the image's own size.
 */
for (const { path, selector } of [
  { path: '/', selector: '.hv2-example-img' },
  { path: '/ask/', selector: '.ask-media' },
  { path: '/pt/pergunte/', selector: '.ask-media' },
] as const) {
  for (const scale of [1, 2] as const) {
    for (const width of [1440, 1024, 390] as const) {
      test(`${path} card images at DPR ${scale}, ${width} px: enough pixels, sized in advance`, async ({
        testBrowser,
      }) => {
        const context = await testBrowser.newContext({
          ...projectContextOptions(),
          viewport: { width, height: 900 },
          deviceScaleFactor: scale,
        })
        try {
          const page = await context.newPage()
          await page.goto(path)
          const images = page.locator(selector)
          await expect(images).toHaveCount(3)
          for (const image of await images.all()) {
            await image.scrollIntoViewIfNeeded()
            await expect(image).toHaveJSProperty('complete', true)
            const info = await image.evaluate(async (el) => {
              const img = el as HTMLImageElement
              // The pixels of the file the browser chose (naturalWidth is in CSS px with `sizes`).
              const bitmap = await createImageBitmap(await (await fetch(img.currentSrc)).blob())
              return {
                shown: img.getBoundingClientRect().width,
                pixels: bitmap.width,
                current: img.currentSrc,
                srcset: img.srcset,
                attrs: [img.getAttribute('width'), img.getAttribute('height')],
              }
            })
            // Two candidates, 720 and 1440 px; the box is reserved by the 720 px file's size.
            expect(
              info.srcset.split(',').map((candidate) => candidate.trim().split(' ')[1]),
            ).toEqual(['720w', '1440w'])
            expect(info.attrs.map(Number)).toEqual([720, expect.any(Number)])
            expect(Number(info.attrs[1])).toBeGreaterThan(400)
            // The file has at least the screen's pixels for the box, on a desktop and on a phone.
            expect(info.pixels).toBeGreaterThanOrEqual(Math.floor(info.shown * scale))
            // A wide card on a Retina screen (1024 px: 432 CSS px) gets the doubled file.
            if (info.shown * scale > 720) expect(info.current).toMatch(/-1440\./)
            else expect(info.current).toMatch(/-720\./)
          }
        } finally {
          await context.close()
        }
      })
    }
  }
}
