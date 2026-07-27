# Selling a trading UI as a product

An assessment of the UI-only licensing model for capital markets front ends: whether it works, how
Adaptive actually makes money, where the regulatory perimeter sits, and what a UK boutique should
charge.

Prepared for Appstackx, July 2026.

---

## 1. What Adaptive actually sells

The premise worth correcting first: **Adaptive does not sell a UI licence.** Reactive Trader Cloud
— the repository this project is modelled on — is Apache-2.0 open source and archived. It is a
marketing asset, not a product.

Adaptive's revenue comes from three places:

| Line                           | What it is                                                                                                           | How it is sold                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Consulting / bespoke build** | Building and operating trading systems for banks, brokers, exchanges and funds. The original business, founded 2012. | Time and materials, or fixed-price programmes. Six to seven figures.             |
| **Aeron**                      | Open-source low-latency messaging and clustering. Acquired with Real Logic in 2022.                                  | Open core: free OSS, paid support and enterprise features.                       |
| **Hydra**                      | A developer platform that accelerates trading-system construction. Now consolidated onto the same stack as Aeron.    | **Source-code licence** — firms get the source so they can customise and extend. |

Their 2025 growth statement reports rising Product Revenue and ARR _alongside_ the client base
growing 13% — product and services growing together, not product replacing services.

**The strategic read:** Reactive Trader is a lead magnet. It proves "these people can build a
real-time trading UI at scale," which opens the conversation, and the money is made on the build
and the infrastructure licence underneath. The UI is the shop window, not the stock.

That matters for the plan, because it means the UI-only model is _not_ validated by Adaptive. It
has to be validated somewhere else — and it is.

## 2. Is a UI-only product viable? Yes — with precedent

The model works. It works today, at scale, in exactly this market:

- **TradingView Charting Library / Trading Terminal.** The closest analogue to the proposal. A
  licensed, self-hosted JavaScript front end. The customer plugs in their own market data through a
  documented adapter interface. TradingView never sees the data or the order flow. It is embedded
  in a very large share of the world's brokers and crypto exchanges.
- **AG Grid.** A pure UI component — a data grid — licensed per developer per year. It is in the
  blotter of an enormous number of trading applications. No data, no regulation, just a component.
- **Highcharts, DevExtreme, Syncfusion.** Same shape, same market, decades old.
- **interop.io (Glue42 + Finsemble), OpenFin.** Desktop interop layers sold to banks. Not UI, but
  the same "we are a layer inside your environment" commercial posture.

So the question is not _can you sell UI without holding data_ — plainly you can. The question is
whether **a whole trading workspace** sells as well as **a component**, and the honest answer is:
it is harder.

**Why a component sells more easily than a workspace:**

| Component (grid, chart)         | Workspace (dealing screen)                        |
| ------------------------------- | ------------------------------------------------- |
| Solves a problem every app has  | Solves a problem shaped differently at every desk |
| Integration is a day            | Integration is 6–12 weeks against their gateway   |
| Bought by a developer on a card | Bought by a committee, through procurement        |
| No workflow opinion             | Strong workflow opinion the buyer may reject      |
| Weak substitutes                | The buyer's own dev team is a credible substitute |

The workspace is a bigger, stickier sale but a slower one. Which shapes the whole go-to-market.

## 3. The regulatory position

This is the part that most determines whether the model is workable, and the good news is that a
correctly-structured UI licence sits **outside** the regulatory perimeter.

> Not legal advice. The framing below is the standard analysis; get it confirmed by a financial
> services solicitor before the first contract, and budget roughly £5–10k for that opinion. It is
> the cheapest risk reduction available and clients will ask whether you have it.

### 3.1 Why licensing software is not a regulated activity

In the UK, FCA authorisation is triggered by carrying on a **regulated activity** by way of
business — under the Regulated Activities Order, principally:

- Article 21 — dealing in investments as agent
- Article 25 — **arranging** deals in investments
- Article 53 — advising on investments
- Article 40 — safeguarding and administering assets

Supplying software is none of them. If you licence a front end to an authorised firm which then
runs it inside its own environment, under its own permissions, against its own venue connections,
you are a **technology vendor**. That is the same position as the vendor of their order management
system, their grid component or their operating system.

