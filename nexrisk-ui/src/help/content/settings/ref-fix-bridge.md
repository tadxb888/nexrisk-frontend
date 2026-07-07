---
id: ref-fix-bridge
title: "FIX Bridge — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/fix-bridge
order: 5
source:
  - "Settings_05_FIX_Bridge.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,fix-bridge,audit,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

The FIX bridge is the service that connects Taiga to your liquidity
providers (LPs) using FIX, the industry-standard messaging protocol for
broker-to-venue connectivity. This page does not configure the LP
connections themselves — it configures the bridge’s operational
plumbing: how much it logs, how much traffic history it keeps, what it
captures when something goes wrong, and how much it buffers before it
starts dropping messages under load. Fifteen settings across five
groups, and none of them is a secret.

You reach it at **Settings › FIX bridge**.

|                                                                                                                                                                                                                                                                                                                     |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This page is the bridge’s plumbing, not its LP connections.** The actual liquidity-provider connections and their credentials are configured on the LP management page. This page governs logging, audit capture, incident bundling and buffering — the operational behaviour that sits around those connections. |

## 2. What This Page Controls

This page manages the logging, audit, incident and backpressure sections
of the FIX bridge’s configuration file (fixbridge_config.json). Other
parts of that file — the LP list and session settings — are managed
elsewhere and are left untouched when you save here; this page writes
only its four groups of settings.

|                                                                                                                                                                                                                                                                                                        |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk FIX Bridge service.** Every change here applies only after the FIX Bridge service is restarted — not the price gateway, not the core service. Restarting the FIX Bridge drops and re-establishes your FIX sessions to the LPs, so coordinate it with the desk. |

## 3. Before You Change Anything

- **Audit and incident capture consume disk.** Raw traffic capture on a
  busy bridge can be tens of gigabytes a day before compression. If you
  turn on capture with long retention and large files, make sure the
  host has the disk to hold it.

- **Backpressure caps are silent drops.** When one of the buffers fills,
  new messages are dropped, not held. Set caps too low and you lose
  messages under load; set them too high and you use more memory and
  delay the warning that something downstream is too slow.

- **Verbose logging is heavy.** The two most detailed logging levels
  generate enormous log files quickly on a production bridge. Use them
  only while actively debugging, and drop back afterwards.

## 4. The Settings

The fifteen settings fall into five groups, matching the dividers on the
page.

### 4.1 Log level

How much detail the bridge writes to its main log. Five levels, from
most to least detail:

| **Level** | **What it captures**                                                                      |
|-----------|-------------------------------------------------------------------------------------------|
| Trace     | Everything — every internal event. For deep debugging only; very heavy.                   |
| Debug     | Per-session and per-message detail. Heavy, but manageable for a while.                    |
| Info      | Significant events only — sessions up and down, error conditions. The production default. |
| Warn      | Only things that might be wrong; suppresses routine information.                          |
| Error     | Only outright failures; suppresses warnings.                                              |

Keep production on Info. Raise to Debug or Trace only to investigate a
specific problem, and return to Info when done — the detailed levels
fill disks fast.

### 4.2 Audit — raw traffic capture

"Raw traffic" means every FIX message that crosses the bridge — the
market data coming in, the orders going out, the session heartbeats,
everything — written to disk exactly as exchanged. It is invaluable for
post-trade analysis, dispute resolution, compliance, and debugging. Four
settings:

- **Capture on/off** — whether raw traffic is written to disk at all.
  Off means less disk used and less detail retained.

- **Retention hours** — how many hours of captured traffic to keep
  before older files are pruned (typically 6 to 24; longer for
  compliance, shorter for tight disk).

- **File size** — the capture is split into rotating files; each starts
  a new one at this size (typically 50 MB). Smaller files are easier to
  move and inspect but more numerous.

- **Compression** — how rotated files are compressed: none (fastest,
  largest), or one of two standard formats. One good-ratio, low-effort
  format is the usual choice; the other is more widely compatible.

### 4.3 Audit — order-book snapshots

Separate from raw traffic, the bridge can periodically snapshot its own
processed view of the order book — the merged depth-of-market picture it
builds from all its sources. These snapshots are what let you
reconstruct "what did the book look like at 10:42:03?" after the fact.
Four settings, mirroring the raw-traffic group: an on/off switch,
retention hours (for example, 48 — two days), a snapshot interval in
seconds (for example, one snapshot per second during active sessions;
more seconds between snapshots when quieter), and a rotating file size
(typically 100 MB). Lower snapshot intervals give more detail at the
cost of more disk and processing.

### 4.4 Incident bundles

When the bridge detects a significant problem, it can automatically
export an "incident bundle" — a single package containing the relevant
raw traffic, order-book snapshots, and log slices from around the time
of the event. It is the first thing to reach for in a post-mortem.
Settings:

