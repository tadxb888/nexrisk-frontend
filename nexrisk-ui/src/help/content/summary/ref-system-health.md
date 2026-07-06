---
id: ref-system-health
title: "System health bar — operating guide"
type: reference
domain: summary
module: cockpit
minLevel: VIEW
route: /
source:
  - "System_Health_Bar_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [system-health, status-bar, cpu-saturation, memory-pressure, disk-io, mt5-rtt, lp-rtt, packet-loss, master-node]
status: reviewed
version: summary-v3
---

## 1. About This Reference

The System Health Bar is the thin strip along the very bottom of every
screen. It is the platform’s always-on pulse: the master trading node it
is connected to, and six live measures of how healthy the server and its
network links are. It is deliberately understated — it stays quiet and
neutral while everything is fine, and only draws the eye when something
needs attention.

That "quiet by design" behaviour is the thing to understand first: the
bar is not meant to be stared at. It is meant to sit in the corner of
your attention and change colour when — and only when — a number crosses
a line that matters. This reference explains how to read it, exactly
when to pay attention, and the reasoning behind the thresholds it uses.

## 2. How the Bar Is Presented

### 2.1 The layout

Left to right, the bar is a row of cells:

| **Cell**       | **Shows**                                                                       |
|----------------|---------------------------------------------------------------------------------|
| Master         | A status dot and the name of the master MT5 node the platform is connected to.  |
| Status         | The connection state in words: Connected, Offline, or Disconnected (Section 3). |
| CPU Saturation | How saturated the processor is (a percentage).                                  |
| Mem Pressure   | How much the server is paging memory (a percentage).                            |
| Disk I/O       | How long the disk is taking per read/write (milliseconds).                      |
| MT5 RTT        | Round-trip time to the master MT5 server (milliseconds).                        |
| LP RTT         | Slowest liquidity-provider execution round-trip (milliseconds).                 |
| Packet Loss    | Share of network packets that had to be resent (a percentage).                  |
| Time           | When the bar last updated.                                                      |

### 2.2 Quiet by design — colour only appears when it matters

This is the part that surprises people. When everything is healthy, the
numbers are shown in plain, neutral text — there is no wall of green. A
calm-looking bar is a healthy bar. Colour is reserved for trouble:

Healthy → neutral text (no colour). **Amber** → crossed the "warn" line.
**Red (bold)** → crossed the "alert" line.

When a metric first crosses into the alert (red) state, its cell briefly
**pulses red** for about half a second — a small motion cue to catch the
eye at the moment a problem starts, even if you were looking elsewhere.

|                                                                                                                                                                                                                                                |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **So: when do you pay attention?** Only when a cell turns amber or red, or you catch a red pulse. A neutral bar needs nothing from you. This is the whole point of the design — it lets you ignore the bar safely until it asks to be noticed. |

### 2.3 Dashes and a dimmed bar

Two more presentations mean "don’t read a number here": a **dash (—)**
in a cell means there is no fresh data for that metric, and the **whole
bar dimming to half-brightness with every cell showing a dash** means
the platform has lost its live connection (Section 3). A dimmed bar is
not a health reading — it means the readings themselves are unavailable,
so nothing on it should be trusted until it brightens again.

## 3. The Connection State — Master and Status

The two left cells share one connection state with three values. The
distinction between the last two is important, because they point you at
different problems.

| **State**    | **Dot** | **Means**                                                                                                          | **Where to look**                                                                                                      |
|--------------|---------|--------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Connected    | Green   | The master MT5 node is online and live data is flowing.                                                            | Nothing — all well.                                                                                                    |
| Offline      | Red     | The platform is running, but the master MT5 node is unreachable.                                                   | MT5: the MT5 server, its credentials, and the network to the MT5 host. The tooltip notes when it was last seen online. |
| Disconnected | Grey    | The browser has lost its link to the platform — backend, BFF or your own network. The platform itself may be fine. | The platform / your network. The whole bar dims and shows dashes.                                                      |

**Why the distinction matters:** "Offline" is a specific, trustworthy
statement — the platform can see that the MT5 master is down, so the
problem is on the MT5 side. "Disconnected" is a black box — the browser
can no longer reach the platform at all, so it cannot say anything about
health, which is why it stops showing numbers rather than showing stale
ones.

## 4. The Six Metrics

Each cell measures something specific that predicts trouble for trading.
They are chosen to catch the real bottlenecks — not vanity numbers like
raw CPU usage, but the things that actually delay orders and drop
sessions. Hovering any cell shows a plain-English explanation, and when
a metric is elevated the tooltip also states the threshold so you can
tell "just noticed" from "actively bad".

