import { auditTime, combineLatest, distinctUntilChanged, skip, type Subscription } from 'rxjs'
import type { CurrencyPair, Order, Price, Symbol_, Trade, User } from '@/domain'
import {
  calculatePositions,
  canCancel,
  dailyLossBreached,
  formatNotional,
  isWorking,
  totalPnl,
} from '@/domain'
import type { ExecutionPort, OrderPort, Services } from './ports'
import { LocalAuditService } from './audit/local-audit'
import { MockAuth } from './mock/auth'
import { MockExecution } from './mock/execution'
import { generateTradeHistory } from './mock/history'
import { CURRENCY_PAIRS, DEFAULT_TILE_SYMBOLS } from './mock/instruments'
import { MockMarketData } from './mock/market-data'
import { MockOrderService } from './mock/orders'
import { createRandom, DEFAULT_SEED } from './mock/random'
import { InMemoryTradeStore } from './mock/trades'
import { DeskRiskControls } from './risk/risk-controls'
import {
  clearSession,
  loadSession,
  nextSequenceAfter,
  saveSession,
  sessionStorageKey,
} from './persistence/session-store'
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

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CreateServicesOptions {
  readonly feed?: FeedMode
  /** Venue id for live mode, e.g. `coinbase` or `binance`. */
  readonly venue?: string
  /** Pins the simulation. The same seed always produces the same demo session. */
  readonly seed?: number
  readonly now?: () => number
  /** Skips the seeded blotter, for tests that want to start from nothing. */
  readonly withHistory?: boolean
  /**
   * Where the session, audit trail and kill-switch state persist. Omitted —
   * as every test omits it — nothing touches storage and each run is hermetic.
   * The app shell passes `window.localStorage`.
   */
  readonly storage?: StorageLike | undefined
  /** Discards any persisted session before booting. Driven by `?fresh=1`. */
  readonly fresh?: boolean
}

export interface SessionConfig {
  readonly feed: FeedMode
  readonly instruments: readonly CurrencyPair[]
  readonly defaultTileSymbols: readonly Symbol_[]
}

/** Everything the shell needs to know about how this session was assembled. */
export interface AppServices extends Services {
  readonly config: SessionConfig
  /** Wipes persisted session, audit and risk state. The demo reset control. */
  readonly clearPersistedState: () => void
}

/** How long changes may sit unsaved. Long enough to coalesce a burst of fills. */
const PERSIST_DEBOUNCE_MS = 750

/**
 * Composition root.
 *
 * The only file in the codebase that names a concrete adapter, and the layer
 * that re-checks what the UI already checked: the kill switch and daily loss
 * limit on every execution and order submission, and cancel ownership on every
 * cancel. A disabled button is a courtesy; the refusals in `guardExecution`
 * and `guardOrders` are the control, in the position a deployment's server
 * takes. Entitlement and fat-finger checks remain UI-side here — in a
 * deployment they are re-enforced server-side with everything else.
 */
