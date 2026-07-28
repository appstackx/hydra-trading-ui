import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { User } from '@/domain'
import { useObservable } from '@/hooks/useObservable'
import { useServices } from './ServicesContext'

interface AuthContextValue {
  readonly user: User | null
  readonly users: readonly User[]
  signIn: (userId: string, passphrase: string) => Promise<User>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const { auth } = useServices()
  const stream = useMemo(() => auth.currentUser$(), [auth])
  const user = useObservable<User | null>(stream, null)

  const signIn = useCallback(
    (userId: string, passphrase: string) => auth.signIn(userId, passphrase),
    [auth]
  )
  const signOut = useCallback(() => auth.signOut(), [auth])

  const value = useMemo(
    () => ({ user, users: auth.users, signIn, signOut }),
    [user, auth.users, signIn, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return value
}

/** The signed-in user, or `null`. Convenience for components that only need it. */
export function useUser(): User | null {
  return useAuth().user
}