### 4.1 CPU Saturation (%)

Not CPU usage — CPU **saturation**. It is the share of the time that
more threads were waiting to run than the server has cores. A machine
can read 30% CPU usage and still be saturated, with work queuing up.
High saturation means the hedge engine is fighting for the processor and
orders can be delayed even though a usage graph would look calm. That is
exactly why the bar measures the queue, not the usage.

### 4.2 Mem Pressure (%)

How heavily the server is shuffling memory between RAM and disk
(paging), on a normalized scale where sustained heavy paging reads 100%.
A healthy host reads **zero** — so the number going non-zero at all
tells you paging has started, and paging causes latency spikes across
the whole platform until it clears. The cell turns amber once that
pressure reaches the warn line and red at the alert line (Section 6.3),
which are set for **sustained** paging rather than a momentary fault.

### 4.3 Disk I/O (ms)

The average time the disk takes to complete a read or write. On a
healthy SSD this should be **under 1 ms**. When it climbs, database
writes, log files and FIX message storage all slow down — which feeds
through into slower everything.

### 4.4 MT5 RTT (ms)

Round-trip time to the master MT5 server, measured every ten seconds.
This is the **B-Book latency floor**: if it climbs, every MT5 operation
— quotes, positions, orders — gets slower, because they all go through
this link.

### 4.5 LP RTT (ms)

The **slowest** execution round-trip across all connected liquidity
providers — the A-Book and C-Book hedge latency. Showing the worst LP
means the cell reflects the weakest link in hedging at any moment; the
tooltip names which provider it is. This cell has a special rule: if the
latency data is more than five minutes old it is treated as **stale**
and shows a dash, because a stale "good" number is worse than an honest
"unknown" — it usually means the reporting service has stopped, not that
the LP is fine.

### 4.6 Packet Loss (%)

The share of network packets the server had to resend. The lines are
drawn **deliberately tight** — amber at just 0.05% and red at 0.1% —
because in a colocated setup loss should be essentially zero, and
sustained loss even at these small levels shows up as FIX session drops,
price gaps and missed fills. It is a leading indicator of network
trouble before it becomes visible as failed trades.

## 5. When to Pay Attention

Putting the presentation and the metrics together, here is the
operator’s reading of the bar:

| **You see…**                     | **It means…**                                                 | **Do**                                                                                          |
|----------------------------------|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Neutral numbers                  | All metrics below their warn lines.                           | Nothing. Healthy.                                                                               |
| An amber cell                    | That metric crossed its warn line — noticed, not yet serious. | Glance at it; hover for the threshold. Watch whether it climbs.                                 |
| A red cell (or a red pulse)      | That metric crossed its alert line — actively bad.            | Act. Hover to see the value against the threshold, and address the underlying resource or link. |
| A dash in a cell                 | No fresh data for that metric (or LP data went stale).        | Check whether the reporting pipeline for that metric is up.                                     |
| The whole bar dimmed, all dashes | The browser lost its connection to the platform.              | Check the platform and your network (Section 3).                                                |
| Status: Offline                  | The master MT5 node is down.                                  | Check MT5, its credentials, and the link to it.                                                 |

**One blip vs sustained.** A single momentary amber — a brief disk
spike, a one-second saturation tick — is usually noise and clears
itself. What matters is a reading that **stays** elevated or keeps
returning: that is a real condition, not a blip. The bar updates every
second, so a persistent colour is a persistent problem.

## 6. Why These Thresholds

The thresholds are chosen on one principle: measure the thing that
actually hurts trading, and draw the line where it starts to hurt — not
where a textbook says a server is "busy".

### 6.1 Measure the bottleneck, not the vanity number

Raw CPU usage, free RAM and disk-space-free are the usual dashboard
numbers, and they are nearly useless for predicting execution problems.
A box at 40% CPU can still be starving the hedge engine; a box with
plenty of free RAM can still be paging. So the bar measures saturation
and latency instead — the run queue, the paging rate, the disk service
time, the round-trips, the retransmit rate — because those are what
delay an order or drop a session. The thresholds sit where those effects
begin.

### 6.2 Two lines, not one

Every metric has **two** thresholds, which is why there are two colours.
The **warn** line (amber) is set where a metric has left its comfortable
range but trading is not yet affected — a "keep an eye on it" level. The
**alert** line (red) is set where the effect on execution becomes real.
Splitting the two means a healthy fluctuation does not cry wolf, while a
genuine problem is unmistakable.

