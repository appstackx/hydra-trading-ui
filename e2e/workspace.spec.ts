import { expect, test } from '@playwright/test'
import { openWorkspace, tile } from './fixtures'

test.describe('workspace', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page)
  })

  test('lays out every region of the terminal', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Spot tiles' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Live rates' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Order management' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Blotter' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Analytics' })).toBeVisible()
  })

  test('brands the title bar and the document title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hydra Terminal')
    await expect(page).toHaveTitle(/Hydra Terminal/)
    await expect(page.getByRole('link', { name: /Appstackx/ })).toHaveAttribute(
      'href',
      'https://appstackx.co.uk'
    )
  })

  test('reports a healthy pricing connection with a latency reading', async ({ page }) => {
    await expect(page.getByTestId('connection-status')).toContainText('hydra-pricing')
    await expect(page.getByTestId('latency')).toContainText(/\d+ ms/)
  })

  test('opens the default set of dealable tiles', async ({ page }) => {
    for (const symbol of ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD']) {
      await expect(tile(page, symbol)).toBeVisible()
    }
  })

  test('streams live prices into the tiles', async ({ page }) => {
    const buy = tile(page, 'EURUSD').getByTestId('buy-button')
    const first = await buy.getAttribute('data-rate')

    await expect(async () => {
      expect(await buy.getAttribute('data-rate')).not.toBe(first)
    }).toPass({ timeout: 10_000 })
  })

  test('quotes a buy above the matching sell, so the spread is never crossed', async ({ page }) => {
    const eurusd = tile(page, 'EURUSD')
    const ask = Number(await eurusd.getByTestId('buy-button').getAttribute('data-rate'))
    const bid = Number(await eurusd.getByTestId('sell-button').getAttribute('data-rate'))

    expect(ask).toBeGreaterThan(bid)
  })

  test('quotes every instrument in the live rates grid', async ({ page }) => {
    const rows = page.getByTestId('live-rates-table').locator('tbody tr')

    await expect(rows).toHaveCount(10)
    await expect(page.getByTestId('rate-row-EURUSD')).toContainText(/1\.\d{4}/)
    // A yen cross must print three decimals, not five.
    await expect(page.getByTestId('rate-row-USDJPY')).toContainText(/\d{3}\.\d{3}/)
  })

  test('opens the blotter seeded with a session of history', async ({ page }) => {
    await expect(page.getByTestId('blotter-table').locator('tbody tr').first()).toBeVisible()
    await expect(page.getByTestId('trade-count')).toContainText(/\d+ trades/)
  })

  test('marks the seeded book and plots its P&L', async ({ page }) => {
    await expect(page.getByTestId('stat-total-pnl')).toContainText(/[+-]?[\d,.]+k?/)
    await expect(page.getByTestId('exposure-list')).toBeVisible()
    // The chart needs a few samples before it can draw a line.
    await expect(page.getByTestId('pnl-chart')).toBeVisible({ timeout: 15_000 })
  })

  test('closes and reopens a tile from the instrument chips', async ({ page }) => {
    await expect(tile(page, 'EURUSD')).toBeVisible()

    await page.getByTestId('tile-toggle-EURUSD').click()
    await expect(tile(page, 'EURUSD')).toBeHidden()

    await page.getByTestId('tile-toggle-EURUSD').click()
    await expect(tile(page, 'EURUSD')).toBeVisible()
  })

  test('opens an instrument that was not on the desk at start-up', async ({ page }) => {
    await expect(tile(page, 'GBPJPY')).toBeHidden()

    await page.getByTestId('tile-toggle-GBPJPY').click()

    await expect(tile(page, 'GBPJPY')).toBeVisible()
    await expect(tile(page, 'GBPJPY').getByTestId('buy-button')).toBeEnabled()
  })

  /*
   * Determinism is a property of the generated *session*, not of whichever tick
   * happens to be on screen when an assertion runs — a live walk is sampled at
   * wall-clock time and would differ between browsers. The seeded blotter is
   * produced once at start-up, so its rates are the stable thing to compare.
   */
  test('generates the same session twice for the same seed', async ({ page }) => {
    const blotterRates = async (seed: number): Promise<string[]> => {
      await openWorkspace(page, seed)
      return page
        .locator('[data-testid="blotter-table"] tbody tr td:nth-child(7)')
        .allTextContents()
    }

    const first = await blotterRates(4242)
    const second = await blotterRates(4242)

    expect(first.length).toBeGreaterThan(0)
    expect(first).toEqual(second)
  })

  test('generates a different session for a different seed', async ({ page }) => {
    const blotterRates = async (seed: number): Promise<string[]> => {
      await openWorkspace(page, seed)
      return page
        .locator('[data-testid="blotter-table"] tbody tr td:nth-child(7)')
        .allTextContents()
    }

    expect(await blotterRates(4242)).not.toEqual(await blotterRates(777))
  })

  test('logs no console errors during a normal session', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await openWorkspace(page)
    await page.waitForTimeout(3_000)

    expect(errors).toEqual([])
  })
})
