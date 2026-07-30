import { expect, test } from '@playwright/test'
import { openWorkspace, signIn, tile } from './fixtures'

test.describe('kill switch', () => {
  test('risk user halts the desk; every dealable control explains itself', async ({ page }) => {
    await openWorkspace(page, { as: 'viewer' })

    await page.getByTestId('kill-switch-engage').click()

    const banner = page.getByTestId('risk-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('kill switch engaged by M. Halvorsen')

    await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeDisabled()
    await expect(page.getByTestId('order-submit')).toBeDisabled()
    await expect(page.getByTestId('entitlement-block-EURUSD')).toContainText('Dealing halted')
  })

  test('the halt survives a refresh', async ({ page }) => {
    await openWorkspace(page, { as: 'viewer' })
    await page.getByTestId('kill-switch-engage').click()
    await expect(page.getByTestId('risk-banner')).toBeVisible()

    await page.reload()

    await expect(page.getByTestId('risk-banner')).toBeVisible()
    await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeDisabled()
  })

  test('the halt binds other users, who cannot release it', async ({ page }) => {
    await openWorkspace(page, { as: 'viewer' })
    await page.getByTestId('kill-switch-engage').click()
    await expect(page.getByTestId('risk-banner')).toBeVisible()

    await page.getByTestId('sign-out').click()
    await signIn(page, 'junior')

    await expect(page.getByTestId('risk-banner')).toBeVisible()
    await expect(tile(page, 'EURUSD').getByTestId('buy-button')).toBeDisabled()
    await expect(page.getByTestId('risk-banner-release')).toHaveCount(0)
    await expect(page.getByTestId('kill-switch-engage')).toHaveCount(0)
  })

  test('release resumes dealing and both transitions are audited', async ({ page }) => {
    await openWorkspace(page, { as: 'viewer' })
    await page.getByTestId('kill-switch-engage').click()

    await page.getByTestId('risk-banner-release').click()
    await expect(page.getByTestId('risk-banner')).toBeHidden()

    // Read-only user: dealing controls stay disabled, but for the entitlement
    // reason, not the halt.
    await expect(page.getByTestId('entitlement-block-EURUSD')).toContainText(
      /does not permit dealing/
    )

    await page.getByTestId('audit-open').click()
    await page.getByTestId('audit-filter-risk').click()
    await expect(
      page.locator('[data-testid^="audit-event-"][data-type="risk.kill-switch-engaged"]')
    ).toHaveCount(1)
    await expect(
      page.locator('[data-testid^="audit-event-"][data-type="risk.kill-switch-released"]')
    ).toHaveCount(1)
  })

  test('?fresh=1 resets the demo but does not release the switch', async ({ page }) => {
    await openWorkspace(page, { as: 'viewer' })
    await page.getByTestId('kill-switch-engage').click()
    await expect(page.getByTestId('risk-banner')).toBeVisible()

    await openWorkspace(page, { params: { fresh: '1' }, as: 'viewer' })

    // The session reset; the halt did not. A URL parameter is not a release.
    await expect(page.getByTestId('risk-banner')).toBeVisible()
    await page.getByTestId('risk-banner-release').click()
    await expect(page.getByTestId('risk-banner')).toBeHidden()
  })

  test('junior sees no halt control at all', async ({ page }) => {
    await openWorkspace(page, { as: 'junior' })

    await expect(page.getByTestId('kill-switch-engage')).toHaveCount(0)
  })
})

test.describe('audit trail', () => {
  test('a dealt ticket appears with the quote that was on screen', async ({ page }) => {
    await openWorkspace(page)

    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()

    await page.getByTestId('audit-open').click()

    const drawer = page.getByTestId('audit-drawer')
    await expect(drawer).toBeVisible()
    await expect(
      drawer.locator('[data-type="trade.submitted"]').first()
    ).toContainText(/Buy 1m EURUSD at \d/)
    await expect(
      drawer.locator('[data-type="trade.executed"], [data-type="trade.rejected"]').first()
    ).toBeVisible()
    await expect(drawer.locator('[data-type="session.signed-in"]').first()).toContainText(
      'A. Whitfield signed in'
    )
  })

  test('exports the trail as CSV', async ({ page }) => {
    await openWorkspace(page)
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(page.getByTestId('toast').first()).toBeVisible()

    await page.getByTestId('audit-open').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('audit-export').click(),
    ])

    expect(download.suggestedFilename()).toBe('audit-trail.csv')
    const stream = await download.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) chunks.push(new Uint8Array(Buffer.from(chunk as Buffer)))
    const csv = Buffer.concat(chunks).toString('utf8')

    expect(csv.split('\n')[0]).toContain('Summary')
    expect(csv).toContain('trade.submitted')
    expect(csv).toContain('shownBid')
  })

  test('the trail survives a refresh', async ({ page }) => {
    await openWorkspace(page)
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(page.getByTestId('toast').first()).toBeVisible()

    await page.reload()
    await page.getByTestId('audit-open').click()

    await expect(
      page.getByTestId('audit-drawer').locator('[data-type="trade.submitted"]').first()
    ).toBeVisible()
  })
})

