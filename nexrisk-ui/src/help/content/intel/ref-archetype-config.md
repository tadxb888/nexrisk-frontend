---
id: ref-archetype-config
title: "Detection & classification config"
type: reference
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source:
  - "Settings API (classifier configs, risk-severity multipliers, detection thresholds)"
  - "Archetype.tsx (Global Gate, Composite Weights, Anomaly Detector, Threshold Ladders sections)"
related: [ref-trader-risk, ref-clustering-parameters, gls-risk-severity]
tags: [classification, detection, isolation-forest, weights, thresholds, gate]
status: reviewed
version: intel-v1
---

## Global classification gate {#gate}

The **Global Gate** sets the minimum number of trades a trader must have before
any classification fires at all — below it, a trader is left unclassified.

## Composite weights and action thresholds {#weights}

The **Decision Engine** combines multiple behaviour signals into one score. The
**Composite Weights** are the per-signal weights and must sum to 1.0.
**Action Thresholds** are the ascending score boundaries that map a score to an
action level; they must be in ascending order.

## Risk severity multipliers {#severity}

**Risk Severity Multipliers** scale how strongly each behaviour type (EA,
Scalper, Arbitrage, Rebate, News) contributes to the overall risk score. Each is
in the range 0.10–1.00.

## Anomaly detector {#anomaly}

The **Anomaly Detector** uses an Isolation Forest. Its **contamination** setting
is the expected fraction of anomalous traders in the population, and the
**Anomaly Boost** raises the risk contribution of flagged anomalies.

## Behaviour threshold ladders {#ladders}

Each behaviour detector has a ladder of action levels (Monitor → Warn → Restrict
→ Escalate). For each level, `confidence_min`, `min_duration_sec`, and
`min_trades` must increase as the level gets stricter.
