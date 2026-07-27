import { describe, expect, it } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { LiveRates } from './LiveRates'
import { createTestServices, renderWithServices } from '@/test/harness'

describe('LiveRates', () => {
  it('lists every instrument the venue quotes', () => {
    const services = createTestServices()
    renderWithServices(<LiveRates />, { services })

    expect(screen.getByTestId('rate-row-EURUSD')).toBeInTheDocument()
    expect(screen.getByTestId('rate-row-USDJPY')).toBeInTheDocument()
    expect(screen.getByLabelText('Live rates')).toHaveTextContent('2 pairs')
  })

  it('shows bid, ask and spread', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.0842, bid: 1.08416, ask: 1.08424 })
    renderWithServices(<LiveRates />, { services })

    const row = screen.getByTestId('rate-row-EURUSD')
    expect(row).toHaveTextContent('1.08416')
    expect(row).toHaveTextContent('1.08424')
    expect(row).toHaveTextContent('0.8')
  })

  it('renders a yen cross at three decimals', () => {
    const services = createTestServices()
    services.tick('USDJPY', { mid: 152.418, bid: 152.413, ask: 152.423 })
    renderWithServices(<LiveRates />, { services })

    expect(screen.getByTestId('rate-row-USDJPY')).toHaveTextContent('152.413')
  })

  it('reports no change until a second quote gives it something to compare', () => {
    const services = createTestServices()
    renderWithServices(<LiveRates />, { services })

    expect(screen.getByTestId('rate-change-EURUSD')).toHaveTextContent('+0.0')
  })

  it('measures the move in pips across the session window', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.085, bid: 1.08495, ask: 1.08505 })
    renderWithServices(<LiveRates />, { services })

    act(() => {
      services.tick('EURUSD', { mid: 1.0855, bid: 1.08545, ask: 1.08555 })
    })

    expect(screen.getByTestId('rate-change-EURUSD')).toHaveTextContent('+5.0')
  })

  it('shows a fall as a negative move', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.085 })
    renderWithServices(<LiveRates />, { services })

    act(() => {
      services.tick('EURUSD', { mid: 1.0847 })
    })

    expect(screen.getByTestId('rate-change-EURUSD')).toHaveTextContent('-3.0')
  })

  it('waits for a quote rather than printing a placeholder rate', () => {
    const services = createTestServices(undefined, { seedPrices: false })
    renderWithServices(<LiveRates />, { services })

    const row = screen.getByTestId('rate-row-EURUSD')
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('gives each row a trend chart labelled for assistive technology', () => {
    const services = createTestServices()
    services.tick('EURUSD', { mid: 1.085 })
    renderWithServices(<LiveRates />, { services })

    act(() => {
      services.tick('EURUSD', { mid: 1.086 })
    })

    expect(screen.getByRole('img', { name: 'EURUSD trend' })).toBeInTheDocument()
  })
})
