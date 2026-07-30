import { createContext, useContext, type ReactNode } from 'react'
import {
  createServices,
  seedFromSearch,
  sessionOptionsFromSearch,
  type AppServices,
} from '@/services'

const ServicesContext = createContext<AppServices | null>(null)

/**
 * The back end is a process-wide singleton, exactly as a real socket to a
 * pricing gateway would be.
 *
 * It is deliberately not created inside the component and torn down on unmount:
 * StrictMode mounts, unmounts and remounts the tree in development, and a
 * connection destroyed by that cycle leaves every cached stream completed while
 * the UI happily keeps rendering their last replayed value. Owning it at module
 * scope means one connection per page, whatever React does to the tree.
 */
let defaultServices: AppServices | undefined

function getDefaultServices(): AppServices {
  const search = typeof window === 'undefined' ? '' : window.location.search
  defaultServices ??= createServices({
    ...sessionOptionsFromSearch(search),
    seed: seedFromSearch(search),
    storage: safeLocalStorage(),
  })
  return defaultServices
}

/** Safari throws on `localStorage` in some private modes; boot must survive. */
function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** Disposes the shared instance. For tests and hot-reload teardown only. */
export function resetDefaultServices(): void {
  defaultServices?.dispose()
  defaultServices = undefined
}

export interface ServicesProviderProps {
  readonly children: ReactNode
  /**
   * Injected by tests and Storybook, which own the lifecycle of what they pass
   * in. Omitted in the deployed app, which uses the shared instance.
   */
  readonly services?: AppServices
}

export function ServicesProvider({ children, services }: ServicesProviderProps): ReactNode {
  return (
    <ServicesContext.Provider value={services ?? getDefaultServices()}>
      {children}
    </ServicesContext.Provider>
  )
}

/** Access to the ports. Throws outside a provider rather than returning null. */
export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) {
    throw new Error('useServices must be used within a <ServicesProvider>')
  }
  return services
}

/** How this session was assembled: feed mode, instruments, default tiles. */
export function useSessionConfig(): AppServices['config'] {
  return useServices().config
}
