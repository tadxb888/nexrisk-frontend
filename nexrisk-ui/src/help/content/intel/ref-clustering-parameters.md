---
id: ref-clustering-parameters
title: "Clustering parameters — what each one means"
type: reference
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source:
  - "NexRisk API v1.1 §HDBSCAN Clustering Endpoints (clustering/config fields + defaults)"
  - "Cluster-Formed Notifications (action_threshold / emerging_cluster_min status thresholds)"
related: [task-configure-clustering]
tags: [clustering, parameters, min_cluster_size, min_samples, epsilon, outlier]
status: reviewed
version: intel-v1
---

## Cluster shape {#shape}

**min_cluster_size** (default 5) — the smallest number of traders that can count
as a cluster. Raise it to only surface larger groups; lower it to catch smaller
ones. **min_samples** (default 3) — how conservative the clustering is; higher
values make it stricter, so more traders are left as noise rather than forced
into a cluster. **cluster_selection_epsilon** (default 0.0) — a distance below
which nearby clusters are merged into one; `0` means no forced merging.
**distance_metric** (default euclidean) — how behavioural similarity between
traders is measured.

## Who gets included {#universe}

**feature_window** (default 1d) — how much recent history the behaviour features
are built from (`5m`, `15m`, `1h`, or `1d`). **min_trades_for_clustering**
(default 10) — a trader needs at least this many trades in the window to be
included. **min_traders_for_run** (default 20) — a run won't proceed unless at
least this many eligible traders exist, so tiny universes don't produce noise.

## When it runs {#schedule}

**auto_run_enabled** (default off) — whether clustering runs automatically on a
schedule. **run_interval_minutes** (default 60) — how often it runs when auto-run
is on. With auto-run off, clustering only runs when you trigger it.

## Cluster status thresholds {#status}

A cluster's status comes from its member count: **ACTIONABLE** when members ≥
**action_threshold** (default 10), **EMERGING** when members ≥
**emerging_cluster_min** (default 3) but below the action threshold, and
**SMALL** below that. These map to alert severities HIGH, MEDIUM, and INFO.

## Outlier bands {#outliers}

Traders that don't fit a cluster get an outlier score. **high_outlier_threshold**
(default 0.8) and **medium_outlier_threshold** (default 0.5) set the score
boundaries that split outliers into high and medium bands.
