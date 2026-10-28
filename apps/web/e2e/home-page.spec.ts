import AxeBuilder from '@axe-core/playwright'
import type { Browser, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'

/**
 * The home page, Mochifile V2 (docs/design-ref/v2, artboard MFHome). Visual first: every
 * designed part is on the page, but only the image compressor works, so the checks are that
 * what works leads to real pages, and that what does not says so, without script and without
 * pretending to process anything.
 */

const LOCALES = [
  {
    locale: 'en',
    browserLocale: 'en-US',
    path: '/',
    h1: 'Compress images, video and PDFs in plain words.',
    sections: [
      'Works where you work',
      'Compression is just one thing you can ask for',
      'What happens to your files',
      'Frequently asked questions',
      'Ready to squish some files?',
    ],
    under50: 'Under 50 KB',
    under50Example: 'Under 50 KB for a job form',
    under50Page: '/compress-image-to-50kb/',
    under50Title: 'Compress an image to 50 KB',
    tool: '/compress-image/',
    start: 'Start for free',
    soon: 'Not available yet',
    gotIt: 'Got it',
    chip: 'eBay',
    send: 'Send',
    copy: 'Copy',
    faqOpen: 'Is Mochifile free?',
    faqClosed: 'Are my files uploaded?',
    faqAnswer: /No\. Browser tools open, change and save/,
  },
  {
    locale: 'pt',
    browserLocale: 'pt-BR',
    path: '/pt/',
    h1: 'Comprima imagens, vídeos e PDFs em palavras simples.',
    sections: [
      'Funciona onde você trabalha',
      'Comprimir é só uma das coisas que você pode pedir',
      'O que acontece com seus arquivos',
      'Perguntas frequentes',
      'Pronto para espremer uns arquivos?',
    ],
    under50: 'Até 50 KB',
    under50Example: 'Até 50 KB para um formulário de emprego',
    under50Page: '/pt/comprimir-imagem-para-50kb/',
    under50Title: 'Comprimir imagem para 50 KB',
    tool: '/pt/comprimir-imagem/',
    start: 'Começar de graça',
    soon: 'Ainda não está disponível',
    gotIt: 'Entendi',
    chip: 'eBay',
    send: 'Enviar',
    copy: 'Copiar',
    faqOpen: 'O Mochifile é grátis?',
    faqClosed: 'Meus arquivos são enviados?',
    faqAnswer: /Não\. As ferramentas do navegador abrem, alteram e salvam/,
  },
] as const

const WIDTHS = [320, 390, 640, 768, 1024, 1440]

const main = (page: Page) => page.getByRole('main')

/** A context whose browser language matches the page, so no language suggestion shows. */
async function openHome(
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
  test.describe(`home ${c.path}`, () => {
    test('shows every designed section, in order', async ({ page }) => {
      await page.goto(c.path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(c.h1)
      const headings = await main(page).getByRole('heading', { level: 2 }).allTextContents()
      expect(headings).toEqual([...c.sections])
      // The Ask prompt, the CLI install box and the hub are drawn, not replaced by a notice.
      await expect(main(page).getByRole('textbox')).toBeVisible()
      await expect(
        main(page)
          .getByRole('group', { name: /Mochifile/ })
          .first(),
      ).toBeVisible()
      await expect(main(page).getByRole('img', { name: /CLI.*MCP.*API/ })).toBeVisible()
      await expect(main(page).getByText('mochifile serve')).toBeVisible()
    })

    test('what works leads to real pages', async ({ page, request }) => {
      await page.goto(c.path)
      // The hero chip and the example are the compressor's 50 KB page, which exists.
      for (const name of [c.under50, c.under50Example]) {
        const link = main(page).getByRole('link', { name, exact: true })
        await expect(link).toHaveAttribute('href', c.under50Page)
      }
      const target = await request.get(c.under50Page)
      expect(target.status()).toBe(200)
      expect(await target.text()).toMatch(new RegExp(`<h1[^>]*>${c.under50Title}</h1>`))

      const start = main(page).getByRole('link', { name: c.start })
      await expect(start).toHaveAttribute('href', c.tool)
      await start.click()
      await expect(page).toHaveURL(c.tool)
    })

    test('the OS tabs switch the install command without script', async ({ page }) => {
      await page.goto(c.path)
      const box = main(page).locator('fieldset')
      // Only the command for the chosen system is displayed (`toContainText` also reads hidden text).
      const shown = box.locator('.hv2-cmd:visible')
      await expect(box.getByRole('radio', { name: 'macOS' })).toBeChecked()
      await expect(shown).toHaveCount(1)
      await expect(shown).toContainText('brew install mochifile')
      await expect(shown).toContainText('npm install -g @mochifile/cli')
      await box.getByText('Windows', { exact: true }).click()
      await expect(box.getByRole('radio', { name: 'Windows' })).toBeChecked()
      await expect(shown).toHaveCount(1)
      await expect(shown).not.toContainText('brew install mochifile')
      await expect(shown).toContainText('npm install -g @mochifile/cli')
      await box.getByText('Linux', { exact: true }).click()
      await expect(shown).toContainText('brew install mochifile')
    })

    test('a part that does not work yet says so, and closes with Esc', async ({ page }) => {
      await page.goto(c.path)
      const message = page.getByRole('dialog', { name: c.soon })
      await expect(message).toBeHidden()
      for (const name of [c.chip, c.send]) {
        await main(page).getByRole('button', { name, exact: true }).click()
        await expect(message).toBeVisible()
        // It leads on to the one thing that works.
        await expect(message.getByRole('link')).toHaveAttribute('href', c.tool)
        await page.keyboard.press('Escape')
        await expect(message).toBeHidden()
      }
      // Nothing was processed and nothing navigated.
      expect(new URL(page.url()).pathname).toBe(c.path)
      await expect(main(page).getByRole('textbox')).toHaveValue('')
    })

    test('the unavailable copy button explains itself, and the message closes with its button', async ({
      page,
    }) => {
      await page.goto(c.path)
      await main(page).getByRole('button', { name: c.copy, exact: true }).click()
      const message = page.getByRole('dialog', { name: c.soon })
      await expect(message).toBeVisible()
      await message.getByRole('button', { name: c.gotIt }).click()
      await expect(message).toBeHidden()
    })

    test('the FAQ opens and closes with the keyboard', async ({ page }) => {
      await page.goto(c.path)
      const closed = page.locator('summary', { hasText: c.faqClosed })
      await expect(page.locator('details[open]')).toHaveCount(1)
      await expect(page.getByText(c.faqAnswer)).toBeHidden()
      await closed.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText(c.faqAnswer)).toBeVisible()
      await expect(page.locator('details[open]')).toHaveCount(2)
      await page.keyboard.press('Enter')
      await expect(page.getByText(c.faqAnswer)).toBeHidden()
    })

    test('the page is light-only and has no script or inline style of its own', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.goto(c.path)
      const ground = await page
        .locator('.hv2')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(ground).toBe('rgb(255, 247, 236)')
      expect(await page.locator('main script').count()).toBe(0)
      expect(await page.locator('main [style]').count()).toBe(0)
    })
  })
}

