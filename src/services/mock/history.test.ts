import { describe, expect, it } from 'vitest'
import { generateTradeHistory } from './history'
import { INSTRUMENTS_BY_SYMBOL } from './instruments'
import { createRandom } from './random'
import { T0 } from '@/test/fixtures'

const generate = (seed = 5, count?: number) =>
  generateTradeHistory({
    random: createRandom(seed),
    until: T0,
    ...(count === undefined ? {} : { count }),
  })

describe('generateTradeHistory', () => {
  it('produces the requested number of trades', () => {
    expect(generate(5, 40)).toHaveLength(40)
  })

  it('is deterministic for a given seed', () => {
    expect(generate(123)).toEqual(generate(123))
  })

  it('differs between seeds', () => {
    expect(generate(1)).not.toEqual(generate(2))
  })

  it('orders newest first', () => {
    const trades = generate()

    for (let index = 1; index < trades.length; index += 1) {
      expect(trades[index - 1]?.tradeDate).toBeGreaterThanOrEqual(trades[index]?.tradeDate ?? 0)
    }
  })

  it('keeps every trade inside the requested window', () => {
    const spanMs = 60 * 60 * 1000
    const trades = generateTradeHistory({ random: createRandom(3), until: T0, spanMs, count: 50 })

    for (const trade of trades) {
      // The jitter can push a trade slightly past the edges of the nominal span.
      expect(trade.tradeDate).toBeGreaterThan(T0 - spanMs * 1.1)
      expect(trade.tradeDate).toBeLessThan(T0 + spanMs * 0.1)
    }
  })

  it('quotes each trade near its instrument opening rate', () => {
    for (const trade of generate(7, 100)) {
      const instrument = INSTRUMENTS_BY_SYMBOL[trade.symbol]
      expect(instrument).toBeDefined()
      expect(Math.abs(trade.rate - (instrument?.initialRate ?? 0))).toBeLessThan(
        (instrument?.initialRate ?? 1) * 0.02
      )
    }
  })

  it('rounds each rate to its instrument precision', () => {
    for (const trade of generate(8, 60)) {
      const precision = INSTRUMENTS_BY_SYMBOL[trade.symbol]?.ratePrecision ?? 5
      expect(trade.rate).toBe(Number(trade.rate.toFixed(precision)))
    }
  })

  it('mixes done and rejected trades, with a reason on every rejection', () => {
    const trades = generate(9, 200)
    const rejected = trades.filter((trade) => trade.status === 'Rejected')

    expect(rejected.length).toBeGreaterThan(0)
    expect(rejected.length).toBeLessThan(trades.length / 2)

    for (const trade of trades) {
      if (trade.status === 'Rejected') {
        expect(trade.rejectionReason).toBeTruthy()
      } else {
        expect(trade.rejectionReason).toBeUndefined()
      }
    }
  })

  it('deals in the base currency of each instrument', () => {
    for (const trade of generate(10, 50)) {
      expect(trade.dealtCurrency).toBe(INSTRUMENTS_BY_SYMBOL[trade.symbol]?.base)
    }
  })

  it('issues unique ids and a settlement date for every trade', () => {
    const trades = generate(11, 80)

    expect(new Set(trades.map((trade) => trade.id)).size).toBe(trades.length)
    for (const trade of trades) {
      expect(trade.valueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(trade.notional).toBeGreaterThan(0)
    }
  })

  it('returns nothing when asked for nothing', () => {
    expect(generate(12, 0)).toEqual([])
  })
})
