---
id: task-execution-report
title: "Execution Report — operating guide"
type: task
domain: execution
module: exec_report
minLevel: VIEW
route: /execution-report
source:
  - "Execution_Report_Guide.docx — operating guide (screen-by-screen manual, ingested verbatim)"
related: []
tags: [execution,fix,blotter,order,fill,rejection,latency,lp-status]
status: reviewed
version: exec-v3
---

## 1. About This Guide

This guide explains the Execution Report page in full, for risk managers
and dealers who use it day to day. It avoids technical language and
walks through every part of the page — the live metrics, the order
blotter and all its columns, the order-detail panel, and the four
analytics charts — in the order you meet them on screen.

This is a monitoring and audit page. It records every order the platform
has sent to a liquidity provider and what became of it, together with
precise timing. Nothing on this page places or changes an order; it is
the authoritative record of what was sent and what came back.

**Who does what.** Everyone can view the report, drill into any order,
and copy or share the details. There are no controls here that change
positions.

**A note on wording.** Where the page shows a short label or code, this
guide quotes it exactly and then explains what it means. A few labels
use trading shorthand (for example "NOS" for the order that was sent,
and "TE" for the liquidity provider); these are spelled out where they
first appear.

## 2. What the Execution Report Page Does

The Execution Report is the order blotter for the platform’s connection
to its liquidity providers. Every order sent out — whether raised
automatically by a hedging strategy or placed by hand — lands here as a
row, alongside the provider’s response and the exact time each step
happened.

It answers three everyday questions: did the order fill, how fast did it
fill, and exactly what was sent and received. It is the place to confirm
executions, measure how quickly providers are responding, and
investigate anything that failed or was rejected.

The page is live: new orders and fills appear as they happen, and the
metrics recalculate continuously. There is no refresh button.

**A note on timing terms.** Two moments matter for every order: when the
platform sent it (shown as "NOS Sent", where NOS means the outbound
order), and when the provider confirmed the fill (shown as "TE Filled").
The gap between the two is the round-trip time — how long the provider
took to respond.

## 3. How the Page Is Laid Out

The page has four areas:

- **Header and live metrics (top).** The provider selector, headline
  figures (positions, direction split, volume, latency, rejections), and
  a live-connection badge.

- **Order blotter (centre).** The main table — one row per order — with
  columns grouped into logical sets.

- **Analytics charts (below the blotter).** Four charts on latency and
  volume that can be collapsed out of the way.

- **Order detail panel (right, on demand).** A slide-in panel that opens
  when you click an order, showing its full breakdown, with copy and
  share buttons.

## 4. The Header and Live Metrics

### 4.1 Liquidity Provider selector

The provider selector filters the whole page to one liquidity provider,
or shows "All Liquidity Providers" together. If a provider is
disconnected, that is noted next to its name. Every metric, chart and
row respects this choice.

### 4.2 The metrics

The headline figures summarise the filled orders in view:

| **Metric**   | **What it shows**                                        |
|--------------|----------------------------------------------------------|
| Positions    | The number of filled orders in view.                     |
| Long / Short | How many were buys (teal) versus sells (amber).          |
| Vol          | The total filled quantity.                               |
| Avg RT       | The average round-trip time, in milliseconds.            |
| Best RT      | The fastest round-trip (green) — the best response seen. |
| Worst RT     | The slowest round-trip (red) — the worst response seen.  |
| Rejections   | The number of orders rejected.                           |
| Rejection %  | Rejections as a share of orders.                         |

### 4.3 The live-connection badge

A small coloured dot and word on the far right show the live link to the
order feed: "Live" (green) when connected, "Connecting" or
"Reconnecting" (amber) while establishing the link, and "Disconnected"
(red) if it drops. If the connection is lost, a red banner appears with
a Reconnect option.

## 5. The Order Blotter

### 5.1 What each row is

Each row is one order sent to a provider. Rows appear the moment an
order goes out and update in place as the provider responds, newest at
the top (the blotter is sorted by fill time). The row count, and how
many are selected, are shown along the bottom.

### 5.2 The columns

The columns are gathered into labelled groups. The most useful are shown
by default; others (marked below) are hidden and can be switched on from
the Columns panel.

