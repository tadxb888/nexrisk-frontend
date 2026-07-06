---
id: task-hedge-strategies
title: "Hedging Strategies — how a strategy works and how to build one"
type: task
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source:
  - "NexRisk Hedging Manager API v1.3 (strategy layers, create-rule fields, LP routing decision tree, escalation actions, evaluation flow, conflict detection)"
  - "NexRisk Hedging Rule Engine Schema (rule identity, activation, filters, guard, recovery)"
related: [ref-hedge-strat-states, ref-hedge-strat-form, ref-lp-admin-states, ref-route-sanity-fields, ref-abook-ledger]
tags: [hedging, strategy, rule, create, guard, escalation, failover, fallback, workflow]
status: reviewed
version: exec-v2
---

## What a strategy is {#what}

A hedging strategy (rule) decides how a client position gets routed to a liquidity
provider. Rules are evaluated **per incoming position, in priority order** (lower
priority number = evaluated first), and the first matching rule that passes its
checks sends the hedge. A full strategy is four layers: identity and filters
(who/what/when/how much/which LP), route sanity and fallback (LP health
thresholds and what to do when they breach), escalation triage (operator actions
on stuck hedges), and audit (the hedge record history).

## How a position flows through a rule {#flow}

For each new position, the engine walks each ACTIVE rule by priority and checks,
in order: is the rule ACTIVE; is its activation window open (schedule / news /
P&L trigger); does the source filter match (server, group, login, classification,
cluster); does the instrument filter match (symbol, direction); does the guard
clause pass (a single P&L check); does route sanity pass. If all pass, it sends a
hedge for `position.volume × hedge_volume_pct / 100` to the active LP.

## Building a strategy {#build}

Create a rule and set:

- **Name / priority** — a display name and precedence. Priority must be unique
  among non-STOPPED rules; a collision returns a 409.
- **Activation** — `ALWAYS`, `SCHEDULE` (UTC day bitmask + time window),
  `NEWS_EVENT` (minutes before/after a release), `PNL_TRIGGER` (symbol or overall
  P&L crossing a threshold), or `MANUAL` (only activates by operator action).
- **Source filter** — MT5 servers, groups, login IDs, trader classifications
  (`EA`, `SCALPER`, `ARBITRAGE`, `NEWS_TRADER`, `NORMAL`, `REBATE_ABUSER`), and
  HDBSCAN cluster IDs. Empty = match all. This is what makes the classification
  and clustering engines actionable in hedging.
- **Instrument filter** — symbols and direction (`LONG` / `SHORT` / `BOTH`).
- **Hedge execution** — `hedge_volume_pct` (uncapped; over 100% is intentional
  over-hedging as a directional strategy), the primary LP, an optional LP
  sub-account, and `hedge_confirm_timeout_ms` (default 5000ms before a fill
  times out and escalates).
- **Guard condition** — the P&L test that must pass before hedging: `NONE`
  (unconditional), or symbol/overall × realized/unrealized/combined, compared
  (`LT`/`GT`/`LTE`/`GTE`) against a threshold. Example: only hedge when overall
  combined P&L is worse than −$5,000.

Creating, editing, activating, pausing, or stopping a rule reloads the engine
immediately — no restart.

## LP routing, breach, and fallback {#routing}

Route sanity is the second layer. Before sending, the engine checks the LP's
health against thresholds. If the primary LP is healthy, the hedge goes there. If
it breaches, the rule's **breach action** fires: `PAUSE_RULE` (suspend, auto-
resume on recovery), `STOP_RULE` (stop until an operator re-activates), or
`FALLBACK_LP` (reroute to a fallback LP). If the fallback is also unhealthy, the
**final fallback action** decides the disposition: `B_BOOK` (accept the risk
silently), `REJECT` (leave unhedged, no alert), or `REJECT_NOTIFY` (leave
unhedged and alert the Risk Manager — the default and safest for regulated
brokers).

After failover, the **recovery policy** governs the return: `AUTO_RESTORE`
(immediately), `HOLD_THEN_RESTORE` (wait a hold period plus stability
confirmations, which prevents LP flapping), or `MANUAL_ONLY`. The restore target
is `ORIGINAL_LP` or `STAY_ON_FALLBACK`.

## Escalations — acting on stuck hedges {#escalations}

When a hedge can't complete it escalates with a reason: `TIMEOUT_ESCALATED` (no
fill in the timeout), `REJECTED_ESCALATED` (LP rejected it), or `NORMALIZER_ERROR`
(symbol mapping failed or all LPs were exhausted, so nothing was sent). Each
strategy surfaces its own escalations (filtered by rule), and the nav bar shows a
global unacknowledged count. Operator actions per escalated position: **Retry**
(resend), **Force-close** (send a close order — disabled when `lp_position_id` is
null, because there's no LP position to close), **B-Book** (accept the risk), and
**Acknowledge** (clear it from the queue).

## Conflicting strategies {#conflicts}

Two ACTIVE rules conflict when they share a value in symbols, groups, trader
classifications, or logins — or when either leaves that field empty (empty =
matches all). Overlaps are flagged inline on the affected rows; since evaluation
is priority-ordered and first-match-wins, an overly broad high-priority rule can
shadow a more specific one below it.
