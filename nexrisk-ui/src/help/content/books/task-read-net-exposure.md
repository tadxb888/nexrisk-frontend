---
id: task-read-net-exposure
title: "Net Exposure — operating guide"
type: task
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "Net_Exposure_Guide.docx — operating guide (screen-by-screen manual, ingested verbatim)"
related: []
tags: [net-exposure,residual-risk,hedge-ratio,orphan,naked,broker-pnl,coverage]
status: reviewed
version: exec-v3
---

## 1. About This Guide

This guide explains the Net Exposure page in full, for risk managers and
dealers who use it day to day. It avoids technical language and walks
through every part of the page — the summary card, the filters, the
exposure grid and its columns, the three per-symbol hedge metrics, the
intraday prediction monitor, and the built-in trading tool — in the
order you meet them on screen. It also spells out exactly what happens
when you click a row.

**Who does what.** Everyone can view exposure, health and predictions.
The built-in trading tool (the DOM Trader) is available only to users
with trading permission; for everyone else the page is a live, read-only
monitor and the trading panel is hidden.

**A note on wording.** Where the page shows a short tag — a status flag,
a colour, a badge — this guide quotes it exactly and then explains what
it means.

## 2. What the Net Exposure Page Does

Net Exposure is the single place to see how much market risk the broker
is actually carrying right now, symbol by symbol, once client flow and
hedges are netted against each other. It brings together two sides of
every instrument:

- **The house side (B-Book).** Client trades kept in-house, shown from
  the broker’s perspective — that is, the opposite side to the client.

- **The hedge side (Coverage).** The offsetting positions the broker
  holds at a liquidity provider — combining hedges sent by strategies,
  manual dealer trades and any DOM Trader orders into one net figure per
  symbol.

When a symbol is fully hedged, these two sides are equal in size and
opposite in direction, so they cancel and the symbol’s net exposure
reads zero. Where they do not cancel, the leftover is the broker’s real
directional risk — and that is what this page is built to surface.

Everything on the page is live. Prices, profit and loss, and the netting
all update continuously as the market moves; there is no refresh button
to press.

**The three books, in brief.** The B-Book is client flow kept in-house.
Coverage (the A-Book) is the broker’s hedge held at a liquidity
provider. The C-Book is manual dealer coverage. This page nets the house
side against the hedge side to show the residual risk on each
instrument.

## 3. How the Page Is Laid Out

The page has four areas:

- **Summary card (top).** The "Overall Net Exposure" card — headline
  totals for positions, volumes, profit and loss, and hedge coverage.

- **Filter bar.** The MT5 node selector, a Lots / Notional switch, and
  Expand All / Collapse All controls.

- **Exposure grid (centre).** The main table: one row per symbol, which
  opens to show its house and hedge legs, with live prices, profit and
  loss, and the hedge metrics.

- **Intraday Monitor (below the grid).** Short-term price predictions
  for whichever symbol you have selected.

- **DOM Trader (right, on demand).** A market-depth and order-entry
  panel for placing hedges at a liquidity provider. It opens when you
  click a hedge row, or from its own tab.

## 4. The Summary Card (Overall Net Exposure)

The card along the top gives the whole-book picture at a glance, grouped
into four clusters. All figures respond to the node filter and to the
Lots / Notional switch.

### 4.1 Position counts

- **Positions.** The total number of open positions across both the
  house and hedge sides.

- **Long / Short.** How many of those positions are long (teal) versus
  short (amber), from the broker’s perspective.

### 4.2 Volumes

Three honest numbers that answer different questions:

- **B-Book Vol.** House inventory — how much the broker is warehousing
  in-house.

- **Coverage Vol.** Hedge exposure at the liquidity provider — what has
  been pushed out. This includes orphan hedges (see Section 6).

- **Net Exposure.** The residual directional risk after the house and
  hedge sides net out symbol by symbol. A perfect hedge reads zero;
  orphan and naked positions add their full size.

### 4.3 Profit and loss

- **Float P/L.** Open (unrealised) profit and loss across both sides, in
  the broker’s favour when green and against when red.

- **Net P/L.** Float P/L adjusted for swap and commission on both sides.

- **Realised P/L.** Profit and loss already banked today. The hedge side
  comes from the day’s official figures; the house side is a running
  estimate carried through the day until the closed-trade figures are
  finalised.

### 4.4 Hedged Ratio

