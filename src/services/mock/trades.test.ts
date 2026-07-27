import { describe, expect, it } from 'vitest'
import type { Trade } from '@/domain'
import { InMemoryTradeStore, MAX_BLOTTER_ROWS } from './trades'
import { T0, trade } from '@/test/fixtures'

describe('InMemoryTradeStore', () => {
  it('starts empty', () => {
    expect(new InMemoryTradeStore().snapshot).toEqual([])
  })

  it('sorts seeded history newest first', () => {
    const store = new InMemoryTradeStore([
      trade({ id: 'old', tradeDate: T0 - 1000 }),
      trade({ id: 'new', tradeDate: T0 }),
    ])

    expect(store.snapshot.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('puts a newly recorded trade at the top of the blotter', () => {
    const store = new InMemoryTradeStore([trade({ id: 'existing' })])
    store.record(trade({ id: 'fresh' }))

    expect(store.snapshot.map((entry) => entry.id)).toEqual(['fresh', 'existing'])
  })

  it('publishes every change to subscribers', () => {
    const store = new InMemoryTradeStore()
    const seen: (readonly Trade[])[] = []
    store.trades$().subscribe((trades) => seen.push(trades))

    store.record(trade({ id: 'a' }))
    store.record(trade({ id: 'b' }))

    expect(seen.map((batch) => batch.length)).toEqual([0, 1, 2])
  })

  it('caps the blotter so a long session cannot grow without bound', () => {
    const store = new InMemoryTradeStore()

    for (let index = 0; index < MAX_BLOTTER_ROWS + 50; index += 1) {
      store.record(trade({ id: `t-${index}` }))
    }

    expect(store.snapshot).toHaveLength(MAX_BLOTTER_ROWS)
    expect(store.snapshot[0]?.id).toBe(`t-${MAX_BLOTTER_ROWS + 49}`)
  })

  it('caps seeded history at the same limit', () => {
    const seeded = Array.from({ length: MAX_BLOTTER_ROWS + 20 }, (_, index) =>
      trade({ id: `h-${index}`, tradeDate: T0 - index })
    )

    expect(new InMemoryTradeStore(seeded).snapshot).toHaveLength(MAX_BLOTTER_ROWS)
  })

  it('completes its stream on dispose', () => {
    const store = new InMemoryTradeStore()
    let completed = false
    store.trades$().subscribe({
      complete: () => {
        completed = true
      },
    })

    store.dispose()

    expect(completed).toBe(true)
  })
})
