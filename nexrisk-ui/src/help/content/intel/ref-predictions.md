---
id: ref-predictions
title: "Predictions — operating guide"
type: reference
domain: intel
module: predictions
minLevel: VIEW
route: /predictions
order: 6
source:
  - "Predictions_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [predictions, nexday, gopredict, forecast, momentum, reversal, co-trending, opportunity, intraday, daily]
status: reviewed
version: intel-v3
---

## 1. About This Document

The Predictions page brings an external market-forecasting feed into the
platform: the NexDay Risk Analytics platform, provided by Forsa LTD.
NexDay produces short-horizon predictions for tradable instruments, and
Taiga turns those into simple trading signals that appear against your
symbols on the Net Exposure page — telling the risk desk, at a glance,
where a favourable move (an opportunity) or an adverse one (a hedge) is
predicted.

There is one firm rule before any of this works: each of your broker’s
MT5 symbols must first be **mapped** to its NexDay equivalent on the
Predictions page. Until a symbol is mapped, no prediction or signal is
available for it. This document explains that mapping prerequisite in
full, and then explains the signals themselves — what they are, how they
are formed, and how to read them.

## 2. What the Predictions Are — the Intra-Day Monitor

NexDay is a market-analytics service that forecasts where an
instrument’s price is likely to go over the near term. Taiga takes its
**intra-day** forecasts and monitors them continuously. Predictions are
produced for four horizons, and each prediction is valid for the period
it covers:

| **Horizon** | **A prediction for…** | **Valid for**        |
|-------------|-----------------------|----------------------|
| 15 min      | the next 15 minutes   | the 15-minute period |
| 30 min      | the next 30 minutes   | the 30-minute period |
| 1 hour      | the next hour         | the 1-hour period    |
| 2 hours     | the next two hours    | the 2-hour period    |

So at any moment a mapped symbol has up to four live forecasts running
in parallel — a very short-term one and progressively longer ones. Each
forecast is refreshed as its period rolls forward, so the monitor always
reflects the latest view for each horizon. (NexDay also produces a
longer daily forecast; this document focuses on the intra-day monitor
and its signals, which is what feeds the Net Exposure page.)

## 3. The Prerequisite: Mapping MT5 Symbols to NexDay

### 3.1 Why mapping is needed

Your broker names its instruments in its own MT5 convention — "EURUSD",
perhaps, or "EURUSD.r", "XAUUSD#", and so on. NexDay names the same
instruments in **its** convention. The two do not automatically match,
so the platform cannot know which NexDay forecast belongs to which of
your symbols unless you tell it. The **mapping** is exactly that
instruction: "**this MT5 symbol corresponds to that NexDay symbol**."

### 3.2 How the mapping works

On the Predictions page, each broker MT5 symbol you want forecasts for
is paired with its NexDay symbol. From then on, whenever the platform
needs a prediction or a signal for that MT5 symbol, it looks up the
mapping, finds the matching NexDay symbol, and fetches that symbol’s
forecasts. The pairing is one-to-one: one MT5 symbol to one NexDay
symbol.

### 3.3 What happens without a mapping

An unmapped symbol simply has **no signal**. On the Net Exposure page it
is shown as **not mapped**, and no opportunity or hedge indicator
appears for it — not because there is nothing to say, but because the
platform has not been told which NexDay instrument to consult. Mapping
the symbol is what switches its signal on.

|                                                                                                                                                                                                                                                                                                      |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **No mapping, no signal.** This is the single most important thing to understand about the page. A blank or "not mapped" signal on Net Exposure almost always means the symbol has not been mapped yet — the fix is to add the mapping on the Predictions page, not to look for a fault in the feed. |

### 3.4 The other prerequisites

For a mapped symbol to actually show a live signal, three things all
need to be true:

- **The NexDay feed is connected and syncing.** Taiga pulls NexDay’s
  forecasts on a schedule; the page reports the sync health (see Section
  6). If the feed is down or degraded, signals will be stale or absent.

