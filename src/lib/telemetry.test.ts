import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitTelemetry, setTelemetrySink, type TelemetryEvent } from './telemetry'

describe('telemetry', () => {
  afterEach(() => {
    setTelemetrySink(null)
  })

  it('does nothing without a sink — a reference build must not phone home', () => {
    expect(() => {
      emitTelemetry('feed.reconnect', { venue: 'coinbase' })
    }).not.toThrow()
  })

  it('delivers name, timestamp and data to an installed sink', () => {
    const seen: TelemetryEvent[] = []
    setTelemetrySink((event) => seen.push(event))

    emitTelemetry('ui.panel-error', { panel: 'Analytics' })

    expect(seen).toHaveLength(1)
    expect(seen[0]?.name).toBe('ui.panel-error')
    expect(seen[0]?.data).toEqual({ panel: 'Analytics' })
    expect(seen[0]?.at).toBeGreaterThan(0)
  })

  it('omits the data key entirely when there is none', () => {
    const seen: TelemetryEvent[] = []
    setTelemetrySink((event) => seen.push(event))

    emitTelemetry('feed.connected')

    expect('data' in (seen[0] ?? {})).toBe(false)
  })

  it('contains a throwing sink — telemetry must never break dealing', () => {
    setTelemetrySink(() => {
      throw new Error('APM endpoint down')
    })

    expect(() => {
      emitTelemetry('feed.degraded')
    }).not.toThrow()
  })

  it('stops emitting once the sink is uninstalled', () => {
    const sink = vi.fn()
    setTelemetrySink(sink)
    emitTelemetry('one')
    setTelemetrySink(null)
    emitTelemetry('two')

    expect(sink).toHaveBeenCalledTimes(1)
  })
})
