---
id: ref-fix-bridge
title: "FIX bridge"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source: ["settings/FixBridgePage.tsx", "FIX Bridge API Documentation"]
related: [ref-lp-fix-config, ref-exec-report-states, ref-log-viewer]
tags: [fix, bridge, service, dom, capture]
status: reviewed
version: settings-v1
---

## What it is {#what}

The **FIX bridge** is the service that connects the platform to liquidity
providers over FIX for pricing and execution. This page shows its **Live status**
and **Service** health and lets you edit its **Configuration**.

## Diagnostics {#diag}

**Raw FIX capture** toggles recording of raw FIX messages for troubleshooting;
**Normalized DOM snapshots** captures the interpreted depth-of-market state.
**Recent changes** lists recent config edits.
