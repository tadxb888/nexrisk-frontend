---
id: ref-lp-admin-states
title: "Liquidity Providers — session and health states"
type: reference
domain: execution
module: lp_admin
minLevel: VIEW
route: /liquidity-providers
source:
  - "FIX Bridge API Documentation (SESSION_STATE_CHANGE; session lifecycle)"
  - "Hedging Manager API v1.3 §9 (LP Connectivity Status)"
  - "LiquidityProviders.tsx"
related: [ref-hedge-strat-states, ref-exec-report-states]
tags: [lp, fix, session, connectivity, health, route-sanity]
status: reviewed
version: exec-v1
---

## LP session state {#session}

The operational state of a liquidity provider connection: **CONNECTED** — FIX
session up with heartbeats on time; **CONNECTING** — establishing the session;
**DISCONNECTED** — session down; **DEGRADED** — session up but metrics are out
of range; **QUARANTINED** — isolated after repeated failures so no orders route
to it; **STOPPED** — administratively taken out of service; **SESSION_ERROR** —
a protocol/session-level error.

## FIX login lifecycle {#fix-login}

The FIX handshake progression: **DISCONNECTED** → **CONNECTING** → **LOGGED_ON**
(logon accepted, session live); **RECONNECTING** — re-establishing after a drop;
**SESSION_ERROR** — logon or sequence error.

## LP health {#health}

A rolled-up health verdict independent of the raw session state: **HEALTHY**,
**DEGRADED**, **UNHEALTHY**, or **UNKNOWN** (no recent data to judge).

## Route sanity check result {#pass-fail}

A route-sanity probe returns **PASS** (the LP is within latency, uptime, and
rejection thresholds) or **FAIL** (a threshold is breached), which is what drives
a strategy's breach action.
