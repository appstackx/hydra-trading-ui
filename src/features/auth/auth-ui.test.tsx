import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { SpotTile } from '@/features/spot-tiles/SpotTile'
import { OrderTicket } from '@/features/orders/OrderTicket'
import { createTestServices, renderWithServices } from '@/test/harness'
import { EURUSD } from '@/test/fixtures'
import { DEMO_USERS } from '@/services'

const SENIOR = DEMO_USERS[0]!
const JUNIOR = DEMO_USERS[1]!
const VIEWER = DEMO_USERS[2]!

describe('sign-in gate', () => {
  it('shows the sign-in screen and no workspace when signed out', () => {
    const services = createTestServices(undefined, { user: null })
    render(<App services={services} />)

    expect(screen.getByTestId('sign-in')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument()
  })

  it('lists each demo user with their permissions visible', () => {
    const services = createTestServices(undefined, { user: null })
    render(<App services={services} />)

    expect(screen.getByText(/A\. Whitfield/)).toBeInTheDocument()
    expect(screen.getByText(/View only/)).toBeInTheDocument()
    expect(screen.getByText(/Up to 100m/)).toBeInTheDocument()
  })

  it('opens the workspace after signing in', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: null })
    render(<App services={services} />)

    await user.click(screen.getByTestId('sign-in-submit'))

    expect(await screen.findByTestId('workspace')).toBeInTheDocument()
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument()
  })

  it('refuses an empty passphrase and says so', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: null })
    render(<App services={services} />)

    await user.clear(screen.getByTestId('sign-in-passphrase'))
    await user.click(screen.getByTestId('sign-in-submit'))

    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent('passphrase')
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument()
  })

  it('shows the signed-in user in the title bar', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    render(<App services={services} />)

    expect(screen.getByTestId('current-user')).toHaveTextContent('A. Whitfield')
  })

  it('returns to sign-in on sign-out, tearing the workspace down', async () => {
    const user = userEvent.setup()
    const services = createTestServices(undefined, { user: SENIOR })
    render(<App services={services} />)

    await user.click(screen.getByTestId('sign-out'))

    expect(await screen.findByTestId('sign-in')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument()
  })
})

describe('entitlement enforcement on a tile', () => {
  function renderTileAs(user: (typeof DEMO_USERS)[number]) {
    const services = createTestServices(undefined, { user })
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    return renderWithServices(<SpotTile pair={EURUSD} />, { services })
  }

  it('lets a senior trader deal', () => {
    renderTileAs(SENIOR)

    expect(screen.getByTestId('buy-button')).toBeEnabled()
    expect(screen.queryByTestId('entitlement-block-EURUSD')).not.toBeInTheDocument()
  })

  it('disables both sides for a read-only user and says why', () => {
    renderTileAs(VIEWER)

    expect(screen.getByTestId('buy-button')).toBeDisabled()
    expect(screen.getByTestId('sell-button')).toBeDisabled()
    expect(screen.getByTestId('entitlement-block-EURUSD')).toHaveTextContent(/does not permit dealing/)
  })

  it('still streams prices to a read-only user', () => {
    renderTileAs(VIEWER)

    // Read-only means no dealing, not no market data.
    expect(screen.getByTestId('buy-button')).toHaveAttribute('data-rate', '1.08424')
  })

  it('blocks a junior the moment the size exceeds their mandate', async () => {
    const user = userEvent.setup()
    renderTileAs(JUNIOR)

    expect(screen.getByTestId('buy-button')).toBeEnabled()

    await user.clear(screen.getByTestId('notional-input-EURUSD'))
    await user.type(screen.getByTestId('notional-input-EURUSD'), '5m')

    expect(screen.getByTestId('buy-button')).toBeDisabled()
    expect(screen.getByTestId('entitlement-block-EURUSD')).toHaveTextContent('2,000,000')
  })

  it('re-enables the junior when the size comes back inside the limit', async () => {
    const user = userEvent.setup()
    renderTileAs(JUNIOR)

    await user.clear(screen.getByTestId('notional-input-EURUSD'))
    await user.type(screen.getByTestId('notional-input-EURUSD'), '5m')
    expect(screen.getByTestId('buy-button')).toBeDisabled()

    await user.clear(screen.getByTestId('notional-input-EURUSD'))
    await user.type(screen.getByTestId('notional-input-EURUSD'), '1m')

    expect(screen.getByTestId('buy-button')).toBeEnabled()
  })

  it('never sends a ticket the entitlements refuse', async () => {
    const user = userEvent.setup()
    const { services } = renderTileAs(VIEWER)

    await user.click(screen.getByTestId('buy-button'))

    expect(services.executed).toHaveLength(0)
  })
})

describe('entitlement enforcement in the workspace', () => {
  it('hides instruments the user is not entitled to see', () => {
    const services = createTestServices(undefined, { user: JUNIOR })
    render(<App services={services} />)

    // The junior is entitled to EURUSD but not USDJPY.
    expect(screen.getByTestId('tile-toggle-EURUSD')).toBeInTheDocument()
    expect(screen.queryByTestId('tile-toggle-USDJPY')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rate-row-USDJPY')).not.toBeInTheDocument()
  })

  it('shows every instrument to an unrestricted user', () => {
    const services = createTestServices(undefined, { user: SENIOR })
    render(<App services={services} />)

    expect(screen.getByTestId('tile-toggle-USDJPY')).toBeInTheDocument()
    expect(screen.getByTestId('rate-row-USDJPY')).toBeInTheDocument()
  })
})

describe('entitlement enforcement on the order ticket', () => {
  function renderTicketAs(user: (typeof DEMO_USERS)[number]) {
    const services = createTestServices(undefined, { user })
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    return renderWithServices(<OrderTicket />, { services })
  }

  it('disables submission for a read-only user', () => {
    renderTicketAs(VIEWER)

    expect(screen.getByTestId('order-submit')).toBeDisabled()
    expect(screen.getByTestId('order-entitlement-block')).toHaveTextContent(/does not permit dealing/)
  })

  it('blocks a junior on an oversized order', async () => {
    const user = userEvent.setup()
    renderTicketAs(JUNIOR)

    await user.clear(screen.getByTestId('order-quantity'))
    await user.type(screen.getByTestId('order-quantity'), '10m')

    expect(screen.getByTestId('order-submit')).toBeDisabled()
    expect(screen.getByTestId('order-entitlement-block')).toHaveTextContent('2,000,000')
  })

  it('offers only entitled instruments in the pair selector', () => {
    renderTicketAs(JUNIOR)

    const options = screen
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)

    expect(options).toContain('EURUSD')
    expect(options).not.toContain('USDJPY')
  })

  it('lets a senior trader submit', async () => {
    const user = userEvent.setup()
    const { services } = renderTicketAs(SENIOR)

    await user.type(screen.getByTestId('order-limit'), '1.08')
    await user.click(screen.getByTestId('order-submit'))

    await waitFor(() => {
      expect(services.orderList.value).toHaveLength(1)
    })
  })
})
