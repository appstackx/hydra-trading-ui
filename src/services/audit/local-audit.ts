import { BehaviorSubject, type Observable } from 'rxjs'
import type { User } from '@/domain'
import { formatDateTime } from '@/domain'
import { toCsv } from '@/lib/csv'
import type { AuditEvent, AuditEventType, AuditPort } from '../ports'

/**
 * Events retained. Bounded FIFO, oldest dropped first — a browser store is a
 * capture buffer, not the system of record. The sequence numbers make any
 * truncation visible: an export that starts at sequence 137 is saying 136
 * older events have rolled out of the window.
 */
export const MAX_AUDIT_EVENTS = 500

export interface LocalAuditOptions {
  /** Resolves who to stamp on each event. `null` records as `system`. */
  readonly getUser: () => User | null
  /** Omit for a memory-only trail, as tests and the harness do. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  readonly storageKey?: string
  readonly now?: () => number
}

interface PersistedTrail {
  readonly version: 1
  readonly nextSequence: number
  /** Oldest first, matching append order. */
  readonly events: readonly AuditEvent[]
}

const CSV_HEADERS = [
  'Sequence',
  'Event ID',
  'Timestamp (UTC ms)',
  'Timestamp',
  'User ID',
  'User',
  'Type',
  'Summary',
  'Details (JSON)',
] as const

/**
 * The audit trail: who did what, when, and — for a trade — the exact quote
 * they were shown when they did it.
 *
 * That last field is the whole point. In a disputed trade, "what price was on
 * the screen at the moment of the click" is the evidence, and it only exists
 * if it was captured at the click. Under MiFID II Art. 16(6) / SYSC 9 the
 * retention obligation belongs to the client; this class is the capture half —
 * a deployment points `record` at their audit store as well as this buffer.
 *
 * `record` never throws by design: a broken audit pipe must degrade to a
 * console error, not take the dealing screen down with it.
 */
export class LocalAuditService implements AuditPort {
  private readonly getUser: () => User | null
  private readonly storage: LocalAuditOptions['storage']
  private readonly storageKey: string
  private readonly now: () => number

  /** Newest first, matching how the UI reads it. */
  private readonly subject: BehaviorSubject<readonly AuditEvent[]>
  private sequence: number

  constructor(options: LocalAuditOptions) {
    this.getUser = options.getUser
    this.storage = options.storage
    this.storageKey = options.storageKey ?? 'hydra.v1.audit'
    this.now = options.now ?? Date.now

    const restored = this.restore()
    this.sequence = restored.nextSequence
    this.subject = new BehaviorSubject<readonly AuditEvent[]>(
      [...restored.events].reverse() // stored oldest-first, exposed newest-first
    )
  }

  record(
    type: AuditEventType,
    summary: string,
    details: Readonly<Record<string, string | number | boolean>> = {}
  ): void {
    try {
      const user = this.getUser()
      this.sequence += 1

      const event: AuditEvent = {
        sequence: this.sequence,
        id: `AUD-${String(this.sequence).padStart(6, '0')}`,
        timestamp: this.now(),
        userId: user?.id ?? 'system',
        userName: user?.name ?? 'system',
        type,
        summary,
        details,
      }

      this.subject.next([event, ...this.subject.value].slice(0, MAX_AUDIT_EVENTS))
      this.persist()
    } catch (error) {
      console.error('[audit] failed to record event', error)
    }
  }

  events$(): Observable<readonly AuditEvent[]> {
    return this.subject.asObservable()
  }

  get snapshot(): readonly AuditEvent[] {
    return this.subject.value
  }

  exportCsv(): string {
    const oldestFirst = [...this.subject.value].reverse()
    return toCsv(
      CSV_HEADERS,
      oldestFirst.map((event) => [
        event.sequence,
        event.id,
        event.timestamp,
        formatDateTime(event.timestamp),
        event.userId,
        event.userName,
        event.type,
        event.summary,
        JSON.stringify(event.details),
      ])
    )
  }

  /** Empties the trail and the backing store. For the demo reset only. */
  clear(): void {
    this.subject.next([])
    this.sequence = 0
    try {
      this.storage?.removeItem(this.storageKey)
    } catch {
      // A store that refuses the delete still loses the in-memory trail.
    }
  }

  dispose(): void {
    this.subject.complete()
  }

  private persist(): void {
    if (!this.storage) return
    try {
      const trail: PersistedTrail = {
        version: 1,
        nextSequence: this.sequence,
        events: [...this.subject.value].reverse(),
      }
      this.storage.setItem(this.storageKey, JSON.stringify(trail))
    } catch {
      // Quota or private-mode failure: the in-memory trail keeps working.
    }
  }

  private restore(): { nextSequence: number; events: readonly AuditEvent[] } {
    const empty = { nextSequence: 0, events: [] as readonly AuditEvent[] }
    if (!this.storage) return empty

    try {
      const raw = this.storage.getItem(this.storageKey)
      if (raw === null) return empty

      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as PersistedTrail).version !== 1 ||
        !Array.isArray((parsed as PersistedTrail).events)
      ) {
        return empty
      }

      const trail = parsed as PersistedTrail
      // The bound applies on the way in too: a crafted store must not smuggle
      // an unbounded array past the cap that `record` enforces.
      const events = trail.events.filter(isPlausibleEvent).slice(-MAX_AUDIT_EVENTS)
      const maxSeen = events.reduce((max, event) => Math.max(max, event.sequence), 0)
      // Never trust the persisted counter below the events it sits beside —
      // reusing a sequence number is a corrupted trail, which is worse than a
      // gap.
      const persisted =
        Number.isFinite(trail.nextSequence) && trail.nextSequence >= 0 ? trail.nextSequence : 0
      return { nextSequence: Math.max(persisted, maxSeen), events }
    } catch {
      // A corrupt store must never stop the app booting.
      return empty
    }
  }
}

/** Shallow shape check, so hostile localStorage cannot smuggle junk into the UI. */
function isPlausibleEvent(value: unknown): value is AuditEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Record<string, unknown>
  return (
    typeof event.sequence === 'number' &&
    Number.isFinite(event.sequence) &&
    typeof event.id === 'string' &&
    // Finite, or `formatTime` throws a RangeError the moment the drawer opens.
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) &&
    typeof event.type === 'string' &&
    typeof event.summary === 'string' &&
    typeof event.userId === 'string' &&
    typeof event.userName === 'string' &&
    typeof event.details === 'object' &&
    event.details !== null
  )
}