A single portfolio-health number: the share of house exposure that is
covered by an opposite-direction hedge, added up across all symbols.
100% means every in-house lot has a matching hedge lot on the other
side. It is coloured green at or above 95%, amber from 80% to 95%, and
red below 80%. A dash appears when there is no in-house exposure to
measure against. The per-symbol breakdown behind this number is the
Hedge Ratio column in the grid.

## 5. The Filter Bar

### 5.1 MT5 Node

The MT5 node selector chooses which trading server’s house flow is
shown. Strategies and exposure always centre on the Master server, so
the Master node is the option here and is selected automatically.
Choosing it filters the house side of the grid and the summary card to
that server.

### 5.2 Lots / Notional switch

This switch changes how every volume figure is expressed — both in the
summary card and in the grid’s Net Vol column.

- **Lots** — the position size in standard lots.

- **Notional** — the size in units of the underlying instrument (for
  example ounces for gold, or base-currency units for a currency pair),
  not a cash value. Large counts are abbreviated with K (thousands) and
  M (millions) in the grid.

### 5.3 Expand All / Collapse All

These open or close every symbol group at once, so you can either see
all the house and hedge legs together or keep the grid to one row per
symbol.

## 6. The Exposure Grid

### 6.1 How rows are grouped

The grid groups by instrument. Each symbol is a parent row, and the
number in brackets after the name (for example "EURUSD (2)") is how many
detail rows sit underneath it. Expanding a symbol reveals its legs:

- **A house leg** — labelled with a B-Book provider name (for example
  "B-Book-Ross Weiler") on an "Internal" account, shown in teal.

- **A hedge leg** — labelled with a Coverage provider name (for example
  "Coverage-TraderEvolution") on the provider account, shown in amber.

The parent row shows the netted totals of its legs. Because the two legs
of a fully hedged symbol are equal and opposite, the parent’s Net Vol
nets toward zero when the symbol is well hedged.

**Direction (sign) convention.** Net Vol is shown from the broker’s
point of view. A positive, teal figure is a broker-long position; a
negative, amber figure is a broker-short position. The house leg is the
opposite of the client’s direction; the hedge leg is the broker’s actual
direction at the provider.

### 6.2 The columns

| **Column**         | **What it shows**                                                                                           |
|--------------------|-------------------------------------------------------------------------------------------------------------|
| Symbol             | The instrument. On the parent row it names the group; on a detail row it shows that leg’s own venue symbol. |
| Liquidity Provider | The book and provider for the leg — teal for the house (B-Book) side, amber for the hedge (Coverage) side.  |
| Account            | The account the leg sits on — "Internal" for house flow, or the provider account for hedges.                |
| Net Vol.           | The net position size for the row, in lots or notional. Teal = broker long, amber = broker short.           |
| Break-Even Px      | The average break-even price of the position.                                                               |
| Mkt Px             | The live close-out market price for the net position — the price at which it would close right now.         |
| Broker P/L         | The live open profit or loss for the row, in dollars. Green = profit, red = loss.                           |

Three further columns — Hedge Ratio, Hedge Impact and Status — describe
the hedge health of the whole symbol, so they appear only on the parent
(symbol) row. A fourth, Signal, appears on hedge legs. Each is covered
below.

### 6.3 Hedge Ratio

The Hedge Ratio measures how well a symbol’s in-house exposure is
covered by its hedge. It is the hedge size divided by the house size, so
100% means the hedge exactly matches the book. Below 100% the broker is
still exposed in the book’s direction (under-hedged); above 100% there
is more hedge than book (over-hedged), which creates exposure on the
provider side instead. The colour flags both kinds of mismatch:

| **Reading**               | **Colour** | **Meaning**                                                               |
|---------------------------|------------|---------------------------------------------------------------------------|
| 95% – 105%                | Green      | Effectively matched.                                                      |
| 80% – 94%, or 106% – 120% | Amber      | Slightly off — mild under- or over-hedge.                                 |
| Anything further out      | Red        | A significant mismatch worth attention.                                   |
| — (dash)                  | Grey       | No in-house position to measure against (a hedge with no book behind it). |

### 6.4 Hedge Impact

Where Hedge Ratio asks "how well matched is the size?", Hedge Impact
answers "is my hedge actually helping right now?" It reads the live
profit and loss on each side and reports one of four states. It appears
only on symbols that have both a house and a hedge leg (Matched, Partial
or Over), and stays blank when the book is sitting near break-even, so a
nearly-flat position never shows a misleading flag.

