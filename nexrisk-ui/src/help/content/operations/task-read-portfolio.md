---
id: task-read-portfolio
title: "Portfolio — operating guide"
type: task
domain: operations
module: portfolio
minLevel: VIEW
route: /portfolio
order: 2
source:
  - "Portfolio_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [portfolio, pnl, floating, realized, rpm, lots, notional, revenue, swaps, commissions, a-book, b-book, c-book]
status: reviewed
version: summary-v3
---

## 1. About This Guide

The Portfolio page is the most-visited screen in the platform — the
place the desk lands to see, in one view, what the firm has made, how it
is positioned, whether its risk is covered, and how the month is
tracking. Because it is read so often, every figure on it needs to be
understood exactly. This guide explains all of them: the book breakdown
and each of its rows, the all-important Hedge Direction and how to act
on it, the month-over-month comparison, the controls, and every one of
the nine charts.

Two things frame everything else on the page, so they come first: the
sign convention (Section 2) and the three books (Section 3). With those
in hand, the rest reads naturally.

|                                                                                                                                                                                                                                                                                                     |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Everything is scoped to the selected MT5 node.** The whole page — the breakdown and every chart — reflects the MT5 node chosen in the node selector (the master node by default). Switching the node re-scopes all of it. A figure is always "this node’s portfolio", never a blend across nodes. |

## 2. The Golden Rule: Every Number Is Signed to the Broker

This is the single most important thing to know about the page. **All
money figures are shown from the broker’s point of view.** A
**positive** number is money the firm **earns**; a **negative** number
is money the firm **loses** or pays out. This is the opposite of the
client’s view: when a client loses on a B-Book trade, the firm gains, so
the figure is positive.

**Green / positive** = the firm made money. **Red / negative** = the
firm lost money or paid a cost.

This applies to every money row — realized and unrealized P&L,
commissions, swaps and rebates. A positive swap figure means the firm
earned on swaps; a negative rebate figure means the firm paid rebates
out.

|                                                                                                                                                                                                                                                                                                                                                  |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example (from a live screen).** Net realized **+$59,604** — the firm is up on closed trades. Unrealized **−$14,155** — open positions are currently under water for the firm. Swaps **+$2,160** — the firm earned that in swap charges. Read together: a strong realized month, with some open exposure running against the firm right now. |

**One exception to keep straight:** the **volume** rows are not money,
so "positive/negative" there means **direction**, not profit — a
positive net volume means a net **long** lean, negative means net
**short**. Section 5 makes this explicit per row.

## 3. The Three Books

The breakdown splits everything into three books plus their combined
Portfolio total. In plain terms:

- **B-Book — the internal book.** Client trades the firm keeps in-house
  and takes the other side of. This is **where the firm’s market risk
  sits**. Because the firm is the counterparty, directions are inverted:
  a client **buy** makes the firm **short**, a client **sell** makes the
  firm **long**.

- **A-Book — the externalized book.** Trades passed out to a liquidity
  provider and hedged. The firm earns a spread and carries little market
  risk on them.

- **C-Book — the auto-hedged book.** Positions covered automatically at
  the trade level — a middle ground that should quietly contribute.

The A-Book and C-Book are the **hedge** (coverage) books; the B-Book is
the **risk** book. That relationship is exactly what Hedge Direction
measures (Section 5.4). Each book has its own colour used consistently
across the page: B-Book violet, A-Book blue, C-Book orange, Portfolio
teal-green.

## 4. How the Page Is Laid Out

The page is a workspace with three zones plus the summary strip at the
very top:

- **Chart rail (left, collapsible)** — thumbnails of the charts; click
  one to show it, and pin (★) one as the default that loads next time.

- **Chart area (centre)** — the selected chart, with its own Period
  selector, any chart-specific toggle, and a "Get Insight" button that
  opens an AI reading of the chart.

- **Portfolio breakdown (right, collapsible)** — the book table: Period
  and MT5 Node selectors, a Lots / Notional toggle, the Portfolio card
  and the three book cards, and the month-over-month line beneath.

