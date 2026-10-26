import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Download, Page } from '@playwright/test'
import { expectSmallUntilIntent } from './budget.ts'
import { expect, test } from './fixtures.ts'
import {
  bytesContain,
  isJpeg,
  isWebp,
  largePhoto,
  photo,
  photoWithLocation,
  recordRequests,
  rotatedPhoto,
  SECRET,
  transparentPng,
  type UploadFile,
  waitForEngine,
  webpPhoto,
} from './images.ts'

/** "Compress image to target size": the full flow in every engine, on a production build. */

const fileInput = (page: Page) => page.locator('input[type="file"]')
const rows = (page: Page) => page.locator('li[data-status]')

/** Picks an option the way people do: by clicking its card (the radio itself is hidden). */
async function choose(page: Page, name: string | RegExp) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name }) })
    .click()
  await expect(page.getByRole('radio', { name })).toBeChecked()
}

async function add(page: Page, ...files: UploadFile[]) {
  await fileInput(page).setInputFiles(files)
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path()
  return readFile(path)
}

/** Clicks the row's download link and returns the file's name and bytes. */
async function downloadResult(page: Page, index = 0) {
  const row = rows(page).nth(index)
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  const download = page.waitForEvent('download')
  await row.getByRole('link', { name: /^Download|^Baixar/ }).click()
  const file = await download
  return { name: file.suggestedFilename(), bytes: await downloadBytes(file) }
}

test.describe('compress image to 50 KB', () => {
  test('preselects 50 KB, compresses under it and sends nothing anywhere', async ({ page }) => {
    await page.goto('/compress-image-to-50kb/')
    await expect(page.getByRole('radio', { name: '50 KB' })).toBeChecked()
    await waitForEngine(page)

    // From here on, nothing may leave the browser: not the photo, not a single request.
    const requests = recordRequests(page)
    await add(page, await photoWithLocation())
    const result = await downloadResult(page)

    expect(result.name).toBe('holiday-50kb.jpg')
    expect(result.bytes.length).toBeLessThanOrEqual(50_000)
    expect(isJpeg(result.bytes)).toBe(true)
    expect(bytesContain(result.bytes, SECRET)).toBe(false)
    await expect(rows(page).first()).toContainText('It fits your 50 KB limit')
    expect(requests).toEqual([])
  })

  test('works the same in Portuguese', async ({ page }) => {
    await page.goto('/pt/comprimir-imagem-para-50kb/')
    await expect(page.getByRole('radio', { name: '50 KB' })).toBeChecked()
    await expect(page.getByRole('group', { name: '1. Escolha o tamanho máximo' })).toBeVisible()
    await waitForEngine(page)
    await add(page, await photo('flowers'))
    const result = await downloadResult(page)
    expect(result.bytes.length).toBeLessThanOrEqual(50_000)
    await expect(rows(page).first()).toContainText('Cabe no seu limite de 50 KB')
  })
})

test.describe('output format', () => {
  test('WebP stays WebP by default, with a hint that forms often want JPG', async ({ page }) => {
    await page.goto('/compress-image-to-100kb/')
    await waitForEngine(page)
    const requests = recordRequests(page)
    await add(page, await webpPhoto())
    await expect(page.getByText('Many forms only accept JPG')).toBeVisible()
    const asWebp = await downloadResult(page)
    expect(asWebp.name).toBe('landscape-100kb.webp')
    expect(isWebp(asWebp.bytes)).toBe(true)

    // Choosing JPG and compressing again gives a JPG, and the hint goes away.
    await choose(page, /^JPG/)
    await expect(page.getByText('Many forms only accept JPG')).toBeHidden()
    await page.getByRole('button', { name: 'Compress again with these settings' }).click()
    const asJpeg = await downloadResult(page)
    expect(asJpeg.name).toBe('landscape-100kb.jpg')
    expect(isJpeg(asJpeg.bytes)).toBe(true)
    expect(asJpeg.bytes.length).toBeLessThanOrEqual(100_000)
    expect(requests).toEqual([])
  })

  test('a JPG can be saved as WebP', async ({ page }) => {
    await page.goto('/compress-image/')
    await choose(page, /^WebP/)
    await waitForEngine(page)
    await add(page, await photo('portrait'))
    const result = await downloadResult(page)
    expect(result.name).toBe('portrait-100kb.webp')
    expect(isWebp(result.bytes)).toBe(true)
    expect(result.bytes.length).toBeLessThanOrEqual(100_000)
  })
})

test('a transparent PNG becomes JPG on white, with a one-click WebP alternative', async ({
  page,
}) => {
  await page.goto('/compress-image-to-20kb/')
  await waitForEngine(page)
  const requests = recordRequests(page)
  await add(page, await transparentPng())
  const row = rows(page).first()
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  await expect(row).toContainText("JPG can't keep transparent areas")
  await expect(row).toContainText('Saved as JPG')

  await row.getByRole('button', { name: 'Keep transparency (WebP)' }).click()
  const result = await downloadResult(page)
  expect(result.name).toBe('logo-20kb.webp')
  expect(isWebp(result.bytes)).toBe(true)
  expect(result.bytes.length).toBeLessThanOrEqual(20_000)
  await expect(row).not.toContainText("JPG can't keep transparent areas")
  expect(requests).toEqual([])
})

test('a photo already under the limit keeps its image and loses its hidden details', async ({
  page,
}) => {
  await page.goto('/compress-image-to-1mb/')
  await waitForEngine(page)
  const original = await photoWithLocation()
  await add(page, original)
  await expect(rows(page).first()).toContainText('This photo was already under 1 MB')
  const result = await downloadResult(page)
  expect(result.bytes.length).toBeLessThan(original.buffer.length)
  expect(bytesContain(result.bytes, SECRET)).toBe(false)
})