- **Bundle location** — the folder where bundles are written.

- **Maximum bundles** — how many to keep before the oldest is pruned
  (for example, 100).

- **Automatic triggers** — which conditions cause a bundle to be
  exported. You may enable any combination:

| **Trigger**           | **The condition that fires it**                                                                                     |
|-----------------------|---------------------------------------------------------------------------------------------------------------------|
| Session gap           | A FIX session dropped or reconnected with a gap in message numbering — usually network trouble or an LP-side issue. |
| Book stale (extended) | The order book stopped updating for longer than an internal threshold — usually an upstream market-data problem.    |
| Mass reject           | A burst of order rejections crossed a threshold — often a rule, a bad setting, or an unhappy LP.                    |
| Forced sequence reset | A forced reset of message numbering on a session — part of recovering from severe session trouble.                  |

The usual practice is to enable all four: bundles are cheap to produce
and invaluable to have after the fact.

### 4.5 Backpressure

Backpressure is the bridge’s self-protection against a slow downstream
consumer. Each of three internal buffers holds a limited number of
messages; when a buffer fills, new arrivals are dropped rather than held
indefinitely or allowed to block everything upstream. This keeps one
slow consumer from cascading into a bridge-wide stall. The three caps:

| **Buffer**          | **Holds**                                                                             | **Typical size**          |
|---------------------|---------------------------------------------------------------------------------------|---------------------------|
| Trading outbound    | Messages queued for delivery to trading sessions — order flow is relatively low-rate. | Smallest (e.g. 10,000).   |
| Market-data inbound | Incoming market-data messages waiting to be processed — the chattiest stream.         | Largest (e.g. 100,000).   |
| Order-book publish  | Processed order-book updates queued for downstream consumers.                         | In between (e.g. 50,000). |

If the bridge routinely hits a cap and drops, that is a signal that
something downstream is too slow, or the cap is too low. Raise caps
cautiously and watch memory — fixing the underlying slowness is usually
more useful than raising a cap.

## 5. Common Tasks

### 5.1 Enable full audit for a compliance requirement

1.  Turn on raw-traffic capture and order-book snapshots.

2.  Set retention to your compliance window (for example, seven days).

3.  Confirm a good-ratio compression format is selected to save disk,
    then save and restart the FIX Bridge service.

### 5.2 Turn on verbose logging temporarily

4.  Change the log level from Info to Debug, save, and restart the FIX
    Bridge service.

5.  Reproduce the problem and collect the logs.

6.  Change the level back to Info, save, and restart again — be
    disciplined about this second step; leaving a detailed level on
    fills disks.

### 5.3 Investigate dropped messages

The logs record a "queue full, dropping" warning when a cap is hit. If
the market-data buffer is the culprit, the processor after it is too
slow; if the trading-outbound buffer is, the session writer to an LP is
too slow. Raise the cap gradually and watch memory, but fix the
underlying slowness where you can.

## 6. Saving and Restarting

- Saving raises the **yellow restart banner** and confirms with a short
  "restart to apply" message.

- The bridge keeps running on its old settings until the **FIX Bridge
  service** is restarted — which drops and re-establishes the FIX
  sessions, so time it with the desk. The banner clears itself shortly
  after.

## 7. Live Status and Service Panels

- **Live status** — shows how many FIX sessions are connected of those
  configured, the last message time, and the inbound and outbound
  message rates.

- **Recent changes** — lists the last few edits to these settings, with
  attribution.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file and Log directory.

## 8. Troubleshooting

### 8.1 The bridge will not start after I saved

Check the bridge log (its directory is shown in the Service panel).
Common causes: the incident-bundle folder does not exist and cannot be
created (fix permissions or pre-create it); a backpressure cap set to
zero (all three must be positive); or an absurdly small file size (the
bridge may refuse it, or rotate so fast it cannot keep up).

### 8.2 Disk is filling up fast

Check, in order: raw-traffic retention (too long?), order-book snapshot
retention (same), the log level (did someone leave it on a detailed
level?), and the incident folder (too many bundles — lower the maximum).

### 8.3 Incident bundles are not being generated

Confirm the trigger for that event type is enabled, that the bundle
folder is writeable by the service, and that the maximum-bundles cap and
the disk both have room.

### 8.4 Messages are being dropped

Backpressure has kicked in somewhere. Find the offending buffer in the
logs, then either raise its cap gradually (watching memory) or, better,
address the downstream slowness causing the backlog.

### 8.5 I saved, but the log level did not change

The FIX Bridge service has not been restarted — the log level is read at
startup. Restart the service.

*End of guide — Settings › FIX bridge. One of nine Settings operator
guides.*
