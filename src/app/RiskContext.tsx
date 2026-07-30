import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { KillSwitchState, RiskLimits } from '@/domain'
import { canOperateKillSwitch, haltReason, KILL_SWITCH_OFF, nextLossHaltState } from '@/domain'
import { useObservable } from '@/hooks/useObservable'
import { useTotalPnl } from '@/hooks/useMarketData'
import { useServices } from './ServicesContext'
import { useUser } from './AuthContext'

export interface RiskContextValue {
  readonly killSwitch: KillSwitchState
  readonly limits: RiskLimits
  /**
   * Non-null while dealing is halted desk-wide — by the kill switch or by the
   * daily loss limit. Every dealable control in the app checks this first.
   */
  readonly halt: { readonly reason: string } | null
  /** Whether the signed-in user may operate the kill switch. */
  readonly canOperate: boolean
  readonly engage: (reason: string) => Promise<void>
  readonly release: () => Promise<void>
}

const RiskContext = createContext<RiskContextValue | null>(null)

/**
 * Desk-wide dealing state, computed once and consumed by every tile.
 *
 * Centralised deliberately: the daily-loss check needs the marked P&L, and if
 * each tile computed that itself, ten tiles would re-derive the position book
 * on every tick. Here it is derived once and the tiles read a memoised value
 * that only changes when the halt state actually changes.
 */
export function RiskProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const { risk, audit } = useServices()
  const user = useUser()
  const pnl = useTotalPnl()

  const stream = useMemo(() => risk.killSwitch$(), [risk])
  const killSwitch = useObservable(stream, KILL_SWITCH_OFF)

  // The loss halt latches with hysteresis: it trips at the limit and re-arms
  // only once the P&L has recovered inside the band, so a book oscillating on
  // the threshold cannot flap dealing on and off every tick.
  const [lossHalted, setLossHalted] = useState(false)
  useEffect(() => {
    setLossHalted((current) => {
      const next = nextLossHaltState(current, pnl.amount, risk.limits)
      // Both transitions are audited, the same standard the kill switch holds.
      if (next && !current) {
        audit.record(
          'risk.loss-halt-engaged',
          `Daily loss limit breached — new risk suspended (limit ${String(risk.limits.maxDailyLossUsd)} USD)`,
          { limit: risk.limits.maxDailyLossUsd }
        )
      } else if (!next && current) {
        audit.record('risk.loss-halt-released', 'Daily loss halt released — P&L recovered', {
          limit: risk.limits.maxDailyLossUsd,
        })
      }
      return next
    })
  }, [pnl.amount, risk.limits, audit])

  const reason = haltReason(killSwitch, lossHalted, risk.limits)
  // Memoised on the string: it only changes on a state transition, never on a
  // tick, so context consumers do not re-render with the market.
  const halt = useMemo(() => (reason === null ? null : { reason }), [reason])

  const engage = useCallback((why: string) => risk.engageKillSwitch(why), [risk])
  const release = useCallback(() => risk.releaseKillSwitch(), [risk])

  const value = useMemo<RiskContextValue>(
    () => ({
      killSwitch,
      limits: risk.limits,
      halt,
      canOperate: canOperateKillSwitch(user),
      engage,
      release,
    }),
    [killSwitch, risk.limits, halt, user, engage, release]
  )

  return <RiskContext.Provider value={value}>{children}</RiskContext.Provider>
}

export function useRisk(): RiskContextValue {
  const value = useContext(RiskContext)
  if (!value) {
    throw new Error('useRisk must be used within a <RiskProvider>')
  }
  return value
}