test.describe('session persistence', () => {
  test('a dealt trade is still in the blotter after a refresh', async ({ page }) => {
    await openWorkspace(page)
    const rows = page.getByTestId('blotter-table').locator('tbody tr')
    const before = await rows.count()

    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(tile(page, 'EURUSD').getByTestId('tile-overlay-EURUSD')).toBeVisible()
    await expect(rows).toHaveCount(before + 1)
    const newestId = await rows.first().locator('td').nth(1).textContent()

    // No settling sleep needed: navigation fires pagehide, which flushes the
    // pending write synchronously. The reload IS the test of that flush.
    await page.reload()

    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before + 1)
    if (newestId) {
      await expect(
        page.getByTestId('blotter-table').locator('tbody tr').first()
      ).toContainText(newestId)
    }
  })

  test('a resting order survives a refresh and keeps working', async ({ page }) => {
    await openWorkspace(page)
    const away = (
      Number(
        await tile(page, 'EURUSD').getByTestId('buy-button').getAttribute('data-rate')
      ) - 0.02
    ).toFixed(5)
    await page.getByTestId('order-limit').fill(away)
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('order-row-ORD-000001')).toHaveAttribute(
      'data-status',
      'Working'
    )

    await page.reload()

    const restored = page.getByTestId('order-row-ORD-000001')
    await expect(restored).toBeVisible()
    await expect(restored).toHaveAttribute('data-status', 'Working')
    await expect(page.getByTestId('working-count')).toContainText('1 working')
  })

  test('a junior cannot cancel the senior trader’s restored order', async ({ page }) => {
    await openWorkspace(page)
    const away = (
      Number(
        await tile(page, 'EURUSD').getByTestId('buy-button').getAttribute('data-rate')
      ) - 0.02
    ).toFixed(5)
    await page.getByTestId('order-limit').fill(away)
    await page.getByTestId('order-submit').click()
    await expect(page.getByTestId('order-row-ORD-000001')).toBeVisible()

    // A real reload, so the junior is looking at the *restored* order — the
    // persistence path, not the in-memory one.
    await page.reload()
    await page.getByTestId('sign-out').click()
    await signIn(page, 'junior')

    const row = page.getByTestId('order-row-ORD-000001')
    await expect(row).toBeVisible()
    await expect(page.getByTestId('order-owner-ORD-000001')).toHaveText('A. Whitfield')
    await expect(page.getByTestId('order-cancel-ORD-000001')).toHaveCount(0)
  })

  test('fresh=1 discards the persisted session', async ({ page }) => {
    await openWorkspace(page)
    const before = await page.getByTestId('blotter-table').locator('tbody tr').count()
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before + 1)

    await openWorkspace(page, { params: { fresh: '1' } })

    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before)
  })

  test('clear-session control resets the demo', async ({ page }) => {
    await openWorkspace(page)
    const before = await page.getByTestId('blotter-table').locator('tbody tr').count()
    await tile(page, 'EURUSD').getByTestId('buy-button').click()
    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before + 1)

    // Clicked inside the debounce window on purpose: the reset must discard
    // the pending write, or its own reload's pagehide flush would resurrect
    // the session it just cleared.
    await page.getByTestId('audit-open').click()
    await page.getByTestId('audit-clear-session').click()

    // The reset reloads; the seeded session comes back without the dealt trade.
    await signIn(page)
    await expect(page.getByTestId('blotter-table').locator('tbody tr')).toHaveCount(before)
  })
})
