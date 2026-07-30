import { BehaviorSubject, type Observable } from 'rxjs'
import type { KillSwitchState, RiskLimits, User } from '@/domain'
import { canOperateKillSwitch, DEFAULT_RISK_LIMITS, KILL_SWITCH_OFF } from '@/domain'
import type { AuditPort, RiskPort } from '../ports'

export interface DeskRiskControlsOptions {
  readonly getUser: () => User | null
  readonly audit: AuditPort
  readonly limits?: RiskLimits
  /** Omit for memory-only state; provide storage so a halt survives a refresh. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  readonly storageKey?: string
  readonly now?: () => number
}

/**
 * The desk kill switch and its limits.
 *
 * Engaging and releasing are entitlement-checked here in the service layer, not
 * only at the button: the UI hiding a control is a courtesy, and this class is
 * what refuses a call that arrives anyway. Both transitions are audited with
 * who and why.
 *
 * State persists across a refresh on purpose, and there is deliberately no
 * back door out of it: not `?fresh=1`, not the demo reset. A kill switch that
 * anything other than an entitled release can clear is not a kill switch.
 */
export class DeskRiskControls implements RiskPort {
  readonly limits: RiskLimits

  private readonly getUser: () => User | null
  private readonly audit: AuditPort
  private readonly storage: DeskRiskControlsOptions['storage']
  private readonly storageKey: string
  private readonly now: () => number
  private readonly subject: BehaviorSubject<KillSwitchState>

  constructor(options: DeskRiskControlsOptions) {
    this.getUser = options.getUser
    this.audit = options.audit
    this.limits = options.limits ?? DEFAULT_RISK_LIMITS
    this.storage = options.storage
    this.storageKey = options.storageKey ?? 'hydra.v1.risk'
    this.now = options.now ?? Date.now
    this.subject = new BehaviorSubject<KillSwitchState>(this.restore())
  }

  killSwitch$(): Observable<KillSwitchState> {
    return this.subject.asObservable()
  }

  get killSwitch(): KillSwitchState {
    return this.subject.value
  }

  engageKillSwitch(reason: string): Promise<void> {
    const user = this.getUser()
    if (!canOperateKillSwitch(user)) {
      return Promise.reject(new Error('You are not entitled to operate the kill switch'))
    }
    if (this.subject.value.engaged) return Promise.resolve() // idempotent

    const state: KillSwitchState = {
      engaged: true,
      engagedBy: user?.name ?? 'unknown',
      engagedAt: this.now(),
      reason: reason.trim() === '' ? 'Manual halt' : reason,
    }
    this.subject.next(state)
    this.persist()
    this.audit.record('risk.kill-switch-engaged', `Dealing halted: ${state.reason ?? ''}`.trim(), {
      reason: state.reason ?? '',
    })
    return Promise.resolve()
  }

  releaseKillSwitch(): Promise<void> {
    const user = this.getUser()
    if (!canOperateKillSwitch(user)) {
      return Promise.reject(new Error('You are not entitled to operate the kill switch'))
    }
    if (!this.subject.value.engaged) return Promise.resolve()

    const halted = this.subject.value
    this.subject.next(KILL_SWITCH_OFF)
    this.persist()
    this.audit.record(
      'risk.kill-switch-released',
      `Dealing resumed (halted by ${halted.engagedBy ?? 'unknown'})`,
      { previouslyEngagedBy: halted.engagedBy ?? '' }
    )
    return Promise.resolve()
  }

  dispose(): void {
    this.subject.complete()
  }

  private persist(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.subject.value))
    } catch {
      // The in-memory switch still holds.
    }
  }

  private restore(): KillSwitchState {
    if (!this.storage) return KILL_SWITCH_OFF
    try {
      const raw = this.storage.getItem(this.storageKey)
      if (raw === null) return KILL_SWITCH_OFF
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return KILL_SWITCH_OFF

      // Field-by-field: the banner renders `engagedBy` and formats `engagedAt`
      // as a time, so a crafted object or non-finite number in either would
      // crash the shell at boot — the one moment nothing can catch it.
      const candidate = parsed as Record<string, unknown>
      if (candidate.engaged !== true) return KILL_SWITCH_OFF

      return {
        engaged: true,
        ...(typeof candidate.engagedBy === 'string' ? { engagedBy: candidate.engagedBy } : {}),
        ...(typeof candidate.engagedAt === 'number' && Number.isFinite(candidate.engagedAt)
          ? { engagedAt: candidate.engagedAt }
          : {}),
        ...(typeof candidate.reason === 'string' ? { reason: candidate.reason } : {}),
      }
    } catch {
      return KILL_SWITCH_OFF
    }
  }
}
