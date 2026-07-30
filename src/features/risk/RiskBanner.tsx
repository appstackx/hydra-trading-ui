import type { ReactNode } from 'react'
import { formatTime } from '@/domain'
import { useRisk } from '@/app/RiskContext'
import { useToasts } from '@/app/ToastContext'

/**
 * The halted-desk banner.
 *
 * Full-width, red and impossible to miss, because that is the whole design
 * brief of a kill switch indicator. It names who halted dealing and when —
 * "the screen stopped working" and "risk control stopped the desk at 14:02"
 * are very different phone calls.
 */
export function RiskBanner(): ReactNode {
  const { halt, killSwitch, canOperate, release } = useRisk()
  const { push } = useToasts()

  if (!halt) return null

  const handleRelease = (): void => {
    void release().catch((error: unknown) => {
      push({
        tone: 'error',
        title: 'Cannot release kill switch',
        detail: error instanceof Error ? error.message : 'Not permitted',
      })
    })
  }

  return (
    <div
      role="alert"
      data-testid="risk-banner"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-sell/50 bg-sell-soft px-3 py-1.5"
    >
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-sell" />
        <span className="relative inline-flex size-2 rounded-full bg-sell" />
      </span>
      <p className="text-xs font-semibold text-sell">{halt.reason}</p>
      {killSwitch.engaged && killSwitch.engagedAt !== undefined && (
        <p className="tnum text-[11px] text-ink-muted">
          since {formatTime(killSwitch.engagedAt)}
          {killSwitch.reason !== undefined && killSwitch.reason !== '' && ` · ${killSwitch.reason}`}
        </p>
      )}
      {killSwitch.engaged && canOperate && (
        <button
          type="button"
          onClick={handleRelease}
          data-testid="risk-banner-release"
          className="ml-auto rounded border border-sell/50 px-2 py-0.5 text-[11px] font-semibold text-sell transition-colors hover:bg-sell/10"
        >
          Release &amp; resume dealing
        </button>
      )}
    </div>
  )
}
