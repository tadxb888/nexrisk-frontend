---
id: ref-net-exposure-status
title: "Net Exposure — Status, Signal, and columns"
type: reference
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "NetExposure.tsx (status + signal classification, column headers, tooltips)"
related: [gls-net-exposure, con-net-exposure-sign, gls-order-side-dispatch, gls-risk-severity]
tags: [net-exposure, status, signal, hedge-ratio, orphan, naked]
status: reviewed
version: books-v1
---

## Match status {#status}

Each symbol's B-Book versus Coverage legs are classified: **MATCHED** — hedge
and client side aligned; **PARTIAL** — partially hedged; **OVER** — over-hedged;
**ORPHAN** — a coverage/LP hedge leg still open after the client side closed (an
over-hedge with no client behind it); **NAKED** — a B-Book client position with
no coverage against it (unhedged broker exposure); **WRONG-WAY** — coverage in
the wrong direction; **FLAT** — no position. Orphan and naked positions
contribute their full magnitude to residual exposure.

## Signal {#signal}

A hedge-quality signal per row: **HEDGE_WORKING** — the hedge is offsetting as
intended; **HEDGE_DRAG** — the hedge is costing against the position;
**BONUS** — the hedge is contributing favourably beyond offset; **DOUBLE_LOSS**
— both legs are losing; **FLAT** — no active signal.

## Risk level {#risk-level}

Rows carry a residual-risk severity of **Low**, **Medium**, **High**, or
**Critical** (see the risk-and-severity glossary).

## Columns {#columns}

**Net Vol.** — the broker's net residual volume for the symbol (broker
perspective). **Broker P/L** — the broker's live P&L on the net position.
**Mkt Px** — the live close-out market price for the net position. **Break-Even Px** — the price at which the net position shows zero P&L. **Hedge Ratio** —
client-direction lots covered by an opposite-direction hedge; 100% = every
B-Book lot has a matching Coverage lot the other way. **Hedge Impact** — the
effect of the hedge on the position. **Signal** — the hedge-quality signal
above. **Account** — the dealing account.
