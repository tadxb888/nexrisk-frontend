---
id: ref-mt5-nodes
title: "MT5 Servers — node roles and connection"
type: reference
domain: settings
module: mt5_servers
minLevel: VIEW
route: /mt5-servers
source:
  - "NodeManagement.tsx (node role + connection state, promote tooltip)"
  - "NexRisk System Health WebSocket API"
related: [ref-lp-admin-states]
tags: [mt5, node, master, standby, cluster, connection]
status: reviewed
version: settings-v1
---

## Node role {#role}

Each MT5 node has a cluster role: **MASTER** — the active primary the platform
reads and writes through; **STANDBY** — a hot standby ready to take over (on
promotion the current MASTER becomes STANDBY); **BACKUP** — a backup node;
**CLIENT** — a client-facing trade node; **PARTNER** — a partner/white-label
node.

## Connection state {#connection}

A node's live connection is **CONNECTED**, **CONNECTING**, **RECONNECTING** (re-
establishing after a drop), **DISCONNECTED**, or **ERROR**.
