---
id: task-read-net-exposure
title: "Net Exposure — reading the page"
type: task
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "NetExposure.tsx (in-page tooltips: residual risk, hedged ratio, coverage vs B-Book sourcing)"
  - "Portfolio API Frontend Integration Brief (broker P&L perspective)"
  - "Domain convention: broker P&L is the inverse of MT5 client P&L; Coverage = A-Book + C-Book"
related: [ref-net-exposure-status, ref-net-exposure-panels, con-net-exposure-sign, gls-net-exposure, gls-coverage-book]
tags: [net-exposure, residual-risk, hedge-ratio, orphan, naked, broker-pnl, coverage]
status: reviewed
version: books-v2
---

## What the page answers {#what}

Net Exposure shows the broker's residual directional risk per symbol after the
B-Book (client positions the broker holds) and Coverage (the hedge side) net out.
A perfect hedge nets to zero; whatever's left is real risk on the firm's balance
sheet. Everything here is the **broker's** perspective — broker P&L is the inverse
of the client's MT5 P&L, so a symbol where clients are winning shows as broker
loss.

## Net volume and residual risk {#residual}

**Net Vol.** is the broker's net residual volume for the symbol after the two
sides offset. Two cases contribute their *full* magnitude to residual risk rather
than netting: an **orphan** (a coverage/LP hedge leg still open after the client
side closed — an over-hedge with nothing behind it) and a **naked** position (a
B-Book client position with no coverage against it — unhedged broker exposure).
Both are flagged in the Status column and are where residual risk actually comes
from.

## Hedge ratio {#hedge-ratio}

**Hedged Ratio** is client-direction lots covered by an opposite-direction hedge,
summed across symbols. 100% means every B-Book lot has a matching Coverage lot the
other way — fully hedged. Below 100% means some client exposure is naked; the
per-symbol grid shows where.

## Status and signal {#status-signal}

Each symbol's match **Status** classifies the two legs: MATCHED, PARTIAL, OVER,
ORPHAN, NAKED, WRONG-WAY, or FLAT. The **Signal** rates hedge quality:
HEDGE_WORKING (offsetting as intended), HEDGE_DRAG (the hedge is costing against
the position), BONUS (contributing beyond offset), DOUBLE_LOSS (both legs losing),
or FLAT. NAKED with a large net volume, or DOUBLE_LOSS, are the rows to look at
first.

## The numbers {#numbers}

**Broker P/L** is the firm's live P&L on the net position; **Mkt Px** the live
close-out price; **Break-Even Px** the price at which the net position shows zero.
The summary strip totals **Overall Net Exposure**, **Coverage Vol** (LP-side
exposure, including orphans), and **Float / Net P/L**. One data-sourcing caveat:
the Coverage side comes from backend daily-stats while the B-Book side is
accumulated client-side until the MT5 closed-position endpoint is available, so a
freshly closed B-Book position may lag briefly.
