---
id: ref-predictions
title: "Predictions (NexDay) — reading the forecast page"
type: reference
domain: intel
module: predictions
minLevel: VIEW
route: /predictions
source:
  - "cockpitHelp.ts cards 7/8/9 (NexDay daily outlook, intraday co-trending, best opportunities — predicted_strength, momentum states, reversal windows, tier reference)"
  - "Settings API nexday section (daily ~17:01 ET, intraday polling interval, mapped-symbol scope)"
related: [ref-cockpit, ref-nexday-signals, task-profiler, ref-symbol-mapping-controls]
tags: [predictions, nexday, gopredict, forecast, momentum, reversal, co-trending, opportunity, intraday, daily]
status: reviewed
version: intel-v2
---

## What the page shows {#what}

Predictions surfaces the NexDay (GoPredict) model — a daily directional outlook, a
live intraday signal set, and ranked trade opportunities. The **daily** view
refreshes once a day around 17:01 ET (Sun–Thu); the **intraday** view polls on a
short interval (configurable, 5–60 min). Most views are scoped to **mapped symbols**
— the broker-tradeable set — so a symbol has to have a NexDay mapping to appear.

## Daily outlook {#daily}

The daily read highlights the **top predicted loser** (the mapped symbol with the
most negative predicted move — a hedging/stop candidate if you hold B-Book there),
**developing opportunities** (symbols that reversed direction 1–3 days ago with
momentum confirming the new direction — an early-trend head start), and **momentum
shifts** (symbols whose momentum is transitional — Tilting Up/Down or Reversed —
before the model has flipped its predicted trend; a pre-confirmation watchlist).
`predicted_strength` is a model output, not a percentage — the displayed % is a
sanity-checkable proxy from predicted-close vs typical price.

## Intraday co-trending {#intraday}

The intraday signals count symbols where **all four timeframes (15m/30m/1h/2h)
agree**: **Up Co-Trending** (all four positive) and **Down Co-Trending** (all four
negative) are the strongest collective calls the model produces. A symbol the
model is uncertain on (trend = 0) is counted in neither. Intraday co-trending spans
the whole NexDay universe (~90 symbols), matching GoPredict's own UI, so its
counts are broader than the mapped-only views. Watch the "last update" freshness —
beyond ~30 minutes during market hours the pipeline is behind and the signals
shouldn't be acted on until it catches up.

## Best opportunities {#opportunities}

Ranked trade ideas for mapped symbols, tiered by conviction × opportunity: tier 1
Prime:In-Play + Strong (the hottest), 2 + Sustained, 3 + Qualified, 4 Strong
(non-Prime), 5 Sustained (non-Prime). The **top opportunity** is the single
best-ranked idea; the **hottest** set is the top three tiers (should be a small,
focused list); the **strong tier** is the act-on layer below. The list churns day
to day — a tier-1 name today can drop tomorrow — and `None today` is a real result,
meaning no strong recommendation for our universe.

## A note on trading {#note}

These are model outputs to inform a decision, not instructions. The page tells you
what NexDay predicts and how confident it is; whether and how to act on it against
live exposure is the desk's call.