- **Summary strip (top of page)** — headline totals: open positions,
  revenue & expenses, volume, and net unrealized and realized P&L
  (Section 8).

## 5. The Book Breakdown — Every Row

The breakdown is a table with four columns — Portfolio (the combined
total) and the B, A and C books — and a row for each figure. The rows
fall into three groups: money, volume, and the Hedge Direction row.

### 5.1 The money rows

All follow the broker sign convention from Section 2.

| **Row**      | **What it is**                                                          | **Reading**                                                                        |
|--------------|-------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| NET REAL P/L | Realized profit or loss from closed positions this period, broker view. | The headline "what we made" from trading. Positive = the firm booked a profit.     |
| UNRL P/L     | Unrealized profit or loss on positions still open, broker view.         | What the firm would make or lose if open positions closed now. Moves continuously. |
| COMMISSIONS  | Commission earned or paid, this period.                                 | Positive = net earned; negative = net paid to the provider.                        |
| SWAPS        | Overnight swap charges, this period.                                    | Positive = the firm earned on swaps; negative = paid.                              |
| REBATES      | Rebates to introducing brokers and affiliates.                          | Usually negative — money paid out. A large jump is worth checking.                 |

### 5.2 The volume rows

These describe **open** positions right now (a live snapshot, not a
period total). They are magnitudes in **lots** by default — or notional
value with the Lots / Notional toggle.

| **Row**   | **What it is**                                                                                                 |
|-----------|----------------------------------------------------------------------------------------------------------------|
| POSITIONS | The number of open positions in the book.                                                                      |
| VOLUME    | Total open volume — longs plus shorts (the gross size on the book).                                            |
| LONG VOL  | Open volume on the long side (broker-direction).                                                               |
| SHORT VOL | Open volume on the short side (broker-direction).                                                              |
| NET VOL   | Long minus short. Positive = a net long lean; negative = a net short lean. This is the book’s directional bet. |

### 5.3 A note on the two directional numbers

The page carries **two** directional signals that answer different
questions. **Net Vol** is a plain magnitude — how long or short a book
is. **Hedge Direction** (next) is an interpretation — whether the hedge
books cover the risk book. They can carry different meanings, so they
are shown as separate rows.

### 5.4 Hedge Direction — what it means and how to act

This is the row that turns raw positioning into a risk decision, so it
deserves care. It reads differently in the book columns than in the
Portfolio column.

**In the B, A and C columns**

Here Hedge Direction simply names the **direction each book is
leaning**, from the sign of its net volume: a net long book reads
**Long**, a net short book reads **Short**. For the **B-Book** this is
the firm’s live market exposure; for the **A** and **C** books it is the
direction of the coverage the firm has placed.

**In the Portfolio column**

Here it answers the real question: **do the hedge books (A + C) cover
the B-Book risk?** It nets everything together and labels the result:

| **Portfolio reads…** | **Meaning**                                                                                                                                 | **What to consider**                                                                                                                                          |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Under-hedged         | The A + C coverage does not fully offset the B-Book exposure — the firm still carries net directional risk (the residual net volume shown). | If the residual is large, or on a volatile symbol, add coverage (via a hedging strategy) or accept it as a deliberate position. Cross-check Where-Is-My-Risk. |
| Over-hedged          | The hedges exceed the B-Book exposure — the coverage itself has become a directional position the other way.                                | Consider reducing the hedge; the firm is now taking a bet through its coverage, not just neutralising risk.                                                   |
| Balanced / flat      | Coverage roughly matches exposure — little residual directional risk.                                                                       | Neutral; nothing to do on this axis.                                                                                                                          |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Worked example (from a live screen).</strong></p>
<p>B-Book Net Vol <strong>−33.20</strong> → <strong>Short</strong>:
clients are net long, so the firm is net short 33.20 lots — its live
risk.</p>
<p>A-Book <strong>+12</strong> → <strong>Long</strong>, C-Book
<strong>+2</strong> → <strong>Long</strong>: the coverage books are long
14 in total.</p>
<p>Portfolio Net Vol <strong>−19.20</strong> →
<strong>Under-hedged</strong>: the 14 of long coverage offsets only part
of the 33.20 short B-Book exposure, leaving about 19 lots of net short
risk uncovered.</p>
<p><strong>Action read:</strong> the firm is carrying ~19 lots of
unhedged short exposure. If that is meaningful for the symbols involved,
raise coverage; if intended, leave it — but now it is a known,
deliberate position.</p></td>
</tr>
</tbody>
</table>

