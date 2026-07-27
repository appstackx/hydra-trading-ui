import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  toggleTheme as flip,
  type ThemeName,
} from '@/theme/theme'

interface ThemeContextValue {
  readonly theme: ThemeName
  readonly setTheme: (theme: ThemeName) => void
  readonly toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [theme, setThemeState] = useState<ThemeName>(() => resolveInitialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next)
    persistTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = flip(current)
      persistTheme(next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used within a <ThemeProvider>')
  }
  return value
}
