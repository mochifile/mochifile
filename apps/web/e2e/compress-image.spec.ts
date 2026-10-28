import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
import type { Browser, Download, Locator, Page } from '@playwright/test'
import { expect, projectContextOptions, test } from './fixtures.ts'
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

/** Puts photos in the list. They are compressed when the person asks ("Compress 3 photos"). */
async function add(page: Page, ...files: UploadFile[]) {
  await fileInput(page).setInputFiles(files)
}

/** What a browser dispatches on Ctrl+V / Cmd+V with images on the clipboard. */
async function paste(page: Page, ...files: UploadFile[]) {
  await page.evaluate(
    (list) => {
      const data = new DataTransfer()
      for (const { bytes, name, type } of list) {
        data.items.add(new File([new Uint8Array(bytes)], name, { type }))
      }
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      document.body.dispatchEvent(event)
    },
    files.map((file) => ({ bytes: [...file.buffer], name: file.name, type: file.mimeType })),
  )
}

const startButton = (page: Page) =>
  page.getByRole('button', { name: /^(Compress \d+ photos?|Comprimir \d+ fotos?)$/ })

/** Adds photos and clicks "Compress N photos". */
async function addAndCompress(page: Page, ...files: UploadFile[]) {
  await add(page, ...files)
  await startButton(page).click()
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
    // The photo is listed first: nothing is compressed until the person says so.
    await expect(rows(page).first()).toHaveAttribute('data-status', 'queued')
    await expect(startButton(page)).toHaveText('Compress 1 photo')
    await startButton(page).click()
    const result = await downloadResult(page)

    expect(result.name).toBe('holiday-50kb.jpg')
    expect(result.bytes.length).toBeLessThanOrEqual(50_000)
    expect(isJpeg(result.bytes)).toBe(true)
    expect(bytesContain(result.bytes, SECRET)).toBe(false)
    // One photo: the banner says the result, the row lists the facts.
    await expect(page.getByText('Ready! It fits your 50 KB limit.')).toBeVisible()
    await expect(rows(page).first()).toContainText('Hidden details removed')
    expect(requests).toEqual([])

    // "Compress another" clears the list and returns to "Choose photos".
    await page.getByRole('button', { name: 'Compress another' }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(fileInput(page)).toBeFocused()
  })

  test('works the same in Portuguese', async ({ page }) => {
    await page.goto('/pt/comprimir-imagem-para-50kb/')
    await expect(page.getByRole('radio', { name: '50 KB' })).toBeChecked()
    await expect(page.getByRole('group', { name: '1. Escolha o tamanho máximo' })).toBeVisible()
    // The panel's steps are sections in the page outline.
    await expect(
      page.getByRole('heading', { level: 2, name: '1. Escolha o tamanho máximo' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '2. Salvar como' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: '3. Escolha suas fotos' }),
    ).toBeVisible()
    await waitForEngine(page)
    await add(page, await photo('flowers'))
    await expect(startButton(page)).toHaveText('Comprimir 1 foto')
    await startButton(page).click()
    const result = await downloadResult(page)
    expect(result.bytes.length).toBeLessThanOrEqual(50_000)
    await expect(page.getByText('Pronto! Cabe no seu limite de 50 KB.')).toBeVisible()
    await expect(rows(page).first()).toContainText('Detalhes ocultos removidos')
  })
})

