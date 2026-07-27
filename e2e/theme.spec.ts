import { expect, test } from '@playwright/test'
import { openWorkspace, tile } from './fixtures'

test.describe('theming and white-labelling', () => {
  test('opens dark, as a trading floor expects', async ({ page }) => {
    await openWorkspace(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test.describe('on a machine set to light', () => {
    test.use({ colorScheme: 'light' })

    test('follows the operating system when the user has made no choice', async ({ page }) => {
      await openWorkspace(page)

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    })

    test('lets an explicit choice override the operating system', async ({ page }) => {
      await openWorkspace(page)
      await page.getByTestId('theme-toggle').click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

      await page.reload()

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    })
  })

  test('switches to light and back', async ({ page }) => {
    await openWorkspace(page)

    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('remembers the choice across a reload', async ({ page }) => {
    await openWorkspace(page)
    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('repaints the whole workspace, not just the chrome', async ({ page }) => {
    await openWorkspace(page)
    const panel = page.getByRole('region', { name: 'Blotter' })
    const darkBackground = await panel.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    )

    await page.getByTestId('theme-toggle').click()

    const lightBackground = await panel.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    )
    expect(lightBackground).not.toBe(darkBackground)
  })

  test('keeps prices readable in the light theme', async ({ page }) => {
    await openWorkspace(page)
    await page.getByTestId('theme-toggle').click()

    const eurusd = tile(page, 'EURUSD')
    await expect(eurusd.getByTestId('buy-button')).toBeVisible()
    await expect(eurusd.getByTestId('sell-button')).toBeVisible()
    await expect(page.getByTestId('blotter-table')).toBeVisible()
  })

  test('every colour resolves through a design token, so a licensee can re-skin it', async ({
    page,
  }) => {
    await openWorkspace(page)

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return [
        '--color-canvas',
        '--color-panel',
        '--color-ink',
        '--color-brand',
        '--color-buy',
        '--color-sell',
      ].map((name) => style.getPropertyValue(name).trim())
    })

    for (const value of tokens) {
      expect(value).not.toBe('')
    }
  })

  test('re-skins the accent at runtime by writing one custom property', async ({ page }) => {
    await openWorkspace(page)

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--color-brand', 'rgb(255, 0, 102)')
    })

    // The brand mark reads its background straight from the token.
    const mark = page.locator('header span').first()
    await expect(mark).toHaveCSS('background-color', 'rgb(255, 0, 102)')
  })
})
