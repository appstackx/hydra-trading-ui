import { describe, expect, it } from 'vitest'
import {
  clearSession,
  loadSession,
  MAX_PERSISTED_ORDERS,
  MAX_PERSISTED_TRADES,
  nextSequenceAfter,
  saveSession,
  sessionStorageKey,
} from './session-store'
import { order, T0, trade } from '@/test/fixtures'

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
}

const KEY = sessionStorageKey('demo', 42)

describe('sessionStorageKey', () => {
  it('separates feeds and seeds, so sessions cannot bleed into each other', () => {
    expect(sessionStorageKey('demo', 1)).not.toBe(sessionStorageKey('demo', 2))
    expect(sessionStorageKey('demo', 1)).not.toBe(sessionStorageKey('live', 1))
  })
})

describe('save and load', () => {
  it('round-trips trades and orders', () => {
    const storage = memoryStorage()
    const trades = [trade({ id: 'TRD-000001' }), trade({ id: 'HST-000002' })]
    const orders = [order({ id: 'ORD-000001' })]

    saveSession(storage, KEY, trades, orders, T0)
    const restored = loadSession(storage, KEY)

    expect(restored?.trades).toEqual(trades)
    expect(restored?.orders).toEqual(orders)
    expect(restored?.savedAt).toBe(T0)
  })

  it('returns null when nothing was saved', () => {
    expect(loadSession(memoryStorage(), KEY)).toBeNull()
  })

  it('returns null for corrupt JSON rather than crashing the boot', () => {
    expect(loadSession(memoryStorage({ [KEY]: '{oops' }), KEY)).toBeNull()
  })

  it('returns null for a wrong version or shape', () => {
    expect(
      loadSession(memoryStorage({ [KEY]: JSON.stringify({ version: 2, trades: [], orders: [] }) }), KEY)
    ).toBeNull()
    expect(
      loadSession(memoryStorage({ [KEY]: JSON.stringify({ version: 1, trades: 'no' }) }), KEY)
    ).toBeNull()
  })

  it('filters implausible rows smuggled into the store', () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify({
        version: 1,
        savedAt: T0,
        trades: [trade({ id: 'TRD-000001' }), { junk: true }, { id: 'x' }],
        orders: [order({ id: 'ORD-000001' }), 42, null],
      }),
    })

    const restored = loadSession(storage, KEY)

    expect(restored?.trades).toHaveLength(1)
    expect(restored?.orders).toHaveLength(1)
  })

  it('bounds what it saves', () => {
    const storage = memoryStorage()
    const trades = Array.from({ length: MAX_PERSISTED_TRADES + 50 }, (_, index) =>
      trade({ id: `TRD-${String(index).padStart(6, '0')}` })
    )

    saveSession(storage, KEY, trades, [], T0)

    // Asserted on the raw store, so this fails if the save bound alone is
    // deleted — a load-side bound must not be able to mask it.
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}') as { trades: unknown[] }
    expect(raw.trades).toHaveLength(MAX_PERSISTED_TRADES)
  })

  it('bounds what it loads, independently of the save bound', () => {
    const storage = memoryStorage()
    // Planted directly, bypassing saveSession, as a crafted store would.
    storage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        savedAt: T0,
        trades: Array.from({ length: MAX_PERSISTED_TRADES + 50 }, (_, index) =>
          trade({ id: `TRD-${String(index).padStart(6, '0')}` })
        ),
        orders: Array.from({ length: MAX_PERSISTED_ORDERS + 20 }, (_, index) =>
          order({ id: `ORD-${String(index).padStart(6, '0')}` })
        ),
      })
    )

    const restored = loadSession(storage, KEY)

    expect(restored?.trades).toHaveLength(MAX_PERSISTED_TRADES)
    expect(restored?.orders).toHaveLength(MAX_PERSISTED_ORDERS)
  })

  it('rejects an id long enough to overflow the sequence parser', () => {
    // 23 digits: parseInt succeeds but Number precision is gone; the parser
    // must skip it or every future id would collide at the same value.
    expect(nextSequenceAfter(['TRD-99999999999999999999999', 'TRD-000004'], 'TRD')).toBe(4)
  })

  it('survives a store that refuses the write', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }

    expect(() => {
      saveSession(hostile, KEY, [trade()], [], T0)
    }).not.toThrow()
  })

  it('clears', () => {
    const storage = memoryStorage()
    saveSession(storage, KEY, [trade()], [], T0)

    clearSession(storage, KEY)

    expect(loadSession(storage, KEY)).toBeNull()
  })
})

describe('nextSequenceAfter', () => {
  it('finds the highest sequence for a prefix', () => {
    expect(nextSequenceAfter(['TRD-000003', 'TRD-000041', 'TRD-000007'], 'TRD')).toBe(41)
  })

  it('ignores other prefixes and malformed ids', () => {
    expect(nextSequenceAfter(['HST-000099', 'FIL-000005', 'TRD-abc', 'TRD-000002'], 'TRD')).toBe(2)
  })

  it('returns zero for an empty history, so the first id is 000001', () => {
    expect(nextSequenceAfter([], 'TRD')).toBe(0)
    expect(nextSequenceAfter(['HST-000009'], 'TRD')).toBe(0)
  })
})
