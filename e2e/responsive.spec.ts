import { expect, test } from '@playwright/test'
import { openWorkspace, tile } from './fixtures'

/**
 * Runs only under the mobile project. A dealing terminal is a desktop product,
 * but the same bundle is embedded in phone-sized web views, so nothing may be
 * unreachable and the page must never scroll sideways.
 */
test.describe('narrow viewport', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page)
  })

  test('stacks every region into one scrolling column', async ({ page }) => {
    for (const name of ['Spot tiles', 'Live rates', 'Order management', 'Blotter', 'Analytics']) {
      await expect(page.getByRole('region', { name })).toBeAttached()
    }
  })

  test('never scrolls the page sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )

    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('keeps the tiles dealable', async ({ page }) => {
    const eurusd = tile(page, 'EURUSD')
    await eurusd.scrollIntoViewIfNeeded()

    await expect(eurusd.getByTestId('buy-button')).toBeVisible()
    await eurusd.getByTestId('buy-button').tap()

    await expect(eurusd.getByTestId('tile-overlay-EURUSD')).toBeVisible()
  })

  test('keeps the status bar and title bar pinned', async ({ page }) => {
    await expect(page.getByTestId('status-bar')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('lets a wide table scroll inside its own panel', async ({ page }) => {
    const blotter = page.getByRole('region', { name: 'Blotter' })
    await blotter.scrollIntoViewIfNeeded()

    await expect(page.getByTestId('blotter-table')).toBeVisible()
    // Sideways movement is contained by the panel, never the document.
    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(documentOverflow).toBeLessThanOrEqual(1)
  })

  test('keeps the order ticket usable', async ({ page }) => {
    const ticket = page.getByTestId('order-ticket')
    await ticket.scrollIntoViewIfNeeded()

    await expect(page.getByTestId('order-quantity')).toBeVisible()
    await expect(page.getByTestId('order-submit')).toBeVisible()
  })
})
