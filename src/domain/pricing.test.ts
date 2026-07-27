import { describe, expect, it } from 'vitest'
import {
  clamp,
  movementOf,
  pipFactor,
  rateForDirection,
  round,
  splitRate,
  spreadInPips,
  toPips,
} from './pricing'
import { EURUSD, USDJPY } from '@/test/fixtures'

describe('splitRate', () => {
  it('splits a 5-decimal major into big figure, pips and fractional pip', () => {
    expect(splitRate(1.08423, EURUSD)).toEqual({ bigFigure: '1.08', pips: '42', fraction: '3' })
  })

  it('splits a 3-decimal yen cross, where the big figure has no decimals', () => {
    expect(splitRate(157.482, USDJPY)).toEqual({ bigFigure: '157.', pips: '48', fraction: '2' })
  })

  it('pads a rate that carries fewer decimals than the pair quotes', () => {
    expect(splitRate(1.1, EURUSD)).toEqual({ bigFigure: '1.10', pips: '00', fraction: '0' })
  })

  it('keeps the leading zero of a sub-one rate', () => {
    expect(splitRate(0.65841, EURUSD)).toEqual({ bigFigure: '0.65', pips: '84', fraction: '1' })
  })

  it('reassembles to the original rate', () => {
    const parts = splitRate(1.08423, EURUSD)
    expect(Number(`${parts.bigFigure}${parts.pips}${parts.fraction}`)).toBeCloseTo(1.08423, 5)
  })
})

describe('pipFactor and toPips', () => {
  it('uses 10^4 for a major and 10^2 for a yen cross', () => {
    expect(pipFactor(EURUSD)).toBe(10_000)
    expect(pipFactor(USDJPY)).toBe(100)
  })

  it('converts a rate delta into pips', () => {
    expect(toPips(0.00012, EURUSD)).toBeCloseTo(1.2, 6)
    expect(toPips(0.05, USDJPY)).toBeCloseTo(5, 6)
  })

  it('preserves the sign of a downward move', () => {
    expect(toPips(-0.0003, EURUSD)).toBeCloseTo(-3, 6)
  })
})

describe('spreadInPips', () => {
  it('measures the two-way spread of a major', () => {
    expect(spreadInPips({ bid: 1.08415, ask: 1.08423 }, EURUSD)).toBe(0.8)
  })

  it('measures the two-way spread of a yen cross', () => {
    expect(spreadInPips({ bid: 157.475, ask: 157.489 }, USDJPY)).toBe(1.4)
  })

  it('reports zero for a locked market', () => {
    expect(spreadInPips({ bid: 1.085, ask: 1.085 }, EURUSD)).toBe(0)
  })
})

describe('rateForDirection', () => {
  const quote = { bid: 1.08415, ask: 1.08423 }

  it('buys at the offer and sells at the bid', () => {
    expect(rateForDirection(quote, 'Buy')).toBe(quote.ask)
    expect(rateForDirection(quote, 'Sell')).toBe(quote.bid)
  })
})

describe('movementOf', () => {
  it('reports no movement on the first tick, when there is no predecessor', () => {
    expect(movementOf(1.085, undefined)).toBe('none')
  })

  it('classifies a rise, a fall and an unchanged mid', () => {
    expect(movementOf(1.0851, 1.085)).toBe('up')
    expect(movementOf(1.0849, 1.085)).toBe('down')
    expect(movementOf(1.085, 1.085)).toBe('none')
  })
})

describe('round', () => {
  it('rounds half away from zero rather than to the float below', () => {
    expect(round(1.005, 2)).toBe(1.01)
    expect(round(2.675, 2)).toBe(2.68)
  })

  it('rounds negatives symmetrically', () => {
    expect(round(-1.005, 2)).toBe(-1.01)
  })

  it('rounds to the precision of an FX rate', () => {
    expect(round(1.084234999, 5)).toBe(1.08423)
  })

  it('passes non-finite values through untouched', () => {
    expect(round(Number.NaN, 2)).toBeNaN()
    expect(round(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('clamp', () => {
  it('bounds a value on both sides and leaves an in-range value alone', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})
