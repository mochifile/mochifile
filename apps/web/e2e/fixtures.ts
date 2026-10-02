import { test as base, expect } from '@playwright/test'

/**
 * Fails any test whose page logs an error or violates the Content-Security-Policy.
 * CSP violations are captured in the page via `securitypolicyviolation`, which every engine
 * supports, instead of relying on engine-specific console messages.
 */
export const test = base.extend<{ pageErrors: string[] }>({
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
