---
id: gls-a-book
title: "A-Book"
type: glossary
domain: books
module: portfolio
minLevel: VIEW
route: /portfolio
source:
  - "Portfolio API Frontend Integration Brief §2 (Book Definitions)"
  - "CBookPage.tsx (automated = A-Book; part of Coverage)"
  - "LP Volume Report API (book_name A/C; B never touches an LP)"
related: [gls-b-book, gls-c-book, gls-coverage-book, con-book-model, ref-portfolio-book-fields]
tags: [a-book, hedge, automated, lp, execution-source, coverage]
status: reviewed
version: books-v1
---

## Definition {#definition}

The **A-Book** is the broker's automated hedge book: client flow whose risk is
passed to a liquidity provider (LP) by the rule-driven hedge engine.

A row belongs to the A-Book when its hedge execution carries
`execution_source = 'automated'` in `hedge_records` — a rule-driven LP hedge
dispatched by the pre-hedge engine in response to a hedging strategy.

A-Book coverage reaches an LP, unlike the B-Book, and together with the C-Book
it forms the Coverage Book. In LP volume reporting it appears as
`book_name = "A"`.
