import { describe, expect, it } from 'vitest'
import {
  accumulateTrade,
  calculatePositions,
  convertToReportingCurrency,
  currencyExposures,
  flatPosition,
  markToMarket,
  totalPnl,
} from './positions'
import { EURUSD, PAIRS, T0, price, trade, USDJPY } from '@/test/fixtures'

describe('accumulateTrade', () => {
  it('opens a position at the deal rate', () => {
    const result = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ rate: 1.08, notional: 1_000_000 })
    )

    expect(result.netQuantity).toBe(1_000_000)
    expect(result.averageRate).toBe(1.08)
    expect(result.realisedPnl).toBe(0)
  })

  it('opens short on a sell', () => {
    const result = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ direction: 'Sell', rate: 1.09, notional: 2_000_000 })
    )

    expect(result.netQuantity).toBe(-2_000_000)
    expect(result.averageRate).toBe(1.09)
  })

  it('re-weights the average when adding to a long', () => {
    const first = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ rate: 1.08, notional: 1_000_000 })
    )
    const second = accumulateTrade(first, trade({ rate: 1.1, notional: 3_000_000 }))

    expect(second.netQuantity).toBe(4_000_000)
    // (1m * 1.08 + 3m * 1.10) / 4m
    expect(second.averageRate).toBeCloseTo(1.095, 10)
  })

  it('re-weights the average when adding to a short', () => {
    const first = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ direction: 'Sell', rate: 1.08, notional: 1_000_000 })
    )
    const second = accumulateTrade(
      first,
      trade({ direction: 'Sell', rate: 1.1, notional: 1_000_000 })
    )

    expect(second.netQuantity).toBe(-2_000_000)
    expect(second.averageRate).toBeCloseTo(1.09, 10)
  })

  it('crystallises profit when a long sells above its average', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 1_000_000 }))
    const closed = accumulateTrade(
      long,
      trade({ direction: 'Sell', rate: 1.09, notional: 1_000_000 })
    )

    expect(closed.netQuantity).toBe(0)
    expect(closed.averageRate).toBe(0)
    expect(closed.realisedPnl).toBeCloseTo(10_000, 6) // 1m * 0.01
  })

  it('crystallises a loss when a long sells below its average', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 1_000_000 }))
    const closed = accumulateTrade(
      long,
      trade({ direction: 'Sell', rate: 1.07, notional: 1_000_000 })
    )

    expect(closed.realisedPnl).toBeCloseTo(-10_000, 6)
  })

  it('crystallises profit when a short buys back lower', () => {
    const short = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ direction: 'Sell', rate: 1.09, notional: 1_000_000 })
    )
    const closed = accumulateTrade(
      short,
      trade({ direction: 'Buy', rate: 1.08, notional: 1_000_000 })
    )

    expect(closed.netQuantity).toBe(0)
    expect(closed.realisedPnl).toBeCloseTo(10_000, 6)
  })

  it('keeps the average of the remaining lot on a partial close', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 3_000_000 }))
    const partial = accumulateTrade(
      long,
      trade({ direction: 'Sell', rate: 1.09, notional: 1_000_000 })
    )

    expect(partial.netQuantity).toBe(2_000_000)
    expect(partial.averageRate).toBe(1.08)
    expect(partial.realisedPnl).toBeCloseTo(10_000, 6)
  })

  it('re-bases the average at the deal rate when a trade flips the side', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 1_000_000 }))
    const flipped = accumulateTrade(
      long,
      trade({ direction: 'Sell', rate: 1.09, notional: 3_000_000 })
    )

    expect(flipped.netQuantity).toBe(-2_000_000)
    // Only the 1m that closed the long crystallised; the 2m residual is new risk.
    expect(flipped.realisedPnl).toBeCloseTo(10_000, 6)
    expect(flipped.averageRate).toBe(1.09)
  })
})

