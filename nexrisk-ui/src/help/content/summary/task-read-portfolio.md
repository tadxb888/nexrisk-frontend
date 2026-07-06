---
id: task-read-portfolio
title: "Reading the Portfolio table"
type: task
domain: summary
module: portfolio
minLevel: VIEW
route: /portfolio
source:
  - "NexRisk Portfolio API Frontend Integration Brief (PortfolioRow shape, row inventory, A/B/C-book column availability, null-vs-0.0 rendering, broker P&L perspective)"
related: [ref-cockpit, con-book-model, gls-a-book, gls-coverage-book, con-net-exposure-sign]
tags: [portfolio, pnl, floating, realized, rpm, lots, notional, revenue, swaps, commissions, a-book, b-book, c-book]
status: reviewed
version: summary-v2
---

## What the table shows {#what}

The Portfolio table breaks the broker's take-home down by metric (rows) and by
book (columns: A-Book, B-Book, Coverage/C-Book, and a Net Total). Everything is
the **broker's** perspective — broker P&L is the inverse of the client's MT5 P&L.
Net Total sums the non-null book columns.

## The rows {#rows}

Five metrics, two of them expandable groups. **Net P&L** expands into **Floating**
(unrealised P&L on open positions) and **Realized** (P&L from positions closed in
the period). **RPM** is revenue per $1M notional. **Lots** is gross traded volume;
**Notional** the same in USD. **Revenue** expands into **Swaps** (swap collected
from B-Book clients and paid to the LP on A-Book/Coverage) and **Commissions**
(earned from clients, positive on B-Book; paid to the LP, negative on A/C-Book).

## What's live per book {#availability}

Not every cell is populated yet. **B-Book** is live for floating, realized, lots,
commissions, and swaps (from live MT5 position and deal data). **A-Book** is live
for P&L, lots, and commissions (from confirmed hedge records in the period).
**Coverage/C-Book** currently reads `0.00` until DOM Trader hedge-record wiring
lands. RPM and notional are not yet populated for any book.

## Reading blank vs zero {#null-zero}

A dash (`—`) and a zero mean different things and the table keeps them distinct: a
dash means the data isn't available for that cell yet, while `0.00` is a real
measured zero from a live source. So a Coverage cell showing `0.00` is telling you
the source is live and the value is genuinely zero right now — not that data is
missing.
