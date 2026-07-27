import { BehaviorSubject, type Observable, type Subscription } from 'rxjs'
import type { Order, OrderDraft, Price, Symbol_, Trade } from '@/domain'
import {
  applyFill,
  cancelOrder,
  fillRate,
  isFillable,
  isWorking,
  remainingQuantity,
  spotValueDate,
  validateOrderDraft,
} from '@/domain'
import type { MarketDataPort, OrderPort } from '../ports'
import { INSTRUMENTS_BY_SYMBOL } from './instruments'

/** Orders at or below this size fill in one clip. */
const FULL_FILL_THRESHOLD = 5_000_000
/** Clips a larger order is worked in, so partial fills are visible in the UI. */
const SLICE_COUNT = 3

export interface MockOrderServiceOptions {
  readonly marketData: MarketDataPort
  /** Called for every fill so the blotter and the position book stay in step. */
  readonly onFill: (trade: Trade) => void
  readonly now?: () => number
  readonly trader?: string
}

/**
 * A minimal order management service: working limit orders, market orders,
 * partial fills on size, and time-in-force handling.
 *
 * Matching runs off the same price stream the tiles render, so an order visibly
 * fills at the moment the market prints through its limit — which is the point
 * being demonstrated.
 */
export class MockOrderService implements OrderPort {
  private readonly subject = new BehaviorSubject<readonly Order[]>([])
  private readonly marketData: MarketDataPort
  private readonly onFill: (trade: Trade) => void
  private readonly now: () => number
  private readonly trader: string

  private subscription: Subscription | undefined
  private orderSequence = 0
  private fillSequence = 0

  constructor(options: MockOrderServiceOptions) {
    this.marketData = options.marketData
    this.onFill = options.onFill
    this.now = options.now ?? Date.now
    this.trader = options.trader ?? 'AXDEMO'
  }

  /** Begins matching. Idempotent, so a double-start cannot double-fill. */
  start(): void {
    this.subscription ??= this.marketData.allPrices$().subscribe((prices) => {
      this.match(prices)
    })
  }

  orders$(): Observable<readonly Order[]> {
    return this.subject.asObservable()
  }

  get snapshot(): readonly Order[] {
    return this.subject.value
  }

  submit(draft: OrderDraft): Promise<Order> {
    const errors = validateOrderDraft(draft)
    const firstError = Object.values(errors)[0]
    if (firstError !== undefined) {
      return Promise.reject(new Error(firstError))
    }

    const at = this.now()
    this.orderSequence += 1

    const order: Order = {
      id: `ORD-${String(this.orderSequence).padStart(6, '0')}`,
      symbol: draft.symbol,
      direction: draft.direction,
      orderType: draft.orderType,
      quantity: draft.quantity,
      filledQuantity: 0,
      averageFillPrice: 0,
      status: 'Working',
      timeInForce: draft.timeInForce,
      createdAt: at,
      updatedAt: at,
      ...(draft.limitPrice === undefined ? {} : { limitPrice: draft.limitPrice }),
    }

    this.subject.next([order, ...this.subject.value])
    return Promise.resolve(order)
  }

  cancel(orderId: string): Promise<void> {
    const at = this.now()
    this.subject.next(
      this.subject.value.map((order) => (order.id === orderId ? cancelOrder(order, at) : order))
    )
    return Promise.resolve()
  }

  dispose(): void {
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.subject.complete()
  }

  /** Walks the working book against a market snapshot, one pass per tick. */
  private match(prices: Readonly<Record<Symbol_, Price>>): void {
    const working = this.subject.value.filter(isWorking)
    if (working.length === 0) return

    const fills: Trade[] = []
    const at = this.now()

    const next = this.subject.value.map((order) => {
      if (!isWorking(order)) return order

      const price = prices[order.symbol]
      if (!price) return order

      if (!isFillable(order, price)) {
        // An order that demands immediate execution does not rest on the book.
        return order.timeInForce === 'IOC' || order.timeInForce === 'FOK'
          ? cancelOrder(order, at)
          : order
      }

      const rate = fillRate(order, price)
      const clip = this.clipSize(order)
      // Fill-or-kill is all-or-nothing, so it ignores the slicing schedule.
      const quantity = order.timeInForce === 'FOK' ? remainingQuantity(order) : clip
      const filled = applyFill(order, quantity, rate, at)

      if (filled.filledQuantity > order.filledQuantity) {
        fills.push(this.tradeFor(order, filled.filledQuantity - order.filledQuantity, rate, at))
      }

      return filled
    })

    this.subject.next(next)
    // Emitted after the order book settles so a subscriber that reads both sees
    // a consistent pair of states.
    for (const fill of fills) this.onFill(fill)
  }

  private clipSize(order: Order): number {
    const remaining = remainingQuantity(order)
    if (order.quantity <= FULL_FILL_THRESHOLD) return remaining
    return Math.min(remaining, Math.ceil(order.quantity / SLICE_COUNT))
  }

  private tradeFor(order: Order, notional: number, rate: number, at: number): Trade {
    this.fillSequence += 1
    return {
      id: `FIL-${String(this.fillSequence).padStart(6, '0')}`,
      symbol: order.symbol,
      direction: order.direction,
      notional,
      rate,
      tradeDate: at,
      valueDate: spotValueDate(at),
      status: 'Done',
      trader: this.trader,
      dealtCurrency: INSTRUMENTS_BY_SYMBOL[order.symbol]?.base ?? order.symbol.slice(0, 3),
    }
  }
}
