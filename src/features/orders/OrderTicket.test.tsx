import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTicket } from './OrderTicket'
import { OrderBook } from './OrderBook'
import { createTestServices, renderWithServices } from '@/test/harness'

function renderTicket() {
  const services = createTestServices()
  services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
  return renderWithServices(<OrderTicket />, { services })
}

describe('OrderTicket', () => {
  it('opens on a buy limit, good-til-cancelled', () => {
    renderTicket()

    expect(screen.getByTestId('order-side-Buy')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('order-type-Limit')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('order-tif-GTC')).toHaveAttribute('aria-pressed', 'true')
  })

  it('submits a limit order with the entered terms', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.clear(screen.getByTestId('order-quantity'))
    await user.type(screen.getByTestId('order-quantity'), '2.5m')
    await user.type(screen.getByTestId('order-limit'), '1.08000')
    await user.click(screen.getByTestId('order-submit'))

    await waitFor(() => {
      expect(services.orderList.value).toHaveLength(1)
    })
    expect(services.orderList.value[0]).toMatchObject({
      symbol: 'EURUSD',
      direction: 'Buy',
      orderType: 'Limit',
      quantity: 2_500_000,
      limitPrice: 1.08,
      timeInForce: 'GTC',
      status: 'Working',
    })
  })

  it('switches to a sell', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.click(screen.getByTestId('order-side-Sell'))
    await user.type(screen.getByTestId('order-limit'), '1.09')
    await user.click(screen.getByTestId('order-submit'))

    await waitFor(() => {
      expect(services.orderList.value[0]?.direction).toBe('Sell')
    })
  })

  it('hides the limit field for a market order and submits without a price', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.click(screen.getByTestId('order-type-Market'))
    expect(screen.queryByTestId('order-limit')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('order-submit'))

    await waitFor(() => {
      expect(services.orderList.value).toHaveLength(1)
    })
    expect(services.orderList.value[0]?.limitPrice).toBeUndefined()
  })

  it('prefills the limit from the touch price on the side being traded', async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.click(screen.getByTestId('order-use-touch'))
    expect(screen.getByTestId('order-limit')).toHaveValue('1.08424') // the offer

    await user.click(screen.getByTestId('order-side-Sell'))
    await user.click(screen.getByTestId('order-use-touch'))
    expect(screen.getByTestId('order-limit')).toHaveValue('1.08416') // the bid
  })

  it('refuses a limit order with no price and says why', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.click(screen.getByTestId('order-submit'))

    expect(await screen.findByText('Limit orders need a price')).toBeInTheDocument()
    expect(services.orderList.value).toHaveLength(0)
    expect(screen.getByTestId('order-limit')).toHaveAttribute('aria-invalid', 'true')
  })

  it('refuses an unreadable quantity', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.clear(screen.getByTestId('order-quantity'))
    await user.type(screen.getByTestId('order-quantity'), 'abc')
    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    expect(await screen.findByText(/greater than zero/)).toBeInTheDocument()
    expect(services.orderList.value).toHaveLength(0)
  })

  it('refuses a quantity above the ticket limit', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.clear(screen.getByTestId('order-quantity'))
    await user.type(screen.getByTestId('order-quantity'), '500m')

    // Limits are layered: the signed-in trader's own mandate binds well before
    // the venue-wide ticket cap, so that is the message the user should see.
    // `validateOrderDraft` covers the venue cap exhaustively in its own test.
    expect(await screen.findByTestId('order-entitlement-block')).toHaveTextContent(/exceeds/i)
    expect(screen.getByTestId('order-submit')).toBeDisabled()
    expect(services.orderList.value).toHaveLength(0)
  })

  it('blocks a limit priced a slipped-decimal away from the market', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    // 10.842 against a 1.0842 mid: the classic fat finger, ~90,000 bps out.
    await user.type(screen.getByTestId('order-limit'), '10.842')

    expect(await screen.findByTestId('order-entitlement-block')).toHaveTextContent(
      /bps from the market/
    )
    expect(screen.getByTestId('order-submit')).toBeDisabled()
    expect(services.orderList.value).toHaveLength(0)
  })

  it('accepts a limit inside the fat-finger band', async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.type(screen.getByTestId('order-limit'), '1.08000')

    expect(screen.queryByTestId('order-entitlement-block')).not.toBeInTheDocument()
    expect(screen.getByTestId('order-submit')).toBeEnabled()
  })

  it('audits a submitted order with its terms and the market at submit', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()

    await user.type(screen.getByTestId('order-limit'), '1.08000')
    await user.click(screen.getByTestId('order-submit'))

    await waitFor(() => {
      expect(
        services.auditEvents.value.some((event) => event.type === 'order.submitted')
      ).toBe(true)
    })
    const event = services.auditEvents.value.find((entry) => entry.type === 'order.submitted')
    expect(event?.details).toMatchObject({
      symbol: 'EURUSD',
      limitPrice: 1.08,
      marketMidAtSubmit: 1.0842,
    })
  })

  it('stays quiet about errors until the ticket is submitted', async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.clear(screen.getByTestId('order-quantity'))

    expect(screen.queryByText(/greater than zero/)).not.toBeInTheDocument()
  })

  it('confirms a working order with a notification', async () => {
    const user = userEvent.setup()
    renderTicket()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveTextContent('Buy 1m EURUSD working')
  })

  it('reports a rejection from the order service', async () => {
    const user = userEvent.setup()
    const { services } = renderTicket()
    vi.spyOn(services.orders, 'submit').mockRejectedValue(new Error('Risk limit breached'))

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('data-tone', 'error')
    expect(toast).toHaveTextContent('Risk limit breached')
  })
})

