---
id: ref-price-rules-states
title: "Price Rules Engine — conditions and modes"
type: reference
domain: execution
module: price_rules
minLevel: VIEW
route: /price-rules
source:
  - "Price Rules Engine API Reference (condition_type, repricing.method, ATR tiers)"
  - "Price Feed & Spread Management Architecture Reference (Spread Control Modes, condition types)"
  - "PriceRulesPage.tsx"
related: [ref-hedge-strat-states]
tags: [price-rules, spread, repricing, volatility, news, atr]
status: reviewed
version: exec-v1
---

## Rule status {#status}

A price/spread rule is **ACTIVE** (live), **PAUSED** (suspended), or **STOPPED**
(disabled).

## Condition type — when a spread rule applies {#condition}

**ALWAYS** — active whenever the feed is active; **SCHEDULE** — active within a
UTC day-of-week and time window; **VOLATILITY** — active when the ATR ratio
falls within a configured band; **NEWS** — active during a scheduled news-event
window.

## Repricing method {#method}

How the bid/ask adjustment is expressed: **FIXED_PIPS** — a fixed price offset;
**PERCENTAGE_OF_SPREAD** — an offset proportional to the current spread.

## Spread control mode {#spread-mode}

How a group-spread `value_points` markup is split across bid and ask:
**ASK_ONLY** — widen the ask only; **BID_ONLY** — widen the bid only;
**BOTH_SYMMETRIC** — widen both by the full amount (total spread widens by twice
the value); **FROM_MID** — split the value evenly around the mid (each side moves
half). Positive points widen (markup toward the client); negative points tighten.

## Scheduled-action lifecycle {#scheduled}

A scheduled or news-driven price action is **SCHEDULED** (queued), **RELEASED**
(its window fired), or **CANCELLED** (cancelled before firing).

## Columns {#columns}

**Feed** — the LP price feed the rule belongs to. **Priority** — evaluation
order; lower is evaluated first and the first match wins. **Condition** — the
condition type above. **Spread Mode** — the spread control mode. **Points** —
the magnitude in MT5 points. **Computed Offsets** — the resolved bid/ask offsets
applied to MT5. **MT5 Group** — the group the rule scopes to. **Enabled** —
toggles the rule without deleting it.
