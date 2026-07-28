import { useEffect, useState, type ReactNode } from 'react'
import type { ConnectionStatus } from '@/domain'
import { formatTime } from '@/domain'
import { useConnection, useOrders, useTrades } from '@/hooks/useMarketData'
import { useSessionConfig } from './ServicesContext'
import { isWorking } from '@/domain'
import { cn } from '@/lib/cn'

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  degraded: 'Degraded',
  disconnected: 'Offline',
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connecting: 'bg-warn',
  connected: 'bg-buy',
  degraded: 'bg-warn',
  disconnected: 'bg-sell',
}

/** Clock refresh. One second is the coarsest interval that still looks live. */
const CLOCK_INTERVAL_MS = 1_000

/**
 * Transport health, session counts and the clock.
 *
 * The connection indicator is the first thing a trader looks at when a price
 * stops moving, so it reports the actual stream state rather than a static
 * "connected" badge.
 */
export function StatusBar(): ReactNode {
  const connection = useConnection()
  const config = useSessionConfig()
  const trades = useTrades()
  const orders = useOrders()
  const now = useClock()

  const working = orders.filter(isWorking).length

  return (
    <footer
      className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11px] text-ink-muted"
      data-testid="status-bar"
    >
      <span className="flex items-center gap-1.5" data-testid="connection-status">
        <span
          className={cn('size-1.5 rounded-full', STATUS_DOT[connection.status])}
          aria-hidden="true"
        />
        <span className="font-medium text-ink">{STATUS_LABEL[connection.status]}</span>
        <span className="hidden text-ink-subtle sm:inline">{connection.service}</span>
      </span>

      <span className="tnum hidden text-ink-subtle sm:inline" data-testid="latency">
        {connection.latencyMs} ms
      </span>

      {/* Whether prices are real matters more than anything else on this bar,
          so it is stated rather than left to be inferred from the instruments. */}
      <span
        data-testid="feed-mode"
        data-feed={config.feed}
        title={
          config.feed === 'live'
            ? 'Live venue prices. Execution is still simulated — no order leaves this browser.'
            : 'Simulated prices and execution, reproducible from the seed in the URL.'
        }
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          config.feed === 'live' ? 'bg-buy-soft text-buy' : 'bg-panel-hover text-ink-subtle'
        )}
      >
        {config.feed === 'live' ? 'Live prices · sim execution' : 'Demo feed'}
      </span>

      <span className="ml-auto flex items-center gap-3">
        <span className="tnum" data-testid="working-count">
          {working} working
        </span>
        <span className="tnum" data-testid="trade-count">
          {trades.length} trades
        </span>
        <span className="tnum text-ink" data-testid="clock">
          {formatTime(now)}
        </span>
      </span>
    </footer>
  )
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, CLOCK_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [])

  return now
}
