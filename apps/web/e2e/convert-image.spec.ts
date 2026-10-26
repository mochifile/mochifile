import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { Download, Page } from '@playwright/test'
import { expectSmallUntilIntent } from './budget.ts'
import { expect, test } from './fixtures.ts'
import {
  bytesContain,
  iphoneHeic,
  isJpeg,
  isPng,
  isWebp,
  photo,
  photoWithLocation,
  recordRequests,
  rotatedPhoto,
  SECRET,
  transparentPng,
  type UploadFile,
  untypedHeic,
  waitForEngine,
  webpPhoto,
} from './images.ts'

/** "Convert image": the full flow in every engine, on a production build. */

const fileInput = (page: Page) => page.locator('input[type="file"]')
const rows = (page: Page) => page.locator('li[data-status]')

/** Picks an option the way people do: by clicking its card (the radio itself is hidden). */
async function choose(page: Page, name: string) {
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name, exact: true }) })
    .click()
  await expect(page.getByRole('radio', { name, exact: true })).toBeChecked()
}

async function add(page: Page, ...files: UploadFile[]) {
  await fileInput(page).setInputFiles(files)
}

const downloadBytes = async (download: Download) => readFile(await download.path())

/** Clicks the row's download link and returns the file's name and bytes. */
async function downloadResult(page: Page, index = 0) {
  const row = rows(page).nth(index)
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  const download = page.waitForEvent('download')
  await row.getByRole('link', { name: /^Download|^Baixar/ }).click()
  const file = await download
  return { name: file.suggestedFilename(), bytes: await downloadBytes(file) }
}

/** Width and height of a PNG (IHDR) or a baseline/progressive JPEG (SOF marker). */
function dimensions(bytes: Buffer): { width: number; height: number } {
  if (isPng(bytes)) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1] ?? 0
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  throw new Error('No image size found')
}

