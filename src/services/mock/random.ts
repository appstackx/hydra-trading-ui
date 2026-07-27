/**
 * Deterministic pseudo-randomness.
 *
 * The demo feed must be reproducible: the same seed has to produce the same
 * ticks, the same rejections and the same seeded blotter, otherwise unit tests
 * assert on noise and Playwright screenshots never match twice.
 */

export interface Random {
  /** Uniform in `[0, 1)`. */
  next(): number
  /** Uniform in `[min, max)`. */
  between(min: number, max: number): number
  /** Uniform integer in `[min, max]`, both inclusive. */
  int(min: number, max: number): number
  /** Standard normal, mean 0 and standard deviation 1. */
  gaussian(): number
  /** True with the given probability, `0 <= p <= 1`. */
  chance(probability: number): boolean
  /** Uniformly picks one element; throws on an empty list. */
  pick<T>(items: readonly T[]): T
}

/**
 * mulberry32 — a 32-bit generator with a full 2^32 period and good statistical
 * properties for a simulation of this size, in eight lines and no dependencies.
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const between = (min: number, max: number): number => min + next() * (max - min)

  return {
    next,
    between,
    int: (min, max) => Math.floor(between(min, max + 1)),
    gaussian: () => {
      // Box–Muller. `next()` can return exactly 0, which would make log() blow
      // up, so the first draw is nudged off zero.
      const u1 = next() || Number.EPSILON
      const u2 = next()
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    },
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() requires a non-empty array')
      // Index is bounded by construction, but the compiler cannot see that.
      return items[Math.floor(next() * items.length)] as T
    },
  }
}

/** Seed used whenever the URL does not pin one. */
export const DEFAULT_SEED = 20260727

/**
 * Reads `?seed=` from a URL so a tester or a screenshot run can pin the feed.
 * Falls back to {@link DEFAULT_SEED} for anything unparseable.
 */
export function seedFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get('seed')
  if (raw === null) return DEFAULT_SEED
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : DEFAULT_SEED
}
