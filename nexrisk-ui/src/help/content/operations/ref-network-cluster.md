---
id: ref-network-cluster
title: "Network Cluster — operating guide"
type: reference
domain: operations
module: cockpit
minLevel: VIEW
route: /infra
order: 4
source:
  - "Network_Cluster_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [network-cluster, infra, world-map, nodes, lp-nodes, mt5-nodes, topology]
status: reviewed
version: summary-v3
---

## 1. About This Reference

The Network Cluster page is a single geographic picture of the whole
Taiga estate and the venues it connects to. It plots the platform’s own
servers — frontend, backend, and MT5 nodes — and the liquidity providers
it trades through on a world map, draws the live links between them, and
colours everything by health. In one glance it answers: what is running,
where it is, how the boxes are connecting to each other, how far away
(in latency) each liquidity venue is, and whether any box is under
strain.

This reference explains every element of the map in full — the two kinds
of pin, the connection lines, the status colours, the metrics (including
backend-to-provider latency and per-node system usage), the detail
cards, and the controls. It is written for operations staff and risk
managers who need to read the estate’s health at a glance and drill into
any node or venue.

## 2. What You Are Looking At

The page is a dark world map. On it sit two layers of pins and the lines
that connect them:

- **Nodes (circles)** — Taiga’s own deployed servers: the frontend, the
  backend, and the MT5 nodes. These are boxes the platform runs and
  monitors.

- **Liquidity Providers (diamonds)** — the external venues the platform
  connects to over FIX to price and hedge. These are not Taiga’s boxes,
  but its counterparties.

- **Links (lines)** — animated lines from the backend to the MT5 master
  and to each live provider, showing which connections are active.

Everything is coloured by health, so a problem anywhere in the estate
shows up as a spot of amber or red on an otherwise green map. Clicking
any pin opens a detail card for it.

## 3. The Two Kinds of Pin

### 3.1 Nodes (circles) — Taiga’s own servers

Circles are the platform’s deployed servers. Each has a role:

| **Role**     | **What it is**                                                                                               |
|--------------|--------------------------------------------------------------------------------------------------------------|
| Frontend     | The web application server that serves the user interface.                                                   |
| Backend      | The core engine — the hub of the estate, from which the links to the MT5 master and the providers are drawn. |
| MT5 · Master | The primary MT5 server the platform manages (the master node in the trading platform).                       |
| MT5 Node     | A further MT5 server in the estate (for example a standby or an additional broker node).                     |

For the servers the platform monitors, a node carries live system usage
— CPU, RAM and disk — and the number of users connected. Some nodes are
external and not monitored for host metrics; their card simply notes
**"External node — host metrics not monitored."**

### 3.2 Liquidity Providers (diamonds) — connected venues

Diamonds are the liquidity venues the platform connects to over FIX.
Each carries its connection status, its round-trip latency to the
backend (RTT), when it was last active, its FIX host, its session, and
its location. A healthy, actively-trading provider gently pulses; an
idle or offline one does not.

## 4. The Connections

The lines are the point of the map — they show how the estate is wired
together in real time. Two kinds are drawn, both from the backend, which
is the hub:

| **Link** | **Colour** | **From → To**                | **Meaning**                                                              |
|----------|------------|------------------------------|--------------------------------------------------------------------------|
| MT5 link | Amber      | Backend → MT5 Master         | The backend’s connection to the primary MT5 server it manages.           |
| LP link  | Teal       | Backend → each live provider | The backend’s connection to each liquidity provider that is not offline. |

The lines **flow** — a moving dashed animation — to convey that the
connection is live and carrying traffic. A link is only drawn when both
ends are visible and the provider is not offline, so the set of lines on
the map is, at any moment, the set of live connections from the backend.
If a provider drops offline, its line disappears; if you hide a pin
(Section 8.2), its lines hide with it.

## 5. Status at a Glance — the Colours

Colour carries the same meaning across pins and cards, so the map reads
instantly:

**Green** = healthy. **Amber** = degraded or idle. **Red** = offline.

