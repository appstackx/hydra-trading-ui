/**
 * The observability seam.
 *
 * Every operationally interesting moment — a panel crashing, a stream erroring,
 * a feed reconnecting — flows through `emitTelemetry`. The default sink is
 * nothing: a reference build must not phone home. A deployment installs its
 * APM client here with `setTelemetrySink` and gets the full signal without
 * touching a component.
 */

export interface TelemetryEvent {
  /** Dot-namespaced, e.g. `feed.reconnect`, `ui.panel-error`. */
  readonly name: string
  /** Epoch milliseconds. */
  readonly at: number
  readonly data?: Readonly<Record<string, string | number | boolean>>
}

export type TelemetrySink = (event: TelemetryEvent) => void

let sink: TelemetrySink | null = null

export function setTelemetrySink(next: TelemetrySink | null): void {
  sink = next
}

/** Fire-and-forget. A throwing sink is contained — telemetry must never break the app. */
export function emitTelemetry(
  name: string,
  data?: Readonly<Record<string, string | number | boolean>>
): void {
  if (!sink) return
  try {
    sink({ name, at: Date.now(), ...(data === undefined ? {} : { data }) })
  } catch {
    // A broken telemetry pipe is an observability problem, not a dealing one.
  }
}
