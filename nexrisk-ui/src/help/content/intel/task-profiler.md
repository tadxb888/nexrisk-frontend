---
id: task-profiler
title: "Profiler (Risk Intelligence Center) — reading trader risk"
type: task
domain: intel
module: focus
minLevel: VIEW
route: /flow
source:
  - "Focus.md — Risk Intelligence Center design spec (Risk View / Cluster View, trader row fields, detail panel, AI explanation logic, fallback metrics, cluster cards)"
  - "Profile-Detected Notifications (classification transition message format)"
related: [task-archetype-detection, task-configure-clustering, task-risk-policy, ref-trader-risk, gls-risk-severity]
tags: [profiler, focus, traders, risk-intelligence, classification, explanation, clusters, win-rate, profit-factor]
status: reviewed
version: intel-v2
---

## What the Profiler is {#what}

The Profiler (Risk Intelligence Center) is where a risk manager monitors the
AI-driven trader detection, classification, and clustering in one place. It has
two views: **Risk View** (traders grouped by risk level) and **Cluster View**
(behavioural clusters from the latest clustering run).

## Risk View {#risk-view}

Traders are grouped into collapsible **CRITICAL / HIGH / MEDIUM / LOW** sections
with a count on each. Each row shows the login and name, the classification
(SCALPER, EA_TRADER, ARBITRAGE, etc.), the risk score (0–100) and confidence, the
recommended action (A_BOOK_FULL, SPREAD_WIDEN, B_BOOK_SAFE…), a multi-strategy
count if more than one behaviour was detected, and a brain icon when an AI
explanation exists.

## The detail panel {#detail}

Selecting a trader opens a panel with the risk badge and a quick-stats grid (risk
score, confidence, classification, recommended action), a multi-strategy alert if
applicable, the AI explanation, and an always-visible fallback-metrics section.
The **fallback metrics** — average hold time, win rate, profit factor, timing
regularity, lot entropy, burst score — come straight from the trader's features
and render instantly whether or not an AI explanation is present, so there's
always something concrete to read.

## AI explanations {#explanations}

For **CRITICAL and HIGH** traders an explanation is generated automatically when
they're classified and shown immediately (the brain icon). For **MEDIUM and LOW**
it's on-demand — click Generate, wait a few seconds, and it appears. An explanation
gives a behaviour description, risk indicators, a suggested action, and the
reasoning. On-demand generation has a small per-call cost shown in the UI; the
fallback metrics are always free and instant.

## Cluster View {#clusters}

Cluster View shows the HDBSCAN clusters as cards — each with a name, archetype
(e.g. MICRO_SCALPER), member count, average risk, severity, a short description,
and the member logins. The card's border encodes severity: red at 0.8+, orange
0.6+, yellow 0.4+, green below, and purple for the noise cluster (unclustered
outliers). "Explain this cluster" generates an LLM summary of what the group has
in common.

## Staying current {#updates}

The list refreshes on a poll, and a classification change (especially an
escalation into CRITICAL/HIGH) surfaces as an alert that briefly highlights the
row — the same transition you see phrased as "Login … was MANUAL · risk 78 ·
confidence 91%" in notifications.
