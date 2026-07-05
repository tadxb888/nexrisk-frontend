---
id: gls-net-exposure
title: "Net Exposure"
type: glossary
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "Charts API Frontend Integration §7 (net-volume-by-book) + Known data gaps"
  - "NetExposure.tsx (broker-side net vol; snapshot as_of)"
related: [con-net-exposure-sign, con-book-model, task-interpret-net-exposure]
tags: [net-exposure, exposure, lots, snapshot, exposure-engine, broker-perspective]
status: reviewed
version: books-v1
---

## Definition {#definition}

**Net Exposure** is the broker's residual directional risk per instrument after
netting the books — the position the broker still carries once opposing client
flow is offset. It is shown from the broker's perspective (see the
sign-conventions article).

It is served per book and per symbol as `net_exposure_lots`, sorted descending
by absolute value so the largest residual risks surface first. The figures are
pre-computed snapshots written by the ExposureEngine background job, carrying an
`as_of` timestamp.

Snapshots can be stale: the writer's scheduled refresh has been known to stop,
leaving `as_of` old and the per-symbol breakdown empty. In that state the page
shows the timestamp honestly and offers a manual one-shot refresh rather than an
error banner.