| **Badge**     | **House side** | **Hedge side** | **What it means**                                                                |
|---------------|----------------|----------------|----------------------------------------------------------------------------------|
| BONUS         | Winning        | Winning        | Both sides are in profit — the hedge is aligned with the move. The best case.    |
| HEDGE WORKING | Losing         | Winning        | The book is losing but the hedge is offsetting it — exactly what hedging is for. |
| HEDGE DRAG    | Winning        | Losing         | The book is winning and the hedge is eating into it — the cost of insurance.     |
| DOUBLE LOSS   | Losing         | Losing         | Both sides are losing — the hedge is misaligned. A red flag.                     |
| — (dash)      | —              | —              | The book is near flat, or one side has no meaningful profit or loss to judge.    |

### 6.5 Status

Status is the at-a-glance coverage state of the symbol. It appears on
the parent (symbol) row.

| **Status** | **Meaning**                                                                                               |
|------------|-----------------------------------------------------------------------------------------------------------|
| ✓ MATCHED  | House and hedge are equal and opposite — the symbol is fully hedged.                                      |
| PARTIAL    | The hedge is smaller than the book — the broker is still net-exposed in the book’s direction.             |
| OVER       | The hedge is larger than the book — more coverage than needed, creating exposure on the provider side.    |
| ORPHAN     | A hedge is open with no house position behind it — typically the client closed but the hedge is still on. |
| NAKED      | A house position with no hedge at all — directional risk is fully open.                                   |
| WRONG-WAY  | A house and a hedge leg both point the same way — the "hedge" is doubling the risk, not offsetting it.    |
| FLAT       | Nothing open on either side for this symbol.                                                              |

The colours are shared with Hedge Impact: green for Matched, amber for
Partial and Over, and red for the three risk states (Orphan, Naked,
Wrong-Way).

### 6.6 Signal

The Signal column shows a short-term directional read from the
prediction engine, and appears on hedge (Coverage) rows only — house
rows show a dash. When the signal points the same way as the hedge it is
shown in teal; when it points against the hedge it is shown in amber;
anything else is neutral grey. Treat it as a supporting hint rather than
an instruction.

## 7. Selecting Rows — What Happens

Clicking a row does two things at once: it drives the Intraday Monitor
to that symbol, and — depending on the kind of row — it either opens or
disables the DOM Trader.

### 7.1 Selecting a Coverage (hedge) row

Clicking a hedge row opens the DOM Trader panel and points it at that
symbol, ready to trade. The order quantity is pre-filled from the size
of the hedge position, so you can quickly add to, trim or offset it at
the provider. This is the click-to-trade path.

### 7.2 Selecting a B-Book (house) row

Clicking a house row deliberately **disables** the DOM Trader. The panel
is greyed out, its header shows a "B-BOOK — DISABLED" tag, and the Buy
and Sell buttons are switched off. This is a safety design: house
positions are kept in-house and do not route to a liquidity provider, so
placing a provider order against a house row would be a mistake. House
rows are also styled with a teal edge and are not clickable as trade
targets.

### 7.3 Any selection drives the Intraday Monitor

Whichever row you click — house, hedge, or the symbol parent — the
Intraday Monitor below the grid switches to that instrument and loads
its latest predictions. The selected symbol is shown as a small teal tag
next to the monitor title.

### 7.4 Clicking a symbol (parent) row

Clicking a symbol row expands or collapses its legs and also points the
Intraday Monitor at that symbol. It does not open the DOM Trader,
because a parent row is not itself a tradeable leg.

## 8. The Intraday Monitor

The Intraday Monitor sits below the grid and shows short-term price
predictions for the selected symbol across four horizons — 15 Minutes,
30 Minutes, 1 Hour and 2 Hours. Each horizon shows the window it covers
and three figures:

- **pHigh** — the predicted high for the window.

- **pTrend** — the predicted direction: Up (teal), Down (red) or Neutral
  (grey).

- **pLow** — the predicted low for the window.

A "Target" time (in US Eastern time) shows when the prediction is aimed
at, alongside the current time. The panel has three other states: it
shows "Loading predictions…" while fetching; "Select an instrument to
view prediction data" when nothing is selected; and, if the chosen
symbol has no prediction mapping set up, a note that there is no mapping
for it, pointing you to configure one in Settings.

## 9. The DOM Trader (Market Depth) Panel

The DOM Trader is the built-in tool for placing hedges directly at a
liquidity provider. It shows the live order book and lets you send
orders. It is available only to users with trading permission; without
it, the panel is hidden and the rest of the page still works as a
monitor.

