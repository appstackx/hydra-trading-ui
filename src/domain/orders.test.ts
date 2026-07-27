import { describe, expect, it } from 'vitest'
import {
  applyFill,
  cancelOrder,
  fillRate,
  isFillable,
  isTerminal,
  isValidDraft,
  isWorking,
  MAX_NOTIONAL,
  remainingQuantity,
  validateOrderDraft,
  type OrderDraft,
} from './orders'
import { order, price, T0 } from '@/test/fixtures'

const quote = price({ symbol: 'EURUSD', mid: 1.085, bid: 1.08495, ask: 1.08505 })

describe('isTerminal and isWorking', () => {
  it.each(['Filled', 'Cancelled', 'Rejected'] as const)('treats %s as terminal', (status) => {
    expect(isTerminal(status)).toBe(true)
    expect(isWorking(order({ status }))).toBe(false)
  })

  it.each(['Working', 'PartiallyFilled'] as const)('treats %s as live', (status) => {
    expect(isTerminal(status)).toBe(false)
    expect(isWorking(order({ status }))).toBe(true)
  })
})

describe('isFillable', () => {
  it('always fills a market order', () => {
    expect(isFillable(order({ orderType: 'Market' }), quote)).toBe(true)
  })

  it('fills a buy limit only once the offer reaches it', () => {
    expect(isFillable(order({ direction: 'Buy', limitPrice: 1.086 }), quote)).toBe(true)
    expect(isFillable(order({ direction: 'Buy', limitPrice: 1.084 }), quote)).toBe(false)
  })

  it('fills a buy limit exactly at the offer', () => {
    expect(isFillable(order({ direction: 'Buy', limitPrice: quote.ask }), quote)).toBe(true)
  })

  it('fills a sell limit only once the bid reaches it', () => {
    expect(isFillable(order({ direction: 'Sell', limitPrice: 1.084 }), quote)).toBe(true)
    expect(isFillable(order({ direction: 'Sell', limitPrice: 1.086 }), quote)).toBe(false)
  })

  it('never fills a terminal order', () => {
    expect(isFillable(order({ status: 'Cancelled', orderType: 'Market' }), quote)).toBe(false)
  })

  it('never fills a limit order with no price', () => {
    expect(isFillable(order({ orderType: 'Limit' }), quote)).toBe(false)
  })
})

describe('fillRate', () => {
  it('fills a market buy at the offer and a market sell at the bid', () => {
    expect(fillRate(order({ orderType: 'Market', direction: 'Buy' }), quote)).toBe(quote.ask)
    expect(fillRate(order({ orderType: 'Market', direction: 'Sell' }), quote)).toBe(quote.bid)
  })

  it('gives a buy limit the better of the touch and its limit', () => {
    expect(fillRate(order({ direction: 'Buy', limitPrice: 1.09 }), quote)).toBe(quote.ask)
  })

  it('gives a sell limit the better of the touch and its limit', () => {
    expect(fillRate(order({ direction: 'Sell', limitPrice: 1.08 }), quote)).toBe(quote.bid)
  })

  it('never fills a buy worse than its limit', () => {
    expect(fillRate(order({ direction: 'Buy', limitPrice: 1.084 }), quote)).toBe(1.084)
  })
})

describe('applyFill', () => {
  it('fills an order completely', () => {
    const filled = applyFill(order({ quantity: 1_000_000 }), 1_000_000, 1.085, T0)

    expect(filled.status).toBe('Filled')
    expect(filled.filledQuantity).toBe(1_000_000)
    expect(filled.averageFillPrice).toBe(1.085)
    expect(filled.updatedAt).toBe(T0)
  })

  it('marks a partial fill', () => {
    const partial = applyFill(order({ quantity: 3_000_000 }), 1_000_000, 1.085, T0)

    expect(partial.status).toBe('PartiallyFilled')
    expect(remainingQuantity(partial)).toBe(2_000_000)
  })

  it('volume-weights the average across fills at different prices', () => {
    const first = applyFill(order({ quantity: 3_000_000 }), 1_000_000, 1.08, T0)
    const second = applyFill(first, 2_000_000, 1.09, T0 + 1)

    // (1m * 1.08 + 2m * 1.09) / 3m
    expect(second.averageFillPrice).toBeCloseTo(1.086666667, 8)
    expect(second.status).toBe('Filled')
  })

  it('truncates a fill larger than the remaining quantity', () => {
    const filled = applyFill(order({ quantity: 1_000_000 }), 5_000_000, 1.085, T0)

    expect(filled.filledQuantity).toBe(1_000_000)
  })

  it('ignores a zero or negative fill', () => {
    const untouched = order({ quantity: 1_000_000 })

    expect(applyFill(untouched, 0, 1.085, T0)).toBe(untouched)
    expect(applyFill(untouched, -5, 1.085, T0)).toBe(untouched)
  })

  it('ignores a fill on an already-complete order', () => {
    const complete = order({ quantity: 1_000_000, filledQuantity: 1_000_000, status: 'Filled' })

    expect(applyFill(complete, 500_000, 1.085, T0)).toBe(complete)
  })
})

describe('cancelOrder', () => {
  it('cancels a working order', () => {
    const cancelled = cancelOrder(order(), T0 + 5)

    expect(cancelled.status).toBe('Cancelled')
    expect(cancelled.updatedAt).toBe(T0 + 5)
  })

  it('leaves a terminal order untouched', () => {
    const filled = order({ status: 'Filled' })

    expect(cancelOrder(filled, T0 + 5)).toBe(filled)
  })
})

describe('validateOrderDraft', () => {
  const valid: OrderDraft = {
    symbol: 'EURUSD',
    direction: 'Buy',
    orderType: 'Limit',
    quantity: 1_000_000,
    limitPrice: 1.085,
    timeInForce: 'GTC',
  }

  it('accepts a well-formed draft', () => {
    expect(validateOrderDraft(valid)).toEqual({})
    expect(isValidDraft(valid)).toBe(true)
  })

  it('requires an instrument', () => {
    expect(validateOrderDraft({ ...valid, symbol: '' }).symbol).toBeDefined()
  })

  it.each([0, -1, Number.NaN])('rejects a quantity of %s', (quantity) => {
    expect(validateOrderDraft({ ...valid, quantity }).quantity).toBeDefined()
  })

  it('rejects a quantity above the ticket limit', () => {
    expect(validateOrderDraft({ ...valid, quantity: MAX_NOTIONAL + 1 }).quantity).toContain('limit')
  })

  it('accepts a quantity exactly at the limit', () => {
    expect(validateOrderDraft({ ...valid, quantity: MAX_NOTIONAL }).quantity).toBeUndefined()
  })

  it('requires a price on a limit order', () => {
    const { limitPrice: _omitted, ...withoutPrice } = valid

    expect(validateOrderDraft(withoutPrice).limitPrice).toBeDefined()
  })

  it('rejects a non-positive limit price', () => {
    expect(validateOrderDraft({ ...valid, limitPrice: 0 }).limitPrice).toBeDefined()
  })

  it('does not require a price on a market order', () => {
    const { limitPrice: _omitted, ...withoutPrice } = valid

    expect(validateOrderDraft({ ...withoutPrice, orderType: 'Market' })).toEqual({})
  })

  it('reports every problem at once, so the form can show them together', () => {
    const errors = validateOrderDraft({ ...valid, symbol: '', quantity: 0, limitPrice: -1 })

    expect(Object.keys(errors).sort()).toEqual(['limitPrice', 'quantity', 'symbol'])
    expect(isValidDraft({ ...valid, quantity: 0 })).toBe(false)
  })
})
