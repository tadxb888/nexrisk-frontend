---
id: task-reports
title: "Reports — LP volume: dimensions, periods, and how to read it"
type: task
domain: reports
module: reports
minLevel: VIEW
route: /reports
source:
  - "LP Volume Report API (group_by dimensions, periods, filters, row/total fields, CSV, period-boundary subtlety, empty state)"
related: [ref-reports-columns, ref-reports-catalog, con-book-model, gls-a-book]
tags: [reports, lp-volume, group-by, notional, billable, csv, asset-class, period]
status: reviewed
version: reports-v2
---

## What the report shows {#what}

The LP Volume report is LP-confirmed billable volume — one underlying row per LP
fill, aggregated on demand. It answers "how much volume did we do, sliced how I
want it": per symbol, per asset class, per LP, per MT5 node, per day, per
direction, or any combination. It covers **A-Book and C-Book only** — B-Book never
appears here by design, because B-Book isn't hedged out to an LP.

## Choosing the slice (group by) {#group-by}

Pick one or more dimensions to group by: **lp**, **node**, **book** (A or C),
**symbol**, **asset_class**, **direction**, **day**. The order you pick them sets
the column order. Combining them nests the result — e.g. group by lp + symbol
gives one row per LP-and-symbol pair. Grouping by symbol automatically adds the
symbol's asset class and contract size, since those are one-to-one with the
symbol.

## Period and filters {#period}

Choose a period: **Today**, **MTD**, **Last Month**, or **Custom** (with from/to
UTC dates, inclusive of the end day). Optional filters narrow to a single LP,
node, book, symbol, or asset class. For Today and MTD the data is live — poll to
refresh; Last Month and Custom are closed periods and don't change.

## Reading the columns {#columns}

**Volume (lots)** is volume in MT5 lot units. **Volume notional** (`lots ×
contract_size`) is the primary, **billable** figure — it's what billing runs on,
so it's the number to lead with. **Deal count** is how many fills rolled into the
row. **Contract size** and **Asset class** come from the MT5 master at fill time
(asset class may be null → shown as "Unclassified"). **Direction** is LONG or
SHORT. **First/last fill** bound the time window of the aggregated fills. Rows sort
by notional descending, and the totals strip sums lots, notional, and deal count
across all rows.

## Exporting {#csv}

Any view can be downloaded as CSV (RFC 4180, same column order as the on-screen
table). The CSV is meant for the downstream billing pipeline — apply "$X per N
units" rules there. An empty result is a normal `200` with zero totals, not an
error — it just means no fills matched.

## One subtlety to know {#boundary}

The period's end (`to`) is **exclusive** internally — Today runs from
`00:00Z` to the next `00:00Z`. The screen shows the inclusive day (e.g. "13 May
2026"), so don't be thrown if the raw window looks like it ends a day later.
