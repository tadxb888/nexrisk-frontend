---
id: ref-lp-fix-config
title: "Liquidity Provider — FIX configuration fields"
type: reference
domain: execution
module: lp_admin
minLevel: VIEW
route: /liquidity-providers
source:
  - "NexRisk FIX Bridge LP Administration"
  - "FIX Bridge API Documentation (provider types, session config, logon fields)"
  - "LiquidityProviders.tsx"
related: [ref-lp-admin-states, ref-exec-report-states]
tags: [lp, fix, session, sendercompid, targetcompid, market-data, config]
status: reviewed
version: exec-v1
---

## Basic Info {#basic}

**Display Name** — the human label for the LP. **Provider Type** — the LP
integration used, one of **TraderEvolution**, **LMAX**, or **CMC**, which
determines the FIX dialect and any provider-specific logon fields. **Canonical**
/ **Description** — the internal identifier and notes.

## Trading Session {#trading}

The FIX session that places orders. **SenderCompID** — your identifier on the
session; **TargetCompID** — the LP's identifier. **FIX Version** — the FIX
protocol version (e.g. 4.4). Host/port and **Default TIF** (the time-in-force
applied when none is specified) are set here. **Security Exchange** — the
exchange/venue tag sent on orders.

## Market Data Session {#md}

Some providers use a separate session for prices. **MD Host** / **MD Port** —
where the market-data session connects; **MD SenderCompID** / **MD TargetCompID**
— the identifiers for that session; **MD Depth** — how many book levels to
subscribe to. A provider using a single combined session shows **Single session**
instead.

## Credentials and actions {#actions}

FIX password, and for CMC the **CMC username** and **Brand code**, are entered
under credentials (write-only — never shown back). **Configuration** and
**Instruments** tabs show the session config and the instruments the LP offers.
**Delete LP Configuration** removes the LP. A connectivity test reports whether
the FIX session logs on.
