import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface PanelProps {
  readonly title: string
  /** Short qualifier rendered beside the title, e.g. a row count. */
  readonly meta?: ReactNode
  /** Controls docked to the right of the header. */
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  /** Body padding is dropped for panels whose child is a full-bleed grid. */
  readonly flush?: boolean
}

/**
 * The single container every workspace region uses. Keeping the chrome in one
 * component is what stops eight panels drifting into eight slightly different
 * header heights.
 */
export function Panel({
  title,
  meta,
  actions,
  children,
  className,
  flush = false,
}: PanelProps): ReactNode {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-panel',
        className
      )}
      aria-label={title}
    >
      {/* Wraps rather than clipping: a panel with a busy toolbar grows a second
          header line instead of squeezing its own title into two words. */}
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-panel-raised px-3 py-1.5">
        <h2 className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-muted">
          {title}
        </h2>
        {meta !== undefined && (
          <span className="tnum whitespace-nowrap text-[11px] text-ink-subtle">{meta}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">{actions}</div>
      </header>
      {/*
        A container, so children can respond to the width of *this panel* rather
        than the viewport. A blotter squeezed into a narrow column needs to drop
        columns even on a 1600px monitor.
      */}
      <div className={cn('@container min-h-0 flex-1 overflow-auto', !flush && 'p-3')}>
        {children}
      </div>
    </section>
  )
}
