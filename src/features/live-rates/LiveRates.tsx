import { memo, type ReactNode } from 'react'
import type { CurrencyPair } from '@/domain'
import { formatRate, spreadInPips, toPips } from '@/domain'
import { Panel } from '@/components/Panel'
import { Sparkline } from '@/components/Sparkline'
import { useCurrencyPairs, usePrice, usePriceHistory } from '@/hooks/useMarketData'
import { cn } from '@/lib/cn'

/**
 * Full market watch across every quoted instrument.
 *
 * Each row subscribes to its own instrument rather than the panel subscribing to
 * everything and re-rendering the table: with ten pairs ticking independently,
 * a shared subscription would re-render all ten rows about thirty times a second.
 */
export function LiveRates(): ReactNode {
  const pairs = useCurrencyPairs()

  return (
    <Panel title="Live rates" meta={`${pairs.length} pairs`} flush>
      <table className="w-full border-collapse text-xs" data-testid="live-rates-table">
        <caption className="sr-only">Live rates for all quoted currency pairs</caption>
        <thead className="sticky top-0 z-10 bg-panel-raised">
          <tr className="text-[10px] uppercase tracking-[0.07em] text-ink-subtle">
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-left font-semibold">
              Pair
            </th>
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-right font-semibold">
              Bid
            </th>
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-right font-semibold">
              Ask
            </th>
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-right font-semibold">
              Spread
            </th>
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-right font-semibold">
              Chg
            </th>
            <th scope="col" className="border-b border-line px-2.5 py-1.5 text-right font-semibold">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => (
            <RateRow key={pair.symbol} pair={pair} />
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

const RateRow = memo(function RateRow({ pair }: { readonly pair: CurrencyPair }): ReactNode {
  const price = usePrice(pair.symbol)
  const history = usePriceHistory(pair.symbol, 28)

  const opening = history[0]
  const changePips = price && opening !== undefined ? toPips(price.mid - opening, pair) : undefined
  const up = (changePips ?? 0) >= 0

  return (
    <tr
      data-testid={`rate-row-${pair.symbol}`}
      className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-hover"
    >
      <th scope="row" className="px-2.5 py-1.5 text-left font-medium text-ink">
        {pair.symbol}
      </th>
      <td
        className={cn(
          'tnum relative px-2.5 py-1.5 text-right text-ink',
          price?.movement === 'down' && 'text-sell'
        )}
      >
        {price ? formatRate(price.bid, pair.ratePrecision) : '—'}
      </td>
      <td
        className={cn(
          'tnum px-2.5 py-1.5 text-right text-ink',
          price?.movement === 'up' && 'text-buy'
        )}
      >
        {price ? formatRate(price.ask, pair.ratePrecision) : '—'}
      </td>
      <td className="tnum px-2.5 py-1.5 text-right text-ink-muted">
        {price ? spreadInPips(price, pair).toFixed(1) : '—'}
      </td>
      <td
        className={cn('tnum px-2.5 py-1.5 text-right font-medium', up ? 'text-buy' : 'text-sell')}
        data-testid={`rate-change-${pair.symbol}`}
      >
        {changePips === undefined ? '—' : `${up ? '+' : ''}${changePips.toFixed(1)}`}
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <div className="flex justify-end">
          <Sparkline
            values={history}
            width={54}
            height={16}
            stroke={up ? 'var(--color-buy)' : 'var(--color-sell)'}
            label={`${pair.symbol} trend`}
          />
        </div>
      </td>
    </tr>
  )
})
