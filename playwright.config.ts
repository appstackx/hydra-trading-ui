import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    timezoneId: 'UTC',
    /*
     * The app honours `prefers-color-scheme` when the user has not chosen a
     * theme. Headless Chromium reports light, so the OS preference is pinned
     * here rather than left to the runner's default; `theme.spec.ts` overrides
     * it to cover the other branch.
     */
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
      testIgnore: /(responsive|screenshots)\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
