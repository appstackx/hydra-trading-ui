import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Trade, TradeStatus } from '@/domain'
import { formatNotional, formatRate, formatTime } from '@/domain'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import { useCurrencyPairs, useTrades } from '@/hooks/useMarketData'
import { cn } from '@/lib/cn'
import { downloadTextFile } from '@/lib/download'
import {
  countByStatus,
  DEFAULT_SORT,
  EMPTY_FILTER,
  filterTrades,
  nextSort,
  sortTrades,
  tradesToCsv,
  type BlotterColumn,
  type StatusFilter,
} from './blotter-model'

interface ColumnSpec {
  readonly key: BlotterColumn
  readonly label: string
  readonly align: 'left' | 'right'
  /**
   * Utility that reveals the column once the *panel* is wide enough. Keyed on
   * the container rather than the viewport: this blotter sits in one column of
   * a three-column workspace, so a wide monitor says nothing about the space
   * actually available to it.
   */
  readonly reveal?: string
}

const COLUMNS: readonly ColumnSpec[] = [
  { key: 'tradeDate', label: 'Time', align: 'left' },
  { key: 'id', label: 'Trade ID', align: 'left', reveal: 'hidden @2xl:table-cell' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'symbol', label: 'Pair', align: 'left' },
  { key: 'direction', label: 'Side', align: 'left' },
  { key: 'notional', label: 'Notional', align: 'right' },
  { key: 'rate', label: 'Rate', align: 'right' },
  { key: 'trader', label: 'Trader', align: 'left', reveal: 'hidden @4xl:table-cell' },
]

const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'Done', 'Rejected']

const STATUS_STYLES: Record<TradeStatus, string> = {
  Done: 'bg-buy-soft text-buy',
  Pending: 'bg-warn-soft text-warn',
  Rejected: 'bg-sell-soft text-sell',
}

/**
 * The trade blotter: every ticket this session has attempted, sortable,
 * filterable and exportable.
 *
 * Rejected trades stay in the list rather than being dropped — the audit trail
 * of what was attempted is the point of a blotter.
 */
export function Blotter(): ReactNode {
  const trades = useTrades()
  const pairs = useCurrencyPairs()
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [filter, setFilter] = useState(EMPTY_FILTER)

  const precisionOf = useCallback(
    (symbol: string) => pairs.find((pair) => pair.symbol === symbol)?.ratePrecision ?? 5,
    [pairs]
  )

  const counts = useMemo(() => countByStatus(trades), [trades])
  const visible = useMemo(
    () => sortTrades(filterTrades(trades, filter), sort),
    [trades, filter, sort]
  )

  const handleExport = useCallback(() => {
    downloadTextFile(tradesToCsv(visible), 'blotter.csv', 'text/csv;charset=utf-8')
  }, [visible])

  return (
    <Panel
      title="Blotter"
      meta={`${visible.length}/${trades.length}`}
      flush
      actions={
        <>
          <label className="sr-only" htmlFor="blotter-search">
            Search trades
          </label>
          <input
            id="blotter-search"
            value={filter.query}
            onChange={(event) => {
              setFilter((current) => ({ ...current, query: event.target.value }))
            }}
            placeholder="Search…"
            autoComplete="off"
            data-testid="blotter-search"
            className="h-6 w-24 rounded border border-line bg-panel px-2 text-[11px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-brand sm:w-32"
          />
          <div className="flex items-center gap-0.5" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={filter.status === status}
                data-testid={`blotter-filter-${status}`}
                onClick={() => {
                  setFilter((current) => ({ ...current, status }))
                }}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize transition-colors',
                  filter.status === status
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-subtle hover:bg-panel-hover hover:text-ink-muted'
                )}
              >
                {status} <span className="tnum opacity-60">{counts[status]}</span>
              </button>
            ))}
          </div>
          <Button size="sm" onClick={handleExport} data-testid="blotter-export">
            Export
          </Button>
        </>
      }
    >
      {visible.length === 0 ? (
        <p
          className="flex h-full min-h-24 items-center justify-center text-xs text-ink-subtle"
          data-testid="blotter-empty"
        >
          No trades match the current filter.
        </p>
      ) : (
        <table className="w-full border-collapse text-xs" data-testid="blotter-table">
          <caption className="sr-only">Trade blotter</caption>
          <thead className="sticky top-0 z-10 bg-panel-raised">
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.column === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    className={cn(
                      'border-b border-line px-2.5 py-1.5 font-semibold',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.reveal
                    )}
                  >
                    <button
                      type="button"
                      data-testid={`blotter-sort-${column.key}`}
                      onClick={() => {
                        setSort((current) => nextSort(current, column.key))
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.07em] transition-colors hover:text-ink',
                        active ? 'text-ink' : 'text-ink-subtle'
                      )}
                    >
                      {column.label}
                      <span aria-hidden="true" className={cn('text-[8px]', !active && 'opacity-0')}>
                        {sort.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((trade) => (
              <BlotterRow key={trade.id} trade={trade} precision={precisionOf(trade.symbol)} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

function BlotterRow({
  trade,
  precision,
}: {
  readonly trade: Trade
  readonly precision: number
}): ReactNode {
  return (
    <tr
      data-testid={`blotter-row-${trade.id}`}
      data-status={trade.status}
      className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover"
      title={trade.rejectionReason}
    >
      <td className="tnum px-2.5 py-1.5 text-ink-muted">{formatTime(trade.tradeDate)}</td>
      <td className="hidden px-2.5 py-1.5 text-ink-subtle @2xl:table-cell">{trade.id}</td>
      <td className="px-2.5 py-1.5">
        <span
          className={cn(
            'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
            STATUS_STYLES[trade.status]
          )}
        >
          {trade.status}
        </span>
      </td>
      <td className="px-2.5 py-1.5 font-medium text-ink">{trade.symbol}</td>
      <td
        className={cn(
          'px-2.5 py-1.5 font-semibold',
          trade.direction === 'Buy' ? 'text-buy' : 'text-sell'
        )}
      >
        {trade.direction}
      </td>
      <td className="tnum px-2.5 py-1.5 text-right text-ink">{formatNotional(trade.notional)}</td>
      <td className="tnum px-2.5 py-1.5 text-right text-ink">
        {formatRate(trade.rate, precision)}
      </td>
      <td className="hidden px-2.5 py-1.5 text-ink-muted @4xl:table-cell">{trade.trader}</td>
    </tr>
  )
}