test('every illustration loads and is decorative', async ({ testBrowser }) => {
  const { context, page } = await openHome(testBrowser, LOCALES[0], { width: 1440 })
  try {
    // They are lazy: bring each one into view.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('.hv2 img')) {
        img.scrollIntoView()
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
    })
    await page.waitForTimeout(300)
    const images = await page.locator('.hv2 img').evaluateAll((list) =>
      list.map((img) => ({
        alt: img.getAttribute('alt'),
        loaded: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        src: img.getAttribute('src'),
      })),
    )
    // The app icon in the hub, three category pictures, the happy and the squishing mascots.
    expect(images).toHaveLength(6)
    for (const image of images) {
      expect(image.alt, image.src ?? '').toBe('')
      expect(image.loaded, `${image.src} loaded`).toBe(true)
    }
  } finally {
    await context.close()
  }
})

for (const c of LOCALES) {
  test(`the page never scrolls sideways, and nothing leaves the window (${c.path})`, async ({
    testBrowser,
  }) => {
    const failures: string[] = []
    for (const width of WIDTHS) {
      const { context, page } = await openHome(testBrowser, c, { width })
      try {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (overflow > 0) failures.push(`${width}px: page ${overflow}px too wide`)
        const outside = await page.locator('.hv2').evaluate((root) => {
          const right = document.documentElement.clientWidth
          return [...root.querySelectorAll('h1, h2, h3, p, a, button, summary, li, img')]
            .filter((el) => {
              if (el.closest('.hv2-soon')) return false
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

test('the hub is a list of surfaces on phones and a diagram on wider screens', async ({
  testBrowser,
}) => {
  const phone = await openHome(testBrowser, LOCALES[0], { width: 390 })
  try {
    await expect(phone.page.locator('.hv2-hub-lines')).toBeHidden()
    await expect(phone.page.locator('.hv2-hub-label').first()).toBeHidden()
  } finally {
    await phone.context.close()
  }
  const desktop = await openHome(testBrowser, LOCALES[0], { width: 1440 })
  try {
    await expect(desktop.page.locator('.hv2-hub-lines')).toBeVisible()
    await expect(desktop.page.locator('.hv2-hub-label')).toHaveCount(2)
    // Six dots go out and six come back, animated by SVG, not script.
    await expect(desktop.page.locator('.hv2-hub-flow')).toHaveCount(12)
  } finally {
    await desktop.context.close()
  }
})

test('the hub stops moving under reduced motion and shows still dots', async ({ testBrowser }) => {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    reducedMotion: 'reduce',
  })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.hv2-hub-flow').first()).toBeHidden()
    await expect(page.locator('.hv2-hub-static').first()).toBeVisible()
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  } finally {
    await context.close()
  }
})

for (const width of [390, 1280]) {
  test(`has no axe violations (${width} px)`, async ({ testBrowser }) => {
    for (const c of LOCALES) {
      const { context, page } = await openHome(testBrowser, c, { width })
      try {
        const result = await new AxeBuilder({ page }).analyze()
        expect(result.violations, c.path).toEqual([])
        // The message is part of the page too: check it open.
        await main(page).getByRole('button', { name: c.chip, exact: true }).click()
        await expect(page.getByRole('dialog', { name: c.soon })).toBeVisible()
        const open = await new AxeBuilder({ page }).analyze()
        expect(open.violations, `${c.path} with the message open`).toEqual([])
      } finally {
        await context.close()
      }
    }
  })
}
