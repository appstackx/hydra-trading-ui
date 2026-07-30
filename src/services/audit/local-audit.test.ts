import { describe, expect, it } from 'vitest'
import type { User } from '@/domain'
import type { AuditEvent } from '../ports'
import { LocalAuditService, MAX_AUDIT_EVENTS } from './local-audit'

const USER: User = {
  id: 'u-1',
  name: 'A. Whitfield',
  desk: 'G10 Spot',
  role: 'trader',
  entitlements: {
    instruments: [],
    maxNotional: 1,
    canTrade: true,
    canCancelAnyOrder: true,
    canOperateKillSwitch: true,
  },
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    dump: () => Object.fromEntries(store),
  }
}

const create = (options: Partial<ConstructorParameters<typeof LocalAuditService>[0]> = {}) =>
  new LocalAuditService({ getUser: () => USER, now: () => 1_000, ...options })

describe('LocalAuditService', () => {
  it('stamps user, time, sequence and id onto each event', () => {
    const audit = create()

    audit.record('trade.submitted', 'Buy 1m EURUSD at 1.08423', { rate: 1.08423 })

    expect(audit.snapshot[0]).toEqual({
      sequence: 1,
      id: 'AUD-000001',
      timestamp: 1_000,
      userId: 'u-1',
      userName: 'A. Whitfield',
      type: 'trade.submitted',
      summary: 'Buy 1m EURUSD at 1.08423',
      details: { rate: 1.08423 },
    })
  })

  it('numbers events monotonically, newest first in the stream', () => {
    const audit = create()

    audit.record('session.signed-in', 'first')
    audit.record('trade.submitted', 'second')

    expect(audit.snapshot.map((event) => event.sequence)).toEqual([2, 1])
  })

  it('records as system when nobody is signed in', () => {
    const audit = create({ getUser: () => null })

    audit.record('order.filled', 'Filled 1m EURUSD')

    expect(audit.snapshot[0]?.userId).toBe('system')
    expect(audit.snapshot[0]?.userName).toBe('system')
  })

  it('publishes each event to subscribers', () => {
    const audit = create()
    const seen: number[] = []
    audit.events$().subscribe((events) => seen.push(events.length))

    audit.record('session.signed-in', 'one')
    audit.record('session.signed-out', 'two')

    expect(seen).toEqual([0, 1, 2])
  })

  it('bounds the trail and keeps the newest events', () => {
    const audit = create()

    for (let index = 0; index < MAX_AUDIT_EVENTS + 25; index += 1) {
      audit.record('trade.submitted', `event ${String(index)}`)
    }

    expect(audit.snapshot).toHaveLength(MAX_AUDIT_EVENTS)
    expect(audit.snapshot[0]?.summary).toBe(`event ${String(MAX_AUDIT_EVENTS + 24)}`)
  })

  it('persists and restores across a restart, continuing the sequence', () => {
    const storage = memoryStorage()
    const first = create({ storage })
    first.record('trade.submitted', 'before refresh')

    const second = create({ storage })
    second.record('trade.executed', 'after refresh')

    expect(second.snapshot.map((event) => event.summary)).toEqual([
      'after refresh',
      'before refresh',
    ])
    // Continuation, not reissue: a duplicated audit id is a broken trail.
    expect(second.snapshot.map((event) => event.sequence)).toEqual([2, 1])
  })

  it('bounds a crafted store on restore, not only on record', () => {
    const oversized = {
      version: 1,
      nextSequence: 2_000,
      events: Array.from({ length: MAX_AUDIT_EVENTS + 100 }, (_, index) => ({
        sequence: index + 1,
        id: `AUD-${String(index + 1).padStart(6, '0')}`,
        timestamp: 5,
        userId: 'u-1',
        userName: 'A',
        type: 'trade.submitted',
        summary: `event ${String(index + 1)}`,
        details: {},
      })),
    }
    const storage = memoryStorage({ 'hydra.v1.audit': JSON.stringify(oversized) })

    const audit = create({ storage })

    expect(audit.snapshot).toHaveLength(MAX_AUDIT_EVENTS)
    // The newest survive; and the sequence continues above everything seen.
    audit.record('trade.executed', 'next')
    expect(audit.snapshot[0]?.sequence).toBe(2_001)
  })

  it('never reuses a sequence number, even against a crafted low counter', () => {
    const storage = memoryStorage({
      'hydra.v1.audit': JSON.stringify({
        version: 1,
        nextSequence: 1, // lies: events below go up to 7
        events: [
          {
            sequence: 7,
            id: 'AUD-000007',
            timestamp: 5,
            userId: 'u-1',
            userName: 'A',
            type: 'trade.submitted',
            summary: 'existing',
            details: {},
          },
        ],
      }),
    })

    const audit = create({ storage })
    audit.record('trade.executed', 'new event')

    expect(audit.snapshot[0]?.sequence).toBe(8)
  })

  it('drops an event whose timestamp would crash the drawer', () => {
    const storage = memoryStorage({
      'hydra.v1.audit': JSON.stringify({
        version: 1,
        nextSequence: 1,
        events: [
          {
            sequence: 1,
            id: 'AUD-000001',
            timestamp: null, // formatTime would throw a RangeError
            userId: 'u-1',
            userName: 'A',
            type: 'trade.submitted',
            summary: 'poisoned',
            details: {},
          },
        ],
      }),
    })

    expect(create({ storage }).snapshot).toEqual([])
  })

  it('boots empty from a corrupt store rather than crashing', () => {
    const storage = memoryStorage({ 'hydra.v1.audit': '{not json' })

    expect(create({ storage }).snapshot).toEqual([])
  })

  it('filters implausible events smuggled into the store', () => {
    const storage = memoryStorage({
      'hydra.v1.audit': JSON.stringify({
        version: 1,
        nextSequence: 2,
        events: [
          { nonsense: true },
          {
            sequence: 1,
            id: 'AUD-000001',
            timestamp: 5,
            userId: 'u-1',
            userName: 'A',
            type: 'trade.submitted',
            summary: 'real',
            details: {},
          },
        ],
      }),
    })

    const audit = create({ storage })

    expect(audit.snapshot).toHaveLength(1)
    expect(audit.snapshot[0]?.summary).toBe('real')
  })

  it('keeps recording when storage refuses writes', () => {
    const audit = create({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      },
    })

    audit.record('trade.submitted', 'still recorded')

    expect(audit.snapshot).toHaveLength(1)
  })

  it('never throws from record, even when the user resolver does', () => {
    const audit = create({
      getUser: () => {
        throw new Error('identity provider down')
      },
    })

    expect(() => {
      audit.record('trade.submitted', 'x')
    }).not.toThrow()
  })

  describe('exportCsv', () => {
    it('exports oldest first with a header', () => {
      const audit = create()
      audit.record('session.signed-in', 'first')
      audit.record('trade.submitted', 'second')

      const lines = audit.exportCsv().split('\n')

      expect(lines[0]).toContain('Sequence')
      expect(lines[1]).toContain('first')
      expect(lines[2]).toContain('second')
    })

    it('defuses spreadsheet formula injection from crafted content', () => {
      const audit = create()
      // A summary is user-influenceable via persisted storage; a leading `=`
      // must not survive into a cell Excel would execute.
      audit.record('trade.rejected', '=cmd|/c calc!A1', { note: '@SUM(1+1)' })

      const dataLine = audit.exportCsv().split('\n')[1] ?? ''

      expect(dataLine).toContain("'=cmd")
      expect(dataLine).not.toMatch(/,=cmd/)
    })

    it('quotes summaries containing commas and embeds details as JSON', () => {
      const audit = create()
      audit.record('trade.rejected', 'Rejected, price moved', { reason: 'drift, 12bps' })

      const csv = audit.exportCsv()

      expect(csv).toContain('"Rejected, price moved"')
      expect(csv).toContain('""reason""')
      // Parseable: quoted commas must not create columns.
      expect(csv.split('\n')).toHaveLength(2)
    })
  })

  describe('clear', () => {
    it('empties the trail, the store and the sequence', () => {
      const storage = memoryStorage()
      const audit = create({ storage })
      audit.record('trade.submitted', 'x')

      audit.clear()
      audit.record('trade.submitted', 'y')

      expect(audit.snapshot.map((event: AuditEvent) => event.sequence)).toEqual([1])
      expect(create({ storage }).snapshot).toHaveLength(1) // only the re-recorded event
    })
  })
})
