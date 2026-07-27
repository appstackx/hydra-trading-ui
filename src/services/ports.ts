import type { Observable } from 'rxjs'
import type {
  ConnectionState,
  CurrencyPair,
  Direction,
  Order,
  OrderDraft,
  Price,
  Symbol_,
  Trade,
} from '@/domain'

/**
 * The ports the UI is written against.
 *
 * Everything above this file — every tile, blotter row and chart — depends only
 * on these four interfaces. The mock adapters in `./mock` are one
 * implementation; a licensee's WebSocket, FIX or Hydra/Aeron gateway is another.
 * Swapping them is a change to `createServices()` and nothing else, which is the
 * whole point of shipping the UI as a separate layer.
 */

export interface MarketDataPort {
  /** Instruments the venue quotes. Static for the lifetime of a session. */
  readonly currencyPairs: readonly CurrencyPair[]
  /** Hot stream of quotes for one instrument. Multicast; late subscribers get the last tick. */
  prices$(symbol: Symbol_): Observable<Price>
  /** Every instrument's latest quote, keyed by symbol. */
  allPrices$(): Observable<Readonly<Record<Symbol_, Price>>>
  /** Transport health, surfaced in the status bar. */
  connection$(): Observable<ConnectionState>
}

export interface ExecutionRequest {
  readonly symbol: Symbol_
  readonly direction: Direction
  readonly notional: number
  /** Rate the user saw when they clicked. The venue may reject on a stale quote. */
  readonly rate: number
}

export type ExecutionResult =
  | { readonly kind: 'done'; readonly trade: Trade }
  | { readonly kind: 'rejected'; readonly trade: Trade; readonly reason: string }

export interface ExecutionPort {
  /** Sends a trade and resolves once the venue has responded. */
  execute(request: ExecutionRequest): Promise<ExecutionResult>
}

export interface OrderPort {
  /** The full working and completed order book for this session. */
  orders$(): Observable<readonly Order[]>
  submit(draft: OrderDraft): Promise<Order>
  cancel(orderId: string): Promise<void>
}

export interface TradePort {
  /** Blotter contents, newest first. */
  trades$(): Observable<readonly Trade[]>
  /** Records a trade returned by {@link ExecutionPort.execute}. */
  record(trade: Trade): void
}

export interface Services {
  readonly marketData: MarketDataPort
  readonly execution: ExecutionPort
  readonly orders: OrderPort
  readonly trades: TradePort
  /** Releases timers and subscriptions. Called on unmount and in tests. */
  dispose(): void
}
