---
id: task-execution-report
title: "Execution Report — the FIX order blotter and order lifecycle"
type: task
domain: execution
module: exec_report
minLevel: VIEW
route: /execution-report
source:
  - "oneZero FIX 4.4 Taker API (ExecType lifecycle: PendingNew/Rejected/PartiallyFilled/Fill/Canceled; Order-Type x TIF behaviour matrix)"
  - "MatchTrader / CMC FIX API (price vs order sessions, ClOrdID, position reports)"
  - "FIX Bridge API Documentation (blotter, execution reports)"
related: [ref-exec-report-states, ref-exec-report-analytics, ref-lp-admin-states, ref-lp-fix-config]
tags: [execution, fix, blotter, order-lifecycle, fill, rejection, latency, tif]
status: reviewed
version: exec-v2
---

## What the page shows {#what}

The Execution Report is the FIX order blotter — every order the bridge routed to
an LP, its state, timing, and fill. Filter by LP (or all LPs) and read the summary
(positions, long/short, volume, average/best/worst round-trip, rejections and
rejection %) plus latency and status charts.

## How an order moves through FIX {#lifecycle}

When the bridge sends a New Order Single, the LP acknowledges with an execution
report and the order walks a lifecycle: **PENDING** (acknowledged/working — FIX
PendingNew, then working); **PARTIAL** (partially filled — one report per partial
fill); **FILLED** (completely filled); **REJECTED** (LP declined, no fill — e.g.
credit failure); **CLOSING/CLOSED** (a force-close was sent, then confirmed);
**FAILED/ERROR** (couldn't be dispatched — mapping or transport); **B_BOOK**
(internalised rather than routed); **UNKNOWN** (indeterminate). A cancelled order
still reports any quantity that filled before cancellation.

## Order type and time-in-force {#type-tif}

How an order behaves depends on its type and TIF together. **Order types**: MKT
(best available price), LMT (specified price or better), STP (market on stop
trigger), STPLMT (limit on stop trigger). **TIF**: **IOC** and **FOK** make a
single pass — IOC fills what's available now and cancels the rest, FOK must fill
the whole requested volume at once or cancel; **GTC** keeps working until the
bridge's market timeout; **DAY** is valid for the session; **GTD** until a date.
So a Market + IOC takes the best price in one pass, while Market + GTC keeps
sweeping until the timeout.

## Sessions behind it {#sessions}

LPs run two FIX sessions: a **price session** for market data (transient — dropped
messages aren't resent) and an **order session** for execution (persistent — no
lost messages, resent on request). Trading needs a live order session. Each order
carries a unique client order ID (ClOrdID), and the LP returns its own execution
ID on every report — those IDs are what tie a blotter row to the LP's record.

## Reading the columns {#columns}

**ClOrdID** is our order id, **LP Order ID** / **Trade Rpt ID** the LP's.
**Routing** / **Exchange** / **Sec ID** show where it went and the LP's symbol id.
**NOS Sent** and **TE Filled** are the send and fill times; **RT (ms)** is the
round-trip latency between them — the number the latency charts track. **Qty /
Fill Qty / Fill Px** are ordered, filled, and price. **LP Status** is the route's
session state. A climbing **rejection %** or round-trip on one LP is the signal to
check that LP's session on the Liquidity Providers page.
