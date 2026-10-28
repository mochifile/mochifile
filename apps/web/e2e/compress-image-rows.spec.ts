import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { transparentPng, waitForEngine } from './images.ts'

/**
 * Result rows on a phone (V2 compressor, state 11: a transparent PNG becomes JPG). The chip
 * "Transparency filled with white" is long, so it has to wrap inside the row; it used to run under
 * the Download button. These checks look at the boxes themselves: no part of the row's text may
 * overlap the button, nothing may leave the row, and the button keeps its place and size. A page
 * that merely does not scroll sideways would pass while a chip was hidden behind the button.
 */

const WIDTHS = [320, 360, 375, 390] as const
const LONG_NAME = 'holiday-photo-of-the-whole-family-at-the-beach-with-a-very-long-name'

const PAGES = [
  { locale: 'en', path: '/compress-image-to-20kb/', chip: 'Transparency filled with white' },
  { locale: 'pt', path: '/pt/comprimir-imagem-para-20kb/', chip: 'Transparência' },
] as const

interface Box {
  name: string
  left: number
  right: number
  top: number
  bottom: number
}

/** Every box of a done row: its parts and its Download button, read in one go. */
async function boxes(page: Page) {
  return page
    .locator('li[data-status="done"]')
    .first()
    .evaluate((row) => {
      const rect = (el: Element, name: string) => {
        const r = el.getBoundingClientRect()
        return { name, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }
      const download = row.querySelector('a.cp-icon-btn')
      const parts = [
        ...row.querySelectorAll('.cp-tile, .cp-name, .cp-mono, .cp-tag, .cp-note'),
      ].map((el, index) => rect(el, `${el.className}#${index}`))
      return {
        row: rect(row, 'row'),
        download: download ? rect(download, 'download') : null,
        parts,
        scroll: [row.scrollWidth, row.clientWidth],
      }
    })
}

const overlap = (a: Box, b: Box) =>
  a.left < b.right - 0.5 &&
  b.left < a.right - 0.5 &&
  a.top < b.bottom - 0.5 &&
  b.top < a.bottom - 0.5

for (const { locale, path, chip } of PAGES) {
  test(`a result row keeps its chips clear of Download at 320-390 px (${locale}, long name)`, async ({
    page,
  }) => {
    await page.goto(path)
    await waitForEngine(page)
    const png = await transparentPng()
    await page.locator('input[type="file"]').setInputFiles([{ ...png, name: `${LONG_NAME}.png` }])
    await page.getByRole('button', { name: /^(Compress|Comprimir) 1/ }).click()
    const row = page.locator('li[data-status="done"]').first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    await expect(row.locator('.cp-tag', { hasText: chip })).toBeVisible()

    let reference: { width: number; height: number } | undefined
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      const { row: rowBox, download, parts, scroll } = await boxes(page)
      const where = `${locale} ${width}px`
      expect(download, `${where}: Download button`).not.toBeNull()
      if (!download) continue
      // The button keeps its size and sits inside the row, at its right edge.
      expect(download.right - download.left, `${where}: button width`).toBeGreaterThanOrEqual(43.9)
      expect(download.bottom - download.top, `${where}: button height`).toBeGreaterThanOrEqual(43.9)
      expect(download.right, `${where}: button inside row`).toBeLessThanOrEqual(rowBox.right)
      expect(rowBox.right - download.right, `${where}: button at the row's edge`).toBeLessThan(20)
      reference ??= {
        width: download.right - download.left,
        height: download.bottom - download.top,
      }
      expect(download.right - download.left, `${where}: same button`).toBe(reference.width)
      // Nothing of the text overlaps the button or leaves the row.
      for (const part of parts) {
        expect(overlap(part, download), `${where}: ${part.name} overlaps Download`).toBe(false)
        expect(part.right, `${where}: ${part.name} leaves the row`).toBeLessThanOrEqual(
          download.left + 0.5,
        )
        expect(part.left, `${where}: ${part.name} leaves the row`).toBeGreaterThanOrEqual(
          rowBox.left - 0.5,
        )
      }
      const [scrollWidth = 0, clientWidth = 0] = scroll
      expect(scrollWidth, `${where}: row overflow`).toBeLessThanOrEqual(clientWidth + 1)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${where}: page overflow`,
      ).toBeLessThanOrEqual(width)
    }
  })
}
