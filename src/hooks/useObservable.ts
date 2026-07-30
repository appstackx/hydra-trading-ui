import { useMemo, useRef, useSyncExternalStore } from 'react'
import type { Observable } from 'rxjs'
import { emitTelemetry } from '@/lib/telemetry'

/**
 * Subscribes a component to an Observable via `useSyncExternalStore`.
 *
 * Going through the store API rather than `useState` inside an effect is what
 * keeps a fast feed tear-free: React reads the current value during render, so a
 * tile can never paint a bid from one tick beside an ask from the next.
 *
 * The observable must be referentially stable — memoise it, or the subscription
 * is torn down and rebuilt on every render.
 */
export function useObservable<T>(source: Observable<T>, initialValue: T): T {
  // Survives the store being rebuilt when `source` changes, so a swapped stream
  // renders its predecessor's last value instead of flashing back to initial.
  const latest = useRef<T>(initialValue)

  // Arrow properties rather than methods: both are handed to
  // `useSyncExternalStore` detached from the object, so neither may depend on
  // its call-site `this`.
  const store = useMemo(() => {
    const subscribe = (onStoreChange: () => void): (() => void) => {
      const subscription = source.subscribe({
        next: (value) => {
          latest.current = value
          onStoreChange()
        },
        error: (error: unknown) => {
          // A dead stream must not blank the UI: hold the last good value and
          // make the failure visible to whoever is watching the console.
          console.error('[useObservable] stream error', error)
          emitTelemetry('ui.stream-error', {
            message: error instanceof Error ? error.message : String(error),
          })
        },
      })
      return () => {
        subscription.unsubscribe()
      }
    }

    const getSnapshot = (): T => latest.current

    return { subscribe, getSnapshot }
  }, [source])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
