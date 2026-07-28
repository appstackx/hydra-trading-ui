import { BehaviorSubject, type Observable } from 'rxjs'
import type { User } from '@/domain'
import type { AuthPort } from '../ports'

/**
 * Demo identity provider.
 *
 * Three seeded users with deliberately different permissions, because the
 * interesting thing to show a prospect is not a login form — every product has
 * one — but a read-only user watching the same prices with the deal buttons
 * turned off, and a junior trader refused on size.
 *
 * A real deployment replaces this with OIDC or SAML against the client's
 * identity provider. `AuthPort` is the seam; nothing above it changes.
 */

export const DEMO_USERS: readonly User[] = [
  {
    id: 'u-senior',
    name: 'A. Whitfield',
    desk: 'G10 Spot',
    role: 'trader',
    entitlements: {
      // Deliberately above the venue's 50m credit line: limits are layered, and
      // the senior mandate is the one that does not bind first.
      instruments: [],
      maxNotional: 100_000_000,
      canTrade: true,
      canCancelAnyOrder: true,
    },
  },
  {
    id: 'u-junior',
    name: 'D. Osei',
    desk: 'G10 Spot',
    role: 'trader',
    entitlements: {
      // Majors only, and a size a junior mandate would actually carry.
      instruments: ['EURUSD', 'GBPUSD', 'AUDUSD', 'BTCUSD', 'ETHUSD'],
      maxNotional: 2_000_000,
      canTrade: true,
      canCancelAnyOrder: false,
    },
  },
  {
    id: 'u-risk',
    name: 'M. Halvorsen',
    desk: 'Risk & Control',
    role: 'viewer',
    entitlements: {
      instruments: [],
      maxNotional: 0,
      canTrade: false,
      canCancelAnyOrder: false,
    },
  },
]

export const SESSION_STORAGE_KEY = 'hydra.session'

/** The demo accepts any non-empty passphrase; it is a shape, not a security control. */
export const DEMO_PASSPHRASE_HINT = 'Any passphrase will do — this is a demo provider.'

export interface MockAuthOptions {
  readonly users?: readonly User[]
  /** Injected so tests can supply their own, and Safari private mode cannot throw. */
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
}

export class MockAuth implements AuthPort {
  readonly users: readonly User[]

  private readonly subject: BehaviorSubject<User | null>
  private readonly storage: MockAuthOptions['storage']

  constructor(options: MockAuthOptions = {}) {
    this.users = options.users ?? DEMO_USERS
    this.storage = options.storage === undefined ? safeStorage() : options.storage
    this.subject = new BehaviorSubject<User | null>(this.restore())
  }

  currentUser$(): Observable<User | null> {
    return this.subject.asObservable()
  }

  get currentUser(): User | null {
    return this.subject.value
  }

  signIn(userId: string, passphrase: string): Promise<User> {
    const user = this.users.find((candidate) => candidate.id === userId)
    if (!user) {
      return Promise.reject(new Error('Unknown user'))
    }
    // Shape only. A real provider verifies a credential it never sees in the UI.
    if (passphrase.trim() === '') {
      return Promise.reject(new Error('Enter a passphrase'))
    }

    this.persist(user.id)
    this.subject.next(user)
    return Promise.resolve(user)
  }

  signOut(): Promise<void> {
    try {
      this.storage?.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // A session that cannot be cleared from storage is still cleared in memory.
    }
    this.subject.next(null)
    return Promise.resolve()
  }

  dispose(): void {
    this.subject.complete()
  }

  /** Restores a session across a refresh, which a trader will do without thinking. */
  private restore(): User | null {
    try {
      const id = this.storage?.getItem(SESSION_STORAGE_KEY)
      return this.users.find((candidate) => candidate.id === id) ?? null
    } catch {
      return null
    }
  }

  private persist(userId: string): void {
    try {
      this.storage?.setItem(SESSION_STORAGE_KEY, userId)
    } catch {
      // Non-fatal: the user stays signed in for this tab.
    }
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}
