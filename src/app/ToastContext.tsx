import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  readonly id: string
  readonly tone: ToastTone
  readonly title: string
  readonly detail?: string
}

interface ToastContextValue {
  readonly toasts: readonly Toast[]
  /** Shows a toast and returns its id. */
  push: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** How long a toast stays on screen. Long enough to read a rejection reason. */
export const TOAST_TIMEOUT_MS = 6_000
/** Cap so a burst of fills cannot cover the workspace. */
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const sequence = useRef(0)

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      sequence.current += 1
      const id = `toast-${sequence.current}`
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE))
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id)
        }, TOAST_TIMEOUT_MS)
      )
      return id
    },
    [dismiss]
  )

  useEffect(() => {
    // Captured so the cleanup does not read a ref that has since been reassigned.
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToasts(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error('useToasts must be used within a <ToastProvider>')
  }
  return value
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-buy/40 bg-buy-soft text-ink',
  error: 'border-sell/40 bg-sell-soft text-ink',
  info: 'border-line-strong bg-panel-raised text-ink',
}

const TONE_ICON: Record<ToastTone, string> = {
  success: '✓',
  error: '✕',
  info: 'i',
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly Toast[]
  readonly onDismiss: (id: string) => void
}): ReactNode {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      // Assertive: a rejected trade is time-critical and must interrupt.
      role="alert"
      aria-live="assertive"
      data-testid="toast-viewport"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          data-tone={toast.tone}
          className={cn(
            'animate-rise pointer-events-auto flex items-start gap-2.5 rounded-panel border px-3 py-2.5 shadow-lg shadow-black/25',
            TONE_STYLES[toast.tone]
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              toast.tone === 'success' && 'bg-buy text-black',
              toast.tone === 'error' && 'bg-sell text-black',
              toast.tone === 'info' && 'bg-line-strong text-ink'
            )}
            aria-hidden="true"
          >
            {TONE_ICON[toast.tone]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight">{toast.title}</p>
            {toast.detail !== undefined && (
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{toast.detail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onDismiss(toast.id)
            }}
            aria-label="Dismiss notification"
            className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M1 1l8 8M9 1l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
