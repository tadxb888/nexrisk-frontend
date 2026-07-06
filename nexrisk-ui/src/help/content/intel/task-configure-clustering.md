---
id: task-configure-clustering
title: "Clustering — configuring detection"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
source:
  - "NexRisk API v1.1 §HDBSCAN Clustering Endpoints (GET/PUT /clustering/config; POST /clustering/run; /runs)"
  - "Cluster-Formed Notifications — Frontend Integration (status thresholds, stability, novelty)"
  - "Archetype.tsx (HDBSCAN Config section)"
related: [ref-clustering-parameters, ref-alerts-bar, ref-trader-risk]
tags: [clustering, hdbscan, run, cluster, config, traders]
status: reviewed
version: intel-v1
---

## What clustering does {#what}

Clustering (HDBSCAN) groups traders by their recent trading behaviour so you can
see when a set of traders is behaving alike — a pattern forming in the book. Each
run assigns every eligible trader to a cluster or marks them as noise (an
outlier). A cluster that appears which wasn't there in the previous run raises a
`CLUSTER_FORMED` alert.

## Configure it {#configure}

Open the **HDBSCAN Config** section on the Archetypes page and set the clustering
parameters (see the parameter reference for what each one means). At minimum,
decide: how small a group counts as a cluster (`min_cluster_size`), how much
history to look at (`feature_window`), and whether runs happen automatically
(`auto_run_enabled` with `run_interval_minutes`) or only when you trigger them.

## Run it and see the clusters {#run}

To check for forming clusters now, trigger a run rather than waiting for the
schedule. A run reports how many clusters it found, how many traders were treated
as noise, the outlier counts, and the size of the trader universe it examined.
You then review the resulting clusters and their members; a cluster is labelled
**ACTIONABLE**, **EMERGING**, or **SMALL** based on how many traders it contains
(see the parameter reference). New clusters versus the previous run also surface
as alerts in the top bar.

## Reading a cluster {#reading}

Each cluster carries a member count, a **stability_score** (0–1; higher means a
more cohesive, more trustworthy grouping), and a heuristic **label hint** such as
`SCALPER_LIKE` or `BOT_LIKE` describing the behaviour the group resembles. A
run's outliers are traders that don't fit any cluster, split into high- and
medium-outlier bands by their outlier score.
