---
id: ref-alerts-bar
title: "Alerts Bar — notification types"
type: reference
domain: intel
module: focus
minLevel: VIEW
route: /flow
source:
  - "Alerts Bar and FXCells Frontend Integration"
  - "Profile-Detected / Cluster-Formed / Economic-Calendar / Cluster-Formed notification integration docs"
related: [gls-risk-severity]
tags: [alerts, notifications, escalation, news, cluster, node-offline]
status: reviewed
version: intel-v1
---

## Notification types {#types}

The alerts bar surfaces platform events: **ESCALATION** — a hedge or position
needs operator action; **PROFILE_DETECTED** — a trader was (re)classified;
**CLUSTER_FORMED** — a new behavioural cluster was formed; **NEWS_IMMINENT** — a
scheduled news event is about to release; **NEWS_RELEASED** — a news event has
released; **NODE_OFFLINE** — an MT5 or infrastructure node went offline;
**ROUTE_SANITY_BREACH** — an LP route breached its latency/uptime/rejection
thresholds; **ATR_BREACH** — volatility (ATR ratio) crossed a configured bound.

## Severity {#severity}

Each notification carries a severity of **INFO**, **LOW**, **MEDIUM**, **HIGH**,
or **CRITICAL** (see the risk-and-severity glossary).
