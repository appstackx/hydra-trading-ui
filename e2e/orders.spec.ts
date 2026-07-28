import { expect, test, type Page } from '@playwright/test'
import { openWorkspace } from './fixtures'

/**
 * Reads the tile's touch price and offsets it, so a test can place a limit that
 * is guaranteed to be either marketable or away regardless of where the seeded
 * random walk happens to be.
 */
async function limitRelativeToMarket(page: Page, offset: number): Promise<string> {
  const rate = await page
    .getByTestId('spot-tile-EURUSD')
    .getByTestId('buy-button')
    .getAttribute('data-rate')
  return (Number(rate) + offset).toFixed(5)
}

test.describe('order management', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page)
  })

  test('rests a limit order away from the market', async ({ page }) => {
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))
    await page.getByTestId('order-submit').click()

    const row = page.getByTestId('order-row-ORD-000001')
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-status', 'Working')
    await expect(row).toContainText('EURUSD')
    await expect(row).toContainText('Limit')
    await expect(row).toContainText('GTC')
    await expect(page.getByTestId('working-count')).toContainText('1 working')
  })

  test('confirms a working order with a notification', async ({ page }) => {
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))
    await page.getByTestId('order-submit').click()

    await expect(page.getByTestId('toast').first()).toContainText('Buy 1m EURUSD working')
  })

  test('fills a marketable limit and prints the fill to the blotter', async ({ page }) => {
    const before = await page.getByTestId('blotter-table').locator('tbody tr').count()

    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, 0.02))
    await page.getByTestId('order-submit').click()

    const row = page.getByTestId('order-row-ORD-000001')
    await expect(row).toHaveAttribute('data-status', 'Filled', { timeout: 10_000 })
    await expect(row).toContainText('1m filled @')

    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before + 1)
    await expect(page.getByTestId('blotter-table').locator('tbody tr').first()).toContainText(
      /FIL-\d{6}/
    )
  })

  test('works a large order in clips, showing partial fills', async ({ page }) => {
    await page.getByTestId('order-quantity').fill('9m')
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, 0.02))
    await page.getByTestId('order-submit').click()

    const row = page.getByTestId('order-row-ORD-000001')
    await expect(row).toHaveAttribute('data-status', 'Filled', { timeout: 15_000 })
    await expect(row).toContainText('9m filled @')
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  /*
   * The market moves between the click and the read, so this asserts proximity
   * rather than equality — five pips is an order of magnitude more than a single
   * tick can move. Exact side-correctness against a frozen market is covered by
   * the unit test in `OrderTicket.test.tsx`.
   */
  test('prefills the limit from the touch price on the side being traded', async ({ page }) => {
    const touch = async (side: 'buy' | 'sell'): Promise<number> =>
      Number(
        await page
          .getByTestId('spot-tile-EURUSD')
          .getByTestId(`${side}-button`)
          .getAttribute('data-rate')
      )

    await page.getByTestId('order-use-touch').click()
    const buyFill = Number(await page.getByTestId('order-limit').inputValue())
    expect(await page.getByTestId('order-limit').inputValue()).toMatch(/^\d+\.\d{5}$/)
    expect(Math.abs(buyFill - (await touch('buy')))).toBeLessThan(0.0005)

    await page.getByTestId('order-side-Sell').click()
    await page.getByTestId('order-use-touch').click()
    const sellFill = Number(await page.getByTestId('order-limit').inputValue())
    expect(Math.abs(sellFill - (await touch('sell')))).toBeLessThan(0.0005)
  })

  test('submits a market order without asking for a price', async ({ page }) => {
    await page.getByTestId('order-type-Market').click()
    await expect(page.getByTestId('order-limit')).toBeHidden()

    await page.getByTestId('order-submit').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toHaveAttribute(
      'data-status',
      'Filled',
      { timeout: 10_000 }
    )
  })

  test('cancels an immediate-or-cancel order that cannot trade', async ({ page }) => {
    await page.getByTestId('order-tif-IOC').click()
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))
    await page.getByTestId('order-submit').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toHaveAttribute(
      'data-status',
      'Cancelled',
      { timeout: 10_000 }
    )
  })

  test('cancels a resting order on request', async ({ page }) => {
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('order-row-ORD-000001')).toBeVisible()

    await page.getByTestId('order-cancel-ORD-000001').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toHaveAttribute(
      'data-status',
      'Cancelled'
    )
    await expect(page.getByTestId('working-count')).toContainText('0 working')
  })

  test('hides completed orders on request', async ({ page }) => {
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))
    await page.getByTestId('order-submit').click()
    await page.getByTestId('order-cancel-ORD-000001').click()

    await page.getByTestId('order-book-toggle-completed').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toBeHidden()
    await expect(page.getByTestId('order-book-empty')).toBeVisible()
  })

  test('refuses a limit order with no price and says why', async ({ page }) => {
    await page.getByTestId('order-submit').click()

    await expect(page.getByText('Limit orders need a price')).toBeVisible()
    await expect(page.getByTestId('order-limit')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('order-book-empty')).toBeVisible()
  })

  test('refuses a quantity above the trader mandate', async ({ page }) => {
    await page.getByTestId('order-quantity').fill('500m')
    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, -0.02))

    // Limits are layered — mandate, venue credit line, ticket cap — and the
    // tightest applicable one is what the user is told about.
    await expect(page.getByTestId('order-entitlement-block')).toContainText(/exceeds/i)
    await expect(page.getByTestId('order-submit')).toBeDisabled()
    await expect(page.getByTestId('order-book-empty')).toBeVisible()
  })

  test('changes the ticket to a sell', async ({ page }) => {
    await page.getByTestId('order-side-Sell').click()
    await expect(page.getByTestId('order-submit')).toContainText('Sell')

    await page.getByTestId('order-limit').fill(await limitRelativeToMarket(page, 0.02))
    await page.getByTestId('order-submit').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toContainText('Sell')
  })

  test('places an order in a pair other than the default', async ({ page }) => {
    await page.getByLabel('Pair').selectOption('USDJPY')
    await page.getByTestId('order-type-Market').click()
    await page.getByTestId('order-submit').click()

    await expect(page.getByTestId('order-row-ORD-000001')).toContainText('USDJPY')
  })
})
