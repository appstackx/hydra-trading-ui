import { createContext, useContext, type ReactNode } from 'react'
import { createServices, seedFromSearch, type Services } from '@/services'

const ServicesContext = createContext<Services | null>(null)

/**
 * The demo back end is a process-wide singleton, exactly as a real socket to a
 * pricing gateway would be.
 *
 * It is deliberately not created inside the component and torn down on unmount:
 * StrictMode mounts, unmounts and remounts the tree in development, and a
 * connection destroyed by that cycle leaves every cached stream completed while
 * the UI happily keeps rendering their last replayed value. Owning it at module
 * scope means one connection per page, whatever React does to the tree.
 */
let defaultServices: Services | undefined

function getDefaultServices(): Services {
  defaultServices ??= createServices({
    seed: seedFromSearch(typeof window === 'undefined' ? '' : window.location.search),
  })
  return defaultServices
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
  readonly services?: Services
}

export function ServicesProvider({ children, services }: ServicesProviderProps): ReactNode {
  return (
    <ServicesContext.Provider value={services ?? getDefaultServices()}>
      {children}
    </ServicesContext.Provider>
  )
}

/** Access to the ports. Throws outside a provider rather than returning null. */
export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) {
    throw new Error('useServices must be used within a <ServicesProvider>')
  }
  return services
}
