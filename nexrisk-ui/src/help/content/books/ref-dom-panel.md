---
id: ref-dom-panel
title: "Coverage Book — DOM trading panel"
type: reference
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "NexRisk FIX Bridge DOM Trader"
  - "CBookPage.tsx"
related: [gls-coverage-book, ref-books-columns, gls-order-side-dispatch]
tags: [dom, coverage, market-depth, margin, swap, stop-loss, take-profit]
status: reviewed
version: books-v1
---

## Account panel {#account}

For the selected LP the panel shows **Balance**, **Used Margin**, **Available
Margin**, and the swap breakdown **Swap Long** / **Swap Short** / **Swap Net**,
alongside **Unrealized P/L** and **Realized P/L**.

## Market depth and order entry {#order}

**Market Depth** shows the live book; **Best Bid** / **Best Ask** are the top of
book. When placing a manual coverage order you set **Long / Short** (side),
optional **Stop Loss** and **Take Profit** levels, and can attach a note.
**Order FIX Details** shows the raw FIX messages behind an order for
troubleshooting.
