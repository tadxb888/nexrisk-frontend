---
id: ref-focus-panels
title: "Traders & Archetypes — result panels"
type: reference
domain: intel
module: focus
minLevel: VIEW
route: /flow
source:
  - "Focus.md (trader detail panels, cluster view)"
  - "Focus.tsx / Archetype.tsx (panel labels)"
related: [ref-trader-risk, task-configure-clustering, ref-clustering-parameters]
tags: [traders, panels, cluster, quick-stats, risk-indicators]
status: reviewed
version: intel-v1
---

## Trader detail {#trader}

Selecting a trader shows **Quick Stats** (risk score, confidence, classification,
recommended action), **Triggered Rules** (the detection rules that fired), a
**Behaviour Profile** with a **Suggested Archetype** and **Reasoning**, and
**Risk Indicators** — the specific signals driving the risk.

## Cluster view {#cluster}

**Cluster Metrics** and **Cluster Members** describe a selected cluster. Cluster
cards show **Avg Risk Score**, **Risk Severity**, and member composition
(**Noise**, **High**, **Med**, **Established**, **Emerging**, **Mapped** counts).
When no run exists the panel prompts you to run a clustering analysis.

## Archetype intelligence sections {#archetype}

The Archetype page groups its configuration into **Behaviour Detectors**, **Risk
Scoring**, **Pipeline Processing**, **Auto-Escalation**, **Risk Band Boundaries**,
and the **Archetype Library** (the catalogue of known archetypes). AI
explanations report their **Latency** and **Cost** per generation.
