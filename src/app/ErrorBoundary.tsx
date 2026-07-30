import { Component, type ErrorInfo, type ReactNode } from 'react'
import { emitTelemetry } from '@/lib/telemetry'

interface ErrorBoundaryProps {
  readonly children: ReactNode
  /** Named in the fallback so a trader can say which panel died. */
  readonly label: string
}

interface ErrorBoundaryState {
  readonly error: Error | undefined
}

/**
 * Contains a render failure to one panel.
 *
 * On a dealing screen the worst outcome is a blank window: if analytics throws,
 * the tiles and the blotter must keep working. Each region is wrapped
 * separately for exactly that reason.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}] render failed`, error, info.componentStack)
    emitTelemetry('ui.panel-error', { panel: this.props.label, message: error.message })
  }

  private readonly retry = (): void => {
    this.setState({ error: undefined })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section
        className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-panel border border-sell/40 bg-panel p-4 text-center"
        role="alert"
        data-testid={`error-boundary-${this.props.label}`}
      >
        <p className="text-xs font-semibold text-sell">{this.props.label} is unavailable</p>
        <p className="max-w-xs text-[11px] leading-snug text-ink-muted">{error.message}</p>
        <button
          type="button"
          onClick={this.retry}
          className="rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          Retry
        </button>
      </section>
    )
  }
}
