import type { BrowserContextOptions, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { photo, waitForEngine } from './images.ts'
import { readLayoutShifts, recordLayoutShifts } from './layout-shifts.ts'
import { PHONES } from './tool-pages.ts'

/**
 * The site header (ADR 0023, ADR 0030): "Skip to content", the V2 links and language button from
 * 1024 px, and below it a phone menu built on the declarative Popover API, without JavaScript.
 * Destinations that do not exist yet (the four languages with no pages) are "Coming soon" buttons,
 * not links; the pages that exist are links.
 */

const trigger = (page: Page) => page.getByRole('button', { name: 'Menu' })
const menu = (page: Page) => page.locator('[data-site-menu]')
const suggestion = (page: Page) => page.locator('aside[data-language-suggestion]:not([hidden])')
const isOpen = (page: Page) => menu(page).evaluate((el) => el.matches(':popover-open'))
/** The "Coming soon" notice that is open, wherever it is. */
const notice = (page: Page) => page.locator('[data-coming-soon]:popover-open')
/** The desktop language button and the list it opens. */
const languageButton = (page: Page) => page.locator('[data-language-button]')
const languageMenu = (page: Page) => page.locator('[data-language-menu]')

/**
 * The key that moves focus to the next link. WebKit on macOS follows the system setting and
 * skips links on Tab unless Option is held, as Safari does.
 */
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'

/** The focused element: its name, where it is, and whether anything covers or hides it. */
function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { name: 'body', where: 'none', shown: true }
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return {
      // Its text without the parts hidden from assistive technology.
      name: (
        el.getAttribute('aria-label') ??
        [...el.childNodes]
          .filter((node) => !(node instanceof Element && node.getAttribute('aria-hidden')))
          .map((node) => node.textContent)
          .join('')
      )
        .trim()
        .replace(/\s+/g, ' '),
      where: el.closest('[data-site-menu]')
        ? 'menu'
        : (el.closest('header, main, footer, aside')?.tagName.toLowerCase() ?? 'body'),
      // Rendered, visible and on top at its centre: not hidden or obscured.
      shown:
        el.checkVisibility({ visibilityProperty: true }) &&
        top !== null &&
        (el === top || el.contains(top)),
    }
  })
}

async function phoneContext(
  testBrowser: import('@playwright/test').Browser,
  options: BrowserContextOptions,
) {
  const context = await testBrowser.newContext({ ...projectContextOptions(), ...options })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return { context, page, errors }
}