The four things that keep you on the right side of that line:

1. **You never hold client money or assets.** No CASS obligations, no custody, no safeguarding.
2. **No order ever passes through infrastructure you operate.** The UI talks to _their_ gateway,
   from _their_ user's browser, inside _their_ network.
3. **You never advise.** No signals, no recommendations, no "suggested" prices or sizes.
4. **You have no relationship with their end clients.** You do not know who they are.

### 3.2 What would drag you inside the perimeter

Each of these is avoidable by design, and each is a real trap:

| Activity                                                    | Risk                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting the system so orders route through your servers** | Potentially "arranging deals in investments" (RAO Art. 25(2)) — bringing about transactions. At the extreme, operating a multilateral system is an MTF/OTF and needs venue authorisation. **This is the single biggest hazard in a "hosted" model.** |
| Embedding execution algorithms or smart order routing       | MiFID II RTS 6 algorithmic trading obligations attach to the _firm_, but you become part of their algo governance and testing regime — heavy, ongoing, and it makes you a critical dependency.                                                       |
| Redistributing market data                                  | Not an FCA issue but a commercial-legal one. Exchange data is licensed per-display, per-user, with audits and real penalties. Never touch the data; make the licensee bring their own entitled feed.                                                 |
| Serving retail end users directly                           | Consumer Duty, financial promotions, and a completely different risk profile.                                                                                                                                                                        |
| Providing analytics that look like advice                   | Article 53 advising. Keep analytics descriptive (what _is_ the position) not prescriptive (what _should_ you do).                                                                                                                                    |

### 3.3 The obligations you will have anyway

You will not need FCA authorisation, but you will be treated as a **material third-party supplier**
to regulated firms, and that carries a contractual and operational burden:

- **FCA SYSC 8 outsourcing and PS21/3 operational resilience.** Your client must be able to
  demonstrate they can oversee you, and exit you. Expect audit rights, exit plans, and continuity
  obligations in every contract.
- **DORA (EU, applying since January 2025).** If you have any EU financial-entity clients you will
  be an ICT third-party service provider: register-of-information entries, incident reporting
  chains, subcontractor disclosure, mandated contract terms, and a right of access for their
  regulator. This is now a standard part of the sale, not an edge case.
- **Security due diligence.** SOC 2 Type II or ISO 27001 will be asked for by any bank and most
  brokers. Budget 6–9 months and £30–60k for ISO 27001 with a small team. Below that, expect a pen
  test report and a completed CAIQ/SIG questionnaire as the minimum entry ticket.
- **Record keeping (SYSC 9, MiFID II Art. 16(6)).** The obligation is the licensee's, but your UI
  has to make it _possible_: every ticket, amendment and rejection needs to be emittable to their
  audit store. Build the hooks; do not store the records.

**Practical structure:** licence and support, do not operate. If you want a hosted offering, host
only the static front-end bundle — a CDN serving JavaScript — and have it talk directly from the
user's browser to the licensee's own API. You are then hosting a _file_, not a trading system, and
you can say so truthfully in a due-diligence questionnaire. Make that architecturally true, not
just contractually asserted.

## 4. Commercial models

Five workable shapes, roughly in order of how easy they are to sell:

**1. Per-developer licence** — the AG Grid model. £800–£1,500 per developer per year. Easy to buy,
low friction, but the revenue per client is small and it suits component sales more than a
workspace.

**2. Annual platform subscription, per desk or per named user.** £25k–£75k per year for a desk-scale
licence, tiered by users and instrument count. Recurring, predictable, and the natural fit for
brokers and prop shops. **This is the recommended anchor.**

**3. Perpetual source licence plus maintenance** — Adaptive's Hydra model, and the only thing tier-1
banks will accept when they need to modify and own the code. £100k–£250k upfront plus ~20% annual
maintenance. Slow to sell, large ticket, and it hands over your source.

**4. OEM / white-label redistribution.** The licensee rebrands the UI and gives it to _their_
clients. Priced by end-user tier or as a revenue share. The largest deals, the longest sales cycle,
and the point at which your indemnity and liability terms actually matter.

**5. Integration and customisation services.** Realistically **50–70% of revenue in years one and
two.** Every deal needs adapters written against the client's gateway. £50k–£200k per engagement.