test.describe('variant pages preselect their output', () => {
  const cases = [
    ['/convert-image/', 'JPG'],
    ['/heic-to-jpg/', 'JPG'],
    ['/webp-to-jpg/', 'JPG'],
    ['/png-to-jpg/', 'JPG'],
    ['/jpg-to-png/', 'PNG'],
    ['/webp-to-png/', 'PNG'],
    ['/jpg-to-webp/', 'WebP'],
    ['/pt/converter-imagem/', 'JPG'],
    ['/pt/heic-para-jpg/', 'JPG'],
    ['/pt/webp-para-jpg/', 'JPG'],
    ['/pt/png-para-jpg/', 'JPG'],
    ['/pt/jpg-para-png/', 'PNG'],
    ['/pt/webp-para-png/', 'PNG'],
    ['/pt/jpg-para-webp/', 'WebP'],
  ] as const
  for (const [path, format] of cases) {
    test(`${path} starts on ${format}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('radio', { name: format, exact: true })).toBeChecked()
    })
  }
})

test('a HEIC photo becomes a JPG without sending anything anywhere', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/heic-to-jpg/')
  await waitForEngine(page)

  // From here on, nothing may leave the browser: not the photo, not a single request.
  const requests = recordRequests(page)
  await add(page, await iphoneHeic())
  const result = await downloadResult(page)

  expect(result.name).toBe('IMG_0001.jpg')
  expect(isJpeg(result.bytes)).toBe(true)
  // The photo is stored rotated: it comes out upright, at full size.
  expect(dimensions(result.bytes)).toEqual({ width: 3024, height: 4032 })
  await expect(rows(page).first()).toContainText('Converted to JPG')
  await expect(rows(page).first()).toContainText('HEIC → ')
  expect(requests).toEqual([])
})

test('a HEIC without a file type is accepted by its extension', async ({ page }) => {
  await page.goto('/heic-to-jpg/')
  await waitForEngine(page)
  const requests = recordRequests(page)
  await add(page, await untypedHeic())
  const result = await downloadResult(page)
  expect(result.name).toBe('IMG_0002.jpg')
  expect(isJpeg(result.bytes)).toBe(true)
  expect(requests).toEqual([])
})

test('works the same in Portuguese', async ({ page }) => {
  await page.goto('/pt/heic-para-jpg/')
  await expect(page.getByRole('group', { name: '1. Converter para' })).toBeVisible()
  await waitForEngine(page)
  await add(page, await untypedHeic())
  const result = await downloadResult(page)
  expect(result.name).toBe('IMG_0002.jpg')
  await expect(rows(page).first()).toContainText('Convertida para JPG')
})

test.describe('transparency', () => {
  test('PNG with transparency → JPG is filled with white, with a PNG alternative', async ({
    page,
  }) => {
    await page.goto('/png-to-jpg/')
    await waitForEngine(page)
    const requests = recordRequests(page)
    await add(page, await transparentPng())
    const row = rows(page).first()
    await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
    await expect(row).toContainText("JPG can't keep transparent areas")

    await row.getByRole('button', { name: 'Keep transparency (PNG)' }).click()
    const result = await downloadResult(page)
    expect(result.name).toBe('logo.png')
    expect(isPng(result.bytes)).toBe(true)
    await expect(row).not.toContainText("JPG can't keep transparent areas")
    expect(requests).toEqual([])
  })

  test('PNG with transparency → PNG keeps it, untouched', async ({ page }) => {
    await page.goto('/convert-image/')
    await choose(page, 'PNG')
    await waitForEngine(page)
    await add(page, await transparentPng())
    const row = rows(page).first()
    await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
    await expect(row).toContainText('Already PNG')
    await expect(row).not.toContainText("JPG can't keep transparent areas")
  })
})

test('a sideways JPG comes out upright', async ({ page }) => {
  await page.goto('/jpg-to-png/')
  await waitForEngine(page)
  await add(page, await rotatedPhoto())
  const result = await downloadResult(page)
  expect(result.name).toBe('sideways.png')
  expect(dimensions(result.bytes)).toEqual({ width: 798, height: 1200 })
})

test.describe('other conversions', () => {
  test('WebP → PNG', async ({ page }) => {
    await page.goto('/webp-to-png/')
    await waitForEngine(page)
    await add(page, await webpPhoto())
    const result = await downloadResult(page)
    expect(result.name).toBe('landscape.png')
    expect(isPng(result.bytes)).toBe(true)
  })

  test('JPG → WebP', async ({ page }) => {
    await page.goto('/jpg-to-webp/')
    await waitForEngine(page)
    await add(page, await photo('portrait'))
    const result = await downloadResult(page)
    expect(result.name).toBe('portrait.webp')
    expect(isWebp(result.bytes)).toBe(true)
  })

  test('a JPG kept as JPG loses its hidden details but not its image', async ({ page }) => {
    await page.goto('/convert-image/')
    await waitForEngine(page)
    const original = await photoWithLocation()
    await add(page, original)
    await expect(rows(page).first()).toContainText('Already JPG')
    const result = await downloadResult(page)
    expect(result.name).toBe('holiday.jpg')
    expect(bytesContain(result.bytes, SECRET)).toBe(false)
    expect(result.bytes.length).toBeLessThan(original.buffer.length)
  })

  test('changing the format offers to convert again', async ({ page }) => {
    await page.goto('/jpg-to-png/')
    await waitForEngine(page)
    await add(page, await photo('flowers'))
    expect((await downloadResult(page)).name).toBe('flowers.png')
    await choose(page, 'WebP')
    await page.getByRole('button', { name: 'Convert again with this format' }).click()
    const again = await downloadResult(page)
    expect(again.name).toBe('flowers.webp')
    expect(isWebp(again.bytes)).toBe(true)
  })
})

test('a file that is not an image is refused kindly', async ({ page }) => {
  await page.goto('/convert-image/')
  await add(page, { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1') })
  await expect(rows(page).first()).toHaveAttribute('data-status', 'error')
  await expect(rows(page).first()).toContainText("isn't a HEIC, JPG, PNG, WebP or AVIF photo")
})

test('several photos download together as a ZIP', async ({ page }) => {
  await page.goto('/jpg-to-png/')
  await waitForEngine(page)
  const requests = recordRequests(page)
  await add(page, await photo('landscape'), await photo('flowers'), await photo('portrait'))
  for (let i = 0; i < 3; i += 1) {
    await expect(rows(page).nth(i)).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  }
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download all (ZIP)' }).click()
  const zip = await download
  expect(zip.suggestedFilename()).toBe('converted-photos.zip')
  const bytes = await downloadBytes(zip)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  // One central-directory entry per photo.
  expect(bytes.toString('latin1').split('PK\x01\x02').length - 1).toBe(3)
  expect(requests).toEqual([])
})

test('cancel stops the photos that have not finished', async ({ page }) => {
  await page.goto('/jpg-to-png/')
  await waitForEngine(page)
  await add(page, ...(await Promise.all([1, 2, 3, 4].map((n) => photo('landscape', `p${n}.jpg`)))))
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('li[data-status="cancelled"]').first()).toBeVisible()
  await expect(page.locator('li[data-status="queued"], li[data-status="working"]')).toHaveCount(0)
})

test('can be used with the keyboard alone', async ({ page, browserName }) => {
  // Like Safari on macOS, WebKit's Tab skips radios and buttons unless Option is held.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  await page.goto('/convert-image/')
  await page.getByRole('radio', { name: 'JPG', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'PNG', exact: true })).toBeChecked()
  await page.keyboard.press(tab)
  await expect(fileInput(page)).toBeFocused()
})

test.describe('accessibility', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no axe violations before and after converting (${colorScheme} theme)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/heic-to-jpg/')
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

test.describe('loading', () => {
  test('preloads the engine when the page is idle', async ({ page }) => {
    await page.goto('/heic-to-jpg/')
    await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
  })

  test('waits for intent on Save-Data, and stays small before it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'navigator.connection exists only in Chromium')
    await expectSmallUntilIntent(page, '/heic-to-jpg/')
  })
})
