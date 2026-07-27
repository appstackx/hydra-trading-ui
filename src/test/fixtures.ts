import type { CurrencyPair, Order, Price, Trade } from '@/domain'

/** A 5-decimal major. */
export const EURUSD: CurrencyPair = {
  symbol: 'EURUSD',
  base: 'EUR',
  terms: 'USD',
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
}

/** A 3-decimal yen cross — the other rate-formatting shape. */
export const USDJPY: CurrencyPair = {
  symbol: 'USDJPY',
  base: 'USD',
  terms: 'JPY',
  ratePrecision: 3,
  pipsPosition: 2,
  defaultNotional: 1_000_000,
}

export const PAIRS: Record<string, CurrencyPair> = { EURUSD, USDJPY }

/** Fixed epoch inside a Monday, so `spotValueDate` lands on a weekday. */
export const T0 = Date.UTC(2026, 6, 27, 9, 30, 0)

export function price(overrides: Partial<Price> & Pick<Price, 'symbol'>): Price {
  const mid = overrides.mid ?? 1.085
  return {
    bid: mid - 0.00005,
    ask: mid + 0.00005,
    mid,
    timestamp: T0,
    movement: 'none',
    ...overrides,
  }
}

export function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'TRD-000001',
    symbol: 'EURUSD',
    direction: 'Buy',
    notional: 1_000_000,
    rate: 1.085,
    tradeDate: T0,
    valueDate: '2026-07-29',
    status: 'Done',
    trader: 'AXDEMO',
    dealtCurrency: 'EUR',
    ...overrides,
  }
}

export function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ORD-000001',
    symbol: 'EURUSD',
    direction: 'Buy',
    orderType: 'Limit',
    quantity: 1_000_000,
    filledQuantity: 0,
    averageFillPrice: 0,
    status: 'Working',
    timeInForce: 'GTC',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}