| **Colour** | **A node (circle) is…**     | **A provider (diamond) is…**                     |
|------------|-----------------------------|--------------------------------------------------|
| Green      | Online — running normally.  | Active — connected and trading.                  |
| Amber      | Degraded — up but impaired. | Connected but idle — linked, no recent activity. |
| Red        | Offline — not responding.   | Offline — not connected.                         |

## 6. The Metrics

Beyond status, the map surfaces the numbers that matter for running the
estate: how far away each venue is, and how hard each box is working.

### 6.1 RTT — backend-to-provider latency

**RTT (round-trip time)** is the time, in milliseconds, for a message to
travel from the backend to a liquidity provider and back. It is the
single best measure of how "far" a venue is in network terms, and it
directly affects how quickly hedges are acknowledged and how much
slippage risk a route carries. It is shown on each provider’s detail
card.

Lower is better. A steady, low RTT means a responsive venue; a rising
RTT means the route is slowing and is worth watching (the Route Sanity
page, Section 11, tracks this over time and can act on it).

|                                                                                                                                                                                                                                              |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Reading RTT.** A provider showing **12 ms** is very close and responsive. One showing **180 ms** is far or congested — fills will be slower and slippage more likely. If a normally-fast venue suddenly reads high, the link is degrading. |

### 6.2 CPU, RAM and Disk — per-node system usage

Each monitored node shows three usage bars — processor, memory and disk
— as a percentage, colour-graded so a box under strain stands out:

| **Usage**     | **Colour** | **Read**                                          |
|---------------|------------|---------------------------------------------------|
| Below 75%     | Teal       | Comfortable headroom.                             |
| 75% – 89%     | Amber      | Getting busy — keep an eye on it.                 |
| 90% and above | Red        | Under strain — at risk of slowing or running out. |

A node can be Online (green status) yet show a red CPU bar — it is
running, but hot. Persistent red usage is the early warning before a
node degrades.

### 6.3 Users connected

For monitored nodes, the detail card shows how many users are currently
connected to that server — useful for seeing where load is concentrated
and for confirming the frontend is actually serving people.

### 6.4 Freshness — "last activity" and age

Each pin’s card shows how long ago its data was last updated (for a
node) or when the provider was last active (for a venue), in a plain
"12s ago" / "3m ago" form. This tells you whether what you are looking
at is current — a stale age on a supposedly-live box is itself a signal.

## 7. The Detail Cards

Clicking a pin opens a card on the right with its full detail. Click the
✕ to close it.

### 7.1 Node card

Shows the node’s label and role (and node type), its status with a
freshness age, country (with flag), IP address, the CPU / RAM / Disk
usage bars, and the number of users connected — or, for an unmonitored
external node, a note that host metrics are not collected.

### 7.2 Provider card

Shows the provider’s name, its status with a "last active" age, country
(with flag), FIX host, the RTT in milliseconds, and the session name.
This is the quickest way to read a single venue’s latency and connection
state.

## 8. Controls and Panels

### 8.1 The header

Top-left shows the page title and the subtitle "Live infrastructure &
liquidity across regions". If the live feed is not returning data, an
amber **"No live feed"** badge appears. Top-right shows the counts — how
many nodes and providers — and the time the current picture was
generated.

### 8.2 The Nodes panel — hide and show pins

Top-left, a list of every node and provider with its status dot.
Clicking a row hides that pin from the map (and its links); clicking
again shows it. Hidden rows are struck through. Anything the platform
knows about but cannot place geographically is tagged "no geo" and is
listed here even though it has no pin.

### 8.3 The legend

Bottom-left, the key: the circle (Node) and diamond (Provider) shapes,
the three status colours (Healthy / Degraded-idle / Offline), and the
two link colours (MT5 link amber, LP link teal).

### 8.4 Zoom, pan and the fanned pins

Bottom-right, controls to **zoom in**, **zoom out**, and **reset the
view**.

