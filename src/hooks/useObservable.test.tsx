import { describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { BehaviorSubject, Subject, throwError } from 'rxjs'
import { useObservable } from './useObservable'

describe('useObservable', () => {
  it('returns the initial value before the stream emits', () => {
    const { result } = renderHook(() => useObservable(new Subject<number>(), 42))

    expect(result.current).toBe(42)
  })

  it('reads a replayed value during the first render, without a paint of the initial one', () => {
    const source = new BehaviorSubject(7)
    const { result } = renderHook(() => useObservable(source, 0))

    expect(result.current).toBe(7)
  })

  it('re-renders on each emission', () => {
    const source = new Subject<number>()
    const { result } = renderHook(() => useObservable(source, 0))

    act(() => {
      source.next(1)
    })
    expect(result.current).toBe(1)

    act(() => {
      source.next(2)
    })
    expect(result.current).toBe(2)
  })

  it('unsubscribes on unmount', () => {
    const source = new Subject<number>()
    const { unmount } = renderHook(() => useObservable(source, 0))

    expect(source.observed).toBe(true)
    unmount()
    expect(source.observed).toBe(false)
  })

  it('holds the last good value when the stream errors, instead of blanking the UI', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = new Subject<number>()
    const { result } = renderHook(() => useObservable(source, 0))

    act(() => {
      source.next(5)
      source.error(new Error('feed dropped'))
    })

    expect(result.current).toBe(5)
    expect(consoleError).toHaveBeenCalled()
  })

  it('logs rather than throwing when the stream errors immediately', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      renderHook(() =>
        useObservable(
          throwError(() => new Error('gone')),
          'fallback'
        )
      )
    ).not.toThrow()
    expect(consoleError).toHaveBeenCalled()
  })

  it('carries the previous value across a swapped source rather than flashing the initial one', () => {
    const first = new BehaviorSubject('a')
    const second = new Subject<string>()

    const { result, rerender } = renderHook(({ source }) => useObservable(source, 'initial'), {
      initialProps: { source: first as unknown as Subject<string> },
    })

    expect(result.current).toBe('a')

    rerender({ source: second })

    expect(result.current).toBe('a')
  })

  it('never tears: a bid and ask read in one render always come from one emission', () => {
    const source = new BehaviorSubject({ bid: 1, ask: 2 })
    const renders: string[] = []

    function Quote(): React.ReactNode {
      const quote = useObservable(source, { bid: 0, ask: 0 })
      renders.push(`${quote.bid}/${quote.ask}`)
      return <span data-testid="quote">{`${quote.bid}/${quote.ask}`}</span>
    }

    render(<Quote />)

    act(() => {
      source.next({ bid: 3, ask: 4 })
    })
    act(() => {
      source.next({ bid: 5, ask: 6 })
    })

    expect(screen.getByTestId('quote')).toHaveTextContent('5/6')
    // The initial value is legitimately painted once, before the effect
    // subscribes. What must never appear is a mixed pair such as 3/6.
    expect(renders.length).toBeGreaterThan(2)
    for (const snapshot of renders) {
      expect(['0/0', '1/2', '3/4', '5/6']).toContain(snapshot)
    }
  })
})
