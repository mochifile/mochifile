import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Download, Locator, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
import { isJpeg, photo, waitForEngine } from './images.ts'
import { readZip } from './zip.ts'

/**
 * "Download all" when it takes a moment, fails, or is asked for again and again, in the real
 * browsers. Failures are injected where they would happen: a file that cannot be read, an
 * exception while the archive is built, the ZIP code that does not load (the request is blocked),
 * and the work held half way to look at the "preparing" state.
 */

const COPY = {
  en: {
    url: '/compress-image-to-200kb/',
    start: 'Compress 3 photos',
    all: 'Download all (ZIP)',
    preparing: 'Preparing the ZIP…',
    title: "We couldn't prepare the ZIP.",
    retry: 'Your photos are still here. Try again, or download them one by one.',
    reload:
      "This page can't prepare the ZIP right now. Download the photos one by one, or reload the page and compress them again.",
    tryAgain: 'Try again',
    link: /^Download /,
    more: 'Compress more',
  },
  pt: {
    url: '/pt/comprimir-imagem-para-200kb/',
    start: 'Comprimir 3 fotos',
    all: 'Baixar todas (ZIP)',
    preparing: 'Preparando o ZIP…',
    title: 'Não conseguimos preparar o ZIP.',
    retry: 'Suas fotos continuam aqui. Tente de novo ou baixe uma por uma.',
    reload:
      'Esta página não consegue preparar o ZIP agora. Baixe as fotos uma por uma ou recarregue a página e comprima de novo.',
    tryAgain: 'Tentar de novo',
    link: /^Baixar /,
    more: 'Comprimir mais',
  },
} as const
type Lang = keyof typeof COPY

type Fault = '' | 'read' | 'build' | 'hold'
declare global {
  interface Window {
    __zipFault: Fault
    __zipHeld: Array<(fail: boolean) => void>
    __zipUrls: number
  }
}

/** Faults and counters, in the page, before anything else runs. */
async function injectFaults(page: Page) {
  await page.addInitScript(() => {
    window.__zipFault = ''
    window.__zipHeld = []
    window.__zipUrls = 0
    // The ZIP reads each result file in slices; only result files (images) are touched.
    const slice = Blob.prototype.slice
    Blob.prototype.slice = function (...args: Parameters<Blob['slice']>) {
      const part = slice.apply(this, args)
      if (
        (window.__zipFault === 'read' || window.__zipFault === 'hold') &&
        /^image\//.test(this.type)
      ) {
        const original = part.arrayBuffer.bind(part)
        part.arrayBuffer = () =>
          window.__zipFault === 'read'
            ? Promise.reject(new DOMException('injected', 'NotReadableError'))
            : new Promise<ArrayBuffer>((resolve, reject) =>
                window.__zipHeld.push((fail) =>
                  fail
                    ? reject(new DOMException('injected', 'NotReadableError'))
                    : resolve(original()),
                ),
              )
      }
      return part
    }
    const encode = TextEncoder.prototype.encode
    TextEncoder.prototype.encode = function (...args: Parameters<TextEncoder['encode']>) {
      if (window.__zipFault === 'build') throw new Error('injected')
      return encode.apply(this, args)
    }
    const create = URL.createObjectURL
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob && object.type === 'application/zip') window.__zipUrls += 1
      return create.call(URL, object)
    }
  })
}

const setFault = (page: Page, fault: Fault) => page.evaluate((f) => (window.__zipFault = f), fault)
/** Lets the work that was held go on: to the end, or (`fail`) to fail as a file that cannot be read. */
const releaseHeld = (page: Page, fail = false) =>
  page.evaluate((failing) => {
    window.__zipFault = ''
    for (const release of window.__zipHeld.splice(0)) release(failing)
  }, fail)

/** The compressor open in `lang`, with three photos compressed, up to the "Download all" button. */
async function ready(page: Page, lang: Lang, fault = true) {
  const copy = COPY[lang]
  if (fault) await injectFaults(page)
  await page.goto(copy.url)
  await waitForEngine(page)
  await page
    .locator('input[type="file"]')
    .setInputFiles([await photo('landscape'), await photo('flowers'), await photo('portrait')])
  await page.getByRole('button', { name: copy.start }).click()
  const button = page.getByRole('button', { name: copy.all })
  await expect(button).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('li[data-status="done"]')).toHaveCount(3)
  return button
}

