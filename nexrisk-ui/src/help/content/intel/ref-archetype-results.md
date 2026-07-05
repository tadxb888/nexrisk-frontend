---
id: ref-archetype-results
title: "Archetype — result and cluster labels"
type: reference
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source: ["Archetype.tsx", "NexRisk API v1.1 (clustering run outputs)"]
related: [ref-archetype-config, task-configure-clustering, ref-llm-config]
tags: [archetype, cluster, results, risk-scoring, filters]
status: reviewed
version: intel-v1
---

## Risk scoring {#scoring}

**Risk Scoring** shows how the composite risk score is built. **EA Bot** is the
Expert-Advisor archetype label.

## Cluster run results {#results}

A run's breakdown labels traders as **Noise**, **High**, **Med**, **Established**,
**Emerging**, and **Mapped**, with each cluster's **Avg Risk** and **Severity**.
Selecting a trader shows **Suggested** archetype, **Confidence**, and — for AI
explanations — **Latency** and **Cost**, while the model is generating.

## Filters {#filters}

Change-history filters narrow by **Subsection** (**All subsections**), change
type (**All types**), **All operators**, and **All records**. The cheapest AI
model option is **Haiku**.
