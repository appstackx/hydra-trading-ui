import { useId, type ReactNode } from 'react'

export interface PnlChartProps {
  readonly values: readonly number[]
  readonly className?: string
}

/** Drawing-space dimensions; the SVG scales to its container. */
const VIEW_WIDTH = 300
const VIEW_HEIGHT = 90
/** Vertical breathing room so the line never touches the frame. */
const PADDING = 6

/**
 * Book P&L over the session, with the break-even line marked.
 *
 * The domain always includes zero, so a run that is entirely in profit still
 * shows how far above water it is rather than rescaling to fill the panel and
 * making a $40 gain look like a $40,000 one.
 */
export function PnlChart({ values, className }: PnlChartProps): ReactNode {
  const gradientId = useId()

  if (values.length < 2) {
    return (
      <div
        className="flex h-full min-h-20 items-center justify-center text-[11px] text-ink-subtle"
        data-testid="pnl-chart-empty"
      >
        Collecting P&amp;L…
      </div>
    )
  }

  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const range = max - min || 1

  const toY = (value: number): number =>
    VIEW_HEIGHT - PADDING - ((value - min) / range) * (VIEW_HEIGHT - PADDING * 2)
  const stepX = VIEW_WIDTH / (values.length - 1)

  const points = values.map(
    (value, index) => `${(index * stepX).toFixed(2)},${toY(value).toFixed(2)}`
  )
  const line = points.join(' ')
  const zeroY = toY(0)
  const last = values.at(-1) ?? 0
  const positive = last >= 0
  const colour = positive ? 'var(--color-buy)' : 'var(--color-sell)'

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Session profit and loss, currently ${last.toFixed(2)}`}
      data-testid="pnl-chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.3" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>

      <line
        x1="0"
        y1={zeroY}
        x2={VIEW_WIDTH}
        y2={zeroY}
        stroke="var(--color-line-strong)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <polygon points={`${line} ${VIEW_WIDTH},${zeroY} 0,${zeroY}`} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={colour}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
