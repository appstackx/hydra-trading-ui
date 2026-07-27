import { describe, expect, it, vi } from 'vitest'
import type { Price, Symbol_ } from '@/domain'
import { MockExecution } from './execution'
import { createRandom, type Random } from './random'
import { price, T0 } from '@/test/fixtures'

const AT_MARKET = price({ symbol: 'EURUSD', mid: 1.085, bid: 1.08495, ask: 1.08505 })

interface Options {
  readonly seed?: number
  readonly random?: Random
  readonly getPrice?: (symbol: Symbol_) => Price | undefined
}

function createVenue(options: Options = {}): MockExecution {
  return new MockExecution({
    random: options.random ?? createRandom(options.seed ?? 1),
    getPrice: options.getPrice ?? (() => AT_MARKET),
    now: () => T0,
    // Resolves immediately; latency is exercised separately.
    delay: () => Promise.resolve(),
  })
}

/** A generator whose `chance` never fires, isolating the deterministic rules. */
function neverRejects(): Random {
  const base = createRandom(1)
  return { ...base, chance: () => false }
}

/** A generator whose `chance` always fires. */
function alwaysRejects(): Random {
  const base = createRandom(1)
  return { ...base, chance: () => true }
}

describe('MockExecution', () => {
  it('deals at the requested rate and stamps a settlement date', async () => {
    const venue = createVenue({ random: neverRejects() })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    })

    expect(result.kind).toBe('done')
    expect(result.trade.status).toBe('Done')
    expect(result.trade.rate).toBe(AT_MARKET.ask)
    expect(result.trade.notional).toBe(1_000_000)
    expect(result.trade.valueDate).toBe('2026-07-29')
    expect(result.trade.dealtCurrency).toBe('EUR')
    expect(result.trade.rejectionReason).toBeUndefined()
  })

  it('issues sequential trade ids', async () => {
    const venue = createVenue({ random: neverRejects() })
    const request = {
      symbol: 'EURUSD',
      direction: 'Buy' as const,
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    }

    const first = await venue.execute(request)
    const second = await venue.execute(request)

    expect(first.trade.id).toBe('TRD-000001')
    expect(second.trade.id).toBe('TRD-000002')
  })

  it('rejects a ticket beyond the credit line', async () => {
    const venue = createVenue({ random: neverRejects() })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 60_000_000,
      rate: AT_MARKET.ask,
    })

    expect(result.kind).toBe('rejected')
    expect(result.trade.status).toBe('Rejected')
    expect(result.trade.rejectionReason).toContain('credit line')
  })

  it('rejects a click on a rate the market has since left', async () => {
    const venue = createVenue({ random: neverRejects() })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: AT_MARKET.ask - 0.002, // 20 pips away
    })

    expect(result.kind).toBe('rejected')
    expect(result.trade.rejectionReason).toContain('Price moved')
  })

  it('accepts a click that is only slightly stale', async () => {
    const venue = createVenue({ random: neverRejects() })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: AT_MARKET.ask - 0.0002, // 2 pips
    })

    expect(result.kind).toBe('done')
  })

  it('deals when the venue has no price to check the click against', async () => {
    const venue = createVenue({ random: neverRejects(), getPrice: () => undefined })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: 99, // absurd, but unverifiable without a market
    })

    expect(result.kind).toBe('done')
  })

  it('rejects at random with a reason attached', async () => {
    const venue = createVenue({ random: alwaysRejects() })

    const result = await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    })

    expect(result.kind).toBe('rejected')
    expect(result.trade.rejectionReason).toBeTruthy()
    expect(result.trade.status).toBe('Rejected')
  })

  it('waits for a round trip before responding', async () => {
    const delay = vi.fn((_ms: number) => Promise.resolve())
    const venue = new MockExecution({
      random: neverRejects(),
      getPrice: () => AT_MARKET,
      now: () => T0,
      delay,
    })

    await venue.execute({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    })

    expect(delay).toHaveBeenCalledTimes(1)
    const waited = delay.mock.calls[0]?.[0] ?? 0
    expect(waited).toBeGreaterThanOrEqual(140)
    expect(waited).toBeLessThanOrEqual(520)
  })

  it('falls back to the leading three characters for an unknown instrument', async () => {
    const venue = createVenue({ random: neverRejects(), getPrice: () => undefined })

    const result = await venue.execute({
      symbol: 'ZARTRY',
      direction: 'Sell',
      notional: 1_000_000,
      rate: 5,
    })

    expect(result.trade.dealtCurrency).toBe('ZAR')
  })

  it('produces the same outcomes for the same seed', async () => {
    const request = {
      symbol: 'EURUSD',
      direction: 'Buy' as const,
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    }

    const runOnce = async (): Promise<string[]> => {
      const venue = createVenue({ seed: 777 })
      const outcomes: string[] = []
      for (let i = 0; i < 30; i += 1) {
        outcomes.push((await venue.execute(request)).kind)
      }
      return outcomes
    }

    expect(await runOnce()).toEqual(await runOnce())
  })

  it('rejects a minority of tickets over a long run', async () => {
    const venue = createVenue({ seed: 9 })
    const request = {
      symbol: 'EURUSD',
      direction: 'Buy' as const,
      notional: 1_000_000,
      rate: AT_MARKET.ask,
    }

    let rejected = 0
    for (let i = 0; i < 300; i += 1) {
      if ((await venue.execute(request)).kind === 'rejected') rejected += 1
    }

    expect(rejected).toBeGreaterThan(0)
    expect(rejected / 300).toBeLessThan(0.2)
  })
})
