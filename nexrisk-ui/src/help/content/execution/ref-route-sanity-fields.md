---
id: ref-route-sanity-fields
title: "Route Sanity — metric columns"
type: reference
domain: execution
module: route_sanity
minLevel: VIEW
route: /route-sanity
source:
  - "Hedging Manager API v1.3 §4 (Route Sanity Config)"
  - "RouteSanityPage.tsx"
related: [ref-lp-admin-states, ref-hedge-strat-states]
tags: [route-sanity, latency, uptime, rejection, thresholds]
status: reviewed
version: exec-v1
---

## What route sanity measures {#overview}

Route sanity tracks each LP route against latency, uptime, and rejection
thresholds; a breach drives a strategy's breach action (pause, stop, or
fallback). The grid shows each metric over two windows — the rolling last 60
minutes and the day.

## Columns {#columns}

**Lat/60m** and **Lat/Day** — average round-trip latency over the last 60
minutes and the day. **Up/60m** and **Up/Day** — session uptime percentage over
each window. **Rej/60m** and **Rej/Day** — order rejection rate over each window.
**RT/60m** and **RT/Day** — round-trip counts per window. **/60m** and **/Day**
— per-window totals for the adjacent metric. **Lmt** — the configured threshold
(limit) for the metric. **Δ Spread** — the change in spread observed on the
route.
