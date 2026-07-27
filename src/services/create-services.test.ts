import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Price, Symbol_, Trade } from '@/domain'
import { createServices } from './create-services'
import { T0 } from '@/test/fixtures'

describe('createServices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wires a complete set of ports', () => {
    const services = createServices({ now: () => T0 })

    expect(services.marketData).toBeDefined()
    expect(services.execution).toBeDefined()
    expect(services.orders).toBeDefined()
    expect(services.trades).toBeDefined()

    services.dispose()
  })

  it('seeds the blotter so the workspace is not empty on open', () => {
    const services = createServices({ now: () => T0 })
    let trades: readonly Trade[] = []
    services.trades.trades$().subscribe((value) => (trades = value))

    expect(trades.length).toBeGreaterThan(0)

    services.dispose()
  })

  it('starts from an empty blotter when history is turned off', () => {
    const services = createServices({ now: () => T0, withHistory: false })
    let trades: readonly Trade[] = []
    services.trades.trades$().subscribe((value) => (trades = value))

    expect(trades).toEqual([])

    services.dispose()
  })

  it('produces an identical session for the same seed', () => {
    const sessionFor = (): Trade[] => {
      const services = createServices({ seed: 999, now: () => T0 })
      let trades: readonly Trade[] = []
      services.trades.trades$().subscribe((value) => (trades = value))
      services.dispose()
      return [...trades]
    }

    expect(sessionFor()).toEqual(sessionFor())
  })

  it('produces a different session for a different seed', () => {
    const first = createServices({ seed: 1, now: () => T0 })
    const second = createServices({ seed: 2, now: () => T0 })

    let a: readonly Trade[] = []
    let b: readonly Trade[] = []
    first.trades.trades$().subscribe((value) => (a = value))
    second.trades.trades$().subscribe((value) => (b = value))

    expect(a).not.toEqual(b)

    first.dispose()
    second.dispose()
  })

  it('routes an order fill into the blotter', async () => {
    const services = createServices({ withHistory: false, now: () => T0 })
    let trades: readonly Trade[] = []
    services.trades.trades$().subscribe((value) => (trades = value))

    await services.orders.submit({
      symbol: 'EURUSD',
      direction: 'Buy',
      orderType: 'Market',
      quantity: 1_000_000,
      timeInForce: 'GTC',
    })

    // One tick is enough for a market order to trade.
    await vi.advanceTimersByTimeAsync(600)

    expect(trades.length).toBe(1)
    expect(trades[0]?.symbol).toBe('EURUSD')
    expect(trades[0]?.status).toBe('Done')

    services.dispose()
  })

  it('gives the execution venue a live market to validate clicks against', async () => {
    const services = createServices({ withHistory: false, now: () => T0 })

    let latest: Readonly<Record<Symbol_, Price>> = {}
    services.marketData.allPrices$().subscribe((prices) => (latest = prices))
    await vi.advanceTimersByTimeAsync(400)

    const currentAsk = latest.EURUSD?.ask
    expect(currentAsk).toBeDefined()

    // A click 50 pips away must be caught as stale, which is only possible if
    // the venue can see the market.
    const promise = services.execution.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: (currentAsk ?? 0) - 0.005,
    })
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await promise

    expect(result.kind).toBe('rejected')

    services.dispose()
  })

  it('stops every timer on dispose', async () => {
    const services = createServices({ now: () => T0 })
    const received: Price[] = []
    services.marketData.prices$('EURUSD').subscribe((price) => received.push(price))

    await vi.advanceTimersByTimeAsync(1_000)
    const countAtDispose = received.length
    services.dispose()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(received).toHaveLength(countAtDispose)
  })
})
