import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * Ask Mochifile, V2 (docs/design-ref/v2, MFFlow). Visual first: the prompt box, suggestions,
 * examples and mascots are all there, but the assistant does not exist. Suggestions and examples
 * only write a sentence into the box, the file picker only counts what was chosen, and every
 * other control says "Coming soon". Nothing is sent, read or answered.
 */

const PAGES = {
  en: {
    path: '/ask/',
    other: '/pt/pergunte/',
    title: 'Ask Mochifile — describe what you need',
    h1: 'Drop your files. Tell us what you need.',
    eyebrow: 'Images · Video · PDFs',
    placeholder: 'Describe the result you want…',
    noFiles: 'No files yet',
    twoFiles: '2 files on your device',
    oneFile: '1 file on your device',
    soon: /Coming soon/,
    suggestion: { name: 'Remove BG', prompt: 'Remove the background' },
    example: { name: 'Pages to PNG at 150 DPI', prompt: 'Pages to PNG at 150 DPI' },
    groups: ['Images', 'PDFs', 'Video and audio'],
    english: 'Make it under 50 KB',
    portuguese: 'Deixe com menos de 50 KB',
    trust: ['Private by design', 'No monthly limit'],
    send: /^Send, Coming soon/,
    help: /^Help, Coming soon/,
    paid: /^Paid plans/,
  },
  pt: {
    path: '/pt/pergunte/',
    other: '/ask/',
    title: 'Pergunte ao Mochifile — descreva o que você precisa',
    h1: 'Solte seus arquivos. Diga o que você precisa.',
    eyebrow: 'Imagens · Vídeo · PDFs',
    placeholder: 'Descreva o resultado que você quer…',
    noFiles: 'Nenhum arquivo ainda',
    twoFiles: '2 arquivos no seu aparelho',
    oneFile: '1 arquivo no seu aparelho',
    soon: /Em breve/,
    suggestion: { name: 'Remover fundo', prompt: 'Remova o fundo' },
    example: { name: 'Páginas para PNG a 150 DPI', prompt: 'Páginas para PNG a 150 DPI' },
    groups: ['Imagens', 'PDFs', 'Vídeo e áudio'],
    english: 'Make it under 50 KB',
    portuguese: 'Deixe com menos de 50 KB',
    trust: ['Privacidade desde o projeto', 'Sem limite mensal'],
    send: /^Enviar, Em breve/,
    help: /^Ajuda, Em breve/,
    paid: /^Os planos pagos/,
  },
} as const

const notice = (page: Page) => page.locator('#ask-soon:popover-open')
const input = (page: Page) => page.locator('#ask-input')

