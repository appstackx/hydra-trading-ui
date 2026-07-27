import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

/*
 * Browser APIs jsdom does not implement, all of which sit on ordinary render
 * paths: `matchMedia` for the theme resolver, `ResizeObserver` for layout-aware
 * components, and the object-URL pair for the blotter's CSV export.
 *
 * They are plain functions rather than `vi.fn()` on purpose. The suite runs with
 * `restoreMocks: true`, which resets every spy after each test — a `vi.fn()`
 * installed here would survive exactly one test and then return undefined.
 * Assignment is unconditional so the environment is identical on every run.
 */
if (typeof window !== 'undefined') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })

  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => {}
}
