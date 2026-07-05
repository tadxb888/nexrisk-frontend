---
id: ref-portfolio-book-fields
title: "Portfolio row and book fields (reference)"
type: reference
domain: books
module: portfolio
minLevel: VIEW
route: /portfolio
source:
  - "Portfolio API Frontend Integration Brief §2, §3.2, §3.3, §7"
  - "CBookPage.tsx (cBook field = manual only; narrower than the Coverage page)"
related: [con-book-model, gls-a-book, gls-b-book, gls-c-book, gls-coverage-book]
tags: [portfolio, reference, fields, bbook-available, phase-1]
status: reviewed
version: books-v1
---

## Book columns {#columns}

Each Portfolio row exposes four book columns: `aBook`, `bBook`, `cBook`, and a
reserved `portfolio`. Any column may be `number` or `null`; `null` means the
value is not yet available for that metric.

- `aBook` — A-Book (automated LP hedge). Source: `hedge_records` where
  `execution_source = 'automated'`.
- `bBook` — B-Book (internal, MT5). Source: live MT5 Manager API.
- `cBook` — C-Book, the **manual** portion only. Source: `hedge_records` where
  `execution_source` in `'manual_dom'` / `'manual_terminal'`.
- `portfolio` — reserved; always `null` in Phase 1 (render as a dash).

> The `cBook` column here is narrower than the Coverage Book page, which
> combines A-Book + C-Book. Don't equate the two.

## Metric rows {#rows}

The `rows` array has a stable, fixed order. Each row's `id` is one of `pnl`,
`floating`, `realized`, `rpm`, `lots`, `notional`, `revenue`, `swaps`,
`commissions`, and can be used as a React key.

## bbook_available {#bbook-available}

The summary response carries `bbook_available`: `true` when the MT5 Manager API
is connected and B-Book data was fetched, `false` when MT5 is disconnected — in
which case B-Book columns are `null`. Always check this flag before displaying
B-Book values.

## Phase-1 null fields {#phase-1-nulls}

Documented gaps, not bugs: `portfolio` is always `null`; `notional` and `rpm`
are `null` (pending contract-size lookup); A-Book floating P&L is `null`
(pending live FIX position state); and `cBook` is `0.0` for all rows until DOM
Trader manual executions are wired to write `hedge_records`.
