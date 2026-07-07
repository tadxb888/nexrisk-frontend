---
id: task-route-sanity
title: "Route Sanity — operating guide"
type: task
domain: operations
module: route_sanity
minLevel: VIEW
route: /route-sanity
order: 12
source:
  - "Route_Sanity_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [route-sanity, lp-health, latency, fill-rate, reject-rate, slippage, breach, fallback, recovery]
status: reviewed
version: exec-v3
---

## 1. About This Reference

This reference documents the Route Sanity page in full. It is written
for the people who watch the broker’s liquidity-provider routes day to
day — dealers, pricing operators and risk managers — and it treats every
panel, column and threshold in detail rather than summarising.

"Route sanity" is a simple question asked continuously about each
liquidity provider: **is this a safe, healthy route to hedge through
right now?** The page answers it visually — showing each provider’s
connectivity, latency, uptime and rejection rate, plus a per-symbol
breakdown — and lets you set the limits at which a provider should be
considered unhealthy.

**Two layers.** It helps to hold two related things apart. This **page**
is the watch-and-alert layer: a live monitor with per-provider limits
you set to colour and flag anything out of range. Separately, the
platform also runs an automated **route-sanity gate** during hedging
that can act on its own — pausing a rule or switching to a backup
provider when a provider breaches its health limits. Section 9 explains
that gate as context. The limits you set on this page are a monitoring
aid held in your browser; they are distinct from the gate’s own
server-side configuration.

## 2. What Route Sanity Measures

A route is the path a hedge takes to a liquidity provider. A route is
"sane" when the provider is connected, responding quickly, filling
orders rather than rejecting them, and quoting a spread that makes
economic sense against MT5. The page tracks these signals:

- **Connectivity / Status** — is the provider connected and logged on? A
  disconnected provider is never a safe route.

- **Latency** — how long the provider takes to respond, in milliseconds.
  Rising latency means slower fills and more slippage risk.

- **Uptime** — the share of time the provider has stayed connected. A
  route that keeps dropping is unreliable even if it is fast when up.

- **Rejection rate** — the share of orders the provider rejects. High
  rejections mean hedges are not getting done.

- **Delta spread** — the difference between the provider’s spread and
  the MT5 spread, in pips. It shows whether the broker earns or pays on
  the spread when routing to this provider (Section 6.2).

The page shows these at two levels: per provider (the Active LPs panel)
and per symbol within a provider (the Symbol Breakdown panel). Each
numeric signal is also tracked over two windows — the day so far and the
last 60 minutes — so a recent deterioration stands out against the daily
average.

## 3. How the Page Is Laid Out

Below the page header sit three side-by-side panels, each of which can
be widened or narrowed by dragging the divider between them:

- **Active LPs (left)** — every enabled provider, with its status and
  route-level health.

- **Symbol Breakdown (middle)** — for the provider you select, its
  per-symbol figures.

- **Thresholds (right)** — the limits for the selected provider,
  editable, with a Save button. This panel opens when you tick a
  provider’s checkbox and can be closed again.

A footer line reminds you of the two things worth remembering: the
metrics shown (Latency, Rejection, Delta Spread as LP minus MT5 pips),
and that thresholds are saved per provider in your browser while uptime
is tracked from when your session started.

## 4. The Header

The header shows the page name, a small "Today" marker (the figures
cover the current day), and a live-connection badge on the right:
**Live** (green) when the data feed is connected, **Connecting** or
**Reconnecting** (amber) while it establishes, and **Disconnected**
(red) if it drops — with a small reconnect control. If the provider list
fails to load, a red banner offers a Retry.

## 5. Panel 1 — Active LPs

The left panel lists every enabled liquidity provider. Its subtitle
counts how many are **active** versus **inactive** — active meaning
connected, degraded, reconnecting or connecting; inactive meaning fully
down. If there are no enabled providers, the panel says so and points
you to the Liquidity Providers page to enable them.

### 5.1 The columns