### 9.1 Opening and closing

By default the panel is collapsed to a slim rail on the right edge
labelled "DOM Trader". Click the rail to open it, or click a hedge row
in the grid to open it automatically on that symbol. A chevron in the
panel header collapses it back to the rail. Your order details and log
are kept while it is closed, so nothing is lost when you re-open it.

### 9.2 Choosing the liquidity provider

The "LP" selector at the top picks which provider to trade with. A
coloured dot and a status word (for example "Connected") show the
provider’s live link, and the panel also shows the trading and
market-data session states when available. Changing provider clears the
current symbol and book.

### 9.3 Choosing the symbol

The "SYM" selector picks the instrument. Opening it gives a search box
and a list of the provider’s tradeable instruments with their group and
currency. Clicking a hedge row in the grid sets this automatically.

### 9.4 Best Bid, Spread and Best Ask

Directly below, three figures show the live top of book: the Best Bid
(teal), the Spread, and the Best Ask (red). The sensitive last digits of
each price are enlarged so they are easy to read at a glance. A small
badge — LIVE, STALE, SYNC, WAIT, or similar — reports the health of the
market-data feed.

### 9.5 The order book

A five-level order book shows the resting sizes and prices on each side
— bids (teal) on the left, asks (red) on the right — with a shaded bar
behind each size giving a quick sense of relative depth.

### 9.6 Placing an order

The order-entry section has:

- **Order type** — for example Market, Limit or Stop, from the types the
  provider supports.

- **Time-in-force** — how long the order stays live (for example GTC,
  "good ’til cancelled").

- **QTY** — the order size. Pre-filled from the hedge position when you
  arrive via a row click.

- **PRICE** — shown only for Limit and Stop orders, to set the working
  price.

- **BUY (teal) and SELL (amber)** — send the order.

Buy and Sell are only active when the provider is connected, a symbol is
chosen, a quantity is set, no order is already in flight, and a house
row is not selected. If a house row is selected, both buttons stay
disabled, in line with the safety rule in Section 7.

### 9.7 The Order Log

The Order Log at the foot of the panel lists the orders you have sent
this session, each with its side, symbol, quantity, a live status (Sent,
or an error), the order reference, and the time and type. A rejected
order shows its reason in red. A "clear" control empties the log.

## 10. Quick Reference

### 10.1 Colour conventions

| **Where**          | **Teal**           | **Amber**            | **Green / Red**            |
|--------------------|--------------------|----------------------|----------------------------|
| Net Vol            | Broker long        | Broker short         | —                          |
| Broker P/L         | —                  | —                    | Green = profit, Red = loss |
| Liquidity Provider | House (B-Book) leg | Hedge (Coverage) leg | —                          |
| Long / Short count | Long               | Short                | —                          |

### 10.2 Status at a glance

| **Status** | **Risk read**                           | **Colour** |
|------------|-----------------------------------------|------------|
| ✓ MATCHED  | Fully hedged                            | Green      |
| PARTIAL    | Under-hedged — still exposed            | Amber      |
| OVER       | Over-hedged — exposure on provider side | Amber      |
| ORPHAN     | Hedge with no book behind it            | Red        |
| NAKED      | Book with no hedge — open risk          | Red        |
| WRONG-WAY  | Hedge doubling the risk                 | Red        |
| FLAT       | Nothing open                            | Grey       |

### 10.3 Hedge Impact at a glance

| **Badge**     | **Reading**                                            |
|---------------|--------------------------------------------------------|
| BONUS         | Both sides winning — hedge aligned with the move.      |
| HEDGE WORKING | Book losing, hedge offsetting — hedging doing its job. |
| HEDGE DRAG    | Book winning, hedge costing — the price of insurance.  |
| DOUBLE LOSS   | Both sides losing — hedge misaligned. A red flag.      |
| —             | Near flat, or no meaningful reading yet.               |

## 11. Permissions and Live Behaviour

The whole page is live: prices, profit and loss, the netting, and every
metric update continuously as the market moves, with no manual refresh.
The exposure figures re-net on every price change, so a symbol can move
between Matched, Partial and the other states in real time as the market
and the book shift.

Trading is gated by permission. Users with trading rights see and can
use the DOM Trader; users without it see the same live exposure, metrics
and predictions, but the trading panel is hidden and the page acts as a
read-only monitor. The house-row safety rule — no provider trading
against in-house positions — applies to everyone.

*End of guide.*
