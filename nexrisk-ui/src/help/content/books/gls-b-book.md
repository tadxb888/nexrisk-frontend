---
id: gls-b-book
title: "B-Book"
type: glossary
domain: books
module: bbook
minLevel: VIEW
route: /b-book
source:
  - "Portfolio API Frontend Integration Brief §2 (Book Definitions)"
  - "BBookPage.tsx (broker takes opposite side; profit inverted)"
  - "LP Volume Report API (B-Book internalised in MT5, never touches an LP)"
related: [gls-a-book, gls-c-book, con-book-model, con-net-exposure-sign]
tags: [b-book, internal, mt5, internalisation, broker-perspective]
status: reviewed
version: books-v1
---

## Definition {#definition}

The **B-Book** is the broker's internal book: client flow the broker retains
rather than hedging externally. It is internalised in MT5 and never touches an
LP, so the broker holds the opposite side of the client's position.

B-Book figures are read live from the MT5 Manager API — floating P&L from open
positions, and realised P&L, commission, and swap from deals in the selected
period. Because this depends on a live MT5 connection, the Portfolio response
carries a `bbook_available` flag; when MT5 is disconnected, B-Book values are
`null` and must be checked before display.

Displayed B-Book P&L is the broker's P&L — the inverse of the client's. Because
B-Book flow is never routed to an LP, it is excluded from LP volume reporting.
