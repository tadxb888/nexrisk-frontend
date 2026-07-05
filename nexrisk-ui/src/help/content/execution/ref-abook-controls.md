---
id: ref-abook-controls
title: "A-Book Hedge Ledger — filters and summary"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source: ["ABookPage.tsx", "Hedging Manager API v1.3 §7 (Hedge Records)"]
related: [ref-abook-ledger, ref-hedge-strat-states]
tags: [a-book, ledger, filter, revenue, fill-rate, export]
status: reviewed
version: exec-v1
---

## Filters {#filters}

Filter the ledger by LP (**Select LP** / **All LPs**), by period (**Today** /
**This Month**), and by state (**All States**).

## Summary {#summary}

Header stats: **Positions**, **Long/Short**, **Volume**, **Revenue**, and **Fill
Rate**. Each row shows a **Position ID** and **FIX ID**, with **Chg** marking a
change. **Export** downloads the ledger.
