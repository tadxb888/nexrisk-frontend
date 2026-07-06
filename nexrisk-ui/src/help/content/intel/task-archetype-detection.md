---
id: task-archetype-detection
title: "Trader detection & classification — how it's tuned"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source:
  - "Settings API (classifier: global gate, per-behavior detector weights, risk-severity multipliers, decision-engine weights+thresholds, anomaly contamination; detection: escalation ladders, risk-scoring, processing, auto-escalation; LIVE vs RESTART)"
  - "Profile-Detected Notifications (classification trigger semantics, effective_risk composition)"
related: [task-configure-clustering, ref-clustering-parameters, ref-archetype-config, ref-trader-risk, task-risk-policy]
tags: [archetype, detection, classifier, weights, anomaly, isolation-forest, decision-engine, escalation, thresholds]
status: reviewed
version: intel-v2
---

## How classification works {#pipeline}

A trader is scored per deal (gated by a cooldown, not a fixed loop). Behaviour
detectors produce a classification and confidence; an anomaly detector flags
outliers; the decision engine combines behaviour, anomaly, and persistence into an
**effective risk score** (0–100) that bands into VERY_LOW → CRITICAL. A
`PROFILE_DETECTED` alert fires only when the trader's classification actually
changes (including first-ever), not on repeat confirmations or score drift within
the same archetype.

## The global gate {#gate}

`min_trades_for_classification` is the statistical-significance gate — below it, a
trader is left unclassified. It exists so a handful of trades can't get someone
labelled prematurely.

## Behaviour detector weights {#detectors}

Each behaviour (EA, Scalper, Arbitrage, Rebate, News) has its own detector built
from weighted signals — e.g. EA blends timing regularity, inter-trade coefficient
of variation, stop-loss and lot entropy, and session independence. **The weights
within a detector must sum to 1.0**, and the config API validates this, so send
all of a detector's weights together when you change one. Each detector also has
its own `min_trades` floor.

## Risk-severity multipliers {#severity}

After a behaviour is detected, a per-type multiplier (0.10–1.00) scales how much
it contributes to risk: Arbitrage 1.00 (highest), Rebate 0.80, Scalper 0.50, News
0.40, EA 0.30 by default. This encodes that the same confidence means more risk
for an arbitrageur than for an EA.

## The decision engine {#decision}

The final risk score is `behavior_weight × classifier + anomaly_weight × anomaly +
persistence_weight × persistence` — those three weights must sum to 1.0.
Persistence is how long the pattern has been sustained (with minimum seconds and
trades to confirm), so a brief blip doesn't act like an established pattern. The
score maps to actions at ascending thresholds — `monitor < warn < restrict <
escalate` — and an `anomaly_risk_boost` (1.0–3.0) lifts the score when the anomaly
detector fires.

## Anomaly detector {#anomaly}

The anomaly detector is an Isolation Forest; its **contamination** (0.01–0.30) is
the expected fraction of anomalous traders in the population — set it to roughly
how many true outliers you believe exist, since it shapes how readily traders get
flagged.

## Escalation ladders {#ladders}

Each behaviour has a four-rung ladder — MONITOR → WARN → RESTRICT → ESCALATE — and
within it `confidence_min`, `min_duration_sec`, and `min_trades` must **increase**
at each rung (the validator enforces ascending order), so stricter actions demand
stronger, longer-observed evidence. **Auto-escalation**, when enabled, escalates
any trader above a risk-score threshold (70–100) even without a matching policy.

## Live vs restart {#live}

Most classifier and detection changes are **LIVE** — applied in memory and written
to disk with no restart. A few fields are RESTART (written now, effective after a
service restart) and show up in the pending-restart list. Every subsection can be
reset to factory defaults, and a diff shows what you've changed.
