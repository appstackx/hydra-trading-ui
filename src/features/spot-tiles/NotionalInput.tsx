import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface NotionalInputProps {
  readonly value: string
  readonly onChange: (value: string) => void
  /** Currency the notional is denominated in, shown as a suffix. */
  readonly currency: string
  readonly invalid: boolean
  readonly disabled?: boolean
  readonly symbol: string
}

/**
 * Notional entry that accepts desk shorthand (`1m`, `250k`, `2bn`).
 *
 * The raw string is owned by the caller rather than a parsed number, so a
 * half-typed `1.` is not destroyed mid-keystroke by reformatting.
 */
export function NotionalInput({
  value,
  onChange,
  currency,
  invalid,
  disabled = false,
  symbol,
}: NotionalInputProps): ReactNode {
  const id = useId()

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <label htmlFor={id} className="sr-only">
        {`Notional for ${symbol} in ${currency}`}
      </label>
      <div
        className={cn(
          'flex h-7 min-w-0 flex-1 items-center rounded-md border bg-panel-raised px-2 transition-colors',
          invalid ? 'border-sell' : 'border-line focus-within:border-brand'
        )}
      >
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          data-testid={`notional-input-${symbol}`}
          className="tnum h-full w-full min-w-0 bg-transparent text-xs font-medium text-ink outline-none placeholder:text-ink-subtle disabled:cursor-not-allowed"
          placeholder="1m"
        />
        <span className="ml-1.5 shrink-0 text-[10px] font-semibold tracking-wide text-ink-subtle">
          {currency}
        </span>
      </div>
    </div>
  )
}
