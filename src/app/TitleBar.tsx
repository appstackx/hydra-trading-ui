import type { ReactNode } from 'react'
import { BRAND } from '@/theme/brand'
import { useTheme } from './ThemeContext'

/**
 * Product chrome. Every string and the accent mark come from {@link BRAND}, so a
 * licensee's build carries their name without a component change.
 */
export function TitleBar(): ReactNode {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-md bg-brand text-[10px] font-bold tracking-tight text-white"
          aria-hidden="true"
        >
          {BRAND.productInitials}
        </span>
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight text-ink">
            {BRAND.productName}
          </h1>
          <p className="hidden truncate text-[11px] text-ink-subtle sm:block">{BRAND.tagline}</p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <a
          href={BRAND.vendorUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="hidden text-[11px] font-medium text-ink-subtle transition-colors hover:text-ink md:block"
        >
          by {BRAND.vendorName}
        </a>
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="grid size-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  )
}

function SunIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
