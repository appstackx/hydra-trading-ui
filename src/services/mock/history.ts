import type { Trade } from '@/domain'
import { round, spotValueDate } from '@/domain'
import { INSTRUMENTS, type InstrumentConfig } from './instruments'
import type { Random } from './random'

/** Ticket sizes a spot desk actually deals in. */
const NOTIONAL_LADDER = [250_000, 500_000, 750_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000]

const TRADERS = ['AXDEMO', 'J.OKONKWO', 'R.SHARMA', 'M.LINDQVIST', 'T.NAKAMURA'] as const

const REJECTION_REASONS = [
  'Counterparty declined the request',
  'Price moved before the trade reached the venue',
  'Venue rejected — insufficient liquidity at size',
] as const

/** Share of historic tickets that came back rejected. */
const REJECTION_RATE = 0.08

export interface TradeHistoryOptions {
  readonly random: Random
  /** End of the generated window — normally "now". */
  readonly until: number
  readonly count?: number
  /** How far back the history reaches, in milliseconds. */
  readonly spanMs?: number
  readonly instruments?: readonly InstrumentConfig[]
}

/**
 * Builds a plausible session of past trades.
 *
 * Without it the blotter, the position book and the P&L chart all open empty,
 * which makes an otherwise finished UI look unfinished in the first ten seconds
 * of a demo. Deterministic for a given seed.
 */
export function generateTradeHistory(options: TradeHistoryOptions): Trade[] {
  const {
    random,
    until,
    count = 24,
    spanMs = 6 * 60 * 60 * 1000,
    instruments = INSTRUMENTS,
  } = options

  const trades: Trade[] = []

  for (let index = 0; index < count; index += 1) {
    const instrument = random.pick(instruments)
    // Oldest first, with jitter, so timestamps are ordered but not uniform.
    const progress = (index + random.between(-0.4, 0.4)) / count
    const tradeDate = Math.round(until - spanMs * (1 - progress))

    const rejected = random.chance(REJECTION_RATE)
    const rate = round(
      instrument.initialRate * (1 + random.gaussian() * 0.0015),
      instrument.ratePrecision
    )

    trades.push({
      id: `HST-${String(index + 1).padStart(6, '0')}`,
      symbol: instrument.symbol,
      direction: random.chance(0.5) ? 'Buy' : 'Sell',
      notional: random.pick(NOTIONAL_LADDER),
      rate,
      tradeDate,
      valueDate: spotValueDate(tradeDate),
      status: rejected ? 'Rejected' : 'Done',
      trader: random.pick(TRADERS),
      dealtCurrency: instrument.base,
      ...(rejected ? { rejectionReason: random.pick(REJECTION_REASONS) } : {}),
    })
  }

  return trades.sort((a, b) => b.tradeDate - a.tradeDate)
}
