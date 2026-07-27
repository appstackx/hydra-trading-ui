import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BehaviorSubject, EMPTY, of } from 'rxjs'
import type { ConnectionState, Order, Price, Symbol_, Trade } from '@/domain'
import type { MarketDataPort } from '../ports'
import { MockOrderService } from './orders'
import { price, T0 } from '@/test/fixtures'
import { CURRENCY_PAIRS } from './instruments'

const AT_MARKET = price({ symbol: 'EURUSD', mid: 1.085, bid: 1.08495, ask: 1.08505 })

/** A market the test drives by hand, one snapshot at a time. */
function createMarket(initial: Price = AT_MARKET): {
  port: MarketDataPort
  push: (next: Price) => void
} {
  const subject = new BehaviorSubject<Readonly<Record<Symbol_, Price>>>({
    [initial.symbol]: initial,
  })

  return {
    port: {
      currencyPairs: CURRENCY_PAIRS,
      prices$: () => EMPTY,
      allPrices$: () => subject.asObservable(),
      connection$: () =>
        of<ConnectionState>({ status: 'connected', latencyMs: 1, service: 'test' }),
    },
    push: (next) => {
      subject.next({ ...subject.value, [next.symbol]: next })
    },
  }
}

/*
 * The market port is a BehaviorSubject, so `start()` matches once against the
 * snapshot that is already there. Tests that count individual clips therefore
 * call `start()` before submitting, which makes each later `push` exactly one
 * matching pass.
 */