export function createServices(options: CreateServicesOptions = {}): AppServices {
  const {
    feed = 'demo',
    venue,
    seed = DEFAULT_SEED,
    now = Date.now,
    withHistory = true,
    storage,
    fresh = false,
  } = options

  const live = feed === 'live'
  const sessionKey = sessionStorageKey(feed, seed)
  const auditKey = `hydra.v1.audit.${feed}.${String(seed)}`

  const auth = new MockAuth()
  const getUser = (): User | null => auth.currentUser

  const audit = new LocalAuditService({ getUser, storage, storageKey: auditKey, now })
  const risk = new DeskRiskControls({ getUser, audit, storage, now })

  if (fresh && storage) {
    // `fresh` resets the demo session — trades, orders and the audit buffer.
    // It deliberately does NOT touch the kill switch: a halt that a URL
    // parameter could release would not be a halt.
    audit.clear()
    clearSession(storage, sessionKey)
  }

  const restored = storage ? loadSession(storage, sessionKey) : null

  const marketData = live
    ? new LiveMarketData({ venue: venueFor(venue), now })
    : new MockMarketData({ random: createRandom(seed), now })

  if (marketData instanceof LiveMarketData) marketData.connect()

  const instruments = live ? LIVE_INSTRUMENTS : CURRENCY_PAIRS

  const trades = new InMemoryTradeStore(
    restored?.trades ??
      // Seeded history is FX-shaped, so it is only meaningful in demo mode.
      (withHistory && !live
        ? generateTradeHistory({ random: createRandom(seed + 101), until: now() })
        : [])
  )

  // The execution venue needs the live market to detect a stale click, so the
  // latest snapshot is mirrored here rather than threaded through every call.
  let latestPrices: Readonly<Record<Symbol_, Price>> = {}
  const subscriptions: Subscription[] = [
    marketData.allPrices$().subscribe((prices) => {
      latestPrices = prices
    }),
  ]

  const tradeIds = trades.snapshot.map((trade) => trade.id)

  const execution = new MockExecution({
    random: createRandom(seed + 202),
    getPrice: (symbol) => latestPrices[symbol],
    getTrader: () => getUser()?.name,
    // Restored ids must never be reissued: a duplicate trade id corrupts both
    // the blotter keys and the audit trail's cross-references.
    startSequence: nextSequenceAfter(tradeIds, 'TRD'),
    now,
  })

  const orders = new MockOrderService({
    marketData,
    onFill: (trade) => {
      trades.record(trade)
      audit.record(
        'order.filled',
        `Filled ${formatNotional(trade.notional)} ${trade.symbol} at ${String(trade.rate)}`,
        {
          tradeId: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          notional: trade.notional,
          rate: trade.rate,
          owner: trade.trader,
        }
      )
    },
    getOwner: () => {
      const user = getUser()
      return user ? { id: user.id, name: user.name } : null
    },
    initialOrders: restored?.orders ?? [],
    startOrderSequence: nextSequenceAfter(restored?.orders.map((order) => order.id) ?? [], 'ORD'),
    startFillSequence: nextSequenceAfter(tradeIds, 'FIL'),
    now,
  })
  orders.start()

  // Session lifecycle onto the audit trail. The first emission is the restored
  // (or absent) session; later transitions are sign-ins and sign-outs.
  const initialUser = auth.currentUser
  if (initialUser) {
    audit.record('session.restored', `Session restored for ${initialUser.name}`)
  }
  subscriptions.push(
    auth
      .currentUser$()
      .pipe(
        distinctUntilChanged((a, b) => a?.id === b?.id),
        skip(1)
      )
      .subscribe((user) => {
        if (user) audit.record('session.signed-in', `${user.name} signed in`, { role: user.role })
        else audit.record('session.signed-out', 'Signed out')
      })
  )

  let flushPersist: (() => void) | undefined
  let discardPending: (() => void) | undefined
  if (storage) {
    // Two subscriptions on purpose: the undebounced one tracks the latest
    // state, the debounced one writes it. The debounce alone would lose a
    // trade dealt in the last 750ms before the tab closes — `pagehide` and
    // dispose flush synchronously from the tracked state.
    let pending: { trades: readonly Trade[]; orders: readonly Order[] } | undefined
    flushPersist = () => {
      if (!pending) return
      saveSession(storage, sessionKey, pending.trades, pending.orders, now())
      pending = undefined
    }
    discardPending = () => {
      pending = undefined
    }

    subscriptions.push(
      combineLatest([trades.trades$(), orders.orders$()]).subscribe(([tradeList, orderList]) => {
        pending = { trades: tradeList, orders: orderList }
      }),
      combineLatest([trades.trades$(), orders.orders$()])
        .pipe(auditTime(PERSIST_DEBOUNCE_MS))
        .subscribe(() => {
          flushPersist?.()
        })
    )

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushPersist)
    }
  }

  // Instantaneous pre-trade loss check for the service-layer guards. The UI's
  // latched version adds hysteresis for display; here the plain threshold is
  // the right shape — a guard may be strict, never flappy in what it reports.
  const dailyLossExceeded = (): boolean => {
    const pairsBySymbol = Object.fromEntries(
      instruments.map((instrument) => [instrument.symbol, instrument])
    )
    const summary = totalPnl(
      calculatePositions(trades.snapshot, latestPrices),
      pairsBySymbol,
      latestPrices
    )
    return dailyLossBreached(summary.amount, risk.limits.maxDailyLossUsd)
  }

  return {
    marketData,
    execution: guardExecution(execution, risk, dailyLossExceeded),
    orders: guardOrders(orders, risk, dailyLossExceeded, getUser),
    trades,
    auth,
    audit,
    risk,
    config: {
      feed,
      instruments,
      defaultTileSymbols: live ? DEFAULT_LIVE_TILE_SYMBOLS : DEFAULT_TILE_SYMBOLS,
    },
    clearPersistedState(): void {
      // Same rule as `fresh`: the reset clears the session and the audit
      // buffer, never the kill switch. Releasing that takes an entitled user.
      audit.clear()
      if (storage) clearSession(storage, sessionKey)
      // Also drop the pending write: without this, a fill in the last 750ms
      // is flushed by the reset's own reload (pagehide) and deterministically
      // resurrects the session that was just cleared.
      discardPending?.()
    },
    dispose(): void {
      if (flushPersist && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flushPersist)
      }
      flushPersist?.()
      for (const subscription of subscriptions) subscription.unsubscribe()
      orders.dispose()
      trades.dispose()
      auth.dispose()
      risk.dispose()
      audit.dispose()
      marketData.dispose()
    },
  }
}

