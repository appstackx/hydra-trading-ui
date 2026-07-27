import { expect, test, type Locator, type Page } from '@playwright/test'
import { openWorkspace } from './fixtures'

test.describe('blotter', () => {
  test.beforeEach(async ({ page }) => {
    await openWorkspace(page)
  })

  const rows = (page: Page): Locator => page.getByTestId('blotter-table').locator('tbody tr')

  test('opens sorted newest first', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: /Time/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    )

    const times = await rows(page).locator('td').first().allTextContents()
    expect(times.length).toBeGreaterThan(0)
  })

  test('sorts by notional and reverses on a second click', async ({ page }) => {
    await page.getByTestId('blotter-sort-notional').click()
    await expect(page.getByRole('columnheader', { name: /Notional/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    )

    const descending = await rows(page).first().textContent()

    await page.getByTestId('blotter-sort-notional').click()
    await expect(page.getByRole('columnheader', { name: /Notional/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    )
    expect(await rows(page).first().textContent()).not.toBe(descending)
  })

  test('sorts alphabetically by pair', async ({ page }) => {
    await page.getByTestId('blotter-sort-symbol').click()
    await page.getByTestId('blotter-sort-symbol').click() // ascending

    const symbols = await rows(page).locator('td').nth(3).allTextContents()
    expect([...symbols].sort((a, b) => a.localeCompare(b))).toEqual(symbols)
  })

  test('filters to rejected trades', async ({ page }) => {
    await page.getByTestId('blotter-filter-Rejected').click()

    const statuses = await rows(page).evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-status'))
    )
    expect(statuses.length).toBeGreaterThan(0)
    expect(new Set(statuses)).toEqual(new Set(['Rejected']))
  })

  test('filters to completed trades', async ({ page }) => {
    await page.getByTestId('blotter-filter-Done').click()

    const statuses = await rows(page).evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-status'))
    )
    expect(new Set(statuses)).toEqual(new Set(['Done']))
  })

  test('searches across pair and trader', async ({ page }) => {
    await page.getByTestId('blotter-search').fill('usd')

    const symbols = await rows(page).locator('td').nth(3).allTextContents()
    expect(symbols.length).toBeGreaterThan(0)
    for (const symbol of symbols) {
      expect(symbol).toContain('USD')
    }
  })

  test('explains an empty result instead of showing a bare table', async ({ page }) => {
    await page.getByTestId('blotter-search').fill('nothing-matches-this')

    await expect(page.getByTestId('blotter-empty')).toBeVisible()
    await expect(page.getByTestId('blotter-table')).toBeHidden()
  })

  test('exports the visible rows as a parseable CSV', async ({ page }) => {
    await page.getByTestId('blotter-filter-Rejected').click()
    const visible = await rows(page).count()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('blotter-export').click(),
    ])

    expect(download.suggestedFilename()).toBe('blotter.csv')

    const stream = await download.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) chunks.push(new Uint8Array(Buffer.from(chunk as Buffer)))
    const csv = Buffer.concat(chunks).toString('utf8')

    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('Trade ID')
    expect(lines).toHaveLength(visible + 1)
    expect(csv).toContain('Rejected')
    expect(csv).not.toContain('undefined')
  })

  test('keeps the filter applied as new trades arrive', async ({ page }) => {
    await page.getByTestId('blotter-filter-Rejected').click()
    const before = await rows(page).count()

    // A ticket that will deal, so it must not appear under the Rejected filter.
    await page.getByTestId('buy-button').first().click()
    await expect(page.getByTestId('toast').first()).toBeVisible()

    await expect(rows(page)).toHaveCount(before)
  })
})
