---
id: ref-mt5-config
title: "MT5 Servers — node, group, and symbol configuration"
type: reference
domain: settings
module: mt5_servers
minLevel: VIEW
route: /mt5-servers
source:
  - "NexRisk Multi-LP Management / MT5 node admin"
  - "NodeManagement.tsx (Node Registry, Book Configuration, group/symbol properties)"
related: [ref-mt5-nodes]
tags: [mt5, node, group, symbol, leverage, margin, trade-mode]
status: reviewed
version: settings-v1
---

## Node registry {#nodes}

**Node Registry** lists the MT5 servers; each has a display name and a host:port.
**Book Configuration** assigns which MT5 groups feed the B-Book. Actions:
**Promote** a node (with **Confirm Promotion** — the current MASTER becomes
STANDBY, choosing a **Source Node**), and **Delete Node**.

## Group properties {#groups}

Selecting an MT5 group shows its trading rules: **Leverage**; **Margin Mode**
(how margin is calculated); **Margin Call** and **Margin Stop-Out** (the equity
percentages at which the client is warned, then force-closed); **Order Limit**
and **Position Limit**; **Currency** and **Currency Digits**; and the raw
**Trade Flags** / **Pump Flags** that MT5 exposes.

## Symbol properties {#symbols}

Selecting a symbol shows its contract spec: **Base Currency** and **Profit
Currency**; **Digits** (price precision); **Volume Min** / **Volume Max**;
**Margin Initial**; **Trade Mode** (whether the symbol is disabled, close-only,
long/short-only, or full trading); and **Calc Mode** (the profit/margin
calculation type — Forex, CFD, Futures, etc.).
