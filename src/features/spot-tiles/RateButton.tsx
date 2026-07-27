import type { ReactNode } from 'react'
import type { CurrencyPair, Direction, Price } from '@/domain'
import { formatNotional, rateForDirection, splitRate } from '@/domain'
import { cn } from '@/lib/cn'

export interface RateButtonProps {
  readonly direction: Direction
  readonly price: Price
  readonly pair: CurrencyPair
  readonly notional: number | undefined
  readonly disabled: boolean
  readonly onExecute: (direction: Direction) => void
}

/**
 * One side of a spot tile: the dealable rate, rendered big-figure / pips /
 * fractional pip, and clickable to trade.
 *
 * The flash layer is keyed on the quote timestamp so every tick remounts it and
 * restarts the CSS animation. Driving it from state and a timer instead would
 * cost a render per tick, per tile, at four ticks a second.
 */
export function RateButton({
  direction,
  price,
  pair,
  notional,
  disabled,
  onExecute,
}: RateButtonProps): ReactNode {
  const rate = rateForDirection(price, direction)
  const { bigFigure, pips, fraction } = splitRate(rate, pair)
  const isBuy = direction === 'Buy'

  const label = `${direction} ${notional === undefined ? '' : formatNotional(notional)} ${
    pair.base
  }/${pair.terms} at ${rate.toFixed(pair.ratePrecision)}`

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onExecute(direction)
      }}
      aria-label={label.replace(/\s+/g, ' ')}
      data-testid={`${direction.toLowerCase()}-button`}
      data-rate={rate}
      className={cn(
        'group relative isolate flex flex-1 flex-col justify-center overflow-hidden rounded-md px-2.5 py-2',
        'border transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isBuy
          ? 'items-end border-buy/25 bg-buy/[0.07] hover:border-buy/60 hover:bg-buy/15'
          : 'items-start border-sell/25 bg-sell/[0.07] hover:border-sell/60 hover:bg-sell/15'
      )}
    >
      <span
        key={price.timestamp}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 -z-10',
          price.movement === 'up' && 'flash-up',
          price.movement === 'down' && 'flash-down'
        )}
      />
      <span
        className={cn(
          'text-[10px] font-bold uppercase tracking-[0.12em]',
          isBuy ? 'text-buy' : 'text-sell'
        )}
      >
        {direction}
      </span>
      <span className="tnum flex items-baseline leading-none text-ink">
        <span className="text-sm font-medium opacity-70">{bigFigure}</span>
        <span className="text-2xl font-semibold tracking-tight">{pips}</span>
        <span className="text-[11px] font-medium opacity-70">{fraction}</span>
      </span>
    </button>
  )
}
