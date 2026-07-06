---
id: task-route-sanity
title: "Route Sanity — LP health thresholds that guard hedging"
type: task
domain: execution
module: route_sanity
minLevel: VIEW
route: /route-sanity
source:
  - "NexRisk Hedging Manager API v1.3 Section 4 (route_sanity_config fields, per-rule vs global, breach action, recovery policy)"
  - "Hedging Rule Engine Schema (lp_health metrics, routing state machine, connectivity status)"
related: [task-hedge-strategies, task-lp-management, ref-route-sanity-fields, ref-lp-admin-states]
tags: [route-sanity, lp-health, latency, fill-rate, reject-rate, slippage, breach, fallback, recovery]
status: reviewed
version: exec-v2
---

## What Route Sanity does {#what}

Route Sanity is the health gate that decides whether an LP is fit to hedge
through. It continuously watches each LP's connectivity and quality metrics, and
when they fall outside the configured thresholds it triggers a breach action —
pausing, stopping, or failing over — so hedges don't keep routing to a degraded
LP.

## What's monitored {#metrics}

Per LP, over a rolling window (default 60s): **latency** (order round-trip),
**fill rate**, **reject rate**, **slippage** (average pips), and the FIX
**heartbeat**. Connectivity is `CONNECTED` (session up, heartbeats on time),
`DEGRADED` (up but metrics out of range), or `DISCONNECTED` (session down).

## Thresholds {#thresholds}

You set the ceilings/floors: max latency, min fill rate, max reject rate, max
slippage, heartbeat timeout, and the rolling window. Any threshold left unset
isn't enforced. Config comes in two tiers — a **per-rule** config for a specific
strategy, and a **global default** that any rule without its own config inherits;
the engine checks per-rule first, then the global default for that LP.

## Breach and recovery {#breach-recovery}

On breach the **breach action** fires: `PAUSE_RULE` (suspend, auto-resume on
recovery), `STOP_RULE` (stop until an operator restarts), or `FALLBACK_LP`
(reroute to a named fallback, which then runs against its own thresholds). When the
LP recovers, the **recovery policy** decides the return: `AUTO_RESTORE`
(immediately), `HOLD_THEN_RESTORE` (wait a hold period and require N consecutive
healthy checks — this is what prevents flapping on intermittent links), or
`MANUAL_ONLY`. The restore target is the original LP or stay-on-fallback. If every
option is exhausted, the **final fallback** applies: `B_BOOK`, `REJECT`, or
`REJECT_NOTIFY` (default). Breach and recovery can each raise a notification.

## The routing state machine {#states}

A route moves **HEALTHY → BREACHED** on a threshold breach, then to **PAUSED**,
**STOPPED**, or **FAILOVER_ACTIVE** depending on the breach action. From
FAILOVER_ACTIVE, an original-LP recovery goes straight back to HEALTHY under
AUTO_RESTORE, into **RECOVERY_HOLD** under HOLD_THEN_RESTORE (then HEALTHY once the
hold clears and stability is confirmed, or back to FAILOVER_ACTIVE if stability is
lost), or stays on fallback under MANUAL_ONLY until an operator acts.
