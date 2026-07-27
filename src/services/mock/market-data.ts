import {
  concat,
  EMPTY,
  map,
  merge,
  type Observable,
  of,
  scan,
  shareReplay,
  Subject,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs'
import type { ConnectionState, Price, Symbol_ } from '@/domain'
import { movementOf, round } from '@/domain'
import type { MarketDataPort } from '../ports'
import { INSTRUMENTS, INSTRUMENTS_BY_SYMBOL, type InstrumentConfig } from './instruments'
import type { Random } from './random'

/** Name shown in the status bar; a licensee swaps this for their own venue. */
export const SERVICE_NAME = 'hydra-pricing'

/** Delay before the simulated transport reports itself connected. */
const HANDSHAKE_MS = 700
/** Interval between connection heartbeats. */
const HEARTBEAT_MS = 2_500
/** Pull back toward the opening rate each tick, so a long session stays realistic. */
const MEAN_REVERSION = 0.0008
/** Probability that a heartbeat reports a degraded link. */
const DEGRADED_PROBABILITY = 0.04

export interface MockMarketDataOptions {
  readonly random: Random
  readonly instruments?: readonly InstrumentConfig[]
  /** Injected clock. Overridden in tests to keep timestamps deterministic. */
  readonly now?: () => number
}

/**
 * A price feed that behaves like a real one: independent tick rates per
 * instrument, a mean-reverting random walk, jittered spreads and a transport
 * that occasionally degrades.
 *
 * It exists so the UI can be demonstrated, screenshotted and load-tested with no
 * venue connectivity at all — and so the same UI binary can be pointed at a real
 * feed by swapping this class for another {@link MarketDataPort}.
 */
export class MockMarketData implements MarketDataPort {
  readonly currencyPairs: readonly InstrumentConfig[]

  private readonly random: Random
  private readonly now: () => number
  private readonly destroy$ = new Subject<void>()
  private readonly streams = new Map<Symbol_, Observable<Price>>()
  private readonly configs: Readonly<Record<Symbol_, InstrumentConfig>>
  private allPrices: Observable<Readonly<Record<Symbol_, Price>>> | undefined
  private connection: Observable<ConnectionState> | undefined

  constructor(options: MockMarketDataOptions) {
    this.random = options.random
    this.now = options.now ?? Date.now
    this.currencyPairs = options.instruments ?? INSTRUMENTS
    this.configs = options.instruments
      ? Object.fromEntries(options.instruments.map((i) => [i.symbol, i]))
      : INSTRUMENTS_BY_SYMBOL
  }

  prices$(symbol: Symbol_): Observable<Price> {
    const cached = this.streams.get(symbol)
    if (cached) return cached

    const config = this.configs[symbol]
    // An unknown symbol is a caller bug, but returning EMPTY keeps a bad route
    // or stale bookmark from tearing down the whole app.
    if (!config) return EMPTY

    let mid = config.initialRate
    let previousMid: number | undefined

    const stream = timer(0, config.tickIntervalMs).pipe(
      map((tick) => {
        // The opening quote is published as-is. Stepping the walk before the
        // first emission would give it a direction it cannot have — there is no
        // previous quote to have moved from — and flash every tile on load.
        if (tick > 0) {
          previousMid = mid
          mid = this.nextMid(mid, config)
        }
        return this.quote(config, mid, previousMid)
      }),
      takeUntil(this.destroy$),
      // refCount stays false so the walk is continuous: a tile that unmounts and
      // remounts must not restart its instrument at the opening rate.
      shareReplay({ bufferSize: 1, refCount: false })
    )

    this.streams.set(symbol, stream)
    return stream
  }

  allPrices$(): Observable<Readonly<Record<Symbol_, Price>>> {
    this.allPrices ??= merge(
      ...this.currencyPairs.map((instrument) => this.prices$(instrument.symbol))
    ).pipe(
      // Emit from the first tick rather than waiting for every instrument, so
      // the grid fills in progressively instead of flashing empty.
      scan<Price, Record<Symbol_, Price>>(
        (accumulated, price) => ({ ...accumulated, [price.symbol]: price }),
        {}
      ),
      takeUntil(this.destroy$),
      shareReplay({ bufferSize: 1, refCount: false })
    )
    return this.allPrices
  }

  connection$(): Observable<ConnectionState> {
    this.connection ??= concat(
      of<ConnectionState>({ status: 'connecting', latencyMs: 0, service: SERVICE_NAME }),
      timer(HANDSHAKE_MS).pipe(
        switchMap(() => timer(0, HEARTBEAT_MS)),
        map((): ConnectionState => ({
          status: this.random.chance(DEGRADED_PROBABILITY) ? 'degraded' : 'connected',
          latencyMs: this.random.int(3, 24),
          service: SERVICE_NAME,
        }))
      )
    ).pipe(takeUntil(this.destroy$), shareReplay({ bufferSize: 1, refCount: false }))
    return this.connection
  }

  dispose(): void {
    this.destroy$.next()
    this.destroy$.complete()
    // Every cache is dropped together. Clearing only the per-symbol map would
    // leave the two aggregate streams cached in a completed state, so anything
    // that resubscribed would silently receive one replayed value and nothing
    // more.
    this.streams.clear()
    this.allPrices = undefined
    this.connection = undefined
  }

  /** One step of a mean-reverting random walk, rounded to the pair's precision. */
  private nextMid(mid: number, config: InstrumentConfig): number {
    const reversion = (config.initialRate - mid) * MEAN_REVERSION
    const shock = mid * config.volatility * this.random.gaussian()
    return round(mid + reversion + shock, config.ratePrecision)
  }

  /** Wraps a mid in a two-way price, widening the spread now and then. */
  private quote(config: InstrumentConfig, mid: number, previousMid: number | undefined): Price {
    const spread = config.spreadPips * this.random.between(0.85, 1.45)
    const halfSpread = spread / 2 / 10 ** config.pipsPosition

    return {
      symbol: config.symbol,
      bid: round(mid - halfSpread, config.ratePrecision),
      ask: round(mid + halfSpread, config.ratePrecision),
      mid,
      timestamp: this.now(),
      movement: movementOf(mid, previousMid),
    }
  }
}
