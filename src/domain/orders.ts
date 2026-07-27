import type { Direction, Order, OrderStatus, OrderType, Price, TimeInForce } from './types'
import { rateForDirection } from './pricing'

/** Statuses after which an order can no longer change. */
const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'Filled',
  'Cancelled',
  'Rejected',
])

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** True while the order is still eligible to receive fills. */
export function isWorking(order: Order): boolean {
  return !isTerminal(order.status)
}

/**
 * Whether the market has come to the order's price.
 *
 * A market order always trades. A buy limit only trades when the offer drops to
 * or below its limit; a sell limit only when the bid rises to or above it. A
 * limit order with no price can never fill — {@link validateOrderDraft} rejects
 * that case at entry, and this guards the path anyway.
 */
export function isFillable(order: Order, price: Price): boolean {
  if (!isWorking(order)) return false
  if (order.orderType === 'Market') return true
  if (order.limitPrice === undefined) return false

  return order.direction === 'Buy' ? price.ask <= order.limitPrice : price.bid >= order.limitPrice
}

/**
 * The rate a fill prints at. A limit order fills at its limit or better, so the
 * touch price is used whenever it improves on the limit.
 */
export function fillRate(order: Order, price: Price): number {
  const touch = rateForDirection(price, order.direction)
  if (order.orderType === 'Market' || order.limitPrice === undefined) return touch

  return order.direction === 'Buy'
    ? Math.min(touch, order.limitPrice)
    : Math.max(touch, order.limitPrice)
}

/** Quantity still to be filled. */
export function remainingQuantity(order: Order): number {
  return Math.max(0, order.quantity - order.filledQuantity)
}

/**
 * Applies a (possibly partial) fill, re-deriving the volume-weighted average
 * price and promoting the status. A fill larger than the remaining quantity is
 * truncated rather than over-filling the order.
 */
export function applyFill(order: Order, quantity: number, rate: number, at: number): Order {
  const fillQuantity = Math.min(quantity, remainingQuantity(order))
  if (fillQuantity <= 0) return order

  const filledQuantity = order.filledQuantity + fillQuantity
  const averageFillPrice =
    (order.averageFillPrice * order.filledQuantity + rate * fillQuantity) / filledQuantity

  return {
    ...order,
    filledQuantity,
    averageFillPrice,
    status: filledQuantity >= order.quantity ? 'Filled' : 'PartiallyFilled',
    updatedAt: at,
  }
}

/** Cancels a working order. Terminal orders are returned untouched. */
export function cancelOrder(order: Order, at: number): Order {
  if (!isWorking(order)) return order
  return { ...order, status: 'Cancelled', updatedAt: at }
}

export interface OrderDraft {
  readonly symbol: string
  readonly direction: Direction
  readonly orderType: OrderType
  readonly quantity: number
  readonly limitPrice?: number
  readonly timeInForce: TimeInForce
}

/** Field-keyed validation messages; an empty object means the draft is valid. */
export type OrderValidationErrors = Partial<Record<keyof OrderDraft, string>>

/** Largest single ticket the demo desk will accept, in base currency units. */
export const MAX_NOTIONAL = 100_000_000

/**
 * Pre-trade validation for the order ticket. Kept pure and separate from the
 * form so the same rules can run in a headless risk check.
 */
export function validateOrderDraft(draft: OrderDraft): OrderValidationErrors {
  const errors: OrderValidationErrors = {}

  if (!draft.symbol) {
    errors.symbol = 'Select a currency pair'
  }

  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
    errors.quantity = 'Enter a quantity greater than zero'
  } else if (draft.quantity > MAX_NOTIONAL) {
    errors.quantity = `Quantity exceeds the ${MAX_NOTIONAL.toLocaleString('en-GB')} limit`
  }

  if (draft.orderType === 'Limit') {
    if (draft.limitPrice === undefined || !Number.isFinite(draft.limitPrice)) {
      errors.limitPrice = 'Limit orders need a price'
    } else if (draft.limitPrice <= 0) {
      errors.limitPrice = 'Limit price must be greater than zero'
    }
  }

  return errors
}

export function isValidDraft(draft: OrderDraft): boolean {
  return Object.keys(validateOrderDraft(draft)).length === 0
}
