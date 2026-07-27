import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatMoney,
  formatNotional,
  formatQuantity,
  formatRate,
  formatShortDate,
  formatSigned,
  formatSignedCompact,
  formatTime,
  parseNotional,
  spotValueDate,
  toIsoDate,
} from './formatting'

describe('formatNotional', () => {
  it.each([
    [750, '750'],
    [1_000, '1k'],
    [250_000, '250k'],
    [1_000_000, '1m'],
    [1_500_000, '1.5m'],
    [1_250_000, '1.25m'],
    [12_500_000, '12.5m'],
    [2_000_000_000, '2bn'],
  ])('abbreviates %i as %s', (input, expected) => {
    expect(formatNotional(input)).toBe(expected)
  })

  it('groups values below a thousand', () => {
    expect(formatNotional(999)).toBe('999')
  })

  it('keeps the sign of a short position', () => {
    expect(formatNotional(-1_500_000)).toBe('-1.5m')
  })

  it('renders a dash for a non-finite value', () => {
    expect(formatNotional(Number.NaN)).toBe('—')
  })
})

describe('parseNotional', () => {
  it.each([
    ['1m', 1_000_000],
    ['1.5M', 1_500_000],
    ['250k', 250_000],
    ['2bn', 2_000_000_000],
    ['3b', 3_000_000_000],
    ['1,000', 1_000],
    ['1 000 000', 1_000_000],
    ['750', 750],
    ['.5m', 500_000],
  ])('parses %s as %i', (input, expected) => {
    expect(parseNotional(input)).toBe(expected)
  })

  it('returns undefined for an empty or whitespace-only field', () => {
    expect(parseNotional('')).toBeUndefined()
    expect(parseNotional('   ')).toBeUndefined()
  })

  it.each(['abc', '1m2', '--5', '1.2.3', '$1m'])('rejects %s', (input) => {
    expect(parseNotional(input)).toBeUndefined()
  })

  it('round-trips through formatNotional', () => {
    for (const value of [750, 250_000, 1_500_000, 2_000_000_000]) {
      expect(parseNotional(formatNotional(value))).toBe(value)
    }
  })
})

describe('formatMoney and formatSigned', () => {
  it('groups and fixes to two decimals', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50')
  })

  it('always carries an explicit sign', () => {
    expect(formatSigned(1204.5)).toBe('+1,204.50')
    expect(formatSigned(-1204.5)).toBe('-1,204.50')
  })

  it('renders zero without a sign', () => {
    expect(formatSigned(0)).toBe('0.00')
  })

  it('renders negative zero as zero rather than "-0.00"', () => {
    expect(formatSigned(-0)).toBe('0.00')
  })

  it('renders a dash for a non-finite value', () => {
    expect(formatMoney(Number.NaN)).toBe('—')
    expect(formatSigned(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatSignedCompact', () => {
  it('keeps small figures exact', () => {
    expect(formatSignedCompact(-1204.5)).toBe('-1,204.50')
  })

  it('abbreviates once past the threshold', () => {
    expect(formatSignedCompact(-15_200)).toBe('-15.2k')
    expect(formatSignedCompact(2_400_000)).toBe('+2.4m')
  })

  it('honours a custom threshold', () => {
    expect(formatSignedCompact(1500, 1000)).toBe('+1.5k')
  })

  it('renders a dash for a non-finite value', () => {
    expect(formatSignedCompact(Number.NaN)).toBe('—')
  })
})

describe('formatRate and formatQuantity', () => {
  it('fixes a rate to the pair precision', () => {
    expect(formatRate(1.0842, 5)).toBe('1.08420')
    expect(formatRate(152.4, 3)).toBe('152.400')
  })

  it('groups a full quantity', () => {
    expect(formatQuantity(1_500_000)).toBe('1,500,000')
  })

  it('renders a dash for a non-finite value', () => {
    expect(formatRate(Number.NaN, 5)).toBe('—')
    expect(formatQuantity(Number.NaN)).toBe('—')
  })
})

describe('date and time formatting', () => {
  // 2026-07-27 is a Monday, 09:30 UTC. The suite runs with TZ=UTC.
  const monday = Date.UTC(2026, 6, 27, 9, 30, 15)

  it('formats a 24-hour clock', () => {
    expect(formatTime(monday)).toBe('09:30:15')
  })

  it('formats a date and time together', () => {
    expect(formatDateTime(monday)).toContain('27 Jul')
    expect(formatDateTime(monday)).toContain('09:30:15')
  })

  it('emits an ISO date for the wire', () => {
    expect(toIsoDate(monday)).toBe('2026-07-27')
  })

  it('renders an ISO date for display', () => {
    expect(formatShortDate('2026-07-29')).toBe('29 Jul')
  })

  it('passes an unparseable date through unchanged', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date')
  })
})

describe('spotValueDate', () => {
  it('settles Monday trades on Wednesday', () => {
    expect(spotValueDate(Date.UTC(2026, 6, 27, 9, 0))).toBe('2026-07-29')
  })

  it('rolls a Thursday trade over the weekend to Monday', () => {
    expect(spotValueDate(Date.UTC(2026, 6, 30, 9, 0))).toBe('2026-08-03')
  })

  it('rolls a Friday trade to Tuesday', () => {
    expect(spotValueDate(Date.UTC(2026, 6, 31, 9, 0))).toBe('2026-08-04')
  })

  it('never lands on a weekend', () => {
    for (let day = 1; day <= 28; day += 1) {
      const settled = new Date(`${spotValueDate(Date.UTC(2026, 6, day, 12, 0))}T00:00:00Z`)
      expect([0, 6]).not.toContain(settled.getUTCDay())
    }
  })
})
