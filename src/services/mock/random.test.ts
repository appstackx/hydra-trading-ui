import { describe, expect, it } from 'vitest'
import { createRandom, DEFAULT_SEED, seedFromSearch } from './random'

describe('createRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const first = createRandom(1234)
    const second = createRandom(1234)

    const a = Array.from({ length: 20 }, () => first.next())
    const b = Array.from({ length: 20 }, () => second.next())

    expect(a).toEqual(b)
  })

  it('produces a different sequence for a different seed', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next())
  })

  it('stays inside [0, 1)', () => {
    const random = createRandom(7)

    for (let i = 0; i < 2_000; i += 1) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('spreads roughly uniformly across the unit interval', () => {
    const random = createRandom(99)
    const buckets = new Array<number>(10).fill(0)

    for (let i = 0; i < 10_000; i += 1) {
      const bucket = Math.floor(random.next() * 10)
      buckets[bucket] = (buckets[bucket] ?? 0) + 1
    }

    // 1000 expected per bucket; a wide band still catches a broken generator.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1_300)
    }
  })

  it('bounds `between` by its arguments', () => {
    const random = createRandom(11)

    for (let i = 0; i < 500; i += 1) {
      const value = random.between(5, 9)
      expect(value).toBeGreaterThanOrEqual(5)
      expect(value).toBeLessThan(9)
    }
  })

  it('returns integers inside an inclusive range', () => {
    const random = createRandom(13)
    const seen = new Set<number>()

    for (let i = 0; i < 500; i += 1) {
      const value = random.int(1, 4)
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
    }

    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })

  it('produces a standard normal with mean near 0 and sd near 1', () => {
    const random = createRandom(17)
    const samples = Array.from({ length: 20_000 }, () => random.gaussian())

    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
    const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length

    expect(Math.abs(mean)).toBeLessThan(0.05)
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1)
  })

  it('honours the probability given to `chance`', () => {
    const random = createRandom(23)
    let hits = 0

    for (let i = 0; i < 10_000; i += 1) {
      if (random.chance(0.25)) hits += 1
    }

    expect(hits / 10_000).toBeCloseTo(0.25, 1)
  })

  it('always returns true at p=1 and false at p=0', () => {
    const random = createRandom(29)

    expect(random.chance(1)).toBe(true)
    expect(random.chance(0)).toBe(false)
  })

  it('picks only from the supplied list', () => {
    const random = createRandom(31)
    const items = ['a', 'b', 'c'] as const

    for (let i = 0; i < 200; i += 1) {
      expect(items).toContain(random.pick(items))
    }
  })

  it('throws rather than returning undefined from an empty list', () => {
    expect(() => createRandom(1).pick([])).toThrow(/non-empty/)
  })
})

describe('seedFromSearch', () => {
  it('reads an explicit seed from the query string', () => {
    expect(seedFromSearch('?seed=42')).toBe(42)
    expect(seedFromSearch('?other=1&seed=7')).toBe(7)
  })

  it('falls back to the default when absent or unparseable', () => {
    expect(seedFromSearch('')).toBe(DEFAULT_SEED)
    expect(seedFromSearch('?seed=')).toBe(DEFAULT_SEED)
    expect(seedFromSearch('?seed=abc')).toBe(DEFAULT_SEED)
  })
})
