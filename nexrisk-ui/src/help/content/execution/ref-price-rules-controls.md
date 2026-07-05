---
id: ref-price-rules-controls
title: "Price Rules — feed stats and spread controls"
type: reference
domain: execution
module: price_rules
minLevel: VIEW
route: /price-rules
source:
  - "Price Feed & Spread Management Architecture Reference (feed stats, ATR tiers, spread modes, SpreadDiff)"
  - "Price Rules Engine API Reference"
  - "PriceRulesPage.tsx"
related: [ref-price-rules-states]
tags: [price-rules, feed, atr, spread, offsets, tabs]
status: reviewed
version: exec-v1
---

## Tabs {#tabs}

**Feed Management** configures LP price feeds; **Spread Rules** sets per-feed
repricing; **Group Spreads** sets per-MT5-group markup. A feed has a name,
**Created** / **Last Updated** stamps, and can be forced to re-read its config.

## Feed stats {#stats}

**Active Feeds** — feeds currently live; **Ticks Delivered** / **Ticks Dropped**
/ **Throttled** — tick throughput and what was suppressed; **Symbol Misses** —
ticks dropped because the symbol had no mapping; **Active News** — news windows
currently in effect; **Vol Tracked** — symbols with an active ATR volatility
signal. Throttle can be **20 ms (LP native)** or **100 ms (NexRisk default)**.

## Volatility tiers {#atr}

The ATR ratio bands read **Quiet**, normal, **Elevated**, and **Extreme** — the
volatility regime a VOLATILITY rule keys off.

## Spread offsets {#offsets}

**Spread Adjustment** shows the resolved **Bid Offset** and ask offset, and how
they combine (**Both Symmetric**, **From Mid**) into the **MT5 SpreadDiff**
applied on each tick. **Client Sees** previews the resulting price the client
gets after **Feed Repricing**.
