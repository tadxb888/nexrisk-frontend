---
id: ref-abook-ledger
title: "A-Book Hedge Ledger — columns"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source:
  - "ABookPage.tsx (column headers)"
  - "Hedging Manager API v1.3 §7 (Hedge Records — A-Book Hedge Ledger)"
related: [gls-a-book, ref-hedge-strat-states, ref-exec-report-states]
tags: [a-book, ledger, hedge-records, revenue, latency]
status: reviewed
version: exec-v1
---

## Columns {#columns}

**Login** — the client login whose position was hedged; **Account** — the LP
dealing account. **Client Price** — the price the client got; **LP Price** — the
price the hedge filled at on the LP; **Rev Pips** — revenue captured in pips
between the two. **Net Lots** — net hedged lots; **Net Notional** — net hedged
notional; **Avg Price** — volume-weighted average hedge price. **Last Hedge** —
time of the most recent hedge. **Avg Latency** — average hedge round-trip time.
**Fill Success %** — the share of hedge orders that filled. Time-in-force on a
manual A-Book order is one of **GTC**, **IOC**, or **FOK**.
