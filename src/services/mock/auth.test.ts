import { describe, expect, it } from 'vitest'
import type { User } from '@/domain'
import { DEMO_USERS, MockAuth, SESSION_STORAGE_KEY } from './auth'

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
  }
}

/** Storage that throws, as Safari does in private browsing. */
const hostileStorage = {
  getItem: (): string => {
    throw new Error('SecurityError')
  },
  setItem: (): void => {
    throw new Error('SecurityError')
  },
  removeItem: (): void => {
    throw new Error('SecurityError')
  },
}

describe('MockAuth', () => {
  it('starts signed out', () => {
    const auth = new MockAuth({ storage: memoryStorage() })

    expect(auth.currentUser).toBeNull()
  })

  it('signs a known user in', async () => {
    const auth = new MockAuth({ storage: memoryStorage() })

    const user = await auth.signIn('u-senior', 'anything')

    expect(user.id).toBe('u-senior')
    expect(auth.currentUser?.id).toBe('u-senior')
  })

  it('rejects an unknown user', async () => {
    const auth = new MockAuth({ storage: memoryStorage() })

    await expect(auth.signIn('nobody', 'anything')).rejects.toThrow(/Unknown user/)
    expect(auth.currentUser).toBeNull()
  })

  it('requires a passphrase, even though it does not check it', async () => {
    const auth = new MockAuth({ storage: memoryStorage() })

    await expect(auth.signIn('u-senior', '   ')).rejects.toThrow(/passphrase/)
  })

  it('publishes the signed-in user to subscribers', async () => {
    const auth = new MockAuth({ storage: memoryStorage() })
    const seen: (User | null)[] = []
    auth.currentUser$().subscribe((user) => seen.push(user))

    await auth.signIn('u-risk', 'demo')
    await auth.signOut()

    expect(seen.map((user) => user?.id ?? null)).toEqual([null, 'u-risk', null])
  })

  it('restores the session across a refresh', async () => {
    const storage = memoryStorage()
    await new MockAuth({ storage }).signIn('u-junior', 'demo')

    // A trader will refresh without thinking; being thrown out is unacceptable.
    expect(new MockAuth({ storage }).currentUser?.id).toBe('u-junior')
  })

  it('clears the stored session on sign-out', async () => {
    const storage = memoryStorage()
    const auth = new MockAuth({ storage })
    await auth.signIn('u-junior', 'demo')

    await auth.signOut()

    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(new MockAuth({ storage }).currentUser).toBeNull()
  })

  it('ignores a stored id that is no longer a valid user', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: 'u-departed' })

    expect(new MockAuth({ storage }).currentUser).toBeNull()
  })

  it('still signs in when storage is unavailable', async () => {
    const auth = new MockAuth({ storage: hostileStorage })

    const user = await auth.signIn('u-senior', 'demo')

    expect(user.id).toBe('u-senior')
    expect(auth.currentUser?.id).toBe('u-senior')
  })

  it('still signs out when storage refuses the delete', async () => {
    const auth = new MockAuth({ storage: hostileStorage })
    await auth.signIn('u-senior', 'demo')

    await auth.signOut()

    expect(auth.currentUser).toBeNull()
  })

  it('accepts a custom user list', async () => {
    const custom: User = {
      id: 'u-custom',
      name: 'T. Custom',
      desk: 'Test',
      role: 'sales',
      entitlements: {
        instruments: ['EURUSD'],
        maxNotional: 1,
        canTrade: true,
        canCancelAnyOrder: false,
      },
    }
    const auth = new MockAuth({ users: [custom], storage: memoryStorage() })

    expect(auth.users).toEqual([custom])
    await expect(auth.signIn('u-senior', 'demo')).rejects.toThrow()
  })
})

describe('DEMO_USERS', () => {
  it('offers a senior trader, a limited junior and a read-only user', () => {
    expect(DEMO_USERS).toHaveLength(3)

    const [senior, junior, risk] = DEMO_USERS
    expect(senior?.entitlements.canTrade).toBe(true)
    expect(senior?.entitlements.instruments).toEqual([])

    expect(junior?.entitlements.canTrade).toBe(true)
    expect(junior?.entitlements.instruments.length).toBeGreaterThan(0)
    expect(junior?.entitlements.maxNotional).toBeLessThan(senior?.entitlements.maxNotional ?? 0)

    expect(risk?.entitlements.canTrade).toBe(false)
  })

  it('gives every user a unique id', () => {
    expect(new Set(DEMO_USERS.map((user) => user.id)).size).toBe(DEMO_USERS.length)
  })
})
