---
id: gls-coverage-book
title: "Coverage Book"
type: glossary
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "CBookPage.tsx header + coverage-aggregate comments (Coverage = A-Book + C-Book; manual = Terminal + DOM Trader)"
  - "NexRisk DOM Trader Frontend Brief v3.0"
  - "FIX Bridge API (/api/v1/fix/*)"
related: [gls-a-book, gls-c-book, con-book-model, ref-portfolio-book-fields]
tags: [coverage, a-book, c-book, hybrid, dom-trader, terminal, lp]
status: reviewed
version: books-v1
---

## Definition {#definition}

The **Coverage Book** is the broker's consolidated view of all coverage placed
at a liquidity provider — automated and manual — on one page. It combines the
A-Book (automated hedge-strategy executions) and the C-Book (manual executions
via DOM Trader and LP Terminal): **Coverage = A-Book + C-Book**.

## Scope versus the Portfolio cBook field {#scope}

The Coverage Book page is broader than the Portfolio `cBook` field. The page
shows A-Book + C-Book combined; the Portfolio `cBook` column is the manual
(C-Book) portion only. When reconciling figures, match the scope — the page's
coverage total is not the Portfolio `cBook` value.

## Execution types {#execution-types}

Manual rows carry an execution type of `DOM Trader` or `Terminal` (LP Terminal);
everything else on the page is automated (A-Book). C-Book realised P/L is
derived as the LP-wide realised total minus the A-Book portion, until the
backend exposes a direct per-book split.
