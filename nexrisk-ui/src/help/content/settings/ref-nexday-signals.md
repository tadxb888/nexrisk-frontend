---
id: ref-nexday-signals
title: "NexDay signals — what they mean"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source:
  - "GoPredict (NexDay) README (daily predictions; intraday forecasts 15m/30m/1h/2h; Tradebook strategies)"
  - "GoPredict client fields (Pred High/Low/Close, Trend Dir, Entry Min/Max, Strength, Target Date/Time, hit rates)"
  - "Tech-lead: NexDay = GoPredict; Taiga ingests its signals to assist hedging"
related: [ref-nexday, ref-predictions, ref-cockpit]
tags: [nexday, gopredict, prediction, forecast, opportunity, trend]
status: reviewed
version: settings-v1
---

## Where NexDay signals come from {#source}

NexDay (the GoPredict platform) forecasts market levels and surfaces trade
opportunities per symbol. Taiga ingests three kinds of signal — a daily outlook,
intraday forecasts, and best opportunities — to inform hedging.

## Daily Outlook {#daily}

The day-ahead forecast for a symbol: a **predicted High**, **Low**, and
**Close**, plus a **Trend direction**. Accuracy is reported as hit rates — the
share of recent days the predicted high, low, and trend were correct — so you can
judge how much to trust the signal.

## Intraday Signals {#intraday}

The same predicted high/low levels over shorter horizons — **15min**, **30min**,
**1hour**, and **2hour** — for near-term positioning.

## Best Opportunities {#opportunities}

Trade setups from NexDay's Tradebook. Each opportunity gives an **entry zone**
(**Entry Min** to **Entry Max**), a **Strength** score indicating conviction, and
a **Target Date/Time** for the expected move, for the named **Symbol** and
timeframe.

## How Taiga uses them {#use}

With the integration enabled and Auto-suggest hedges on, these signals can prompt
hedging suggestions — e.g. pre-hedging ahead of a predicted directional move.
They are decision support for the risk manager, not automatic execution.
