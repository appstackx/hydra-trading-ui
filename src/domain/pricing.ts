import type { CurrencyPair, Direction, Price, PriceMovement } from './types'

/**
 * A rate broken into the three parts a trading tile renders at different sizes:
 * `1.08` `42` `3` — big figure, pips, fractional pip.
 */
export interface RateParts {
  readonly bigFigure: string
  readonly pips: string
  readonly fraction: string
}

/**
 * Splits a rate for display. The pip digits are the pair's `pipsPosition`-th and
 * preceding decimal; everything before them is the big figure and everything
 * after is the fractional pip.
 *
 * @example splitRate(1.08423, eurusd) // { bigFigure: '1.08', pips: '42', fraction: '3' }
 * @example splitRate(157.482, usdjpy) // { bigFigure: '157.', pips: '48', fraction: '2' }
 */
export function splitRate(rate: number, pair: CurrencyPair): RateParts {
  const fixed = rate.toFixed(pair.ratePrecision)
  const [whole = '0', decimals = ''] = fixed.split('.')

  // Digits of the decimal part that belong to the big figure, i.e. everything
  // ahead of the two pip digits.
  const bigFigureDecimals = Math.max(0, pair.pipsPosition - 2)

  return {
    bigFigure: `${whole}.${decimals.slice(0, bigFigureDecimals)}`,
    pips: decimals.slice(bigFigureDecimals, bigFigureDecimals + 2),
    fraction: decimals.slice(bigFigureDecimals + 2),
  }
}

/** Multiplier that converts a rate delta into pips for the given pair. */
export function pipFactor(pair: CurrencyPair): number {
  return 10 ** pair.pipsPosition
}

/** Converts a raw rate difference into pips, e.g. 0.00012 EURUSD -> 1.2 pips. */
export function toPips(rateDelta: number, pair: CurrencyPair): number {
  return rateDelta * pipFactor(pair)
}

/**
 * Bid/ask spread expressed in pips, rounded to one decimal — the precision a
 * spread is quoted at on every desk.
 */
export function spreadInPips(price: Pick<Price, 'bid' | 'ask'>, pair: CurrencyPair): number {
  return round(toPips(price.ask - price.bid, pair), 1)
}

/** The rate a client gets when trading in `direction`: they cross the spread. */
export function rateForDirection(price: Pick<Price, 'bid' | 'ask'>, direction: Direction): number {
  return direction === 'Buy' ? price.ask : price.bid
}

/** Classifies a tick against the previous mid, for the tile's flash animation. */
export function movementOf(currentMid: number, previousMid: number | undefined): PriceMovement {
  if (previousMid === undefined || currentMid === previousMid) return 'none'
  return currentMid > previousMid ? 'up' : 'down'
}

/**
 * Rounds to `dp` decimal places, correcting for the float representation error
 * that makes naive `Math.round(x * 100) / 100` return 1.0049999 for 1.005.
 */
export function round(value: number, dp: number): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** dp
  return Math.round((value + Number.EPSILON * Math.sign(value) * Math.abs(value)) * factor) / factor
}

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