| **Column**        | **Shows**                                                                                                                               |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| (checkbox)        | Ticking it opens the Thresholds panel for that provider. Only one provider’s thresholds show at a time.                                 |
| LP                | The provider name, with a small status dot. If any daily figure is out of range, the name turns amber and a ▲ marker appears (see 5.3). |
| Status            | The connection state (for example CONNECTED), colour-coded.                                                                             |
| Lat/Day · Lat/60m | Response latency in milliseconds, over the day and the last 60 minutes.                                                                 |
| Up/Day · Up/60m   | Uptime as a percentage, over the day and the last 60 minutes.                                                                           |
| Rej/Day · Rej/60m | Rejection rate as a percentage, over the day and the last 60 minutes.                                                                   |

Clicking a provider row selects it — the row gets a teal edge — and
drives the Symbol Breakdown and Thresholds panels to that provider.

### 5.2 Status values and colours

| **Colour** | **States**                                        | **Meaning**                                               |
|------------|---------------------------------------------------|-----------------------------------------------------------|
| Green      | CONNECTED, LOGGED_ON                              | Healthy and connected.                                    |
| Amber      | DEGRADED, RECONNECTING, CONNECTING                | Transitional or impaired — counts as active but watch it. |
| Red        | DISCONNECTED, STOPPED, QUARANTINED, SESSION_ERROR | Down or quarantined — not a usable route.                 |

### 5.3 Breach highlighting

Each numeric cell is compared against the thresholds you set for that
provider. A **latency** or **rejection** figure that exceeds its limit
turns amber and bold; an **uptime** figure below its limit turns amber
(and healthy uptime shows green). If any daily figure breaches, the
provider’s name is flagged amber with a **▲** so a problem provider is
visible at a glance without reading every cell.

### 5.4 How uptime is measured

Uptime is calculated in your browser, live, from the moment your session
started: it is the connected time divided by the elapsed session time,
as a percentage (capped at 100). It updates every few seconds and reacts
to the provider’s connect and disconnect events as they arrive. Because
it is measured from session start, **uptime reflects this session, not a
server-side historical figure** — a freshly opened page will read 100%
until a disconnect occurs.

## 6. Panel 2 — Symbol Breakdown

The middle panel breaks the selected provider down by symbol. Its
subtitle names the provider and counts the symbols. Until you select a
provider it prompts you to; if the provider has no instruments loaded,
it asks you to connect it to populate them.

### 6.1 The columns

| **Column**        | **Shows**                                                                                                                    |
|-------------------|------------------------------------------------------------------------------------------------------------------------------|
| Symbol            | The instrument name at the provider.                                                                                         |
| Δ Spread          | Delta spread — the provider spread minus the MT5 spread, in pips, tagged Cost / Earning / Flat (see 6.2). Display only.      |
| RT/Day · RT/60m   | Average round-trip time in milliseconds, over the day and the last 60 minutes. Amber when over the symbol latency threshold. |
| Vol               | Traded volume for the symbol.                                                                                                |
| Rej/Day · Rej/60m | Rejection rate for the symbol, over the day and the last 60 minutes. Amber when over the symbol rejection threshold.         |

### 6.2 Delta Spread — read this carefully

Delta spread is **the provider’s spread minus the MT5 spread, in pips**.
It tells you whether routing this symbol to this provider earns or costs
the broker on the spread, and it is display-only — there is no threshold
on it. The sign is what matters:

| **Reading**                    | **Tag** | **Colour** | **Meaning**                                                                                |
|--------------------------------|---------|------------|--------------------------------------------------------------------------------------------|
| Negative (LP tighter than MT5) | Earning | Green      | The provider’s spread is tighter than what MT5 shows — the broker earns on the difference. |
| Positive (LP wider than MT5)   | Cost    | Amber      | The provider’s spread is wider than MT5’s — the broker pays the difference.                |
| Zero (matched)                 | Flat    | Grey       | The two spreads match — no edge either way.                                                |