describe('MockOrderService', () => {
  let market: ReturnType<typeof createMarket>
  let fills: Trade[]
  let service: MockOrderService

  beforeEach(() => {
    market = createMarket()
    fills = []
    service = new MockOrderService({
      marketData: market.port,
      onFill: (trade) => fills.push(trade),
      now: () => T0,
    })
  })

  const draft = {
    symbol: 'EURUSD',
    direction: 'Buy' as const,
    orderType: 'Limit' as const,
    quantity: 1_000_000,
    limitPrice: 1.084,
    timeInForce: 'GTC' as const,
  }

  // A market order carries no limit at all. Under `exactOptionalPropertyTypes`
  // the key has to be absent, not set to undefined.
  const { limitPrice: _noLimit, ...withoutLimit } = draft
  const marketDraft = { ...withoutLimit, orderType: 'Market' as const }

  it('accepts an order and rests it as working', async () => {
    const order = await service.submit(draft)

    expect(order.id).toBe('ORD-000001')
    expect(order.status).toBe('Working')
    expect(order.filledQuantity).toBe(0)
    expect(service.snapshot).toHaveLength(1)
  })

  it('rejects an invalid draft before it reaches the book', async () => {
    await expect(service.submit({ ...draft, quantity: 0 })).rejects.toThrow(/greater than zero/)
    expect(service.snapshot).toHaveLength(0)
  })

  it('leaves an away limit resting when matching starts', async () => {
    await service.submit(draft) // buy at 1.0840, offer is 1.08505
    service.start()

    expect(service.snapshot[0]?.status).toBe('Working')
    expect(fills).toHaveLength(0)
  })

  it('fills the moment the market trades through the limit', async () => {
    await service.submit(draft)
    service.start()

    market.push(price({ symbol: 'EURUSD', mid: 1.0838, bid: 1.08375, ask: 1.08385 }))

    expect(service.snapshot[0]?.status).toBe('Filled')
    expect(fills).toHaveLength(1)
    expect(fills[0]?.notional).toBe(1_000_000)
  })

  it('gives the fill price improvement when the market is inside the limit', async () => {
    await service.submit(draft)
    service.start()
    market.push(price({ symbol: 'EURUSD', mid: 1.08, bid: 1.07995, ask: 1.08005 }))

    expect(fills[0]?.rate).toBe(1.08005)
  })

  it('fills a market order on the next tick', async () => {
    service.start()
    await service.submit({ ...marketDraft })

    market.push(AT_MARKET)

    expect(service.snapshot[0]?.status).toBe('Filled')
    expect(fills[0]?.rate).toBe(AT_MARKET.ask)
  })

  it('works a large order in clips, reporting partial fills', async () => {
    service.start()
    await service.submit({ ...marketDraft, quantity: 9_000_000 })

    market.push(AT_MARKET)
    expect(service.snapshot[0]?.status).toBe('PartiallyFilled')
    expect(service.snapshot[0]?.filledQuantity).toBe(3_000_000)

    market.push(AT_MARKET)
    market.push(AT_MARKET)

    expect(service.snapshot[0]?.status).toBe('Filled')
    expect(service.snapshot[0]?.filledQuantity).toBe(9_000_000)
    expect(fills).toHaveLength(3)
  })

  it('volume-weights the average fill price of a clipped order', async () => {
    service.start()
    await service.submit({ ...marketDraft, quantity: 9_000_000 })

    market.push(price({ symbol: 'EURUSD', mid: 1.08, bid: 1.07995, ask: 1.08 }))
    market.push(price({ symbol: 'EURUSD', mid: 1.09, bid: 1.08995, ask: 1.09 }))
    market.push(price({ symbol: 'EURUSD', mid: 1.1, bid: 1.09995, ask: 1.1 }))

    // Three equal clips at 1.08, 1.09 and 1.10.
    expect(service.snapshot[0]?.averageFillPrice).toBeCloseTo(1.09, 6)
  })

  it('cancels an immediate-or-cancel order that cannot trade', async () => {
    await service.submit({ ...draft, timeInForce: 'IOC' })
    service.start()

    market.push(AT_MARKET) // offer is above the limit

    expect(service.snapshot[0]?.status).toBe('Cancelled')
    expect(fills).toHaveLength(0)
  })

  it('fills a fill-or-kill order in a single clip, ignoring the slicing schedule', async () => {
    await service.submit({ ...marketDraft, quantity: 9_000_000, timeInForce: 'FOK' })
    service.start()

    market.push(AT_MARKET)

    expect(service.snapshot[0]?.status).toBe('Filled')
    expect(fills).toHaveLength(1)
    expect(fills[0]?.notional).toBe(9_000_000)
  })

  it('cancels a working order on request', async () => {
    const order = await service.submit(draft)
    await service.cancel(order.id)

    expect(service.snapshot[0]?.status).toBe('Cancelled')
  })

  it('does not fill an order cancelled before the market reached it', async () => {
    const order = await service.submit(draft)
    service.start()
    await service.cancel(order.id)

    market.push(price({ symbol: 'EURUSD', mid: 1.08, bid: 1.07995, ask: 1.08005 }))

    expect(fills).toHaveLength(0)
    expect(service.snapshot[0]?.status).toBe('Cancelled')
  })

  it('ignores a cancel for an unknown order', async () => {
    await service.submit(draft)
    await service.cancel('ORD-999999')

    expect(service.snapshot[0]?.status).toBe('Working')
  })

  it('leaves an order alone while its instrument is unquoted', async () => {
    await service.submit({ ...marketDraft, symbol: 'GBPUSD' })
    service.start()

    market.push(AT_MARKET) // a EURUSD tick

    expect(service.snapshot[0]?.status).toBe('Working')
  })

  it('publishes the order book as a stream', async () => {
    const seen: (readonly Order[])[] = []
    service.orders$().subscribe((orders) => seen.push(orders))

    await service.submit(draft)

    expect(seen).toHaveLength(2) // initial empty, then one order
    expect(seen[1]).toHaveLength(1)
  })

  it('starts matching only once, however many times start is called', async () => {
    const subscribe = vi.spyOn(market.port, 'allPrices$')
    service.start()
    service.start()

    await service.submit({ ...marketDraft })
    market.push(AT_MARKET)

    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(fills).toHaveLength(1)
  })

  it('stops matching once disposed', async () => {
    service.start()
    await service.submit({ ...marketDraft })
    service.dispose()

    market.push(AT_MARKET)

    expect(fills).toHaveLength(0)
  })

  it('stamps fills with a settlement date and the dealt currency', async () => {
    await service.submit({ ...marketDraft })
    service.start()
    market.push(AT_MARKET)

    expect(fills[0]?.valueDate).toBe('2026-07-29')
    expect(fills[0]?.dealtCurrency).toBe('EUR')
    expect(fills[0]?.status).toBe('Done')
    expect(fills[0]?.id).toMatch(/^FIL-\d{6}$/)
  })
})