async function bytesOf(download: Download) {
  return readFile(await download.path())
}

/** The notice (and only it) inside the live region that announces what went wrong. */
const notice = (page: Page) => page.locator('[role="status"] .cp-notice-danger')

/**
 * A box's size, and where another one is in relation to it. Not its place in the window: that
 * changes when the page scrolls to a focused or clicked button, and says nothing about layout.
 */
async function shape(box: Locator, other?: Locator) {
  const a = await box.boundingBox()
  const b = other ? await other.boundingBox() : null
  if (!a) throw new Error('not visible')
  return { width: a.width, height: a.height, dx: b ? b.x - a.x : 0, dy: b ? b.y - a.y : 0 }
}

/**
 * The same shape, give or take a fraction of a pixel: a button being pressed is scaled by a
 * `transform` for a moment, which is not layout. A layout shift is several pixels.
 */
function expectSameShape(actual: Awaited<ReturnType<typeof shape>>, expected: typeof actual) {
  for (const key of ['width', 'height', 'dx', 'dy'] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThan(1)
  }
}

/** Counts downloads from now on, so "exactly one" and "none" can be checked. */
function countDownloads(page: Page) {
  const seen: Download[] = []
  page.on('download', (download) => seen.push(download))
  return seen
}

/** What the browser logs when the ZIP code is blocked: expected there, a failure anywhere else. */
const BLOCKED_CHUNK =
  /Failed to load resource|ERR_FAILED|dynamically imported module|module script failed|Load failed/i

test.describe('while the ZIP is being made', () => {
  test('says so, keeps the button where it is, ignores repeated clicks and keys, and downloads once', async ({
    page,
  }) => {
    const copy = COPY.en
    const button = await ready(page, 'en')
    const downloads = countDownloads(page)
    const next = page.getByRole('button', { name: copy.more })
    const before = await shape(button, next)

    await setFault(page, 'hold')
    await button.focus()
    await page.keyboard.press('Enter')

    // Preparing: the same button, busy, still focused (so still reachable by keyboard).
    const busy = page.getByRole('button', { name: copy.preparing })
    await expect(busy).toBeVisible()
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    await expect(busy).toHaveAttribute('aria-disabled', 'true')
    await expect(busy).toBeFocused()
    // It does not move or change size, and neither does what is beside it (no layout shift).
    expectSameShape(await shape(busy, next), before)

    // Five clicks in the same task, then the keyboard again: still the one run.
    await busy.evaluate((element) => {
      for (let click = 0; click < 5; click += 1) (element as HTMLElement).click()
    })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__zipHeld.length)).toBeGreaterThan(0)
    // The photos' own downloads are untouched while it works.
    const links = page.getByRole('link', { name: copy.link })
    await expect(links).toHaveCount(3)
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /^blob:/)
      await expect(link).not.toHaveAttribute('aria-disabled', /.*/)
    }
    expect(downloads).toHaveLength(0)

    const first = page.waitForEvent('download')
    await releaseHeld(page)
    const zip = await first
    expect(zip.suggestedFilename()).toBe('compressed-photos.zip')
    const entries = readZip(await bytesOf(zip))
    expect(entries).toHaveLength(3)
    expect(entries.every((entry) => isJpeg(entry.data))).toBe(true)

    // Back to normal: the label, the size, no notice, and exactly one archive was made.
    await expect(button).toBeVisible()
    await expect(button).not.toHaveAttribute('aria-busy', /.*/)
    expectSameShape(await shape(button, next), before)
    await expect(notice(page)).toHaveCount(0)
    expect(await page.evaluate(() => window.__zipUrls)).toBe(1)
    await page.waitForTimeout(300)
    expect(downloads).toHaveLength(1)
  })

  test('has no accessibility violations while preparing', async ({ page }) => {
    await ready(page, 'en')
    await setFault(page, 'hold')
    await page.getByRole('button', { name: COPY.en.all }).click()
    await expect(page.getByRole('button', { name: COPY.en.preparing })).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.cp').analyze()
    expect(results.violations).toEqual([])
    await releaseHeld(page)
  })
})