for (const PHONE of PHONES) {
  test(`phone menu opens and closes without moving the page (${PHONE.width} px)`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/compress-image/')
    // Everything in the header fits: no sideways scrolling, nothing cut off. The row is the
    // canvas's 84 px tall, with the logo and the menu button only.
    expect((await page.locator('header > div').first().boundingBox())?.height).toBe(84)
    await expect(languageButton(page)).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      PHONE.width,
    )
    const button = await trigger(page).boundingBox()
    if (!button) throw new Error('no menu button')
    expect(button.width).toBeGreaterThanOrEqual(44)
    expect(button.height).toBeGreaterThanOrEqual(44)
    expect(button.x + button.width).toBeLessThanOrEqual(PHONE.width)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await expect(menu(page)).toBeHidden()

    await trigger(page).click()
    await expect(menu(page)).toBeVisible()
    // Every control of the canvas, in its order: four links, two buttons, six languages.
    for (const name of ['Solutions', 'Guides', 'Docs', 'Pricing', 'Get started', 'Sign in']) {
      await expect(menu(page).getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(menu(page).getByRole('link', { name: 'English' })).toBeVisible()
    await expect(menu(page).getByRole('link', { name: 'Português (Brasil)' })).toBeVisible()
    for (const name of ['Español', 'Français', 'हिन्दी', '简体中文']) {
      await expect(menu(page).getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
    }
    // The menu starts right below the header row and fits the screen's width.
    const header = await page.locator('header > div').first().boundingBox()
    const panel = await menu(page).boundingBox()
    if (!header || !panel) throw new Error('missing boxes')
    expect(Math.round(panel.y)).toBe(Math.round(header.y + header.height))
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(PHONE.width)
    // The page beneath steps out of view; the header stays, in place.
    await expect(page.locator('main')).toBeHidden()
    await expect(page.locator('footer')).toBeHidden()
    expect(await trigger(page).boundingBox()).toEqual(button)

    await trigger(page).click()
    await expect(menu(page)).toBeHidden()
    await expect(page.locator('main')).toBeVisible()
  })
}

test('keyboard: Tab order, Enter and Space, Escape and focus restoration', async ({
  page,
  browserName,
}) => {
  const TAB = tabKey(browserName)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  // Skip link, logo, menu button.
  const order = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(TAB)
    order.push(await focused(page))
  }
  expect(order).toEqual([
    { name: 'Skip to content', where: 'body', shown: true },
    { name: 'Mochifile', where: 'header', shown: true },
    { name: 'Menu', where: 'header', shown: true },
  ])

  // Enter opens; focus stays on the button and the next Tab enters the menu.
  await page.keyboard.press('Enter')
  expect(await isOpen(page)).toBe(true)
  await expect(trigger(page)).toBeFocused()
  await page.keyboard.press(TAB)
  // Firefox first lands on the open menu itself (its own name, "Menu"), then on its first item.
  if ((await focused(page)).name === 'Menu') await page.keyboard.press(TAB)
  expect(await focused(page)).toMatchObject({ where: 'menu', shown: true })
  expect((await focused(page)).name).toContain('Solutions')

  // Through every item, then out: never onto anything hidden or covered by the menu.
  const items = await menu(page).getByRole('link').or(menu(page).getByRole('button')).count()
  for (let i = 1; i < items; i++) await page.keyboard.press(TAB)
  expect(await focused(page)).toMatchObject({ where: 'menu', shown: true })
  expect((await focused(page)).name).toContain('简体中文')
  await page.keyboard.press(TAB)
  const after = await focused(page)
  expect(after.shown).toBe(true)
  expect(['main', 'footer', 'aside']).not.toContain(after.where)

  // Escape closes from inside the menu and returns focus to the button.
  await menu(page).getByRole('link', { name: 'Solutions', exact: true }).focus()
  await page.keyboard.press('Escape')
  expect(await isOpen(page)).toBe(false)
  await expect(trigger(page)).toBeFocused()

  // Space opens and closes; focus stays on the button.
  await page.keyboard.press('Space')
  expect(await isOpen(page)).toBe(true)
  await page.keyboard.press('Space')
  expect(await isOpen(page)).toBe(false)
  await expect(trigger(page)).toBeFocused()
})

test('a link in the menu navigates, and the new page starts with the menu closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await trigger(page).click()
  await menu(page).getByRole('link', { name: 'Português (Brasil)' }).click()
  await expect(page).toHaveURL('/pt/')
  expect(await isOpen(page)).toBe(false)
  await expect(page.locator('main')).toBeVisible()
})

test('a "Coming soon" control says so, goes nowhere, and keeps the menu open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await trigger(page).click()
  await menu(page)
    .getByRole('button', { name: /^Français/ })
    .click()
  await expect(notice(page)).toBeVisible()
  await expect(notice(page)).toHaveText(/Coming soon/)
  await expect(notice(page)).toHaveAttribute('role', 'status')
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await isOpen(page)).toBe(true)
  // Escape closes the notice first; the menu stays.
  await page.keyboard.press('Escape')
  await expect(notice(page)).toHaveCount(0)
  expect(await isOpen(page)).toBe(true)
  // A language with no pages behaves the same.
  await menu(page)
    .getByRole('button', { name: /^Español/ })
    .click()
  await expect(notice(page)).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})

