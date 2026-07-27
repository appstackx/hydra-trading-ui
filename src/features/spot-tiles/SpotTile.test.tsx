import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpotTile, RESULT_DISPLAY_MS } from './SpotTile'
import { createTestServices, renderWithServices } from '@/test/harness'
import { EURUSD } from '@/test/fixtures'

function renderTile() {
  const services = createTestServices()
  services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
  const view = renderWithServices(<SpotTile pair={EURUSD} />, { services })
  return { ...view, services }
}

describe('SpotTile', () => {
  it('shows the pair and the two-way price split into big figure, pips and fraction', () => {
    renderTile()
    const tile = screen.getByTestId('spot-tile-EURUSD')

    expect(within(tile).getByRole('heading')).toHaveTextContent('EUR/USD')
    // The bid, 1.08416, rendered as 1.08 | 41 | 6.
    expect(within(tile).getByTestId('sell-button')).toHaveTextContent('1.08416')
    expect(within(tile).getByTestId('buy-button')).toHaveTextContent('1.08424')
  })

  it('quotes the buy at the offer and the sell at the bid', () => {
    renderTile()

    expect(screen.getByTestId('buy-button')).toHaveAttribute('data-rate', '1.08424')
    expect(screen.getByTestId('sell-button')).toHaveAttribute('data-rate', '1.08416')
  })

  it('shows the spread in pips', () => {
    renderTile()

    expect(screen.getByTestId('spot-tile-EURUSD')).toHaveTextContent('0.8')
  })

  it('labels each side for a screen reader with size, pair and rate', () => {
    renderTile()

    expect(screen.getByRole('button', { name: /Buy 1m EUR\/USD at 1\.08424/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sell 1m EUR\/USD at 1\.08416/ })).toBeInTheDocument()
  })

  it('offers no dealable rate until the first quote arrives', () => {
    const services = createTestServices(undefined, { seedPrices: false })
    renderWithServices(<SpotTile pair={EURUSD} />, { services })

    expect(screen.getByTestId('spot-tile-EURUSD-awaiting')).toBeInTheDocument()
    expect(screen.queryByTestId('buy-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sell-button')).not.toBeInTheDocument()
  })

  it('becomes dealable as soon as a quote lands', async () => {
    const services = createTestServices(undefined, { seedPrices: false })
    renderWithServices(<SpotTile pair={EURUSD} />, { services })

    await act(async () => {
      services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
      await Promise.resolve()
    })

    expect(screen.queryByTestId('spot-tile-EURUSD-awaiting')).not.toBeInTheDocument()
    expect(screen.getByTestId('buy-button')).toBeEnabled()
  })

  it('prefills the notional from the pair default', () => {
    renderTile()

    expect(screen.getByTestId('notional-input-EURUSD')).toHaveValue('1m')
  })

  it('sends the displayed rate and parsed notional to the venue', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    await user.clear(screen.getByTestId('notional-input-EURUSD'))
    await user.type(screen.getByTestId('notional-input-EURUSD'), '2.5m')
    await user.click(screen.getByTestId('buy-button'))

    await waitFor(() => {
      expect(services.executed).toHaveLength(1)
    })
    expect(services.executed[0]).toEqual({
      symbol: 'EURUSD',
      direction: 'Buy',
      notional: 2_500_000,
      rate: 1.08424,
    })
  })

  it('sells at the bid', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    await user.click(screen.getByTestId('sell-button'))

    await waitFor(() => {
      expect(services.executed[0]?.direction).toBe('Sell')
    })
    expect(services.executed[0]?.rate).toBe(1.08416)
  })

  it('confirms a completed trade on the tile and in the blotter', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    await user.click(screen.getByTestId('buy-button'))

    const overlay = await screen.findByTestId('tile-overlay-EURUSD')
    expect(overlay).toHaveAttribute('data-state', 'done')
    expect(overlay).toHaveTextContent('Bought 1m EURUSD')
    expect(services.tradeList.value).toHaveLength(1)
  })

  it('raises a success notification carrying the trade id', async () => {
    const user = userEvent.setup()
    renderTile()

    await user.click(screen.getByTestId('buy-button'))

    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('data-tone', 'success')
    expect(toast).toHaveTextContent('Bought 1m EURUSD')
  })

  it('shows the rejection reason and still records the attempt', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    services.nextExecution = (request) => ({
      kind: 'rejected',
      reason: 'Counterparty declined the request',
      trade: {
        id: 'TRD-000009',
        symbol: request.symbol,
        direction: request.direction,
        notional: request.notional,
        rate: request.rate,
        tradeDate: Date.now(),
        valueDate: '2026-07-29',
        status: 'Rejected',
        trader: 'TEST',
        dealtCurrency: 'EUR',
        rejectionReason: 'Counterparty declined the request',
      },
    })

    await user.click(screen.getByTestId('buy-button'))

    const overlay = await screen.findByTestId('tile-overlay-EURUSD')
    expect(overlay).toHaveAttribute('data-state', 'rejected')
    expect(overlay).toHaveTextContent('Counterparty declined the request')
    // Rejected tickets belong in the blotter — it is an audit trail.
    expect(services.tradeList.value[0]?.status).toBe('Rejected')
  })

  it('locks both sides while a ticket is in flight', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = services.execution.execute.bind(services.execution)
    vi.spyOn(services.execution, 'execute').mockImplementation(async (request) => {
      await gate
      return original(request)
    })

    await user.click(screen.getByTestId('buy-button'))

    expect(await screen.findByTestId('tile-overlay-EURUSD')).toHaveAttribute(
      'data-state',
      'executing'
    )
    expect(screen.getByTestId('buy-button')).toBeDisabled()
    expect(screen.getByTestId('sell-button')).toBeDisabled()

    await act(async () => {
      release?.()
      await gate
    })
  })

  it('returns to trading after the result has been shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderTile()

      await user.click(screen.getByTestId('buy-button'))
      await screen.findByTestId('tile-overlay-EURUSD')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESULT_DISPLAY_MS + 100)
      })

      expect(screen.queryByTestId('tile-overlay-EURUSD')).not.toBeInTheDocument()
      expect(screen.getByTestId('buy-button')).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses to deal on an unreadable notional', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()

    await user.clear(screen.getByTestId('notional-input-EURUSD'))
    await user.type(screen.getByTestId('notional-input-EURUSD'), 'abc')

    expect(screen.getByTestId('buy-button')).toBeDisabled()
    expect(screen.getByTestId('notional-input-EURUSD')).toHaveAttribute('aria-invalid', 'true')
    expect(services.executed).toHaveLength(0)
  })

  it('refuses to deal on an empty notional', async () => {
    const user = userEvent.setup()
    renderTile()

    await user.clear(screen.getByTestId('notional-input-EURUSD'))

    expect(screen.getByTestId('buy-button')).toBeDisabled()
  })

  it('reports an execution that never came back', async () => {
    const user = userEvent.setup()
    const { services } = renderTile()
    vi.spyOn(services.execution, 'execute').mockRejectedValue(new Error('Gateway unreachable'))

    await user.click(screen.getByTestId('buy-button'))

    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('data-tone', 'error')
    expect(toast).toHaveTextContent('Gateway unreachable')
    // The tile must go back to dealing rather than sticking on the spinner.
    expect(screen.queryByTestId('tile-overlay-EURUSD')).not.toBeInTheDocument()
  })

  it('follows the market as new quotes arrive', async () => {
    const { services } = renderTile()

    await act(async () => {
      services.tick('EURUSD', { mid: 1.09, bid: 1.08995, ask: 1.09005, movement: 'up' })
      await Promise.resolve()
    })

    expect(screen.getByTestId('buy-button')).toHaveAttribute('data-rate', '1.09005')
  })
})
