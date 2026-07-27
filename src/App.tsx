import { useEffect, type ReactNode } from 'react'
import { ServicesProvider } from '@/app/ServicesContext'
import { ThemeProvider } from '@/app/ThemeContext'
import { ToastProvider } from '@/app/ToastContext'
import { StatusBar } from '@/app/StatusBar'
import { TitleBar } from '@/app/TitleBar'
import { Workspace } from '@/app/Workspace'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { BRAND } from '@/theme/brand'
import type { Services } from '@/services'

export interface AppProps {
  /** Injected by tests; production builds let the provider create the adapters. */
  readonly services?: Services
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
            <div className="flex h-full flex-col bg-canvas">
              <TitleBar />
              <Workspace />
              <StatusBar />
            </div>
          </ServicesProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
