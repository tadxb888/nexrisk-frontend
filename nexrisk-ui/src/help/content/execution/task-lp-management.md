---
id: task-lp-management
title: "Liquidity Providers — adding, connecting, and managing LPs"
type: task
domain: execution
module: lp_admin
minLevel: VIEW
route: /liquidity-providers
source:
  - "NexRisk FIX Bridge LP Administration API v1.0 (config CRUD, credentials, connection test, reload, session control, health, state machine)"
  - "NexRisk Multi-LP Management Frontend Brief (add-LP workflow, provider-specific fields, state badges + allowed actions)"
related: [ref-lp-admin-states, ref-lp-fix-config, task-execution-report, task-hedge-strategies]
tags: [lp, liquidity-provider, fix, session, credentials, connect, quarantine, health, state-machine]
status: reviewed
version: exec-v2
---

## What the page does {#what}

The Liquidity Providers page manages the FIX connections Taiga hedges and prices
through. It's two layers: configuration (add/edit/remove an LP, set credentials,
test connectivity) and operation (start/stop, health, live status). You configure
an LP before you can start it.

## Adding an LP {#add}

The full workflow is: **create the config** (identity + FIX session details, but
it does not connect); **set credentials** (a separate step — see below); **test
connectivity** to verify the session logs on before going live; **enable** it; then
**start** it to connect. The `lp_id` is a lowercase slug (3–32 chars, starts with
a letter, unique) and — along with the provider type — is immutable after
creation; everything else can be edited.

## FIX session fields {#fields}

Common to all providers: trading **host/port**, **SenderCompID** (your identifier)
and **TargetCompID** (the LP's), **FIX version** (default 4.4), heartbeat and
reconnect intervals, and the password. Provider specifics: **TraderEvolution**
uses a **separate market-data session** (its own host/port/SenderCompID, target
usually `TEPRICE`, plus account, security exchange, and MD depth), while **LMAX**
uses a **single session** for trading and market data and typically requires SSL —
so the MD block is hidden for LMAX.

## Credentials {#credentials}

Credentials are set through their own endpoint, never through the config edit, so
a config change can't accidentally overwrite a password. They're write-only —
never returned — so the page shows a *status* (configured / not set) rather than
the value. Updating credentials on a running LP can be applied with a **reload**
rather than a full stop/start.

## The state machine {#states}

An LP is in one state, each with its own allowed actions: **DISCONNECTED /
STOPPED** (grey — Start, Edit, Delete), **CONNECTING** (amber — Stop), **CONNECTED**
(green — Stop, Quarantine), **DEGRADED** (orange — Stop, Health), **QUARANTINED**
(red — Resume, Stop), **SESSION_ERROR** (red — Stop, Health). Editing connection
params and deleting are only allowed when the LP is DISCONNECTED or STOPPED — you
can't rewire a live session.

## Reload, quarantine, and health {#ops}

**Reload** applies config/credential changes to a running LP with a graceful
logout → re-read config → logon, without cancelling active orders (they persist on
the LP). **Quarantine** isolates a connected LP so no orders route to it (Resume
brings it back). **Health** gives per-LP latency, uptime, error rates, and recent
issues beyond the basic session state. Deleting a connected LP stops it first, and
the config removal is recorded in the audit log (which is retained even after
deletion).
