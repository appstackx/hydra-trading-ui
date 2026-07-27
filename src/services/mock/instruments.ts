import type { CurrencyPair, Symbol_ } from '@/domain'

/**
 * A quoted instrument plus the parameters the simulator needs to price it.
 *
 * In a live deployment `CurrencyPair` comes from the venue's reference-data
 * service and the simulation fields simply do not exist.
 */
export interface InstrumentConfig extends CurrencyPair {
  /** Rate the session opens at, near mid-2026 levels. */
  readonly initialRate: number
  /** Per-tick standard deviation as a fraction of the rate. */
  readonly volatility: number
  /** Typical full bid/ask spread in pips. */
  readonly spreadPips: number
  /** Milliseconds between quotes. Majors update faster than crosses. */
  readonly tickIntervalMs: number
}

/**
 * G10 majors plus two crosses — enough breadth to exercise both 5-decimal and
 * 3-decimal (JPY) formatting, which is where rate-display bugs hide.
 */
export const INSTRUMENTS: readonly InstrumentConfig[] = [
  {
    symbol: 'EURUSD',
    base: 'EUR',
    terms: 'USD',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 1.0842,
    volatility: 0.00012,
    spreadPips: 0.8,
    tickIntervalMs: 320,
  },
  {
    symbol: 'GBPUSD',
    base: 'GBP',
    terms: 'USD',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 1.2718,
    volatility: 0.00016,
    spreadPips: 1.2,
    tickIntervalMs: 410,
  },
  {
    symbol: 'USDJPY',
    base: 'USD',
    terms: 'JPY',
    ratePrecision: 3,
    pipsPosition: 2,
    defaultNotional: 1_000_000,
    initialRate: 152.418,
    volatility: 0.00014,
    spreadPips: 1.0,
    tickIntervalMs: 360,
  },
  {
    symbol: 'AUDUSD',
    base: 'AUD',
    terms: 'USD',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 0.6584,
    volatility: 0.00019,
    spreadPips: 1.4,
    tickIntervalMs: 520,
  },
  {
    symbol: 'USDCHF',
    base: 'USD',
    terms: 'CHF',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 0.8931,
    volatility: 0.00013,
    spreadPips: 1.5,
    tickIntervalMs: 470,
  },
  {
    symbol: 'USDCAD',
    base: 'USD',
    terms: 'CAD',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 1.3612,
    volatility: 0.00015,
    spreadPips: 1.6,
    tickIntervalMs: 560,
  },
  {
    symbol: 'NZDUSD',
    base: 'NZD',
    terms: 'USD',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 0.6012,
    volatility: 0.00021,
    spreadPips: 1.9,
    tickIntervalMs: 640,
  },
  {
    symbol: 'EURGBP',
    base: 'EUR',
    terms: 'GBP',
    ratePrecision: 5,
    pipsPosition: 4,
    defaultNotional: 1_000_000,
    initialRate: 0.8524,
    volatility: 0.00011,
    spreadPips: 1.1,
    tickIntervalMs: 590,
  },
  {
    symbol: 'EURJPY',
    base: 'EUR',
    terms: 'JPY',
    ratePrecision: 3,
    pipsPosition: 2,
    defaultNotional: 1_000_000,
    initialRate: 165.246,
    volatility: 0.00018,
    spreadPips: 1.8,
    tickIntervalMs: 680,
  },
  {
    symbol: 'GBPJPY',
    base: 'GBP',
    terms: 'JPY',
    ratePrecision: 3,
    pipsPosition: 2,
    defaultNotional: 1_000_000,
    initialRate: 193.842,
    volatility: 0.00024,
    spreadPips: 2.4,
    tickIntervalMs: 720,
  },
] as const

/** Instruments shown as tiles on first load; the rest live in Live Rates. */
export const DEFAULT_TILE_SYMBOLS: readonly Symbol_[] = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCHF',
  'USDCAD',
]

export const INSTRUMENTS_BY_SYMBOL: Readonly<Record<Symbol_, InstrumentConfig>> =
  Object.fromEntries(INSTRUMENTS.map((instrument) => [instrument.symbol, instrument]))

export const CURRENCY_PAIRS: readonly CurrencyPair[] = INSTRUMENTS

export const CURRENCY_PAIRS_BY_SYMBOL: Readonly<Record<Symbol_, CurrencyPair>> =
  INSTRUMENTS_BY_SYMBOL
