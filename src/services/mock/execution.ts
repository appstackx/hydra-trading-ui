import type { Price, Symbol_, Trade } from '@/domain'
import { rateForDirection, spotValueDate } from '@/domain'
import type { ExecutionPort, ExecutionRequest, ExecutionResult } from '../ports'
import { INSTRUMENTS_BY_SYMBOL } from './instruments'
import type { Random } from './random'

/** Baseline probability that the venue rejects an otherwise valid ticket. */
const REJECTION_PROBABILITY = 0.06
/**
 * How far the market may move from the clicked rate before it is stale, in
 * basis points.
 *
 * Deliberately not pips: a pip is worth wildly different amounts across asset
 * classes — six pips is half a basis point on EURUSD and six cents on Bitcoin —
 * so a pip-denominated tolerance rejects almost every crypto ticket. Basis
 * points are proportional and port across everything the UI quotes.
 */
const STALE_PRICE_TOLERANCE_BPS = 5
/** Notional above which the simulated credit line refuses the ticket. */
const CREDIT_LIMIT = 50_000_000

const GENERIC_REJECTIONS = [
  'Venue rejected — insufficient liquidity at size',
  'Counterparty declined the request',
  'Request timed out at the liquidity provider',
] as const

export interface MockExecutionOptions {
  readonly random: Random
  /** Latest quote per symbol, used for the stale-price check. */
  readonly getPrice: (symbol: Symbol_) => Price | undefined
  readonly now?: () => number
  /** Injected so tests resolve instantly instead of waiting on real timers. */
  readonly delay?: (ms: number) => Promise<void>
  readonly trader?: string
  /** Resolves the trader per ticket, so the blotter names the signed-in user. */
  readonly getTrader?: () => string | undefined
  /** Last trade sequence already used, so restored ids are never reissued. */
  readonly startSequence?: number
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Simulated execution venue.
 *
 * Round-trip latency, stale-price rejects, credit limits and random venue
 * declines are all modelled, because "what does the tile do when the trade is
 * rejected?" is the first question anyone evaluating a trading UI asks.
 */
export class MockExecution implements ExecutionPort {
  private sequence: number

  private readonly random: Random
  private readonly getPrice: (symbol: Symbol_) => Price | undefined
  private readonly now: () => number
  private readonly delay: (ms: number) => Promise<void>
  private readonly trader: string
  private readonly getTrader: (() => string | undefined) | undefined

  constructor(options: MockExecutionOptions) {
    this.random = options.random
    this.getPrice = options.getPrice
    this.now = options.now ?? Date.now
    this.delay = options.delay ?? wait
    this.trader = options.trader ?? 'AXDEMO'
    this.getTrader = options.getTrader
    this.sequence = options.startSequence ?? 0
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // Captured before the simulated round trip: the ticket belongs to whoever
    // sent it, not to whoever is signed in when the response lands.
    const trader = this.getTrader?.() ?? this.trader

    await this.delay(this.random.int(140, 520))

    const tradeDate = this.now()
    const rejection = this.rejectionFor(request)

    const trade: Trade = {
      id: this.nextId(),
      symbol: request.symbol,
      direction: request.direction,
      notional: request.notional,
      rate: request.rate,
      tradeDate,
      valueDate: spotValueDate(tradeDate),
      status: rejection === undefined ? 'Done' : 'Rejected',
      trader,
      dealtCurrency: INSTRUMENTS_BY_SYMBOL[request.symbol]?.base ?? request.symbol.slice(0, 3),
      ...(rejection === undefined ? {} : { rejectionReason: rejection }),
    }

    return rejection === undefined
      ? { kind: 'done', trade }
      : { kind: 'rejected', trade, reason: rejection }
  }

  /** Returns a rejection reason, or `undefined` when the ticket should deal. */
  private rejectionFor(request: ExecutionRequest): string | undefined {
    if (request.notional > CREDIT_LIMIT) {
      return `Notional exceeds the ${CREDIT_LIMIT.toLocaleString('en-GB')} credit line`
    }

    const price = this.getPrice(request.symbol)

    if (price && request.rate > 0) {
      const current = rateForDirection(price, request.direction)
      const driftBps = Math.abs((current - request.rate) / request.rate) * 10_000
      if (driftBps > STALE_PRICE_TOLERANCE_BPS) {
        return `Price moved ${driftBps.toFixed(1)} bps before the trade reached the venue`
      }
    }

    return this.random.chance(REJECTION_PROBABILITY)
      ? this.random.pick(GENERIC_REJECTIONS)
      : undefined
  }

  private nextId(): string {
    this.sequence += 1
    return `TRD-${String(this.sequence).padStart(6, '0')}`
  }
}
