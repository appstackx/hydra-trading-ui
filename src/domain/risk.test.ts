import { describe, expect, it } from 'vitest'
import {
  checkFatFinger,
  dailyLossBreached,
  DEFAULT_RISK_LIMITS,
  haltReason,
  isQuoteStale,
  KILL_SWITCH_OFF,
  LOSS_HALT_REARM_RATIO,
  nextLossHaltState,
} from './risk'

describe('checkFatFinger', () => {
  it('accepts a limit near the market', () => {
    // 1.0850 against a 1.0842 mid is ~7 bps.
    expect(checkFatFinger(1.085, 1.0842, 500)).toEqual({ allowed: true })
  })

  it('catches the classic slipped decimal point', () => {
    const result = checkFatFinger(10.842, 1.0842, 500)

    expect(result.allowed).toBe(false)
    expect(result.allowed === false && result.reason).toContain('bps from the market')
  })

  it('catches a fat finger on the low side too', () => {
    expect(checkFatFinger(0.10842, 1.0842, 500).allowed).toBe(false)
  })

  it('accepts a deviation exactly at the threshold', () => {
    // 500 bps = 5%: 1.05 * 1.0 = mid 1.0, limit 1.05.
    expect(checkFatFinger(1.05, 1.0, 500).allowed).toBe(true)
  })

  it('rejects just beyond the threshold', () => {
    expect(checkFatFinger(1.0501, 1.0, 500).allowed).toBe(false)
  })

  it('works at crypto magnitudes', () => {
    expect(checkFatFinger(63_650, 63_700, 500).allowed).toBe(true)
    expect(checkFatFinger(6_365, 63_700, 500).allowed).toBe(false)
  })

  it('stands aside on malformed input, which validation owns', () => {
    expect(checkFatFinger(Number.NaN, 1.08, 500).allowed).toBe(true)
    expect(checkFatFinger(1.08, Number.NaN, 500).allowed).toBe(true)
    expect(checkFatFinger(1.08, 0, 500).allowed).toBe(true)
  })
})

describe('dailyLossBreached', () => {
  it('trips once the loss reaches the limit', () => {
    expect(dailyLossBreached(-250_000, 250_000)).toBe(true)
    expect(dailyLossBreached(-250_001, 250_000)).toBe(true)
  })

  it('does not trip inside the limit or in profit', () => {
    expect(dailyLossBreached(-249_999, 250_000)).toBe(false)
    expect(dailyLossBreached(0, 250_000)).toBe(false)
    expect(dailyLossBreached(50_000, 250_000)).toBe(false)
  })

  it('never trips on a disabled or malformed limit', () => {
    expect(dailyLossBreached(-1_000_000, 0)).toBe(false)
    expect(dailyLossBreached(Number.NaN, 250_000)).toBe(false)
  })
})

describe('isQuoteStale', () => {
  it('flags a quote older than the threshold', () => {
    expect(isQuoteStale(1_000, 32_000, 30_000)).toBe(true)
  })

  it('accepts a quote inside the threshold, inclusive', () => {
    expect(isQuoteStale(2_000, 32_000, 30_000)).toBe(false)
    expect(isQuoteStale(31_000, 32_000, 30_000)).toBe(false)
  })

  it('never flags with staleness disabled or a broken timestamp', () => {
    expect(isQuoteStale(1_000, 999_999, 0)).toBe(false)
    expect(isQuoteStale(Number.NaN, 32_000, 30_000)).toBe(false)
  })
})

describe('nextLossHaltState', () => {
  const limits = DEFAULT_RISK_LIMITS // 250k limit, 0.9 re-arm

  it('trips when the loss reaches the limit', () => {
    expect(nextLossHaltState(false, -250_000, limits)).toBe(true)
    expect(nextLossHaltState(false, -249_999, limits)).toBe(false)
  })

  it('latches: does not release on a marginal recovery', () => {
    // Recovered to -240k — inside the hysteresis band, still halted. Without
    // the latch this is exactly the P&L that flaps the halt every tick.
    expect(nextLossHaltState(true, -240_000, limits)).toBe(true)
    expect(nextLossHaltState(true, -225_001, limits)).toBe(true)
  })

  it('re-arms once the P&L is clearly back inside the band', () => {
    const rearm = -limits.maxDailyLossUsd * LOSS_HALT_REARM_RATIO // -225k
    expect(nextLossHaltState(true, rearm + 1, limits)).toBe(false)
    expect(nextLossHaltState(true, 0, limits)).toBe(false)
  })

  it('holds its state while the P&L is unknown', () => {
    expect(nextLossHaltState(true, undefined, limits)).toBe(true)
    expect(nextLossHaltState(false, undefined, limits)).toBe(false)
    expect(nextLossHaltState(true, Number.NaN, limits)).toBe(true)
  })
})

describe('haltReason', () => {
  const limits = DEFAULT_RISK_LIMITS

  it('is null while nothing is wrong', () => {
    expect(haltReason(KILL_SWITCH_OFF, false, limits)).toBeNull()
  })

  it('names who threw the kill switch', () => {
    const reason = haltReason(
      { engaged: true, engagedBy: 'M. Halvorsen', engagedAt: 1, reason: 'Fat print' },
      false,
      limits
    )

    expect(reason).toContain('kill switch')
    expect(reason).toContain('M. Halvorsen')
  })

  it('reports a latched daily loss with the limit, not the live P&L', () => {
    const reason = haltReason(KILL_SWITCH_OFF, true, limits)

    expect(reason).toContain('Daily loss limit')
    expect(reason).toContain('250,000')
    // Stable across ticks by construction: the same inputs give the same
    // string, so nothing memoised on it churns with the market.
    expect(haltReason(KILL_SWITCH_OFF, true, limits)).toBe(reason)
  })

  it('lets the human decision outrank the automatic one', () => {
    const reason = haltReason({ engaged: true, engagedBy: 'M. Halvorsen', engagedAt: 1 }, true, limits)

    expect(reason).toContain('kill switch')
  })

  it('survives an anonymous kill switch', () => {
    expect(haltReason({ engaged: true }, false, limits)).toContain('risk control')
  })
})
