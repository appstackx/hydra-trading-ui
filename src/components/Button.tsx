import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'buy' | 'sell' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent text-ink-muted hover:bg-panel-hover hover:text-ink border border-line',
  buy: 'bg-buy text-black hover:brightness-110 active:brightness-95',
  sell: 'bg-sell text-black hover:brightness-110 active:brightness-95',
  danger: 'bg-transparent text-sell border border-sell/40 hover:bg-sell/10',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-[11px] gap-1',
  md: 'h-8 px-3 text-xs gap-1.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly children?: ReactNode
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md font-semibold',
        'transition-[filter,background-color,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
