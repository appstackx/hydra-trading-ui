import { BehaviorSubject, ReplaySubject, type Observable } from 'rxjs'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import type {
  ConnectionState,
  CurrencyPair,
  Order,
  OrderDraft,
  Price,
  Symbol_,
  Trade,
} from '@/domain'
import { validateOrderDraft } from '@/domain'
import type {
  ExecutionPort,
  ExecutionRequest,
  ExecutionResult,
  MarketDataPort,
  OrderPort,
  Services,
  TradePort,
} from '@/services'
import { ServicesProvider } from '@/app/ServicesContext'
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
}

export class TestServices implements Services {
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

  dispose(): void {
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
          <ServicesProvider services={services}>{children}</ServicesProvider>
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), services }
}
