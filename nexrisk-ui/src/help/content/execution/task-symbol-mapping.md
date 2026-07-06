---
id: task-symbol-mapping
title: "Symbol Mapping — translating MT5 symbols to LP and NexDay"
type: task
domain: execution
module: symbol_map
minLevel: VIEW
route: /symbol-mapping
source:
  - "NexRisk Symbol Mapping API v2.0 (MT5->LP and MT5->NexDay mapping types, STP fields)"
  - "Symbol Mapping Extension / Normaliser (volume_multiplier, price_multiplier, LOTS/UNITS, examples)"
  - "Pre-Hedge Execution Flow + LP-to-MT5 Price Streaming (normalizer hard-block, symbol_misses)"
related: [ref-symbol-mapping-controls, task-price-rules, task-hedge-strategies, task-route-sanity]
tags: [symbol-mapping, normalizer, lp-symbol, mt5-symbol, volume-multiplier, price-multiplier, symbol-misses, nexday]
status: reviewed
version: exec-v2
---

## Why mapping matters {#why}

A tick from an LP carries the LP's own symbol name, and a hedge order has to go
out in the LP's symbol, volume, and price format. Symbol Mapping is the
translation table that makes both directions work. It sits on the critical path
for **pricing** (an unmapped LP symbol's ticks are dropped and never reach MT5)
and for **hedging** (an unmapped symbol can't be hedged at all).

## Two kinds of mapping {#types}

Each MT5 symbol can have one of each: **MT5 → LP** (links the MT5 symbol to the LP
symbol plus STP routing/normalisation parameters — required for hedging and
hedge-efficiency metrics) and **MT5 → NexDay** (links it to the NexDay prediction
symbol — required for prediction metrics, alignment, and market bias). A symbol
missing its LP mapping is excluded from hedging; missing its NexDay mapping is
excluded from predictions.

## Adding an LP mapping {#add}

Pick the LP, then add a row: the **LP symbol** exactly as the LP sends it over FIX
and the **MT5 symbol** as it exists on the MT5 server, set Active, and save — the
cache warms automatically, no restart. Names often differ: `XAG/USD` → `XAGUSD`
(slash), `GOLD` → `XAUUSD` (commodity name vs ISO code), `US30` → `DJ30` (broker-
specific name).

## Normalisation — volume and price {#normalize}

When MT5 and LP use different units or price scales, two multipliers fix it.
**Volume multiplier**: `MT5 volume × N = LP volume` — e.g. 1.0 when both trade in
lots, or 100000 when MT5 trades lots and the LP trades units. **Price multiplier**:
`MT5 price × N = LP price` — e.g. 1.0 for EURUSD, or 0.01 when the LP quotes silver
on a different scale. Both default to 1.0, so standard symbols need no
configuration; both must be greater than zero. The multipliers are snapshotted
into the hedge record at dispatch, so later mapping edits don't rewrite history.

## A missing mapping is a hard block {#hard-block}

On the price side, a missing mapping silently drops the LP's ticks and increments
**`symbol_misses`** in the feed stats — a non-zero counter there points straight
back to this page. On the hedge side it's a hard stop: the normalizer returns no
entry, the hedge goes to `NORMALIZER_ERROR` and is **not** sent, and the position
is flagged for the operator to add the mapping and retry. That's deliberate —
dispatching an order with untranslated size or price is far more dangerous than
refusing to send it.
