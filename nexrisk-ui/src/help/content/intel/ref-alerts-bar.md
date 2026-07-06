---
id: ref-alerts-bar
title: "Alerts Bar — notifications and FX cells"
type: reference
domain: intel
module: focus
minLevel: VIEW
route: /
source:
  - "Alerts Bar / FX Cells Frontend Integration (FX cell picker, source=node, per-user persistence, stale rendering)"
  - "Cluster-Formed / Profile-Detected / Economic-Calendar Notifications (notification types, severity palette, dedupe, discriminator = data.notification_type)"
related: [task-profiler, ref-calendar, task-configure-clustering, ref-system-health]
tags: [alerts-bar, notifications, fx-cells, escalation, cluster-formed, profile-detected, news, severity]
status: reviewed
version: intel-v2
---

## What the bar is {#what}

The Alerts Bar runs across the top of the app, above the page tabs. It has two
halves: **FX cells** (up to four live price tiles) on one side and the
**notification stream** on the other. Both are always visible, whatever page
you're on.

## FX cells {#fx-cells}

Each cell binds a **source** (an MT5 node) and a **symbol** and streams live
bid/ask/last. Add a cell with the "+" tile — pick a source, then a symbol from
that node's catalogue — up to four. The source label is always shown, so two cells
can hold the same symbol from different nodes (e.g. MT5-MASTER XAUUSD vs MT5-CLIENT
XAUUSD) and stay distinguishable. Cells have a remove control and can be reordered.
Your selection is **saved per user server-side**, so the same setup follows you to
another machine. If a cell's source goes offline the cell stays put, showing its
last-known values dimmed, rather than disappearing.

## Notifications {#notifications}

The stream carries eight event types on one channel: **ESCALATION** (a hedge needs
operator action), **PROFILE_DETECTED** (a trader's classification changed),
**CLUSTER_FORMED** (a new behavioural cluster appeared), **NEWS_IMMINENT** and
**NEWS_RELEASED** (economic events), **NODE_OFFLINE** (an MT5 node dropped),
**ROUTE_SANITY_BREACH** (an LP breached its health thresholds), and **ATR_BREACH**
(a volatility trigger). Each row has a title, a message, and a severity.

## Severity and behaviour {#severity}

Severity colours the badge: INFO grey, LOW blue, MEDIUM amber, HIGH orange,
CRITICAL red. Duplicate alerts are suppressed server-side within a 60-second window
per event, so a rapid re-fire or a revised value won't spam the bar. Rows deep-link
to their context — a profile alert opens that trader, a cluster alert opens the
clustering run, a calendar alert opens the event. New alerts arrive live; there's
no replay of history on reconnect, but the most recent rows are seeded when the bar
loads.
