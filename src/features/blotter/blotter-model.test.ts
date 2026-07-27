import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  DEFAULT_SORT,
  EMPTY_FILTER,
  filterTrades,
  nextSort,
  sortTrades,
  tradesToCsv,
} from './blotter-model'
import { T0, trade } from '@/test/fixtures'

const TRADES = [
  trade({
    id: 'TRD-000001',
    symbol: 'EURUSD',
    direction: 'Buy',
    notional: 1_000_000,
    rate: 1.08,
    tradeDate: T0,
    trader: 'AXDEMO',
  }),
  trade({
    id: 'TRD-000002',
    symbol: 'GBPUSD',
    direction: 'Sell',
    notional: 5_000_000,
    rate: 1.27,
    tradeDate: T0 + 1_000,
    trader: 'R.SHARMA',
  }),
  trade({
    id: 'TRD-000003',
    symbol: 'USDJPY',
    direction: 'Buy',
    notional: 250_000,
    rate: 152.4,
    tradeDate: T0 + 2_000,
    trader: 'AXDEMO',
    status: 'Rejected',
    rejectionReason: 'Counterparty declined, no size',
  }),
]

describe('filterTrades', () => {
  it('returns everything by default', () => {
    expect(filterTrades(TRADES, EMPTY_FILTER)).toHaveLength(3)
  })

  it('filters by status', () => {
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, status: 'Rejected' })).toHaveLength(1)
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, status: 'Done' })).toHaveLength(2)
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, status: 'Pending' })).toHaveLength(0)
  })

  it.each([
    ['eur', 1],
    ['USD', 3],
    ['TRD-000002', 1],
    ['sharma', 1],
    ['buy', 2],
    ['rejected', 1],
  ])('matches %s against %i rows', (query, expected) => {
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, query })).toHaveLength(expected)
  })

  it('ignores surrounding whitespace', () => {
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, query: '  eur  ' })).toHaveLength(1)
  })

  it('combines status and text', () => {
    expect(filterTrades(TRADES, { status: 'Done', query: 'usd' })).toHaveLength(2)
  })

  it('returns nothing when nothing matches', () => {
    expect(filterTrades(TRADES, { ...EMPTY_FILTER, query: 'zzz' })).toEqual([])
  })
})

describe('sortTrades', () => {
  it('sorts newest first by default', () => {
    expect(sortTrades(TRADES, DEFAULT_SORT).map((entry) => entry.id)).toEqual([
      'TRD-000003',
      'TRD-000002',
      'TRD-000001',
    ])
  })

  it('sorts numerically on a numeric column', () => {
    const ascending = sortTrades(TRADES, { column: 'notional', direction: 'asc' })

    expect(ascending.map((entry) => entry.notional)).toEqual([250_000, 1_000_000, 5_000_000])
  })

  it('sorts alphabetically on a text column', () => {
    const ascending = sortTrades(TRADES, { column: 'symbol', direction: 'asc' })

    expect(ascending.map((entry) => entry.symbol)).toEqual(['EURUSD', 'GBPUSD', 'USDJPY'])
  })

  it('does not mutate the input', () => {
    const original = [...TRADES]
    sortTrades(TRADES, { column: 'notional', direction: 'asc' })

    expect(TRADES).toEqual(original)
  })

  it('handles an empty list', () => {
    expect(sortTrades([], DEFAULT_SORT)).toEqual([])
  })
})

describe('nextSort', () => {
  it('starts a new column descending', () => {
    expect(nextSort(DEFAULT_SORT, 'notional')).toEqual({ column: 'notional', direction: 'desc' })
  })

  it('flips direction when the same column is clicked again', () => {
    expect(nextSort({ column: 'notional', direction: 'desc' }, 'notional')).toEqual({
      column: 'notional',
      direction: 'asc',
    })
    expect(nextSort({ column: 'notional', direction: 'asc' }, 'notional')).toEqual({
      column: 'notional',
      direction: 'desc',
    })
  })
})

describe('countByStatus', () => {
  it('counts each status and the total', () => {
    expect(countByStatus(TRADES)).toEqual({ all: 3, Done: 2, Pending: 0, Rejected: 1 })
  })

  it('reports zeroes for an empty blotter', () => {
    expect(countByStatus([])).toEqual({ all: 0, Done: 0, Pending: 0, Rejected: 0 })
  })
})

/**
 * Minimal RFC 4180 reader, used to assert that the exported file is genuinely
 * parseable rather than merely containing the right substrings.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }

  row.push(field)
  rows.push(row)
  return rows
}

describe('tradesToCsv', () => {
  it('writes a header row', () => {
    const [header] = tradesToCsv(TRADES).split('\n')

    expect(header).toContain('Trade ID')
    expect(header).toContain('Rejection reason')
  })

  it('writes one row per trade', () => {
    expect(tradesToCsv(TRADES).split('\n')).toHaveLength(4)
  })

  it('quotes a field containing a comma, so the row does not gain a column', () => {
    const csv = tradesToCsv(TRADES)

    expect(csv).toContain('"Counterparty declined, no size"')
    // Parsed rather than split on commas: both the rejection reason and the
    // formatted timestamp contain one, which is the whole point of quoting.
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row).toHaveLength(11)
    }
    expect(rows[3]?.at(-1)).toBe('Counterparty declined, no size')
  })

  it('doubles an embedded quote per RFC 4180', () => {
    const csv = tradesToCsv([trade({ trader: 'A "Ace" Trader' })])

    expect(csv).toContain('"A ""Ace"" Trader"')
  })

  it('leaves an empty rejection reason blank rather than writing undefined', () => {
    const csv = tradesToCsv([trade({ id: 'X' })])

    expect(csv).not.toContain('undefined')
    expect(csv.split('\n')[1]?.endsWith(',')).toBe(true)
  })

  it('writes rates at the requested precision', () => {
    expect(tradesToCsv([trade({ rate: 1.08 })], 5)).toContain('1.08000')
    expect(tradesToCsv([trade({ rate: 152.4 })], 3)).toContain('152.400')
  })

  it('produces a header-only file for an empty blotter', () => {
    expect(tradesToCsv([]).split('\n')).toHaveLength(1)
  })
})
