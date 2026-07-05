---
id: gls-c-book
title: "C-Book"
type: glossary
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "CBookPage.tsx (manual = Terminal + DOM Trader; C-Book totals)"
  - "Portfolio API Frontend Integration Brief §2 (cBook = execution_source manual_dom/manual_terminal)"
related: [gls-a-book, gls-b-book, gls-coverage-book, con-book-model]
tags: [c-book, manual, coverage, dom-trader, terminal, execution-source]
status: reviewed
version: books-v1
---

## Definition {#definition}

The **C-Book** is the broker's manual coverage: hedges placed by hand at a
liquidity provider rather than by the automated engine. Manual executions come
from two sources — the **DOM Trader** and the **LP Terminal** — carrying
execution type `DOM Trader` or `Terminal`.

In the data model, C-Book rows are `hedge_records` with `execution_source` of
`'manual_dom'` or `'manual_terminal'`, and they populate the Portfolio `cBook`
column.

C-Book coverage reaches an LP (unlike the B-Book) and is shown together with the
A-Book on the Coverage Book page.
