import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionState, Price, Symbol_ } from '@/domain'
import { LiveMarketData, type WebSocketLike } from './live-market-data'
import { BINANCE, COINBASE, venueFor, VENUES } from './venues'

/** A socket the test drives: nothing opens or arrives without being told to. */
class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = []

  readonly sent: string[] = []
  closed = false

  onopen: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  static get latest(): FakeSocket | undefined {
    return FakeSocket.instances.at(-1)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.({})
  }

  deliver(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  }

  fail(): void {
    this.onerror?.({})
    this.onclose?.({})
  }
}

const coinbaseTicker = (productId: string, bid: string, ask: string) => ({
  type: 'ticker',
  product_id: productId,
  price: bid,
  best_bid: bid,
  best_ask: ask,
})

describe('LiveMarketData', () => {
  let feed: LiveMarketData
  let clock = 1_000

  const createFeed = (venue = COINBASE): LiveMarketData =>
    new LiveMarketData({
      venue,
      createSocket: (url) => new FakeSocket(url),
      now: () => clock,
    })

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 1_000
    FakeSocket.instances = []
    feed = createFeed()
  })

  afterEach(() => {
    feed.dispose()
    vi.useRealTimers()
  })

  it('reports connecting before the socket opens', () => {
    const states: ConnectionState[] = []
    feed.connection$().subscribe((state) => states.push(state))

    expect(states[0]?.status).toBe('connecting')
    expect(states[0]?.service).toBe('coinbase-exchange')
  })

  it('subscribes to the venue on open', () => {
    feed.connect()
    FakeSocket.latest?.open()

    const frame: unknown = JSON.parse(FakeSocket.latest?.sent[0] ?? '{}')
    expect(frame).toMatchObject({ type: 'subscribe', channels: ['ticker'] })
    expect(JSON.stringify(frame)).toContain('BTC-USD')
  })

  it('reports connected once the socket opens', () => {
    const states: ConnectionState[] = []
    feed.connection$().subscribe((state) => states.push(state))

    feed.connect()
    FakeSocket.latest?.open()

    expect(states.at(-1)?.status).toBe('connected')
  })

  it('turns a venue ticker into a price', () => {
    const received: Price[] = []
    feed.connect()
    FakeSocket.latest?.open()
    feed.prices$('BTCUSD').subscribe((price) => received.push(price))

    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '63722.48', '63724.74'))

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      symbol: 'BTCUSD',
      bid: 63722.48,
      ask: 63724.74,
      mid: 63723.61,
    })
  })

  it('labels the first quote as no movement, then tracks direction', () => {
    const received: Price[] = []
    feed.connect()
    FakeSocket.latest?.open()
    feed.prices$('BTCUSD').subscribe((price) => received.push(price))

    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '100.00', '100.02'))
    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '101.00', '101.02'))
    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '99.00', '99.02'))

    expect(received.map((price) => price.movement)).toEqual(['none', 'up', 'down'])
  })

  it('accumulates every instrument into the aggregate snapshot', () => {
    let latest: Readonly<Record<Symbol_, Price>> = {}
    feed.connect()
    FakeSocket.latest?.open()
    feed.allPrices$().subscribe((prices) => (latest = prices))

    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '100.00', '100.02'))
    FakeSocket.latest?.deliver(coinbaseTicker('ETH-USD', '50.00', '50.02'))

    expect(Object.keys(latest).sort()).toEqual(['BTCUSD', 'ETHUSD'])
  })

  it('ignores frames that are not quotes', () => {
    const received: Price[] = []
    feed.connect()
    FakeSocket.latest?.open()
    feed.prices$('BTCUSD').subscribe((price) => received.push(price))

    FakeSocket.latest?.deliver({ type: 'subscriptions', channels: [] })
    FakeSocket.latest?.deliver({ type: 'heartbeat' })
    FakeSocket.latest?.deliver('not json at all')

    expect(received).toEqual([])
  })

  it('ignores an instrument the UI does not quote', () => {
    let latest: Readonly<Record<Symbol_, Price>> = {}
    feed.connect()
    FakeSocket.latest?.open()
    feed.allPrices$().subscribe((prices) => (latest = prices))

    FakeSocket.latest?.deliver(coinbaseTicker('DOGE-USD', '0.10', '0.11'))

    expect(latest).toEqual({})
  })

  it('rejects a crossed or zero book as bad data rather than a price', () => {
    const received: Price[] = []
    feed.connect()
    FakeSocket.latest?.open()
    feed.prices$('BTCUSD').subscribe((price) => received.push(price))

    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '100.00', '99.00')) // crossed
    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '0', '100.00')) // no bid

    expect(received).toEqual([])
  })

  it('reconnects with exponential backoff after a drop', () => {
    feed.connect()
    FakeSocket.latest?.open()
    expect(FakeSocket.instances).toHaveLength(1)

    FakeSocket.latest?.fail()
    vi.advanceTimersByTime(1_000)
    expect(FakeSocket.instances).toHaveLength(2)

    // Second failure waits twice as long.
    FakeSocket.latest?.fail()
    vi.advanceTimersByTime(1_000)
    expect(FakeSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1_000)
    expect(FakeSocket.instances).toHaveLength(3)
  })

  it('resets the backoff once a connection succeeds', () => {
    feed.connect()
    FakeSocket.latest?.fail()
    vi.advanceTimersByTime(1_000)
    FakeSocket.latest?.fail()
    vi.advanceTimersByTime(2_000)

    FakeSocket.latest?.open() // healthy again
    FakeSocket.latest?.fail()

    // Back to the base delay rather than continuing to double.
    const before = FakeSocket.instances.length
    vi.advanceTimersByTime(1_000)
    expect(FakeSocket.instances).toHaveLength(before + 1)
  })

  it('reports disconnected while it is down', () => {
    const states: ConnectionState[] = []
    feed.connection$().subscribe((state) => states.push(state))

    feed.connect()
    FakeSocket.latest?.open()
    FakeSocket.latest?.fail()

    expect(states.map((state) => state.status)).toContain('disconnected')
  })

  it('reports degraded when an open socket falls silent', () => {
    let state: ConnectionState | undefined
    feed.connection$().subscribe((value) => (state = value))

    feed.connect()
    FakeSocket.latest?.open()
    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '100.00', '100.02'))
    expect(state?.status).toBe('connected')

    // A silent-but-open socket is the dangerous case: the UI would keep showing
    // a price nobody is standing behind.
    clock += 25_000
    vi.advanceTimersByTime(2_000)

    expect(state?.status).toBe('degraded')
  })

  it('recovers to connected when quotes resume', () => {
    let state: ConnectionState | undefined
    feed.connection$().subscribe((value) => (state = value))
    feed.connect()
    FakeSocket.latest?.open()

    clock += 25_000
    vi.advanceTimersByTime(2_000)
    expect(state?.status).toBe('degraded')

    FakeSocket.latest?.deliver(coinbaseTicker('BTC-USD', '100.00', '100.02'))
    expect(state?.status).toBe('connected')
  })

  it('only opens one socket however many times connect is called', () => {
    feed.connect()
    feed.connect()
    feed.connect()

    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('closes the socket and stops reconnecting on dispose', () => {
    feed.connect()
    const socket = FakeSocket.latest
    socket?.open()

    feed.dispose()

    expect(socket?.closed).toBe(true)
    socket?.fail()
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('retries rather than throwing when the socket cannot be created', () => {
    let attempts = 0
    const broken = new LiveMarketData({
      venue: COINBASE,
      now: () => clock,
      createSocket: (url) => {
        attempts += 1
        if (attempts === 1) throw new Error('blocked by CSP')
        return new FakeSocket(url)
      },
    })

    expect(() => {
      broken.connect()
    }).not.toThrow()

    vi.advanceTimersByTime(1_000)
    expect(attempts).toBe(2)

    broken.dispose()
  })

  it('shares one stream per instrument', () => {
    feed.connect()
    expect(feed.prices$('BTCUSD')).toBe(feed.prices$('BTCUSD'))
  })

  describe('against Binance', () => {
    it('encodes the subscription in the URL and needs no subscribe frame', () => {
      const binanceFeed = createFeed(BINANCE)
      binanceFeed.connect()
      FakeSocket.latest?.open()

      expect(FakeSocket.latest?.url).toContain('btcusdt@bookTicker')
      expect(FakeSocket.latest?.sent).toEqual([])

      binanceFeed.dispose()
    })

    it('normalises a USDT quote to the canonical USD symbol', () => {
      const binanceFeed = createFeed(BINANCE)
      const received: Price[] = []
      binanceFeed.connect()
      FakeSocket.latest?.open()
      binanceFeed.prices$('BTCUSD').subscribe((price) => received.push(price))

      FakeSocket.latest?.deliver({
        stream: 'btcusdt@bookTicker',
        data: { s: 'BTCUSDT', b: '63810.00000000', a: '63810.01000000' },
      })

      expect(received[0]).toMatchObject({ symbol: 'BTCUSD', bid: 63810, ask: 63810.01 })

      binanceFeed.dispose()
    })
  })
})

describe('venue parsers', () => {
  it('rejects a Coinbase ticker missing a side', () => {
    expect(COINBASE.parse({ type: 'ticker', product_id: 'BTC-USD', best_bid: '1' })).toBeNull()
  })

  it('rejects non-ticker Coinbase frames', () => {
    expect(COINBASE.parse({ type: 'l2update', product_id: 'BTC-USD' })).toBeNull()
  })

  it('rejects a Binance frame with no data envelope', () => {
    expect(BINANCE.parse({ result: null, id: 1 })).toBeNull()
  })

  it.each([null, undefined, 42, 'text', []])('survives a %s frame', (frame) => {
    expect(COINBASE.parse(frame)).toBeNull()
    expect(BINANCE.parse(frame)).toBeNull()
  })

  it('registers both venues and falls back to the default for anything unknown', () => {
    expect(Object.keys(VENUES).sort()).toEqual(['binance', 'coinbase'])
    expect(venueFor('binance')).toBe(BINANCE)
    expect(venueFor('coinbase')).toBe(COINBASE)
    expect(venueFor('nonsense')).toBe(COINBASE)
    expect(venueFor(null)).toBe(COINBASE)
  })
})
