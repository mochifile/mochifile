import { defineConfig, devices } from '@playwright/test'

const PORT = 4321
const CI = Boolean(process.env.CI)

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
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
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
