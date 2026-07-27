import type { CurrencyExposure, CurrencyPair, Position, Price, Symbol_, Trade } from './types'
import { round } from './pricing'

/** A position with no open quantity and no history. */
export function flatPosition(symbol: Symbol_): Position {
  return {
    symbol,
    netQuantity: 0,
    averageRate: 0,
    realisedPnl: 0,
    unrealisedPnl: 0,
    totalPnl: 0,
  }
}

const signedQuantity = (trade: Trade): number =>
  trade.direction === 'Buy' ? trade.notional : -trade.notional

/**
 * Folds one trade into a position using weighted-average cost basis.
 *
 * Adding to a position re-weights the average rate. Trading against it
 * crystallises P&L on the closed portion at the difference between the deal
 * rate and the average rate; any excess quantity opens a fresh position on the
 * other side at the deal rate.
 *
 * `unrealisedPnl` and `totalPnl` are left untouched here — they depend on a
 * live mark, which is applied by {@link markToMarket}.
 */
export function accumulateTrade(position: Position, trade: Trade): Position {
  const incoming = signedQuantity(trade)
  const net = position.netQuantity
  const isOpening = net === 0 || Math.sign(net) === Math.sign(incoming)

  if (isOpening) {
    const newQuantity = net + incoming
    return {
      ...position,
      netQuantity: newQuantity,
      // Weight by absolute size: sign cancels out and would corrupt the average.
      averageRate:
        newQuantity === 0
          ? 0
          : (Math.abs(net) * position.averageRate + Math.abs(incoming) * trade.rate) /
            (Math.abs(net) + Math.abs(incoming)),
    }
  }

  const closedQuantity = Math.min(Math.abs(incoming), Math.abs(net))
  // A long crystallises profit when it sells above its average, a short when it
  // buys below — which `Math.sign(net)` expresses in one term.
  const realised = closedQuantity * (trade.rate - position.averageRate) * Math.sign(net)
  const newQuantity = net + incoming

  let averageRate: number
  if (newQuantity === 0) {
    averageRate = 0
  } else if (Math.sign(newQuantity) === Math.sign(net)) {
    averageRate = position.averageRate // partial close, remaining lot unchanged
  } else {
    averageRate = trade.rate // flipped side, the residual opens at the deal rate
  }

  return {
    ...position,
    netQuantity: newQuantity,
    averageRate,
    realisedPnl: position.realisedPnl + realised,
  }
}

/**
 * Applies a live mark to an open position. P&L is expressed in the pair's terms
 * currency and marked at the mid — the convention used for indicative blotter
 * P&L, as opposed to the bid/ask mark used for a firm liquidation value.
 */
export function markToMarket(position: Position, mid: number | undefined): Position {
  const unrealisedPnl =
    mid === undefined || position.netQuantity === 0
      ? 0
      : position.netQuantity * (mid - position.averageRate)

  return {
    ...position,
    unrealisedPnl,
    totalPnl: position.realisedPnl + unrealisedPnl,
  }
}

/**
 * Builds the full position book from a trade history and the current market.
 *
 * Only `Done` trades count: `Pending` has not dealt yet and `Rejected` never
 * will. Trades are applied in chronological order so that the average rate
 * reflects the real sequence regardless of how the caller sorted the blotter.
 */
export function calculatePositions(
  trades: readonly Trade[],
  prices: Readonly<Record<Symbol_, Price>>
): Position[] {
  const chronological = [...trades]
    .filter((trade) => trade.status === 'Done')
    .sort((a, b) => a.tradeDate - b.tradeDate)

  const book = new Map<Symbol_, Position>()

  for (const trade of chronological) {
    const current = book.get(trade.symbol) ?? flatPosition(trade.symbol)
    book.set(trade.symbol, accumulateTrade(current, trade))
  }

  return [...book.values()]
    .map((position) => markToMarket(position, prices[position.symbol]?.mid))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/**
 * Nets every open position down to per-currency exposure — the desk's NOP.
 *
 * A long of 1m EURUSD at 1.08 is +1,000,000 EUR and -1,080,000 USD; summing
 * those legs across the book shows which currencies the desk is actually
 * carrying risk in.
 */
export function currencyExposures(
  positions: readonly Position[],
  pairs: Readonly<Record<Symbol_, CurrencyPair>>
): CurrencyExposure[] {
  const exposure = new Map<string, number>()

  const add = (currency: string, amount: number): void => {
    exposure.set(currency, (exposure.get(currency) ?? 0) + amount)
  }

  for (const position of positions) {
    const pair = pairs[position.symbol]
    if (!pair || position.netQuantity === 0) continue
    add(pair.base, position.netQuantity)
    add(pair.terms, -position.netQuantity * position.averageRate)
  }

  return [...exposure.entries()]
    .map(([currency, amount]) => ({ currency, amount: round(amount, 2) }))
    .filter(({ amount }) => amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}

/** Reporting currency every P&L figure in the UI is normalised to. */
export const REPORTING_CURRENCY = 'USD'

/**
 * Converts an amount from `currency` into {@link REPORTING_CURRENCY} using the
 * live market, trying the direct pair (`USDxxx`) then the inverse (`xxxUSD`).
 *
 * Returns `undefined` when neither leg is quoted, so callers can surface the gap
 * rather than silently reporting an unconverted figure as dollars.
 */
export function convertToReportingCurrency(
  amount: number,
  currency: string,
  prices: Readonly<Record<Symbol_, Price>>
): number | undefined {
  if (currency === REPORTING_CURRENCY) return amount

  const direct = prices[`${REPORTING_CURRENCY}${currency}`]
  if (direct && direct.mid !== 0) return amount / direct.mid

  const inverse = prices[`${currency}${REPORTING_CURRENCY}`]
  if (inverse) return amount * inverse.mid

  return undefined
}

export interface PnlSummary {
  /** Realised plus unrealised, in {@link REPORTING_CURRENCY}. */
  readonly amount: number
  readonly realised: number
  readonly unrealised: number
  /** Symbols left out because their terms currency could not be converted. */
  readonly unconvertible: Symbol_[]
}

/**
 * Sums the book's P&L in {@link REPORTING_CURRENCY}.
 *
 * A book holding both EURUSD and USDJPY has P&L in dollars and in yen. Adding
 * those raw numbers is the classic mistake this function exists to prevent:
 * every leg is converted first, and anything that cannot be converted is
 * excluded and named rather than quietly counted as dollars.
 */
export function totalPnl(
  positions: readonly Position[],
  pairs: Readonly<Record<Symbol_, CurrencyPair>>,
  prices: Readonly<Record<Symbol_, Price>>
): PnlSummary {
  let realised = 0
  let unrealised = 0
  const unconvertible: Symbol_[] = []

  for (const position of positions) {
    const pair = pairs[position.symbol]
    const realisedUsd = pair
      ? convertToReportingCurrency(position.realisedPnl, pair.terms, prices)
      : undefined
    const unrealisedUsd = pair
      ? convertToReportingCurrency(position.unrealisedPnl, pair.terms, prices)
      : undefined

    if (realisedUsd === undefined || unrealisedUsd === undefined) {
      unconvertible.push(position.symbol)
      continue
    }

    realised += realisedUsd
    unrealised += unrealisedUsd
  }

  return { amount: realised + unrealised, realised, unrealised, unconvertible }
}
