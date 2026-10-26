import { defineConfig, devices } from '@playwright/test'

// Not 4321, so a running `astro dev` is never mistaken for the e2e server.
const PORT = 4329
const CI = Boolean(process.env.CI)

/**
 * Every page is served with `Cross-Origin-Opener-Policy: same-origin-allow-popups`. With it,
 * Firefox sometimes (5–34% of navigations on GitHub's runners) loads a page completely but
 * never tells Playwright: `page.goto` waits until its timeout, with `readyState` already
 * `complete` and no request pending (issue #10; upstream, microsoft/playwright#42731 reports it
 * for COOP). Turning off Firefox's handling of the header in the test browser gave 0 hangs in
 * 400 navigations, as did serving without the header, against 36 in 200 with it. The server
 * still sends the header (home.spec.ts checks it) and Chromium and WebKit still apply it.
 */
const firefoxUserPrefs = { 'browser.tabs.remote.useCrossOriginOpenerPolicy': false }

/**
 * Smoke tests run against a production build served with the real `_headers`, in all three
 * engines. The e2e build also includes the `_template` tool so the full tool pipeline
 * (island → Web Worker → result) and the CSP are exercised.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  ...(CI ? { workers: 1 } : {}),
  // `list` as well, so the job log shows each test and its time while it runs; `github` alone
  // prints nothing until the end, so a job that hits its timeout left no clue where it was.
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // A page here loads in about 100 ms. Without this a navigation may wait for the whole test
    // timeout (up to 120 s in the tests that visit many pages), so a stuck one is cheap to retry.
    navigationTimeout: 15_000,
    // Keep the trace of a failed first attempt even when a retry passes, so flaky tests can be
    // diagnosed (issue #10).
    trace: 'retain-on-first-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs } },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `astro build --outDir dist-e2e && node e2e/serve.ts dist-e2e ${PORT}`,
    env: { MOCHIFILE_INCLUDE_TEMPLATE: 'true' },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
