import type { Price, Symbol_ } from '@/domain'
import type { Services } from './ports'
import { MockExecution } from './mock/execution'
import { generateTradeHistory } from './mock/history'
import { MockMarketData } from './mock/market-data'
import { MockOrderService } from './mock/orders'
import { createRandom, DEFAULT_SEED } from './mock/random'
import { InMemoryTradeStore } from './mock/trades'

export interface CreateServicesOptions {
  /** Pins the simulation. The same seed always produces the same session. */
  readonly seed?: number
  readonly now?: () => number
  /** Skips the seeded blotter, for tests that want to start from nothing. */
  readonly withHistory?: boolean
}

/**
 * Composition root for the demo back end.
 *
 * This is the only file that names a concrete adapter. Pointing the UI at a real
 * venue means returning a different set of objects from here — every component
 * above depends on {@link Services} alone.
 *
 * Each service gets its own generator derived from the base seed, so the order
 * in which components subscribe cannot change which trades get rejected.
 */
export function createServices(options: CreateServicesOptions = {}): Services {
  const { seed = DEFAULT_SEED, now = Date.now, withHistory = true } = options

  const marketData = new MockMarketData({ random: createRandom(seed), now })

  const trades = new InMemoryTradeStore(
    withHistory ? generateTradeHistory({ random: createRandom(seed + 101), until: now() }) : []
  )

  // The execution venue needs the live market to detect a stale click, so the
  // latest snapshot is mirrored here rather than threaded through every call.
  let latestPrices: Readonly<Record<Symbol_, Price>> = {}
  const priceSubscription = marketData.allPrices$().subscribe((prices) => {
    latestPrices = prices
  })

  const execution = new MockExecution({
    random: createRandom(seed + 202),
    getPrice: (symbol) => latestPrices[symbol],
    now,
  })

  const orders = new MockOrderService({
    marketData,
    onFill: (trade) => {
      trades.record(trade)
    },
    now,
  })
  orders.start()

  return {
    marketData,
    execution,
    orders,
    trades,
    dispose(): void {
      priceSubscription.unsubscribe()
      orders.dispose()
      trades.dispose()
      marketData.dispose()
    },
  }
}
