import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { SpotTile } from '@/features/spot-tiles/SpotTile'
import { createTestServices, renderWithServices, type TestServices } from '@/test/harness'
import * as download from '@/lib/download'
import { EURUSD, T0, trade } from '@/test/fixtures'
import { DEMO_USERS } from '@/services'

const SENIOR = DEMO_USERS[0]!
const JUNIOR = DEMO_USERS[1]!
const RISK = DEMO_USERS[2]!

const ENGAGED = {
  engaged: true,
  engagedBy: 'M. Halvorsen',
  engagedAt: T0,
  reason: 'Fat print',
} as const

describe('kill switch in the UI', () => {
  it('shows the halt control to entitled users only', () => {
    const services = createTestServices(undefined, { user: JUNIOR })
    render(<App services={services} />)

    expect(screen.queryByTestId('kill-switch-engage')).not.toBeInTheDocument()
  })

  it('lets the risk user halt the desk from the title bar', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: RISK })
    render(<App services={services} />)

    await user.click(screen.getByTestId('kill-switch-engage'))

    expect(await screen.findByTestId('risk-banner')).toHaveTextContent('kill switch engaged')
    expect(screen.getByTestId('risk-banner')).toHaveTextContent('M. Halvorsen')
    expect(services.killSwitchState.value.engaged).toBe(true)
  })

  it('disables every tile with the halt reason while engaged', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    services.killSwitchState.next(ENGAGED)
    render(<App services={services} />)

    expect(screen.getAllByTestId('buy-button')[0]).toBeDisabled()
    expect(screen.getAllByText(/kill switch engaged by M\. Halvorsen/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('order-submit')).toBeDisabled()
  })

  it('hides the engage control while already engaged, and shows release on the banner', () => {
    const services = createTestServices(undefined, { user: RISK })
    services.killSwitchState.next(ENGAGED)
    render(<App services={services} />)

    expect(screen.queryByTestId('kill-switch-engage')).not.toBeInTheDocument()
    expect(screen.getByTestId('risk-banner-release')).toBeInTheDocument()
  })

  it('releases from the banner and returns the desk to dealing', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: RISK })
    services.killSwitchState.next(ENGAGED)
    render(<App services={services} />)

    await user.click(screen.getByTestId('risk-banner-release'))

    await waitFor(() => {
      expect(screen.queryByTestId('risk-banner')).not.toBeInTheDocument()
    })
    expect(services.killSwitchState.value.engaged).toBe(false)
  })

  it('offers no release control to a user who cannot operate the switch', () => {
    const services = createTestServices(undefined, { user: JUNIOR })
    services.killSwitchState.next(ENGAGED)
    render(<App services={services} />)

    expect(screen.getByTestId('risk-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('risk-banner-release')).not.toBeInTheDocument()
  })

})

describe('daily loss halt', () => {
  it('halts dealing once the session loss breaches the limit', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    // Long 100m EURUSD bought at 1.09, marked at 1.0842 → −580,000 USD, well
    // through the 250,000 daily loss limit.
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    services.tradeList.next([trade({ rate: 1.09, notional: 100_000_000, tradeDate: T0 })])
    render(<App services={services} />)

    expect(screen.getByTestId('risk-banner')).toHaveTextContent('Daily loss limit')
    expect(screen.getAllByTestId('buy-button')[0]).toBeDisabled()
    // Automatic halts have no release button — they clear when the P&L does.
    expect(screen.queryByTestId('risk-banner-release')).not.toBeInTheDocument()
  })

  it('latches through a marginal recovery, then releases when P&L truly recovers', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    // Long 100m at 1.09 marked 1.0842 → −580k: halted.
    services.tradeList.next([trade({ rate: 1.09, notional: 100_000_000, tradeDate: T0 })])
    render(<App services={services} />)
    expect(screen.getByTestId('risk-banner')).toBeInTheDocument()

    // Marked back to −240k: inside the hysteresis band, still halted.
    act(() => {
      services.tick('EURUSD', { mid: 1.0876, bid: 1.08756, ask: 1.08764 })
    })
    expect(screen.getByTestId('risk-banner')).toBeInTheDocument()

    // Marked to −100k: clearly recovered, the latch releases.
    act(() => {
      services.tick('EURUSD', { mid: 1.089, bid: 1.08896, ask: 1.08904 })
    })
    expect(screen.queryByTestId('risk-banner')).not.toBeInTheDocument()

    // Both transitions made it onto the audit trail.
    const types = services.auditEvents.value.map((event) => event.type)
    expect(types).toContain('risk.loss-halt-engaged')
    expect(types).toContain('risk.loss-halt-released')
  })

  it('does not halt inside the limit', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    services.tick('EURUSD', { mid: 1.0842 })
    services.tradeList.next([trade({ rate: 1.085, notional: 1_000_000, tradeDate: T0 })])
    render(<App services={services} />)

    expect(screen.queryByTestId('risk-banner')).not.toBeInTheDocument()
  })
})