for (const [locale, copy] of Object.entries(PAGES)) {
  test.describe(`ask (${locale})`, () => {
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

    test('draws every element of the artboard', async ({ page }) => {
      await page.goto(copy.path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.h1)
      await expect(page.getByText(copy.eyebrow, { exact: true })).toBeVisible()
      // Six example-language chips, in their own scripts.
      const languages = page.getByRole('list', { name: /Example languages|Idiomas dos exemplos/ })
      await expect(languages.getByRole('listitem')).toHaveText(
        [
          '“In English”',
          '“Em português”',
          '“En español”',
          '“En français”',
          '“हिन्दी में”',
          '“用中文”',
        ].map((text) => new RegExp(`^${text}`)),
      )
      // The prompt box: file picker, text field, nine suggestions, files status, help, send.
      await expect(page.locator('#ask-files')).toHaveCount(1)
      await expect(page.locator('label[for="ask-files"]')).toBeVisible()
      await expect(input(page)).toHaveAttribute('placeholder', copy.placeholder)
      await expect(
        page.getByRole('list', { name: /Suggestions|Sugestões/ }).getByRole('listitem'),
      ).toHaveCount(9)
      await expect(page.locator('[data-ask-files-text]')).toHaveText(copy.noFiles)
      await expect(page.getByRole('button', { name: copy.help })).toBeVisible()
      await expect(page.getByRole('button', { name: copy.send })).toBeVisible()
      for (const text of copy.trust)
        await expect(page.getByText(text, { exact: true })).toBeVisible()
      await expect(page.getByText('JPG · PNG · WebP · AVIF · PDF · WebM')).toBeVisible()
      // Three cards with a mascot each and four examples each.
      for (const group of copy.groups) {
        await expect(
          page.getByRole('heading', { name: group, exact: true, level: 3 }),
        ).toBeVisible()
      }
      await expect(page.locator('.ask-example')).toHaveCount(12)
      await expect(page.locator('.ask-media')).toHaveCount(3)
      for (const img of await page.locator('.ask-media').all())
        await expect(img).toHaveAttribute('alt', '')
      await expect(page.getByRole('button', { name: copy.paid })).toBeVisible()
    })

    test('suggestions, examples and sample languages write a sentence into the box', async ({
      page,
    }) => {
      await page.goto(copy.path)
      await page.getByRole('button', { name: copy.suggestion.name, exact: true }).click()
      await expect(input(page)).toHaveValue(copy.suggestion.prompt)
      await expect(input(page)).toBeFocused()

      await page.getByRole('button', { name: copy.example.name }).click()
      await expect(input(page)).toHaveValue(copy.example.prompt)
      await expect(input(page)).toBeFocused()

      await page.getByRole('button', { name: '“In English”' }).click()
      await expect(input(page)).toHaveValue(copy.english)
      await page.getByRole('button', { name: '“Em português”' }).click()
      await expect(input(page)).toHaveValue(copy.portuguese)

      // It is a real field: typing replaces nothing of what the visitor wrote.
      await input(page).fill('')
      await input(page).pressSequentially('Make it small')
      await expect(input(page)).toHaveValue('Make it small')
    })

    test('"Coming soon" controls say so, change nothing and clear on Escape', async ({ page }) => {
      await page.goto(copy.path)
      await input(page).fill('Remove the background')
      for (const control of [
        page.getByRole('button', { name: copy.send }),
        page.getByRole('button', { name: copy.help }),
        page.getByRole('button', { name: copy.paid }),
        page.getByRole('button', { name: /^“En español”/ }),
        page.getByRole('button', { name: /^“用中文”/ }),
      ]) {
        await control.click()
        await expect(notice(page)).toBeVisible()
        await expect(notice(page)).toHaveAttribute('role', 'status')
        await expect(notice(page)).toContainText(copy.soon)
        // Nothing was processed: the page, the text and the status are as they were.
        expect(new URL(page.url()).pathname).toBe(copy.path)
        await expect(input(page)).toHaveValue('Remove the background')
        await expect(page.locator('[data-ask-files-text]')).toHaveText(copy.noFiles)
        await page.keyboard.press('Escape')
        await expect(notice(page)).toHaveCount(0)
      }
    })

    test('the file picker counts what was chosen and sends nothing', async ({ page }) => {
      const requests: string[] = []
      page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`))
      await page.goto(copy.path)
      const before = requests.length
      const file = (name: string) => ({
        name,
        mimeType: 'image/png',
        buffer: Buffer.from('not really an image'),
      })
      await page.locator('#ask-files').setInputFiles([file('a.png'), file('b.png')])
      await expect(page.locator('[data-ask-files-text]')).toHaveText(copy.twoFiles)
      await page.locator('#ask-files').setInputFiles([file('a.png')])
      await expect(page.locator('[data-ask-files-text]')).toHaveText(copy.oneFile)
      await page.locator('#ask-files').setInputFiles([])
      await expect(page.locator('[data-ask-files-text]')).toHaveText(copy.noFiles)
      // The picker belongs to no form and has no name, so the browser could not submit it, and
      // the names are never shown: no request was made for the files.
      await expect(page.locator('form')).toHaveCount(0)
      await expect(page.locator('#ask-files')).not.toHaveAttribute('name', /.+/)
      await expect(page.getByText('a.png')).toHaveCount(0)
      expect(requests.slice(before).filter((request) => !request.startsWith('GET'))).toEqual([])
    })

    test('stays light and has no axe violations, in a light and a dark system theme', async ({
      page,
    }) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(copy.path)
          const colours = await page.locator('.ask').evaluate((el) => {
            const style = getComputedStyle(el)
            return [style.backgroundColor, style.color]
          })
          expect(colours).toEqual(['rgb(255, 247, 236)', 'rgb(30, 27, 46)'])
          const results = await new AxeBuilder({ page }).include('[data-ask]').analyze()
          expect(results.violations, `${colorScheme}, ${width}px`).toEqual([])
        }
      }
    })

    test('fits from 320 to 1440 px, with 44 px targets', async ({ page }) => {
      for (const width of [320, 360, 390, 640, 768, 1024, 1100, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(copy.path)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          `${width}px: sideways scrolling`,
        ).toBeLessThanOrEqual(width)
        const small = await page
          .locator('[data-ask] button, [data-ask] label[for="ask-files"]')
          .evaluateAll((els) =>
            els
              .map((el) => {
                const r = el.getBoundingClientRect()
                return { name: el.textContent?.trim().slice(0, 30), w: r.width, h: r.height }
              })
              // The "Paid plans" text button sits in a sentence, which WCAG 2.5.8 exempts.
              .filter(
                (r) =>
                  (r.h < 44 || r.w < 44) && !/^(Paid plans|Os planos pagos)/.test(r.name ?? ''),
              ),
          )
        expect(small, `${width}px: targets under 44 px`).toEqual([])
      }
    })
  })
}

test('works with JavaScript disabled: the box takes text, the notices and the picker still work', async ({
  testBrowser,
}) => {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    javaScriptEnabled: false,
  })
  try {
    const page = await context.newPage()
    await page.goto('/ask/')
    await input(page).fill('Square crop')
    await expect(input(page)).toHaveValue('Square crop')
    await page.getByRole('button', { name: /^Send, Coming soon/ }).click()
    await expect(notice(page)).toBeVisible()
    await expect(page.locator('label[for="ask-files"]')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('makes no request outside the site, and ships one small script', async ({ page }) => {
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost').origin
  const outside: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) outside.push(request.url())
  })
  await page.goto('/ask/')
  await page.getByRole('button', { name: 'Remove BG', exact: true }).click()
  await page.getByRole('button', { name: /^Send, Coming soon/ }).click()
  expect(outside).toEqual([])
  // Besides the language suggestion's inline script, the page has its own, and nothing else.
  const scripts = await page
    .locator('script:not([type="application/ld+json"])')
    .evaluateAll((els) => els.map((el) => (el.getAttribute('src') ? 'external' : 'inline')))
  expect(scripts.length).toBeLessThanOrEqual(2)
})

test('the sitemap lists both Ask pages', async ({ request }) => {
  const index = await (await request.get('/sitemap-index.xml')).text()
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname)
  const bodies = await Promise.all(files.map(async (file) => (await request.get(file)).text()))
  const sitemap = bodies.join('\n')
  expect(sitemap).toContain('/ask/')
  expect(sitemap).toContain('/pt/pergunte/')
})
