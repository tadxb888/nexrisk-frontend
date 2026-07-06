---
id: ref-system-health
title: "System health bar — the metrics strip"
type: reference
domain: summary
module: cockpit
minLevel: VIEW
route: /
source:
  - "NexRisk System Health WebSocket API (master node, six metrics, warn/alert thresholds, saturation-not-utilization semantics, boot warm-up)"
related: [ref-cockpit, ref-network-cluster, ref-mt5-servers, ref-alerts-bar]
tags: [system-health, status-bar, cpu-saturation, memory-pressure, disk-io, mt5-rtt, lp-rtt, packet-loss, master-node]
status: reviewed
version: summary-v2
---

## What it shows {#what}

The status bar along the bottom reports the health of the platform itself, updated
once a second. It shows the bound **master MT5 node** and its connection state,
plus six live metrics that predict trading latency. Each metric has server-supplied
**warn** and **alert** thresholds, so the colour changes are tuned in config, not
hardcoded.

## The master node {#master}

The master is the currently-bound MT5 MASTER connector, shown by broker name with a
connected/disconnected state. On a failover or promotion the name changes within a
second — that name change is itself the "master switched" cue.

## The six metrics {#metrics}

- **CPU saturation** — how often the OS run queue exceeded the core count.
  Saturation, not utilisation: it measures contention, so the hedge engine can miss
  windows here before CPU ever hits 100%. Warn 50%, alert 70%.
- **Memory pressure** — hard-fault (paging) rate; paging causes latency spikes that
  ripple through the pipeline. Warn 50%, alert 60%.
- **Disk I/O latency** — average disk service time; slow disk cascades into every
  Postgres, audit, and FIX write. Warn 5ms, alert 10ms.
- **MT5 RTT** — round-trip to the master MT5 server; a direct predictor of B-Book
  operation latency. Warn 30ms, alert 50ms.
- **LP execution RTT** — the worst connected LP's execution latency; a direct
  predictor of A-Book/Coverage hedge latency. Warn 100ms, alert 250ms. Its tooltip
  names the LP; if the reading is older than ~5 minutes it's treated as stale.
- **Packet loss** — TCP retransmit rate; the silent killer of FIX sessions. Warn
  0.05%, alert 0.1%.

## Reading it {#read}

Green is nominal, amber is warn, red is alert. During boot warm-up, before the
first sample, the master and metrics read empty/zero — that's startup, not a
fault. Because these are latency *predictors*, an amber MT5 or LP RTT is an early
warning that hedging and B-Book operations are about to feel slow, well before it
shows up as a trading problem.
