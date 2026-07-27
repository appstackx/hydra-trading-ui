/**
 * Display formatting. Every formatter pins an explicit locale so that output is
 * identical in CI, in a browser in Manila and in a screenshot test — a UI that
 * silently reformats numbers by machine locale is not shippable to a desk.
 */

const LOCALE = 'en-GB'

const NOTIONAL_SUFFIXES = [
  { threshold: 1_000_000_000, suffix: 'bn' },
  { threshold: 1_000_000, suffix: 'm' },
  { threshold: 1_000, suffix: 'k' },
] as const

const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })

/**
 * Abbreviates a notional the way it is spoken on a desk: `1.5m`, `250k`, `750`.
 * Trailing zeroes are dropped so 1,000,000 reads `1m` rather than `1.00m`.
 */
export function formatNotional(value: number): string {
  if (!Number.isFinite(value)) return '—'

  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)

  for (const { threshold, suffix } of NOTIONAL_SUFFIXES) {
    if (magnitude >= threshold) {
      const scaled = magnitude / threshold
      // Two significant decimals below 10 (1.25m), one above (12.5m).
      const decimals = scaled < 10 ? 2 : 1
      const text = scaled.toFixed(decimals).replace(/\.?0+$/, '')
      return `${sign}${text}${suffix}`
    }
  }

  return `${sign}${integerFormat.format(magnitude)}`
}

/** Full grouped quantity, e.g. `1,500,000`. Used where precision beats brevity. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return integerFormat.format(value)
}

/**
 * Parses desk shorthand from the notional input: `1m`, `1.5M`, `250k`, `2bn`,
 * `1,000`. Returns `undefined` for anything it cannot read, so the caller
 * decides whether that is an empty field or a validation error.
 */
export function parseNotional(input: string): number | undefined {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[\s,_]/g, '')
  if (cleaned === '') return undefined

  const match = /^(\d*\.?\d+)(bn|b|m|k)?$/.exec(cleaned)
  if (!match) return undefined

  const [, digits, unit] = match
  const value = Number(digits)
  if (!Number.isFinite(value)) return undefined

  switch (unit) {
    case 'bn':
    case 'b':
      return value * 1_000_000_000
    case 'm':
      return value * 1_000_000
    case 'k':
      return value * 1_000
    case undefined:
      return value
    default:
      return value
  }
}

/** Money with two decimals and grouping, e.g. `1,234.50`. No currency symbol. */
export function formatMoney(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Signed P&L, always carrying an explicit `+` or `-`, e.g. `+1,204.50`. */
export function formatSigned(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  // -0 is a real float and would render as "-0.00" without this guard.
  const normalised = value === 0 ? 0 : value
  const sign = normalised > 0 ? '+' : normalised < 0 ? '-' : ''
  return `${sign}${formatMoney(Math.abs(normalised), decimals)}`
}

/**
 * Signed P&L that stays inside a stat tile: exact below 10,000, abbreviated
 * above it. A six-figure number rendered in full either overflows or shrinks the
 * type until it is unreadable across a desk.
 */
export function formatSignedCompact(value: number, threshold = 10_000): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < threshold) return formatSigned(value)
  return `${value > 0 ? '+' : '-'}${formatNotional(Math.abs(value))}`
}

/** Rate at the pair's own precision, e.g. `1.08423`. */
export function formatRate(rate: number, precision: number): string {
  if (!Number.isFinite(rate)) return '—'
  return rate.toFixed(precision)
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatTime(timestamp: number): string {
  return timeFormat.format(new Date(timestamp))
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormat.format(new Date(timestamp))
}

/**
 * `YYYY-MM-DD` in UTC — the wire format for a value date, deliberately not
 * localised because it is data rather than presentation.
 */
export function toIsoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Renders a `YYYY-MM-DD` value date as `29 Jul`. Parsed in UTC so a trader west
 * of Greenwich is not shown the previous day.
 */
export function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed)
}

/**
 * Spot value date: T+2 business days, skipping weekends.
 *
 * Real settlement also honours the currency holiday calendars of both legs;
 * this is the weekend-only approximation a demo feed needs, and the seam where
 * a licensee drops in their own holiday service.
 */
export function spotValueDate(tradeDate: number): string {
  const date = new Date(tradeDate)
  let added = 0
  while (added < 2) {
    date.setUTCDate(date.getUTCDate() + 1)
    const day = date.getUTCDay()
    if (day !== 0 && day !== 6) added += 1
  }
  return toIsoDate(date.getTime())
}
