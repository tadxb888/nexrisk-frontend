---
id: task-interpret-net-exposure
title: "Read the Net Exposure page"
type: task
domain: books
module: net_exposure
minLevel: VIEW
route: /net-exposure
source:
  - "Charts API Frontend Integration §7 (net-volume-by-book), Known data gaps, Real-time portfolio fields (WebSocket)"
  - "NetExposure.tsx (B-Book row = inverse of client; Coverage row = broker LP position; fully hedged = equal/opposite)"
related: [gls-net-exposure, con-net-exposure-sign]
tags: [net-exposure, task, refresh, snapshot, staleness, sign-convention]
status: reviewed
version: books-v1
---

## What the page shows {#overview}

The Net Exposure page reports the broker's residual directional risk per
instrument as `net_exposure_lots`, per book and per symbol, sorted so the
largest absolute exposures appear first.

## Reading the signs {#signs}

Rows are shown from the broker's perspective. The B-Book row is the inverse of
client direction — the broker's internal side. The Coverage Book row is the
broker's actual LP position, signed as placed. A fully hedged instrument shows
the two as equal and opposite, netting to no residual exposure; a large residual
is where the broker still carries directional risk.

## Steps {#steps}

1. Read the `as_of` timestamp first — this data is a pre-computed snapshot, not
   live — so you know how current it is.
2. Scan from the top: rows are ordered by absolute exposure, so the biggest
   residual risks are already surfaced.
3. If `as_of` looks stale or the per-symbol list is empty, use the manual
   refresh control to trigger a one-shot snapshot refresh, then re-read.

## Known-stale behaviour {#known-stale}

The ExposureEngine snapshot writer's scheduled refresh has been known to stop.
When that happens the page deliberately shows the honest (old) timestamp and an
empty breakdown rather than an error — that is expected, and the manual refresh
is the intended recovery.

> For live directional fields (Long/Short/Net volume, hedge direction, net
> positions) the source is the WebSocket topic `portfolio.summary.{period}`, not
> this snapshot endpoint.
