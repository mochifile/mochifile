import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { pageCopySources, toolPaths } from './tool-pages.ts'

/**
 * The static part of tool pages (V2, docs/design-ref/v2 MFTool): the hero, the tool's panel in
 * its card, the step cards ("How it works"), the related tools, the FAQ as native <details> and
 * the page's own copy. Steps and FAQ come from each page's Markdown frontmatter, and both are
 * optional: a page without them has no empty heading or list in their place.
 */

const WIDTHS = [320, 360, 390, 600, 768, 1024, 1440] as const

const pages = [
  {
    path: '/compress-image-to-50kb/',
    locale: 'en-US',
    steps: 'How it works',
    faq: 'Frequently asked questions',
    content: {
      question: 'Do I need to press a button to compress?',
      answer: 'Yes, once. Add your photos, check the size and format',
    },
  },
  {
    path: '/pt/comprimir-imagem-para-50kb/',
    locale: 'pt-BR',
    steps: 'Como funciona',
    faq: 'Perguntas frequentes',
    content: {
      question: 'Preciso apertar algum botão para comprimir?',
      answer: 'Sim, uma vez. Adicione as fotos, confira o tamanho e o formato',
    },
  },
  // The template tool's variant leaves out both steps and FAQ (part of the e2e build).
  {
    path: '/template-tool-lowercase/',
    locale: 'en-US',
    steps: 'How it works',
    faq: 'Frequently asked questions',
    content: null,
  },
  {
    path: '/pt/ferramenta-modelo-minusculas/',
    locale: 'pt-BR',
    steps: 'Como funciona',
    faq: 'Perguntas frequentes',
    content: null,
  },
]

/**
 * Focusable elements around the tool (the tool's own controls are its UI's business) that
 * nobody can see.
 */
