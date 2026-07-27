import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { Panel } from './Panel'
import { Sparkline } from './Sparkline'
import { cn } from '@/lib/cn'

describe('Button', () => {
  it('defaults to a non-submitting button, so it cannot fire a surrounding form', () => {
    render(<Button>Deal</Button>)

    expect(screen.getByRole('button', { name: 'Deal' })).toHaveAttribute('type', 'button')
  })

  it('can opt into submitting', () => {
    render(<Button type="submit">Send</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls its handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)

    await user.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>
    )

    await user.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })

  it.each(['primary', 'ghost', 'buy', 'sell', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>X</Button>)

      expect(screen.getByRole('button')).toBeInTheDocument()
    }
  )

  it('forwards extra props such as a test id', () => {
    render(<Button data-testid="custom">X</Button>)

    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })
})

describe('Panel', () => {
  it('names the region for assistive technology and titles it visibly', () => {
    render(<Panel title="Blotter">rows</Panel>)

    expect(screen.getByRole('region', { name: 'Blotter' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Blotter' })).toBeInTheDocument()
  })

  it('renders meta and actions alongside the title', () => {
    render(
      <Panel title="Blotter" meta="3/3" actions={<button type="button">Export</button>}>
        rows
      </Panel>
    )

    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('omits the meta slot when there is nothing to say', () => {
    render(<Panel title="Blotter">rows</Panel>)

    expect(screen.getByRole('region', { name: 'Blotter' })).toHaveTextContent('Blotter')
  })

  it('drops body padding for a full-bleed child', () => {
    const { container } = render(
      <Panel title="Grid" flush>
        <span>cells</span>
      </Panel>
    )

    expect(container.querySelector('.p-3')).toBeNull()
  })
})

describe('Sparkline', () => {
  it('renders nothing meaningful below two points', () => {
    const { container } = render(<Sparkline values={[1]} />)

    expect(container.querySelector('polyline')).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('plots one point per value', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4]} />)

    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(4)
  })

  it('spans the full width from first point to last', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} width={100} />)
    const points = container.querySelector('polyline')?.getAttribute('points')?.split(' ') ?? []

    expect(points[0]).toMatch(/^0\.00,/)
    expect(points[2]).toMatch(/^100\.00,/)
  })

  it('draws a flat series down the middle instead of dividing by zero', () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} height={20} />)
    const points = container.querySelector('polyline')?.getAttribute('points') ?? ''

    expect(points).not.toContain('NaN')
    expect(points).toContain('20.00')
  })

  it('inverts the y axis, so a rising series rises on screen', () => {
    const { container } = render(<Sparkline values={[1, 10]} height={20} />)
    const [first, last] = (container.querySelector('polyline')?.getAttribute('points') ?? '').split(
      ' '
    )

    expect(Number(first?.split(',')[1])).toBeGreaterThan(Number(last?.split(',')[1]))
  })

  it('adds a gradient fill only when asked', () => {
    const { container: plain } = render(<Sparkline values={[1, 2]} />)
    const { container: filled } = render(<Sparkline values={[1, 2]} filled />)

    expect(plain.querySelector('polygon')).toBeNull()
    expect(filled.querySelector('polygon')).not.toBeNull()
  })

  it('carries an accessible label', () => {
    render(<Sparkline values={[1, 2]} label="EURUSD trend" />)

    expect(screen.getByRole('img', { name: 'EURUSD trend' })).toBeInTheDocument()
  })

  it('falls back to a generic label', () => {
    render(<Sparkline values={[1, 2]} />)

    expect(screen.getByRole('img', { name: 'Price trend' })).toBeInTheDocument()
  })
})

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops every falsy form', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('')
  })
})
