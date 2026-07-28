import type { Symbol_ } from '@/domain'

/** A two-way quote as it arrives off the wire, before it becomes a `Price`. */
export interface VenueQuote {
  readonly symbol: Symbol_
  readonly bid: number
  readonly ask: number
}

/**
 * Everything venue-specific about a streaming price source.
 *
 * Each venue is a URL, an optional subscribe frame and a parser. That is the
 * whole surface — which is the point being demonstrated: adding a new price
 * source is roughly thirty lines and touches no component.
 */
export interface LiveVenue {
  readonly id: string
  /** Shown in the status bar. */
  readonly name: string
  /** Canonical symbols this venue quotes, e.g. `BTCUSD`. */
  readonly symbols: readonly Symbol_[]
  /** Socket endpoint. Some venues encode the subscription in the URL. */
  url(symbols: readonly Symbol_[]): string
  /** Frame to send on open, or `undefined` when the URL carries it. */
  subscribeFrame?(symbols: readonly Symbol_[]): unknown
  /** Turns one inbound frame into a quote, or `null` if it is not a quote. */
  parse(frame: unknown): VenueQuote | null
}

const CRYPTO_SYMBOLS: readonly Symbol_[] = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'XRPUSD',
  'LTCUSD',
  'ADAUSD',
]

/** `BTCUSD` -> `BTC`. Canonical symbols are always a 3-letter base plus USD. */
const baseOf = (symbol: Symbol_): string => symbol.slice(0, symbol.length - 3)

/**
 * Narrows an unknown frame to a record without asserting, so a malformed or
 * hostile payload cannot crash the feed.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/** Parses a numeric field that the venue sends as a string. */
function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Coinbase Exchange public market data.
 *
 * No credentials and no entitlement, which is exactly why it is the default:
 * anyone can open the demo and watch a real venue tick. The `ticker` channel
 * publishes on trades, so quiet instruments update less often than busy ones —
 * realistic, and worth seeing.
 */
export const COINBASE: LiveVenue = {
  id: 'coinbase',
  name: 'coinbase-exchange',
  symbols: CRYPTO_SYMBOLS,
  url: () => 'wss://ws-feed.exchange.coinbase.com',
  subscribeFrame: (symbols) => ({
    type: 'subscribe',
    product_ids: symbols.map((symbol) => `${baseOf(symbol)}-USD`),
    channels: ['ticker'],
  }),
  parse: (frame) => {
    const message = asRecord(frame)
    if (!message || message.type !== 'ticker') return null

    const productId = message.product_id
    if (typeof productId !== 'string') return null

    const bid = numberFrom(message.best_bid)
    const ask = numberFrom(message.best_ask)
    // A ticker without both sides is not dealable, so it is not a quote.
    if (bid === null || ask === null) return null

    return { symbol: productId.replace('-', ''), bid, ask }
  },
}

/**
 * Binance combined `bookTicker` streams.
 *
 * Publishes on every change to the top of book rather than on trades, so it is
 * considerably livelier than Coinbase. Quotes are against USDT, which is
 * normalised to USD so both venues share one canonical symbol.
 */
export const BINANCE: LiveVenue = {
  id: 'binance',
  name: 'binance-spot',
  symbols: CRYPTO_SYMBOLS,
  url: (symbols) => {
    const streams = symbols
      .map((symbol) => `${baseOf(symbol).toLowerCase()}usdt@bookTicker`)
      .join('/')
    return `wss://stream.binance.com:9443/stream?streams=${streams}`
  },
  parse: (frame) => {
    const envelope = asRecord(frame)
    const data = asRecord(envelope?.data)
    if (!data) return null

    const venueSymbol = data.s
    if (typeof venueSymbol !== 'string') return null

    const bid = numberFrom(data.b)
    const ask = numberFrom(data.a)
    if (bid === null || ask === null) return null

    // BTCUSDT -> BTCUSD. The demo treats the stablecoin as the dollar.
    return { symbol: venueSymbol.replace(/USDT$/, 'USD'), bid, ask }
  },
}

export const VENUES: Readonly<Record<string, LiveVenue>> = {
  [COINBASE.id]: COINBASE,
  [BINANCE.id]: BINANCE,
}

export const DEFAULT_VENUE = COINBASE

/** Resolves a venue by id, falling back to the default for anything unknown. */
export function venueFor(id: string | null | undefined): LiveVenue {
  if (!id) return DEFAULT_VENUE
  return VENUES[id] ?? DEFAULT_VENUE
}
