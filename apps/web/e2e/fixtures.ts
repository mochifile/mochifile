import { type Browser, type BrowserContextOptions, test as base, expect } from '@playwright/test'

/** The project's context options (base URL and device), for contexts created by hand. */
export function projectContextOptions(): BrowserContextOptions {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    base.info().project.use
  const options = { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as BrowserContextOptions
}

export const test = base.extend<{ pageErrors: string[]; testBrowser: Browser }>({
  /**
   * The browser a test should use. In Firefox, a freshly launched one per test, closed
   * afterwards: in CI, a Firefox instance that had already hosted many tests made about 7–17%
   * of later navigations hang (on any page, waiting for load or domcontentloaded), while
   * freshly launched ones never did (issue #10). Other engines share one browser per worker.
   */
  testBrowser: async ({ browser, browserName, playwright }, use) => {
    if (browserName !== 'firefox') {
      await use(browser)
      return
    }
    const fresh = await playwright.firefox.launch()
    try {
      await use(fresh)
    } finally {
      await fresh.close()
    }
  },

  /** Every test's context (and so `page`) comes from `testBrowser`, with the project's device. */
  context: async ({ testBrowser }, use) => {
    const context = await testBrowser.newContext(projectContextOptions())
    try {
      await use(context)
    } finally {
      await context.close()
    }
  },

  /**
   * Fails any test whose page logs an error or violates the Content-Security-Policy.
   * CSP violations are captured in the page via `securitypolicyviolation`, which every engine
   * supports, instead of relying on engine-specific console messages.
   */
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })
      await page.exposeFunction('__reportCspViolation', (detail: string) =>
        errors.push(`csp: ${detail}`),
      )
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as { __reportCspViolation: (d: string) => void })
            .__reportCspViolation
          report(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`)
        })
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