describe('markToMarket', () => {
  it('marks a long at a profit when the market rises', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 1_000_000 }))

    expect(markToMarket(long, 1.09).unrealisedPnl).toBeCloseTo(10_000, 6)
  })

  it('marks a short at a loss when the market rises', () => {
    const short = accumulateTrade(
      flatPosition('EURUSD'),
      trade({ direction: 'Sell', rate: 1.08, notional: 1_000_000 })
    )

    expect(markToMarket(short, 1.09).unrealisedPnl).toBeCloseTo(-10_000, 6)
  })

  it('reports no unrealised P&L when flat', () => {
    expect(markToMarket(flatPosition('EURUSD'), 1.09).unrealisedPnl).toBe(0)
  })

  it('reports no unrealised P&L when the instrument is unquoted', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08 }))

    expect(markToMarket(long, undefined).unrealisedPnl).toBe(0)
  })

  it('totals realised and unrealised', () => {
    const long = accumulateTrade(flatPosition('EURUSD'), trade({ rate: 1.08, notional: 1_000_000 }))
    const partial = accumulateTrade(
      long,
      trade({ direction: 'Sell', rate: 1.09, notional: 500_000 })
    )
    const marked = markToMarket(partial, 1.1)

    expect(marked.realisedPnl).toBeCloseTo(5_000, 6)
    expect(marked.unrealisedPnl).toBeCloseTo(10_000, 6)
    expect(marked.totalPnl).toBeCloseTo(15_000, 6)
  })
})

describe('calculatePositions', () => {
  const prices = { EURUSD: price({ symbol: 'EURUSD', mid: 1.09 }) }

  it('ignores rejected and pending trades', () => {
    const positions = calculatePositions(
      [
        trade({ id: 'a', rate: 1.08, notional: 1_000_000 }),
        trade({ id: 'b', rate: 1.08, notional: 5_000_000, status: 'Rejected' }),
        trade({ id: 'c', rate: 1.08, notional: 9_000_000, status: 'Pending' }),
      ],
      prices
    )

    expect(positions).toHaveLength(1)
    expect(positions[0]?.netQuantity).toBe(1_000_000)
  })

  it('applies trades chronologically regardless of input order', () => {
    const later = trade({ id: 'later', rate: 1.1, notional: 1_000_000, tradeDate: T0 + 1000 })
    const earlier = trade({ id: 'earlier', rate: 1.08, notional: 1_000_000, tradeDate: T0 })

    const forwards = calculatePositions([earlier, later], prices)
    const backwards = calculatePositions([later, earlier], prices)

    expect(forwards[0]?.averageRate).toBeCloseTo(1.09, 10)
    expect(backwards[0]?.averageRate).toBeCloseTo(forwards[0]?.averageRate ?? 0, 10)
  })

  it('keeps one position per instrument, sorted by symbol', () => {
    const positions = calculatePositions(
      [
        trade({ id: 'a', symbol: 'USDJPY', rate: 152 }),
        trade({ id: 'b', symbol: 'EURUSD', rate: 1.08 }),
      ],
      prices
    )

    expect(positions.map((position) => position.symbol)).toEqual(['EURUSD', 'USDJPY'])
  })

  it('returns nothing for an empty blotter', () => {
    expect(calculatePositions([], prices)).toEqual([])
  })
})

describe('currencyExposures', () => {
  it('splits a long into a positive base leg and a negative terms leg', () => {
    const positions = calculatePositions([trade({ rate: 1.08, notional: 1_000_000 })], {})
    const exposures = currencyExposures(positions, PAIRS)

    expect(exposures).toContainEqual({ currency: 'EUR', amount: 1_000_000 })
    expect(exposures).toContainEqual({ currency: 'USD', amount: -1_080_000 })
  })

  it('nets the shared currency across two pairs', () => {
    const positions = calculatePositions(
      [
        trade({ id: 'a', symbol: 'EURUSD', rate: 1, notional: 1_000_000 }),
        trade({ id: 'b', symbol: 'USDJPY', rate: 150, notional: 1_000_000 }),
      ],
      {}
    )
    const exposures = currencyExposures(positions, PAIRS)
    const usd = exposures.find((exposure) => exposure.currency === 'USD')

    // Short 1m USD from the EURUSD leg, long 1m USD from the USDJPY leg.
    expect(usd).toBeUndefined()
  })

  it('drops flat positions and unknown instruments', () => {
    const flat = calculatePositions(
      [
        trade({ id: 'a', rate: 1.08, notional: 1_000_000 }),
        trade({ id: 'b', rate: 1.08, notional: 1_000_000, direction: 'Sell' }),
      ],
      {}
    )

    expect(currencyExposures(flat, PAIRS)).toEqual([])
    expect(currencyExposures([{ ...flatPosition('XXXYYY'), netQuantity: 1 }], PAIRS)).toEqual([])
  })

  it('orders by absolute size, largest first', () => {
    const positions = calculatePositions(
      [trade({ symbol: 'USDJPY', rate: 150, notional: 1_000_000 })],
      {}
    )
    const exposures = currencyExposures(positions, PAIRS)

    expect(exposures[0]?.currency).toBe('JPY')
  })
})

