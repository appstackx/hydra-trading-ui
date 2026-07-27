export type ThemeName = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'hydra.theme'

/** Trading floors run dark; that is the default unless the user says otherwise. */
export const DEFAULT_THEME: ThemeName = 'dark'

function isThemeName(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light'
}

/**
 * Resolves the theme to open with: an explicit stored choice wins, otherwise the
 * OS preference, otherwise dark.
 *
 * Storage access is wrapped because Safari throws on `localStorage` in private
 * browsing, and a theme lookup must never be able to stop the app from booting.
 */
export function resolveInitialTheme(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
  prefersLight = matchesPrefersLight()
): ThemeName {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY)
    if (isThemeName(stored)) return stored
  } catch {
    // Ignore and fall through to the OS preference.
  }
  return prefersLight ? 'light' : DEFAULT_THEME
}

export function persistTheme(
  theme: ThemeName,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage()
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A user who cannot persist their theme still gets a working app.
  }
}

/** Writes the theme onto the document root, where the CSS variables key off it. */
export function applyTheme(
  theme: ThemeName,
  root: HTMLElement | null = document.documentElement
): void {
  root?.setAttribute('data-theme', theme)
  root?.style.setProperty('color-scheme', theme)
}

export function toggleTheme(theme: ThemeName): ThemeName {
  return theme === 'dark' ? 'light' : 'dark'
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function matchesPrefersLight(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}
