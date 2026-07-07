---
id: task-coverage-dom
title: "Coverage Book — operating guide"
type: task
domain: operations
module: coverage
minLevel: VIEW
route: /coverage-book
order: 6
source:
  - "Coverage_Book_Guide.docx — operating guide (screen-by-screen manual, ingested verbatim)"
related: []
tags: [coverage,c-book,dom,manual-hedge,a-book,provider,account]
status: reviewed
version: exec-v3
---

## 1. About This Guide

This guide explains the Coverage Book page in full, for risk managers
and dealers who use it day to day. It avoids technical language and
walks through every part of the page — the summary cards, the
liquidity-provider and account row, the executions grid and its columns,
the trading tool, and the order-message panel — in the order you meet
them on screen. It pays special attention to two things: how selecting a
position lets you close it safely, and how every order you place is
logged.

**Who does what.** Everyone can view the book, the account figures and
the order history. The built-in trading tool (the DOM Trader) — used to
open new positions and to close existing ones — is available only to
users with trading permission; for everyone else the page is a live,
read-only view and the trading panel is hidden.

**A note on wording.** Where the page shows a short label or badge, this
guide quotes it exactly and then explains what it means.

## 2. What the Coverage Book Page Does

The Coverage Book is the single place to see every hedge and manual
position the broker holds at its liquidity providers, and to act on
them. It brings two kinds of execution into one view:

- **Automated executions (A-Book).** Hedges opened automatically by
  hedging strategies.

- **Manual executions (C-Book).** Positions opened by hand — through the
  LP Terminal or through this page’s own DOM Trader.

Together these make up the Coverage Book. From this page you can watch
each position’s live profit and loss, open new positions, and close
existing ones — all against a chosen liquidity provider.

Everything is live: prices, profit and loss, and the account figures
update continuously as the market and the book move; there is no refresh
button to press.

**The books, in brief.** The A-Book is automated hedging routed to a
provider. The C-Book is manual dealer coverage. The Coverage Book is the
two combined — the whole of what the broker is carrying on the provider
side.

## 3. How the Page Is Laid Out

The page stacks two summary rows above a working area:

- **Summary cards (top row).** Four cards — Strategy, A-Book, C-Book and
  Coverage — giving the headline totals.

- **Provider & account row.** The liquidity-provider selector, a
  local/UTC time switch, the provider account figures, and a Lots /
  Notional switch.

- **Executions grid (centre).** The list of every position and order,
  with live prices and profit and loss.

- **DOM Trader (right, on demand).** A market-depth and order-entry
  panel for opening new positions and for closing selected ones.

- **Order FIX Details (far right, on demand).** A running log of every
  order you send this session, and the detailed messages behind each
  one.

## 4. The Summary Cards

Four cards sit along the top. All figures respond to the Lots / Notional
switch, and the profit-and-loss figures are teal when in the broker’s
favour and red when against.

### 4.1 Strategy card

The Strategy card has a dropdown to pick one hedging strategy, and then
shows that strategy’s own numbers:

- **Strategy selector.** Choose which strategy to focus on. It is
  disabled when only one strategy is available. A strategy stays listed
  after its last position closes, so you can still see what it banked
  today.

- **Unrealized P/L.** Open profit or loss on that strategy’s live
  positions. Shows a dash when it has none open.

- **Realized P/L.** Profit or loss that strategy has already banked
  today. Shows a dash until it has closed something.

### 4.2 A-Book card

The A-Book card totals all automated hedge-strategy positions:

- **Positions** — the open count.

- **Long / Short** — how many are long (teal) versus short (amber).

- **Volume** — total size, in lots or notional.

- **Unrealized P/L** and **Realized P/L** — open and banked profit or
  loss for the automated side.

### 4.3 C-Book card

The C-Book card totals all manual executions — those opened through the
Terminal or the DOM Trader — with the same fields as the A-Book card
(Positions, Long / Short, Volume, Unrealized and Realized P/L).

### 4.4 Coverage card

The Coverage card is the whole book: A-Book plus C-Book combined. It
carries the same fields, and its Realized P/L reflects the provider’s
total banked profit and loss for the day. This is the card to read for
the complete picture.

## 5. The Provider & Account Row

### 5.1 View LP

The "View LP" selector chooses which liquidity provider’s book is shown
in the grid. Choosing "All LPs" shows every provider together, or you
can narrow to one. If a provider is not connected, its state is shown
next to its name. Changing provider clears any position you had selected
for closing.

### 5.2 Local Time / UTC

This button switches the times in the grid between your local time and
server (UTC) time. The Time column header updates to show which is in
use ("Time (Local)" or "Time (UTC)").

### 5.3 Account figures

When the selected provider reports them, a set of live account figures
appears:

| **Figure**                        | **What it shows**                                                                                                                       |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Balance                           | The account balance at the provider.                                                                                                    |
| Used Margin                       | Margin currently tied up in open positions.                                                                                             |
| Available Margin                  | Margin still free to open new positions.                                                                                                |
| Realized P/L                      | Profit or loss banked today (teal positive, red negative).                                                                              |
| Unrealized P/L                    | Open profit or loss across the live positions.                                                                                          |
| Commission                        | Commission charged today.                                                                                                               |
| Swap Long / Swap Short / Swap Net | Overnight financing. Where the provider does not split it by side, Swap Long and Swap Short show a dash and only Swap Net is populated. |

These figures come from the provider, so they appear only for providers
that report them. Until they arrive, the row shows "Awaiting account
data".

### 5.4 Lots / Notional

This switch, on the far right of the row, changes how every volume
figure is expressed — in the summary cards and in the grid — between
lots and notional (units of the instrument). The active side is
highlighted teal.

## 6. The Executions Grid

### 6.1 What each row is

The grid lists every position and order for the selected provider — both
open positions and the orders you have placed this session. Open
positions carry live prices and profit and loss; the count of rows (and
how many are selected) is shown along the bottom of the grid.

### 6.2 Filtering and columns

Above the grid is a filter bar: a free-text box with an "Apply" button
to filter the list, and a "Builder" button that opens a builder for
combining several conditions. A "Columns" tab on the right edge of the
grid opens a panel where you can show or hide columns. A few columns
(Account, Status and Comments) are hidden by default and can be switched
on there.

### 6.3 The columns

| **Column**                  | **What it shows**                                                                                                           |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Execution Type              | How the position was opened. Colour-coded: Terminal (yellow), DOM Trader (teal), and each hedging strategy by name (lilac). |
| Date                        | The execution date. The grid is sorted newest-first by this column by default.                                              |
| Time (Local / UTC)          | The execution time, in whichever time base the Local/UTC button is set to.                                                  |
| Symbol                      | The instrument.                                                                                                             |
| Position ID                 | The provider’s identifier for the position.                                                                                 |
| Side                        | BUY (teal) or SELL (amber).                                                                                                 |
| Volume                      | The size, in units.                                                                                                         |
| Fill Price                  | The price the position was opened at.                                                                                       |
| Cur. Price                  | The live close-out price for the position.                                                                                  |
| P/L                         | Live open profit or loss, in dollars — teal for a gain, red for a loss, with a + or − sign.                                 |
| S/L and T/P                 | The stop-loss and take-profit levels, where set.                                                                            |
| Account (hidden)            | The provider account the position sits on.                                                                                  |
| Status (hidden)             | Whether the row is an open position (● Open) or a filled order (○ Filled).                                                  |
| Comments (hidden, editable) | A free-text note you can type against a position; it is saved to that position.                                             |

Open positions are marked with a subtle teal edge. When you select a
position to close it, its row is highlighted in purple (see Section 7).

## 7. Closing a Position — Close Mode

This is the safe way to close a position, and it is designed so a dealer
cannot close it the wrong way by mistake.

### 7.1 Selecting a position enters Close Mode

Click any open position in the grid. The row highlights in purple, the
DOM Trader opens automatically pointed at that position’s symbol, and
its header shows a purple "CLOSE MODE" badge. A banner in the order area
confirms what you are closing — for example "Closing GBPUSD (pos …) ·
was BUY". The quantity is pre-filled from the position size.

### 7.2 Opposite-side-only — the safety rule

In Close Mode the two order buttons change to "← BUY (close)" and "SELL
(close) →", and **only the button that actually closes the position is
active**. A position that was bought can only be closed by selling, so
"SELL (close)" is enabled and "BUY (close)" is greyed out; a position
that was sold can only be closed by buying, so the reverse applies. The
system sends an opposite-direction order that offsets the position.
Because the wrong-direction button is disabled, a dealer cannot
accidentally add to the position while intending to close it.

If the provider reports a position as neutral (no side), both close
buttons are available, since either direction would be a valid close.

### 7.3 Full or partial close

The quantity field is pre-filled with the full position size, but you
can edit it down to close only part of the position. Leaving it at the
full size closes the position completely. A "Min" note shows the
smallest size the provider will accept.

### 7.4 After you close

When you send the close, the position is removed from the grid straight
away, and the order is written to the Order FIX Details log (Section 9).
The provider then confirms the fill.

### 7.5 Leaving Close Mode

Selecting a different position switches Close Mode to that one.
Deselecting the row (or switching provider) exits Close Mode and returns
the DOM Trader to placing new orders.

## 8. The DOM Trader (Market Depth) Panel

The DOM Trader is the tool for opening new positions at a provider (and,
in Close Mode, for closing them). It shows the live order book and the
order form. It is available only to users with trading permission.