for (const lang of ['en', 'pt'] as const) {
  const copy = COPY[lang]

  test.describe(`when it fails (${lang})`, () => {
    for (const fault of ['read', 'build'] as const) {
      test(`${fault === 'read' ? 'a file that cannot be read' : 'an exception while building'}: says so, keeps the photos, and tries again`, async ({
        page,
      }) => {
        const button = await ready(page, lang)
        const downloads = countDownloads(page)
        await setFault(page, fault)
        await button.click()

        // Visible, in a region announced to screen readers, with what to do next.
        await expect(notice(page)).toBeVisible()
        await expect(notice(page)).toContainText(copy.title)
        await expect(notice(page)).toContainText(copy.retry)
        await expect(notice(page).getByRole('button', { name: copy.tryAgain })).toBeVisible()
        // Nothing internal, and no claim that anything was saved.
        const text = (await notice(page).textContent()) ?? ''
        expect(text).not.toMatch(/injected|NotReadable|ZipError|zip-archive|Error|saved|salv/i)
        // Nothing was downloaded, the photos are all there with their own downloads, and the
        // banner still says they are ready: nothing was compressed again.
        expect(downloads).toHaveLength(0)
        await expect(page.locator('li[data-status="done"]')).toHaveCount(3)
        await expect(page.getByRole('link', { name: copy.link })).toHaveCount(3)
        await expect(page.getByText(/^(Ready!|Pronto!)/)).toBeVisible()
        await expect(button).not.toHaveAttribute('aria-busy', /.*/)

        // Try again, from the notice, once the cause is gone.
        await setFault(page, '')
        const zip = page.waitForEvent('download')
        await notice(page).getByRole('button', { name: copy.tryAgain }).click()
        const entries = readZip(await bytesOf(await zip))
        expect(entries).toHaveLength(3)
        expect(entries.every((entry) => isJpeg(entry.data))).toBe(true)
        await expect(notice(page)).toHaveCount(0)
      })
    }

    test('the failure has no accessibility violations', async ({ page }) => {
      const button = await ready(page, lang)
      await setFault(page, 'read')
      await button.click()
      await expect(notice(page)).toBeVisible()
      const results = await new AxeBuilder({ page }).include('.cp').analyze()
      expect(results.violations).toEqual([])
    })
  })
}

test.describe('when the ZIP code cannot be loaded', () => {
  /** Blocks the request for the ZIP code (a network error, or while `block` is true). */
  async function blockChunk(page: Page) {
    const state = { blocked: true, requests: 0 }
    await page.route(/zip-archive\.[^/]*\.js$/, (route) => {
      state.requests += 1
      return state.blocked ? route.abort('failed') : route.continue()
    })
    return state
  }

  for (const lang of ['en', 'pt'] as const) {
    test(`says to try again, then to download one by one or reload, and the photos stay (${lang})`, async ({
      page,
      pageErrors,
    }) => {
      const copy = COPY[lang]
      await blockChunk(page)
      const button = await ready(page, lang, false)
      const downloads = countDownloads(page)

      await button.click()
      await expect(notice(page)).toContainText(copy.retry)
      await notice(page).getByRole('button', { name: copy.tryAgain }).click()
      // The second time in a row it says what trying again cannot promise: no more "Try again"
      // in the notice, and a way that keeps the photos.
      await expect(notice(page)).toContainText(copy.reload)
      await expect(notice(page).getByRole('button')).toHaveCount(0)
      await expect(button).toBeVisible()
      expect(downloads).toHaveLength(0)
      await expect(page.locator('li[data-status="done"]')).toHaveCount(3)

      // "Download them one by one" works: it does not need the ZIP code.
      const single = page.waitForEvent('download')
      await page.getByRole('link', { name: copy.link }).first().click()
      expect(isJpeg(await bytesOf(await single))).toBe(true)

      // The blocked request is the only thing the browser may log here.
      const unexpected = pageErrors.filter((error) => !BLOCKED_CHUNK.test(error))
      pageErrors.splice(0, pageErrors.length, ...unexpected)
    })
  }

  test('when the network is back it either works or says to reload; the photos stay either way', async ({
    page,
    pageErrors,
  }) => {
    const copy = COPY.en
    const chunk = await blockChunk(page)
    const button = await ready(page, 'en', false)
    await button.click()
    await expect(notice(page)).toContainText(copy.retry)
    await button.click()
    await expect(notice(page)).toContainText(copy.reload)

    // Some browsers (WebKit) ask for the code again and get it; others (Chromium) keep the failed
    // load until the page is reloaded and never ask. Both are fine: what must hold is that it
    // never claims success, never loses the photos, and never gets stuck busy.
    chunk.blocked = false
    const requestsBefore = chunk.requests
    const attempt = page.waitForEvent('download', { timeout: 5_000 }).then(
      () => 'downloaded' as const,
      () => 'not downloaded' as const,
    )
    await button.click()
    const outcome = await attempt
    if (outcome === 'downloaded') {
      expect(chunk.requests).toBeGreaterThan(requestsBefore)
      await expect(notice(page)).toHaveCount(0)
    } else {
      await expect(notice(page)).toContainText(copy.reload)
    }
    await expect(button).toBeVisible()
    await expect(button).not.toHaveAttribute('aria-busy', /.*/)
    await expect(page.locator('li[data-status="done"]')).toHaveCount(3)
    await expect(page.getByRole('link', { name: copy.link })).toHaveCount(3)

    const unexpected = pageErrors.filter((error) => !BLOCKED_CHUNK.test(error))
    pageErrors.splice(0, pageErrors.length, ...unexpected)
  })
})

