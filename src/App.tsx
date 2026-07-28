import { useEffect, type ReactNode } from 'react'
import { ServicesProvider } from '@/app/ServicesContext'
import { AuthProvider, useUser } from '@/app/AuthContext'
import { ThemeProvider } from '@/app/ThemeContext'
import { ToastProvider } from '@/app/ToastContext'
import { StatusBar } from '@/app/StatusBar'
import { TitleBar } from '@/app/TitleBar'
import { Workspace } from '@/app/Workspace'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { SignIn } from '@/features/auth/SignIn'
import { BRAND } from '@/theme/brand'
import type { AppServices } from '@/services'

export interface AppProps {
  /** Injected by tests; production builds let the provider create the adapters. */
  readonly services?: AppServices
}

export function App({ services }: AppProps = {}): ReactNode {
  useEffect(() => {
    document.title = `${BRAND.productName} · ${BRAND.tagline}`
  }, [])

  return (
    <ErrorBoundary label="Application">
      <ThemeProvider>
        <ToastProvider>
          <ServicesProvider {...(services ? { services } : {})}>
            <AuthProvider>
              <Shell />
            </AuthProvider>
          </ServicesProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

/**
 * Gates the workspace behind sign-in.
 *
 * The whole dealing screen is unmounted while signed out rather than merely
 * hidden, so an unauthenticated session holds no positions, no blotter and no
 * price subscriptions in memory.
 */
function Shell(): ReactNode {
  const user = useUser()

  if (!user) {
    return (
      <div className="h-full bg-canvas">
        <SignIn />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <TitleBar />
      <Workspace />
      <StatusBar />
    </div>
  )
}
