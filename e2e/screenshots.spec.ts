import { expect, test } from '@playwright/test'
import { openWorkspace, tile } from './fixtures'

/**
 * Regenerates the images used in the README.
 *
 * Skipped by default so an ordinary test run never rewrites files in the repo.
 * Run it deliberately with `npm run screenshots`.
 */
const CAPTURING = process.env.CAPTURE_SCREENSHOTS === '1'

test.describe('documentation screenshots', () => {
  test.skip(!CAPTURING, 'set CAPTURE_SCREENSHOTS=1 to regenerate')
  test.use({ viewport: { width: 1680, height: 960 } })

  /** Long enough for the sparklines and the P&L chart to have a shape. */
  const SETTLE_MS = 20_000

  test('dark and light workspace', async ({ page }) => {
    await openWorkspace(page, 4242)

    // A dealt trade and a resting order make the screenshot show the product
    // doing something, rather than sitting idle.
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()
    await page.getByTestId('order-quantity').fill('2.5m')
    await page.getByTestId('order-limit').fill('1.05000')
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('order-row-ORD-000001')).toBeVisible()

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('pnl-chart')).toBeVisible()

    await page.screenshot({ path: 'docs/screenshot-dark.png' })

    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.screenshot({ path: 'docs/screenshot-light.png' })
  })

  test('narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    await openWorkspace(page, 4242)
    await page.waitForTimeout(SETTLE_MS)

    await page.screenshot({ path: 'docs/screenshot-mobile.png' })
  })
})
