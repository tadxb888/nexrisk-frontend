---
id: ref-calendar
title: "Economic Calendar — events, importance, and how they drive rules"
type: reference
domain: intel
module: predictions
minLevel: VIEW
route: /predictions
source:
  - "Economic Calendar Event Picker Frontend Integration Guide (calendar/events fields, importance, consensus/forecast mapping, NEWS_EVENT + NEWS wiring, auto time revision)"
  - "Economic Calendar Notifications (NEWS_IMMINENT / NEWS_RELEASED on the alerts bar)"
related: [task-hedge-strategies, task-price-rules, ref-alerts-bar, ref-predictions]
tags: [calendar, economic-calendar, news-event, importance, consensus, forecast, nfp, trading-economics]
status: reviewed
version: intel-v2
---

## What it is {#what}

The Economic Calendar is a Trading Economics feed of ~1,100 scheduled events over a
rolling 16-day window (2 days back, 14 ahead), refreshed roughly every 90 seconds.
It's both a reference and the picker that drives two rule types: news-timed hedging
and news-timed spread widening.

## Reading an event {#fields}

Each event has a time (UTC), country, event name, and **importance** — 1 low (★),
2 medium (★★), 3 high (★★★). It carries **Previous** (prior period), **Consensus**
(the market survey average), **Forecast** (Trading Economics' own model), and
**Actual** once released (null until then). Status is SCHEDULED, RELEASED, or
CANCELLED. One naming subtlety: the page's **Consensus** column is TE's `Forecast`
field (survey average) and the page's **Forecast** column is TE's `TEForecast`
field (TE's model) — they're intentionally mapped that way.

## Filtering {#filter}

Filter by date range, importance (e.g. high-impact only), country, category, and
status. For rule pickers the sensible defaults are high-impact only over the next
one-to-two weeks, with a free-text search on the event name.

## Driving a hedging strategy (NEWS_EVENT) {#news-event}

On the Hedging Strategies page, `NEWS_EVENT` activation uses this picker: select an
event and the rule activates a set number of minutes **before** the release and
deactivates a number of minutes **after**. The rule stores the event's stable
calendar id, so if Trading Economics revises the release time (say NFP moves 30
minutes), the window follows automatically — nothing to update by hand.

## Driving a spread rule (NEWS) {#news-condition}

On the Price Rules page, a spread rule with the `NEWS` condition links to a calendar
event the same way, optionally scoped to a specific symbol, with pre/post-minute
window defaults (5/10). During the window the rule's repricing applies.

## Notifications {#notifications}

Medium- and high-impact events also push to the Alerts Bar: **NEWS_IMMINENT** when
an event is 5–15 minutes out, and **NEWS_RELEASED** the moment the actual value
lands. Both carry the same fields as the calendar row, so a click can deep-link
back to the event. Numeric values arrive as strings with units (e.g. "178K",
"2.3%") and should be shown as-is.
