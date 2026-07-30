import { describe, expect, it } from 'vitest'
import type { KillSwitchState, User } from '@/domain'
import { LocalAuditService } from '../audit/local-audit'
import { DeskRiskControls } from './risk-controls'

const RISK_USER: User = {
  id: 'u-risk',
  name: 'M. Halvorsen',
  desk: 'Risk & Control',
  role: 'viewer',
  entitlements: {
    instruments: [],
    maxNotional: 0,
    canTrade: false,
    canCancelAnyOrder: false,
    canOperateKillSwitch: true,
  },
}

const JUNIOR: User = {
  id: 'u-junior',
  name: 'D. Osei',
  desk: 'G10 Spot',
  role: 'trader',
  entitlements: {
    instruments: [],
    maxNotional: 2_000_000,
    canTrade: true,
    canCancelAnyOrder: false,
    canOperateKillSwitch: false,
  },
}

function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
}

function create(user: User | null, storage?: ReturnType<typeof memoryStorage>) {
  const audit = new LocalAuditService({ getUser: () => user, now: () => 1_000 })
  const risk = new DeskRiskControls({
    getUser: () => user,
    audit,
    now: () => 1_000,
    ...(storage === undefined ? {} : { storage }),
  })
  return { audit, risk }
}

describe('DeskRiskControls', () => {
  it('starts disengaged', () => {
    const { risk } = create(RISK_USER)

    expect(risk.killSwitch.engaged).toBe(false)
  })

  it('lets an entitled user halt dealing, recording who and why', async () => {
    const { risk, audit } = create(RISK_USER)

    await risk.engageKillSwitch('Fat print on the CME open')

    expect(risk.killSwitch).toEqual({
      engaged: true,
      engagedBy: 'M. Halvorsen',
      engagedAt: 1_000,
      reason: 'Fat print on the CME open',
    })
    expect(audit.snapshot[0]?.type).toBe('risk.kill-switch-engaged')
    expect(audit.snapshot[0]?.summary).toContain('Fat print')
  })

  it('a read-only risk user can halt dealing — that is the shape of the role', async () => {
    const { risk } = create(RISK_USER)

    await expect(risk.engageKillSwitch('halt')).resolves.toBeUndefined()
    expect(RISK_USER.entitlements.canTrade).toBe(false)
  })

  it('refuses a user without the entitlement, on both transitions', async () => {
    const { risk } = create(JUNIOR)

    await expect(risk.engageKillSwitch('please')).rejects.toThrow(/not entitled/)
    await expect(risk.releaseKillSwitch()).rejects.toThrow(/not entitled/)
    expect(risk.killSwitch.engaged).toBe(false)
  })

  it('refuses a signed-out session', async () => {
    const { risk } = create(null)

    await expect(risk.engageKillSwitch('halt')).rejects.toThrow(/not entitled/)
  })

  it('releases with an audit event naming who had halted', async () => {
    const { risk, audit } = create(RISK_USER)
    await risk.engageKillSwitch('halt')

    await risk.releaseKillSwitch()

    expect(risk.killSwitch.engaged).toBe(false)
    expect(audit.snapshot[0]?.type).toBe('risk.kill-switch-released')
    expect(audit.snapshot[0]?.summary).toContain('M. Halvorsen')
  })

  it('is idempotent in both directions, without duplicate audit events', async () => {
    const { risk, audit } = create(RISK_USER)

    await risk.releaseKillSwitch() // already off
    await risk.engageKillSwitch('halt')
    await risk.engageKillSwitch('halt again') // already on

    expect(audit.snapshot).toHaveLength(1)
    expect(risk.killSwitch.reason).toBe('halt')
  })

  it('defaults an empty reason rather than storing a blank', async () => {
    const { risk } = create(RISK_USER)

    await risk.engageKillSwitch('   ')

    expect(risk.killSwitch.reason).toBe('Manual halt')
  })

  it('publishes transitions to subscribers', async () => {
    const { risk } = create(RISK_USER)
    const seen: boolean[] = []
    risk.killSwitch$().subscribe((state: KillSwitchState) => seen.push(state.engaged))

    await risk.engageKillSwitch('halt')
    await risk.releaseKillSwitch()

    expect(seen).toEqual([false, true, false])
  })

  it('survives a refresh: a kill switch that forgets is not a kill switch', async () => {
    const storage = memoryStorage()
    const first = create(RISK_USER, storage)
    await first.risk.engageKillSwitch('halt before refresh')

    const second = create(RISK_USER, storage)

    expect(second.risk.killSwitch.engaged).toBe(true)
    expect(second.risk.killSwitch.reason).toBe('halt before refresh')
  })

  it('boots disengaged from a corrupt store', () => {
    const storage = memoryStorage()
    storage.setItem('hydra.v1.risk', '{broken')

    expect(create(RISK_USER, storage).risk.killSwitch.engaged).toBe(false)
  })

  it('has no back door: the only way out of a halt is an entitled release', async () => {
    const storage = memoryStorage()
    const { risk } = create(RISK_USER, storage)
    await risk.engageKillSwitch('halt')

    // The public surface offers exactly one release path, and it is
    // entitlement-checked — there is deliberately no clear()/reset() escape.
    expect('clear' in risk).toBe(false)

    const junior = create(JUNIOR, storage)
    await expect(junior.risk.releaseKillSwitch()).rejects.toThrow(/not entitled/)
    expect(junior.risk.killSwitch.engaged).toBe(true)
  })

  it('sanitises a crafted store instead of crashing the boot', () => {
    const storage = memoryStorage()
    // engagedAt as an object and engagedBy as a number would crash the banner
    // (formatTime / React child) at the one moment nothing can catch it.
    storage.setItem(
      'hydra.v1.risk',
      JSON.stringify({ engaged: true, engagedBy: 42, engagedAt: { evil: true }, reason: null })
    )

    const { risk } = create(RISK_USER, storage)

    expect(risk.killSwitch.engaged).toBe(true)
    expect(risk.killSwitch.engagedBy).toBeUndefined()
    expect(risk.killSwitch.engagedAt).toBeUndefined()
    expect(risk.killSwitch.reason).toBeUndefined()
  })
})