### 5.5 The Portfolio column

The Portfolio column is the sum of the three books: its P&L, positions,
commissions, swaps and rebates add up the books, and its Net Vol is the
combined long-minus-short across all three — the firm’s overall
directional lean. Its Hedge Direction is the under/over-hedged reading
above.

## 6. The "vs Prior Month" Line

Beneath the table sits a like-for-like comparison of the month’s
performance against the previous month. It reads, for example: "VS PRIOR
MONTH · NET REALIZED · this $61,764.25 · prior $32,503.94 — ▲
$29,260.31 ahead."

- **Net Realized** is the realized bottom line for the month — realized
  trading P&L together with the revenue-and-expense items (commissions,
  swaps, rebates). It is the fuller "what we actually realized" figure,
  also shown in the top strip.

- **this vs prior** compares this month to last month **at the same day
  of the month** — a partial month against the equal partial month — so
  the comparison is fair rather than full-month-versus-part-month.

- **▲ ahead / ▼ behind** is the difference and its direction. "Ahead"
  means the firm is running better than at the same point last month.

|                                                                                                                                                                                                                                                             |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Reading the example.** This month’s net realized is **$61,764** against **$32,504** at the same date last month — the firm is **$29,260 ahead**, running roughly double last month’s pace. A "behind" reading would be the prompt to ask what changed. |

## 7. Controls

- **Period** — the window the figures cover (Today, This Week, This
  Month, Last Month, halves, This Year). The breakdown and each chart
  respect it (some charts offer their own period set).

- **MT5 Node** — which node’s portfolio is shown. The master node is the
  default; the whole page re-scopes when changed (Section 1).

- **Lots / Notional** — switches every volume figure between lots and
  its notional (USD) value, so you can read size either way.

- **Updated time** — when the breakdown last refreshed; the figures are
  live and update continuously.

- **Get Insight** — opens an AI reading of the currently-shown chart, in
  a side panel.

## 8. The Summary Strip

The strip across the top of the page carries the headline totals for
quick reference, all broker-signed:

| **Figure**           | **What it is**                                                                                                           |
|----------------------|--------------------------------------------------------------------------------------------------------------------------|
| Portfolio positions  | Total open positions across all books.                                                                                   |
| Rev. & Exp.          | The revenue-and-expense line — commissions, swaps and rebates combined.                                                  |
| Volume               | Total open volume across the portfolio.                                                                                  |
| Unrealized P/L (Net) | Net unrealized P&L on all open positions.                                                                                |
| Realized P/L (Net)   | The realized bottom line — trading P&L plus revenue and expenses. This is the figure the month-over-month line compares. |

## 9. The Charts

The chart area presents nine charts, chosen from the left rail. Each has
a Period selector; a couple carry an extra toggle. This section explains
what each shows and how to read it.

### 9.1 P&L over time

**Realised P/L per Book (the default)**

Realized P&L across the A, B and C books over the period — shown daily
for past days and hourly for today, in three stacked panels (B, A, C).
The quickest way to see which book is driving the month and on which
days.

**Portfolio Performance — Cumulative P/L**

The running total of realized P&L across the period as a single line —
green when cumulative P&L is positive, red when negative. Shows the
shape of the month: steady climb, a drawdown and recovery, and so on. (A
single day is excluded, as a one-point line says nothing.)

### 9.2 Volume and positioning

**Most Traded Symbols**

The top symbols by total traded volume (long plus short) over the period
— where the flow is concentrated.

**A/B/C Net Volume**

