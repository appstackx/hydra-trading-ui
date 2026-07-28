import { expect, test, type Page } from '@playwright/test'
import { openWorkspace } from './fixtures'

/**
 * Exercises the live-feed mode against a real venue.
 *
 * Tagged so it can be excluded from a hermetic run: it depends on a third-party
 * WebSocket being reachable, which is not something CI should be gated on. Run
 * it deliberately with `npm run test:e2e:live`.
 */
const LIVE_ENABLED = process.env.E2E_LIVE === '1'

const openLive = (page: Page, venue = 'coinbase') =>
  openWorkspace(page, { params: { feed: 'live', venue } })

test.describe('live venue feed', () => {
  test.skip(!LIVE_ENABLED, 'set E2E_LIVE=1 to run against a real venue')
  test.describe.configure({ timeout: 90_000 })

  test('connects to the venue and labels the session as live', async ({ page }) => {
    await openLive(page)

    await expect(page.getByTestId('feed-mode')).toHaveAttribute('data-feed', 'live')
    await expect(page.getByTestId('connection-status')).toContainText('coinbase-exchange')
  })

  test('quotes real crypto instruments', async ({ page }) => {
    await openLive(page)

    await expect(page.getByTestId('spot-tile-BTCUSD')).toBeVisible()
    await expect(page.getByTestId('rate-row-ETHUSD')).toBeVisible()
    // FX instruments are not on a crypto venue.
    await expect(page.getByTestId('rate-row-EURUSD')).toHaveCount(0)
  })

  test('receives a genuine market price', async ({ page }) => {
    await openLive(page)

    const buy = page.getByTestId('spot-tile-BTCUSD').getByTestId('buy-button')
    await expect(buy).toHaveAttribute('data-rate', /\d+\.\d+/, { timeout: 45_000 })

    const rate = Number(await buy.getAttribute('data-rate'))
    // A very wide sanity band: this asserts "a real number from a real venue",
    // not a price level, which would make the test a market-timing bet.
    expect(rate).toBeGreaterThan(1_000)
    expect(rate).toBeLessThan(10_000_000)
  })

  test('never crosses the spread', async ({ page }) => {
    await openLive(page)
    const tile = page.getByTestId('spot-tile-BTCUSD')
    await expect(tile.getByTestId('buy-button')).toHaveAttribute('data-rate', /\d/, {
      timeout: 45_000,
    })

    const ask = Number(await tile.getByTestId('buy-button').getAttribute('data-rate'))
    const bid = Number(await tile.getByTestId('sell-button').getAttribute('data-rate'))

    expect(ask).toBeGreaterThanOrEqual(bid)
  })

  test('still simulates execution — no order leaves the browser', async ({ page }) => {
    await openLive(page)
    await expect(
      page.getByTestId('spot-tile-BTCUSD').getByTestId('buy-button')
    ).toHaveAttribute('data-rate', /\d/, { timeout: 45_000 })

    await page.getByTestId('spot-tile-BTCUSD').getByTestId('buy-button').click()

    // The ticket completes locally and lands in the blotter.
    await expect(page.getByTestId('tile-overlay-BTCUSD')).toBeVisible()
    await expect(page.getByTestId('blotter-table').locator('tbody tr').first()).toContainText(
      'BTCUSD'
    )
    // And the status bar is explicit that execution is not real.
    await expect(page.getByTestId('feed-mode')).toContainText(/sim execution/i)
  })

  test('works against the alternative venue too', async ({ page }) => {
    await openLive(page, 'binance')

    await expect(page.getByTestId('connection-status')).toContainText('binance-spot')
    await expect(
      page.getByTestId('spot-tile-BTCUSD').getByTestId('buy-button')
    ).toHaveAttribute('data-rate', /\d+\.\d+/, { timeout: 45_000 })
  })
})

test.describe('demo feed labelling', () => {
  test('states plainly that the default session is simulated', async ({ page }) => {
    await openWorkspace(page)

    await expect(page.getByTestId('feed-mode')).toHaveAttribute('data-feed', 'demo')
    await expect(page.getByTestId('feed-mode')).toContainText(/demo/i)
  })
})
