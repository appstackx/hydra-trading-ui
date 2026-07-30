import { describe, expect, it } from 'vitest'
import {
  canCancel,
  canDeal,
  canView,
  initialsOf,
  roleLabel,
  visibleInstruments,
  VIEWER_ENTITLEMENTS,
  type User,
} from './auth'

const trader: User = {
  id: 'u-1',
  name: 'A. Whitfield',
  desk: 'G10 Spot',
  role: 'trader',
  entitlements: {
    instruments: [],
    maxNotional: 25_000_000,
    canTrade: true,
    canCancelAnyOrder: true,
    canOperateKillSwitch: true,
  },
}

const junior: User = {
  id: 'u-2',
  name: 'D. Osei',
  desk: 'G10 Spot',
  role: 'trader',
  entitlements: {
    instruments: ['EURUSD', 'GBPUSD'],
    maxNotional: 2_000_000,
    canTrade: true,
    canCancelAnyOrder: false,
    canOperateKillSwitch: false,
  },
}

const viewer: User = {
  id: 'u-3',
  name: 'M. Halvorsen',
  desk: 'Risk & Control',
  role: 'viewer',
  entitlements: VIEWER_ENTITLEMENTS,
}

describe('canView', () => {
  it('treats an empty instrument list as unrestricted', () => {
    expect(canView(trader, 'EURUSD')).toBe(true)
    expect(canView(trader, 'GBPJPY')).toBe(true)
  })

  it('restricts a user to their named instruments', () => {
    expect(canView(junior, 'EURUSD')).toBe(true)
    expect(canView(junior, 'GBPJPY')).toBe(false)
  })

  it('shows nothing to a signed-out session', () => {
    expect(canView(null, 'EURUSD')).toBe(false)
  })
})

describe('visibleInstruments', () => {
  const instruments = [{ symbol: 'EURUSD' }, { symbol: 'GBPUSD' }, { symbol: 'GBPJPY' }]

  it('returns everything for an unrestricted user', () => {
    expect(visibleInstruments(trader, instruments)).toHaveLength(3)
  })

  it('filters to the entitled set', () => {
    expect(visibleInstruments(junior, instruments).map((i) => i.symbol)).toEqual([
      'EURUSD',
      'GBPUSD',
    ])
  })

  it('returns nothing when signed out', () => {
    expect(visibleInstruments(null, instruments)).toEqual([])
  })

  it('lets a view-only user still see prices', () => {
    // Read-only means no dealing, not no market data.
    expect(visibleInstruments(viewer, instruments)).toHaveLength(3)
  })
})

describe('canDeal', () => {
  it('permits a trade inside the mandate', () => {
    expect(canDeal(trader, 'EURUSD', 1_000_000)).toEqual({ allowed: true })
  })

  it('refuses a signed-out session', () => {
    expect(canDeal(null, 'EURUSD', 1)).toEqual({ allowed: false, reason: 'Not signed in' })
  })

  it('refuses a view-only user and names the reason', () => {
    const result = canDeal(viewer, 'EURUSD', 1_000_000)

    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toContain('does not permit dealing')
  })

  it('refuses an instrument outside the entitlement', () => {
    const result = canDeal(junior, 'GBPJPY', 1_000_000)

    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toContain('GBPJPY')
  })

  it('refuses a size above the limit and quotes the limit back', () => {
    const result = canDeal(junior, 'EURUSD', 5_000_000)

    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toContain('2,000,000')
  })

  it('permits a size exactly at the limit', () => {
    expect(canDeal(junior, 'EURUSD', 2_000_000).allowed).toBe(true)
  })

  it.each([0, -1, Number.NaN])('refuses a quantity of %s', (notional) => {
    expect(canDeal(trader, 'EURUSD', notional).allowed).toBe(false)
  })

  it('checks permission to trade before permission on size', () => {
    // A viewer given an absurd size should be told they are read-only, not that
    // the size is too large — the first blocker is the useful message.
    const result = canDeal(viewer, 'EURUSD', 999_999_999)

    expect(result.allowed === false && result.reason).toContain('does not permit dealing')
  })
})

describe('canCancel', () => {
  it('lets a senior trader cancel anyone', () => {
    expect(canCancel(trader, 'someone-else')).toBe(true)
  })

  it('lets a junior cancel only their own', () => {
    expect(canCancel(junior, junior.id)).toBe(true)
    expect(canCancel(junior, 'someone-else')).toBe(false)
  })

  it('refuses a view-only user and a signed-out session', () => {
    expect(canCancel(viewer, viewer.id)).toBe(false)
    expect(canCancel(null, 'anyone')).toBe(false)
  })
})

describe('labels', () => {
  it.each([
    ['trader', 'Trader'],
    ['sales', 'Sales'],
    ['viewer', 'Read-only'],
  ] as const)('labels the %s role', (role, expected) => {
    expect(roleLabel(role)).toBe(expected)
  })

  it.each([
    ['A. Whitfield', 'AW'],
    ['M. Halvorsen', 'MH'],
    ['Prince', 'P'],
    ['jean-luc picard', 'JP'],
  ])('derives initials from %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })

  it('does not throw on an empty name', () => {
    expect(initialsOf('')).toBe('?')
  })
})
