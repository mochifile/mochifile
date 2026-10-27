import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { pageCopySources, toolPaths } from './tool-pages.ts'

/**
 * The static part of tool pages ("Bloco e cartão", design-system proposal v1.1): the steps sit
 * beside the title from 1024 px and after the tool panel below it, the FAQ is native
 * <details>, and the copy sits beside the tool's other pages from 1024 px. Steps and FAQ come
 * from each page's Markdown frontmatter, and both are optional: a page without them has no
 * empty heading or list in their place.
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
    content: {
      question: 'Do I need to press a button to compress?',
      answer: 'Each photo is compressed as soon as you add it',
    },
  },
  {
    path: '/pt/comprimir-imagem-para-50kb/',
    locale: 'pt-BR',
    steps: 'Como funciona',
    faq: 'Perguntas frequentes',
    content: {
      question: 'Preciso apertar algum botão para comprimir?',
      answer: 'Cada foto é comprimida assim que você a adiciona',
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

/** What a tool page shows of its steps, FAQ, headings and landmarks. */
function outlineOf(page: Page) {
  return page.evaluate(() => {
    const text = (element: Element | null | undefined) =>
      element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    // Without the decorative step numbers (aria-hidden); the list's own numbering is announced.
    const steps = (selector: string) =>
      [...document.querySelectorAll(selector)].map((li) => {
        const copy = li.cloneNode(true) as Element
        for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
        return text(copy)
      })
    return {
      lang: document.documentElement.lang,
      levels: [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')].map((h) =>
        Number(h.tagName.slice(1)),
      ),
      heroList: document.querySelectorAll('[data-hero-steps]').length,
      heroSteps: steps('[data-hero-steps] li'),
      stepsHeading: document.querySelectorAll('#tool-steps').length,
      steps: steps('#tool-steps + ol li'),
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
        if (outline.heroList !== 1 || outline.stepsHeading !== 1) {
          failures.push(`${path}: steps without their hero list or heading`)
        }
        if (outline.steps.length < 2 || outline.steps.length > 4) {
          failures.push(`${path}: ${outline.steps.length} steps`)
        }
        if (JSON.stringify(outline.steps) !== JSON.stringify(outline.heroSteps)) {
          failures.push(`${path}: hero and phone steps differ`)
        }
        for (const step of outline.steps) {
          if (!fromCopy(step)) failures.push(`${path}: step «${step}» is not in its copy`)
        }
      } else if (outline.heroList + outline.stepsHeading + outline.steps.length > 0) {
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

        const heroSteps = page.getByRole('list', { name: p.steps })
        const phoneSteps = page.getByRole('heading', { level: 2, name: p.steps })
        const faq = page.getByRole('heading', { level: 2, name: p.faq })
        if (p.content === null) {
          await expect(heroSteps).toHaveCount(0)
          await expect(phoneSteps).toHaveCount(0)
          await expect(faq).toHaveCount(0)
        } else {
          await expect(width >= DESKTOP ? heroSteps : phoneSteps).toBeVisible()
          await expect(width >= DESKTOP ? phoneSteps : heroSteps).toBeHidden()
          await expect(faq).toBeVisible()
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        if (overflow > 0) failures.push(`${width}px: ${overflow}px of horizontal overflow`)
        const hidden = await hiddenFocusables(page)
        if (hidden.length > 0) failures.push(`${width}px: hidden focus stops ${hidden.join(', ')}`)
        // The breadcrumb links people can see are 44 px tall targets (README › Layout).
        const crumbs = await page
          .getByRole('navigation', { name: /breadcrumb|trilha/i })
          .getByRole('link')
          .evaluateAll((links) =>
            links
              .map((link) => link.getBoundingClientRect())
              .filter((box) => box.width > 1)
              .map((box) => box.height),
          )
        if (crumbs.length === 0) failures.push(`${width}px: no visible breadcrumb link`)
        if (crumbs.some((height) => height < 44)) {
          failures.push(`${width}px: breadcrumb links ${crumbs.join(', ')} px tall`)
        }
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

/**
 * The widths to check the tool reserve at, read from the page's own stylesheets: both sides of
 * every width where the reserve changes (each `width >=` condition on `.tool-reserve`), and a
 * width every 16 px. Within a step the panel only gets shorter as the screen widens (its text
 * wraps less, and the tool has no breakpoint besides the site's 600 and 1024 px, which are
 * steps too), so a step's first width needs the most room and its last leaves the most space.
 */
async function reserveWidths(page: Page) {
  const steps = await page.evaluate(() => {
    const found = new Set<number>()
    const visit = (rules: CSSRuleList, media: string[]) => {
      for (const rule of rules) {
        const conditions = rule instanceof CSSMediaRule ? [...media, rule.conditionText] : media
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('.tool-reserve')) {
          for (const condition of conditions) {
            const match = /width\s*>=\s*([\d.]+)(px|rem)|min-width:\s*([\d.]+)(px|rem)/.exec(
              condition,
            )
            const value = Number(match?.[1] ?? match?.[3])
            if (value) found.add((match?.[2] ?? match?.[4]) === 'rem' ? value * 16 : value)
          }
        }
        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, conditions)
      }
    }
    for (const sheet of document.styleSheets) visit(sheet.cssRules, [])
    return [...found]
  })
  // The reserve has steps besides the two site breakpoints (else this check proves nothing).
  expect(steps.length).toBeGreaterThan(2)
  const widths = new Set<number>([320, 1440])
  for (let width = 320; width <= 1440; width += 16) widths.add(width)
  for (const step of steps) for (const width of [step - 1, step]) widths.add(width)
  return [...widths].filter((width) => width >= 320 && width <= 1440).sort((a, b) => a - b)
}

/** The tool card, the box that reserves its height, and what follows them, at the current width. */
function measureCard(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-tool-card]')
    const box = card?.parentElement
    let next = box?.nextElementSibling
    while (next && next.getBoundingClientRect().height === 0) next = next.nextElementSibling
    if (!card || !box || !next) throw new Error('no tool card')
    const tool = card.querySelector('astro-island > *')
    const space = Number.parseFloat(getComputedStyle(box).paddingBottom)
    const cardBox = card.getBoundingClientRect()
    return {
      card: cardBox.height,
      box: box.getBoundingClientRect().height,
      space,
      reserve: Number.parseFloat(getComputedStyle(box).minHeight),
      // Blank band between the tool and the card's bottom padding (none: the card hugs it).
      band: tool
        ? cardBox.bottom -
          Number.parseFloat(getComputedStyle(card).paddingBottom) -
          tool.getBoundingClientRect().bottom
        : null,
      under: next.getBoundingClientRect().top - cardBox.bottom,
    }
  })
}

