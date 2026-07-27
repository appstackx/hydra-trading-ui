import type { Trade, TradeStatus } from '@/domain'
import { formatDateTime, formatRate } from '@/domain'

export type BlotterColumn =
  'tradeDate' | 'id' | 'status' | 'symbol' | 'direction' | 'notional' | 'rate' | 'trader'

export type SortDirection = 'asc' | 'desc'

export interface BlotterSort {
  readonly column: BlotterColumn
  readonly direction: SortDirection
}

export const DEFAULT_SORT: BlotterSort = { column: 'tradeDate', direction: 'desc' }

/** `all` is modelled explicitly so the filter is a single value, not a nullable. */
export type StatusFilter = TradeStatus | 'all'

export interface BlotterFilter {
  readonly status: StatusFilter
  /** Free text matched against symbol, id, trader and direction. */
  readonly query: string
}

export const EMPTY_FILTER: BlotterFilter = { status: 'all', query: '' }

/**
 * Applies the status and free-text filters.
 *
 * Matching is case-insensitive across the fields a trader would actually search
 * by — "eur", "TRD-000004", "rejected" and "buy" all find something.
 */
export function filterTrades(trades: readonly Trade[], filter: BlotterFilter): Trade[] {
  const query = filter.query.trim().toLowerCase()

  return trades.filter((trade) => {
    if (filter.status !== 'all' && trade.status !== filter.status) return false
    if (query === '') return true

    return (
      trade.symbol.toLowerCase().includes(query) ||
      trade.id.toLowerCase().includes(query) ||
      trade.trader.toLowerCase().includes(query) ||
      trade.direction.toLowerCase().includes(query) ||
      trade.status.toLowerCase().includes(query)
    )
  })
}

/**
 * Sorts a copy of the list. Strings compare with `localeCompare` so `EURUSD`
 * orders next to `EURGBP` rather than by code point.
 */
export function sortTrades(trades: readonly Trade[], sort: BlotterSort): Trade[] {
  const factor = sort.direction === 'asc' ? 1 : -1

  return [...trades].sort((a, b) => {
    const left = a[sort.column]
    const right = b[sort.column]

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor
    }
    return String(left).localeCompare(String(right)) * factor
  })
}

/** Flips direction when the same column is clicked again, else sorts descending. */
export function nextSort(current: BlotterSort, column: BlotterColumn): BlotterSort {
  if (current.column !== column) return { column, direction: 'desc' }
  return { column, direction: current.direction === 'desc' ? 'asc' : 'desc' }
}

const CSV_HEADERS = [
  'Trade ID',
  'Trade date',
  'Status',
  'Symbol',
  'Direction',
  'Notional',
  'Dealt currency',
  'Rate',
  'Value date',
  'Trader',
  'Rejection reason',
] as const

/**
 * Escapes a CSV field.
 *
 * Rejection reasons contain commas, so quoting is not optional here; embedded
 * quotes are doubled per RFC 4180.
 */
function csvField(value: string | number): string {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Serialises the blotter for download. Ordering matches what is on screen. */
export function tradesToCsv(trades: readonly Trade[], ratePrecision = 5): string {
  const rows = trades.map((trade) =>
    [
      trade.id,
      formatDateTime(trade.tradeDate),
      trade.status,
      trade.symbol,
      trade.direction,
      trade.notional,
      trade.dealtCurrency,
      formatRate(trade.rate, ratePrecision),
      trade.valueDate,
      trade.trader,
      trade.rejectionReason ?? '',
    ]
      .map(csvField)
      .join(',')
  )

  return [CSV_HEADERS.join(','), ...rows].join('\n')
}

/** Row counts per status, for the filter chips. */
export function countByStatus(trades: readonly Trade[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: trades.length,
    Done: 0,
    Pending: 0,
    Rejected: 0,
  }
  for (const trade of trades) counts[trade.status] += 1
  return counts
}