You can also drag to pan and scroll to zoom, up to 8×. Because location
is resolved from IP addresses to a country’s centre, several nodes in
the same country would otherwise land on the exact same spot; the map
fans coincident pins out into a small ring so every one stays separately
visible and clickable.

### 8.5 The waiting state

If the feed has returned nothing yet, the map shows "Waiting for cluster
feed…" over an empty world — the map is ready and will populate as soon
as data arrives.

## 9. Data and Refresh

The map draws from a single live feed of the cluster’s state, gathered
by the backend and refreshed automatically about every 30 seconds. The
generated-at time in the header tells you how current the picture is.
When the feed is flowing, the map is "live"; when it is not, the "No
live feed" badge appears and the map shows whatever it last had (or the
waiting state). Nothing on this page changes the estate — it is a
read-only monitor.

## 10. How to Read the Map — Scenarios

**All green, lines flowing**

The healthy picture: backend green, MT5 master green with an amber link
flowing to it, providers green with teal links flowing, all usage bars
teal. Nothing to do.

**A provider turns amber, its RTT climbs**

The venue is still connected but idle or slowing. Open its card to read
the RTT and last-active age; if the latency is genuinely high, check the
Route Sanity page for the trend and whether the automated gate has
acted.

**A provider drops red, its line vanishes**

The venue is offline and no longer linked. Hedges cannot route through
it; confirm on the Liquidity Providers page whether it is a session
problem or a venue outage.

**A node is green but its CPU bar is red**

The box is up but under strain. Persistent red usage precedes a node
degrading — investigate the load (the Users figure shows whether it is
traffic) before it becomes an outage.

**The MT5 master link is missing or the master is red**

The backend’s connection to the primary MT5 server is down — a serious
condition for trading. This is where the high-availability and failover
arrangements matter.

## 11. How This Page Connects to Others

- **Route Sanity** — this map shows a provider’s current RTT and status;
  Route Sanity tracks provider latency, uptime and rejections over time
  and drives the automated health gate. Use this map for the "where and
  now", Route Sanity for the "trend and action".

- **Liquidity Providers** — the venues plotted here are configured
  there; a provider that is red on the map is diagnosed and managed on
  that page.

- **High-availability / failover** — the MT5 master and node pins, and
  the backend’s link to the master, are the estate this map watches; a
  failover changes which node is master.

- **The status bar** — the system-usage figures echoed along the bottom
  of every page (CPU, memory, round-trip times) are the same family of
  signals this map makes geographic.

## 12. Quick Reference

### 12.1 Shapes, colours and links

| **Element**    | **Means**                                                  |
|----------------|------------------------------------------------------------|
| Circle         | A Taiga node (frontend, backend, MT5 master, or MT5 node). |
| Diamond        | A liquidity provider (an external FIX venue).              |
| Green pin      | Healthy — node online / provider active.                   |
| Amber pin      | Degraded (node) or connected-but-idle (provider).          |
| Red pin        | Offline.                                                   |
| Amber line     | Backend ↔ MT5 master link.                                 |
| Teal line      | Backend ↔ liquidity provider link.                         |
| Flowing dashes | The link is live and carrying traffic.                     |

### 12.2 Metric thresholds

| **Metric**       | **Teal**                                                                      | **Amber** | **Red**    |
|------------------|-------------------------------------------------------------------------------|-----------|------------|
| CPU / RAM / Disk | Below 75%                                                                     | 75–89%    | 90% and up |
| RTT (latency)    | Lower is better — no fixed band; watch for a normally-low venue reading high. |           |            |

### 12.3 Glossary

| **Term**                | **Meaning**                                                             |
|-------------------------|-------------------------------------------------------------------------|
| Node                    | One of Taiga’s own deployed servers.                                    |
| Liquidity Provider (LP) | An external venue the platform trades through over FIX.                 |
| RTT                     | Round-trip time — backend-to-provider network latency, in milliseconds. |
| MT5 Master              | The primary MT5 server the platform manages.                            |
| FIX host                | The provider’s FIX gateway address.                                     |
| Session                 | The FIX session a provider connection is running.                       |

*End of reference.*