A snapshot of net volume across the three books as slices. Clicking a
slice breaks it down into the symbols contributing to that book’s net
position — useful for seeing what is behind a directional lean.

**Daily Volumes per Book**

Per-day volume across A, B, C and the Portfolio over the period, with
its own Lots / Notional toggle — the trend of how much is being traded,
book by book.

### 9.3 Hedging and coverage

**Symbols Hedge**

For each symbol, the B-Book volume with the **coverage (A + C) drawn
inside** it — so you can see, per symbol, how much of the internal
exposure is hedged. A long / short / both toggle focuses the view. This
is the per-symbol companion to the Hedge Direction row.

### 9.4 Costs and revenue

**Cost: Revenues & Expenses**

A monthly view of commission, swap, net revenue and provider commission
paid, over a trailing 3, 6 or 12 months. Negative bars are broker
expenses. Shows whether the cost base is stable and how revenue nets
against it over time.

**Daily Cost Breakdown per Book**

Period-summed commissions, swaps and rebates per book, with two bars per
book — a stacked breakdown and the total — so you can see which book and
which cost type dominates.

### 9.5 Clients

**Top 30 Holders by Gross Volume**

The thirty logins with the most gross traded volume this month — who the
biggest traders are by activity. Useful alongside the risk pages for
spotting concentration.

## 10. Reading the Page End to End

Putting it together, a typical read of the breakdown takes a few
seconds:

- **Money.** Is Net Real P/L green and healthy? Is Unrealized deeply red
  (open risk running against us)? Are costs where expected?

- **Positioning.** What is the Portfolio Net Vol — are we net long or
  short overall, and how big?

- **Coverage.** What does Portfolio Hedge Direction say — under-hedged
  (residual risk), over-hedged (coverage overshoot), or balanced? Act if
  the residual is material.

- **Trajectory.** Is the month ahead of or behind last month on the
  vs-prior line?

- **Detail.** Drop into the charts — Realised P/L per Book for what
  drove the month, Symbols Hedge for per-symbol coverage, Net Volume for
  what is behind the lean.

Every figure carries the same sign convention throughout, so once the
broker’s-eye view is second nature, the whole page reads at a glance.

## 11. Quick Reference

### 11.1 Sign convention

**Positive** = the firm earns. **Negative** = the firm loses or pays.
(Money rows.) For volume rows, positive Net Vol = net long, negative =
net short.

### 11.2 Hedge Direction at a glance

| **Where**        | **Label**     | **Means**                                                                  |
|------------------|---------------|----------------------------------------------------------------------------|
| B / A / C column | Long or Short | The direction that book is leaning (B = the firm’s risk; A, C = coverage). |
| Portfolio column | Under-hedged  | Coverage does not fully offset B-Book — residual risk remains.             |
| Portfolio column | Over-hedged   | Coverage exceeds B-Book — hedges have become a position.                   |
| Portfolio column | Balanced      | Coverage matches exposure — little residual risk.                          |

### 11.3 The nine charts

| **Chart**                 | **Shows**                                            |
|---------------------------|------------------------------------------------------|
| Realised P/L per Book     | Realized P&L across A/B/C — daily, hourly for today. |
| Portfolio Performance     | Cumulative realized P&L line — green up, red down.   |
| Most Traded Symbols       | Top symbols by total volume.                         |
| A/B/C Net Volume          | Net volume by book; click a slice for symbols.       |
| Daily Volumes per Book    | Per-day volume by book (Lots / Notional).            |
| Symbols Hedge             | Per-symbol B-Book volume with A+C coverage inside.   |
| Cost: Revenues & Expenses | Monthly revenue vs expenses (trailing 3/6/12m).      |
| Daily Cost Breakdown      | Commissions, swaps, rebates per book.                |
| Top 30 Holders            | The 30 biggest logins by gross volume this month.    |

### 11.4 Book colours

B-Book violet · A-Book blue · C-Book orange · Portfolio teal-green —
used consistently across the table and every chart.

*End of guide.*
