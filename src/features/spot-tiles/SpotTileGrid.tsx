import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Symbol_ } from '@/domain'
import { visibleInstruments } from '@/domain'
import { Panel } from '@/components/Panel'
import { useCurrencyPairs } from '@/hooks/useMarketData'
import { useSessionConfig } from '@/app/ServicesContext'
import { useUser } from '@/app/AuthContext'
import { cn } from '@/lib/cn'
import { SpotTile } from './SpotTile'

/**
 * The dealing workspace: a responsive grid of spot tiles with a chip row for
 * choosing which instruments are on the desk.
 *
 * Which tiles are open is local UI state on purpose — persisting a workspace is
 * a licensee concern (their user service, their layout engine), so the reference
 * build keeps the seam obvious instead of baking in a storage choice.
 */
export function SpotTileGrid(): ReactNode {
  const allPairs = useCurrencyPairs()
  const config = useSessionConfig()
  const user = useUser()

  // An instrument the user is not entitled to see is absent, not disabled.
  const pairs = useMemo(() => visibleInstruments(user, allPairs), [user, allPairs])

  // `null` means "not customised yet", so the default set is derived from the
  // session config and the user's entitlements rather than snapshotted on a
  // first render where neither has resolved.
  const [customised, setCustomised] = useState<readonly Symbol_[] | null>(null)

  const openSymbols = useMemo(
    () =>
      (customised ?? config.defaultTileSymbols).filter((symbol) =>
        pairs.some((pair) => pair.symbol === symbol)
      ),
    [customised, config.defaultTileSymbols, pairs]
  )

  const toggle = useCallback(
    (symbol: Symbol_) => {
      setCustomised((current) => {
        const base = current ?? config.defaultTileSymbols
        return base.includes(symbol)
          ? base.filter((existing) => existing !== symbol)
          : [...base, symbol]
      })
    },
    [config.defaultTileSymbols]
  )

  const openPairs = useMemo(
    () =>
      openSymbols.flatMap((symbol) => {
        const pair = pairs.find((candidate) => candidate.symbol === symbol)
        // A symbol the venue stopped quoting simply drops out of the grid.
        return pair ? [pair] : []
      }),
    [openSymbols, pairs]
  )

  return (
    <Panel
      title="Spot tiles"
      meta={`${openPairs.length} open`}
      actions={
        <div
          className="flex flex-wrap items-center justify-end gap-1"
          role="group"
          aria-label="Choose instruments"
        >
          {pairs.map((pair) => {
            const open = openSymbols.includes(pair.symbol)
            return (
              <button
                key={pair.symbol}
                type="button"
                onClick={() => {
                  toggle(pair.symbol)
                }}
                aria-pressed={open}
                data-testid={`tile-toggle-${pair.symbol}`}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors',
                  open
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-subtle hover:bg-panel-hover hover:text-ink-muted'
                )}
              >
                {pair.symbol}
              </button>
            )
          })}
        </div>
      }
    >
      {openPairs.length === 0 ? (
        <p className="flex h-full min-h-24 items-center justify-center text-xs text-ink-subtle">
          No instruments open — pick one above to start dealing.
        </p>
      ) : (
        <div
          className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]"
          data-testid="spot-tile-grid"
        >
          {openPairs.map((pair) => (
            <SpotTile key={pair.symbol} pair={pair} />
          ))}
        </div>
      )}
    </Panel>
  )
}