- **The symbol is mapped.** The MT5-to-NexDay pairing exists (Section
  3.2).

- **NexDay actually forecasts that instrument.** The mapped NexDay
  symbol must be one NexDay produces predictions for — if NexDay does
  not cover it, there is nothing to map to and no signal to show.

## 4. What an Intra-Day Prediction Contains

Each intra-day forecast (per symbol, per horizon) is more than a single
up/down call. It carries a set of predicted values for the period ahead:

| **Field**                                           | **What it is**                                                      |
|-----------------------------------------------------|---------------------------------------------------------------------|
| Predicted high / low / close                        | The expected high, low and closing price over the horizon.          |
| Two-bars-ahead high / low / close                   | The same, projected a further bar ahead.                            |
| Trend                                               | The predicted direction of the move.                                |
| Strength                                            | How strong the predicted move is — the magnitude behind the signal. |
| Momentum                                            | The predicted momentum of the move.                                 |
| Predicted range, midpoint, quartiles, trading range | The expected price band and where within it the move is centred.    |
| High / low touched                                  | Whether the predicted extremes are expected to be reached.          |

Of these, the two that drive the Net Exposure signal are the **trend**
(which way) and the **strength** (how strongly). The rest give a fuller
picture when you open a symbol’s detail.

## 5. The Signals — on the Net Exposure Page

The signal is the compact, actionable form of all this. On the Net
Exposure page, each mapped symbol carries a small signal tag that tells
the risk desk, in a couple of characters, what NexDay predicts and over
what horizon.

### 5.1 What a signal looks like

A signal reads like "**Opp@30m**" or "**Hdg@1h**". It has two parts: a
**type** — Opportunity or Hedge — and the **horizon** at which the
prediction is strongest (15m, 30m, 1h or 2h).

| **Signal type**    | **Means**                                                                                  | **For the broker**                                                         |
|--------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| Opportunity (Opp@) | A favourable directional move is predicted — the forecast leans in a profitable direction. | A chance to benefit from, or comfortably hold, exposure in that direction. |
| Hedge (Hdg@)       | An adverse move is predicted — the forecast leans against the position.                    | A prompt to consider hedging or reducing the exposure before the move.     |

### 5.2 How the signal is formed

Behind that short tag, the platform does a simple, transparent thing for
each mapped symbol:

1.  It reads all four intra-day predictions (15m / 30m / 1h / 2h) for
    the mapped NexDay symbol.

2.  It picks the horizon where the predicted move is **strongest** —
    that is the "@" horizon shown.

3.  It sets the type from the direction: a favourable/positive move
    becomes an **Opportunity**; an adverse/negative one becomes a
    **Hedge**.

4.  It carries the **strength** (the magnitude) and, where available, a
    **conviction** level from NexDay’s opportunity read, so you can see
    not just the direction but how pronounced it is.

A signal only surfaces when the prediction is meaningful — a move too
weak to matter does not raise a tag, so the column stays quiet unless
there is something worth noting. The signal you see is therefore always
the **strongest, most relevant** of the four horizons for that symbol at
that moment.

### 5.3 Reading a signal — examples

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Opp@15m</strong> — a favourable move is predicted,
strongest over the next 15 minutes. A short-fuse opportunity; act within
the quarter-hour or it lapses.</p>
<p><strong>Hdg@2h</strong> — an adverse move is predicted over the next
two hours. A slower-developing warning; there is time to arrange a hedge
on that exposure.</p>
<p><strong>(blank / not mapped)</strong> — either no strong prediction
right now, or (more often) the symbol has not been mapped. Check the
mapping first.</p></td>
</tr>
</tbody>
</table>

### 5.4 The horizon matters as much as the type

