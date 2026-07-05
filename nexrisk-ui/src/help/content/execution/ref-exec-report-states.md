---
id: ref-exec-report-states
title: "Execution Report — order states and fields"
type: reference
domain: execution
module: exec_report
minLevel: VIEW
route: /execution-report
source:
  - "FIX Bridge API Documentation §17 (Data Types & Enums), ExecType/OrdStatus tables"
  - "oneZero FIX 4.4 Taker API §Trading (ExecType/OrdStatus/OrdType/TIF)"
  - "ExecutionReport.tsx"
related: [ref-hedge-strat-states, gls-coverage-book]
tags: [execution, fix, order-status, order-type, tif, fill]
status: reviewed
version: exec-v1
---

## Execution status {#status}

The lifecycle state of a routed order: **PENDING** — acknowledged and working,
awaiting fill; **PARTIAL** — partially filled, remainder still working;
**FILLED** — completely filled; **REJECTED** — rejected by the LP with no fill;
**FAILED** / **ERROR** — the order could not be dispatched (mapping or transport
failure); **B_BOOK** — internalised rather than routed to an LP; **CLOSING** — a
force-close order was sent, awaiting LP confirmation; **CLOSED** — the position
was wound down; **UNKNOWN** — state could not be determined.

## Order type {#order-type}

**MKT** (Market) — execute at best available price; **LMT** (Limit) — execute at
the specified price or better; **STP** (Stop) — trigger a market order at the
stop price; **STPLMT** (Stop-Limit) — trigger a limit order at the stop price.

## Time in force (TIF) {#tif}

How long an order stays live: **GTC** — Good Till Cancel; **DAY** — valid for
the trading day only; **IOC** — Immediate Or Cancel (fill what's available now,
cancel the rest); **FOK** — Fill Or Kill (fill entirely at once or cancel);
**GTD** — Good Till Date.

## Columns {#columns}

**ClOrdID** — the client order ID assigned at dispatch. **LP Order ID** — the
LP's order identifier. **Trade Rpt ID** — the trade report identifier.
**Routing** — the route the order took; **Exchange** — the destination venue;
**Sec ID** — the LP security identifier for the symbol. **NOS Sent** — the time
the New Order Single was sent; **TE Filled** — the fill time reported by the LP.
**Qty** — order quantity; **Fill Qty** — quantity filled; **Fill Px** — fill
price. **LP Status** — the LP session status for the route. **RT (ms)** —
round-trip latency in milliseconds. **TIF** — the order's time-in-force.
**Timing** and **Meta** group the timestamp and metadata fields; **User** — the
operator who placed a manual order; **Account** — the dealing account.
