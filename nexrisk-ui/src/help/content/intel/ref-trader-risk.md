---
id: ref-trader-risk
title: "Traders — classification and risk fields"
type: reference
domain: intel
module: focus
minLevel: VIEW
route: /flow
source:
  - "Focus.md (Risk Intelligence Center — fields, auto-explain)"
  - "Risk Matrix API — Unified Complete (archetype PF bands, action codes)"
  - "NEXRISK API v1.1 (trader dashboard: risk_level, risk_score, effective_risk, confidence, classification, recommended_action)"
related: [gls-risk-severity, ref-charter-rules]
tags: [traders, classification, risk-score, archetype, action-code]
status: reviewed
version: intel-v1
---

## Classification {#classification}

Each trader is classified into a behaviour archetype — e.g. SCALPER, EA_TRADER,
LATENCY_ARB, ARBITRAGE, NEWS_TRADER, GRID_MARTINGALE, REBATE_HUNTER, SWING_TRADER,
MANUAL_RETAIL, MANUAL — by the backend detection engine.

## Risk fields {#fields}

**risk_score** — a 0–100 score built from per-behaviour severity weights.
**effective_risk** — the score after risk-modifier flags are applied (this is
what the level bands against). **risk_level** — the CRITICAL/HIGH/MEDIUM/LOW band
(see the risk-and-severity glossary). **confidence** — the classifier's
confidence, 0–100%. **recommended_action** — the Risk Matrix action attached to
the trader (e.g. A_BOOK_FULL, A_BOOK_PARTIAL, SPREAD_WIDEN, B_BOOK_SAFE,
MONITOR). **triggered_rules** — the detection rules that fired.

## Columns {#columns}

**Login** — the trader's MT5 login; **Class** — the classification archetype;
**Score** — the risk score; **Equity** — the account equity.
