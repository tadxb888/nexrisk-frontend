---
id: task-price-rules
title: "Price Rules — feeds, spread rules, and how repricing works"
type: task
domain: execution
module: price_rules
minLevel: VIEW
route: /price-rules
source:
  - "Price Rules Engine API Reference (feeds, spread rules, news, group spreads, feed stats)"
  - "Price Feed & Spread Management Architecture Reference (repricing pipeline, ATR model + tiers, throttle, SpreadDiff)"
related: [ref-price-rules-states, ref-price-rules-controls, ref-symbol-mapping-controls]
tags: [price-rules, feed, spread, repricing, atr, volatility, news, group-spread, throttle]
status: reviewed
version: exec-v2
---

## What the page controls {#what}

Price Rules governs how each incoming LP price tick is repriced before MT5 (and
the client) sees it. It has three surfaces: **Feed Management** (the LP-to-MT5
price pipeline and its defaults), **Spread Rules** (conditional per-feed
repricing), and **Group Spreads** (per-MT5-group markup). After any write the C++
service reloads config and resets ATR state — no restart needed.

## How a tick gets repriced {#pipeline}

On every LP tick the service walks a fixed chain and stops at the first match:
(1) is the feed's availability window open (ALWAYS / SCHEDULE / MANUAL) — else
drop; (2) map the LP symbol to its MT5 symbol — a miss drops the tick and
increments `symbol_misses`; (3) throttle — if less than the min interval has
passed, drop and increment `ticks_throttled`; (4) update the ATR volatility
ratio; (5) check whether news is active; (6) walk the feed's **spread rules** by
priority (lowest first, first match wins); (7) else a per-symbol repricing
override; (8) else the feed's global repricing default; (9) else deliver the raw
LP price. So a spread rule only applies if nothing higher in the chain already
handled the tick.

## Feeds {#feeds}

A feed config defines the source LP, destination MT5 server, repricing defaults,
throttle, and ATR periods. Status is `ACTIVE` / `PAUSED` / `STOPPED`. **Throttle**
(when enabled) publishes at most one tick per symbol every
`throttle_min_interval_ms` — presets 20 ms (LP native) or 100 ms (NexRisk
default); suppressed ticks aren't lost, the next one after the interval is
delivered. **Reload** forces the service to re-read the feed config, reset ATR
warm-up, and refresh the news cache — use it after a restart or if settings look
out of sync.

## Reading feed health {#stats}

The feed stats are the pipeline's health check. **Ticks Delivered / Dropped /
Throttled** show throughput; a non-zero **Symbol Misses** means the Symbol
Mapping table is missing entries — fix it on the Symbol Mapping page or that
symbol's prices never reach MT5 and its hedges can't dispatch. **Vol Tracked** is
how many symbols have an active ATR baseline (grows normally over time).
Throttled being non-zero is normal when throttle is on.

## Spread rules {#spread-rules}

A spread rule is a priority-ordered conditional repricing on a feed, scoped to a
symbol (and optionally groups/logins). **Condition type**: `ALWAYS` (whenever the
feed is active), `SCHEDULE` (UTC day + time window), `VOLATILITY` (ATR ratio in a
`[min, max)` band), or `NEWS` (during a scheduled event window). **Repricing
method** is `FIXED_PIPS` (a fixed bid/ask offset) or `PERCENTAGE_OF_SPREAD`
(offset proportional to the current spread). Positive widens, negative tightens.
Rules are enabled/disabled without deleting and can be reordered by priority.

## Volatility (ATR) tiers {#atr}

The ATR ratio is a fast/slow EMA of mid-price movement — level-independent. It
reads `1.0` (neutral) during warm-up until enough ticks arrive (slow period,
default 200), so VOLATILITY rules won't fire on a fresh symbol or right after a
restart. Suggested tiers: below 0.8 quiet (tighten, VIP offer); 0.8–1.2 normal
(no rule); 1.2–2.0 elevated (moderate widen); 2.0–2.5 high (aggressive widen);
above 2.5 extreme (maximum widen / restrict).

## Group spreads {#group-spreads}

MT5 delivers one price stream to all clients, so per-group differentiation is done
with MT5's native `SpreadDiff` — it adds N points to the floating LP spread before
that group's terminals see it. Setting a group spread saves it and applies it to
MT5 immediately; resetting returns the group's symbol to floating. A **sync**
re-applies all stored rules to MT5 at once.
