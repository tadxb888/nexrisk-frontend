---
id: ref-hedge-strat-form
title: "Hedging Strategies — strategy form fields"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source:
  - "Hedging Manager API v1.3 §3 (Create Rule fields), §9 (enums)"
  - "HedgingStrategies.tsx"
related: [ref-hedge-strat-states, ref-lp-admin-states]
tags: [hedge, strategy, form, scope, volume, guard, escalation]
status: reviewed
version: exec-v1
---

## Identity and scope {#identity}

**Strategy name** and a description of intent. **Scope (groups/logins/cohorts)**
restricts which client flow the strategy applies to — MT5 groups, specific
logins, or trader cohorts (**Cohort Targeting**). Empty scope = all.

## Execution {#execution}

**Primary LP** — where hedges route. **Hedge volume %** — how much of the client
position to hedge (over 100% = over-hedge). **LP account ID (optional)** — an LP
sub-account.

## Guard condition {#guard}

The guard that must pass before hedging, with a **Guard threshold**: options are
**None (fires unconditionally)**, **Symbol — Realized P&L**, **Symbol — Combined
P&L**, **Overall — Realized P&L**, or **Overall — Combined P&L**.

## Escalations and recovery {#escalations}

**Escalations** control failover behaviour: **Notify on breach**, **Notify on
recovery**, and the recovery choice — **Auto-restore immediately**, **Hold then
restore**, or **Stay on fallback**. The final unhedged disposition includes
**Reject + Notify**.
