---
id: ref-books-columns
title: "B-Book and Coverage — grid columns"
type: reference
domain: books
module: bbook
minLevel: VIEW
route: /b-book
source:
  - "BBookPage.tsx / CBookPage.tsx (column headers)"
  - "FIX Bridge DOM Trader (position fields)"
related: [gls-b-book, gls-coverage-book, ref-portfolio-book-fields]
tags: [columns, position, stop-loss, take-profit, mt5]
status: reviewed
version: books-v1
---

## Position columns {#columns}

**Login ID** / **Account** — the MT5 client login the position belongs to.
**Position ID** — the MT5 or LP position identifier. **Open Time** — when the
position opened; **Open Price** — the entry price; **Fill Price** — the executed
price of a manual coverage order; **Cur. Price** — the current market price.
**S/L** — the Stop-Loss level (price at which the position auto-closes to cap a
loss); **T/P** — the Take-Profit level (price at which it auto-closes to bank a
gain). **Group** — the MT5 group the login belongs to; **Server** — the MT5
server hosting the account.
