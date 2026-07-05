---
id: ref-net-exposure-panels
title: "Net Exposure — summary panels"
type: reference
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source: ["NetExposure.tsx"]
related: [ref-net-exposure-status, gls-net-exposure, con-net-exposure-sign]
tags: [net-exposure, coverage-vol, float-pl, hedged-ratio, order-log]
status: reviewed
version: books-v1
---

## Summary figures {#summary}

**Overall Net Exposure** — the firm-wide residual directional risk. **Coverage
Vol** — LP-side exposure (inclusive of orphans). **Float P/L** and **Net P/L** —
floating and net broker P&L. **Hedged Ratio** — the share of client-direction
lots covered by an opposite-direction hedge. **MT5 Node** — the source node.

## Per-symbol signal {#signal}

Each symbol's hedge signal reads **HEDGE WORKING**, **HEDGE DRAG**, or **DOUBLE
LOSS** (see the Status/Signal reference). **Intraday: Monitor**, **Target:**, and
**Trading:** show the intraday posture. **Order Log** lists the coverage orders
placed for the selection.
