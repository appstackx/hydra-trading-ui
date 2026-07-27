import { expect, test } from '@playwright/test'
import { openWorkspace, REJECTING_NOTIONAL, setNotional, tile } from './fixtures'

test.describe('dealing on a spot tile', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page)
  })

  test('deals a buy and confirms it on the tile', async ({ page }) => {
    const eurusd = tile(page, 'EURUSD')

    await eurusd.getByTestId('buy-button').click()

    const overlay = eurusd.getByTestId('tile-overlay-EURUSD')
    await expect(overlay).toBeVisible()
    await expect(overlay).toHaveAttribute('data-state', 'done')
    await expect(overlay).toContainText('Bought 1m EURUSD')
    await expect(overlay).toContainText(/TRD-\d{6}/)
  })

  test('deals a sell', async ({ page }) => {
    const gbpusd = tile(page, 'GBPUSD')

    await gbpusd.getByTestId('sell-button').click()

    await expect(gbpusd.getByTestId('tile-overlay-GBPUSD')).toContainText('Sold 1m GBPUSD')
  })

  test('raises a notification carrying the trade id and rate', async ({ page }) => {
    await tile(page, 'EURUSD').getByTestId('buy-button').click()

    const toast = page.getByTestId('toast').first()
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('data-tone', 'success')
    await expect(toast).toContainText(/TRD-\d{6}/)
  })

  test('dismisses a notification on request', async ({ page }) => {
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(page.getByTestId('toast')).toBeVisible()

    await page.getByRole('button', { name: 'Dismiss notification' }).first().click()

    await expect(page.getByTestId('toast')).toBeHidden()
  })

  test('writes the trade to the top of the blotter', async ({ page }) => {
    const before = await page.getByTestId('blotter-table').locator('tbody tr').count()

    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()

    const rows = page.getByTestId('blotter-table').locator('tbody tr')
    await expect(rows).toHaveCount(before + 1)

    const newest = rows.first()
    await expect(newest).toContainText('EURUSD')
    await expect(newest).toContainText('Buy')
    await expect(newest).toContainText('1m')
    await expect(newest).toHaveAttribute('data-status', 'Done')
  })

  test('deals the size that was typed, in desk shorthand', async ({ page }) => {
    await setNotional(page, 'EURUSD', '2.5m')

    await tile(page, 'EURUSD').getByTestId('buy-button').click()

    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toContainText(
      'Bought 2.5m EURUSD'
    )
    await expect(page.getByTestId('blotter-table').locator('tbody tr').first()).toContainText(
      '2.5m'
    )
  })

  test('accepts a size given in thousands', async ({ page }) => {
    await setNotional(page, 'EURUSD', '750k')

    await tile(page, 'EURUSD').getByTestId('buy-button').click()

    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toContainText('750k')
  })

  test('refuses to deal on a size it cannot read', async ({ page }) => {
    await setNotional(page, 'EURUSD', 'abc')

    const eurusd = tile(page, 'EURUSD')
    await expect(eurusd.getByTestId('buy-button')).toBeDisabled()
    await expect(eurusd.getByTestId('sell-button')).toBeDisabled()
    await expect(page.getByTestId('notional-input-EURUSD')).toHaveAttribute('aria-invalid', 'true')
  })

  test('shows the venue rejection and keeps the attempt in the blotter', async ({ page }) => {
    await setNotional(page, 'EURUSD', REJECTING_NOTIONAL)

    await tile(page, 'EURUSD').getByTestId('buy-button').click()

    const overlay = tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')
    await expect(overlay).toHaveAttribute('data-state', 'rejected')
    await expect(overlay).toContainText('credit line')

    await expect(page.getByTestId('toast').first()).toHaveAttribute('data-tone', 'error')

    // A rejected ticket is still part of the audit trail.
    await page.getByTestId('blotter-filter-Rejected').click()
    await expect(page.getByTestId('blotter-table').locator('tbody tr').first()).toHaveAttribute(
      'data-status',
      'Rejected'
    )
  })

  test('returns the tile to trading after showing the result', async ({ page }) => {
    const eurusd = tile(page, 'EURUSD')
    await eurusd.getByTestId('buy-button').click()
    await expect(eurusd.getByTestId('tile-overlay-EURUSD')).toBeVisible()

    await expect(eurusd.getByTestId('tile-overlay-EURUSD')).toBeHidden({ timeout: 10_000 })
    await expect(eurusd.getByTestId('buy-button')).toBeEnabled()
  })

  test('moves the position book when a trade deals', async ({ page }) => {
    // NZDUSD is not on the desk at start-up, so the tile has to be opened first.
    await page.getByTestId('tile-toggle-NZDUSD').click()
    await expect(tile(page, 'NZDUSD')).toBeVisible()

    // Exposure is derived from net quantity and average rate, so it only moves
    // when a trade lands — unlike P&L, which the live mark changes every tick.
    const nzd = page.getByTestId('exposure-NZD')
    const before = (await nzd.count()) > 0 ? await nzd.textContent() : ''

    await setNotional(page, 'NZDUSD', '5m')
    await tile(page, 'NZDUSD').getByTestId('buy-button').click()
    await expect(tile(page, 'NZDUSD').getByTestId('tile-overlay-NZDUSD')).toHaveAttribute(
      'data-state',
      'done'
    )

    await expect(nzd).toBeVisible()
    await expect(nzd).not.toHaveText(before ?? '')
  })

  test('deals several tickets in a row without losing one', async ({ page }) => {
    const before = await page.getByTestId('blotter-table').locator('tbody tr').count()

    for (const symbol of ['EURUSD', 'GBPUSD', 'USDJPY']) {
      await tile(page, symbol).getByTestId('buy-button').click()
      await expect(tile(page, symbol).getByTestId(`tile-overlay-${symbol}`)).toBeVisible()
    }

    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before + 3)
  })

  test('is operable from the keyboard alone', async ({ page }) => {
    const buy = tile(page, 'EURUSD').getByTestId('buy-button')

    await buy.focus()
    await expect(buy).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()
  })
})
