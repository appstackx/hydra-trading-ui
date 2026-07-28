# From reference implementation to production

An honest map of what this repository is and what it is not, and what it takes to put a system like
it in front of real traders and real money.

We publish this because the gap is the engagement. A vendor who tells you a demo is production-ready
is either not being straight with you or has not run one.

---

## What is already production-grade

These are not stubbed and would not be rewritten on the way to a deployment:

- **Domain logic.** Pip conventions per instrument, big-figure rate splitting, T+2 spot value dates
  that skip weekends, weighted-average cost basis with realised/unrealised split, cross-currency
  P&L conversion, order matching and time-in-force rules. Pure functions, fully unit tested.
- **Architecture.** The UI depends on four adapter interfaces and nothing else. Swapping the
  simulated back end for a real venue is a change to one composition-root file.
- **Rendering under load.** Per-instrument subscriptions, `useSyncExternalStore` so a fast feed
  cannot tear, CSS-driven tick animation that costs no React render.
- **Engineering standard.** 512 tests (390 unit and component, 122 end-to-end across three browser
  targets), enforced coverage thresholds, strict TypeScript with no escape hatches, zero-warning
  lint, CI on every push.
- **Accessibility and theming.** Keyboard operable, screen-reader labelled, reduced-motion aware,
  design tokens throughout, dark and light themes.

## What is missing, and what it takes

Ordered roughly by the sequence a real deployment needs them.

### 1. Venue connectivity — the largest single item

**Today:** a simulated feed and a simulated execution venue, both deterministic and seeded.

**Needed:** a real adapter against the client's infrastructure. Typically FIX 4.4 or 5.0 SP2 for
orders and execution reports, plus a streaming price source (FIX market data, a proprietary
WebSocket, or a vendor feed such as Bloomberg B-PIPE or Refinitiv). The work is rarely the happy
path — it is session management, sequence-number gap fill, resend requests, order-state
reconciliation after a disconnect, and duplicate-execution handling.

_Indicative: 3–6 weeks for the first venue, materially less for each one after._

### 2. Identity and entitlements

**Today:** none. Anyone with the URL sees everything.

**Needed:** SSO against the client's identity provider (usually OIDC or SAML against Entra ID or
Okta), then an entitlement model — which users see which instruments, which may trade, and at what
maximum size. Entitlements have to be enforced server-side; the UI only reflects them.

_Indicative: 2–3 weeks._

### 3. Audit trail and regulatory record keeping

**Today:** trades live in memory and vanish on refresh.

**Needed:** every ticket, amendment, cancellation and rejection emitted to the client's audit store
with a timestamp, a user identity and the price the user was actually shown. Under MiFID II
Article 16(6) and SYSC 9 that obligation sits with the client, but the UI has to make it possible —
including recording the quote on screen at the moment of the click, which is the evidence in a
disputed trade.

_Indicative: 1–2 weeks, assuming the client has somewhere to put the records._

### 4. Server-side position keeping

**Today:** positions and P&L are derived client-side from the session's trade list.

**Needed:** positions from the client's book of record, reconciled at start of day and on
reconnection. A dealing screen must never be the source of truth for risk.

_Indicative: 2–3 weeks, depending on what the book of record exposes._

### 5. Risk controls and kill switch

**Today:** a single hard-coded notional limit in the simulated venue.

**Needed:** pre-trade limits per user and per instrument, fat-finger checks against the prevailing
market, a maximum daily loss, and a kill switch that stops the desk trading from one place. If any
part of the workflow becomes automated, MiFID II RTS 6 algorithmic-trading obligations attach to
the client and the controls have to be documented and tested to that standard.

_Indicative: 2–3 weeks._

### 6. Resilience and observability

**Today:** per-panel error boundaries and a simulated connection indicator.

**Needed:** reconnection with backoff, stale-price detection that disables dealing rather than
quoting a price that is no longer live, front-end error and performance telemetry, and a real
health signal from the gateway. A dealing screen that silently shows a frozen price is more
dangerous than one that shows nothing.

_Indicative: 1–2 weeks._

### 7. Scale and asset-class coverage

**Today:** ten FX spot pairs. FX spot is the simplest instrument there is — no expiry, no strike,
no legs.

**Needed:** whatever the client actually trades. Forwards and swaps add tenors and a curve;
futures add expiries and roll; options add strikes and Greeks; crypto adds 24/7 sessions, eight
decimal places and perpetual funding. Large instrument universes need a virtualised grid.

_Indicative: highly variable — 1 week for additional FX pairs, 4–8 weeks for a new asset class._

### 8. Market data licensing

**Today:** simulated prices, so no licence required.

**Needed:** this is the client's contract with the exchange or vendor, not ours, but it has to be
resolved before go-live. Exchange data is licensed per display and per user, and it is audited.

---

## What a first engagement usually looks like

A realistic path to a live desk, using this repository as the starting point rather than a blank
editor:

| Phase                    | Weeks | Outcome                                                                                                    |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| Discovery                | 1–2   | Instruments, workflow, venue and gateway protocols, entitlement model, non-functional requirements.        |
| Connected prototype      | 3–5   | Real prices and real orders through the client's gateway in a test environment, running on their branding. |
| Production hardening     | 4–6   | Identity, entitlements, audit, server-side positions, risk controls, resilience.                           |
| Parallel run and go-live | 2–4   | Running alongside the incumbent, reconciled daily, then cut over.                                          |

**Roughly 10–17 weeks to a live desk for a single asset class and a single venue.** The comparable
from-scratch build is typically nine to twelve months, and most of the overrun goes on exactly the
domain details this repository already encodes.

## What we do not do

Stated plainly, because it is what keeps the commercial arrangement simple and keeps us outside the
regulatory perimeter:

- We do not route, match or execute orders on infrastructure we operate. The UI runs in your
  environment and talks to your gateway.
- We do not hold client money or assets.
- We do not advise on investments, and we do not build signal or recommendation features.
- We do not redistribute market data. You bring your own entitled feed.

We are a technology supplier. Your permissions, your venue, your records.

---

_Timings are indicative and drawn from work of this shape; they are not a quote. Scope, and the
state of the gateway we are integrating against, move them considerably._
