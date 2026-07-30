import type { Order, Trade } from '@/domain'

/**
 * Session persistence: blotter and order book survive a refresh.
 *
 * The store is the browser's, deliberately. Client-side persistence is
 * continuity for the person at the screen — a refresh must not wipe their
 * working orders — and it is explicitly not a book of record. A deployment
 * reconciles both from the server at start of day; `docs/production-readiness`
 * keeps that distinction in writing.
 */

export interface PersistedSession {
  readonly version: 1
  readonly savedAt: number
  readonly trades: readonly Trade[]
  readonly orders: readonly Order[]
}

/** Bounds mirror the in-memory stores; persistence must not outgrow them. */
export const MAX_PERSISTED_TRADES = 500
export const MAX_PERSISTED_ORDERS = 200

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** One key per feed/seed combination, so demo sessions do not bleed into live. */
export function sessionStorageKey(feed: string, seed: number): string {
  return `hydra.v1.session.${feed}.${String(seed)}`
}

export function saveSession(
  storage: StorageLike,
  key: string,
  trades: readonly Trade[],
  orders: readonly Order[],
  now: number
): void {
  try {
    const session: PersistedSession = {
      version: 1,
      savedAt: now,
      trades: trades.slice(0, MAX_PERSISTED_TRADES),
      orders: orders.slice(0, MAX_PERSISTED_ORDERS),
    }
    storage.setItem(key, JSON.stringify(session))
  } catch {
    // Quota exhaustion or private mode: the session simply will not survive a
    // refresh, which is the pre-persistence behaviour, not a failure mode.
  }
}

/**
 * Loads a previous session, or `null` when there is none or it is unreadable.
 *
 * Every row is shape-checked: localStorage is user-writable, and a corrupt or
 * hostile entry must fall back to a fresh session rather than crash the boot
 * or smuggle junk into the blotter.
 */
export function loadSession(storage: StorageLike, key: string): PersistedSession | null {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as PersistedSession).version !== 1 ||
      !Array.isArray((parsed as PersistedSession).trades) ||
      !Array.isArray((parsed as PersistedSession).orders)
    ) {
      return null
    }

    const session = parsed as PersistedSession
    return {
      version: 1,
      savedAt: typeof session.savedAt === 'number' ? session.savedAt : 0,
      trades: session.trades.filter(isPlausibleTrade).slice(0, MAX_PERSISTED_TRADES),
      orders: session.orders.filter(isPlausibleOrder).slice(0, MAX_PERSISTED_ORDERS),
    }
  } catch {
    return null
  }
}

export function clearSession(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Nothing useful to do; the next save will overwrite anyway.
  }
}

/**
 * The sequence number a generator should resume from so restored ids and new
 * ids never collide: `nextSequenceAfter(['TRD-000041'], 'TRD')` is 41, and the
 * generator's next id is TRD-000042.
 */
export function nextSequenceAfter(ids: readonly string[], prefix: string): number {
  let max = 0
  // At most 12 digits: beyond that Number loses integer precision, and a
  // crafted id like TRD-99999999999999999999 would freeze the sequence so
  // every future id collides. Ids that long are rejected, not parsed.
  const pattern = new RegExp(`^${prefix}-(\\d{1,12})$`)
  for (const id of ids) {
    const match = pattern.exec(id)
    if (!match) continue
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value) && value > max) max = value
  }
  return max
}

/**
 * Every field the UI renders or does arithmetic on is checked, including enum
 * membership and finiteness: a crafted row must fall out here, not crash a
 * panel three refreshes later.
 */
function isPlausibleTrade(value: unknown): value is Trade {
  if (typeof value !== 'object' || value === null) return false
  const trade = value as Record<string, unknown>
  return (
    typeof trade.id === 'string' &&
    typeof trade.symbol === 'string' &&
    (trade.direction === 'Buy' || trade.direction === 'Sell') &&
    typeof trade.notional === 'number' &&
    Number.isFinite(trade.notional) &&
    typeof trade.rate === 'number' &&
    Number.isFinite(trade.rate) &&
    typeof trade.tradeDate === 'number' &&
    Number.isFinite(trade.tradeDate) &&
    typeof trade.valueDate === 'string' &&
    (trade.status === 'Done' || trade.status === 'Pending' || trade.status === 'Rejected') &&
    typeof trade.trader === 'string' &&
    typeof trade.dealtCurrency === 'string' &&
    (trade.rejectionReason === undefined || typeof trade.rejectionReason === 'string')
  )
}

function isPlausibleOrder(value: unknown): value is Order {
  if (typeof value !== 'object' || value === null) return false
  const order = value as Record<string, unknown>
  return (
    typeof order.id === 'string' &&
    typeof order.symbol === 'string' &&
    (order.direction === 'Buy' || order.direction === 'Sell') &&
    (order.orderType === 'Market' || order.orderType === 'Limit') &&
    typeof order.quantity === 'number' &&
    Number.isFinite(order.quantity) &&
    typeof order.filledQuantity === 'number' &&
    Number.isFinite(order.filledQuantity) &&
    // `.toFixed` is called on this the moment a restored row shows a fill.
    typeof order.averageFillPrice === 'number' &&
    Number.isFinite(order.averageFillPrice) &&
    (order.limitPrice === undefined ||
      (typeof order.limitPrice === 'number' && Number.isFinite(order.limitPrice))) &&
    (order.status === 'Working' ||
      order.status === 'PartiallyFilled' ||
      order.status === 'Filled' ||
      order.status === 'Cancelled' ||
      order.status === 'Rejected') &&
    (order.timeInForce === 'GTC' || order.timeInForce === 'IOC' || order.timeInForce === 'FOK') &&
    typeof order.ownerId === 'string' &&
    typeof order.ownerName === 'string' &&
    typeof order.createdAt === 'number' &&
    Number.isFinite(order.createdAt) &&
    typeof order.updatedAt === 'number' &&
    Number.isFinite(order.updatedAt)
  )
}