/**
 * Service-layer pre-trade enforcement on execution: the kill switch and the
 * daily loss limit, re-checked here because the UI's disabled buttons are a
 * courtesy. This wrapper is what refuses a request that arrives anyway — the
 * shape a deployment's server-side check takes.
 *
 * The guards are pre-trade only: a request already in flight when the switch
 * engages races the venue, exactly as it would through a real gateway.
 */
function guardExecution(
  inner: ExecutionPort,
  risk: DeskRiskControls,
  dailyLossExceeded: () => boolean
): ExecutionPort {
  return {
    execute: (request) => {
      const refusal = preTradeRefusal(risk, dailyLossExceeded)
      if (refusal !== null) return Promise.reject(new Error(refusal))
      return inner.execute(request)
    },
  }
}

/**
 * The same enforcement on order submission, plus ownership on cancel.
 * Cancels stay allowed during a halt: pulling risk off the book is the point
 * of a halt — but only by someone entitled to cancel that order.
 */
function guardOrders(
  inner: MockOrderService,
  risk: DeskRiskControls,
  dailyLossExceeded: () => boolean,
  getUser: () => User | null
): OrderPort {
  return {
    orders$: () => inner.orders$(),
    submit: (draft) => {
      const refusal = preTradeRefusal(risk, dailyLossExceeded)
      if (refusal !== null) return Promise.reject(new Error(refusal))
      return inner.submit(draft)
    },
    cancel: (orderId) => {
      // Ownership is enforced here, not only by the hidden button: a junior
      // must not be able to pull the desk's orders through the service either.
      const order = inner.snapshot.find((candidate) => candidate.id === orderId)
      if (order && isWorking(order) && !canCancel(getUser(), order.ownerId)) {
        return Promise.reject(new Error('You may only cancel your own orders'))
      }
      return inner.cancel(orderId)
    },
  }
}

function preTradeRefusal(risk: DeskRiskControls, dailyLossExceeded: () => boolean): string | null {
  const kill = risk.killSwitch
  if (kill.engaged) {
    return `Dealing halted — kill switch engaged by ${kill.engagedBy ?? 'risk control'}`
  }
  if (dailyLossExceeded()) {
    return 'Dealing halted — daily loss limit breached'
  }
  return null
}

/**
 * Reads session options from a URL query string:
 * `?feed=live&venue=binance&fresh=1`. Anything unrecognised falls back to the
 * deterministic demo.
 */
export function sessionOptionsFromSearch(search: string): CreateServicesOptions {
  const params = new URLSearchParams(search)
  const feed: FeedMode = params.get('feed') === 'live' ? 'live' : 'demo'
  const venue = params.get('venue')
  return {
    feed,
    fresh: params.get('fresh') === '1',
    ...(venue === null ? {} : { venue }),
  }
}