describe('convertToReportingCurrency', () => {
  const prices = {
    USDJPY: price({ symbol: 'USDJPY', mid: 150 }),
    EURUSD: price({ symbol: 'EURUSD', mid: 1.08 }),
  }

  it('passes dollars through unchanged', () => {
    expect(convertToReportingCurrency(100, 'USD', prices)).toBe(100)
  })

  it('divides by the direct USD pair', () => {
    expect(convertToReportingCurrency(15_000, 'JPY', prices)).toBeCloseTo(100, 10)
  })

  it('multiplies by the inverse pair when there is no direct quote', () => {
    expect(convertToReportingCurrency(100, 'EUR', prices)).toBeCloseTo(108, 10)
  })

  it('returns undefined when neither leg is quoted', () => {
    expect(convertToReportingCurrency(100, 'ZAR', prices)).toBeUndefined()
  })

  it('falls through to the inverse rather than dividing by a zero direct rate', () => {
    const broken = { USDJPY: price({ symbol: 'USDJPY', mid: 0 }) }

    expect(convertToReportingCurrency(100, 'JPY', broken)).toBeUndefined()
  })
})

describe('totalPnl', () => {
  const prices = {
    EURUSD: price({ symbol: 'EURUSD', mid: 1.09 }),
    USDJPY: price({ symbol: 'USDJPY', mid: 150 }),
  }

  it('converts every leg before summing, rather than adding yen to dollars', () => {
    const positions = calculatePositions(
      [
        trade({ id: 'a', symbol: 'EURUSD', rate: 1.08, notional: 1_000_000 }),
        trade({ id: 'b', symbol: 'USDJPY', rate: 149, notional: 1_000_000 }),
      ],
      prices
    )

    // EURUSD: 1m * 0.01 = 10,000 USD. USDJPY: 1m * 1 = 1,000,000 JPY / 150.
    const summary = totalPnl(positions, PAIRS, prices)

    expect(summary.amount).toBeCloseTo(10_000 + 1_000_000 / 150, 6)
    expect(summary.unconvertible).toEqual([])
  })

  it('splits realised from unrealised', () => {
    const positions = calculatePositions(
      [
        trade({ id: 'a', symbol: 'EURUSD', rate: 1.08, notional: 2_000_000, tradeDate: T0 }),
        trade({
          id: 'b',
          symbol: 'EURUSD',
          rate: 1.085,
          notional: 1_000_000,
          direction: 'Sell',
          tradeDate: T0 + 1,
        }),
      ],
      prices
    )
    const summary = totalPnl(positions, PAIRS, prices)

    expect(summary.realised).toBeCloseTo(5_000, 6)
    expect(summary.unrealised).toBeCloseTo(10_000, 6)
    expect(summary.amount).toBeCloseTo(15_000, 6)
  })

  it('names positions it cannot convert instead of counting them as dollars', () => {
    const exotic = { ...flatPosition('EURTRY'), netQuantity: 1, totalPnl: 500, unrealisedPnl: 500 }
    const pairs = { ...PAIRS, EURTRY: { ...EURUSD, symbol: 'EURTRY', terms: 'TRY' } }

    const summary = totalPnl([exotic], pairs, prices)

    expect(summary.amount).toBe(0)
    expect(summary.unconvertible).toEqual(['EURTRY'])
  })

  it('treats an instrument missing from reference data as unconvertible', () => {
    const orphan = { ...flatPosition('XXXYYY'), netQuantity: 1, totalPnl: 10 }

    expect(totalPnl([orphan], PAIRS, prices).unconvertible).toEqual(['XXXYYY'])
  })

  it('reports zero for an empty book', () => {
    expect(totalPnl([], PAIRS, prices)).toEqual({
      amount: 0,
      realised: 0,
      unrealised: 0,
      unconvertible: [],
    })
  })
})

describe('fixtures sanity', () => {
  it('exposes two pairs with different precisions', () => {
    expect(EURUSD.ratePrecision).toBe(5)
    expect(USDJPY.ratePrecision).toBe(3)
  })
})