The value is shown as an absolute number of pips followed by the tag,
for example "11.5 pip Cost" or "6.5 pip Earning". Watching this per
symbol shows where a provider is a cheap route and where it quietly
costs the broker.

## 7. Panel 3 — Thresholds

The right panel holds the limits for the selected provider. It opens
when you tick a provider’s checkbox, shows the provider name, and has a
Save button and a close control. Thresholds are per provider, so each
provider can have its own limits.

### 7.1 The rows

There are five rows, grouped by level. Each has a **Level** (Route or
Symbol), a **Metric**, a **Lmt** direction (max means "flag when above",
min means "flag when below"), and two editable values — **/Day** and
**/60m** — for the day and 60-minute windows. The defaults are:

| **Level** | **Metric** | **Limit** | **/Day default** | **/60m default** |
|-----------|------------|-----------|------------------|------------------|
| Route     | Latency    | max       | 100 ms           | 50 ms            |
| Route     | Uptime     | min       | 99 %             | 99.5 %           |
| Route     | Rejection  | max       | 10 %             | 1 %              |
| Symbol    | Latency    | max       | 100 ms           | 50 ms            |
| Symbol    | Rejection  | max       | 10 %             | 1 %              |

Route-level limits colour the Active LPs panel; symbol-level limits
colour the Symbol Breakdown panel. There is deliberately **no
delta-spread threshold** — delta spread is informational only.

### 7.2 Editing and saving

The /Day and /60m cells edit on a single click — type a new number and
move on. While you have unsaved edits the button reads **● Save**
(highlighted); click it to store the change, after which it reads
**Saved**. Saving re-colours the other panels against the new limits
immediately.

|                                                                                                                                                                                                                                                                                                                                                                                                    |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Note — where thresholds live.** Thresholds are saved per provider in your browser’s local storage. They travel with this browser on this machine, not with your account, and they are a monitoring aid only — they colour and flag the display. They are separate from the automated route-sanity gate’s own limits (Section 9); changing a threshold here does not change how the gate behaves. |

## 8. What Is Live Now, and What Is Pending

The page is built to show a full set of health metrics, and it fills
them in as their data sources come online. Today:

- **Live now:** provider Status and Uptime (tracked in the browser from
  session start), and Delta Spread (from the spread data).

- **Shown as — until supplied:** latency, round-trip, volume and
  rejection figures display a dash until the platform’s health data
  feeds them. A dash therefore means "not yet available", not "zero".

This is why, on a freshly connected provider, you may see a healthy
green Status and 100% uptime while the latency and rejection columns
still read —. As those feeds populate, the cells fill and the threshold
colouring begins to apply.

## 9. The Automated Route-Sanity Gate (Context)

Beyond this monitoring page, the platform runs an automated route-sanity
gate as part of hedging. It is worth understanding, because it is what
actually protects the book when a provider goes bad — the page is where
you watch; the gate is where the platform acts.

### 9.1 What it checks

Before dispatching a hedge to a provider, the gate reads that provider’s
current health and checks it against configured limits, over a rolling
window. The checks, in order, are:

- **Connectivity** — a disconnected provider is always a breach.

- **Heartbeat** — has the provider gone silent longer than allowed?

- **Latency** — is the response time above the maximum?

- **Fill rate** — is the share of orders filled below the minimum?

- **Reject rate** — is the rejection share above the maximum?

- **Slippage** — is average slippage above the maximum, in pips?

If none is breached, the hedge passes through to the provider. If any is
breached, the gate takes the configured action.

### 9.2 What it does on a breach

| **Action**                     | **Effect**                                                                                                                                                                                                                                 |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Pause rule                     | The hedge rule is paused so no further hedges route through the unhealthy provider until it recovers.                                                                                                                                      |
| Stop rule                      | The rule is stopped outright.                                                                                                                                                                                                              |
| Fall back to a backup provider | The hedge is re-routed to a configured backup provider — but only after that backup’s own health is checked. If the backup is also breached, the gate escalates to pausing the rule instead, rather than route into a second bad provider. |

