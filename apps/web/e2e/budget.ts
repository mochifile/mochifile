import { gzipSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'

/** JavaScript a tool page may ship before any interaction, gzipped as the CDN serves it. */
export const JS_BUDGET_BYTES = 90 * 1024

/**
 * Loads a tool page with Save-Data on (Chromium only) and checks that, before any sign of
 * intent, it fetches no wasm and no worker and stays within `JS_BUDGET_BYTES`; then that a
 * hover loads the engine. Shared by every tool's spec.
 */
export async function expectSmallUntilIntent(page: Page, path: string): Promise<void> {
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
  await page.goto(path)
  await expect(page.locator('input[type="file"]')).toBeAttached()
  await page.waitForTimeout(3000)
  expect(requests.filter((url) => url.endsWith('.wasm'))).toEqual([])
  expect(requests.filter((url) => url.includes('worker'))).toEqual([])
  await expect(page.locator('[data-engine="idle"]')).toBeAttached()
  const gzipped = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0)
  expect(gzipped).toBeLessThanOrEqual(JS_BUDGET_BYTES)

  await page.locator('[data-engine]').hover()
  await page.locator('[data-engine="ready"]').waitFor({ timeout: 30_000 })
  expect(requests.some((url) => url.endsWith('.wasm'))).toBe(true)
}
