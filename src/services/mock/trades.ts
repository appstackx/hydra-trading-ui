import { BehaviorSubject, type Observable } from 'rxjs'
import type { Trade } from '@/domain'
import type { TradePort } from '../ports'

/**
 * Rows retained in the blotter. A desk keeps far more, but an unbounded
 * in-memory array is how a long-running demo turns into a memory leak.
 */
export const MAX_BLOTTER_ROWS = 500

/** Blotter backed by an in-memory list, newest trade first. */
export class InMemoryTradeStore implements TradePort {
  private readonly subject: BehaviorSubject<readonly Trade[]>

  constructor(initial: readonly Trade[] = []) {
    this.subject = new BehaviorSubject<readonly Trade[]>(
      [...initial].sort((a, b) => b.tradeDate - a.tradeDate).slice(0, MAX_BLOTTER_ROWS)
    )
  }

  trades$(): Observable<readonly Trade[]> {
    return this.subject.asObservable()
  }

  /** Current contents, for code that needs a snapshot rather than a stream. */
  get snapshot(): readonly Trade[] {
    return this.subject.value
  }

  record(trade: Trade): void {
    this.subject.next([trade, ...this.subject.value].slice(0, MAX_BLOTTER_ROWS))
  }

  dispose(): void {
    this.subject.complete()
  }
}
