import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/**
 * The wordmark (Logo.astro, ADR 0024) comes in two files and global.css shows the one that
 * matches the theme: the system's colour scheme, or a forced `data-theme`. The footer is an ink
 * block in every theme and always shows the cream file. `home.spec.ts` covers the logo's name,
 * minimum size and clear space.
 */

const PAGES = ['/', '/pt/', '/compress-image/'] as const

/** The wordmark files currently drawn inside `scope` (`header` or `footer`), by scheme. */
async function shown(page: Page, scope: 'header' | 'footer') {
  return page
    .locator(`${scope} [data-logo] img`)
    .evaluateAll((images) =>
      images
        .filter((img) => getComputedStyle(img).display !== 'none')
        .map((img) => (img as HTMLImageElement).dataset.wordmark),
    )
}

/** Waits for the images drawn in `scope` to load, as the lazy ones start after layout. */
async function loaded(page: Page, scope: 'header' | 'footer') {
  await page.locator(`${scope} [data-logo]`).scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      page
        .locator(`${scope} [data-logo] img`)
        .evaluateAll((images) =>
          images
            .filter((img) => getComputedStyle(img).display !== 'none')
            .every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true)
}

for (const path of PAGES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the header shows the ${theme} wordmark when the theme is forced to ${theme} (${path})`, async ({
      page,
    }) => {
      // The opposite system preference: only the forced theme can decide.
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
      await page.goto(path)
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      expect(await shown(page, 'header')).toEqual([theme])
      await loaded(page, 'header')
    })
  }

  test(`the footer shows the cream wordmark in a light and a dark theme (${path})`, async ({
    page,
  }) => {
    await page.goto(path)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      expect(await shown(page, 'footer'), `${theme} theme`).toEqual(['dark'])
    }
    await loaded(page, 'footer')
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the header follows the system's ${colorScheme} colour scheme without a forced theme`, async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    const emulated = await page.evaluate(
      (scheme) => matchMedia(`(prefers-color-scheme: ${scheme})`).matches,
      colorScheme,
    )
    // As home-page.spec.ts does: Firefox in CI did not always apply the emulation.
    test.skip(!emulated && browserName === 'firefox', `Firefox did not apply ${colorScheme}`)
    expect(emulated, 'the colour scheme emulation applies').toBe(true)
    expect(await shown(page, 'header')).toEqual([colorScheme])
    await loaded(page, 'header')
  })
}

test('each wordmark keeps its proportions at every width, so nothing moves when it loads', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      for (const scope of ['header', 'footer'] as const) {
        const [box] = await page.locator(`${scope} [data-logo] img`).evaluateAll((images) =>
          images
            .filter((img) => getComputedStyle(img).display !== 'none')
            .map((img) => {
              const { width, height } = img.getBoundingClientRect()
              // The attributes: `img.width` is the rendered width, not the declared one.
              const declared =
                Number(img.getAttribute('width')) / Number(img.getAttribute('height'))
              return { width, height, attr: declared }
            }),
        )
        if (!box) throw new Error(`no wordmark in the ${scope}`)
        // The box follows the width and height attributes, whatever file the srcset picks.
        expect(box.width / box.height, `${scope}, ${theme}, ${width} px`).toBeCloseTo(box.attr, 2)
        expect(box.width, `${scope}, ${width} px`).toBe(width < 600 ? 120 : 184)
      }
    }
  }
})
