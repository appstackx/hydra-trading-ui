import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Pinning the seed makes the demo feed reproducible: the same opening rates, the
 * same seeded blotter and the same sequence of venue rejections on every run.
 */
export const SEED = 20260727

export async function openWorkspace(page: Page, seed = SEED): Promise<void> {
  await page.goto(`/?seed=${String(seed)}`)
  // The status bar reaching "Live" is the app's own signal that the pricing
  // stream is connected — a far better ready check than an arbitrary wait.
  await expect(page.getByTestId('connection-status')).toContainText(/Live|Degraded/, {
    timeout: 15_000,
  })
}

export function tile(page: Page, symbol: string): Locator {
  return page.getByTestId(`spot-tile-${symbol}`)
}

/**
 * Notional that always breaches the demo credit line, giving a deterministic
 * rejection to assert on instead of waiting for a random one.
 */
export const REJECTING_NOTIONAL = '60m'

/** Sets a tile's notional, replacing whatever is there. */
export async function setNotional(page: Page, symbol: string, value: string): Promise<void> {
  const input = page.getByTestId(`notional-input-${symbol}`)
  await input.click()
  await input.press('ControlOrMeta+a')
  await input.fill(value)
}