### 8.1 Opening and closing the panel

By default it sits collapsed as a slim rail labelled "DOM Trader" on the
right. Click the rail to open it, or click a position in the grid to
open it automatically in Close Mode. A chevron in the header collapses
it again. Your order details survive while it is closed.

### 8.2 Provider and session status

The "LP" selector picks the provider to trade with; a coloured dot and
status word show its live connection, and the trading and market-data
session states are shown when available. A small badge (LIVE, STALE,
SYNC, WAIT and so on) reports the health of the price feed.

### 8.3 Symbol

The "SYM" selector picks the instrument, with a searchable list showing
each instrument’s group and currency. In Close Mode the symbol is set
for you from the selected position.

### 8.4 Best Bid, Spread and Best Ask

Three figures show the live top of book — Best Bid (teal), Spread, and
Best Ask (red) — with the sensitive last digits enlarged for
readability.

### 8.5 The order book

A five-level order book shows resting sizes and prices on each side,
bids (teal) on the left and asks (red) on the right, with a shaded bar
behind each size to convey relative depth.

### 8.6 The order form (opening a position)

For a new position the form offers:

- **Order type** — Market, Limit or Stop, from the types the provider
  supports.

- **Time-in-force** — how long the order stays live (for example GTC).

- **Price** — shown for Limit and Stop orders.

- **Quantity (Units)** — the order size, with the provider’s minimum
  shown beneath.

- **Stop Loss and Take Profit** — optional protective levels, where the
  provider supports them.

- **Comment** — an optional note (up to 50 characters) that stays with
  the position.

In Close Mode the type, time-in-force, protective-level and comment
fields are hidden — a close is always a market order — leaving just the
quantity and the two close buttons.

### 8.7 BUY and SELL

The teal BUY and amber SELL buttons send the order. For a new position
both are active once the provider is connected, a symbol is chosen and a
quantity is set. In Close Mode only the closing side is active, as
described in Section 7.

## 9. Order FIX Details (the Order Log)

This is the panel Ross highlighted: every order you place — whether
opening or closing — is recorded here the moment it is sent, and you can
drill into the exact messages exchanged with the provider.

### 9.1 Opening the panel

The panel appears on the far right; when collapsed it shows as a slim
"Order Execution" tab. Each order you send adds an entry automatically.

### 9.2 The order list

The list shows each order sent this session, newest first, with:

- **Side, symbol and quantity** — BUY (teal) or SELL (amber), the
  instrument, and the size.

- **Status** — "SENT" (teal) when accepted for routing, or "REJECTED"
  (red) with the reason shown beneath.

- **Order reference and details** — the order’s reference, and the time,
  provider and order type / time-in-force.

A "clear" control empties the list. When there are no orders yet, the
panel prompts you to select a provider or symbol, or shows "No orders
this session".

### 9.3 The message detail

Clicking an order opens its detail view, which lists the actual trading
messages exchanged with the provider for that order. Each message is
tagged as outgoing ("OUT", teal) or incoming ("IN", purple), named by
type, and timestamped, with its individual fields broken out line by
line. This is the authoritative record of exactly what was sent and what
the provider replied — useful for confirming a fill or investigating a
rejection. A "back" control returns to the list.

## 10. Quick Reference

### 10.1 The three books

| **Book** | **What it contains**                                            |
|----------|-----------------------------------------------------------------|
| A-Book   | Automated hedges opened by hedging strategies.                  |
| C-Book   | Manual positions opened through the Terminal or the DOM Trader. |
| Coverage | A-Book and C-Book combined — the whole provider-side book.      |

### 10.2 Execution-type colours

| **Execution type**      | **Colour** | **Meaning**                                 |
|-------------------------|------------|---------------------------------------------|
| Terminal                | Yellow     | Opened manually via the LP Terminal.        |
| DOM Trader              | Teal       | Opened manually via this page’s DOM Trader. |
| A hedging strategy name | Lilac      | Opened automatically by that strategy.      |

### 10.3 Colour conventions

| **Where**           | **Teal** | **Amber / Red** |
|---------------------|----------|-----------------|
| Side                | BUY      | SELL (amber)    |
| P/L                 | Gain     | Loss (red)      |
| Long / Short counts | Long     | Short (amber)   |
| Order status        | SENT     | REJECTED (red)  |

## 11. Permissions and Live Behaviour

The whole page is live: prices, profit and loss, and the account figures
update continuously, with no manual refresh.

Trading is gated by permission. Users with trading rights see and can
use the DOM Trader to open and close positions; users without it see the
same live book, account figures and order history, but the trading panel
is hidden and the page acts as a read-only view. The close-mode safety
rule — only the position-closing side can be sent — protects every
dealer who does have trading rights.

*End of guide.*
