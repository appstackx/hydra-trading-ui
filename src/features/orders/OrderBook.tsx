import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Order, OrderStatus } from '@/domain'
import { formatNotional, formatTime, isWorking, remainingQuantity } from '@/domain'
import { useServices } from '@/app/ServicesContext'
import { useCurrencyPairs, useOrders } from '@/hooks/useMarketData'
import { cn } from '@/lib/cn'

const STATUS_STYLES: Record<OrderStatus, string> = {
  Working: 'bg-brand-soft text-brand',
  PartiallyFilled: 'bg-warn-soft text-warn',
  Filled: 'bg-buy-soft text-buy',
  Cancelled: 'bg-panel-hover text-ink-subtle',
  Rejected: 'bg-sell-soft text-sell',
}

/**
 * Working and completed orders, with a fill-progress bar and per-order cancel.
 *
 * Orders fill against the same live prices the tiles render, so a resting limit
 * visibly completes the moment the market trades through it.
 */
export function OrderBook(): ReactNode {
  const { orders: orderService } = useServices()
  const orders = useOrders()
  const pairs = useCurrencyPairs()
  const [showCompleted, setShowCompleted] = useState(true)

  const precisionOf = useCallback(
    (symbol: string) => pairs.find((pair) => pair.symbol === symbol)?.ratePrecision ?? 5,
    [pairs]
  )

  const visible = useMemo(
    () => (showCompleted ? orders : orders.filter(isWorking)),
    [orders, showCompleted]
  )

  const workingCount = useMemo(() => orders.filter(isWorking).length, [orders])

  const handleCancel = useCallback(
    (orderId: string) => {
      void orderService.cancel(orderId)
    },
    [orderService]
  )

  return (
    <div className="flex min-h-0 flex-col gap-1.5" data-testid="order-book">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          Orders <span className="tnum text-ink-muted">{workingCount} working</span>
        </h3>
        <button
          type="button"
          aria-pressed={showCompleted}
          data-testid="order-book-toggle-completed"
          onClick={() => {
            setShowCompleted((current) => !current)
          }}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
            showCompleted ? 'bg-brand-soft text-brand' : 'text-ink-subtle hover:text-ink-muted'
          )}
        >
          Completed
        </button>
      </div>

      {visible.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-line py-4 text-center text-[11px] text-ink-subtle"
          data-testid="order-book-empty"
        >
          No orders. Submit one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-auto" data-testid="order-list">
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              precision={precisionOf(order.symbol)}
              onCancel={handleCancel}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function OrderRow({
  order,
  precision,
  onCancel,
}: {
  readonly order: Order
  readonly precision: number
  readonly onCancel: (orderId: string) => void
}): ReactNode {
  const progress = (order.filledQuantity / order.quantity) * 100

  return (
    <li
      data-testid={`order-row-${order.id}`}
      data-status={order.status}
      className="rounded-md border border-line bg-panel-raised px-2 py-1.5"
    >
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className={cn('font-semibold', order.direction === 'Buy' ? 'text-buy' : 'text-sell')}>
          {order.direction}
        </span>
        <span className="font-medium text-ink">{order.symbol}</span>
        <span className="tnum text-ink-muted">{formatNotional(order.quantity)}</span>
        {order.limitPrice !== undefined && (
          <span className="tnum text-ink-subtle">@ {order.limitPrice.toFixed(precision)}</span>
        )}
        <span
          className={cn(
            'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold',
            STATUS_STYLES[order.status]
          )}
        >
          {order.status}
        </span>
        {isWorking(order) && (
          <button
            type="button"
            onClick={() => {
              onCancel(order.id)
            }}
            aria-label={`Cancel order ${order.id}`}
            data-testid={`order-cancel-${order.id}`}
            className="shrink-0 rounded px-1 text-[10px] font-semibold text-ink-subtle transition-colors hover:text-sell"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-subtle">
        <span className="tnum">{formatTime(order.createdAt)}</span>
        <span>{order.orderType}</span>
        <span>{order.timeInForce}</span>
        {order.filledQuantity > 0 && (
          <span className="tnum text-ink-muted">
            {formatNotional(order.filledQuantity)} filled @{' '}
            {order.averageFillPrice.toFixed(precision)}
          </span>
        )}
        {isWorking(order) && order.filledQuantity > 0 && (
          <span className="tnum ml-auto">{formatNotional(remainingQuantity(order))} left</span>
        )}
      </div>

      {order.filledQuantity > 0 && (
        <div
          className="mt-1 h-0.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Fill progress for ${order.id}`}
        >
          <div
            className={cn(
              'h-full transition-[width] duration-300',
              order.status === 'Filled' ? 'bg-buy' : 'bg-warn'
            )}
            style={{ width: `${progress.toFixed(1)}%` }}
          />
        </div>
      )}
    </li>
  )
}