test.describe('output format', () => {
  test('WebP stays WebP by default, with a hint that forms often want JPG', async ({ page }) => {
    await page.goto('/compress-image-to-100kb/')
    await waitForEngine(page)
    const requests = recordRequests(page)
    await add(page, await webpPhoto())
    await expect(page.getByText('Many forms only accept JPG')).toBeVisible()
    await startButton(page).click()
    const asWebp = await downloadResult(page)
    expect(asWebp.name).toBe('landscape-100kb.webp')
    expect(isWebp(asWebp.bytes)).toBe(true)

    // Starting over and choosing JPG gives a JPG, and the hint goes away.
    await page.getByRole('button', { name: 'Compress another' }).click()
    await choose(page, /^JPG/)
    await add(page, await webpPhoto())
    await expect(page.getByText('Many forms only accept JPG')).toBeHidden()
    await startButton(page).click()
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
    await addAndCompress(page, await photo('portrait'))
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
  await addAndCompress(page, await transparentPng())
  const row = rows(page).first()
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  // The notice sits between the banner and the list, and the row is outlined.
  const notice = page.getByRole('status').filter({ hasText: "JPG can't keep transparent areas" })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('The transparent background became white.')
  await expect(row).toContainText('Saved as JPG')
  await expect(row).toContainText('Transparency filled with white')

  await notice.getByRole('button', { name: 'Keep transparency (WebP)' }).click()
  const result = await downloadResult(page)
  expect(result.name).toBe('logo-20kb.webp')
  expect(isWebp(result.bytes)).toBe(true)
  expect(result.bytes.length).toBeLessThanOrEqual(20_000)
  await expect(notice).toBeHidden()
  expect(requests).toEqual([])
})

test('a photo already under the limit keeps its image and loses its hidden details', async ({
  page,
}) => {
  await page.goto('/compress-image-to-1mb/')
  await waitForEngine(page)
  const original = await photoWithLocation()
  await addAndCompress(page, original)
  await expect(page.getByText('This photo was already under 1 MB.')).toBeVisible()
  await expect(rows(page).first()).toContainText('Already under 1 MB')
  const result = await downloadResult(page)
  expect(result.bytes.length).toBeLessThan(original.buffer.length)
  expect(bytesContain(result.bytes, SECRET)).toBe(false)
})

test('a sideways photo is turned upright, and shrinking is explained', async ({ page }) => {
  await page.goto('/compress-image-to-20kb/')
  await waitForEngine(page)
  await addAndCompress(page, await rotatedPhoto())
  const row = rows(page).first()
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  // Displayed size of the original is 798 × 1200: portrait, not landscape.
  await expect(row).toContainText('Smaller in pixels')
  await expect(row).toContainText(
    /We also made the photo smaller: from 798 × 1200 to \d+ × \d+ pixels\./,
  )
  const [, width, height] = /to (\d+) × (\d+) pixels/.exec((await row.textContent()) ?? '') ?? []
  expect(Number(height)).toBeGreaterThan(Number(width))
})

test('several photos download together as a ZIP', async ({ page }) => {
  await page.goto('/compress-image-to-200kb/')
  await waitForEngine(page)
  const requests = recordRequests(page)
  await addAndCompress(
    page,
    await photo('landscape'),
    await photo('flowers'),
    await photo('portrait'),
  )
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
  await addAndCompress(
    page,
    ...(await Promise.all([1, 2, 3, 4].map((n) => photo('landscape', `p${n}.jpg`)))),
  )
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('li[data-status="cancelled"]').first()).toBeVisible()
  await expect(page.locator('li[data-status="queued"], li[data-status="working"]')).toHaveCount(0)

  // Focus moves to "Compress again with these settings", and the batch says what is left.
  const carryOn = page.getByRole('button', { name: 'Compress again with these settings' })
  await expect(carryOn).toBeFocused()
  await expect(page.getByText('You cancelled.')).toBeVisible()
  // Depending on how far it got: none ready, or some ready and the others not compressed.
  await expect(
    page.getByText(
      /^(No photo was compressed\.|\d photos? (is|are) ready\. The other (one wasn't|\d weren't) compressed\.)$/,
    ),
  ).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // The others continue, with the settings they were added with.
  await carryOn.click()
  await expect(page.locator('li[data-status="done"]')).toHaveCount(4, { timeout: 90_000 })
  await expect(page.getByText('Ready! All 4 photos fit 20 KB.')).toBeVisible()
  await expect(page.getByText(/^.+ → .+ in total$/)).toBeVisible()

  // "Compress more" clears the finished batch and returns to "Choose photos".
  await page.getByRole('button', { name: 'Compress more' }).click()
  await expect(rows(page)).toHaveCount(0)
  await expect(fileInput(page)).toBeFocused()
})

test('photos can be taken out of the list before compressing', async ({ page }) => {
  await page.goto('/compress-image-to-50kb/')
  await waitForEngine(page)
  await add(page, await photo('landscape', 'a.jpg'), await photo('flowers', 'b.jpg'))
  await expect(startButton(page)).toHaveText('Compress 2 photos')
  // Focus moves to the next file's button, and the count follows.
  await page.getByRole('button', { name: 'Remove a.jpg' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(page.locator(':focus')).toHaveAttribute('data-remove', /\d+/)
  await expect(startButton(page)).toHaveText('Compress 1 photo')
  // Taking out the last one returns to "Choose photos".
  await page.getByRole('button', { name: 'Remove b.jpg' }).click()
  await expect(rows(page)).toHaveCount(0)
  await expect(fileInput(page)).toBeFocused()
  // "Clear list" does the same for a whole list.
  await add(page, await photo('landscape', 'c.jpg'), await photo('flowers', 'd.jpg'))
  await page.getByRole('button', { name: 'Clear list' }).click()
  await expect(rows(page)).toHaveCount(0)
})

test('the options chosen when "Compress" is pressed are the ones used', async ({ page }) => {
  await page.goto('/compress-image-to-50kb/')
  await waitForEngine(page)
  await add(page, await photo('flowers'))
  // Changed after the photo was listed, before compressing.
  await choose(page, '20 KB')
  await startButton(page).click()
  const result = await downloadResult(page)
  expect(result.name).toBe('flowers-20kb.jpg')
  expect(result.bytes.length).toBeLessThanOrEqual(20_000)
})

test.describe('files that cannot be compressed', () => {
  const heic: UploadFile = {
    name: 'IMG_0001.HEIC',
    mimeType: 'image/heic',
    buffer: Buffer.alloc(2_600_000),
  }
  const damaged: UploadFile = {
    name: 'foto-escaneada.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  }
  /** A PNG header claiming 20000 × 20000 pixels: refused before it is decoded. */
  const gigantic = (): UploadFile => {
    const header = Buffer.alloc(33)
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    ]).copy(header)
    header.writeUInt32BE(20_000, 16)
    header.writeUInt32BE(20_000, 20)
    header[24] = 8
    header[25] = 2
    return { name: 'mapa-gigante.png', mimeType: 'image/png', buffer: header }
  }
  const sizeGroup = (page: Page) => page.getByRole('group', { name: '1. Choose the maximum size' })

  test('a file that is not a JPG, PNG or WebP is refused at once, with its reason', async ({
    page,
  }) => {
    await page.goto('/compress-image-to-50kb/')
    await waitForEngine(page)
    await add(page, heic)
    const row = rows(page).first()
    await expect(row).toHaveAttribute('data-status', 'error')
    await expect(row).toContainText("This file isn't a JPG, PNG or WebP photo.")
    await expect(page.getByText('HEIC is not supported yet.')).toBeVisible()
    // Nothing to compress: only the list, and a way out.
    await expect(sizeGroup(page)).toBeHidden()
    await expect(startButton(page)).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await row.getByRole('button', { name: 'Remove IMG_0001.HEIC' }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(sizeGroup(page)).toBeVisible()
    await expect(fileInput(page)).toBeFocused()
  })

  test('a file over 50 MB is refused at once', async ({ page }) => {
    await page.goto('/compress-image-to-50kb/')
    await waitForEngine(page)
    await add(page, {
      name: 'panorama-praia.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(50_500_000),
    })
    await expect(rows(page).first()).toContainText(
      'This file is larger than 50 MB. Try a smaller copy.',
    )
    await expect(sizeGroup(page)).toBeHidden()
  })

  test('a damaged photo, and one over 100 megapixels, say what happened', async ({ page }) => {
    await page.goto('/compress-image-to-50kb/')
    await waitForEngine(page)
    await addAndCompress(page, damaged)
    await expect(rows(page).first()).toContainText('This image seems damaged')
    // A single photo that failed shows its row only, and is removed with its own button.
    await expect(page.locator('.cp-banner[data-tone="attention"]')).toBeHidden()
    await rows(page).first().getByRole('button', { name: 'Remove foto-escaneada.jpg' }).click()
    await expect(rows(page)).toHaveCount(0)

    await addAndCompress(page, gigantic())
    await expect(rows(page).first()).toContainText(
      'This image is too large to open here (over 100 megapixels). Try a smaller copy.',
    )
  })

  test('a batch with a failure says how many are ready, and what to do', async ({ page }) => {
    await page.goto('/compress-image-to-50kb/')
    await waitForEngine(page)
    await addAndCompress(page, await photo('landscape', 'IMG_0412.jpg'), damaged)
    const banner = page.locator('.cp-banner[data-tone="attention"]')
    await expect(banner).toBeVisible({ timeout: 60_000 })
    await expect(banner).toContainText('1 of 2 photos is ready.')
    await expect(banner).toContainText('The other one needs your attention: see below.')
    // One photo is ready: its own download, and a way to start over.
    await expect(banner.getByRole('link', { name: /^Download/ })).toBeVisible()
    await expect(page.locator('li[data-status="error"]')).toContainText('damaged')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await banner.getByRole('button', { name: 'Compress again' }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(fileInput(page)).toBeFocused()
  })

  test('more than 20 photos: the first 20 are listed, with a notice', async ({ page }) => {
    await page.goto('/compress-image-to-50kb/')
    await waitForEngine(page)
    const many = await Promise.all(
      Array.from({ length: 22 }, (_, n) =>
        photo('landscape', `IMG_${String(n + 1).padStart(4, '0')}.jpg`),
      ),
    )
    await add(page, ...many)
    await expect(rows(page)).toHaveCount(5)
    await expect(page.getByText('+ 15 more photos')).toBeVisible()
    await expect(startButton(page)).toHaveText('Compress 20 photos')
    await expect(
      page.getByRole('alert').filter({ hasText: 'You can add up to 20 photos at a time.' }),
    ).toContainText('Only the first ones were added.')
  })
})

test('says when the compressor did not load, and tries again when asked', async ({
  testBrowser,
}) => {
  test.setTimeout(120_000)
  // Its own context: the blocked downloads log console errors, which the default page fixture
  // counts as failures. Routing on the context also covers the worker's requests.
  const context = await testBrowser.newContext(projectContextOptions())
  try {
    await context.route('**/*.wasm', (route) => route.abort())
    const page = await context.newPage()
    await page.goto('/compress-image/')
    // A photo added meanwhile waits instead of failing.
    await add(page, await photo('flowers'))
    await page.locator('[data-engine="failed"]').waitFor({ timeout: 30_000 })
    await expect(rows(page).first()).toHaveAttribute('data-status', 'queued')
    const message = page.getByRole('alert').filter({ hasText: "We couldn't load the compressor." })
    await expect(message).toBeVisible()
    await expect(message).toContainText("The compressor didn't load")
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    await context.unroute('**/*.wasm')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('[data-engine="ready"]')).toBeAttached({ timeout: 60_000 })
    await expect(message).toBeHidden()
    // Back where the person left off: the photo is listed, and "Compress" has focus.
    await expect(startButton(page)).toBeFocused()
    await startButton(page).click()
    await expect(rows(page).first()).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  } finally {
    await context.close()
  }
})

test('says when the browser cannot run the tool', async ({ testBrowser }) => {
  const context = await testBrowser.newContext(projectContextOptions())
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Worker', { value: undefined })
    })
    await page.goto('/compress-image/')
    await expect(page.getByText("This browser can't run the tool.")).toBeVisible()
    await expect(fileInput(page)).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  } finally {
    await context.close()
  }
})

