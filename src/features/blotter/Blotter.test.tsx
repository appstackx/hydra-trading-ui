import { describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Blotter } from './Blotter'
import { createTestServices, renderWithServices } from '@/test/harness'
import { T0, trade } from '@/test/fixtures'
import * as download from '@/lib/download'

const SEED = [
  trade({
    id: 'TRD-000003',
    symbol: 'USDJPY',
    direction: 'Buy',
    notional: 250_000,
    rate: 152.418,
    tradeDate: T0 + 2_000,
    trader: 'R.SHARMA',
  }),
  trade({
    id: 'TRD-000002',
    symbol: 'GBPUSD',
    direction: 'Sell',
    notional: 5_000_000,
    rate: 1.2718,
    tradeDate: T0 + 1_000,
    status: 'Rejected',
    rejectionReason: 'No liquidity at size',
  }),
  trade({
    id: 'TRD-000001',
    symbol: 'EURUSD',
    direction: 'Buy',
    notional: 1_000_000,
    rate: 1.0842,
    tradeDate: T0,
  }),
]

function renderBlotter() {
  const services = createTestServices()
  services.tradeList.next(SEED)
  return renderWithServices(<Blotter />, { services })
}

const rowIds = (): string[] =>
  within(screen.getByTestId('blotter-table'))
    .getAllByRole('row')
    .slice(1) // drop the header row
    .map((row) => row.getAttribute('data-testid') ?? '')

describe('Blotter', () => {
  it('lists every trade, newest first', () => {
    renderBlotter()

    expect(rowIds()).toEqual([
      'blotter-row-TRD-000003',
      'blotter-row-TRD-000002',
      'blotter-row-TRD-000001',
    ])
  })

  it('shows size, rate and side for each trade', () => {
    renderBlotter()
    const row = screen.getByTestId('blotter-row-TRD-000001')

    expect(row).toHaveTextContent('EURUSD')
    expect(row).toHaveTextContent('Buy')
    expect(row).toHaveTextContent('1m')
    expect(row).toHaveTextContent('1.08420')
  })

  it('renders a yen cross at its own precision, not the default five decimals', () => {
    renderBlotter()

    expect(screen.getByTestId('blotter-row-TRD-000003')).toHaveTextContent('152.418')
  })

  it('marks a rejected trade and carries its reason', () => {
    renderBlotter()
    const row = screen.getByTestId('blotter-row-TRD-000002')

    expect(row).toHaveAttribute('data-status', 'Rejected')
    expect(row).toHaveAttribute('title', 'No liquidity at size')
  })

  it('reports how many rows are shown against the total', () => {
    renderBlotter()

    expect(screen.getByLabelText('Blotter')).toHaveTextContent('3/3')
  })

  it('filters to rejected trades only', async () => {
    const user = userEvent.setup()
    renderBlotter()

    await user.click(screen.getByTestId('blotter-filter-Rejected'))

    expect(rowIds()).toEqual(['blotter-row-TRD-000002'])
  })

  it('filters by free text across symbol and id', async () => {
    const user = userEvent.setup()
    renderBlotter()

    await user.type(screen.getByTestId('blotter-search'), 'eur')

    expect(rowIds()).toEqual(['blotter-row-TRD-000001'])
  })

  it('explains an empty result rather than showing a bare table', async () => {
    const user = userEvent.setup()
    renderBlotter()

    await user.type(screen.getByTestId('blotter-search'), 'zzzz')

    expect(screen.getByTestId('blotter-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('blotter-table')).not.toBeInTheDocument()
  })

  it('sorts by notional, then reverses on a second click', async () => {
    const user = userEvent.setup()
    renderBlotter()

    await user.click(screen.getByTestId('blotter-sort-notional'))
    expect(rowIds()).toEqual([
      'blotter-row-TRD-000002',
      'blotter-row-TRD-000001',
      'blotter-row-TRD-000003',
    ])

    await user.click(screen.getByTestId('blotter-sort-notional'))
    expect(rowIds()).toEqual([
      'blotter-row-TRD-000003',
      'blotter-row-TRD-000001',
      'blotter-row-TRD-000002',
    ])
  })

  it('announces the sorted column to assistive technology', async () => {
    const user = userEvent.setup()
    renderBlotter()

    await user.click(screen.getByTestId('blotter-sort-symbol'))

    expect(screen.getByRole('columnheader', { name: /Pair/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    )
  })

  it('exports what is on screen, not the whole blotter', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {})
    renderBlotter()

    await user.click(screen.getByTestId('blotter-filter-Rejected'))
    await user.click(screen.getByTestId('blotter-export'))

    expect(spy).toHaveBeenCalledTimes(1)
    const [contents, filename] = spy.mock.calls[0] ?? []
    expect(filename).toBe('blotter.csv')
    expect(contents).toContain('TRD-000002')
    expect(contents).not.toContain('TRD-000001')
  })

  it('picks up a trade recorded while it is open', () => {
    const { services } = renderBlotter()

    act(() => {
      services.trades.record(trade({ id: 'TRD-000004', tradeDate: T0 + 9_000 }))
    })

    expect(rowIds()[0]).toBe('blotter-row-TRD-000004')
  })

  it('shows an empty state when nothing has traded', () => {
    const services = createTestServices()
    renderWithServices(<Blotter />, { services })

    expect(screen.getByTestId('blotter-empty')).toBeInTheDocument()
  })
})
