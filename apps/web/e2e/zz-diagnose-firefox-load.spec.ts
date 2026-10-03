// TEMPORARY DIAGNOSTIC (issue #10), never merged. Runs last, through the normal fixtures.
import { expect, test } from './fixtures.ts'

test.describe.configure({ retries: 0 })
test.skip(({ browserName }) => browserName !== 'firefox', 'Firefox only')

for (let i = 0; i < 30; i += 1) {
  test(`home, load (${i})`, async ({ page }) => {
    expect((await page.goto('/', { timeout: 10_000 }))?.status()).toBe(200)
  })
  test(`tool page, load (${i})`, async ({ page }) => {
    expect((await page.goto('/compress-image/', { timeout: 10_000 }))?.status()).toBe(200)
  })
}