The "@" horizon is not decoration — it tells you **how quickly** the
prediction plays out and therefore how fast you must act. An **Opp@15m**
is a fleeting, act-now signal valid only for the next fifteen minutes; a
**Hdg@2h** unfolds over two hours and can be handled deliberately.
Always read the type and the horizon together.

## 6. Validity, Freshness and Feed Health

Each prediction is valid only for its own period: a 15-minute forecast
speaks to the next 15 minutes and no longer; a 2-hour forecast to the
next two hours. As each period rolls forward, the forecast is refreshed,
so a signal is a **live, time-boxed** view — never a standing
recommendation. Once a horizon has elapsed, its prediction is spent.

Because the forecasts come from an external feed, the platform tracks
the **sync health** of that feed — whether the latest data has been
pulled successfully, how many records synced, and when the last sync
happened. The overall health reads **ok**, **pending**, or **degraded**.
If it is degraded, the signals on Net Exposure may be stale or missing,
and that is a feed issue to resolve rather than a mapping one. It is
worth a glance at the feed status before relying on a signal in fast
markets.

## 7. How to Use It — From Mapping to Action

End to end, the feature is used in four steps:

5.  **Map your symbols.** On the Predictions page, pair each MT5 symbol
    you care about with its NexDay symbol. This is the one-time setup
    that switches signals on.

6.  **Confirm the feed is healthy.** Check the sync status reads ok, so
    the forecasts are current.

7.  **Watch the signals on Net Exposure.** Each mapped symbol shows its
    strongest signal — Opp@ or Hdg@ with a horizon — alongside your net
    exposure for that symbol.

8.  **Act within the horizon.** Treat an Opportunity as a favourable
    lean to hold or benefit from, and a Hedge as a prompt to protect the
    exposure — and move at the pace the horizon implies (a 15-minute
    signal now; a 2-hour signal soon).

Placing the signal next to net exposure is the whole point: it lets the
desk see, per symbol, both what it is exposed to and what is predicted
to happen — and decide whether the two are aligned.

## 8. A Note on Daily Predictions

Alongside the intra-day monitor, NexDay also supplies a longer daily
forecast for each mapped symbol — predicted open, high, low and close
for the day, a predicted trend and strength, an expected trading range,
and even a two-day-ahead projection, with the actuals filled in
afterwards so accuracy can be reviewed. It uses the same mapping (map
once, and both intra-day and daily forecasts follow). The daily view is
the strategic backdrop; the intra-day signals are the tactical, act-now
layer that this document has focused on.

## 9. Quick Reference

### 9.1 Signal cheat-sheet

Opp@ = Opportunity (favourable move predicted) · Hdg@ = Hedge (adverse
move predicted)

@15m / @30m / @1h / @2h = the horizon at which the prediction is
strongest (and how fast to act).

### 9.2 Glossary

| **Term**             | **Plain meaning**                                                                             |
|----------------------|-----------------------------------------------------------------------------------------------|
| NexDay               | The external market-prediction platform (Forsa LTD) that supplies the forecasts.              |
| Mapping              | The pairing of a broker MT5 symbol to its NexDay symbol — required before any signal appears. |
| Intra-day prediction | A short-horizon forecast (15m / 30m / 1h / 2h), each valid for its own period.                |
| Trend                | The predicted direction of the move.                                                          |
| Strength             | The magnitude of the predicted move — what makes a signal strong or weak.                     |
| Conviction           | How pronounced NexDay judges the opportunity to be.                                           |
| Signal               | The compact Opp@/Hdg@ tag shown per symbol on Net Exposure.                                   |
| Opportunity (Opp@)   | A favourable predicted move — hold or benefit.                                                |
| Hedge (Hdg@)         | An adverse predicted move — consider hedging.                                                 |
| Sync health          | Whether the NexDay feed is current (ok / pending / degraded).                                 |

### 9.3 The four horizons

15 min · 30 min · 1 hour · 2 hours — each a live forecast valid for that
period, refreshed as it rolls forward.

*End of document.*