A breach with no backup configured also falls back safely to pausing the
rule, so a missing backup never results in hedging through an unhealthy
route.

### 9.3 Recovery

When a provider becomes healthy again, recovery depends on the policy.
Under **automatic restore** the platform brings the route back on its
own; under **manual** it waits for a person. To avoid flapping, recovery
can require the provider to stay healthy for a hold period and to pass a
number of consecutive healthy checks (stability confirmations) before
the route is restored — typically back to the original provider.
Breaches and recoveries can raise notifications.

|                                                                                                                                                                                                                                                                                                                                                                        |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Keep the two threshold sets distinct.** The gate’s limits (latency, fill rate, reject rate, slippage, heartbeat, and the breach/recovery behaviour) are configured server-side per hedge rule and provider. The thresholds on this page are your own browser-side monitoring limits. They describe the same kinds of signal, but they are set and stored separately. |

## 10. How This Page Connects to Other Pages

- **Liquidity Providers** — the Active LPs list is drawn from enabled
  providers there. If a provider is missing, enable it on that page.

- **Hedging Strategies and the gate** — the automated route-sanity gate
  protects hedge rules; a rule that has been paused or switched to a
  backup provider by the gate reflects a health breach seen here.

- **Execution Report** — the round-trip and rejection behaviour
  summarised here is visible order-by-order there; use it to investigate
  a provider whose latency or rejections are climbing.

- **Price Rules** — the MT5 spread that delta spread compares against is
  shaped by the price feed and any spread rules; a persistent Cost
  reading may trace back to spread configuration.

## 11. Pitfalls and Notes

- **A dash is not a zero.** Latency, round-trip, volume and rejection
  read — until their data feeds populate; do not read a dash as a
  healthy zero.

- **Uptime is per session.** It is measured from when you opened the
  page, so it starts at 100% and only moves after a disconnect — it is
  not a long-run historical figure.

- **Thresholds are local.** They live in this browser and colour the
  display only; they do not drive the automated gate.

- **Delta spread has no limit.** It is informational; there is no
  threshold and no breach flag on it.

- **Amber means "past your limit", not "broken".** It is an alert to
  look, calibrated by the limits you set — tune them so the colours mean
  something for your book.

## 12. Quick Reference

### 12.1 Metric glossary

| **Metric**       | **What it is**                                                     |
|------------------|--------------------------------------------------------------------|
| Latency          | How long the provider takes to respond, in milliseconds.           |
| Uptime           | Share of time the provider stayed connected (this session).        |
| Rejection rate   | Share of orders the provider rejected, as a percentage.            |
| Round-trip (RT)  | Time from sending an order to receiving the response, per symbol.  |
| Delta spread     | Provider spread minus MT5 spread, in pips (Earning / Cost / Flat). |
| Slippage (gate)  | Average price difference between expected and filled, in pips.     |
| Fill rate (gate) | Share of orders filled — the complement of rejection.              |

### 12.2 Threshold defaults

| **Level · Metric** | **Direction** | **/Day** | **/60m** |
|--------------------|---------------|----------|----------|
| Route · Latency    | max           | 100 ms   | 50 ms    |
| Route · Uptime     | min           | 99 %     | 99.5 %   |
| Route · Rejection  | max           | 10 %     | 1 %      |
| Symbol · Latency   | max           | 100 ms   | 50 ms    |
| Symbol · Rejection | max           | 10 %     | 1 %      |

### 12.3 Colours at a glance

| **Colour** | **Means**                                                                          |
|------------|------------------------------------------------------------------------------------|
| Green      | Healthy — connected, or uptime within limit, or delta spread earning.              |
| Amber      | Attention — transitional status, a figure past your limit, or a delta-spread cost. |
| Red        | Down — disconnected, stopped, quarantined or errored.                              |
| Grey / —   | No data yet, or delta spread flat.                                                 |

*End of reference.*
