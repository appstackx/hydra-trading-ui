import type { CurrencyPair, Symbol_ } from '@/domain'

/**
 * Crypto instruments quoted by the live venues.
 *
 * `pipsPosition` equals `ratePrecision` here, which is the correct reading
 * rather than a fudge: a crypto pair's minimum increment *is* its tick, so one
 * "pip" is one tick. The same rate-splitting and spread arithmetic the FX tiles
 * use therefore works unchanged — which is the useful part of having put those
 * rules in the domain layer rather than in the components.
 */
export const LIVE_INSTRUMENTS: readonly CurrencyPair[] = [
  {
    symbol: 'BTCUSD',
    base: 'BTC',
    terms: 'USD',
    ratePrecision: 2,
    pipsPosition: 2,
    defaultNotional: 1,
  },
  {
    symbol: 'ETHUSD',
    base: 'ETH',
    terms: 'USD',
    ratePrecision: 2,
    pipsPosition: 2,
    defaultNotional: 10,
  },
  {
    symbol: 'SOLUSD',
    base: 'SOL',
    terms: 'USD',
    ratePrecision: 2,
    pipsPosition: 2,
    defaultNotional: 100,
  },
  {
    symbol: 'XRPUSD',
    base: 'XRP',
    terms: 'USD',
    ratePrecision: 4,
    pipsPosition: 4,
    defaultNotional: 10_000,
  },
  {
    symbol: 'LTCUSD',
    base: 'LTC',
    terms: 'USD',
    ratePrecision: 2,
    pipsPosition: 2,
    defaultNotional: 100,
  },
  {
    symbol: 'ADAUSD',
    base: 'ADA',
    terms: 'USD',
    ratePrecision: 4,
    pipsPosition: 4,
    defaultNotional: 10_000,
  },
]

export const LIVE_INSTRUMENTS_BY_SYMBOL: Readonly<Record<Symbol_, CurrencyPair>> =
  Object.fromEntries(LIVE_INSTRUMENTS.map((instrument) => [instrument.symbol, instrument]))

/** Instruments opened as tiles when the live feed is selected. */
export const DEFAULT_LIVE_TILE_SYMBOLS: readonly Symbol_[] = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'XRPUSD',
]
