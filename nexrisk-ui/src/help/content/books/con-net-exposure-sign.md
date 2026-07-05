---
id: con-net-exposure-sign
title: "Sign conventions: the broker's perspective"
type: concept
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "Tech-lead spec: broker P&L = inverse of MT5 client P&L; commissions/swaps/rebates positive=earn negative=pay; Summary/Portfolio = broker take-home"
  - "BBookPage.tsx (profit: -raw.profit; side flips BUY/SELL)"
  - "NetExposure.tsx (brokerNetVol = -clientNetVol; brokerFloatingPL = -(profit+swap+comm))"
  - "Charts API Frontend Integration §9 (cost sign convention)"
related: [gls-net-exposure, con-book-model, gls-b-book]
tags: [sign-convention, broker-perspective, pnl, costs, direction]
status: reviewed
version: books-v1
---

## Everything is the broker's view {#broker-view}

Every P&L, exposure, and cost figure on the platform is shown from the broker's
perspective — what the broker takes home — not the client's. Because the broker
holds the opposite side of internalised client flow, the broker's numbers are
the mirror image of the client's.

## Profit and P&L {#pnl}

Displayed P&L is the broker's P&L, which is the inverse of the MT5 client
profit. When a B-Book client is in profit, the broker is losing the same amount,
and vice-versa.

## Costs: commissions, swaps, rebates {#costs}

Commissions, swaps, and rebates are shown from the broker's side: positive means
the broker earns, negative means the broker pays. A book's cost total is the sum
of the three, so its sign is that book's net contribution.

## Direction and net volume {#direction}

The broker's position is the opposite side of the client's. On the Net Exposure
page the B-Book row shows the broker's side of the internal book — the inverse
of client direction (client sells 500K, the B-Book shows BUY +500K and the
broker is long). The Coverage Book row shows the broker's actual LP position,
signed as placed. When an instrument is fully hedged, the two rows are equal in
magnitude and opposite in sign, netting to zero residual exposure.

## Summary and Portfolio {#summary}

Summary and Portfolio figures are what the broker takes home — the same
broker-perspective convention applied to firm-level totals.
