import { describe, expect, it } from 'vitest'
import { act, screen } from '@testing-library/react'
import { Analytics } from './Analytics'
import { PnlChart } from './PnlChart'
import { createTestServices, renderWithServices } from '@/test/harness'
import { T0, trade } from '@/test/fixtures'

/** Long 1m EURUSD at 1.08, marked at 1.09 → +10,000 USD. */
function renderWithLongEur() {
  const services = createTestServices()
  services.tick('EURUSD', { mid: 1.09, bid: 1.08995, ask: 1.09005 })
  services.tradeList.next([trade({ rate: 1.08, notional: 1_000_000, tradeDate: T0 })])
  return renderWithServices(<Analytics />, { services })
}

describe('Analytics', () => {
  it('shows book P&L in the reporting currency', () => {
    renderWithLongEur()

    expect(screen.getByTestId('stat-total-pnl')).toHaveTextContent('+10k')
  })

  it('counts open positions', () => {
    renderWithLongEur()

    expect(screen.getByTestId('stat-open')).toHaveTextContent('1')
  })

  it('separates realised from total', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.09, bid: 1.08995, ask: 1.09005 })
    services.tradeList.next([
      trade({ id: 'a', rate: 1.08, notional: 2_000_000, tradeDate: T0 }),
      trade({
        id: 'b',
        rate: 1.085,
        notional: 1_000_000,
        direction: 'Sell',
        tradeDate: T0 + 1_000,
      }),
    ])
    renderWithServices(<Analytics />, { services })

    expect(screen.getByTestId('stat-realised')).toHaveTextContent('+5,000.00')
  })

  it('breaks the book down into per-currency exposure', () => {
    renderWithLongEur()

    expect(screen.getByTestId('exposure-EUR')).toHaveTextContent('1m')
    expect(screen.getByTestId('exposure-USD')).toHaveTextContent('-1.08m')
  })

  it('reports a flat book rather than an empty panel', () => {
    const services = createTestServices()
    renderWithServices(<Analytics />, { services })

    expect(screen.getByTestId('exposures-empty')).toBeInTheDocument()
    expect(screen.getByTestId('stat-open')).toHaveTextContent('0')
  })

  it('drops a position that has been closed out from the exposure list', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.09 })
    services.tradeList.next([
      trade({ id: 'a', rate: 1.08, notional: 1_000_000, tradeDate: T0 }),
      trade({
        id: 'b',
        rate: 1.09,
        notional: 1_000_000,
        direction: 'Sell',
        tradeDate: T0 + 1_000,
      }),
    ])
    renderWithServices(<Analytics />, { services })

    expect(screen.getByTestId('exposures-empty')).toBeInTheDocument()
  })

  it('re-marks P&L as the market moves', () => {
    const { services } = renderWithLongEur()

    act(() => {
      services.tick('EURUSD', { mid: 1.1, bid: 1.09995, ask: 1.10005 })
    })

    expect(screen.getByTestId('stat-total-pnl')).toHaveTextContent('+20k')
  })

  it('flags a position it cannot convert instead of silently excluding it', () => {
    const services = createTestServices()
    services.tradeList.next([trade({ symbol: 'GBPCHF', rate: 1.1, dealtCurrency: 'GBP' })])
    renderWithServices(<Analytics />, { services })

    expect(screen.getByTestId('pnl-caveat')).toHaveTextContent('GBPCHF')
  })
})

describe('PnlChart', () => {
  it('says it is still collecting when there is nothing to plot', () => {
    renderWithServices(<PnlChart values={[]} />)

    expect(screen.getByTestId('pnl-chart-empty')).toBeInTheDocument()
  })

  it('needs two points before it draws a line', () => {
    renderWithServices(<PnlChart values={[5]} />)

    expect(screen.getByTestId('pnl-chart-empty')).toBeInTheDocument()
  })

  it('plots a series and describes it for assistive technology', () => {
    renderWithServices(<PnlChart values={[0, 100, -50, 250]} />)

    const chart = screen.getByTestId('pnl-chart')
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('250.00'))
    expect(chart.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(4)
  })

  it('keeps break-even inside the plot, so a profitable run is not rescaled to fill it', () => {
    renderWithServices(<PnlChart values={[100, 120, 140]} />)

    // The dashed zero line must be drawn within the viewBox height of 90.
    const zeroLine = screen.getByTestId('pnl-chart').querySelector('line')
    const y = Number(zeroLine?.getAttribute('y1'))
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(90)
  })

  it('draws a flat series without dividing by a zero range', () => {
    renderWithServices(<PnlChart values={[0, 0, 0]} />)

    const points = screen.getByTestId('pnl-chart').querySelector('polyline')?.getAttribute('points')
    expect(points).not.toContain('NaN')
  })
})
