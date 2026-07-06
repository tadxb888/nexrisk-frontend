---
id: ref-mt5-servers
title: "MT5 Servers — nodes, roles, and the master"
type: reference
domain: settings
module: mt5_servers
minLevel: VIEW
route: /mt5-servers
source:
  - "Alerts Bar / FX Cells doc (mt5/nodes: node_type, connection_status, is_enabled, node symbols)"
  - "System Health WebSocket API (master node identity + connected state, failover name change)"
related: [ref-network-cluster, ref-system-health, ref-gateway, task-lp-management]
tags: [mt5, nodes, master, standby, connection-status, node-management, symbols]
status: reviewed
version: settings-v2
---

## What the page manages {#what}

MT5 Servers lists the MT5 nodes Taiga connects to and their live connection state.
Each node has a name, a **role** (`MASTER`, `STANDBY`, `BACKUP`, `CLIENT`, or
`PARTNER`), an enabled flag, and a **connection status** (`CONNECTED`,
`DISCONNECTED`, or `ERROR`). Only enabled, connected nodes are usable as live
sources elsewhere in the app (for example the FX cells picker and source
selectors).

## The master {#master}

Exactly one node is the bound **master** — the connector the platform reads
positions and time from, and the one the system-health bar names. When a failover
or promotion happens, the master changes and the name updates within a second;
that name change is the "master switched" signal across the app. A node's role is
distinct from whether it's currently the live master: STANDBY/BACKUP nodes exist so
one can be promoted.

## Node symbols {#symbols}

Each node exposes its own symbol catalogue (with description, digits, and contract
size). Those catalogues are what source-scoped features draw from — e.g. an FX cell
bound to a node lists that node's symbols, and the same symbol from two different
nodes is treated as two distinct sources.

## Reading status {#status}

`CONNECTED` is healthy; `DISCONNECTED` means the session is down (the node stays in
the list so you can see which one dropped); `ERROR` flags a connector problem worth
investigating. A disabled node is intentionally offline and won't appear as a
source. Because master liveness drives B-Book operations, a master node dropping
here shows up immediately on the system-health bar as well.