| **Group**      | **Column**            | **What it shows**                                                                                                                                          |
|----------------|-----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Execution Type | Execution Type        | The hedging strategy that raised the order, shown as a clickable link that opens that strategy in Hedging Strategies. Orders placed by hand read "Manual". |
| Meta           | LP                    | The liquidity provider the order went to.                                                                                                                  |
| Meta           | TE Filled             | The time the provider confirmed the fill.                                                                                                                  |
| Meta           | Trade Rpt ID (hidden) | The provider’s trade-report reference for the fill.                                                                                                        |
| Timing         | NOS Sent              | The time the platform sent the order.                                                                                                                      |
| Timing         | LP Status             | The outcome — Filled, Pending, Failed, and so on (see 5.3).                                                                                                |
| Timing         | RT (ms)               | The round-trip time in milliseconds, colour-graded (see 5.4).                                                                                              |
| Order          | User                  | Who or what submitted the order (for example the hedge engine).                                                                                            |
| Order          | LP Order ID           | The provider’s order identifier.                                                                                                                           |
| Order          | Symbol                | The instrument.                                                                                                                                            |
| Order          | Side                  | BUY (teal) or SELL (amber).                                                                                                                                |
| Order          | Type                  | Order type — Market, Limit, Stop or Stop-Limit.                                                                                                            |
| Order          | TIF                   | Time-in-force — how long the order stays live (Day, GTC, IOC, FOK, GTD).                                                                                   |
| Fill           | Qty                   | The order quantity.                                                                                                                                        |
| Fill           | Fill Px               | The price the order filled at.                                                                                                                             |
| Fill           | Fill Qty              | The quantity filled.                                                                                                                                       |
| Fill           | Commission (hidden)   | Commission on the fill.                                                                                                                                    |
| Routing        | Route                 | Where the order was routed.                                                                                                                                |
| Routing        | Exchange (hidden)     | The exchange the fill was reported against.                                                                                                                |
| Routing        | Sec ID (hidden)       | The provider’s instrument identifier.                                                                                                                      |
| Routing        | Account               | The account the order was placed on.                                                                                                                       |
| Reference      | ClOrdID               | The platform’s own order reference, matched back to the outbound order.                                                                                    |

### 5.3 LP Status values

The LP Status column reports the outcome of each order, colour-coded:

| **Status**       | **Colour**  | **Meaning**                                                               |
|------------------|-------------|---------------------------------------------------------------------------|
| FILLED           | Green       | The provider confirmed the fill.                                          |
| PARTIAL          | Light green | Only part of the order filled.                                            |
| PENDING          | Amber       | The order was sent; the fill confirmation has not arrived yet.            |
| FAILED           | Red         | The provider did not confirm within the time limit, so a cancel was sent. |
| REJECTED         | Red         | The provider rejected the order.                                          |
| ERROR            | Orange      | An internal problem occurred while processing the order.                  |
| B_BOOK           | Teal        | The order was taken in-house instead of routed to the provider.           |
| CLOSED / CLOSING | Pink        | The position has been, or is being, closed.                               |
| UNKNOWN          | Grey        | The outcome could not be determined.                                      |

### 5.4 Round-trip colour bands

The RT (ms) column colours each round-trip so slow responses stand out
at a glance:

| **Round-trip** | **Colour** | **Read**                                        |
|----------------|------------|-------------------------------------------------|
| 200 ms or less | Green      | Fast.                                           |
| 201 – 600 ms   | Amber      | Acceptable, worth watching.                     |
| Over 600 ms    | Red        | Slow — the provider was sluggish on this order. |

### 5.5 Filtering and columns

Above the blotter is a filter bar with a free-text box and an "Apply"
button, plus a "Builder" button that opens a builder for combining
several conditions. A tab on the right edge of the grid opens panels to
show or hide columns and to manage filters. Several columns are hidden
by default (Trade Rpt ID, Commission, Exchange, Sec ID) and can be
switched on there.

### 5.6 Row behaviour

- **Pending highlight.** An order still awaiting confirmation is shown
  on a dark-amber row, so open items are easy to spot.

- **Selecting a row.** Click any order to open the detail panel on the
  right (Section 6). Pressing Escape closes it.

- **Jump to the strategy.** Clicking the Execution Type link on an
  automated order opens that hedging strategy directly on the Hedging
  Strategies page.

- **Status bar.** The bar under the grid shows total and filtered row
  counts, how many are selected, and totals for any numeric column you
  highlight.

## 6. The Order Detail Panel

Clicking an order slides in a panel on the right with its full story.
Click the × (or press Escape) to close it.

### 6.1 Panel header, Copy and Telegram

The header shows the order’s side and symbol (coloured teal for a buy,
amber for a sell) and its status, with two buttons:

- **Copy.** Copies a neatly formatted summary of the order — side,
  quantity, symbol, price, status, references, timing and provider — to
  the clipboard, ready to paste into a note or ticket. A tick confirms
  the copy.

- **Telegram.** Opens a Telegram share with a short summary of the order
  (side, quantity, symbol, price, status, round-trip, order ID, provider
  and time) so it can be sent to a chat.

