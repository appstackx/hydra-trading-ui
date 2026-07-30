/**
 * Core domain vocabulary.
 *
 * Nothing in this folder imports React, RxJS or any transport. It is the shared
 * language between whatever feed a licensee plugs in and the UI that renders it,
 * which is what keeps the UI layer portable across back ends.
 */

/** ISO 4217 currency code, e.g. `EUR`. */
export type CurrencyCode = string

/** Canonical pair symbol with no separator, e.g. `EURUSD`. */
export type Symbol_ = string

export interface CurrencyPair {
  /** e.g. `EURUSD` */
  readonly symbol: Symbol_
  /** Currency being bought or sold, e.g. `EUR`. */
  readonly base: CurrencyCode
  /** Currency the price is expressed in, e.g. `USD`. */
  readonly terms: CurrencyCode
  /** Decimal places in the full rate, e.g. 5 for EURUSD (1.08423). */
  readonly ratePrecision: number
  /**
   * One-based decimal place of the pip: 4 for EURUSD (1.084|2|3), 2 for JPY
   * crosses (157.4|8|2). Drives both spread arithmetic and the big-figure split
   * used by the tile display.
   */
  readonly pipsPosition: number
  /** Notional prefilled in the ticket, in units of `base`. */
  readonly defaultNotional: number
}

export type PriceMovement = 'up' | 'down' | 'none'

export interface Price {
  readonly symbol: Symbol_
  readonly bid: number
  readonly ask: number
  readonly mid: number
  /** Epoch milliseconds at which the quote was produced. */
  readonly timestamp: number
  /** Direction of the mid relative to the previous tick. */
  readonly movement: PriceMovement
}

export type Direction = 'Buy' | 'Sell'

export type TradeStatus = 'Pending' | 'Done' | 'Rejected'

export interface Trade {
  readonly id: string
  readonly symbol: Symbol_
  readonly direction: Direction
  /** Quantity in units of the pair's base currency. */
  readonly notional: number
  /** All-in rate the trade dealt at. */
  readonly rate: number
  /** Epoch milliseconds. */
  readonly tradeDate: number
  /** Settlement date as `YYYY-MM-DD`. */
  readonly valueDate: string
  readonly status: TradeStatus
  readonly trader: string
  /** Currency the notional is denominated in — always the base, for spot FX. */
  readonly dealtCurrency: CurrencyCode
  /** Populated only when `status` is `Rejected`. */
  readonly rejectionReason?: string
}

export type OrderType = 'Market' | 'Limit'

export type OrderStatus = 'Working' | 'Filled' | 'PartiallyFilled' | 'Cancelled' | 'Rejected'

/** Good-'til-cancelled, immediate-or-cancel, fill-or-kill. */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK'

export interface Order {
  readonly id: string
  readonly symbol: Symbol_
  readonly direction: Direction
  readonly orderType: OrderType
  /** Total quantity requested, in base currency units. */
  readonly quantity: number
  /** Quantity filled so far; `0 <= filledQuantity <= quantity`. */
  readonly filledQuantity: number
  /** Volume-weighted average price of the fills so far; 0 when unfilled. */
  readonly averageFillPrice: number
  /** Required for `Limit` orders, absent for `Market`. */
  readonly limitPrice?: number
  readonly status: OrderStatus
  readonly timeInForce: TimeInForce
  /**
   * Who raised the order. Cancel rights depend on it: a junior may pull their
   * own orders and nobody else's.
   */
  readonly ownerId: string
  readonly ownerName: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface Position {
  readonly symbol: Symbol_
  /** Signed quantity in base currency units. Positive is long the base. */
  readonly netQuantity: number
  /** Weighted average rate of the open quantity; 0 when flat. */
  readonly averageRate: number
  /** P&L already crystallised by closing trades, in terms currency. */
  readonly realisedPnl: number
  /** Mark-to-market P&L on the open quantity, in terms currency. */
  readonly unrealisedPnl: number
  /** `realisedPnl + unrealisedPnl`, in terms currency. */
  readonly totalPnl: number
}

/** Aggregate exposure to a single currency across every open position. */
export interface CurrencyExposure {
  readonly currency: CurrencyCode
  readonly amount: number
}

export type ConnectionStatus = 'connecting' | 'connected' | 'degraded' | 'disconnected'

export interface ConnectionState {
  readonly status: ConnectionStatus
  /** Round-trip latency to the pricing service in milliseconds. */
  readonly latencyMs: number
  /** Human-readable name of the service the UI is bound to. */
  readonly service: string
}