describe('OrderBook', () => {
  function renderBook() {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    return renderWithServices(
      <>
        <OrderTicket />
        <OrderBook />
      </>,
      { services }
    )
  }

  it('invites an order when the book is empty', () => {
    renderBook()

    expect(screen.getByTestId('order-book-empty')).toBeInTheDocument()
  })

  it('lists a submitted order with its terms', async () => {
    const user = userEvent.setup()
    renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    const row = await screen.findByTestId('order-row-ORD-000001')
    expect(row).toHaveAttribute('data-status', 'Working')
    expect(row).toHaveTextContent('EURUSD')
    expect(row).toHaveTextContent('1m')
    expect(row).toHaveTextContent('Limit')
    expect(row).toHaveTextContent('GTC')
  })

  it('counts the working orders', async () => {
    const user = userEvent.setup()
    renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    expect(await screen.findByText(/1 working/)).toBeInTheDocument()
  })

  it('cancels an order from its row', async () => {
    const user = userEvent.setup()
    const { services } = renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))
    await screen.findByTestId('order-row-ORD-000001')

    await user.click(screen.getByTestId('order-cancel-ORD-000001'))

    await waitFor(() => {
      expect(services.orderList.value[0]?.status).toBe('Cancelled')
    })
    expect(screen.getByTestId('order-row-ORD-000001')).toHaveAttribute('data-status', 'Cancelled')
  })

  it('offers no cancel on an order that has finished', async () => {
    const user = userEvent.setup()
    const { services } = renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))
    await screen.findByTestId('order-row-ORD-000001')

    act(() => {
      services.orderList.next(
        services.orderList.value.map((order) => ({ ...order, status: 'Filled' as const }))
      )
    })

    expect(screen.queryByTestId('order-cancel-ORD-000001')).not.toBeInTheDocument()
  })

  it('hides completed orders on request', async () => {
    const user = userEvent.setup()
    const { services } = renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))
    await screen.findByTestId('order-row-ORD-000001')

    act(() => {
      services.orderList.next(
        services.orderList.value.map((order) => ({ ...order, status: 'Cancelled' as const }))
      )
    })
    await user.click(screen.getByTestId('order-book-toggle-completed'))

    expect(screen.queryByTestId('order-row-ORD-000001')).not.toBeInTheDocument()
    expect(screen.getByTestId('order-book-empty')).toBeInTheDocument()
  })

  it('shows fill progress for a partially filled order', async () => {
    const user = userEvent.setup()
    const { services } = renderBook()

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))
    await screen.findByTestId('order-row-ORD-000001')

    act(() => {
      services.orderList.next(
        services.orderList.value.map((order) => ({
          ...order,
          status: 'PartiallyFilled' as const,
          filledQuantity: 250_000,
          averageFillPrice: 1.08,
        }))
      )
    })

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByTestId('order-row-ORD-000001')).toHaveTextContent('250k filled @ 1.08000')
    expect(screen.getByTestId('order-row-ORD-000001')).toHaveTextContent('750k left')
  })
})