### 6.2 What the panel shows

The body lays the order out in five clearly-labelled sections:

| **Section**      | **What it contains**                                                                                                                                                |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Order Summary    | Direction (side, quantity, symbol, order type and time-in-force), the status, and — for a filled order — the fill price and fill quantity (and commission, if any). |
| Our Reference    | The trade-report reference, the platform’s own order reference, the provider’s order ID, and who or what submitted it.                                              |
| Routing          | The account, route, exchange and instrument identifier the order went through.                                                                                      |
| Lifecycle Timing | When the order was sent, when it filled (or, for a failure, when it was escalated), and the round-trip time between the two.                                        |
| Time             | The full transaction timestamp, in UTC.                                                                                                                             |

For an order that has not filled, the Order Summary explains why in
plain terms instead of showing a fill: a pending order notes it is
awaiting confirmation; a failed order notes the provider did not confirm
in time and a cancel was sent; a rejected order notes the provider
rejected it; and an errored order notes an internal problem. In these
cases the Lifecycle Timing section shows an "Escalated" time in place of
a fill time.

The panel footer repeats the trade-report reference and the provider,
for quick copying.

## 7. The Analytics Charts

Below the blotter is a strip of four charts covering today’s activity.
They respect the provider filter. A bar in the middle collapses the
strip ("Collapse Charts") or brings it back ("Expand Charts") so it
needn’t take up space.

### 7.1 Latency Over Time

A line of round-trip times through the day, for the most recent fills.
It shows whether responses are steady, drifting slower, or spiking —
useful for spotting a provider slowing down in real time.

### 7.2 Latency by LP

A horizontal bar per provider showing its fastest, average and slowest
round-trip for the day (Min, Avg, Max), so you can compare providers at
a glance.

### 7.3 Orders by Status

A donut breaking today’s orders into Filled, Pending and Cancelled
(which groups failed, rejected and similar outcomes), with a legend,
counts, and the total.

### 7.4 Volume by Symbol

A bar chart of filled quantity by instrument for the day, showing the
busiest symbols (the top handful), so you can see where the flow is
concentrated.

## 8. Understanding an Order’s Lifecycle

Reading a row from left to right follows the life of an order. The
platform sends the order ("NOS Sent"); the provider works it and, when
done, confirms the fill ("TE Filled"); the difference between those two
times is the round-trip ("RT"), the single best measure of how
responsive the provider was. The LP Status says how it ended — filled,
partially filled, still pending, or one of the failure states. The
detail panel then lays all of this out in full, with the references
needed to trace the exact order end to end.

Because every order is recorded with its references and precise times,
the page doubles as an audit trail: any execution can be confirmed, any
delay measured, and any rejection investigated after the fact.

## 9. Quick Reference

### 9.1 Order types

| **Code** | **Meaning**                                                         |
|----------|---------------------------------------------------------------------|
| MKT      | Market — fill at the best available price now.                      |
| LMT      | Limit — fill only at a set price or better.                         |
| STP      | Stop — becomes a market order once a trigger price is reached.      |
| STPLMT   | Stop-Limit — becomes a limit order once a trigger price is reached. |

### 9.2 Time-in-force

| **Code** | **Meaning**                                                             |
|----------|-------------------------------------------------------------------------|
| DAY      | Expires at the end of the trading day.                                  |
| GTC      | Good-til-Cancelled — stays live until filled or cancelled.              |
| IOC      | Immediate-or-Cancel — fill what can be filled at once, cancel the rest. |
| FOK      | Fill-or-Kill — fill the whole order at once or cancel it entirely.      |
| GTD      | Good-til-Date — stays live until a set date.                            |

### 9.3 Colour conventions

| **Where**           | **Teal**     | **Amber / Red**             |
|---------------------|--------------|-----------------------------|
| Side                | BUY          | SELL (amber)                |
| Long / Short counts | Long         | Short (amber)               |
| Best / Worst RT     | Best (green) | Worst (red)                 |
| Round-trip bands    | Fast (green) | Slower (amber) / Slow (red) |

## 10. Connection States and Live Behaviour

The page is live throughout; orders, fills and metrics update as they
happen. While the feed is establishing, the blotter shows "Connecting to
FIX Bridge"; if it drops and comes back it shows "Reconnecting"; if it
stays down it shows "Connection lost" with a Reconnect option. When
connected but no orders have arrived yet, it shows "Waiting for orders",
explaining that rows will appear as the platform submits them to a
provider.

There are no position-changing controls on this page — it is purely for
monitoring, confirming and investigating executions — so it is safe for
anyone to use as a live view.

*End of guide.*