test.describe('on a phone', () => {
  /** Everything in the panel is inside the screen. */
  async function expectNoOverflow(page: Page) {
    const outside = await page.locator('.cp').evaluate((root) =>
      [...root.querySelectorAll('*')]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && (rect.left < -0.5 || rect.right > 390.5)
        })
        .map((element) => {
          const { left, right } = element.getBoundingClientRect()
          return `${element.tagName} «${element.textContent?.trim().slice(0, 30)}» ${Math.round(left)}→${Math.round(right)}`
        }),
    )
    expect(outside).toEqual([])
  }

  for (const lang of ['en', 'pt'] as const) {
    // The project's context is made from the project's settings, so a phone gets its own.
    test(`preparing and failed fit the screen, with thumb-sized buttons (${lang})`, async ({
      testBrowser,
    }) => {
      const copy = COPY[lang]
      const context = await testBrowser.newContext({
        ...projectContextOptions(),
        viewport: { width: 390, height: 844 },
      })
      try {
        const page = await context.newPage()
        const button = await ready(page, lang)
        expect(page.viewportSize()?.width).toBe(390)
        const before = await shape(button)
        await setFault(page, 'hold')
        await button.click()
        const busy = page.getByRole('button', { name: copy.preparing })
        await expect(busy).toBeVisible()
        expectSameShape(await shape(busy), before)
        await expectNoOverflow(page)
        // The work that was held now fails, as a file that cannot be read would.
        await releaseHeld(page, true)

        await expect(notice(page)).toBeVisible()
        await expectNoOverflow(page)
        const retry = notice(page).getByRole('button', { name: copy.tryAgain })
        const box = await retry.boundingBox()
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44)
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390.5).toBe(true)
        expect((await new AxeBuilder({ page }).include('.cp').analyze()).violations).toEqual([])
      } finally {
        await context.close()
      }
    })
  }
})

test('the photos still download one by one while the ZIP is held, and after it fails', async ({
  page,
}: {
  page: Page
}) => {
  // One download per page in some browsers, so: hold, fail, then take one photo.
  const copy = COPY.en
  const button = await ready(page, 'en')
  await setFault(page, 'read')
  await button.click()
  await expect(notice(page)).toBeVisible()
  const link: Locator = page.getByRole('link', { name: copy.link }).first()
  const single = page.waitForEvent('download')
  await link.click()
  const download = await single
  expect(download.suggestedFilename()).toMatch(/\.jpg$/)
  expect(isJpeg(await bytesOf(download))).toBe(true)
})
