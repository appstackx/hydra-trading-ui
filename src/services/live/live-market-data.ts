import { BehaviorSubject, map, Observable, shareReplay, Subject, takeUntil } from 'rxjs'
import type { ConnectionState, CurrencyPair, Price, Symbol_ } from '@/domain'
import { movementOf, round } from '@/domain'
import type { MarketDataPort } from '../ports'
import { LIVE_INSTRUMENTS, LIVE_INSTRUMENTS_BY_SYMBOL } from './instruments'
import { DEFAULT_VENUE, type LiveVenue } from './venues'

/** The slice of the WebSocket API this adapter uses, so tests can supply their own. */
export interface WebSocketLike {
  send(data: string): void
  close(): void
  onopen: ((event: unknown) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
}

export type WebSocketFactory = (url: string) => WebSocketLike

/** First reconnect delay. Doubles on each failure. */
const BASE_RECONNECT_MS = 1_000
/** Ceiling on the backoff, so a long outage still retries twice a minute. */
const MAX_RECONNECT_MS = 30_000
/** Silence after which a connected feed is reported as degraded. */
const STALE_AFTER_MS = 20_000
/** How often the staleness check runs. */
const HEALTH_INTERVAL_MS = 2_000

export interface LiveMarketDataOptions {
  readonly venue?: LiveVenue
  readonly instruments?: readonly CurrencyPair[]
  readonly createSocket?: WebSocketFactory
  readonly now?: () => number
}

/**
 * A `MarketDataPort` backed by a real venue's public price stream.
 *
 * This exists to make one claim checkable rather than merely asserted: the UI
 * depends on the port and nothing else, so swapping a simulated feed for a live
 * exchange changes this file and the composition root, and no component above.
 *
 * Prices are real. Execution is not — the demo never sends an order anywhere.
 */
export class LiveMarketData implements MarketDataPort {
  readonly currencyPairs: readonly CurrencyPair[]

  private readonly venue: LiveVenue
  private readonly createSocket: WebSocketFactory
  private readonly now: () => number
  private readonly destroy$ = new Subject<void>()

  private readonly quotes = new BehaviorSubject<Readonly<Record<Symbol_, Price>>>({})
  private readonly connection: BehaviorSubject<ConnectionState>
  private readonly streams = new Map<Symbol_, Observable<Price>>()

  private socket: WebSocketLike | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private healthTimer: ReturnType<typeof setInterval> | undefined
  private reconnectAttempt = 0
  private lastMessageAt = 0
  private connectedAt = 0
  private disposed = false

  constructor(options: LiveMarketDataOptions = {}) {
    this.venue = options.venue ?? DEFAULT_VENUE
    this.currencyPairs = options.instruments ?? LIVE_INSTRUMENTS
    this.now = options.now ?? Date.now
    this.createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike)

    this.connection = new BehaviorSubject<ConnectionState>({
      status: 'connecting',
      latencyMs: 0,
      service: this.venue.name,
    })
  }

  /** Opens the socket and starts the health check. Idempotent. */
  connect(): void {
    if (this.disposed || this.socket) return
    this.open()
    this.healthTimer ??= setInterval(() => {
      this.checkHealth()
    }, HEALTH_INTERVAL_MS)
  }

  prices$(symbol: Symbol_): Observable<Price> {
    const cached = this.streams.get(symbol)
    if (cached) return cached

    const stream = this.quotes.pipe(
      map((prices) => prices[symbol]),
      // `filter` cannot narrow the type here without a predicate, and the
      // stream must only ever carry real quotes.
      filterDefined(),
      takeUntil(this.destroy$),
      shareReplay({ bufferSize: 1, refCount: false })
    )

    this.streams.set(symbol, stream)
    return stream
  }

  allPrices$(): Observable<Readonly<Record<Symbol_, Price>>> {
    return this.quotes.asObservable()
  }

  connection$(): Observable<ConnectionState> {
    return this.connection.asObservable()
  }

  dispose(): void {
    this.disposed = true
    this.destroy$.next()
    this.destroy$.complete()
    this.clearReconnect()
    if (this.healthTimer !== undefined) {
      clearInterval(this.healthTimer)
      this.healthTimer = undefined
    }
    this.closeSocket()
    this.streams.clear()
    this.quotes.complete()
    this.connection.complete()
  }

