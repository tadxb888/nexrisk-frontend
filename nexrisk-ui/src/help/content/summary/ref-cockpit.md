---
id: ref-cockpit
title: "Cockpit — the 9 cards explained"
type: reference
domain: summary
module: cockpit
minLevel: VIEW
route: /
source:
  - "nexrisk-ui/src/help/cockpitHelp.ts (dev-authored per-card help: whatItShows / howCalculated / colorThresholds / whatToDo / gotchas)"
related: [ref-trader-risk, task-configure-clustering, ref-nexday-signals, con-book-model]
tags: [cockpit, dashboard, cards, tiles, pnl, take-home, cost-ratio, risk, hedge, nexday, markup, rebates]
status: reviewed
version: summary-v2
---

The Cockpit is the firm-wide dashboard — nine cards (tiles) grouped as money
(1, 2, 6), risk (3, 4, 5), and the NexDay outlook (7, 8, 9). Cards 1, 2, 5, 6 are
live over WebSocket; Card 4 polls every 60s; the NexDay cards refresh on
GoPredict's schedule.

## Card 1 — Money {#card1}

Net P&L across all books (A + B + C net), **gross of costs**. **Today Net P&L**
and **MTD Net P&L** are realized + unrealized summed for the session and from
month-start; green above +$10K, red below −$10K. **MTM Performance %** compares
current MTD to the same day-of-month last month — `(current_MTD −
prior_at_same_DOM) / |prior_at_same_DOM| × 100`; green if better than last month,
red if worse. A positive % on a negative MTD means losing less than last month; a
negative % on a positive MTD means earning less. A large red Today figure is the
signal to drill into Card 3 (which symbol) and Card 4 (which trader). Costs are
not subtracted here — that's Card 2. If last month's same-point P&L was ~zero,
the % renders as `—`.

## Card 2 — Take-Home & Costs {#card2}

What the firm actually keeps after commissions, swaps, and rebates. **Take-Home
MTD** = realized + unrealized + commissions + swaps + rebates (all signed);
closest number to the P&L statement — watch the trend, not one day. **Cost
Ratio** = `|costs| / |gross| × 100`; green below 30%, yellow 30–60%, red above
60% (costs eating most of revenue — negotiate commissions or audit swaps).
**Effective Margin** = `take_home / |gross| × 100`; green above +40%, yellow
0–40%, red below 0%. A red margin on a green gross is a costs problem, not a
trading problem. Below $50K gross all three read `—` (the floor suppresses ratios
that go unstable on tiny denominators).

## Card 3 — Where Is My Risk {#card3}

Where money could leave the firm today — **B-Book only** (A-Book is externalized;
C-Book is hedged at the trade level; the balance-sheet risk is B-Book). **Top
losing symbol** is the B-Book symbol with the worst realized + unrealized MTD;
if the loss is material (say >5% of MTD gross), open its exposure detail — the
trader behind it usually shows on Card 4. **1% adverse move impact** is a stress
number: what we'd lose if every open B-Book position moved 1% against us at once
(`Σ lots × contract_size × price` in USD × 0.01); red beyond −$50K, yellow −$20K
to −$50K. It ignores correlation, so treat it as an order-of-magnitude check.
**Expected Shortfall (95%)** shows `Collecting data…` — the ES engine is still in
development.

## Card 4 — Who Is My Risk {#card4}

Which traders are dangerous now, by behavior and cluster (all traders, all MT5
nodes). **Critical traders** counts traders at `overall_risk_level = CRITICAL`
(scored against risk-matrix rules by behavior type and profit-factor band); red
if > 0, and clicking jumps to B-Book pre-filtered to their logins. **Behavioral
classification** shows Critical and High counts only (Medium/Low are hidden as
exec noise) — a climbing High count week-over-week signals the population
shifting. **Active risk clusters** shows archetypes from the latest HDBSCAN run.
Both are **materialized** results: a brand-new CRITICAL trader in the last hour
may not appear immediately, and clusters reflect the last completed (typically
nightly) run.

## Card 5 — Risk Manager Performance {#card5}

How the hedging desk is doing. **A-Book yield per $1M hedged** =
`A.net_revenue / A.net_hedged_nv × $1M`; negative yield on high volume means the
hedging strategy or LP pricing is bleeding. **% hedged of B-Book intake** =
`A.net_hedged_nv / B.gross_intake_nv × 100`; green inside the policy band
(typically 30–70%) — below 30% we're carrying more B-Book risk than usual (cross-
check Card 3), above 70% we're externalizing too much and giving away markup.
**C-Book contribution** = `C.net_revenue / (A.net_revenue + C.net_revenue) × 100`;
C-Book should quietly contribute — a rising share means the auto-hedge is finding
alpha, negative means it's misfiring. Note A-Book net revenue is captured markup
spread, not A-Book trade P&L.

## Card 6 — Markup vs Rebates {#card6}

Pricing economics. **Markup MTD** = `A.net_revenue + C.net_revenue` (B's spread
is internal to its trade P&L, so markup is A + C only); should grow ~linearly
with volume. **Rebates MTD** = A + B + C rebates, signed (paid-out rebates are
negative, so usually a negative number) — watch for spikes (new IB, fraud, or a
config error). **Net MTD** = Markup + Rebates; green above zero and should stay
positive over any reasonable window — persistently negative means we pay more in
rebates than we earn in markup, a structural problem. A one-off large rebate
settlement can distort the MTD view, so check deal history first.

## Card 7 — NexDay · Daily Outlook {#card7}

Today's read from GoPredict, **mapped symbols only**, refreshed ~17:01 ET Sun–Thu.
**Top losing predicted** is the mapped symbol with the most negative predicted
move — if we hold meaningful B-Book there, consider hedging or tightening stops.
**Developing opportunities** are symbols that reversed 1–3 days ago with momentum
confirming the new direction (a 1–3 day head start). **Momentum shifts** are
symbols whose momentum is transitional (Tilting Up/Down, Reversed) but not yet
matching predicted trend — a pre-confirmation watchlist. `None today` is a real
result, not a data issue.

## Card 8 — NexDay · Intraday Signals {#card8}

Symbols where all four intraday timeframes (15m/30m/1h/2h) agree, across the
**entire NexDay universe** (~90 symbols, matching GoPredict's UI). **Up
Co-Trending** / **Down Co-Trending** count symbols positive (or negative) on all
four timeframes at once (trend = 0 is excluded from both). **Last update** shows
how long since the latest intraday prediction landed; green under 30 min, yellow
30 min–4 h, red beyond 4 h — over 30 min during market hours means a pipeline
problem, and past red the cards above are stale, so don't act on them until it
catches up.

## Card 9 — NexDay · Best Opportunities {#card9}

The model's best-ranked trades today, **mapped symbols only**, tiered by
conviction. **Top opportunity** is the single highest-ranked idea (MT5 symbol,
direction, conviction tag, score) — the model's best single idea, a starting
point not a directive. **Hottest** is the top three tiers (Prime:In-Play with
Strong/Sustained/Qualified) — should be a small focused list; 15+ names means
something is off. **Strong tier** is non-Prime Strong/Sustained — second-tier
candidates. Tiers: 1 Prime:In-Play + Strong, 2 + Sustained, 3 + Qualified, 4
Strong (non-Prime), 5 Sustained (non-Prime). The list churns day to day; `None
today` means no strong recommendation for our universe.
