import type { ReactNode } from 'react'
import { Panel } from '@/components/Panel'
import { Analytics } from '@/features/analytics/Analytics'
import { Blotter } from '@/features/blotter/Blotter'
import { LiveRates } from '@/features/live-rates/LiveRates'
import { OrderBook } from '@/features/orders/OrderBook'
import { OrderTicket } from '@/features/orders/OrderTicket'
import { SpotTileGrid } from '@/features/spot-tiles/SpotTileGrid'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * The dealing workspace.
 *
 * One CSS grid, three breakpoints: a single scrolling column on a phone, two
 * columns on a laptop, and a fixed-height three-column terminal on a desk
 * monitor where each panel scrolls internally and nothing moves off screen.
 */
export function Workspace(): ReactNode {
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden"
      data-testid="workspace"
      aria-label="Trading workspace"
    >
      <div
        className={[
          'grid gap-2.5 p-2.5',
          'grid-cols-1',
          'lg:grid-cols-2',
          'xl:h-full xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1.15fr)_19rem]',
          'xl:grid-rows-[minmax(0,1.12fr)_minmax(0,1fr)]',
        ].join(' ')}
      >
        <Region label="Spot tiles" className="min-h-[19rem] lg:col-span-2 xl:col-span-1 xl:min-h-0">
          <SpotTileGrid />
        </Region>

        <Region label="Live rates" className="min-h-[17rem] xl:min-h-0">
          <LiveRates />
        </Region>

        <Region
          label="Order management"
          className="min-h-[26rem] lg:col-span-2 xl:col-span-1 xl:row-span-2 xl:min-h-0"
        >
          <Panel title="Order management" className="h-full">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <OrderTicket />
              <div className="h-px shrink-0 bg-line" />
              <div className="min-h-0 flex-1">
                <OrderBook />
              </div>
            </div>
          </Panel>
        </Region>

        <Region label="Blotter" className="min-h-[18rem] xl:min-h-0">
          <Blotter />
        </Region>

        <Region label="Analytics" className="min-h-[20rem] xl:min-h-0">
          <Analytics />
        </Region>
      </div>
    </main>
  )
}

function Region({
  label,
  className,
  children,
}: {
  readonly label: string
  readonly className: string
  readonly children: ReactNode
}): ReactNode {
  // A single-row grid stretches whatever the boundary renders to the full cell,
  // so panels fill their region without every one of them needing `h-full`.
  return (
    <div className={`grid min-h-0 min-w-0 grid-rows-1 ${className}`}>
      <ErrorBoundary label={label}>{children}</ErrorBoundary>
    </div>
  )
}