test('a sideways photo is turned upright, and shrinking is explained', async ({ page }) => {
  await page.goto('/compress-image-to-20kb/')
  await waitForEngine(page)
  await add(page, await rotatedPhoto())
  const row = rows(page).first()
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  // Displayed size of the original is 798 × 1200: portrait, not landscape.
  await expect(row).toContainText(/Resized from 798 × 1200 to \d+ × \d+ pixels/)
  const [, width, height] = /to (\d+) × (\d+) pixels/.exec((await row.textContent()) ?? '') ?? []
  expect(Number(height)).toBeGreaterThan(Number(width))
})

test('several photos download together as a ZIP', async ({ page }) => {
  await page.goto('/compress-image-to-200kb/')
  await waitForEngine(page)
  const requests = recordRequests(page)
  await add(page, await photo('landscape'), await photo('flowers'), await photo('portrait'))
  for (let i = 0; i < 3; i += 1) {
    await expect(rows(page).nth(i)).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  }
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download all (ZIP)' }).click()
  const zip = await download
  expect(zip.suggestedFilename()).toBe('compressed-photos.zip')
  const bytes = await downloadBytes(zip)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  // One central-directory entry per photo.
  expect(bytes.toString('latin1').split('PK\x01\x02').length - 1).toBe(3)
  expect(requests).toEqual([])
})

test('cancel stops the photos that have not finished', async ({ page }) => {
  await page.goto('/compress-image-to-20kb/')
  await waitForEngine(page)
  await add(page, ...(await Promise.all([1, 2, 3, 4].map((n) => photo('landscape', `p${n}.jpg`)))))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('li[data-status="cancelled"]').first()).toBeVisible()
  await expect(page.locator('li[data-status="queued"], li[data-status="working"]')).toHaveCount(0)
})

test('a custom size can be typed and is validated', async ({ page }) => {
  await page.goto('/compress-image/')
  await choose(page, 'Other size')
  const field = page.getByRole('textbox', { name: 'Maximum size' })
  await field.fill('2')
  await expect(page.getByText('Choose a size between 5 KB and 20 MB.')).toBeVisible()
  await expect(fileInput(page)).toBeDisabled()
  await field.fill('75')
  await waitForEngine(page)
  await add(page, await photo('flowers'))
  const result = await downloadResult(page)
  expect(result.name).toBe('flowers-75kb.jpg')
  expect(result.bytes.length).toBeLessThanOrEqual(75_000)
})

test('can be used with the keyboard alone', async ({ page, browserName }) => {
  // Like Safari on macOS, WebKit's Tab skips radios and buttons unless Option is held.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  await page.goto('/compress-image-to-50kb/')
  await page.getByRole('radio', { name: '50 KB' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '100 KB' })).toBeChecked()
  // Focus alone (no pointer) is a sign of intent and loads the engine.
  await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
  // Tab moves to the next group's selected option, as with any radio group.
  await page.keyboard.press(tab)
  await expect(page.getByRole('radio', { name: /^Same as original/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: /^JPG/ })).toBeChecked()
  await page.keyboard.press(tab)
  await expect(fileInput(page)).toBeFocused()
})

test.describe('accessibility', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no axe violations before and after compressing (${colorScheme} theme)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/compress-image-to-50kb/')
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await waitForEngine(page)
      await add(page, await photo('flowers'), await transparentPng())
      await expect(rows(page).nth(1)).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
      // The success card's bounce has finished, so colours are measured at rest.
      await page.waitForTimeout(400)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    })
  }
})

test('takes a photo pasted with Ctrl+V', async ({ page }) => {
  await page.goto('/compress-image-to-50kb/')
  await waitForEngine(page)
  const file = await photo('flowers')
  // What a browser dispatches on Ctrl+V / Cmd+V with an image on the clipboard.
  await page.evaluate(
    ({ bytes, name, type }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], name, { type }))
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      document.body.dispatchEvent(event)
    },
    { bytes: [...file.buffer], name: file.name, type: file.mimeType },
  )
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  await expect(rows(page).first()).toContainText('It fits your 50 KB limit')
})

test.describe('loading', () => {
  test('preloads the engine when the page is idle', async ({ page }) => {
    await page.goto('/compress-image/')
    await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
  })

  test('waits for intent on Save-Data, and stays small before it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'navigator.connection exists only in Chromium')
    await expectSmallUntilIntent(page, '/compress-image-to-50kb/')
  })
})

/**
 * Large photos must not crash the page in any engine. The memory cap is the engine's own
 * (16 MP working size, ADR 0016); no per-browser cap was needed.
 */
test.describe('large photos', () => {
  for (const [width, height] of [
    [6000, 4000],
    [8000, 6000],
  ] as const) {
    test(`${(width * height) / 1e6} MP compresses to 100 KB without crashing`, async ({ page }) => {
      test.setTimeout(240_000)
      const crashed: string[] = []
      page.on('crash', () => crashed.push('page crashed'))
      const large = await largePhoto(width, height)
      await page.goto('/compress-image-to-100kb/')
      await waitForEngine(page)
      await add(page, large)
      const row = rows(page).first()
      await expect(row).toHaveAttribute('data-status', 'done', { timeout: 200_000 })
      const result = await downloadResult(page)
      expect(result.bytes.length).toBeLessThanOrEqual(100_000)
      expect(crashed).toEqual([])
    })
  }
})
