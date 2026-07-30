import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatTime } from '@/domain'
import type { AuditEvent } from '@/services'
import { useServices } from '@/app/ServicesContext'
import { useObservable } from '@/hooks/useObservable'
import { Button } from '@/components/Button'
import { downloadTextFile } from '@/lib/download'
import { cn } from '@/lib/cn'

const NO_EVENTS: readonly AuditEvent[] = Object.freeze([])

type Filter = 'all' | 'trading' | 'orders' | 'risk' | 'session'

const FILTERS: readonly { readonly key: Filter; readonly label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trading', label: 'Trading' },
  { key: 'orders', label: 'Orders' },
  { key: 'risk', label: 'Risk' },
  { key: 'session', label: 'Session' },
]

const FILTER_PREFIX: Record<Exclude<Filter, 'all'>, string> = {
  trading: 'trade.',
  orders: 'order.',
  risk: 'risk.',
  session: 'session.',
}

const TYPE_TONE: Record<string, string> = {
  'trade.executed': 'bg-buy-soft text-buy',
  'trade.rejected': 'bg-sell-soft text-sell',
  'risk.kill-switch-engaged': 'bg-sell-soft text-sell',
  'risk.kill-switch-released': 'bg-buy-soft text-buy',
  'risk.loss-halt-engaged': 'bg-sell-soft text-sell',
  'risk.loss-halt-released': 'bg-buy-soft text-buy',
}

export interface AuditDrawerProps {
  readonly open: boolean
  readonly onClose: () => void
}

/**
 * The audit trail, on screen.
 *
 * Every entry answers who, when and what — and for a trade, the exact quote
 * the user was shown at the click. The export is the same trail as CSV; in a
 * deployment both feed from the client's audit store rather than this
 * browser-side capture buffer, and the panel is the part compliance actually
 * looks at during a review.
 */
export function AuditDrawer({ open, onClose }: AuditDrawerProps): ReactNode {
  const { audit, clearPersistedState } = useServices()
  const stream = useMemo(() => audit.events$(), [audit])
  const events = useObservable(stream, NO_EVENTS)
  const [filter, setFilter] = useState<Filter>('all')

  // Escape closes, as any overlay should.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const visible = useMemo(
    () =>
      filter === 'all'
        ? events
        : events.filter((event) => event.type.startsWith(FILTER_PREFIX[filter])),
    [events, filter]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40" role="presentation">
      <button
        type="button"
        aria-label="Close audit trail"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
        data-testid="audit-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Audit trail"
        data-testid="audit-drawer"
        className="animate-rise absolute inset-y-0 right-0 flex w-[min(26rem,100vw)] flex-col border-l border-line bg-panel shadow-2xl shadow-black/40"
      >
        <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-raised px-3 py-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
            Audit trail
          </h2>
          <span className="tnum text-[11px] text-ink-subtle" data-testid="audit-count">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              data-testid="audit-export"
              onClick={() => {
                downloadTextFile(audit.exportCsv(), 'audit-trail.csv', 'text/csv;charset=utf-8')
              }}
            >
              Export
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-testid="audit-close"
              className="rounded p-1 text-ink-subtle transition-colors hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M1 1l8 8M9 1l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div
          className="flex shrink-0 items-center gap-0.5 border-b border-line px-2 py-1.5"
          role="group"
          aria-label="Filter events"
        >
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              data-testid={`audit-filter-${key}`}
              onClick={() => {
                setFilter(key)
              }}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                filter === key
                  ? 'bg-brand-soft text-brand'
                  : 'text-ink-subtle hover:bg-panel-hover hover:text-ink-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {visible.length === 0 ? (
            <p
              className="flex h-full min-h-24 items-center justify-center text-xs text-ink-subtle"
              data-testid="audit-empty"
            >
              No events match the current filter.
            </p>
          ) : (
            <ul data-testid="audit-list">
              {visible.map((event) => (
                <li
                  key={event.id}
                  data-testid={`audit-event-${event.id}`}
                  data-type={event.type}
                  className="border-b border-line/60 px-3 py-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                        TYPE_TONE[event.type] ?? 'bg-panel-hover text-ink-muted'
                      )}
                    >
                      {event.type}
                    </span>
                    <span className="tnum ml-auto shrink-0 text-[10px] text-ink-subtle">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-ink">{event.summary}</p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">
                    {event.userName} · {event.id}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-3 py-2">
          <p className="mb-1.5 text-[10px] leading-snug text-ink-subtle">
            Capture buffer for this browser. A deployment streams the same events to your audit
            store; retention is the licensee's system of record, not this panel.
          </p>
          <button
            type="button"
            data-testid="audit-clear-session"
            onClick={() => {
              clearPersistedState()
              window.location.reload()
            }}
            className="text-[10px] font-medium text-sell transition-opacity hover:opacity-80"
          >
            Clear session data &amp; restart demo
          </button>
        </footer>
      </aside>
    </div>
  )
}
