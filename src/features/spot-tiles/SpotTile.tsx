import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CurrencyPair, Direction, Trade } from '@/domain'
import {
  formatNotional,
  formatShortDate,
  parseNotional,
  spotValueDate,
  spreadInPips,
} from '@/domain'
import { useServices } from '@/app/ServicesContext'
import { useToasts } from '@/app/ToastContext'
import { usePrice, usePriceHistory } from '@/hooks/useMarketData'
import { Sparkline } from '@/components/Sparkline'
import { cn } from '@/lib/cn'
import { NotionalInput } from './NotionalInput'
import { RateButton } from './RateButton'

/** How long an execution result covers the tile before it returns to trading. */
export const RESULT_DISPLAY_MS = 4_000

type TileState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'executing'; readonly direction: Direction }
  | { readonly kind: 'done'; readonly trade: Trade }
  | { readonly kind: 'rejected'; readonly trade: Trade; readonly reason: string }

export interface SpotTileProps {
  readonly pair: CurrencyPair
}

/**
 * A single dealable instrument: live two-way price, notional entry, one-click
 * execution and the result overlay.
 *
 * The tile owns the whole trade lifecycle so it can be dropped into any layout —
 * a grid, a single-instrument popout, an embedded widget — without the host
 * having to wire execution.
 */
export function SpotTile({ pair }: SpotTileProps): ReactNode {
  const { execution, trades } = useServices()
  const { push } = useToasts()
  const price = usePrice(pair.symbol)
  const history = usePriceHistory(pair.symbol, 32)

  const [notionalText, setNotionalText] = useState(() => formatNotional(pair.defaultNotional))
  const [state, setState] = useState<TileState>({ kind: 'idle' })
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const notional = useMemo(() => parseNotional(notionalText), [notionalText])
  const notionalInvalid = notional === undefined || notional <= 0

  useEffect(
    () => () => {
      clearTimeout(resetTimer.current)
    },
    []
  )

  const scheduleReset = useCallback(() => {
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setState({ kind: 'idle' })
    }, RESULT_DISPLAY_MS)
  }, [])

  const handleExecute = useCallback(
    (direction: Direction) => {
      if (!price || notional === undefined || notionalInvalid) return

      setState({ kind: 'executing', direction })
      const rate = direction === 'Buy' ? price.ask : price.bid

      void execution
        .execute({ symbol: pair.symbol, direction, notional, rate })
        .then((result) => {
          // Rejected tickets go in the blotter too — a desk needs the audit
          // trail of what was attempted, not only what dealt.
          trades.record(result.trade)

          const size = formatNotional(result.trade.notional)
          const dealt = `${direction === 'Buy' ? 'Bought' : 'Sold'} ${size} ${pair.symbol}`

          if (result.kind === 'done') {
            setState({ kind: 'done', trade: result.trade })
            push({
              tone: 'success',
              title: dealt,
              detail: `at ${result.trade.rate.toFixed(pair.ratePrecision)} · ${result.trade.id}`,
            })
          } else {
            setState({ kind: 'rejected', trade: result.trade, reason: result.reason })
            push({ tone: 'error', title: `${dealt} — rejected`, detail: result.reason })
          }
          scheduleReset()
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : 'Execution failed'
          setState({ kind: 'idle' })
          push({ tone: 'error', title: `${pair.symbol} execution failed`, detail: reason })
        })
    },
    [execution, notional, notionalInvalid, pair, price, push, scheduleReset, trades]
  )

  // Taken from the quote clock rather than the browser's, so the tile shows the
  // venue's value date even when the two are on different sides of a date line.
  const valueDate = spotValueDate(price?.timestamp ?? Date.now())
  const spread = price ? spreadInPips(price, pair) : undefined
  const trend = history.length >= 2 ? (history.at(-1) ?? 0) - (history[0] ?? 0) : 0
  const busy = state.kind === 'executing'

  return (
    <article
      data-testid={`spot-tile-${pair.symbol}`}
      aria-label={`${pair.symbol} spot tile`}
      className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-panel border border-line bg-panel p-2.5 transition-colors hover:border-line-strong"
    >
      <header className="flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink">
          {pair.base}
          <span className="text-ink-subtle">/</span>
          {pair.terms}
        </h3>
        <span className="tnum rounded bg-panel-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
          {spread === undefined ? '—' : spread.toFixed(1)}
        </span>
        <div className="ml-auto">
          <Sparkline
            values={history}
            width={56}
            height={18}
            stroke={trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)'}
            label={`${pair.symbol} recent trend`}
          />
        </div>
      </header>

      {price ? (
        <div className="flex items-stretch gap-1.5">
          <RateButton
            direction="Sell"
            price={price}
            pair={pair}
            notional={notional}
            disabled={busy || notionalInvalid}
            onExecute={handleExecute}
          />
          <RateButton
            direction="Buy"
            price={price}
            pair={pair}
            notional={notional}
            disabled={busy || notionalInvalid}
            onExecute={handleExecute}
          />
        </div>
      ) : (
        <div
          className="flex h-[58px] items-center justify-center rounded-md border border-dashed border-line text-[11px] text-ink-subtle"
          data-testid={`spot-tile-${pair.symbol}-awaiting`}
        >
          Awaiting price…
        </div>
      )}

      <footer className="flex items-center gap-2">
        <NotionalInput
          value={notionalText}
          onChange={setNotionalText}
          currency={pair.base}
          invalid={notionalInvalid}
          disabled={busy}
          symbol={pair.symbol}
        />
        <span
          className="shrink-0 text-[10px] font-medium tracking-wide text-ink-subtle"
          title="Spot value date"
        >
          SP {formatShortDate(valueDate)}
        </span>
      </footer>

      {state.kind !== 'idle' && <TileOverlay state={state} pair={pair} />}
    </article>
  )
}

function TileOverlay({
  state,
  pair,
}: {
  readonly state: Exclude<TileState, { kind: 'idle' }>
  readonly pair: CurrencyPair
}): ReactNode {
  if (state.kind === 'executing') {
    return (
      <div
        className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-panel/92 backdrop-blur-[2px]"
        data-testid={`tile-overlay-${pair.symbol}`}
        data-state="executing"
      >
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
        </span>
        <span className="text-[11px] font-medium text-ink-muted">
          Executing {state.direction.toLowerCase()}…
        </span>
      </div>
    )
  }

  const done = state.kind === 'done'
  const { trade } = state
  const verb = trade.direction === 'Buy' ? 'Bought' : 'Sold'

  return (
    <div
      className={cn(
        // Fully opaque: a translucent result panel lets the big rate digits
        // bleed through the confirmation, which is the one message on the tile
        // that must be unambiguous.
        'animate-rise absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 px-3 text-center',
        done
          ? 'bg-buy-soft ring-1 ring-inset ring-buy/40'
          : 'bg-sell-soft ring-1 ring-inset ring-sell/40'
      )}
      data-testid={`tile-overlay-${pair.symbol}`}
      data-state={state.kind}
    >
      <p className="tnum text-xs font-semibold text-ink">
        {done
          ? `${verb} ${formatNotional(trade.notional)} ${pair.symbol}`
          : `${verb} ${formatNotional(trade.notional)} ${pair.symbol} — rejected`}
      </p>
      <p className="text-[10px] leading-snug text-ink-muted">
        {done ? `at ${trade.rate.toFixed(pair.ratePrecision)} · ${trade.id}` : state.reason}
      </p>
    </div>
  )
}
