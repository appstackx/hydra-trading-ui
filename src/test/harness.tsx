import { BehaviorSubject, ReplaySubject, type Observable } from 'rxjs'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import type {
  ConnectionState,
  CurrencyPair,
  KillSwitchState,
  Order,
  OrderDraft,
  Price,
  Symbol_,
  Trade,
  User,
} from '@/domain'
import { canOperateKillSwitch, DEFAULT_RISK_LIMITS, KILL_SWITCH_OFF, validateOrderDraft } from '@/domain'
import type {
  AppServices,
  AuditEvent,
  AuditEventType,
  AuditPort,
  AuthPort,
  ExecutionPort,
  ExecutionRequest,
  ExecutionResult,
  MarketDataPort,
  OrderPort,
  RiskPort,
  SessionConfig,
  TradePort,
} from '@/services'
import { DEMO_USERS } from '@/services'
import { ServicesProvider } from '@/app/ServicesContext'
import { AuthProvider } from '@/app/AuthContext'
import { RiskProvider } from '@/app/RiskContext'
import { ThemeProvider } from '@/app/ThemeContext'
import { ToastProvider } from '@/app/ToastContext'
import { EURUSD, USDJPY, price as makePrice } from './fixtures'

/**
 * A hand-driven stand-in for the demo back end.
 *
 * Component tests need to control exactly when a price ticks and what an
 * execution returns; the mock adapters are driven by real timers and a random
 * generator, which would make those tests slow and flaky. Everything here is
 * push-on-demand.
 */
export interface TestServicesOptions {
  /**
   * Whether each instrument starts with a quote. Turn it off to exercise the
   * pre-first-tick state, which is what a real desk sees for the first second
   * after a reconnect.
   */
  readonly seedPrices?: boolean
  /** Who is signed in. `null` renders the sign-in screen. */
  readonly user?: User | null
}

export class TestServices implements AppServices {
  readonly prices = new Map<Symbol_, ReplaySubject<Price>>()
  private readonly latest = new Map<Symbol_, Price>()
  readonly tradeList = new BehaviorSubject<readonly Trade[]>([])
  readonly orderList = new BehaviorSubject<readonly Order[]>([])
  readonly allPricesSubject = new BehaviorSubject<Readonly<Record<Symbol_, Price>>>({})
  readonly connectionSubject = new BehaviorSubject<ConnectionState>({
    status: 'connected',
    latencyMs: 5,
    service: 'test-feed',
  })

  /** Every execution request the UI has sent, in order. */
  readonly executed: ExecutionRequest[] = []
  /** Result the next execution resolves with. Replaced per test. */
  nextExecution: (request: ExecutionRequest) => ExecutionResult = (request) => ({
    kind: 'done',
    trade: {
      id: `TRD-${String(this.executed.length).padStart(6, '0')}`,
      symbol: request.symbol,
      direction: request.direction,
      notional: request.notional,
      rate: request.rate,
      tradeDate: Date.now(),
      valueDate: '2026-07-29',
      status: 'Done',
      trader: 'TEST',
      dealtCurrency: request.symbol.slice(0, 3),
    },
  })

  readonly pairs: readonly CurrencyPair[]
  /** Signed in as the unrestricted trader by default; override per test. */
  readonly currentUser: BehaviorSubject<User | null>

  constructor(
    pairs: readonly CurrencyPair[] = [EURUSD, USDJPY],
    options: TestServicesOptions = {}
  ) {
    this.pairs = pairs
    for (const pair of pairs) {
      this.prices.set(pair.symbol, new ReplaySubject<Price>(1))
    }
    if (options.seedPrices ?? true) {
      for (const pair of pairs) this.tick(pair.symbol)
    }
    // `??` would swallow an explicit `null`, which is how a test asks for the
    // signed-out state.
    this.currentUser = new BehaviorSubject<User | null>(
      options.user === undefined ? (DEMO_USERS[0] ?? null) : options.user
    )
  }

  /** Switches the signed-in user mid-test, to exercise entitlement changes. */
  signInAs(user: User | null): void {
    this.currentUser.next(user)
  }

  /** Pushes a new quote for one instrument and refreshes the aggregate. */
  tick(symbol: Symbol_, overrides: Partial<Price> = {}): void {
    const subject = this.prices.get(symbol)
    if (!subject) throw new Error(`No test price stream for ${symbol}`)

    const next: Price = { ...(this.latest.get(symbol) ?? makePrice({ symbol })), ...overrides }
    this.latest.set(symbol, next)
    subject.next(next)
    this.allPricesSubject.next({ ...this.allPricesSubject.value, [symbol]: next })
  }

  readonly marketData: MarketDataPort = {
    currencyPairs: [],
    prices$: (symbol) => this.priceStream(symbol),
    allPrices$: () => this.allPricesSubject.asObservable(),
    connection$: () => this.connectionSubject.asObservable(),
  }

  readonly execution: ExecutionPort = {
    execute: (request) => {
      this.executed.push(request)
      return Promise.resolve(this.nextExecution(request))
    },
  }

