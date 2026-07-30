import type { Symbol_ } from './types'

/**
 * Identity and permissions.
 *
 * Kept in the domain layer, and kept pure, because "who may trade what, at what
 * size" is the first question a client's compliance function asks and the
 * answer has to be testable in isolation from any identity provider.
 *
 * The rules here are the *display* half of the contract. A real deployment
 * enforces the same rules server-side and treats the UI as a reflection of
 * them, never as the control — a disabled button is a courtesy, not a limit.
 */

export type Role = 'trader' | 'sales' | 'viewer'

export interface Entitlements {
  /** Instruments the user may see. Empty means every instrument. */
  readonly instruments: readonly Symbol_[]
  /** Largest single ticket, in base currency units. Zero means no dealing. */
  readonly maxNotional: number
  /** Whether the user may submit orders at all. */
  readonly canTrade: boolean
  /** Whether the user may cancel orders they did not raise. */
  readonly canCancelAnyOrder: boolean
  /**
   * Whether the user may halt and resume dealing desk-wide. Deliberately
   * independent of `canTrade`: on a real desk the person who throws the kill
   * switch is usually in risk control and cannot deal at all.
   */
  readonly canOperateKillSwitch: boolean
}

export interface User {
  readonly id: string
  readonly name: string
  /** Desk or team, shown beside the name. */
  readonly desk: string
  readonly role: Role
  readonly entitlements: Entitlements
}

/** Read-only access to everything and dealing rights on nothing. */
export const VIEWER_ENTITLEMENTS: Entitlements = {
  instruments: [],
  maxNotional: 0,
  canTrade: false,
  canCancelAnyOrder: false,
  canOperateKillSwitch: false,
}

/** Whether the user may halt and resume dealing desk-wide. */
export function canOperateKillSwitch(user: User | null): boolean {
  return user?.entitlements.canOperateKillSwitch ?? false
}

/** True when the user may see this instrument at all. */
export function canView(user: User | null, symbol: Symbol_): boolean {
  if (!user) return false
  const { instruments } = user.entitlements
  return instruments.length === 0 || instruments.includes(symbol)
}

/** Instruments the user is permitted to see, filtered from what the venue quotes. */
export function visibleInstruments<T extends { symbol: Symbol_ }>(
  user: User | null,
  instruments: readonly T[]
): T[] {
  if (!user) return []
  return instruments.filter((instrument) => canView(user, instrument.symbol))
}

export type DealPermission =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }

const ALLOWED: DealPermission = { allowed: true }

/**
 * Whether this user may deal this size in this instrument.
 *
 * Returns the reason on refusal so the UI can say why rather than presenting a
 * disabled control with no explanation — an unexplained dead button on a
 * dealing screen generates a support call every time.
 */
export function canDeal(user: User | null, symbol: Symbol_, notional: number): DealPermission {
  if (!user) {
    return { allowed: false, reason: 'Not signed in' }
  }

  if (!user.entitlements.canTrade) {
    return { allowed: false, reason: `${roleLabel(user.role)} access does not permit dealing` }
  }

  if (!canView(user, symbol)) {
    return { allowed: false, reason: `You are not entitled to trade ${symbol}` }
  }

  if (!Number.isFinite(notional) || notional <= 0) {
    return { allowed: false, reason: 'Enter a quantity greater than zero' }
  }

  if (notional > user.entitlements.maxNotional) {
    return {
      allowed: false,
      reason: `Exceeds your ${user.entitlements.maxNotional.toLocaleString('en-GB')} limit`,
    }
  }

  return ALLOWED
}

/** Whether the user may cancel a given order. */
export function canCancel(user: User | null, orderOwnerId: string): boolean {
  if (!user || !user.entitlements.canTrade) return false
  return user.entitlements.canCancelAnyOrder || user.id === orderOwnerId
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'trader':
      return 'Trader'
    case 'sales':
      return 'Sales'
    case 'viewer':
      return 'Read-only'
  }
}

/** Initials for the avatar in the title bar. */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s.]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}
