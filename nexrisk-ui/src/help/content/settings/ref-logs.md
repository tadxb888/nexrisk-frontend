---
id: ref-logs
title: "Logs — the operational and audit trail"
type: reference
domain: settings
module: logs
minLevel: VIEW
route: /logs
source:
  - "LP Administration + FIX Bridge audit log (action/actor/details/timestamp entries; credentials never logged in cleartext; incident export)"
  - "FIX Bridge API (per-order FIX message log, session log, EXPORT_INCIDENT bundle)"
related: [ref-log-viewer, ref-rbac, task-execution-report, ref-secret-rotation]
tags: [logs, audit, actions, actor, timestamp, fix-messages, incident, compliance]
status: reviewed
version: settings-v2
---

## What the page shows {#what}

Logs is the operational and audit trail — a record of what happened on the
platform and who did it. Administrative actions are captured automatically, each
as an entry with an **action**, the **actor** who did it, a **details** payload of
what changed, and a **timestamp**. Read-only by nature; it's a record, not a
control surface.

## Reading an entry {#entry}

Typical actions include configuration create/update/delete, credential updates,
connection tests, and reloads. The details show the specifics — for an update, the
fields that changed with their old and new values; for a connection test, the
result and latencies. **Credentials are never written in cleartext** — a password
change records that the field changed, never the value.

## FIX and order history {#fix}

For execution troubleshooting, the platform keeps the FIX message history. An
order's full lifecycle can be pulled by its client order id — the outbound
NewOrderSingle and every ExecutionReport back — indexed so cancel/replace chains
stay linked. Session-level messages (logon, logout, heartbeat) are kept separately
for connectivity diagnostics.

## Incident export {#incident}

When something needs investigating or a compliance record, an **incident export**
bundles the FIX logs, event logs, and a state snapshot for a chosen time window
into one package (with an incident id) — the artifact to hand to support or keep
for audit.

## Where related logs live {#related}

This is the app-wide trail. The FIX bridge's own log verbosity, audit capture, and
retention are configured on the Settings → FIX bridge page, and per-LP
administrative history also appears in that LP's own audit tab.
