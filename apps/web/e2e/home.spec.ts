import { ALLOW_SEARCH_INDEXING } from '../search-indexing.ts'
import { expect, test } from './fixtures.ts'

const SITE = 'https://mochifile.com'

const pages = [
  { path: '/', lang: 'en', heading: 'File tools that just work', canonical: `${SITE}/` },
  {
    path: '/pt/',
    lang: 'pt',
    heading: 'Ferramentas de arquivos que simplesmente funcionam',
    canonical: `${SITE}/pt/`,
  },
]

for (const { path, lang, heading, canonical } of pages) {
  test.describe(`home ${path}`, () => {
    test('renders in its language with canonical and hreflang alternates', async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)

      const alternates = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((links) =>
          links.map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
        )
      expect(alternates).toEqual([
        ['en', `${SITE}/`],
        ['pt', `${SITE}/pt/`],
        ['x-default', `${SITE}/`],
      ])
    })

    test('ships no JavaScript', async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('script')).toHaveCount(0)
    })
  })
}

test('never redirects based on the browser language', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
  })
  try {
    const page = await context.newPage()
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  } finally {
    // Never leak this context into later tests, even when the test fails (issue #10).
    await context.close()
  }
})

test('language switcher links between locales', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Português' }).click()
  await expect(page).toHaveURL('/pt/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL('/')
})

test('sends security headers', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()
  const csp = headers['content-security-policy'] ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("'wasm-unsafe-eval'")
  expect(csp).not.toMatch(/'unsafe-eval'|'unsafe-inline'/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  // Cross-origin isolation must not be enabled globally (ADR 0011).
  expect(headers['cross-origin-embedder-policy']).toBeUndefined()
})

test('unknown pages return 404 and are not indexable', async ({ page, pageErrors }) => {
  const response = await page.goto('/does-not-exist/')
  expect(response?.status()).toBe(404)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  // The browser logs the 404 response itself as a console error.
  pageErrors.length = 0
})

// The pre-launch switch (ADR 0014) must cover pages, files and 404s alike, without displacing
// the security headers (Cloudflare does not merge two `_headers` rules with the same path).
test('follows the search indexing switch', async ({ request }) => {
  for (const path of ['/', '/pt/', '/sitemap-index.xml', '/does-not-exist/']) {
    const response = await request.get(path)
    expect(response.headers()['content-security-policy'], path).toContain("default-src 'self'")
    const robotsHeader = response.headers()['x-robots-tag']
    if (ALLOW_SEARCH_INDEXING) expect(robotsHeader, path).toBeUndefined()
    else expect(robotsHeader, path).toBe('noindex')
  }
  const robots = await (await request.get('/robots.txt')).text()
  if (ALLOW_SEARCH_INDEXING) {
    expect(robots).toContain('Allow: /')
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap-index.xml`)
  } else {
    expect(robots).toBe('User-agent: *\nDisallow: /\n')
  }
})
