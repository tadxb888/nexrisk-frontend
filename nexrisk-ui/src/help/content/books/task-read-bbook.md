---
id: task-read-bbook
title: "Reading the B-Book page"
type: task
domain: books
module: bbook
minLevel: VIEW
route: /b-book
source:
  - "BBookPage.tsx (canonical styling + tooltips: live cells reflect open positions; P/L, Cost, Hedge Ratio follow the M/D toggle)"
  - "Domain model: B-Book = client positions the broker internalises and holds as counterparty; broker P&L is the inverse of client P&L"
related: [gls-b-book, ref-books-columns, task-read-net-exposure, task-coverage-dom, ref-cockpit]
tags: [b-book, internalised, open-positions, unrealized, realized, hedge-ratio, broker-pnl, m-d-toggle]
status: reviewed
version: books-v2
---

## What the B-Book is {#what}

The B-Book is the set of client positions the broker **internalises** — holds as
the counterparty rather than hedging out to an LP. It's where the firm's
directional risk actually sits (A-Book is externalised; Coverage is the hedge
side). Because the broker is the counterparty, **broker P&L is the inverse of the
client's**: when B-Book clients win, the broker loses, and vice versa.

## The M/D toggle {#toggle}

The page has a Month/Day toggle on the left, and the **Unrealized P/L, Realized
P/L, Cost, and Hedge Ratio cells follow it** — so the same grid reads either the
current day or month-to-date depending on the toggle. Check which mode you're in
before reading the numbers; a "small" figure in Day mode can be a large one in
Month mode.

## What the cells show {#cells}

Live cells reflect **open positions** and update in real time. Per symbol you get
net position, **Unrealized P/L** (mark-to-market on what's still open),
**Realized P/L** (locked in from what's closed in the period), **Cost** (the
business costs attributed to that flow), and **Hedge Ratio** (how much of the
symbol's B-Book exposure has an offsetting Coverage hedge — the same measure the
Net Exposure page breaks down). Volume can be shown in lots or units.

## How to read it {#read}

Start from the symbols carrying the most net position and the worst broker P&L —
those are where the firm is most exposed. A large naked position (low hedge ratio)
on a symbol that's moving against the broker is the case to act on, usually by
adding coverage on the Coverage/DOM page or via a hedging strategy. A symbol
that's well hedged (ratio near 100%) contributes little residual risk regardless
of its size.

## Where it connects {#connects}

B-Book is one side of Net Exposure — that page nets B-Book against Coverage to show
residual risk per symbol. The Cockpit's "Where Is My Risk" card is the firm-level
summary of the same B-Book exposure. A B-Book position that should be hedged but
isn't is exactly what a hedging strategy's filters are meant to catch.
