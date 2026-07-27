import { useMemo, type ReactNode } from 'react'
import { formatNotional, formatSignedCompact, REPORTING_CURRENCY } from '@/domain'
import { Panel } from '@/components/Panel'
import {
  useCurrencyExposures,
  usePnlHistory,
  usePositions,
  useTotalPnl,
} from '@/hooks/useMarketData'
import { cn } from '@/lib/cn'
import { PnlChart } from './PnlChart'

/**
 * Risk and performance at a glance: session P&L, the position book and net open
 * position by currency.
 */
export function Analytics(): ReactNode {
  const positions = usePositions()
  const exposures = useCurrencyExposures()
  const pnl = useTotalPnl()
  const pnlHistory = usePnlHistory()

  const open = useMemo(
    () => positions.filter((position) => position.netQuantity !== 0),
    [positions]
  )

  // Bars are scaled against the largest exposure so the shape is comparable
  // across currencies rather than each bar filling its own row.
  const largestExposure = useMemo(
    () => Math.max(1, ...exposures.map((exposure) => Math.abs(exposure.amount))),
    [exposures]
  )

  return (
    <Panel title="Analytics" meta={`${open.length} open`}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={`P&L (${REPORTING_CURRENCY})`}
            value={formatSignedCompact(pnl.amount)}
            tone={pnl.amount === 0 ? 'neutral' : pnl.amount > 0 ? 'up' : 'down'}
            testId="stat-total-pnl"
          />
          <Stat
            label="Realised"
            value={formatSignedCompact(pnl.realised)}
            tone="neutral"
            testId="stat-realised"
          />
          <Stat label="Positions" value={String(open.length)} tone="neutral" testId="stat-open" />
        </div>

        {pnl.unconvertible.length > 0 && (
          <p className="text-[10px] leading-snug text-warn" data-testid="pnl-caveat">
            {pnl.unconvertible.join(', ')} excluded — no {REPORTING_CURRENCY} conversion available.
          </p>
        )}

        <div className="h-24 shrink-0 rounded-md border border-line bg-panel-raised p-1">
          <PnlChart values={pnlHistory} className="h-full w-full" />
        </div>

        <section
          className="min-h-0 flex-1 overflow-auto"
          aria-label="Net open position by currency"
        >
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
            Net open position
          </h3>
          {exposures.length === 0 ? (
            <p
              className="py-3 text-center text-[11px] text-ink-subtle"
              data-testid="exposures-empty"
            >
              Flat across all currencies.
            </p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="exposure-list">
              {exposures.map((exposure) => {
                const long = exposure.amount > 0
                const width = (Math.abs(exposure.amount) / largestExposure) * 50
                return (
                  <li
                    key={exposure.currency}
                    className="flex items-center gap-2 text-[11px]"
                    data-testid={`exposure-${exposure.currency}`}
                  >
                    <span className="w-8 shrink-0 font-semibold text-ink-muted">
                      {exposure.currency}
                    </span>
                    <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-panel-raised">
                      <span
                        className="absolute inset-y-0 left-1/2 w-px bg-line-strong"
                        aria-hidden="true"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-y-0 rounded-sm transition-[width] duration-300',
                          long ? 'left-1/2 bg-buy/70' : 'right-1/2 bg-sell/70'
                        )}
                        style={{ width: `${width.toFixed(2)}%` }}
                      />
                    </span>
                    <span
                      className={cn(
                        'tnum w-16 shrink-0 text-right font-medium',
                        long ? 'text-buy' : 'text-sell'
                      )}
                    >
                      {formatNotional(exposure.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  )
}

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  readonly label: string
  readonly value: string
  readonly tone: 'up' | 'down' | 'neutral'
  readonly testId: string
}): ReactNode {
  return (
    <div className="rounded-md border border-line bg-panel-raised px-2 py-1.5" data-testid={testId}>
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-sm font-semibold',
          tone === 'up' && 'text-buy',
          tone === 'down' && 'text-sell',
          tone === 'neutral' && 'text-ink'
        )}
      >
        {value}
      </p>
    </div>
  )
}
