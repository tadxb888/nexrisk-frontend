---
id: ref-network-cluster
title: "Network Cluster — the infrastructure map"
type: reference
domain: summary
module: cockpit
minLevel: VIEW
route: /infra
source:
  - "Network Cluster page (/infra): data-driven world map from GET /api/v1/cluster/nodes; infrastructure nodes as circle pins, LP nodes as diamond pins; MT5 nodes carry metrics:null by design"
related: [ref-system-health, ref-mt5-servers, task-lp-management]
tags: [network-cluster, infra, world-map, nodes, lp-nodes, mt5-nodes, topology]
status: reviewed
version: summary-v2
---

## What it shows {#what}

The Network Cluster page (/infra) is a world map of the platform's live topology —
every node the cluster reports, placed geographically. It's fully data-driven from
the cluster nodes feed, so the map reflects whatever the backend currently reports;
there's nothing to configure here, it's a monitoring view.

## Reading the map {#map}

Node kinds are drawn differently so the topology is readable at a glance:
**infrastructure nodes** appear as circle pins (animated to show they're live), and
**LP nodes** appear as diamond pins. Selecting a node opens a detail card with its
identity and, where available, its metrics.

## A rendering detail {#detail}

MT5 nodes carry no metrics block by design (`metrics: null`), so the detail card is
built to handle a node with no metrics rather than expecting every node to report
them — an MT5 node showing no metric readout is expected, not a fault. For live
host metrics (CPU, latency, packet loss) the system-health bar is the source; this
page is about *where* the nodes are and *whether* they're present, not their
per-second load.