### 6.3 The reasoning per metric

| **Metric**     | **Warn / Alert** | **Where the line is drawn, and why**                                                                                                                                                                                                                                                       |
|----------------|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CPU Saturation | 50% / 70%        | Keyed to the run queue exceeding the core count — the point at which threads genuinely wait for a core. Warn once the queue is over cores half the time; alert at 70%. Measured against this machine’s own core count, so it is correct on any host.                                       |
| Mem Pressure   | 50% / 60%        | A "normally zero" metric, so the number going non-zero is already visible; the amber/red lines sit high on the normalized scale (about 50 and 60 sustained hard page-faults per second) because light transient paging is tolerable but sustained paging at that rate means real pressure. |
| Disk I/O       | 5 ms / 10 ms     | Anchored to the SSD baseline: a healthy SSD serves reads and writes in well under a millisecond, so warn at 5 ms and alert at 10 ms mark storage slowing enough to drag database and FIX writes.                                                                                           |
| MT5 RTT        | 30 ms / 50 ms    | Drawn against the normal round-trip to the master node. Because this is the B-Book latency floor, warn at 30 ms and alert at 50 ms mark where added latency becomes material to every MT5 operation.                                                                                       |
| LP RTT         | 100 ms / 250 ms  | Drawn against normal hedge round-trips (warn 100 ms, alert 250 ms), and paired with a five-minute staleness rule so an old reading is shown as unknown rather than good. It tracks the worst LP, so the line reflects the weakest hedge link.                                              |
| Packet Loss    | 0.05% / 0.1%     | Deliberately tight — in colo, loss should be near zero, so even a twentieth of a percent warns and a tenth alerts. Above these, retransmission stops being ordinary noise and starts causing FIX drops and missed fills.                                                                   |

**Tunable, and always shown.** The thresholds are supplied by the
server, not baked into the screen, so they can be adjusted centrally as
the estate changes without touching the app. And whenever a metric is
elevated, its exact warn/alert values appear in the cell’s tooltip — so
the reasoning is never hidden: you can always see the current reading
against the line it crossed.

## 7. Refresh and Freshness

The bar updates once a second from a live feed. Within each second the
processor run-queue is polled ten times and the memory measure sampled
repeatedly, then averaged, so a single noisy reading does not swing the
cell — what you see is the settled value for the last second. The time
cell shows when the last update arrived. The LP cell carries the
five-minute staleness rule described above; every other cell simply
shows a dash if its data is momentarily missing. If the live connection
drops entirely, the whole bar dims and dashes rather than showing you
numbers it can no longer stand behind.

## 8. How This Relates to Other Pages

- **Network Cluster** — the map version of the same estate. The bar is
  the always-on summary; the Network Cluster page shows the same nodes
  and links geographically, with per-node CPU/RAM/disk and per-LP
  latency.

- **Route Sanity** — the LP RTT on the bar comes from the same
  liquidity-health data Route Sanity tracks and acts on. The bar shows
  the worst LP now; Route Sanity shows the trend and the automated
  response.

- **Portfolio and Cockpit** — the round-trip and system figures echoed
  elsewhere in the platform are this same family of signals; the bar is
  where they live permanently.

## 9. Quick Reference

### 9.1 States and colours

Neutral = healthy · **Amber** = warn (watch) · **Red / pulse** = alert
(act) · — = no data / stale · dimmed bar = disconnected.

### 9.2 Connection states

**Connected** (green) all well · **Offline** (red) = MT5 master down,
check MT5 · Disconnected (grey) = platform/network, bar dims.

### 9.3 The metrics, their thresholds, and why they matter

| **Metric**     | **Warn** | **Alert** | **What it warns of**                                          |
|----------------|----------|-----------|---------------------------------------------------------------|
| CPU Saturation | 50%      | 70%       | Threads waiting for cores — orders delayed even at low usage. |
| Mem Pressure   | 50%      | 60%       | Sustained paging — latency spikes platform-wide.              |
| Disk I/O       | 5 ms     | 10 ms     | Slow storage — slower DB, logs and FIX writes.                |
| MT5 RTT        | 30 ms    | 50 ms     | B-Book latency floor — everything MT5-side slows.             |
| LP RTT         | 100 ms   | 250 ms    | A/C hedge latency (worst LP) — stale after 5 min.             |
| Packet Loss    | 0.05%    | 0.1%      | Network trouble — FIX drops, price gaps, missed fills.        |

*End of reference.*
