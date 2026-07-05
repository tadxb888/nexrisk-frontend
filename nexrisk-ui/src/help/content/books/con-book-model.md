---
id: con-book-model
title: "How trades are booked: A / B / C and Coverage"
type: concept
domain: books
module: portfolio
minLevel: VIEW
route: /portfolio
source:
  - "Portfolio API Frontend Integration Brief §2 (Book Definitions), §3.3 (PortfolioRow)"
  - "CBookPage.tsx (Coverage = A-Book + C-Book; manual = Terminal + DOM Trader)"
  - "LP Volume Report API (A/C reach LPs; B internalised)"
related: [gls-a-book, gls-b-book, gls-c-book, gls-coverage-book, ref-portfolio-book-fields]
tags: [booking, a-book, b-book, c-book, coverage, execution-source, hedge-records]
status: reviewed
version: books-v1
---

## The three books {#three-books}

Every unit of client risk lands in one of three books, distinguished by how (or
whether) it was hedged:

- **A-Book** — automated LP hedge. `hedge_records.execution_source = 'automated'`,
  placed by the hedge-strategy engine.
- **B-Book** — internalised in MT5, never routed to an LP. Read live from the MT5
  Manager API.
- **C-Book** — manual LP hedge. `hedge_records.execution_source` in
  `'manual_dom'` / `'manual_terminal'`, placed by hand via DOM Trader or LP
  Terminal.

## Coverage = A-Book + C-Book {#coverage}

A-Book and C-Book both place coverage at a liquidity provider; together they are
the broker's coverage, and the Coverage Book page consolidates them into one
view. The B-Book is never part of coverage — it is retained internally and never
reaches an LP.

## Where each book's numbers come from {#data-sources}

A-Book and C-Book both derive from `hedge_records`, separated only by
`execution_source`. B-Book is not in `hedge_records`; its figures come from the
live MT5 Manager API and depend on the `bbook_available` flag. On the Portfolio
page these appear as `aBook`, `bBook`, `cBook` columns; a reserved `portfolio`
column is always `null` in Phase 1.

## Which books reach a liquidity provider {#lp-reach}

A-Book and C-Book reach an LP; B-Book does not. LP volume reporting therefore
includes only `book_name` `"A"` and `"C"` and excludes the B-Book.