describe('audit drawer', () => {
  it('opens from the title bar, lists events and closes', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    services.audit.record('trade.executed', 'Bought 1m EURUSD at 1.08423', { rate: 1.08423 })
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))

    expect(screen.getByTestId('audit-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('audit-count')).toHaveTextContent('1 event')
    expect(screen.getByText('Bought 1m EURUSD at 1.08423')).toBeInTheDocument()

    await user.click(screen.getByTestId('audit-close'))
    expect(screen.queryByTestId('audit-drawer')).not.toBeInTheDocument()
  })

  it('filters by event family', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    services.audit.record('trade.executed', 'a trade event')
    services.audit.record('risk.kill-switch-engaged', 'a risk event')
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))
    await user.click(screen.getByTestId('audit-filter-risk'))

    expect(screen.getByText('a risk event')).toBeInTheDocument()
    expect(screen.queryByText('a trade event')).not.toBeInTheDocument()
  })

  it('records the full lifecycle of a dealt ticket, quote included', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    renderWithServices(<SpotTile pair={EURUSD} />, { services })

    await user.click(screen.getByTestId('buy-button'))

    await waitFor(() => {
      const types = services.auditEvents.value.map((event) => event.type)
      expect(types).toContain('trade.submitted')
      expect(types).toContain('trade.executed')
    })

    const submitted = services.auditEvents.value.find(
      (event) => event.type === 'trade.submitted'
    )
    // The quote shown at the click is the evidence in a disputed trade.
    expect(submitted?.details).toMatchObject({
      shownBid: 1.08416,
      shownAsk: 1.08424,
      clickedRate: 1.08424,
    })
  })

  it('exports the trail through the download seam', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {})
    const services = createTestServices(undefined, { user: SENIOR })
    services.audit.record('trade.executed', 'exported event')
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))
    await user.click(screen.getByTestId('audit-export'))

    expect(spy).toHaveBeenCalledTimes(1)
    const [contents, filename] = spy.mock.calls[0] ?? []
    expect(filename).toBe('audit-trail.csv')
    expect(contents).toContain('exported event')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))
    expect(screen.getByTestId('audit-drawer')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('audit-drawer')).not.toBeInTheDocument()
  })

  it('closes from the backdrop', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))
    await user.click(screen.getByTestId('audit-backdrop'))

    expect(screen.queryByTestId('audit-drawer')).not.toBeInTheDocument()
  })

  it('shows the empty state when a filter matches nothing', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    services.audit.record('trade.executed', 'only a trade')
    render(<App services={services} />)

    await user.click(screen.getByTestId('audit-open'))
    await user.click(screen.getByTestId('audit-filter-session'))

    expect(screen.getByTestId('audit-empty')).toBeInTheDocument()
  })

  it('clears the session and reloads through the reset control', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    const clear = vi.spyOn(services, 'clearPersistedState')
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })
    try {
      services.audit.record('trade.executed', 'to be cleared')
      render(<App services={services} />)

      await user.click(screen.getByTestId('audit-open'))
      await user.click(screen.getByTestId('audit-clear-session'))

      expect(clear).toHaveBeenCalledTimes(1)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('stale quote suspension', () => {
  function renderLiveTile(services: TestServices) {
    // The staleness rule applies to live sessions only; the harness reports
    // itself as a live feed for these tests.
    Object.defineProperty(services, 'config', {
      get: () => ({
        feed: 'live' as const,
        instruments: services.pairs,
        defaultTileSymbols: services.pairs.map((pair) => pair.symbol),
      }),
    })
    return renderWithServices(<SpotTile pair={EURUSD} />, { services })
  }

  it('suspends dealing on a quote older than the threshold', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const services = createTestServices(undefined, { user: SENIOR, seedPrices: false })
      services.tick('EURUSD', {
        mid: 1.0842,
        bid: 1.08416,
        ask: 1.08424,
        timestamp: Date.now() - 60_000, // a minute old
      })
      renderLiveTile(services)

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(screen.getByTestId('buy-button')).toBeDisabled()
      expect(screen.getByTestId('entitlement-block-EURUSD')).toHaveTextContent('Stale price')
    } finally {
      vi.useRealTimers()
    }
  })

  it('suspends a quote that was fresh at mount once enough time passes', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const services = createTestServices(undefined, { user: SENIOR, seedPrices: false })
      services.tick('EURUSD', { timestamp: Date.now() }) // fresh right now
      renderLiveTile(services)
      expect(screen.getByTestId('buy-button')).toBeEnabled()

      // No new quote arrives; only the interval re-check can catch the age.
      act(() => {
        vi.advanceTimersByTime(45_000) // past the 30s threshold + interval
      })

      expect(screen.getByTestId('buy-button')).toBeDisabled()
      expect(screen.getByTestId('entitlement-block-EURUSD')).toHaveTextContent('Stale price')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resumes dealing the moment a fresh quote lands', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const services = createTestServices(undefined, { user: SENIOR, seedPrices: false })
      services.tick('EURUSD', { timestamp: Date.now() - 60_000 })
      renderLiveTile(services)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(screen.getByTestId('buy-button')).toBeDisabled()

      act(() => {
        services.tick('EURUSD', { timestamp: Date.now() })
      })

      expect(screen.getByTestId('buy-button')).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never suspends the demo feed, whose clock is not wall time', () => {
    const services = createTestServices(undefined, { user: SENIOR, seedPrices: false })
    // Fixture timestamps are epoch-2026 and far from Date.now(); on a demo
    // session that must not matter.
    services.tick('EURUSD', { timestamp: T0 })
    renderWithServices(<SpotTile pair={EURUSD} />, { services })

    expect(screen.getByTestId('buy-button')).toBeEnabled()
  })
})
