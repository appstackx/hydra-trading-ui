import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Pinning the seed makes the demo feed reproducible: the same opening rates, the
 * same seeded blotter and the same sequence of venue rejections on every run.
 */
export const SEED = 20260727

/** Demo users, matching `src/services/mock/auth.ts`. */
export const USERS = {
  senior: 'u-senior',
  junior: 'u-junior',
  viewer: 'u-risk',
} as const

export type DemoUser = keyof typeof USERS

/**
 * Signs in, or does nothing if the session is already authenticated.
 *
 * The session survives a reload, so a test that navigates twice must not assume
 * the sign-in screen is there the second time.
 */
export async function signIn(page: Page, as: DemoUser = 'senior'): Promise<void> {
  const form = page.getByTestId('sign-in')
  // Wait for the app to settle on one screen or the other before deciding.
  await expect(form.or(page.getByTestId('workspace')).first()).toBeVisible({ timeout: 15_000 })
  if (!(await form.isVisible())) return

  await form.getByTestId(`sign-in-user-${USERS[as]}`).check({ force: true })
  await page.getByTestId('sign-in-submit').click()
}

export interface OpenOptions {
  readonly seed?: number
  readonly as?: DemoUser
  /** Extra query parameters, e.g. `{ feed: 'live' }`. */
  readonly params?: Record<string, string>
}

/** Loads the app, signs in and waits for the pricing stream to connect. */
export async function openWorkspace(page: Page, options: OpenOptions | number = {}): Promise<void> {
  const { seed = SEED, as = 'senior', params = {} } =
    typeof options === 'number' ? { seed: options } : options

  const query = new URLSearchParams({ seed: String(seed), ...params })
  await page.goto(`/?${query.toString()}`)

  await signIn(page, as)

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