test('on a phone, the panel is one column and the photo is compressed there', async ({
  testBrowser,
}) => {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    await page.goto('/compress-image-to-50kb/')
    // Options first, then the drop area, all in one column.
    const size = page.getByRole('radio', { name: '20 KB' })
    await expect(size).toBeAttached()
    const first = await page
      .getByRole('group', { name: '1. Choose the maximum size' })
      .boundingBox()
    const drop = await page.locator('label.cp-drop').boundingBox()
    if (!first || !drop) throw new Error('missing boxes')
    expect(drop.y).toBeGreaterThan(first.y + first.height)
    expect(Math.abs(drop.x - first.x)).toBeLessThan(4)

    await choose(page, '20 KB')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await waitForEngine(page)
    await addAndCompress(page, await photo('flowers'))
    const result = await downloadResult(page)
    expect(result.name).toBe('flowers-20kb.jpg')
    expect(result.bytes.length).toBeLessThanOrEqual(20_000)
  } finally {
    await context.close()
  }
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
  await addAndCompress(page, await photo('flowers'))
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
      // Listed, then compressed.
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await startButton(page).click()
      await expect(rows(page).nth(1)).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
      // The success card's bounce has finished, so colours are measured at rest.
      await page.waitForTimeout(400)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

      // A damaged file added to the finished list turns the banner into an attention (mango)
      // one, and its row into an error.
      await paste(page, {
        name: 'damaged.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      })
      await expect(page.locator('.cp-banner[data-tone="attention"]')).toBeVisible({
        timeout: 60_000,
      })
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
  await startButton(page).click()
  await expect(rows(page).first()).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
  await expect(page.getByText('Ready! It fits your 50 KB limit.')).toBeVisible()
})

/** What a browser dispatches when files are dragged over the page and dropped. */
async function dropFiles(page: Page, ...files: UploadFile[]) {
  const send = (kind: 'dragover' | 'drop') =>
    page.evaluate(
      ({ list, kind }) => {
        const data = new DataTransfer()
        for (const { bytes, name, type } of list) {
          data.items.add(new File([new Uint8Array(bytes)], name, { type }))
        }
        const event = new Event(kind, { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'dataTransfer', { value: data })
        document.querySelector('.cp')?.dispatchEvent(event)
      },
      {
        list: files.map((file) => ({
          bytes: [...file.buffer],
          name: file.name,
          type: file.mimeType,
        })),
        kind,
      },
    )
  await send('dragover')
  // While photos are over the panel it says so, wherever they would land.
  await expect(page.locator('.cp')).toHaveAttribute('data-dragging', 'true')
  await send('drop')
  await expect(page.locator('.cp')).not.toHaveAttribute('data-dragging', '')
}

/** A phone: 390 × 844, touch. Taps, not clicks. */
async function phonePage(testBrowser: Browser, path: string) {
  const context = await testBrowser.newContext({
    ...projectContextOptions(),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto(path)
  await waitForEngine(page)
  return { context, page }
}

/** Nothing in the panel, and not the page, runs off the screen's edge. */
async function expectNoOverflow(page: Page, width = 390) {
  const outside = await page.locator('.cp').evaluate((root, max) => {
    return [...root.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.left < -0.5 || r.right > max + 0.5)
      })
      .map((el) => `${el.tagName} «${el.textContent?.trim().slice(0, 30)}»`)
  }, width)
  expect(outside).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
}

/** A control a thumb can hit: at least 44 px each way, and inside the screen. */
async function expectThumbSized(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('no box')
  // To the pixel: a 44 px button is measured as 43.99997 while its row's bounce is under way.
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44)
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(44)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(390)
}

test.describe('on a phone, while photos are compressed', () => {
  test('photos pasted or dropped meanwhile join the batch, and all download together', async ({
    testBrowser,
  }) => {
    test.setTimeout(180_000)
    const { context, page } = await phonePage(testBrowser, '/compress-image-to-20kb/')
    try {
      await add(
        page,
        await photo('landscape', 'a.jpg'),
        await photo('flowers', 'b.jpg'),
        await photo('portrait', 'c.jpg'),
      )
      await startButton(page).tap()
      await expect(page.locator('.cp-banner[data-tone="working"]')).toBeVisible()

      // One more arrives by paste, one by drop, while the first are on their way.
      await paste(page, await photo('landscape', 'd.jpg'))
      await expect(rows(page)).toHaveCount(4)
      await dropFiles(page, await photo('flowers', 'e.jpg'))
      await expect(rows(page)).toHaveCount(5)
      // The count of the batch follows, and the header is still the working one.
      await expect(page.getByText(/^\d of 5 ready$/)).toBeVisible()

      await expect(rows(page).nth(4)).toHaveAttribute('data-status', 'done', { timeout: 150_000 })
      await expect(page.locator('li[data-status="done"]')).toHaveCount(5)
      await expect(page.getByText('Ready! All 5 photos fit 20 KB.')).toBeVisible()
      await expectNoOverflow(page)

      // All of them in one ZIP, tapped.
      const zipButton = page.getByRole('button', { name: 'Download all (ZIP)' })
      await expectThumbSized(zipButton)
      const download = page.waitForEvent('download')
      await zipButton.tap()
      const zip = await download
      expect(zip.suggestedFilename()).toBe('compressed-photos.zip')
      const bytes = await downloadBytes(zip)
      expect(bytes.subarray(0, 2).toString()).toBe('PK')
      expect(bytes.toString('latin1').split('PK\x01\x02').length - 1).toBe(5)
    } finally {
      await context.close()
    }
  })

  test('photos over the limit of 20 are told apart, also while compressing', async ({
    testBrowser,
  }) => {
    test.setTimeout(120_000)
    const { context, page } = await phonePage(testBrowser, '/compress-image-to-20kb/')
    try {
      await addAndCompress(page, await photo('landscape', 'first.jpg'))
      await expect(page.locator('.cp-banner[data-tone="working"]')).toBeVisible()
      const many = await Promise.all(
        Array.from({ length: 20 }, (_, n) => photo('flowers', `more-${n}.jpg`)),
      )
      await paste(page, ...many)
      // 1 + 19 fit; the notice says so where the person is looking.
      await expect(rows(page)).toHaveCount(20)
      await expect(
        page.getByRole('alert').filter({ hasText: 'You can add up to 20 photos at a time.' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).tap()
      await expect(page.getByText('You cancelled.')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('Cancel is a thumb-sized button, stops the rest, and the batch can go on', async ({
    testBrowser,
  }) => {
    test.setTimeout(150_000)
    const { context, page } = await phonePage(testBrowser, '/compress-image-to-20kb/')
    try {
      await add(
        page,
        ...(await Promise.all([1, 2, 3, 4].map((n) => photo('landscape', `p${n}.jpg`)))),
      )
      await startButton(page).tap()
      const cancel = page.getByRole('button', { name: 'Cancel' })
      await expect(cancel).toBeVisible()
      await expectThumbSized(cancel)
      await cancel.tap()

      await expect(page.getByText('You cancelled.')).toBeVisible()
      await expect(page.locator('li[data-status="queued"], li[data-status="working"]')).toHaveCount(
        0,
      )
      const carryOn = page.getByRole('button', { name: 'Compress again with these settings' })
      await expect(carryOn).toBeFocused()
      await expectThumbSized(carryOn)
      await expectNoOverflow(page)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

      // Photos added after a cancel start at once, and the cancelled ones can still be resumed.
      await paste(page, await photo('flowers', 'late.jpg'))
      await expect(rows(page)).toHaveCount(5)
      await carryOn.tap()
      await expect(page.locator('li[data-status="done"]')).toHaveCount(5, { timeout: 120_000 })
      await expect(page.getByText('Ready! All 5 photos fit 20 KB.')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('a result downloads with a tap, from its row and from the banner', async ({
    testBrowser,
  }) => {
    test.setTimeout(120_000)
    const { context, page } = await phonePage(testBrowser, '/compress-image-to-50kb/')
    try {
      await addAndCompress(page, await photoWithLocation())
      const row = rows(page).first()
      await expect(row).toHaveAttribute('data-status', 'done', { timeout: 60_000 })

      // The row's download icon is thumb-sized and downloads the file.
      const rowLink = row.getByRole('link', { name: /^Download/ })
      await expectThumbSized(rowLink)
      let download = page.waitForEvent('download')
      await rowLink.tap()
      let file = await download
      expect(file.suggestedFilename()).toBe('holiday-50kb.jpg')
      const fromRow = await downloadBytes(file)
      expect(fromRow.length).toBeLessThanOrEqual(50_000)
      expect(bytesContain(fromRow, SECRET)).toBe(false)

      // So does the banner's button, with the same file.
      const bannerLink = page.locator('.cp-banner').getByRole('link', { name: /^Download/ })
      await expectThumbSized(bannerLink)
      download = page.waitForEvent('download')
      await bannerLink.tap()
      file = await download
      expect(file.suggestedFilename()).toBe('holiday-50kb.jpg')
      expect((await downloadBytes(file)).length).toBe(fromRow.length)
      // Nothing on the screen runs off its edge.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)
    } finally {
      await context.close()
    }
  })
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
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true, effectiveType: '4g' },
      })
    })
    const scripts: Array<Promise<number>> = []
    const requests: string[] = []
    page.on('response', (response) => {
      const url = response.url()
      requests.push(url)
      if (url.endsWith('.js')) scripts.push(response.body().then((body) => gzipSync(body).length))
    })
    await page.goto('/compress-image-to-50kb/')
    await expect(fileInput(page)).toBeAttached()
    await page.waitForTimeout(3000)
    expect(requests.filter((url) => url.endsWith('.wasm'))).toEqual([])
    expect(requests.filter((url) => url.includes('worker'))).toEqual([])
    await expect(page.locator('[data-engine="idle"]')).toBeAttached()
    // JavaScript before interaction, compressed as the CDN serves it.
    const gzipped = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0)
    expect(gzipped).toBeLessThanOrEqual(90 * 1024)

    await page.locator('[data-engine]').hover()
    await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
    expect(requests.some((url) => url.endsWith('.wasm'))).toBe(true)
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
      await addAndCompress(page, large)
      const row = rows(page).first()
      await expect(row).toHaveAttribute('data-status', 'done', { timeout: 200_000 })
      const result = await downloadResult(page)
      expect(result.bytes.length).toBeLessThanOrEqual(100_000)
      expect(crashed).toEqual([])
    })
  }
})