  readonly orders: OrderPort = {
    orders$: () => this.orderList.asObservable(),
    submit: (draft: OrderDraft) => {
      const firstError = Object.values(validateOrderDraft(draft))[0]
      if (firstError !== undefined) return Promise.reject(new Error(firstError))

      const order: Order = {
        id: `ORD-${String(this.orderList.value.length + 1).padStart(6, '0')}`,
        symbol: draft.symbol,
        direction: draft.direction,
        orderType: draft.orderType,
        quantity: draft.quantity,
        filledQuantity: 0,
        averageFillPrice: 0,
        status: 'Working',
        timeInForce: draft.timeInForce,
        ownerId: this.currentUser.value?.id ?? 'system',
        ownerName: this.currentUser.value?.name ?? 'system',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(draft.limitPrice === undefined ? {} : { limitPrice: draft.limitPrice }),
      }
      this.orderList.next([order, ...this.orderList.value])
      return Promise.resolve(order)
    },
    cancel: (orderId) => {
      this.orderList.next(
        this.orderList.value.map((order) =>
          order.id === orderId ? { ...order, status: 'Cancelled' as const } : order
        )
      )
      return Promise.resolve()
    },
  }

  readonly trades: TradePort = {
    trades$: () => this.tradeList.asObservable(),
    record: (trade) => {
      this.tradeList.next([trade, ...this.tradeList.value])
    },
  }

  /** Kill-switch state, drivable by tests. */
  readonly killSwitchState = new BehaviorSubject<KillSwitchState>(KILL_SWITCH_OFF)
  /** Every audit event recorded, newest first, for assertions. */
  readonly auditEvents = new BehaviorSubject<readonly AuditEvent[]>([])
  private auditSequence = 0

  // Built in a closure so the object-literal getter can reach the instance:
  // a plain `get killSwitch()` inside the literal would bind `this` to the
  // literal itself, not to the TestServices under construction.
  readonly risk: RiskPort = ((self: TestServices): RiskPort => ({
    limits: DEFAULT_RISK_LIMITS,
    killSwitch$: () => self.killSwitchState.asObservable(),
    get killSwitch() {
      return self.killSwitchState.value
    },
    engageKillSwitch: (reason) => {
      if (!canOperateKillSwitch(self.currentUser.value)) {
        return Promise.reject(new Error('You are not entitled to operate the kill switch'))
      }
      self.killSwitchState.next({
        engaged: true,
        engagedBy: self.currentUser.value?.name ?? 'unknown',
        engagedAt: Date.now(),
        reason,
      })
      return Promise.resolve()
    },
    releaseKillSwitch: () => {
      if (!canOperateKillSwitch(self.currentUser.value)) {
        return Promise.reject(new Error('You are not entitled to operate the kill switch'))
      }
      self.killSwitchState.next(KILL_SWITCH_OFF)
      return Promise.resolve()
    },
  }))(this)

  readonly audit: AuditPort = {
    record: (type: AuditEventType, summary, details = {}) => {
      this.auditSequence += 1
      const user = this.currentUser.value
      const event: AuditEvent = {
        sequence: this.auditSequence,
        id: `AUD-${String(this.auditSequence).padStart(6, '0')}`,
        timestamp: Date.now(),
        userId: user?.id ?? 'system',
        userName: user?.name ?? 'system',
        type,
        summary,
        details,
      }
      this.auditEvents.next([event, ...this.auditEvents.value])
    },
    events$: () => this.auditEvents.asObservable(),
    exportCsv: () => this.auditEvents.value.map((event) => event.summary).join('\n'),
  }

  readonly auth: AuthPort = {
    users: DEMO_USERS,
    currentUser$: () => this.currentUser.asObservable(),
    signIn: (userId, passphrase) => {
      const user = DEMO_USERS.find((candidate) => candidate.id === userId)
      if (!user) return Promise.reject(new Error('Unknown user'))
      if (passphrase.trim() === '') return Promise.reject(new Error('Enter a passphrase'))
      this.currentUser.next(user)
      return Promise.resolve(user)
    },
    signOut: () => {
      this.currentUser.next(null)
      return Promise.resolve()
    },
  }

  get config(): SessionConfig {
    return {
      feed: 'demo',
      instruments: this.pairs,
      defaultTileSymbols: this.pairs.map((pair) => pair.symbol),
    }
  }

  // An arrow property, not a method: the drawer destructures this off the
  // services object and calls it unbound, exactly as the interface's
  // function-property type says it may.
  readonly clearPersistedState = (): void => {
    this.auditEvents.next([])
  }

  dispose(): void {
    this.killSwitchState.complete()
    this.auditEvents.complete()
    this.currentUser.complete()
    for (const subject of this.prices.values()) subject.complete()
    this.tradeList.complete()
    this.orderList.complete()
    this.allPricesSubject.complete()
    this.connectionSubject.complete()
  }

  private priceStream(symbol: Symbol_): Observable<Price> {
    const subject = this.prices.get(symbol)
    if (!subject) throw new Error(`No test price stream for ${symbol}`)
    return subject.asObservable()
  }
}

export function createTestServices(
  pairs?: readonly CurrencyPair[],
  options?: TestServicesOptions
): TestServices {
  const services = new TestServices(pairs, options)
  // `currencyPairs` is readonly on the port, so it is patched once here rather
  // than widening the interface just for tests.
  Object.assign(services.marketData, { currencyPairs: services.pairs })
  return services
}

export interface RenderWithServicesResult extends RenderResult {
  readonly services: TestServices
}

/** Renders `ui` inside the full provider stack with controllable services. */
export function renderWithServices(
  ui: ReactElement,
  options: RenderOptions & { services?: TestServices } = {}
): RenderWithServicesResult {
  const { services = createTestServices(), ...renderOptions } = options

  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return (
      <ThemeProvider>
        <ToastProvider>
          <ServicesProvider services={services}>
            <AuthProvider>
              <RiskProvider>{children}</RiskProvider>
            </AuthProvider>
          </ServicesProvider>
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), services }
}
