---
id: ref-hedge-strat-states
title: "Hedging Strategies — states and controls"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source:
  - "Hedging Manager API v1.3 §9 (Enum Reference)"
  - "Hedging Rule Engine Schema §1-6, §11"
  - "HedgingStrategies.tsx"
related: [ref-lp-admin-states, gls-a-book, con-book-model]
tags: [hedge, strategy, status, trigger, escalation, failover, recovery]
status: reviewed
version: exec-v1
---

## Strategy status {#status}

A strategy (rule) is in one of three lifecycle states: **ACTIVE** — live, fires
on matching positions; **PAUSED** — suspended, no hedges sent, auto-resumes on
LP recovery; **STOPPED** — disabled, requires an explicit operator Activate to
restart.

## Activation type — when a strategy fires {#activation}

**ALWAYS** — always live. **SCHEDULE** — active only within a UTC day/time
window. **NEWS_EVENT** — active from a set number of minutes before to after a
news release. **PNL_TRIGGER** — activates when a P&L threshold is crossed.
**MANUAL** — becomes active only by explicit operator action, never
automatically.

## Guard condition basis {#condition}

The guard clause that must pass before a hedge is sent, evaluated against
hot-cached P&L: **NONE** — no guard, fires unconditionally; **SYMBOL_REALIZED**
— realized P&L for the matched symbol; **SYMBOL_COMBINED** — realized plus
unrealized for the symbol; **OVERALL_REALIZED** — realized across all positions;
**OVERALL_COMBINED** — realized plus unrealized across all positions.

## Trader-archetype targeting {#archetypes}

A strategy can target trader behaviour classes: **EA** (automated bot),
**SCALPER**, **ARBITRAGE**, **NEWS_TRADER**, **NORMAL** (ordinary retail), and
**REBATE_ABUSER** (rebate-abuse pattern). Empty = all.

## Routing status {#routing}

The live routing state of a strategy's LP: **HEALTHY** — within thresholds;
**BREACHED** — a route-sanity threshold breach was detected; **FAILOVER_ACTIVE**
— routing to the fallback LP; **RECOVERY_HOLD** — the original LP recovered and
the hold period is in progress before restoring.

## Breach action {#breach}

What happens when route sanity breaches: **PAUSE_RULE** — the strategy suspends
and auto-resumes on recovery; **STOP_RULE** — the strategy stops and needs an
explicit Activate; **FALLBACK_LP** — orders reroute to the fallback LP.

## Recovery policy and restore target {#recovery}

After failover, recovery policy governs the return: **AUTO_RESTORE** — route
back to the original LP immediately on recovery; **HOLD_THEN_RESTORE** — wait a
hold period plus stability confirmations first; **MANUAL_ONLY** — never
auto-restores. The restore target is either **ORIGINAL_LP** (return to primary)
or **STAY_ON_FALLBACK** (remain on fallback even after the primary recovers).

## Final fallback action {#final-fallback}

When every LP is exhausted: **B_BOOK** — the broker accepts the market risk
silently, no alert; **REJECT** — the position is left unhedged, no alert;
**REJECT_NOTIFY** — left unhedged with an escalation alert to the Risk Manager
(the default, safest for regulated brokers).

## Escalation reasons {#escalation}

An escalated hedge carries the reason it needs operator action:
**TIMEOUT_ESCALATED** — no fill within the confirm timeout; **REJECTED_ESCALATED**
— the LP rejected the order; **NORMALIZER_ERROR** — symbol mapping failed or all
LPs were exhausted, so the order was never sent.

## Scheduled-action lifecycle {#scheduled}

A scheduled or news-driven action moves through **SCHEDULED** (queued for its
window), **RELEASED** (its window fired), and **CANCELLED** (cancelled before
firing).