for (const { viewport, path } of [
  { viewport: { width: 390, height: 844 }, path: '/' },
  { viewport: { width: 1280, height: 800 }, path: '/compress-image-to-50kb/' },
]) {
  test(`"Skip to content" is the first Tab stop and moves focus to the content (${viewport.width} px, ${path})`, async ({
    page,
    browserName,
  }) => {
    const TAB = tabKey(browserName)
    await page.setViewportSize(viewport)
    await page.goto(path)
    const skip = page.getByRole('link', { name: 'Skip to content' })
    // Out of view until focused.
    expect((await skip.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1)

    await page.keyboard.press(TAB)
    await expect(skip).toBeFocused()
    expect(await focused(page)).toMatchObject({ shown: true })
    const box = await skip.boundingBox()
    expect(box?.width).toBeGreaterThan(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(await skip.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')

    await page.keyboard.press('Enter')
    await expect(page.locator('main#content')).toBeFocused()
    await page.keyboard.press(TAB)
    expect(await focused(page)).toMatchObject({ where: 'main', shown: true })
  })
}

test('from 1024 px the links sit in the header; crossing it with the menu open breaks nothing', async ({
  page,
  browserName,
}) => {
  const TAB = tabKey(browserName)
  await page.setViewportSize({ width: 1023, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await expect(languageButton(page)).toBeHidden()
  await trigger(page).click()
  await expect(menu(page)).toBeVisible()

  await page.setViewportSize({ width: 1024, height: 800 })
  await expect(trigger(page)).toBeHidden()
  await expect(menu(page)).toBeHidden()
  await expect(page.locator('main')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const name of ['Solutions', 'Guides', 'Docs', 'Pricing', 'Sign in', 'Get started']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
  }
  // Every link goes to a page of the site.
  expect(
    await nav
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual(['/solutions/', '/guides/', '/docs/', '/pricing/', '/sign-in/', '/sign-up/'])
  await expect(languageButton(page)).toBeVisible()

  // Nothing hidden stays focusable: every Tab stop up to the content is visible.
  await page.getByRole('banner').getByRole('link', { name: 'Mochifile' }).focus()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(TAB)
    const stop = await focused(page)
    expect(stop.shown, stop.name).toBe(true)
    expect(stop.where).not.toBe('menu')
  }

  // Back under 1024 px the menu is still usable.
  await page.setViewportSize({ width: 1023, height: 800 })
  await expect(trigger(page)).toBeVisible()
  if (await isOpen(page)) await trigger(page).click()
  await expect(menu(page)).toBeHidden()
  await trigger(page).click()
  await expect(menu(page)).toBeVisible()
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`header and menu are axe-clean in the ${colorScheme} theme`, async ({ testBrowser }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright')
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      const { context, page, errors } = await phoneContext(testBrowser, { viewport, colorScheme })
      try {
        await page.goto('/compress-image/')
        await page.locator('[data-primary-action]').waitFor()
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        if (viewport.width < 1024) {
          await trigger(page).click()
          await expect(menu(page)).toBeVisible()
          // The whole page, open: the rest of the document is out of view, not merely covered.
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
          // The menu is drawn on the page ground of the active theme.
          const [ground, body] = await page.evaluate(() => [
            getComputedStyle(document.querySelector('[data-site-menu]') as Element).backgroundColor,
            getComputedStyle(document.body).backgroundColor,
          ])
          expect(ground).toBe(body)
          await page.keyboard.press('Escape')
          await expect(page.locator('main')).toBeVisible()
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    }
  })
}

test('while the menu is open, assistive technology gets the menu and nothing hidden', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/compress-image/')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible()

  await trigger(page).click()
  const tree = await page.locator('body').ariaSnapshot()
  expect(tree).toContain('navigation "Menu"')
  expect(tree).toContain('list "Language"')
  expect(tree).toContain('link "Solutions"')
  expect(tree).toMatch(/button "Español ?, Coming soon"/)
  expect(tree).toContain('link "English"')
  expect(tree).toContain('button "Menu"')
  // The page beneath is out of the accessibility tree, like the content behind a dialog.
  expect(tree).not.toContain('heading')
  expect(tree).not.toContain('contentinfo')
  await expect(heading).toBeHidden()
  if (browserName === 'chromium') {
    // The browser's own tree, as screen readers get it: the button reports the open menu.
    const cdp = await page.context().newCDPSession(page)
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored: boolean
        role?: { value: string }
        name?: { value: string }
        properties?: { name: string; value: { value: unknown } }[]
      }[]
    }
    const exposed = nodes.filter((node) => !node.ignored)
    const button = exposed.find((n) => n.role?.value === 'button' && n.name?.value === 'Menu')
    expect(button?.properties?.find((p) => p.name === 'expanded')?.value.value).toBe(true)
    expect(exposed.some((n) => n.role?.value === 'main')).toBe(false)
    expect(exposed.some((n) => n.role?.value === 'navigation' && n.name?.value === 'Menu')).toBe(
      true,
    )
  }

  // Closing gives the whole document back.
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()
  const after = await page.locator('body').ariaSnapshot()
  expect(after).toContain('heading')
  expect(after).toContain('contentinfo')
  expect(after).not.toContain('navigation "Menu"')
})

test('crossing 1024 px never leaves focus on a hidden element', async ({ page, browserName }) => {
  const TAB = tabKey(browserName)
  const cases: { name: string; from: number; to: number; focus: () => Promise<void> }[] = [
    {
      name: 'a menu item',
      from: 1023,
      to: 1024,
      focus: async () => {
        await trigger(page).focus()
        await page.keyboard.press('Enter')
        await page.keyboard.press(TAB)
        expect(await focused(page)).toMatchObject({ where: 'menu' })
      },
    },
    { name: 'the menu button', from: 1023, to: 1024, focus: () => trigger(page).focus() },
    {
      name: 'a header link',
      from: 1024,
      to: 1023,
      focus: () =>
        page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Solutions', exact: true })
          .focus(),
    },
    {
      name: 'the language button',
      from: 1024,
      to: 1023,
      focus: () => languageButton(page).focus(),
    },
  ]
  for (const { name, from, to, focus } of cases) {
    await page.setViewportSize({ width: from, height: 800 })
    await page.goto('/')
    await focus()
    await page.setViewportSize({ width: to, height: 800 })
    // The browser drops focus from an element that stops being rendered (focus fixup).
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.checkVisibility() ?? true), {
        message: name,
      })
      .toBe(true)
    // And the next Tab lands on something visible.
    await page.keyboard.press(TAB)
    expect(await focused(page), name).toMatchObject({ shown: true })
  }
})

/**
 * Pointer dismissal. The open menu fills the screen below the header, so a press on its blank
 * part stays inside it: closing there would let a touch's follow-up click land on the page
 * that reappears beneath (seen with a content-high menu: the file picker opened). The menu
 * closes from the button or from a press on the header outside it.
 */
for (const input of ['mouse', 'touch'] as const) {
  test(`${input}: presses never reach the page beneath the menu; the button and the header close it`, async ({
    testBrowser,
  }) => {
    const { context, page, errors } = await phoneContext(testBrowser, {
      viewport: { width: 390, height: 844 },
      locale: 'pt-BR',
      hasTouch: input === 'touch',
    })
    const press = (x: number, y: number) =>
      input === 'touch' ? page.touchscreen.tap(x, y) : page.mouse.click(x, y)
    const centre = async (locator: ReturnType<Page['locator']>) => {
      const box = await locator.boundingBox()
      if (!box) throw new Error('no box')
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    try {
      await page.goto('/compress-image/')
      await expect(suggestion(page)).toBeVisible()
      let chooser = false
      page.on('filechooser', () => {
        chooser = true
      })
      // A blank part of the open menu: the gap under its two buttons. Nothing of the page beneath
      // is guaranteed to be there, so what is checked is that the menu takes the press itself.
      // The compressor's "20 KB" option sits under the open menu: a press that got through would
      // choose it (by its markup: the page is hidden from the accessibility tree while the menu is open).
      const option = page.locator('input[name="cp-size"][value="20kb"]')

      await trigger(page).click()
      await expect(menu(page)).toBeVisible()
      const signIn = await centre(menu(page).getByRole('link', { name: 'Sign in', exact: true }))
      const action = { x: signIn.x, y: signIn.y + 56 }
      await press(action.x, action.y)
      await page.waitForTimeout(300)
      expect(await isOpen(page)).toBe(true)
      expect(chooser).toBe(false)
      await expect(option).not.toBeChecked()

      // The button closes it.
      const button = await centre(trigger(page))
      await press(button.x, button.y)
      await expect(menu(page)).toBeHidden()
      await expect(page.locator('main')).toBeVisible()
      expect(chooser).toBe(false)
      await expect(option).not.toBeChecked()

      // So does a press on the header outside the menu (between the logo and the button).
      await trigger(page).click()
      await expect(menu(page)).toBeVisible()
      const logo = await page
        .getByRole('banner')
        .getByRole('link', { name: 'Mochifile' })
        .boundingBox()
      const buttonBox = await trigger(page).boundingBox()
      if (!logo || !buttonBox) throw new Error('missing boxes')
      await press((logo.x + logo.width + buttonBox.x) / 2, button.y)
      await expect(menu(page)).toBeHidden()
      await page.waitForTimeout(300)
      expect(chooser).toBe(false)
      expect(new URL(page.url()).pathname).toBe('/compress-image/')

      // The suggestion is back, still below the header; focus is on nothing hidden.
      await expect(suggestion(page)).toBeVisible()
      const header = await page.locator('header > div').first().boundingBox()
      const box = await suggestion(page).boundingBox()
      if (!header || !box) throw new Error('missing boxes')
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height)
      expect(await focused(page)).toMatchObject({ shown: true })
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}

test('photos keep compressing while the menu is open, and download afterwards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/compress-image-to-50kb/')
  await waitForEngine(page)
  await page.locator('input[type="file"]').setInputFiles([await photo('flowers')])
  await page.getByRole('button', { name: 'Compress 1 photo' }).click()
  await trigger(page).click()
  await expect(menu(page)).toBeVisible()
  // Finishes behind the open menu.
  const row = page.locator('li[data-status]').first()
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  expect(await isOpen(page)).toBe(true)

  await page.keyboard.press('Escape')
  const download = page.waitForEvent('download')
  await row.getByRole('link', { name: /^Download/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('flowers-50kb.jpg')
  const { size } = await import('node:fs/promises').then(async (fs) => fs.stat(await file.path()))
  expect(size).toBeLessThanOrEqual(50_000)
})

test('the menu works with JavaScript disabled', async ({ testBrowser }) => {
  const { context, page } = await phoneContext(testBrowser, {
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  })
  try {
    await page.goto('/pt/')
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(menu(page)).toBeVisible()
    // "Coming soon" works with no script too: a declarative popover.
    await menu(page)
      .getByRole('button', { name: /^Español/ })
      .click()
    await expect(notice(page)).toContainText('Em breve')
    await page.keyboard.press('Escape')
    await menu(page).getByRole('link', { name: 'English' }).click()
    await expect(page).toHaveURL('/')
  } finally {
    await context.close()
  }
})

/**
 * Records what moves inside the header, from the start of the page's life (Chromium only: other
 * engines have no layout-shift entries). The page content has its own checks
 * (layout-shift.spec.ts); this one fails only on the header's own elements. Call before `goto`.
 */
async function recordHeaderShifts(page: Page) {
  await page.addInitScript(() => {
    const moved: string[] = []
    ;(window as unknown as { __headerShifts: string[] }).__headerShifts = moved
    type Source = {
      node?: Node | null
      previousRect: DOMRectReadOnly
      currentRect: DOMRectReadOnly
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          for (const { node, previousRect: a, currentRect: b } of (
            entry as unknown as { sources: Source[] }
          ).sources) {
            const el = node instanceof Element ? node : node?.parentElement
            if (!el?.closest('header')) continue
            const text = (el.textContent ?? '').trim().slice(0, 30)
            moved.push(
              `${el.nodeName} «${text}» x${a.x}→${b.x} y${a.y}→${b.y} h${a.height}→${b.height}`,
            )
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {
      // layout-shift entries exist only in Chromium.
    }
  })
}
const headerShifts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __headerShifts: string[] }).__headerShifts)

test('opening and closing the menu shifts nothing', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout-shift entries exist only in Chromium')
  await page.setViewportSize({ width: 360, height: 800 })
  await recordLayoutShifts(page)
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const before = await readLayoutShifts(page)
  await trigger(page).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const after = await readLayoutShifts(page)
  expect(after.total - before.total, after.moved).toBe(0)
})

test('the header shifts nothing while the page and its fonts load', async ({
  testBrowser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'layout-shift entries exist only in Chromium')
  const failures: string[] = []
  for (const width of [360, 600, 1024, 1280]) {
    for (const path of ['/', '/pt/', '/compress-image/', '/pt/comprimir-imagem-para-50kb/']) {
      const { context, page } = await phoneContext(testBrowser, {
        viewport: { width, height: 800 },
        locale: path.startsWith('/pt/') ? 'pt-BR' : 'en-US',
      })
      try {
        await recordHeaderShifts(page)
        await page.goto(path)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(300)
        const moved = await headerShifts(page)
        if (moved.length > 0) failures.push(`${width} px ${path}: ${moved.join('; ')}`)
      } finally {
        await context.close()
      }
    }
  }
  expect(failures).toEqual([])
})

/**
 * The language suggestion (ADR 0019) sits right below the header on phones and steps aside
 * while the menu is open or keyboard focus is in the content (ADR 0023).
 */
for (const PHONE of PHONES) {
  test(`the language suggestion leaves the menu reachable and focus visible (${PHONE.width} px)`, async ({
    testBrowser,
    browserName,
  }) => {
    const TAB = tabKey(browserName)
    const { context, page, errors } = await phoneContext(testBrowser, {
      viewport: PHONE,
      locale: 'pt-BR',
    })
    try {
      await page.goto('/')
      await expect(suggestion(page)).toBeVisible()

      // Below the header row, never over it.
      const header = await page.locator('header > div').first().boundingBox()
      const panel = await suggestion(page).boundingBox()
      if (!header || !panel) throw new Error('missing boxes')
      expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height)

      // Keyboard: the header's stops are all visible and on top, then the suggestion.
      for (const name of ['Skip to content', 'Mochifile', 'Menu']) {
        await page.keyboard.press(TAB)
        expect(await focused(page)).toMatchObject({ name, shown: true })
      }
      await page.keyboard.press(TAB)
      expect(await focused(page)).toMatchObject({ where: 'aside', shown: true })
      await page.keyboard.press(TAB)
      expect(await focused(page)).toMatchObject({ name: 'Agora não', shown: true })
      // Into the content: the first tool link, under the suggestion's place. The suggestion
      // steps aside instead of covering it.
      await page.keyboard.press(TAB)
      expect(await focused(page)).toMatchObject({ where: 'main', shown: true })
      await expect(suggestion(page)).toBeHidden()
      // Back to the header: it returns, unchanged.
      await trigger(page).focus()
      await expect(suggestion(page)).toBeVisible()

      // Touch: the menu button is the element under a tap, and the menu covers the suggestion.
      const button = await trigger(page).boundingBox()
      if (!button) throw new Error('no menu button')
      expect(
        await page.evaluate(
          ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[popovertarget]')),
          { x: button.x + button.width / 2, y: button.y + button.height / 2 },
        ),
      ).toBe(true)
      await trigger(page).click()
      await expect(menu(page)).toBeVisible()
      await expect(suggestion(page)).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(suggestion(page)).toBeVisible()

      // Its own behaviour is unchanged: "Not now" still closes it for good.
      await suggestion(page).getByRole('button', { name: 'Agora não' }).click()
      await expect(suggestion(page)).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}

/**
 * The language selector (ADR 0030): from 1024 px a button in the header opens a list of the six
 * languages in their own names; under 1024 px the same languages are chips in the menu.
 * English and Portuguese are links to this page's alternate; the rest are "Coming soon".
 */
const LANGUAGE_PAGES = [
  {
    path: '/compress-image/',
    other: '/pt/comprimir-imagem/',
    label: 'Language: English',
    current: 'English',
    target: 'Português (Brasil)',
  },
  {
    path: '/pt/',
    other: '/',
    label: 'Idioma: Português (Brasil)',
    current: 'Português (Brasil)',
    target: 'English',
  },
] as const

for (const { path, other, label, current, target } of LANGUAGE_PAGES) {
  test(`the language button on ${path} lists six languages and links to ${other}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path)
    await expect(languageButton(page)).toHaveAccessibleName(label)
    await expect(languageMenu(page)).toBeHidden()
    await languageButton(page).click()
    await expect(languageMenu(page)).toBeVisible()
    const items = languageMenu(page).getByRole('listitem')
    await expect(items).toHaveCount(6)
    // The page's own language is marked, not offered as a switch.
    await expect(languageMenu(page).locator('[aria-current="true"]')).toHaveText(current)
    // Each in its own name, in the canvas's order, with its language declared.
    await expect(languageMenu(page).locator('[lang]')).toHaveCount(6)
    for (const name of ['Español', 'Français', 'हिन्दी', '简体中文']) {
      await expect(
        languageMenu(page).getByRole('button', { name: new RegExp(`^${name}`) }),
      ).toBeVisible()
    }
    const link = languageMenu(page).getByRole('link', { name: target })
    await expect(link).toHaveAttribute('href', other)
    await expect(link).toHaveAttribute('hreflang', other.startsWith('/pt/') ? 'pt' : 'en')

    // A language with no pages says so and keeps the list open.
    await languageMenu(page)
      .getByRole('button', { name: /^Español/ })
      .click()
    await expect(notice(page)).toContainText(/Coming soon|Em breve/)
    expect(new URL(page.url()).pathname).toBe(path)
    await page.keyboard.press('Escape')
    await expect(languageMenu(page)).toBeVisible()

    // Escape closes the list and returns focus to the button.
    await page.keyboard.press('Escape')
    await expect(languageMenu(page)).toBeHidden()
    // WebKit does not focus a button a pointer pressed, so it has nothing to give back.
    if (browserName !== 'webkit') await expect(languageButton(page)).toBeFocused()

    await languageButton(page).click()
    await languageMenu(page).getByRole('link', { name: target }).click()
    await expect(page).toHaveURL(other)
  })

  test(`the header fits and its language button stays in the row from 1024 to 1440 px (${path})`, async ({
    page,
  }) => {
    await page.goto(path)
    for (const width of [1024, 1100, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      const box = await languageButton(page).boundingBox()
      const nav = await page.getByRole('navigation', { name: /Main|Principal/ }).boundingBox()
      if (!box || !nav) throw new Error('missing boxes')
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width, `${width} px`).toBeLessThanOrEqual(width)
      expect(nav.x + nav.width).toBeLessThanOrEqual(box.x)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    }
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the Portuguese header and menu are axe-clean in the ${colorScheme} theme`, async ({
    testBrowser,
  }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright')
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      const { context, page, errors } = await phoneContext(testBrowser, {
        viewport,
        colorScheme,
        locale: 'pt-BR',
      })
      try {
        await page.goto('/pt/comprimir-imagem/')
        const results = await new AxeBuilder({ page }).include('header').analyze()
        expect(results.violations).toEqual([])
        if (viewport.width < 1024) {
          await page.getByRole('button', { name: 'Menu' }).click()
          await expect(menu(page).getByRole('link', { name: 'English' })).toBeVisible()
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        } else {
          await languageButton(page).click()
          await expect(languageMenu(page)).toBeVisible()
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
      }
    }
  })
}
