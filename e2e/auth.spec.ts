import { expect, test } from '@playwright/test'
import { openWorkspace, signIn, tile, USERS } from './fixtures'

test.describe('sign-in and entitlements', () => {
  test('gates the workspace behind sign-in', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('sign-in')).toBeVisible()
    await expect(page.getByTestId('workspace')).toBeHidden()
  })

  test('shows each demo user with their permissions on the sign-in screen', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('A. Whitfield')).toBeVisible()
    await expect(page.getByText('D. Osei')).toBeVisible()
    await expect(page.getByText('M. Halvorsen')).toBeVisible()
    await expect(page.getByText(/View only/)).toBeVisible()
  })

  test('opens the workspace and names the signed-in user', async ({ page }) => {
    await openWorkspace(page)

    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.getByTestId('current-user')).toContainText('A. Whitfield')
  })

  test('refuses an empty passphrase', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('sign-in-passphrase').fill('')
    await page.getByTestId('sign-in-submit').click()

    await expect(page.getByTestId('sign-in-error')).toBeVisible()
    await expect(page.getByTestId('workspace')).toBeHidden()
  })

  test('keeps the session across a reload', async ({ page }) => {
    await openWorkspace(page)

    await page.reload()

    // A trader refreshes without thinking; being thrown out is unacceptable.
    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.getByTestId('sign-in')).toBeHidden()
  })

  test('tears the workspace down on sign-out', async ({ page }) => {
    await openWorkspace(page)

    await page.getByTestId('sign-out').click()

    await expect(page.getByTestId('sign-in')).toBeVisible()
    await expect(page.getByTestId('workspace')).toBeHidden()
  })

  test('does not restore the session after signing out', async ({ page }) => {
    await openWorkspace(page)
    await page.getByTestId('sign-out').click()
    await expect(page.getByTestId('sign-in')).toBeVisible()

    await page.reload()

    await expect(page.getByTestId('sign-in')).toBeVisible()
  })

  test.describe('as a read-only risk user', () => {
    test('streams prices but disables dealing, and says why', async ({ page }) => {
      await openWorkspace(page, { as: 'viewer' })

      const eurusd = tile(page, 'EURUSD')
      await expect(eurusd.getByTestId('buy-button')).toBeDisabled()
      await expect(eurusd.getByTestId('sell-button')).toBeDisabled()
      await expect(page.getByTestId('entitlement-block-EURUSD')).toContainText(/does not permit dealing/)

      // Read-only means no dealing, not no market data.
      await expect(eurusd.getByTestId('buy-button')).toHaveAttribute('data-rate', /\d/)
      await expect(page.getByTestId('live-rates-table')).toBeVisible()
    })

    test('disables the order ticket', async ({ page }) => {
      await openWorkspace(page, { as: 'viewer' })

      await expect(page.getByTestId('order-submit')).toBeDisabled()
      await expect(page.getByTestId('order-entitlement-block')).toContainText(/does not permit dealing/)
    })
  })

  test.describe('as a junior trader on a limited mandate', () => {
    test('deals inside the mandate', async ({ page }) => {
      await openWorkspace(page, { as: 'junior' })

      await tile(page, 'EURUSD').getByTestId('buy-button').click()

      await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()
    })

    test('is blocked the moment the size exceeds the mandate', async ({ page }) => {
      await openWorkspace(page, { as: 'junior' })

      const notional = page.getByTestId('notional-input-EURUSD')
      await notional.fill('5m')

      await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeDisabled()
      await expect(page.getByTestId('entitlement-block-EURUSD')).toContainText('2,000,000')
    })

    test('cannot see instruments outside the entitlement', async ({ page }) => {
      await openWorkspace(page, { as: 'junior' })

      // Entitled to EURUSD and GBPUSD, not to the yen crosses.
      await expect(page.getByTestId('tile-toggle-EURUSD')).toBeVisible()
      await expect(page.getByTestId('tile-toggle-USDJPY')).toHaveCount(0)
      await expect(page.getByTestId('rate-row-USDJPY')).toHaveCount(0)
      await expect(page.getByTestId('rate-row-EURUSD')).toBeVisible()
    })
  })

  test('gives the same workspace different permissions per user', async ({ page }) => {
    await openWorkspace(page, { as: 'senior' })
    await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeEnabled()

    await page.getByTestId('sign-out').click()
    await signIn(page, 'viewer')

    await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeDisabled()
  })

  test('exposes every demo user on the sign-in screen', async ({ page }) => {
    await page.goto('/')

    for (const id of Object.values(USERS)) {
      await expect(page.getByTestId(`sign-in-user-${id}`)).toHaveCount(1)
    }
  })
})