  private open(): void {
    const symbols = this.currencyPairs.map((pair) => pair.symbol)

    let socket: WebSocketLike
    try {
      socket = this.createSocket(this.venue.url(symbols))
    } catch {
      // A URL the browser refuses is a permanent failure for this attempt, but
      // the venue may still come back, so it is retried like any other.
      this.scheduleReconnect()
      return
    }

    this.socket = socket

    socket.onopen = () => {
      this.reconnectAttempt = 0
      this.connectedAt = this.now()
      this.lastMessageAt = this.now()
      const frame = this.venue.subscribeFrame?.(symbols)
      if (frame !== undefined) socket.send(JSON.stringify(frame))
      this.publishConnection('connected')
    }

    socket.onmessage = (event) => {
      this.handleMessage(event.data)
    }

    socket.onerror = () => {
      // `onclose` always follows, and that is where reconnection is driven from.
      this.publishConnection('degraded')
    }

    socket.onclose = () => {
      this.socket = undefined
      if (this.disposed) return
      this.publishConnection('disconnected')
      this.scheduleReconnect()
    }
  }

  private handleMessage(data: unknown): void {
    this.lastMessageAt = this.now()

    let frame: unknown
    try {
      frame = typeof data === 'string' ? JSON.parse(data) : data
    } catch {
      // Venues occasionally send heartbeats or non-JSON control frames.
      return
    }

    const quote = this.venue.parse(frame)
    if (!quote) return

    const instrument = LIVE_INSTRUMENTS_BY_SYMBOL[quote.symbol]
    if (!instrument) return

    // A crossed or zero book is bad data, not a tradable price.
    if (!(quote.bid > 0) || !(quote.ask > 0) || quote.ask < quote.bid) return

    const previous = this.quotes.value[quote.symbol]
    const mid = round((quote.bid + quote.ask) / 2, instrument.ratePrecision)

    const price: Price = {
      symbol: quote.symbol,
      bid: round(quote.bid, instrument.ratePrecision),
      ask: round(quote.ask, instrument.ratePrecision),
      mid,
      timestamp: this.now(),
      movement: movementOf(mid, previous?.mid),
    }

    this.quotes.next({ ...this.quotes.value, [quote.symbol]: price })

    if (this.connection.value.status !== 'connected') {
      this.publishConnection('connected')
    }
  }

  /**
   * A socket that is open but silent is the dangerous state — the UI would keep
   * showing a price nobody is standing behind. It is reported as degraded so
   * the status bar can say so.
   */
  private checkHealth(): void {
    if (this.connection.value.status !== 'connected') return
    if (this.now() - this.lastMessageAt <= STALE_AFTER_MS) return
    this.publishConnection('degraded')
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== undefined) return

    const backoff = Math.min(
      MAX_RECONNECT_MS,
      BASE_RECONNECT_MS * 2 ** Math.min(this.reconnectAttempt, 10)
    )
    this.reconnectAttempt += 1

    this.publishConnection('connecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (!this.disposed) this.open()
    }, backoff)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private closeSocket(): void {
    const socket = this.socket
    this.socket = undefined
    if (!socket) return
    socket.onopen = null
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    try {
      socket.close()
    } catch {
      // Closing an already-dead socket is not an error worth surfacing.
    }
  }

  private publishConnection(status: ConnectionState['status']): void {
    if (this.connection.closed) return
    this.connection.next({
      status,
      // Time to first message stands in for latency: a public feed gives no
      // round trip to measure, and pretending otherwise would be a fiction.
      latencyMs: status === 'connected' ? Math.max(0, this.lastMessageAt - this.connectedAt) : 0,
      service: this.venue.name,
    })
  }
}

/** Drops `undefined` from a stream and narrows the type accordingly. */
function filterDefined<T>() {
  return (source: Observable<T | undefined>): Observable<T> =>
    new Observable<T>((subscriber) =>
      source.subscribe({
        next: (value) => {
          if (value !== undefined) subscriber.next(value)
        },
        error: (error: unknown) => subscriber.error(error),
        complete: () => subscriber.complete(),
      })
    )
}
