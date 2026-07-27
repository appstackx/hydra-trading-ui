import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionState, Price, Symbol_ } from '@/domain'
import { spreadInPips } from '@/domain'
import { MockMarketData, SERVICE_NAME } from './market-data'
import { createRandom } from './random'
import type { InstrumentConfig } from './instruments'

const EURUSD_CONFIG: InstrumentConfig = {
  symbol: 'EURUSD',
  base: 'EUR',
  terms: 'USD',
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
  initialRate: 1.085,
  volatility: 0.0002,
  spreadPips: 1,
  tickIntervalMs: 100,
}

const USDJPY_CONFIG: InstrumentConfig = {
  ...EURUSD_CONFIG,
  symbol: 'USDJPY',
  base: 'USD',
  terms: 'JPY',
  ratePrecision: 3,
  pipsPosition: 2,
  initialRate: 152,
  tickIntervalMs: 250,
}

const INSTRUMENTS = [EURUSD_CONFIG, USDJPY_CONFIG]

function createFeed(seed = 1): MockMarketData {
  return new MockMarketData({
    random: createRandom(seed),
    instruments: INSTRUMENTS,
    now: () => Date.now(),
  })
}

describe('MockMarketData', () => {
  let feed: MockMarketData

  beforeEach(() => {
    vi.useFakeTimers()
    feed = createFeed()
  })

  afterEach(() => {
    feed.dispose()
    vi.useRealTimers()
  })

  it('exposes the instruments it was configured with', () => {
    expect(feed.currencyPairs).toEqual(INSTRUMENTS)
  })

  it('quotes the opening rate on the first tick', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(0)

    expect(received).toHaveLength(1)
    expect(received[0]?.mid).toBeCloseTo(EURUSD_CONFIG.initialRate, 3)
    expect(received[0]?.movement).toBe('none')
  })

  it('ticks at the instrument interval', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(1_000)

    expect(received.length).toBe(11) // t=0 plus one every 100ms
  })

  it('gives each instrument its own tick rate', () => {
    const fast: Price[] = []
    const slow: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => fast.push(price))
    feed.prices$('USDJPY').subscribe((price) => slow.push(price))

    vi.advanceTimersByTime(1_000)

    expect(fast.length).toBeGreaterThan(slow.length)
  })

  it('always quotes a bid below the ask, straddling the mid', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(5_000)

    expect(received.length).toBeGreaterThan(10)
    for (const price of received) {
      expect(price.bid).toBeLessThan(price.ask)
      expect(price.mid).toBeGreaterThan(price.bid)
      expect(price.mid).toBeLessThan(price.ask)
    }
  })

  it('keeps the spread within a plausible band of the configured width', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(5_000)

    for (const price of received) {
      const spread = spreadInPips(price, EURUSD_CONFIG)
      expect(spread).toBeGreaterThan(0.5)
      expect(spread).toBeLessThan(2)
    }
  })

  it('rounds every quote to the instrument precision', () => {
    const received: Price[] = []
    feed.prices$('USDJPY').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(5_000)

    for (const price of received) {
      expect(price.mid).toBe(Number(price.mid.toFixed(3)))
    }
  })

  it('mean-reverts, so a long session does not drift away from the open', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(120_000)

    const last = received.at(-1)
    expect(last).toBeDefined()
    // Within 5% of the opening rate after twenty minutes of simulated ticks.
    expect(Math.abs((last?.mid ?? 0) - EURUSD_CONFIG.initialRate)).toBeLessThan(
      EURUSD_CONFIG.initialRate * 0.05
    )
  })

  it('labels each tick with its direction against the previous mid', () => {
    const received: Price[] = []
    feed.prices$('EURUSD').subscribe((price) => received.push(price))

    vi.advanceTimersByTime(3_000)

    for (let index = 1; index < received.length; index += 1) {
      const current = received[index]
      const previous = received[index - 1]
      if (!current || !previous) continue

      const expected =
        current.mid === previous.mid ? 'none' : current.mid > previous.mid ? 'up' : 'down'
      expect(current.movement).toBe(expected)
    }
  })

  it('shares one walk between subscribers rather than restarting it', () => {
    const first: Price[] = []
    const second: Price[] = []

    feed.prices$('EURUSD').subscribe((price) => first.push(price))
    vi.advanceTimersByTime(500)
    feed.prices$('EURUSD').subscribe((price) => second.push(price))
    vi.advanceTimersByTime(500)

    // The late subscriber gets the replayed current price, not the opening one.
    expect(second[0]).toEqual(first[first.length - second.length])
  })

  it('keeps the walk running across an unsubscribe and resubscribe', () => {
    const stream = feed.prices$('EURUSD')
    const before: Price[] = []
    const subscription = stream.subscribe((price) => before.push(price))

    vi.advanceTimersByTime(1_000)
    subscription.unsubscribe()
    vi.advanceTimersByTime(1_000)

    const after: Price[] = []
    stream.subscribe((price) => after.push(price))
    vi.advanceTimersByTime(0)

    expect(after[0]?.timestamp).toBeGreaterThanOrEqual(before.at(-1)?.timestamp ?? 0)
    expect(after[0]?.mid).not.toBe(before[0]?.mid)
  })

  it('returns an empty stream for an instrument the venue does not quote', () => {
    const received: Price[] = []
    let completed = false
    feed.prices$('XXXYYY').subscribe({
      next: (price) => received.push(price),
      complete: () => {
        completed = true
      },
    })

    vi.advanceTimersByTime(1_000)

    expect(received).toEqual([])
    expect(completed).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const a: number[] = []
    const b: number[] = []

    const first = createFeed(4242)
    first.prices$('EURUSD').subscribe((price) => a.push(price.mid))
    vi.advanceTimersByTime(2_000)
    first.dispose()

    const second = createFeed(4242)
    second.prices$('EURUSD').subscribe((price) => b.push(price.mid))
    vi.advanceTimersByTime(2_000)
    second.dispose()

    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(5)
  })

  describe('allPrices$', () => {
    it('emits from the first tick instead of waiting for every instrument', () => {
      const snapshots: Readonly<Record<Symbol_, Price>>[] = []
      feed.allPrices$().subscribe((prices) => snapshots.push(prices))

      vi.advanceTimersByTime(0)

      expect(snapshots.length).toBeGreaterThan(0)
      expect(Object.keys(snapshots[0] ?? {}).length).toBeGreaterThanOrEqual(1)
    })

    it('accumulates every instrument', () => {
      let latest: Readonly<Record<Symbol_, Price>> = {}
      feed.allPrices$().subscribe((prices) => {
        latest = prices
      })

      vi.advanceTimersByTime(1_000)

      expect(Object.keys(latest).sort()).toEqual(['EURUSD', 'USDJPY'])
    })

    it('returns the same stream on repeat calls', () => {
      expect(feed.allPrices$()).toBe(feed.allPrices$())
    })
  })

  describe('connection$', () => {
    it('reports connecting before the handshake completes', () => {
      const states: ConnectionState[] = []
      feed.connection$().subscribe((state) => states.push(state))

      vi.advanceTimersByTime(0)

      expect(states).toEqual([{ status: 'connecting', latencyMs: 0, service: SERVICE_NAME }])
    })

    it('reports a healthy link with a latency reading after the handshake', () => {
      const states: ConnectionState[] = []
      feed.connection$().subscribe((state) => states.push(state))

      vi.advanceTimersByTime(1_000)

      const settled = states.at(-1)
      expect(settled?.status === 'connected' || settled?.status === 'degraded').toBe(true)
      expect(settled?.latencyMs).toBeGreaterThan(0)
      expect(settled?.service).toBe(SERVICE_NAME)
    })

    it('heartbeats repeatedly', () => {
      const states: ConnectionState[] = []
      feed.connection$().subscribe((state) => states.push(state))

      vi.advanceTimersByTime(15_000)

      expect(states.length).toBeGreaterThan(4)
    })

    it('returns the same stream on repeat calls', () => {
      expect(feed.connection$()).toBe(feed.connection$())
    })
  })

  describe('dispose', () => {
    it('stops every stream', () => {
      const received: Price[] = []
      feed.prices$('EURUSD').subscribe((price) => received.push(price))
      vi.advanceTimersByTime(500)
      const countAtDispose = received.length

      feed.dispose()
      vi.advanceTimersByTime(5_000)

      expect(received).toHaveLength(countAtDispose)
    })

    it('drops the aggregate caches, so a rebuilt stream is not a completed one', () => {
      const before = feed.allPrices$()
      const beforeConnection = feed.connection$()

      feed.dispose()

      expect(feed.allPrices$()).not.toBe(before)
      expect(feed.connection$()).not.toBe(beforeConnection)
    })
  })
})