The realistic package for a first customer is: **licence + integration**, e.g. £40k annual licence
plus £80k to wire it to their venue and ship it. Do not try to sell the licence alone at the start
— the buyer's real problem is integration, and refusing to solve it loses the deal.

## 5. Where the moat is (and is not)

Be clear-eyed: **a competent team can rebuild the pixels in three months.** The UI is not the moat.
What is defensible:

1. **Domain correctness.** Pip conventions per pair, big-figure splitting, T+2 value dates across
   weekends and holiday calendars, weighted-average cost basis, realised vs unrealised P&L,
   cross-currency conversion before summing. Every one of these is a bug a from-scratch team will
   ship. This repository encodes them and tests them.
2. **The adapter library.** Once you have written adapters for FIX 4.4, FIX 5.0 SP2, a couple of
   crypto venue APIs and one or two OMS vendors, a new client is a two-week integration instead of
   a ten-week one. That compounds and cannot be copied quickly.
3. **Compliance-readiness.** Audit hooks, entitlement seams, kill switches, four-eyes on large
   tickets, and a completed security pack. Boring, and it is what shortens procurement from nine
   months to three.
4. **Reference customers in a named vertical.** The second crypto broker is far easier than the
   first.

Everything else is table stakes.

## 6. Honest risk assessment

| Risk                                                                                                                      | Severity | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Distribution, not product.** Capital markets buys on relationships and reputation. Adaptive has thirteen years of both. | **High** | Start where reputation matters least: digital assets, prediction markets, retail brokers, fintech startups. Lead with the open showcase.      |
| **Integration cost dominates the buyer's total cost.**                                                                    | High     | Sell the integration, do not resist it. Build the adapter library deliberately so the cost falls with each deal.                              |
| **Buy-vs-build bias.** Any desk with five engineers believes it can build this.                                           | High     | Compete on time-to-market and on the domain edge cases, not on features. "Eight weeks, not twelve months."                                    |
| **Long procurement.** 6–18 months for a regulated buyer, with security questionnaires and DORA paperwork.                 | Medium   | Get the security pack done before the first sale, not during it. It is the most common stall.                                                 |
| **Weak moat on the UI itself.**                                                                                           | Medium   | Moat is adapters + domain correctness + compliance readiness, per §5.                                                                         |
| **Support burden.** A trading UI has a trading floor's tolerance for downtime.                                            | Medium   | Price support explicitly. Do not offer a follow-the-sun SLA you cannot staff.                                                                 |
| **Regulatory drift.** A hosted variant, or an "auto-hedge" feature request, quietly crosses the perimeter.                | Medium   | Written product policy: no order flow through our infrastructure, no advice, no data redistribution. Review every feature request against it. |

## 7. Recommendation

**The model is viable, but not as "we sell a UI."** Positioned that way it is a component business
with a workspace-sized sales cycle — the worst of both.

Position it as: **a licensed dealing-screen layer plus the integration that makes it live.**

- **Target:** tier-2/3 — crypto and digital-asset venues, prediction markets, retail and CFD
  brokers, prop shops, and fintechs building a trading product. They have real need, real budget,
  short procurement, and no capacity to build this in-house. Tier-1 banks are a year-two ambition.
- **Anchor price:** £40k–£60k annual licence per desk, plus £60k–£150k initial integration.
- **First goal:** two paying customers in the same vertical, and the adapter library that comes out
  of them.
- **Do not:** host order flow, redistribute market data, or ship anything that could be read as
  advice.
- **Do:** get the FCA perimeter opinion and the security pack early — they are what turn a demo
  into a procurement-passable vendor.

And follow Adaptive's actual playbook rather than the one they appear to run: **the open showcase
wins the meeting; the integration work pays the bills; the licence is what makes it a business
rather than a consultancy.**

This repository is the showcase.

---

_Sources for the Adaptive figures: [weareadaptive.com](https://weareadaptive.com/), their
[2025 growth statement](https://weareadaptive.com/trading-resources/adaptive-growth-2025/), and
[The TRADE on the Real Logic acquisition](https://www.thetradenews.com/adaptive-financial-consulting-acquires-low-latency-trading-specialist-real-logic/).
Pricing figures are informed estimates from public list prices and market norms, not quotes._
