import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, Price, Symbol_, Trade } from '@/domain'
import { createServices } from './create-services'
import { sessionStorageKey } from './persistence/session-store'
import { T0 } from '@/test/fixtures'

describe('createServices', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // MockAuth restores its session from sessionStorage; each test starts clean.
    window.sessionStorage.clear()
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

    // Orders belong to someone: an unauthenticated submit is refused, so the
    // test signs in the way the app does.
    await services.auth.signIn('u-senior', 'demo')

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
    await services.auth.signIn('u-senior', 'demo')

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

  describe('persistence', () => {
    function memoryStorage() {
      const store = new Map<string, string>()
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      }
    }

    it('restores the blotter and continues trade ids after a restart', async () => {
      const storage = memoryStorage()

      const first = createServices({ withHistory: false, now: () => T0, storage })
      await first.auth.signIn('u-senior', 'demo')
      await vi.advanceTimersByTimeAsync(500)

      let latestAsk = 0
      first.marketData.allPrices$().subscribe((prices) => {
        latestAsk = prices.EURUSD?.ask ?? 0
      })
      await vi.advanceTimersByTimeAsync(400)

      const executed = first.execution.execute({
        symbol: 'EURUSD',
        direction: 'Buy',
        notional: 1_000_000,
        rate: latestAsk,
      })
      await vi.advanceTimersByTimeAsync(1_000)
      const result = await executed
      first.trades.record(result.trade)
      expect(result.trade.id).toBe('TRD-000001')

      // Let the debounced persist fire before "refreshing".
      await vi.advanceTimersByTimeAsync(1_000)
      first.dispose()

      const second = createServices({ withHistory: false, now: () => T0, storage })
      let trades: readonly Trade[] = []
      second.trades.trades$().subscribe((value) => (trades = value))

      expect(trades.map((entry) => entry.id)).toContain('TRD-000001')

      // A new execution must continue the sequence, not reissue TRD-000001.
      await second.auth.signIn('u-senior', 'demo')
      await vi.advanceTimersByTimeAsync(400)
      const nextExecuted = second.execution.execute({
        symbol: 'EURUSD',
        direction: 'Buy',
        notional: 1_000_000,
        rate: latestAsk,
      })
      await vi.advanceTimersByTimeAsync(1_000)
      expect((await nextExecuted).trade.id).toBe('TRD-000002')

      second.dispose()
    })

    it('restores a resting order that keeps working, and continues the ORD sequence', async () => {
      const storage = memoryStorage()

      const first = createServices({ withHistory: false, now: () => T0, storage })
      await first.auth.signIn('u-senior', 'demo')
      const resting = await first.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.5, // far away: never fills in session one
        timeInForce: 'GTC',
      })
      expect(resting.id).toBe('ORD-000001')
      await vi.advanceTimersByTimeAsync(1_000) // debounced persist
      first.dispose()

      const second = createServices({ withHistory: false, now: () => T0, storage })
      await second.auth.signIn('u-senior', 'demo')

      let orders: readonly Order[] = []
      second.orders.orders$().subscribe((value) => (orders = value))

      // Restored, still working, still owned.
      expect(orders.map((order) => [order.id, order.status, order.ownerName])).toEqual([
        ['ORD-000001', 'Working', 'A. Whitfield'],
      ])

      // A new order continues the sequence rather than reissuing ORD-000001.
      const next = await second.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.5,
        timeInForce: 'GTC',
      })
      expect(next.id).toBe('ORD-000002')

      second.dispose()
    })

    it('flushes the pending write on dispose, so the last 750ms is never lost', async () => {
      const storage = memoryStorage()
      const services = createServices({ withHistory: false, now: () => T0, storage })
      await services.auth.signIn('u-senior', 'demo')

      await services.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.5,
        timeInForce: 'GTC',
      })
      // Dispose immediately — inside the debounce window, no timer has fired.
      services.dispose()

      const restored = createServices({ withHistory: false, now: () => T0, storage })
      let orders: readonly Order[] = []
      restored.orders.orders$().subscribe((value) => (orders = value))

      expect(orders).toHaveLength(1)
      restored.dispose()
    })

    it('keeps the kill switch through fresh=1 — a URL parameter is not a release', async () => {
      const storage = memoryStorage()
      const first = createServices({ now: () => T0, storage })
      await first.auth.signIn('u-risk', 'demo')
      await first.risk.engageKillSwitch('halt before reset')
      first.dispose()

      const reset = createServices({ now: () => T0, storage, fresh: true })

      expect(reset.risk.killSwitch.engaged).toBe(true)
      expect(reset.risk.killSwitch.reason).toBe('halt before reset')
      reset.dispose()
    })

    it('discards the persisted session when opened fresh', () => {
      const storage = memoryStorage()
      storage.setItem(
        sessionStorageKey('demo', 20260727),
        JSON.stringify({ version: 1, savedAt: T0, trades: [], orders: [] })
      )

      const services = createServices({ now: () => T0, storage, fresh: true })
      let trades: readonly Trade[] = []
      services.trades.trades$().subscribe((value) => (trades = value))

      // Fresh boot regenerates the seeded history instead of the empty
      // persisted session planted above.
      expect(trades.length).toBeGreaterThan(0)
      services.dispose()
    })

    it('touches no storage when none is provided', () => {
      // The hermetic default every other test relies on: nothing in this suite
      // may leak into the next via jsdom's real localStorage.
      const services = createServices({ now: () => T0 })
      services.dispose()
      expect(window.localStorage.length).toBe(0)
    })
  })

  describe('kill-switch enforcement in the service layer', () => {
    it('refuses execution while halted, whatever the UI shows', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })
      await services.auth.signIn('u-risk', 'demo') // risk user: may halt, may not trade
      await services.risk.engageKillSwitch('halt')
      await services.auth.signIn('u-senior', 'demo')

      await expect(
        services.execution.execute({
          symbol: 'EURUSD',
          direction: 'Buy',
          notional: 1_000_000,
          rate: 1.08,
        })
      ).rejects.toThrow(/kill switch/)

      services.dispose()
    })

    it('refuses order submission while halted, but still allows cancels', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })
      await services.auth.signIn('u-senior', 'demo')

      const resting = await services.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.9,
        timeInForce: 'GTC',
      })

      await services.risk.engageKillSwitch('halt')

      await expect(
        services.orders.submit({
          symbol: 'EURUSD',
          direction: 'Buy',
          orderType: 'Limit',
          quantity: 1_000_000,
          limitPrice: 0.9,
          timeInForce: 'GTC',
        })
      ).rejects.toThrow(/kill switch/)

      // Pulling risk off the book during a halt is the point of a halt.
      await expect(services.orders.cancel(resting.id)).resolves.toBeUndefined()

      services.dispose()
    })
  })

  describe('daily-loss enforcement in the service layer', () => {
    it('refuses new risk once the marked loss breaches the limit', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })
      await services.auth.signIn('u-senior', 'demo')
      await vi.advanceTimersByTimeAsync(400)

      // A book marked far through the −250k limit: long 100m EURUSD from 1.20.
      services.trades.record({
        id: 'TRD-900000',
        symbol: 'EURUSD',
        direction: 'Buy',
        notional: 100_000_000,
        rate: 1.2,
        tradeDate: T0,
        valueDate: '2026-07-29',
        status: 'Done',
        trader: 'A. Whitfield',
        dealtCurrency: 'EUR',
      })

      await expect(
        services.execution.execute({
          symbol: 'EURUSD',
          direction: 'Buy',
          notional: 1_000_000,
          rate: 1.0842,
        })
      ).rejects.toThrow(/daily loss/)

      await expect(
        services.orders.submit({
          symbol: 'EURUSD',
          direction: 'Buy',
          orderType: 'Market',
          quantity: 1_000_000,
          timeInForce: 'GTC',
        })
      ).rejects.toThrow(/daily loss/)

      services.dispose()
    })
  })

  describe('cancel ownership in the service layer', () => {
    it("refuses a junior cancelling the senior's order, allows their own", async () => {
      const services = createServices({ withHistory: false, now: () => T0 })

      await services.auth.signIn('u-senior', 'demo')
      const seniors = await services.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.5,
        timeInForce: 'GTC',
      })

      await services.auth.signIn('u-junior', 'demo')
      const juniors = await services.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Limit',
        quantity: 1_000_000,
        limitPrice: 0.5,
        timeInForce: 'GTC',
      })

      // The hidden button is a courtesy; this refusal is the control.
      await expect(services.orders.cancel(seniors.id)).rejects.toThrow(/your own orders/)
      await expect(services.orders.cancel(juniors.id)).resolves.toBeUndefined()

      services.dispose()
    })
  })

  describe('in-flight requests when the switch engages', () => {
    it('pins the documented race: a request already sent completes at the venue', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })
      await services.auth.signIn('u-senior', 'demo')
      await vi.advanceTimersByTimeAsync(400)

      let latestAsk = 0
      services.marketData.allPrices$().subscribe((prices) => {
        latestAsk = prices.EURUSD?.ask ?? 0
      })
      await vi.advanceTimersByTimeAsync(200)

      // Sent before the halt: the guard is pre-trade, so this races the venue
      // exactly as it would through a real gateway — and wins.
      const inFlight = services.execution.execute({
        symbol: 'EURUSD',
        direction: 'Buy',
        notional: 1_000_000,
        rate: latestAsk,
      })

      await services.auth.signIn('u-risk', 'demo')
      await services.risk.engageKillSwitch('halt mid-flight')

      await vi.advanceTimersByTimeAsync(1_000)
      const result = await inFlight
      expect(result.trade.id).toMatch(/^TRD-/)

      // But the next request is refused.
      await expect(
        services.execution.execute({
          symbol: 'EURUSD',
          direction: 'Buy',
          notional: 1_000_000,
          rate: latestAsk,
        })
      ).rejects.toThrow(/kill switch/)

      services.dispose()
    })
  })

  describe('audit wiring', () => {
    it('audits session transitions and order lifecycle end to end', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })

      await services.auth.signIn('u-senior', 'demo')
      const submitted = await services.orders.submit({
        symbol: 'EURUSD',
        direction: 'Buy',
        orderType: 'Market',
        quantity: 1_000_000,
        timeInForce: 'GTC',
      })
      await vi.advanceTimersByTimeAsync(600) // one tick fills the market order
      await services.auth.signOut()

      let types: string[] = []
      services.audit.events$().subscribe((events) => {
        types = events.map((event) => event.type)
      })

      expect(types).toContain('session.signed-in')
      expect(types).toContain('order.filled')
      expect(types).toContain('session.signed-out')
      expect(submitted.ownerName).toBe('A. Whitfield')

      services.dispose()
    })

    it('names the signed-in user on tickets they deal', async () => {
      const services = createServices({ withHistory: false, now: () => T0 })
      await services.auth.signIn('u-junior', 'demo')
      await vi.advanceTimersByTimeAsync(400)

      const executed = services.execution.execute({
        symbol: 'EURUSD',
        direction: 'Buy',
        notional: 1_000_000,
        rate: 1.0842,
      })
      await vi.advanceTimersByTimeAsync(1_000)

      expect((await executed).trade.trader).toBe('D. Osei')

      services.dispose()
    })
  })
})
