import { useMemo } from 'react'
import { combineLatest, map, sampleTime, scan, startWith } from 'rxjs'
import type {
  ConnectionState,
  CurrencyPair,
  Order,
  Position,
  Price,
  Symbol_,
  Trade,
} from '@/domain'
import { calculatePositions, currencyExposures, totalPnl } from '@/domain'
import { useServices } from '@/app/ServicesContext'
import { useObservable } from './useObservable'

/* Stable identities so an empty result never re-renders a consumer. */
const NO_PRICES: Readonly<Record<Symbol_, Price>> = Object.freeze({})
const NO_TRADES: readonly Trade[] = Object.freeze([])
const NO_ORDERS: readonly Order[] = Object.freeze([])
const NO_POSITIONS: readonly Position[] = Object.freeze([])
const NO_HISTORY: readonly number[] = Object.freeze([])

const CONNECTING: ConnectionState = { status: 'connecting', latencyMs: 0, service: '—' }

/** Latest quote for one instrument; `undefined` until the first tick lands. */
export function usePrice(symbol: Symbol_): Price | undefined {
  const { marketData } = useServices()
  const stream = useMemo(() => marketData.prices$(symbol), [marketData, symbol])
  return useObservable<Price | undefined>(stream, undefined)
}

/** Every instrument's latest quote, keyed by symbol. */
export function useAllPrices(): Readonly<Record<Symbol_, Price>> {
  const { marketData } = useServices()
  const stream = useMemo(() => marketData.allPrices$(), [marketData])
  return useObservable(stream, NO_PRICES)
}

export function useConnection(): ConnectionState {
  const { marketData } = useServices()
  const stream = useMemo(() => marketData.connection$(), [marketData])
  return useObservable(stream, CONNECTING)
}

export function useCurrencyPairs(): readonly CurrencyPair[] {
  return useServices().marketData.currencyPairs
}

export function useCurrencyPair(symbol: Symbol_): CurrencyPair | undefined {
  const pairs = useCurrencyPairs()
  return useMemo(() => pairs.find((pair) => pair.symbol === symbol), [pairs, symbol])
}

export function useTrades(): readonly Trade[] {
  const { trades } = useServices()
  const stream = useMemo(() => trades.trades$(), [trades])
  return useObservable(stream, NO_TRADES)
}

export function useOrders(): readonly Order[] {
  const { orders } = useServices()
  const stream = useMemo(() => orders.orders$(), [orders])
  return useObservable(stream, NO_ORDERS)
}

/**
 * The position book, re-marked on every tick.
 *
 * `startWith` on the price stream means positions render from the trade history
 * immediately, with P&L filling in once the first quotes arrive, rather than
 * holding the whole panel blank until both streams have produced a value.
 */
export function usePositions(): readonly Position[] {
  const { marketData, trades } = useServices()
  const stream = useMemo(
    () =>
      combineLatest([trades.trades$(), marketData.allPrices$().pipe(startWith(NO_PRICES))]).pipe(
        map(([tradeList, prices]) => calculatePositions(tradeList, prices))
      ),
    [marketData, trades]
  )
  return useObservable(stream, NO_POSITIONS)
}

/** Per-currency net open position across the book. */
export function useCurrencyExposures(): ReturnType<typeof currencyExposures> {
  const positions = usePositions()
  const pairs = useCurrencyPairs()
  return useMemo(() => {
    const bySymbol = Object.fromEntries(pairs.map((pair) => [pair.symbol, pair]))
    return currencyExposures(positions, bySymbol)
  }, [positions, pairs])
}

/** Book-wide P&L in the reporting currency, re-marked on every tick. */
export function useTotalPnl(): ReturnType<typeof totalPnl> {
  const positions = usePositions()
  const prices = useAllPrices()
  const pairs = useCurrencyPairs()
  return useMemo(() => {
    const bySymbol = Object.fromEntries(pairs.map((pair) => [pair.symbol, pair]))
    return totalPnl(positions, bySymbol, prices)
  }, [positions, prices, pairs])
}

/**
 * Rolling P&L series for the analytics chart.
 *
 * `sampleTime` throttles a ~30 Hz aggregate feed down to one point every
 * `sampleMs`: plotting every tick would burn frames redrawing a line whose shape
 * does not visibly change.
 */
export function usePnlHistory(sampleMs = 1_200, size = 80): readonly number[] {
  const { marketData, trades } = useServices()

  const stream = useMemo(() => {
    const bySymbol = Object.fromEntries(marketData.currencyPairs.map((pair) => [pair.symbol, pair]))

    return combineLatest([trades.trades$(), marketData.allPrices$()]).pipe(
      map(
        ([tradeList, prices]) =>
          totalPnl(calculatePositions(tradeList, prices), bySymbol, prices).amount
      ),
      sampleTime(sampleMs),
      scan<number, number[]>((history, value) => [...history, value].slice(-size), []),
      startWith<number[]>([])
    )
  }, [marketData, trades, sampleMs, size])

  return useObservable<readonly number[]>(stream, NO_HISTORY)
}

/**
 * A rolling window of recent mids for one instrument, for sparklines.
 *
 * Held in the stream rather than component state so that scrolling a virtualised
 * grid does not reset the series a row has already accumulated.
 */
export function usePriceHistory(symbol: Symbol_, size = 40): readonly number[] {
  const { marketData } = useServices()
  const stream = useMemo(
    () =>
      marketData.prices$(symbol).pipe(
        scan<Price, number[]>((history, price) => [...history, price.mid].slice(-size), []),
        startWith<number[]>([])
      ),
    [marketData, symbol, size]
  )
  return useObservable<readonly number[]>(stream, NO_HISTORY)
}
