import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { toolPaths } from './tool-pages.ts'

/**
 * The static part of tool pages ("Bloco e cartão", design-system proposal v1.1): the steps sit
 * beside the title from 1024 px and after the tool panel below it, the FAQ is native
 * <details>, and the copy sits beside the tool's other pages from 1024 px. Steps and FAQ come
 * from each page's Markdown frontmatter.
 */

const WIDTHS = [320, 360, 390, 600, 768, 1024, 1440] as const
/** The design's desktop breakpoint (Tailwind `lg`, 64rem). */
const DESKTOP = 1024

const pages = [
  {
    path: '/compress-image-to-50kb/',
    locale: 'en-US',
    steps: 'How it works',
    faq: 'Frequently asked questions',
    question: 'Do I need to press a button to compress?',
    answer: 'Each photo is compressed as soon as you add it',
  },
  {
    path: '/pt/comprimir-imagem-para-50kb/',
    locale: 'pt-BR',
    steps: 'Como funciona',
    faq: 'Perguntas frequentes',
    question: 'Preciso apertar algum botão para comprimir?',
    answer: 'Cada foto é comprimida assim que você a adiciona',
  },
]

/**
 * Focusable elements around the tool (the tool's own controls are its UI's business) that
 * nobody can see. The breadcrumb's visually hidden crumbs on phones are a known, separate
 * issue (#32) and are left out here.
 */
function hiddenFocusables(page: Page) {
  return page.evaluate(() => {
    const focusable = 'a[href], button, summary, input, select, textarea, [tabindex]'
    return [...document.querySelectorAll<HTMLElement>(`main ${focusable}`)]
      .filter((element) => !element.closest('.tool-reserve, main > div:first-of-type nav'))
      .filter(
        (element) =>
          element.tabIndex >= 0 && !element.closest('details:not([open]) > :not(summary)'),
      )
      .filter((element) => {
        const box = element.getBoundingClientRect()
        const visible = element.checkVisibility({ visibilityProperty: true })
        // Hidden with `display: none` (box 0 × 0) is out of the Tab order and fine.
        return box.width > 0 && box.height > 0 && (!visible || box.width <= 1 || box.height <= 1)
      })
      .map((element) => `${element.tagName} «${element.textContent?.trim().slice(0, 30)}»`)
  })
}

test('every tool page has its steps, an FAQ and a heading outline without gaps', async ({
  testBrowser,
  request,
}) => {
  test.setTimeout(120_000)
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    javaScriptEnabled: false,
  })
  const failures: string[] = []
  try {
    const page = await context.newPage()
    for (const path of await toolPaths(request)) {
      await page.goto(path)
      const outline = await page.evaluate(() => ({
        levels: [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')].map((h) =>
          Number(h.tagName.slice(1)),
        ),
        heroSteps: [...document.querySelectorAll('[data-hero-steps] li')].map((li) =>
          li.textContent?.replace(/^\s*\d+/, '').trim(),
        ),
        steps: [...document.querySelectorAll('#tool-steps + ol li')].map((li) =>
          li.textContent?.replace(/^\s*\d+/, '').trim(),
        ),
        questions: document.querySelectorAll('#tool-faq ~ details > summary').length,
        landmarks: {
          main: document.querySelectorAll('main').length,
          aside: document.querySelectorAll('main aside').length,
        },
      }))
      const jumps = outline.levels.some(
        (level, i) => i > 0 && level > (outline.levels[i - 1] ?? 0) + 1,
      )
      if (outline.levels[0] !== 1 || outline.levels.filter((level) => level === 1).length !== 1) {
        failures.push(`${path}: one h1 first, got ${outline.levels.join(',')}`)
      }
      if (jumps) failures.push(`${path}: heading levels skip, ${outline.levels.join(',')}`)
      if (outline.steps.length < 2) failures.push(`${path}: ${outline.steps.length} steps`)
      if (JSON.stringify(outline.steps) !== JSON.stringify(outline.heroSteps)) {
        failures.push(`${path}: hero and phone steps differ`)
      }
      if (outline.questions < 1) failures.push(`${path}: no FAQ`)
      if (outline.landmarks.main !== 1 || outline.landmarks.aside !== 0) {
        failures.push(`${path}: landmarks ${JSON.stringify(outline.landmarks)}`)
      }
    }
  } finally {
    await context.close()
  }
  expect(failures).toEqual([])
})

for (const p of pages) {
  test(`${p.path} lays out at every width, without overflow or hidden focus stops`, async ({
    testBrowser,
  }) => {
    test.setTimeout(120_000)
    const failures: string[] = []
    for (const width of WIDTHS) {
      const context = await testBrowser.newContext({
        ...projectContextOptions(),
        viewport: { width, height: 900 },
        locale: p.locale,
      })
      try {
        const page = await context.newPage()
        await page.goto(p.path)
        await page.locator('[data-primary-action]').waitFor()
        await page.evaluate(() => document.fonts.ready)

        const heroSteps = page.getByRole('list', { name: p.steps })
        const phoneSteps = page.getByRole('heading', { level: 2, name: p.steps })
        if (width >= DESKTOP) {
          await expect(heroSteps).toBeVisible()
          await expect(phoneSteps).toBeHidden()
        } else {
          await expect(heroSteps).toBeHidden()
          await expect(phoneSteps).toBeVisible()
        }
        await expect(page.getByRole('heading', { level: 2, name: p.faq })).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (overflow > 0) failures.push(`${width}px: ${overflow}px of horizontal overflow`)
        const hidden = await hiddenFocusables(page)
        if (hidden.length > 0) failures.push(`${width}px: hidden focus stops ${hidden.join(', ')}`)
      } finally {
        await context.close()
      }
    }
    expect(failures).toEqual([])
  })

  test(`${p.path} opens and closes FAQ answers with the keyboard`, async ({
    page,
    browserName,
  }) => {
    // Like Safari on macOS, WebKit's Tab skips some controls there unless Option is held.
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    await page.goto(p.path)
    const summary = page.locator('summary', { hasText: p.question })
    const answer = page.getByText(p.answer)
    await expect(answer).toBeHidden()

    // Reach the question with Tab, so the browser shows keyboard focus.
    await summary.focus()
    await page.keyboard.press(`Shift+${tab}`)
    await page.keyboard.press(tab)
    await expect(summary).toBeFocused()
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
      'solid',
    )

    await page.keyboard.press('Enter')
    await expect(answer).toBeVisible()
    await page.keyboard.press('Space')
    await expect(answer).toBeHidden()
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`a tool page with an open FAQ answer is axe-clean (${colorScheme}, ${width}px)`, async ({
      testBrowser,
    }) => {
      const context = await testBrowser.newContext({
        ...projectContextOptions(),
        viewport: { width, height: 900 },
        colorScheme,
        locale: 'pt-BR',
      })
      try {
        const page = await context.newPage()
        await page.goto('/pt/comprimir-imagem-para-50kb/')
        await page.locator('[data-primary-action]').waitFor()
        await page.locator('details summary').first().click()
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
}
