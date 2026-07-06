---
id: task-coverage-dom
title: "Coverage Book & DOM Trader — manual hedging"
type: task
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "NexRisk FIX Bridge DOM Trader (startup sequence, GET_BOOK/DOM ladder + book states, place/close order, account status)"
  - "FIX Bridge API (GET_BOOK states HEALTHY/STALE/EMPTY/RESYNCING, order management)"
  - "CBookPage.tsx tooltips + domain convention (Coverage = A-Book + C-Book; cBook field = manual portion only)"
related: [gls-coverage-book, gls-c-book, gls-a-book, task-read-net-exposure, task-lp-management]
tags: [coverage, c-book, dom, manual-hedge, order-book, market-depth, stop-loss, take-profit]
status: reviewed
version: books-v2
---

## What the Coverage Book is {#what}

The Coverage Book is the broker's total hedge against client flow: **A-Book
(automated hedges from strategies) plus C-Book (manual positions placed here via
the DOM Trader)**. The page's own `cBook` figure is only the **manual** portion —
don't read it as all coverage. Use this page to place and manage manual hedges
against B-Book exposure the automated rules didn't cover.

## Getting a symbol live {#startup}

Before you can trade a symbol its price book has to be up: the LP's trading and
market-data sessions must both be logged on, then you subscribe to the symbol,
wait briefly for the first snapshot, and the DOM ladder primes. If either session
isn't logged on, the page warns rather than showing a stale book.

## Reading the DOM ladder {#dom}

The DOM shows bids and asks by level with best bid/ask, mid, and spread. The book
carries a **state**: **HEALTHY** (receiving regular updates), **STALE** (no update
within the threshold, default 10s — prices may be behind the market), **EMPTY**
(subscribed but nothing has arrived yet), or **RESYNCING** (re-requesting a full
snapshot). Only trade off a HEALTHY book — acting on STALE prices risks filling
against a moved market.

## Placing and closing a hedge {#order}

Place a market or limit order with a side, quantity, and time-in-force, and mark
it opening or closing. The fill doesn't come back on the request — it arrives as
an execution report on the live feed, tracked by the order's client id. Closing a
position sends an opposing order referencing the position. Stop-loss and
take-profit can be attached to the order.

## The account panel {#account}

Alongside the ladder, the account status shows the LP account's balance, equity,
used and available margin, and margin level — the headroom for further manual
hedges. TraderEvolution accounts also expose risk limits (daily/weekly loss
limits, max position and order counts, stop-out level); these are the LP's own
guardrails and can block an order if breached.

## A data caveat {#caveat}

C-Book hedge records feed the broader P&L only once DOM Trader hedge-record wiring
is complete, so on some surfaces the manual coverage figure reads `0.00` (a real
zero from a live source) rather than being missing. Net Exposure's Coverage side
likewise blends this with the automated A-Book coverage.