function hiddenFocusables(page: Page) {
  return page.evaluate(() => {
    const focusable = 'a[href], button, summary, input, select, textarea, [tabindex]'
    return [...document.querySelectorAll<HTMLElement>(`main ${focusable}`)]
      .filter((element) => !element.closest('.tool-reserve'))
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

/** What a tool page shows of its steps, FAQ, headings and landmarks. */
function outlineOf(page: Page) {
  return page.evaluate(() => {
    const text = (element: Element | null | undefined) =>
      element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    // A step is its title and, if it has one, the sentence under it (the decorative number is
    // aria-hidden and left out; the list's own numbering is announced).
    const steps = (selector: string) =>
      [...document.querySelectorAll(selector)].map((li) => {
        const copy = li.cloneNode(true) as Element
        for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
        return {
          title: text(copy.querySelector('h3')),
          text: text(copy.querySelector('p')),
        }
      })
    return {
      lang: document.documentElement.lang,
      levels: [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')].map((h) =>
        Number(h.tagName.slice(1)),
      ),
      stepsHeading: document.querySelectorAll('#tool-steps').length,
      steps: steps('[aria-labelledby="tool-steps"] ol li'),
      faqHeading: document.querySelectorAll('#tool-faq').length,
      faq: [...document.querySelectorAll('main details')].map((details) => ({
        inFaq: details.closest('[aria-labelledby="tool-faq"]') !== null,
        question: text(details.querySelector(':scope > summary')),
        answer: text(details.querySelector(':scope > :not(summary)')),
      })),
      landmarks: {
        main: document.querySelectorAll('main').length,
        aside: document.querySelectorAll('main aside').length,
      },
    }
  })
}

/** The frontmatter of a copy file: its keys, and its text with whitespace collapsed as HTML does. */
async function frontmatterOf(file: string) {
  const markdown = await readFile(file, 'utf8')
  const yaml = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
  return {
    has: { steps: /^steps:/m.test(yaml), faq: /^faq:/m.test(yaml) },
    // Quotes escaped in double-quoted YAML strings render as plain quotes.
    text: yaml.replace(/\s+/g, ' ').replaceAll('\\"', '"'),
  }
}

test('every tool page shows the steps and FAQ its copy has, and only those', async ({
  testBrowser,
  request,
}) => {
  test.setTimeout(180_000)
  const sources = await pageCopySources()
  const failures: string[] = []
  // The sitemap and the manifests agree, so the loop below covers every published page.
  const known = new Set(sources.map((source) => source.path))
  for (const path of await toolPaths(request)) {
    if (!known.has(path)) failures.push(`${path}: in the sitemap but in no manifest`)
  }

  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    javaScriptEnabled: false,
  })
  /** Steps and questions per page and locale, to compare the locales of a page. */
  const counts = new Map<string, Map<string, string>>()
  try {
    const page = await context.newPage()
    for (const source of sources) {
      const { path } = source
      await page.goto(path)
      const outline = await outlineOf(page)
      const { has, text } = await frontmatterOf(source.file)
      const fromCopy = (value: string) => value !== '' && text.includes(value)

      if (outline.lang !== source.locale) failures.push(`${path}: lang "${outline.lang}"`)
      const levels = outline.levels.join(',')
      if (outline.levels[0] !== 1 || outline.levels.filter((level) => level === 1).length !== 1) {
        failures.push(`${path}: one h1 first, got ${levels}`)
      }
      if (outline.levels.some((level, i) => i > 0 && level > (outline.levels[i - 1] ?? 0) + 1)) {
        failures.push(`${path}: heading levels skip, ${levels}`)
      }
      if (outline.landmarks.main !== 1 || outline.landmarks.aside !== 0) {
        failures.push(`${path}: landmarks ${JSON.stringify(outline.landmarks)}`)
      }

      if (has.steps) {
        if (outline.stepsHeading !== 1) failures.push(`${path}: steps without their heading`)
        if (outline.steps.length < 2 || outline.steps.length > 4) {
          failures.push(`${path}: ${outline.steps.length} steps`)
        }
        for (const step of outline.steps) {
          if (!fromCopy(step.title))
            failures.push(`${path}: step «${step.title}» is not in its copy`)
          if (step.text !== '' && !fromCopy(step.text)) {
            failures.push(`${path}: step text «${step.text}» is not in its copy`)
          }
        }
      } else if (outline.stepsHeading + outline.steps.length > 0) {
        failures.push(`${path}: shows steps its copy does not have`)
      }

      if (has.faq) {
        if (outline.faqHeading !== 1 || outline.faq.length === 0) {
          failures.push(`${path}: FAQ without its heading or questions`)
        }
        for (const { inFaq, question, answer } of outline.faq) {
          if (!inFaq) failures.push(`${path}: «${question}» is outside the FAQ section`)
          if (!fromCopy(question))
            failures.push(`${path}: question «${question}» is not in its copy`)
          if (!fromCopy(answer))
            failures.push(`${path}: answer to «${question}» is not in its copy`)
        }
      } else if (outline.faqHeading + outline.faq.length > 0) {
        failures.push(`${path}: shows an FAQ its copy does not have`)
      }

      const locales = counts.get(source.page) ?? new Map<string, string>()
      locales.set(source.locale, `${outline.steps.length} steps, ${outline.faq.length} questions`)
      counts.set(source.page, locales)
    }
  } finally {
    await context.close()
  }
  // A translation keeps its page's steps and questions: one locale's copy never has extra ones.
  for (const [key, locales] of counts) {
    if (new Set(locales.values()).size > 1) {
      failures.push(`${key}: locales differ, ${JSON.stringify(Object.fromEntries(locales))}`)
    }
  }
  expect(failures).toEqual([])
})

test('every Compress Image page has its steps and an FAQ', async ({ testBrowser }) => {
  test.setTimeout(120_000)
  const sources = (await pageCopySources()).filter((source) =>
    source.page.startsWith('compress-image/'),
  )
  // The main page and six sizes, in English and Portuguese.
  expect(sources).toHaveLength(14)
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    javaScriptEnabled: false,
  })
  const failures: string[] = []
  try {
    const page = await context.newPage()
    for (const { path } of sources) {
      await page.goto(path)
      const outline = await outlineOf(page)
      if (outline.steps.length !== 3) failures.push(`${path}: ${outline.steps.length} steps`)
      if (outline.faq.length < 3) failures.push(`${path}: ${outline.faq.length} questions`)
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
        // The tool has rendered (every tool takes files).
        await page.locator('.tool-reserve input[type="file"]').waitFor({ state: 'attached' })
        await page.evaluate(() => document.fonts.ready)

        const steps = page.getByRole('list', { name: p.steps })
        const stepsHeading = page.getByRole('heading', { level: 2, name: p.steps })
        const faq = page.getByRole('heading', { level: 2, name: p.faq })
        if (p.content === null) {
          await expect(steps).toHaveCount(0)
          await expect(stepsHeading).toHaveCount(0)
          await expect(faq).toHaveCount(0)
        } else {
          await expect(steps).toBeVisible()
          await expect(stepsHeading).toBeVisible()
          await expect(faq).toBeVisible()
        }

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

  const { content } = p
  if (content === null) continue
  test(`${p.path} opens and closes FAQ answers with the keyboard`, async ({
    page,
    browserName,
  }) => {
    // Like Safari on macOS, WebKit's Tab skips some controls there unless Option is held.
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    await page.goto(p.path)
    const summary = page.locator('summary', { hasText: content.question })
    const answer = page.getByText(content.answer)
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
