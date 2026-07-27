import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Direction, OrderDraft, OrderType, TimeInForce } from '@/domain'
import { formatNotional, parseNotional, validateOrderDraft } from '@/domain'
import { Button } from '@/components/Button'
import { useServices } from '@/app/ServicesContext'
import { useToasts } from '@/app/ToastContext'
import { useAllPrices, useCurrencyPairs } from '@/hooks/useMarketData'
import { cn } from '@/lib/cn'

const ORDER_TYPES: readonly OrderType[] = ['Market', 'Limit']
const TIME_IN_FORCE: readonly TimeInForce[] = ['GTC', 'IOC', 'FOK']

/**
 * Order entry for the OMS panel.
 *
 * Validation runs through the same pure `validateOrderDraft` the service uses,
 * so what the form accepts and what the back end accepts cannot drift apart.
 */
export function OrderTicket(): ReactNode {
  const { orders } = useServices()
  const { push } = useToasts()
  const pairs = useCurrencyPairs()
  const prices = useAllPrices()

  const [symbol, setSymbol] = useState(() => pairs[0]?.symbol ?? '')
  const [direction, setDirection] = useState<Direction>('Buy')
  const [orderType, setOrderType] = useState<OrderType>('Limit')
  const [timeInForce, setTimeInForce] = useState<TimeInForce>('GTC')
  const [quantityText, setQuantityText] = useState('1m')
  const [limitText, setLimitText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const pair = useMemo(
    () => pairs.find((candidate) => candidate.symbol === symbol),
    [pairs, symbol]
  )
  const price = prices[symbol]

  const draft = useMemo<OrderDraft>(() => {
    const limitPrice = Number.parseFloat(limitText)
    return {
      symbol,
      direction,
      orderType,
      timeInForce,
      quantity: parseNotional(quantityText) ?? Number.NaN,
      ...(limitText.trim() === '' || !Number.isFinite(limitPrice) ? {} : { limitPrice }),
    }
  }, [symbol, direction, orderType, timeInForce, quantityText, limitText])

  const errors = useMemo(() => validateOrderDraft(draft), [draft])
  const hasErrors = Object.keys(errors).length > 0

  /** Prefills the limit with the touch price on the side being traded. */
  const applyTouchPrice = useCallback(() => {
    if (!price || !pair) return
    const touch = direction === 'Buy' ? price.ask : price.bid
    setLimitText(touch.toFixed(pair.ratePrecision))
  }, [direction, pair, price])

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      setSubmitted(true)
      if (hasErrors) return

      void orders
        .submit(draft)
        .then((order) => {
          push({
            tone: 'info',
            title: `${order.direction} ${formatNotional(order.quantity)} ${order.symbol} working`,
            detail: `${order.orderType}${
              order.limitPrice === undefined ? '' : ` @ ${String(order.limitPrice)}`
            } · ${order.timeInForce} · ${order.id}`,
          })
          setSubmitted(false)
        })
        .catch((error: unknown) => {
          push({
            tone: 'error',
            title: 'Order rejected',
            detail: error instanceof Error ? error.message : 'Unknown error',
          })
        })
    },
    [draft, hasErrors, orders, push]
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2"
      aria-label="Order ticket"
      data-testid="order-ticket"
      noValidate
    >
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Pair" htmlFor="order-symbol">
          <select
            id="order-symbol"
            value={symbol}
            onChange={(event) => {
              setSymbol(event.target.value)
            }}
            className="h-7 w-full rounded border border-line bg-panel-raised px-1.5 text-xs text-ink outline-none transition-colors focus:border-brand"
          >
            {pairs.map((candidate) => (
              <option key={candidate.symbol} value={candidate.symbol}>
                {candidate.symbol}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Side">
          <div className="flex h-7 gap-1" role="group" aria-label="Side">
            {(['Buy', 'Sell'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={direction === side}
                data-testid={`order-side-${side}`}
                onClick={() => {
                  setDirection(side)
                }}
                className={cn(
                  'flex-1 rounded border text-[11px] font-semibold transition-colors',
                  direction === side
                    ? side === 'Buy'
                      ? 'border-buy bg-buy/15 text-buy'
                      : 'border-sell bg-sell/15 text-sell'
                    : 'border-line text-ink-subtle hover:text-ink-muted'
                )}
              >
                {side}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Quantity"
          htmlFor="order-quantity"
          error={submitted ? errors.quantity : undefined}
        >
          <input
            id="order-quantity"
            value={quantityText}
            onChange={(event) => {
              setQuantityText(event.target.value)
            }}
            inputMode="decimal"
            autoComplete="off"
            data-testid="order-quantity"
            aria-invalid={submitted && errors.quantity !== undefined}
            className={cn(
              'tnum h-7 w-full rounded border bg-panel-raised px-1.5 text-xs text-ink outline-none transition-colors',
              submitted && errors.quantity !== undefined
                ? 'border-sell'
                : 'border-line focus:border-brand'
            )}
          />
        </Field>

        <Field label="Type">
          <div className="flex h-7 gap-1" role="group" aria-label="Order type">
            {ORDER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={orderType === type}
                data-testid={`order-type-${type}`}
                onClick={() => {
                  setOrderType(type)
                }}
                className={cn(
                  'flex-1 rounded border text-[11px] font-semibold transition-colors',
                  orderType === type
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line text-ink-subtle hover:text-ink-muted'
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {orderType === 'Limit' && (
        <Field
          label="Limit price"
          htmlFor="order-limit"
          error={submitted ? errors.limitPrice : undefined}
          action={
            <button
              type="button"
              onClick={applyTouchPrice}
              disabled={!price}
              data-testid="order-use-touch"
              className="text-[10px] font-medium text-brand transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              Use touch
            </button>
          }
        >
          <input
            id="order-limit"
            value={limitText}
            onChange={(event) => {
              setLimitText(event.target.value)
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder={pair ? (0).toFixed(pair.ratePrecision) : '0.00000'}
            data-testid="order-limit"
            aria-invalid={submitted && errors.limitPrice !== undefined}
            className={cn(
              'tnum h-7 w-full rounded border bg-panel-raised px-1.5 text-xs text-ink outline-none transition-colors placeholder:text-ink-subtle',
              submitted && errors.limitPrice !== undefined
                ? 'border-sell'
                : 'border-line focus:border-brand'
            )}
          />
        </Field>
      )}

      <Field label="Time in force">
        <div className="flex h-7 gap-1" role="group" aria-label="Time in force">
          {TIME_IN_FORCE.map((tif) => (
            <button
              key={tif}
              type="button"
              aria-pressed={timeInForce === tif}
              data-testid={`order-tif-${tif}`}
              onClick={() => {
                setTimeInForce(tif)
              }}
              className={cn(
                'flex-1 rounded border text-[11px] font-semibold transition-colors',
                timeInForce === tif
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-ink-subtle hover:text-ink-muted'
              )}
            >
              {tif}
            </button>
          ))}
        </div>
      </Field>

      <Button
        type="submit"
        variant={direction === 'Buy' ? 'buy' : 'sell'}
        data-testid="order-submit"
        className="mt-0.5 w-full"
      >
        {`${direction} ${quantityText || '—'} ${pair?.base ?? ''}`.trim()}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  action,
  children,
}: {
  readonly label: string
  readonly htmlFor?: string
  readonly error?: string | undefined
  readonly action?: ReactNode
  readonly children: ReactNode
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
        >
          {label}
        </label>
        {action}
      </div>
      {children}
      {error !== undefined && (
        <p className="text-[10px] text-sell" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
