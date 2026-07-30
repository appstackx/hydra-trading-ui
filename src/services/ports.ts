import type { Observable } from 'rxjs'
import type {
  ConnectionState,
  CurrencyPair,
  Direction,
  KillSwitchState,
  Order,
  OrderDraft,
  Price,
  RiskLimits,
  Symbol_,
  Trade,
  User,
} from '@/domain'

/**
 * The ports the UI is written against.
 *
 * Everything above this file — every tile, blotter row and chart — depends only
 * on these interfaces. The mock adapters in `./mock` are one implementation;
 * a licensee's WebSocket, FIX or Hydra/Aeron gateway is another. Swapping them
 * is a change to `createServices()` and nothing else, which is the whole point
 * of shipping the UI as a separate layer.
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

export interface AuthPort {
  /** Signed-in user, or `null`. Emits immediately with the current state. */
  currentUser$(): Observable<User | null>
  /** Users offered on the sign-in screen. A real provider would not expose this. */
  readonly users: readonly User[]
  signIn(userId: string, passphrase: string): Promise<User>
  signOut(): Promise<void>
}

/** Everything the audit trail records about one event. */
export type AuditEventType =
  | 'session.signed-in'
  | 'session.restored'
  | 'session.signed-out'
  | 'trade.submitted'
  | 'trade.executed'
  | 'trade.rejected'
  | 'order.submitted'
  | 'order.cancelled'
  | 'order.filled'
  | 'risk.kill-switch-engaged'
  | 'risk.kill-switch-released'
  | 'risk.loss-halt-engaged'
  | 'risk.loss-halt-released'

export interface AuditEvent {
  /** Monotonic within a session store; gaps indicate tampering or data loss. */
  readonly sequence: number
  readonly id: string
  /** Epoch milliseconds. */
  readonly timestamp: number
  /** `system` for events with no signed-in user, e.g. a fill after sign-out. */
  readonly userId: string
  readonly userName: string
  readonly type: AuditEventType
  /** One human-readable line, e.g. `Buy 1m EURUSD at 1.08423`. */
  readonly summary: string
  /** Structured payload — for a trade, the exact quote the user was shown. */
  readonly details: Readonly<Record<string, string | number | boolean>>
}

export interface AuditPort {
  /** Records an event, stamping user, time and sequence. Must never throw. */
  record(
    type: AuditEventType,
    summary: string,
    details?: Readonly<Record<string, string | number | boolean>>
  ): void
  /** Full trail, newest first. Emits immediately with the current contents. */
  events$(): Observable<readonly AuditEvent[]>
  /** Serialises the trail for download, oldest first, RFC 4180. */
  exportCsv(): string
}

export interface RiskPort {
  readonly limits: RiskLimits
  /** Kill switch state. Emits immediately with the current state. */
  killSwitch$(): Observable<KillSwitchState>
  /** Current state, for synchronous pre-trade checks in the service layer. */
  readonly killSwitch: KillSwitchState
  /** Halts dealing desk-wide. Rejects if the user lacks the entitlement. */
  engageKillSwitch(reason: string): Promise<void>
  /** Resumes dealing. Rejects if the user lacks the entitlement. */
  releaseKillSwitch(): Promise<void>
}

export interface Services {
  readonly marketData: MarketDataPort
  readonly execution: ExecutionPort
  readonly orders: OrderPort
  readonly trades: TradePort
  readonly auth: AuthPort
  readonly audit: AuditPort
  readonly risk: RiskPort
  /** Releases timers and subscriptions. Called on unmount and in tests. */
  dispose(): void
}
