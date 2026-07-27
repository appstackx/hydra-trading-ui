import { useId, type ReactNode } from 'react'

export interface SparklineProps {
  readonly values: readonly number[]
  readonly width?: number
  readonly height?: number
  /** Any CSS colour; defaults to the current text colour. */
  readonly stroke?: string
  readonly filled?: boolean
  readonly className?: string
  /** Screen-reader description. Falls back to a generic label. */
  readonly label?: string
}

/**
 * A dependency-free trend line.
 *
 * Charting libraries are heavy and hard to theme; this is 40 lines of SVG that
 * inherits the design tokens and renders identically in every browser Playwright
 * runs.
 */
export function Sparkline({
  values,
  width = 72,
  height = 22,
  stroke = 'currentColor',
  filled = false,
  className,
  label,
}: SparklineProps): ReactNode {
  const gradientId = useId()

  // Two points are the minimum that can describe a direction.
  if (values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series would divide by zero; render it down the middle instead.
  const range = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values.map((value, index) => {
    const x = index * stepX
    const y = height - ((value - min) / range) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const line = points.join(' ')
  const area = `${line} ${width},${height} 0,${height}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={label ?? 'Price trend'}
      preserveAspectRatio="none"
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