/**
 * The reserve fits the tool at every width (ToolPanel and Workspace artboards): the card is as
 * tall as the tool, the tool never needs more than the box reserves (nothing below moves when
 * it renders), and under the card there is the artboards' space, 48 px under 1024 px and 64 px
 * from 1024 px, plus at most a line where the panel's text wraps differently between pages.
 * Also with the text face's fallback, which the tool may render with before that face arrives
 * (the display face is preloaded). Every tool page; layout follows CSS alone (no script reads
 * the width), so one load per page and a resize per width are enough.
 */
for (const fonts of ['brand', 'fallback'] as const) {
  test(`the reserve fits the tool at every width (${fonts} fonts)`, async ({
    testBrowser,
    request,
  }) => {
    test.setTimeout(240_000)
    const paths = await toolPaths(request)
    expect(paths.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const path of paths) {
      const context = await testBrowser.newContext({
        ...projectContextOptions(),
        viewport: { width: 320, height: 900 },
      })
      try {
        const page = await context.newPage()
        if (fonts === 'fallback') {
          const html = await (await page.request.get(path)).text()
          const preloaded = new Set(
            [...html.matchAll(/<link rel="preload" href="([^"]+\.woff2)"/g)].map((m) => m[1]),
          )
          await context.route('**/*.woff2', (route) =>
            preloaded.has(new URL(route.request().url()).pathname)
              ? route.continue()
              : route.abort(),
          )
        }
        await page.goto(path)
        await page.locator('[data-tool-card] input[type="file"]').waitFor({ state: 'attached' })
        if (fonts === 'brand') await page.evaluate(() => document.fonts.ready)
        for (const width of await reserveWidths(page)) {
          await page.setViewportSize({ width, height: 900 })
          const m = await measureCard(page)
          const tool = m.card + m.space
          const designed = width >= DESKTOP ? 64 : 48
          if (tool > m.reserve + 0.5) {
            failures.push(
              `${path} at ${width}px: the tool needs ${tool} px, the reserve is ${m.reserve}`,
            )
          } else if (fonts === 'brand') {
            if (m.band !== null && Math.abs(m.band) > 1)
              failures.push(`${path} at ${width}px: ${m.band.toFixed(1)} px band in the card`)
            if (m.box < m.reserve - 0.5)
              failures.push(`${path} at ${width}px: box ${m.box} px, reserve ${m.reserve}`)
            if (m.under < designed - 0.5 || m.under > designed + 56) {
              failures.push(`${path} at ${width}px: ${m.under.toFixed(1)} px under the card`)
            }
          }
        }
      } finally {
        await context.close()
      }
    }
    expect(failures).toEqual([])
  })
}

/**
 * Before the tool's JavaScript runs, the card fills the reserve but for the space the box keeps
 * under it, at every width (in each language's table); then the tool renders and the box, and
 * so everything below it, stays where it was.
 */
test('the tool card fills the reserve until the tool renders', async ({ testBrowser }) => {
  test.setTimeout(120_000)
  const failures: string[] = []
  for (const path of ['/compress-image/', '/pt/comprimir-imagem-para-50kb/']) {
    const context = await testBrowser.newContext({
      ...projectContextOptions(),
      viewport: { width: 320, height: 900 },
    })
    try {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await context.route('**/_astro/*.js', async (route) => {
        await held
        await route.continue()
      })
      const page = await context.newPage()
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      for (const width of await reserveWidths(page)) {
        await page.setViewportSize({ width, height: 900 })
        const m = await measureCard(page)
        if (Math.abs(m.card + m.space - m.box) > 0.5 || Math.abs(m.box - m.reserve) > 0.5) {
          failures.push(
            `${path} at ${width}px: card ${m.card} px, box ${m.box} px, reserve ${m.reserve}`,
          )
        }
      }
      await page.setViewportSize({ width: 390, height: 844 })
      const before = await measureCard(page)
      release()
      await page.locator('[data-tool-card] input[type="file"]').waitFor({ state: 'attached' })
      const after = await measureCard(page)
      if (Math.abs(after.box - before.box) > 0.5) {
        failures.push(`${path}: the box went from ${before.box} to ${after.box} px`)
      }
    } finally {
      await context.close()
    }
  }
  expect(failures).toEqual([])
})
