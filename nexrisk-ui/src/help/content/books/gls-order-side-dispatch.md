---
id: gls-order-side-dispatch
title: "Order side and dispatch states"
type: glossary
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "FIX Bridge API Documentation §17 (Side)"
  - "NetExposure.tsx / CBookPage.tsx (order side, dispatch state)"
related: [ref-exec-report-states, con-net-exposure-sign]
tags: [side, buy, sell, flat, sent, rejected, dispatch]
status: reviewed
version: books-v1
---

## Side {#side}

An order or position side is **BUY** (long) or **SELL** (short); a netted
position with no residual direction reads **FLAT**.

## Dispatch state {#dispatch}

A manually placed coverage order shows **SENT** once it has been accepted and
transmitted to the LP over FIX, or **REJECTED** if the LP declined it. SENT
confirms transmission, not a fill — the fill arrives on a later execution report.
