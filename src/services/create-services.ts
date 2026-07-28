import type { CurrencyPair, Price, Symbol_ } from '@/domain'
import type { Services } from './ports'
import { MockAuth } from './mock/auth'
import { MockExecution } from './mock/execution'
import { generateTradeHistory } from './mock/history'
import { CURRENCY_PAIRS, DEFAULT_TILE_SYMBOLS } from './mock/instruments'
import { MockMarketData } from './mock/market-data'
import { MockOrderService } from './mock/orders'
import { createRandom, DEFAULT_SEED } from './mock/random'
import { InMemoryTradeStore } from './mock/trades'
import { DEFAULT_LIVE_TILE_SYMBOLS, LIVE_INSTRUMENTS } from './live/instruments'
import { LiveMarketData } from './live/live-market-data'
import { venueFor } from './live/venues'

/**
 * Which price source the session runs on.
 *
 * `demo` is a deterministic simulation — reproducible, offline, and what the
 * test suite runs against. `live` connects to a real venue's public feed.
 * Execution is simulated either way: the demo never sends an order anywhere.
 */
export type FeedMode = 'demo' | 'live'

export interface CreateServicesOptions {
  readonly feed?: FeedMode
  /** Venue id for live mode, e.g. `coinbase` or `binance`. */
  readonly venue?: string
  /** Pins the simulation. The same seed always produces the same demo session. */
  readonly seed?: number
  readonly now?: () => number
  /** Skips the seeded blotter, for tests that want to start from nothing. */
  readonly withHistory?: boolean
}

export interface SessionConfig {
  readonly feed: FeedMode
  readonly instruments: readonly CurrencyPair[]
  readonly defaultTileSymbols: readonly Symbol_[]
}

/** Everything the shell needs to know about how this session was assembled. */
export interface AppServices extends Services {
  readonly config: SessionConfig
}

/**
 * Composition root.
 *
 * The only file in the codebase that names a concrete adapter. Swapping the
 * simulated feed for a live exchange happens here and nowhere else — every
 * component above depends on the ports alone, which is the claim the live mode
 * exists to make checkable.
 */
export function createServices(options: CreateServicesOptions = {}): AppServices {
  const {
    feed = 'demo',
    venue,
    seed = DEFAULT_SEED,
    now = Date.now,
    withHistory = true,
  } = options

  const live = feed === 'live'

  const marketData = live
    ? new LiveMarketData({ venue: venueFor(venue), now })
    : new MockMarketData({ random: createRandom(seed), now })

  if (marketData instanceof LiveMarketData) marketData.connect()

  const instruments = live ? LIVE_INSTRUMENTS : CURRENCY_PAIRS

  const trades = new InMemoryTradeStore(
    // Seeded history is FX-shaped, so it is only meaningful in demo mode.
    withHistory && !live
      ? generateTradeHistory({ random: createRandom(seed + 101), until: now() })
      : []
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

  const auth = new MockAuth()

  return {
    marketData,
    execution,
    orders,
    trades,
    auth,
    config: {
      feed,
      instruments,
      defaultTileSymbols: live ? DEFAULT_LIVE_TILE_SYMBOLS : DEFAULT_TILE_SYMBOLS,
    },
    dispose(): void {
      priceSubscription.unsubscribe()
      orders.dispose()
      trades.dispose()
      auth.dispose()
      marketData.dispose()
    },
  }
}

/**
 * Reads session options from a URL query string: `?feed=live&venue=binance`.
 * Anything unrecognised falls back to the deterministic demo.
 */
export function sessionOptionsFromSearch(search: string): CreateServicesOptions {
  const params = new URLSearchParams(search)
  const feed: FeedMode = params.get('feed') === 'live' ? 'live' : 'demo'
  const venue = params.get('venue')
  return { feed, ...(venue === null ? {} : { venue }) }
}
