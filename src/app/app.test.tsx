import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { ErrorBoundary } from './ErrorBoundary'
import { StatusBar } from './StatusBar'
import { ToastProvider, useToasts, TOAST_TIMEOUT_MS } from './ToastContext'
import { useServices } from './ServicesContext'
import { useTheme } from './ThemeContext'
import { createTestServices, renderWithServices } from '@/test/harness'
import { trade } from '@/test/fixtures'

describe('App', () => {
  it('renders every workspace region', () => {
    const services = createTestServices()
    render(<App services={services} />)

    expect(screen.getByRole('region', { name: 'Spot tiles' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Live rates' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Order management' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Blotter' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Analytics' })).toBeInTheDocument()
  })

  it('shows the product name from the brand configuration', () => {
    render(<App services={createTestServices()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hydra Terminal')
  })

  it('switches theme and remembers the choice', async () => {
    const user = userEvent.setup()
    render(<App services={createTestServices()} />)

    const before = document.documentElement.getAttribute('data-theme')
    await user.click(screen.getByTestId('theme-toggle'))

    expect(document.documentElement.getAttribute('data-theme')).not.toBe(before)
    expect(window.localStorage.getItem('hydra.theme')).toBe(
      document.documentElement.getAttribute('data-theme')
    )
  })

  it('opens tiles for the default instrument set', () => {
    render(<App services={createTestServices()} />)

    expect(screen.getByTestId('spot-tile-EURUSD')).toBeInTheDocument()
  })

  it('closes and reopens a tile from the instrument chips', async () => {
    const user = userEvent.setup()
    render(<App services={createTestServices()} />)

    await user.click(screen.getByTestId('tile-toggle-EURUSD'))
    expect(screen.queryByTestId('spot-tile-EURUSD')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('tile-toggle-EURUSD'))
    expect(screen.getByTestId('spot-tile-EURUSD')).toBeInTheDocument()
  })
})

describe('StatusBar', () => {
  it('reports the transport state and latency', () => {
    const services = createTestServices()
    renderWithServices(<StatusBar />, { services })

    expect(screen.getByTestId('connection-status')).toHaveTextContent('Live')
    expect(screen.getByTestId('latency')).toHaveTextContent('5 ms')
  })

  it('follows the connection as it degrades', () => {
    const services = createTestServices()
    renderWithServices(<StatusBar />, { services })

    act(() => {
      services.connectionSubject.next({ status: 'degraded', latencyMs: 180, service: 'test-feed' })
    })

    expect(screen.getByTestId('connection-status')).toHaveTextContent('Degraded')
  })

  it('counts trades and working orders', () => {
    const services = createTestServices()
    services.tradeList.next([trade({ id: 'a' }), trade({ id: 'b' })])
    renderWithServices(<StatusBar />, { services })

    expect(screen.getByTestId('trade-count')).toHaveTextContent('2 trades')
    expect(screen.getByTestId('working-count')).toHaveTextContent('0 working')
  })

  it('runs a clock', () => {
    vi.useFakeTimers()
    try {
      const services = createTestServices()
      renderWithServices(<StatusBar />, { services })
      const first = screen.getByTestId('clock').textContent

      act(() => {
        vi.advanceTimersByTime(2_000)
      })

      expect(screen.getByTestId('clock').textContent).not.toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ErrorBoundary', () => {
  function Boom(): never {
    throw new Error('analytics exploded')
  }

  it('contains a failure to its own region and names it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <>
        <ErrorBoundary label="Analytics">
          <Boom />
        </ErrorBoundary>
        <span data-testid="sibling">still trading</span>
      </>
    )

    expect(screen.getByTestId('error-boundary-Analytics')).toHaveTextContent(
      'Analytics is unavailable'
    )
    expect(screen.getByText('analytics exploded')).toBeInTheDocument()
    // The rest of the workspace keeps working.
    expect(screen.getByTestId('sibling')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary label="Blotter">
        <span data-testid="ok">rows</span>
      </ErrorBoundary>
    )

    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('offers a retry', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let shouldThrow = true

    function Flaky(): React.ReactNode {
      if (shouldThrow) throw new Error('transient')
      return <span data-testid="recovered">rows</span>
    }

    render(
      <ErrorBoundary label="Blotter">
        <Flaky />
      </ErrorBoundary>
    )

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByTestId('recovered')).toBeInTheDocument()
  })
})

describe('ToastProvider', () => {
  function Harness(): React.ReactNode {
    const { push, dismiss, toasts } = useToasts()
    return (
      <>
        <button type="button" onClick={() => push({ tone: 'success', title: 'Dealt' })}>
          push
        </button>
        <button type="button" onClick={() => toasts[0] && dismiss(toasts[0].id)}>
          dismiss
        </button>
      </>
    )
  }

  it('shows a toast and dismisses it on the close control', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )

    await user.click(screen.getByRole('button', { name: 'push' }))
    expect(screen.getByTestId('toast')).toHaveTextContent('Dealt')

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })

  it('announces assertively, because a rejection is time-critical', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )
    await user.click(screen.getByRole('button', { name: 'push' }))

    expect(screen.getByTestId('toast-viewport')).toHaveAttribute('aria-live', 'assertive')
  })

  it('expires a toast on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(
        <ToastProvider>
          <Harness />
        </ToastProvider>
      )

      await user.click(screen.getByRole('button', { name: 'push' }))
      expect(screen.getByTestId('toast')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TOAST_TIMEOUT_MS + 100)
      })

      expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps how many toasts can cover the workspace at once', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )

    for (let index = 0; index < 8; index += 1) {
      await user.click(screen.getByRole('button', { name: 'push' }))
    }

    expect(screen.getAllByTestId('toast')).toHaveLength(4)
  })

  it('refuses to be used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function Orphan(): React.ReactNode {
      useToasts()
      return null
    }

    expect(() => render(<Orphan />)).toThrow(/ToastProvider/)
  })
})

describe('context guards', () => {
  it('useServices refuses to be used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function Orphan(): React.ReactNode {
      useServices()
      return null
    }

    expect(() => render(<Orphan />)).toThrow(/ServicesProvider/)
  })

  it('useTheme refuses to be used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    function Orphan(): React.ReactNode {
      useTheme()
      return null
    }

    expect(() => render(<Orphan />)).toThrow(/ThemeProvider/)
  })
})

describe('workspace integration', () => {
  it('puts a trade dealt on a tile straight into the blotter and the position book', async () => {
    const user = userEvent.setup()
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    render(<App services={services} />)

    await user.click(
      screen
        .getAllByTestId('buy-button')
        .find((button) => button.closest('[data-testid="spot-tile-EURUSD"]')) ??
        screen.getAllByTestId('buy-button')[0]!
    )

    await waitFor(() => {
      expect(services.tradeList.value).toHaveLength(1)
    })
    const dealt = services.tradeList.value[0]
    expect(await screen.findByTestId(`blotter-row-${dealt?.id ?? ''}`)).toBeInTheDocument()
    expect(screen.getByTestId('stat-open')).toHaveTextContent('1')
    expect(screen.getByTestId('exposure-EUR')).toBeInTheDocument()
  })
})
