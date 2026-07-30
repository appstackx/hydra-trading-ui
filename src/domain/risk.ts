import type { DealPermission } from './auth'
import { formatMoney } from './formatting'

/**
 * Desk-level risk controls.
 *
 * Pure rules, same reasoning as `auth.ts`: "when must the desk stop dealing" is
 * a question a client's risk function asks before anything else, and the answer
 * has to be testable with no transport, no React and no clock of its own.
 *
 * As with entitlements, what ships here is the display-and-first-line half of
 * the contract. A deployment enforces the same rules in the order path
 * server-side; a disabled button is a courtesy, not a control.
 */

export interface KillSwitchState {
  readonly engaged: boolean
  /** Who threw it. Absent while disengaged. */
  readonly engagedBy?: string
  /** Epoch milliseconds. Absent while disengaged. */
  readonly engagedAt?: number
  readonly reason?: string
}

export const KILL_SWITCH_OFF: KillSwitchState = { engaged: false }

export interface RiskLimits {
  /**
   * Loss at which the desk stops opening new risk, in the reporting currency,
   * expressed as a positive number.
   */
  readonly maxDailyLossUsd: number
  /**
   * Furthest a limit price may sit from the prevailing mid, in basis points.
   * Catches the classic fat finger: 1.0842 typed as 10.842.
   */
  readonly fatFingerBps: number
  /**
   * Age at which a live quote is no longer dealable, in milliseconds. Applies
   * to live venue feeds only — the simulated feed runs on an injected clock,
   * so comparing it against wall time would be meaningless.
   */
  readonly staleQuoteMs: number
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxDailyLossUsd: 250_000,
  fatFingerBps: 500,
  staleQuoteMs: 30_000,
}

const ALLOWED: DealPermission = { allowed: true }

/**
 * Whether a limit price is close enough to the market to be intentional.
 *
 * There is deliberately no override path: on a real desk an override is a
 * four-eyes workflow with its own audit trail, not a confirm dialog, and
 * pretending otherwise here would be worse than refusing.
 */
export function checkFatFinger(
  limitPrice: number,
  referenceMid: number,
  maxBps: number
): DealPermission {
  if (!Number.isFinite(limitPrice) || !Number.isFinite(referenceMid) || referenceMid <= 0) {
    return ALLOWED // nothing to compare against; validation owns malformed input
  }

  const deviationBps = (Math.abs(limitPrice - referenceMid) / referenceMid) * 10_000
  // The epsilon absorbs float representation error at the boundary: a limit
  // sitting exactly on the threshold must not be rejected because
  // (1.05 - 1.0) / 1.0 is not representable as precisely 0.05.
  if (deviationBps <= maxBps * (1 + Number.EPSILON * 8)) return ALLOWED

  return {
    allowed: false,
    reason: `Limit is ${Math.round(deviationBps).toLocaleString('en-GB')} bps from the market (max ${String(maxBps)})`,
  }
}

/** True once the session's P&L has fallen through the daily loss limit. */
export function dailyLossBreached(totalPnl: number, maxDailyLoss: number): boolean {
  if (!Number.isFinite(totalPnl) || maxDailyLoss <= 0) return false
  return totalPnl <= -maxDailyLoss
}

/**
 * Fraction of the limit the P&L must recover past before a tripped loss halt
 * re-arms. Without the band, P&L oscillating on the threshold flaps the halt
 * on and off with every tick.
 */
export const LOSS_HALT_REARM_RATIO = 0.9

/**
 * One step of the loss-halt latch: trips at the limit, and once tripped stays
 * tripped until the P&L recovers inside the re-arm band.
 *
 * This is the demo's approximation of the real rule — on a live desk a loss
 * halt latches until risk sign-off releases it, server-side, and does not
 * self-release at all.
 */
export function nextLossHaltState(
  currentlyHalted: boolean,
  totalPnl: number | undefined,
  limits: RiskLimits
): boolean {
  if (totalPnl === undefined || !Number.isFinite(totalPnl)) return currentlyHalted
  if (!currentlyHalted) return dailyLossBreached(totalPnl, limits.maxDailyLossUsd)
  // Tripped: release only once clearly back inside the band.
  return totalPnl <= -limits.maxDailyLossUsd * LOSS_HALT_REARM_RATIO
}

/**
 * True when a quote is too old to deal on.
 *
 * A stale price on a dealing screen is worse than no price: the trader is
 * looking at a rate nobody stands behind. Callers gate this to live feeds.
 */
export function isQuoteStale(quoteTimestamp: number, now: number, thresholdMs: number): boolean {
  if (!Number.isFinite(quoteTimestamp) || thresholdMs <= 0) return false
  return now - quoteTimestamp > thresholdMs
}

/**
 * The desk-wide reason dealing is halted, or `null` when it is not.
 *
 * The kill switch outranks the loss limit: if both apply, the human decision
 * is the one to report. The loss message deliberately quotes the limit, not
 * the live P&L — embedding a figure that moves every tick would churn the
 * string, and everything memoised on it, thirty times a second.
 */
export function haltReason(
  killSwitch: KillSwitchState,
  lossHalted: boolean,
  limits: RiskLimits
): string | null {
  if (killSwitch.engaged) {
    const by = killSwitch.engagedBy ?? 'risk control'
    return `Dealing halted — kill switch engaged by ${by}`
  }

  if (lossHalted) {
    return `Daily loss limit breached — new risk suspended (limit ${formatMoney(
      limits.maxDailyLossUsd
    )} USD)`
  }

  return null
}
