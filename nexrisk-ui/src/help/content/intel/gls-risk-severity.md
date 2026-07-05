---
id: gls-risk-severity
title: "Risk and severity levels"
type: glossary
domain: intel
module: focus
minLevel: VIEW
route: /flow
source:
  - "Risk Matrix API — Unified Complete (Factory Default PF Bands)"
  - "Settings API (risk_levels ladder: low_max < medium_max < high_max; above = CRITICAL)"
  - "Focus.md (risk_level bands, auto-explain on CRITICAL/HIGH)"
  - "Profile-Detected notifications (severity mapping incl. INFO/WARN)"
related: [ref-trader-risk, ref-charter-rules, ref-alerts-bar]
tags: [risk-level, severity, critical, high, medium, low, info, warn]
status: reviewed
version: intel-v1
---

## Levels {#levels}

Traders, rules, alerts, and log lines share a common severity ladder, ascending:
**VERY_LOW**, **LOW**, **MEDIUM**, **HIGH**, **CRITICAL**. Two contexts extend
it: log lines use **INFO / WARN / CRITICAL**, and alert severities map the risk
ladder onto **INFO / LOW / MEDIUM / HIGH / CRITICAL**.

## How a trader's level is set {#trader-level}

A trader's level is computed by the backend risk engine, not the frontend, and
banded from the risk score against a configurable ladder (`low_max <
medium_max < high_max`; above `high_max` = CRITICAL), while the Risk Matrix maps
each archetype's profit-factor band to a level. CRITICAL and HIGH traders are
auto-explained on classification; MEDIUM and LOW are explained on demand.
