---
id: task-price-rules
title: "Price Rules Engine — operating guide"
type: task
domain: operations
module: price_rules
minLevel: VIEW
route: /price-rules
order: 8
source:
  - "Price_Rules_Engine_Guide.docx — operating guide (screen-by-screen manual, ingested verbatim)"
related: []
tags: [price-rules,feed,spread,repricing,atr,volatility,news,group-spread,throttle]
status: reviewed
version: exec-v3
---

## 1. About This Reference

This is a full configuration and operations reference for the Price
Rules page. Unlike a quick guide, it treats every parameter in detail,
explains the reasoning and the technical model behind each control, and
calls out the pitfalls that cause the most support time. It is written
for the person who sets prices up and keeps them running — a pricing
operator, dealer or administrator.

The Price Rules Engine is exactly that: an **engine** that reprices
every liquidity-provider tick before it reaches MT5, plus a **live log
of the logic** driving it. It cannot be summarised into a few lines,
because its behaviour is the sum of many interacting rules evaluated on
every tick. This document therefore walks the whole thing, tab by tab,
field by field.

**This page does not work alone.** It depends on the Symbol Mapping page
(to translate provider symbols to MT5 symbols), on the Gateway (to
deliver the repriced prices to MT5 terminals), and — for group spreads —
on the MT5 Admin group configuration and the manager login’s
permissions. Section 3 sets out those links, and they recur throughout
as pitfalls.

## 2. What the Price Rules Engine Does

The engine sits in the middle of the price path. Raw prices arrive from
the liquidity provider, the engine reprices them according to your
rules, and the result is delivered to MT5 client terminals. It also
manages, separately, the per-group spread markup that MT5 applies on top
of that shared price.

The page has three tabs, and the rest of this document follows them:

- **Feed Management** — defines each price feed: which provider, which
  MT5 server, which symbols and groups, throttling, and the volatility
  model. This is the foundation; spread rules attach to a feed.

- **Spread Rules** — conditional repricing rules that widen or tighten
  the published price under chosen conditions (always, on a schedule,
  during volatility, or around news). These change the one shared price
  everyone receives.

- **Group Spreads** — per-group, per-symbol spread markup applied inside
  MT5’s own group configuration, so different client groups can see
  different spreads from the same feed price.

**The header strip above the tabs is the engine’s health readout**
(Section 4). Keep an eye on it — several of its counters are the fastest
way to catch a misconfiguration.

## 3. The Pipeline, and How It Connects to Other Pages

Every incoming provider tick is put through a fixed sequence of checks.
Understanding this order explains why a rule fires or doesn’t, and where
a tick can be dropped. The engine stops at the first repricing rule that
matches; if none matches it falls through to the feed’s per-symbol
override, then the feed’s global default, then the raw price.

| **\#** | **Step on each tick**                                       | **What happens if it fails**                 |
|--------|-------------------------------------------------------------|----------------------------------------------|
| 1      | Feed availability window (Always / Schedule / Manual)       | Tick dropped.                                |
| 2      | Translate provider symbol → MT5 symbol (via Symbol Mapping) | Tick dropped, "Symbol Misses" counter rises. |
| 3      | Throttle: has the minimum interval passed for this symbol?  | Tick suppressed, "Throttled" counter rises.  |
| 4      | Update the ATR volatility ratio for this symbol             | Returns neutral (1.0) during warm-up.        |
| 5      | Check whether a news window is currently active             | No news → news condition is inactive.        |
| 6      | Walk the spread rules in priority order — first match wins  | No match → fall through to step 7.           |
| 7      | Per-symbol repricing override for the feed                  | None → fall through to step 8.               |
| 8      | Feed global repricing default                               | None → deliver the raw price.                |
| 9      | Publish the repriced price → Gateway → MT5 terminals        | On delivery failure, "Ticks Dropped" rises.  |

### 3.1 Symbol Mapping — the reverse-lookup dependency

Step 2 above is a hard dependency on the Symbol Mapping page. The
provider quotes its own symbol names; the engine must translate each one
to the matching MT5 symbol before it can do anything with the tick. If a
symbol is not mapped, the tick is dropped and the "Symbol Misses"
counter climbs.

|                                                                                                                                                                                                                                                                                                           |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pitfall — unmapped symbols.** A rising "Symbol Misses" count means the Symbol Mapping table is missing entries. Fix it on the Symbol Mapping page, not here. Until the symbol is mapped, no feed, spread rule or price for it will reach MT5, and the hedge engine will also fail to route that symbol. |

### 3.2 The Gateway — delivery to MT5

After repricing, the engine hands the price to the Gateway, which
streams one price to all client terminals. There is no per-client or
per-group field on a tick. That single-price-to-everyone fact is the
entire reason Group Spreads (Section 8) exist as a separate mechanism:
per-group differences can only be applied inside MT5, not in the feed.

### 3.3 The Master MT5 node

Feeds and group filters always target the Master MT5 node. The symbol
and group lists offered in the editors are read from that master node,
so it must be connected for those pickers to populate. If no master node
is connected, group pickers show a "No master node" warning.

### 3.4 MT5 Admin — the group Symbols prerequisite

For Group Spreads specifically, MT5 will only let the platform manage
(and stream prices for) a symbol in a group if that symbol is explicitly
listed in the group’s Symbols tab in MT5 Admin. This is covered in full
in Section 8.4 — it is the single most common cause of a group spread
failing to apply.

## 4. The Header: Pipeline Status and Live Stats

The strip below the page title reports the running engine. Watch it;
most misconfigurations show up here first.

| **Indicator**    | **Meaning**                                                   | **What a value tells you**                                                       |
|------------------|---------------------------------------------------------------|----------------------------------------------------------------------------------|
| Pipeline Running | Whether the engine initialised and is processing ticks.       | If it reads "Stopped", nothing is being repriced and every counter will be zero. |
| Active Feeds     | How many feeds are currently ACTIVE.                          | Zero means no feed is live — check feed status.                                  |
| Ticks Delivered  | Repriced ticks successfully sent to MT5.                      | Should be climbing steadily on a healthy feed.                                   |
| Ticks Dropped    | Ticks discarded (bad data, outside window, delivery failure). | A rising count is worth investigating; occasional drops are normal.              |
| Throttled        | Ticks suppressed by the throttle.                             | Non-zero is normal and expected when throttle is on.                             |
| Symbol Misses    | Ticks dropped because the symbol is not mapped.               | Non-zero is actionable — go to Symbol Mapping.                                   |
| Active News      | News windows currently in effect.                             | Non-zero means news-condition rules can fire right now.                          |
| Vol Tracked      | Symbols for which the ATR tracker has started building state. | Grows over time as symbols receive ticks — this is normal.                       |

## 5. Tab 1 — Feed Management

A feed is the foundation: it names the provider, the MT5 destination,
the symbols and groups in scope, the throttle, and the volatility model.
Spread rules attach to a feed, so a feed must exist before rules can be
written against it.

### 5.1 The feed list

Each feed is a row. Click a row to open its read-only detail panel
(5.2). The columns are:

| **Column**    | **Shows**                                                                                                                                                                                                                        |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Feed          | The feed name, with the description as a subtitle beneath it.                                                                                                                                                                    |
| LP → MT5      | The source liquidity provider and the destination MT5 node (for example "TraderEvolution Sandbox → Ross Weiler").                                                                                                                |
| Status        | A coloured badge — ACTIVE, PAUSED or STOPPED — followed by small one-letter quick-toggle buttons to switch to the other status (e.g. an "S" to set STOPPED). Clicking one changes status immediately without opening the editor. |
| Priority      | The evaluation priority; lower runs first when more than one feed could handle a provider’s tick.                                                                                                                                |
| Throttle      | On (with the interval, in amber) or Off.                                                                                                                                                                                         |
| ATR           | The two ATR periods as "fast / slow" (for example 20 / 200).                                                                                                                                                                     |
| Sync / Delete | Per-row actions — see 5.4 and below.                                                                                                                                                                                             |

### 5.2 The feed detail panel (read-only)

Clicking a feed row opens a summary panel with four sections:

- **Symbol Filter** — the symbols the feed is limited to, with a count.
  Empty means all symbols.

- **Target MT5 Groups** — the groups the feed targets, with a count.
  Empty means all groups.

- **Pipeline Stats** — the live counters (Ticks Delivered, Ticks
  Dropped, Throttled, Symbol Misses, Vol Tracked) for all active feeds.

- **Audit** — when the feed was created and last updated.

### 5.3 Creating or editing a feed — every parameter

The New Feed button (and the Edit panel on an existing feed) opens the
feed editor. Save writes the change and the engine re-reads its
configuration automatically — no restart. Each parameter:

**Status**

A toggle between **ACTIVE** ("Ticks flow · ATR evaluates") and
**STOPPED**. A third state, **PAUSED**, is also available from the
list’s quick-toggles. ACTIVE means the feed processes and delivers
ticks; STOPPED means it does not. Only ACTIVE feeds contribute to the
pipeline and to the volatility tracker.

**Feed Name (required) and Priority**

A human name for the feed. **Priority** (default 100) sets the order
when more than one feed could handle the same provider’s tick; **lower
runs first**. With a single feed per provider, priority rarely matters,
but keep it deliberate if you run several.

**Description**

Optional free text, shown as the subtitle under the feed name in the
list.

**Liquidity Provider (required)**

The source provider whose raw prices this feed consumes. This must match
a configured provider; it is the "LP" side of the LP → MT5 pairing.

**MT5 Server (required)**

The destination MT5 node. As the editor notes, this is the **Master node
only** — and the symbol and group filters depend on it, because their
pick-lists are read from that node. It shows the node’s live connection
state next to the name.

**Symbol Filter**

The provider symbols this feed handles, entered as tags. **Empty = all
symbols**. Narrow this only when you want a feed to carry a subset.
Remember these are provider-native names, and each must be mapped on the
Symbol Mapping page or its ticks will be dropped at step 2.

**Target MT5 Groups**

The MT5 groups the feed targets, as tags from the master node’s group
list. **Empty = all groups**. (Group targeting here is authoring
metadata; per-group price differentiation is done in the Group Spreads
tab, Section 8.)

**Tick Throttle**

A toggle plus an interval. When **on**, the feed publishes at most one
tick per symbol per chosen interval; ticks that arrive sooner are
suppressed (and counted under "Throttled") — the next tick after the
interval is delivered, so nothing is permanently lost. Throttling
protects MT5 and the network from an over-fast feed. The interval
options are:

| **Interval**       | **Note**                                        |
|--------------------|-------------------------------------------------|
| 5 ms               |                                                 |
| 10 ms              |                                                 |
| 20 ms              | LP native — matches the provider’s own cadence. |
| 25 / 50 ms         |                                                 |
| 100 ms             | NexRisk default.                                |
| 200 / 250 / 500 ms | Progressively heavier throttling.               |

Leave throttle off if you want every tick delivered; turn it on (and
expect a non-zero "Throttled" count) when the feed is noisier than MT5
needs.

**ATR Volatility Model — Fast EMA Period and Slow EMA Period**

These two numbers configure the volatility signal that the VOLATILITY
spread condition reads. Because this is the most technical part of the
page, it gets a full explanation of its own in Section 6. In the editor
you set just two values:

- **Fast EMA Period** (default 20) — "Sensitivity to spikes". A shorter
  period reacts faster to sudden moves.

- **Slow EMA Period** (default 200) — "Baseline stability". A longer
  period gives a steadier long-run baseline to compare against.

|                                                                                                                                                                                                                                                        |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Rules — ATR periods.** The fast period must be at least 20. The slow period must be at least 20 and strictly greater than the fast period. Values that break either rule are rejected. Changing the periods resets the volatility warm-up (see 6.4). |

### 5.4 The Sync button

"Sync" on a feed row forces the engine to re-read that feed’s
configuration from the database, reset the ATR warm-up state, and
refresh the news cache. Configuration changes already reload
automatically on save, so you rarely need this — use it after a service
restart, or if settings on screen appear out of step with the engine’s
behaviour.

### 5.5 Deleting a feed

Delete removes the feed after a confirmation. Its spread rules go with
it. A running feed should normally be set to STOPPED and observed before
deletion.

## 6. The ATR Volatility Model in Full

The VOLATILITY spread condition (Section 7) fires based on an ATR ratio
the engine computes per symbol. This section explains exactly what that
number is, so you can set volatility thresholds with confidence.

### 6.1 What it measures

ATR here is a measure of how fast the mid price is currently moving,
relative to its own recent baseline. On each tick the engine takes the
**mid price** — the midpoint of bid and ask — and measures how far it
moved since the previous tick. It keeps two running averages of that
movement: a **fast** one (short memory, reacts quickly) and a **slow**
one (long memory, steady baseline). Both are exponential moving
averages, which weight recent ticks more heavily than old ones.

### 6.2 The ratio

The signal the rules read is simply the **fast average divided by the
slow average**. When the market is moving at its normal pace, the two
averages are similar and the ratio sits around 1.0. When a burst of
movement arrives, the fast average jumps ahead of the slow one and the
ratio rises above 1.0. When the market goes quiet, the ratio falls below
1.0. Because it is a ratio of a price to itself, it is independent of
the instrument’s absolute price level — the same tiers work for EURUSD
and for gold.

### 6.3 The tiers

These are the reference bands used to choose VOLATILITY thresholds:

| **ATR ratio** | **Market condition**               | **Typical action**                                  |
|---------------|------------------------------------|-----------------------------------------------------|
| below 0.8     | Quiet — below-normal volatility    | Tighten spread (a keener offer).                    |
| 0.8 – 1.2     | Normal — baseline volatility       | No change (usually leave this band without a rule). |
| 1.2 – 2.0     | Elevated — above-normal volatility | Moderate widen.                                     |
| 2.0 – 2.5     | High — significant volatility      | Aggressive widen.                                   |
| above 2.5     | Extreme — flash event / major news | Maximum widen, or restrict.                         |

### 6.4 Warm-up — the pitfall that surprises everyone

The tracker needs enough ticks before its numbers mean anything. Until a
symbol has received at least as many ticks as the **slow** period (200
by default), the engine returns a **neutral 1.0** for that symbol — so
**VOLATILITY rules simply will not fire on a fresh symbol** until
warm-up completes. At a typical one to ten ticks per second, 200 ticks
can take anywhere from twenty seconds to a few minutes per symbol.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pitfall — "my volatility rule does nothing after a restart".** This is expected. Any restart, config reload, or ATR-period change clears the warm-up, and every affected symbol must re-accumulate ticks before VOLATILITY rules take effect again. The "Vol Tracked" counter shows how many symbols have started building state; it is not a completeness measure. If a flat market produces no price movement at all, the baseline can be zero and the ratio stays neutral. |

### 6.5 Choosing the periods

The defaults (fast 20, slow 200) suit most feeds. Shorten the fast
period to make volatility rules trip on shorter spikes; lengthen the
slow period for a calmer, slower-moving baseline (at the cost of a
longer warm-up). Keep the constraints in mind: fast at least 20, slow at
least 20 and greater than fast.

## 7. Tab 2 — Spread Rules

Spread rules are conditional repricing rules attached to a feed. They
change the single published price that everyone receives — widening or
tightening bid and ask under a condition you choose.

### 7.1 How rules are evaluated

On each tick the engine walks the feed’s enabled rules **in priority
order, lowest first**, and applies the **first one that matches** the
symbol and whose condition is currently true. Later rules are not
considered. If no rule matches, the price falls through to the feed’s
per-symbol override, then its global default, then the raw provider
price. Priority ordering therefore matters: put your most specific or
most urgent rules at lower numbers.

### 7.2 The rules list

Columns: Feed, Priority (P), Rule name, Condition (a coloured badge),
Symbol, Spread (a compact summary such as "FROM_MID · ask +5 …"), and
Enabled. Each row has Edit and Delete. Rules can be reordered, which
rewrites their priorities.

### 7.3 Creating or editing a rule — every parameter

**Feed, Rule Name, Priority, Enabled**

Choose the **Feed** the rule belongs to, give it a **Rule Name**, set
its **Priority** (lower evaluates first), and use the **Enabled** toggle
to switch it on or off without deleting it.

**Condition — the four types**

The condition decides when the rule is eligible to fire. Exactly one is
chosen per rule:

- **ALWAYS** — eligible whenever the feed is active. No extra fields.

- **SCHEDULE** — eligible within a day-and-time window. You pick the
  active days and a "From" and "To" time. **Times are UTC** — not local
  time.

- **VOLATILITY** — eligible while the ATR ratio (Section 6) sits inside
  a band. You set "ATR Ratio Min" and "ATR Ratio Max"; the tier guide is
  shown inline. The lower bound is inclusive, the upper bound exclusive,
  and either can be left empty for "no bound".

- **NEWS** — eligible during a scheduled news window. You select an
  economic event and set how many minutes before and after it the rule
  should be active, optionally scoped to a symbol.

**Condition detail — SCHEDULE**

Active Days is a set of weekday toggles; From (UTC) and To (UTC) bound
the daily window. A common setting is Monday–Friday within session
hours. Because the check is in UTC, remember to offset for your local
session times.

**Condition detail — VOLATILITY**

Enter a min, a max, or both, using the tiers in Section 6.3. For
example, an "extreme" rule uses a min of 2.5 and no max; an "elevated"
rule uses 1.2 to 2.0. Leave the "normal" band (roughly 0.8–1.2) without
a rule so ordinary conditions pass through untouched. Bounds treat min
as ≥ and max as \<, so adjacent bands (…–2.0 and 2.0–…) do not overlap.

**Condition detail — NEWS**

Pick the economic event, then set **Pre-event (min)** and **Post-event
(min)** — how long before and after the release the window stays active
(default 5 and 5). Leave the symbol scope empty to apply across all
symbols, or set one symbol. The engine refreshes upcoming news on its
own about once a minute, so a newly-added event takes effect without any
reload; it only considers events within a couple of hours of now.

**Scope — Symbol and MT5 Groups**

**Symbol** limits the rule to one MT5 symbol; empty means all symbols.
**MT5 Groups** is offered for authoring, but note the pitfall below.

|                                                                                                                                                                                                                                                                                                                                                                 |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pitfall — group scope on spread rules is not enforced per-tick (V1).** The MT5 Groups field on a spread rule is authoring metadata; the live pricing path does not filter by it, because the feed price is shared by all clients. To make a spread genuinely group-specific, use the Group Spreads tab (Section 8), which is the mechanism designed for that. |

**Spread Adjustment — mode and width**

This is where you say how much to move the price. You pick a mode and a
width in points, and a live preview shows the resulting offsets:

| **Mode**               | **What it does**                              | **Ask / Bid offset (width = W)** |
|------------------------|-----------------------------------------------|----------------------------------|
| Ask Only               | Moves the ask; leaves the bid unchanged.      | ask +W · bid 0                   |
| Bid Only               | Moves the bid; leaves the ask unchanged.      | ask 0 · bid +W                   |
| Both Symmetric         | Moves ask up and bid down by the same amount. | ask +W · bid −W                  |
| From Mid (recommended) | Splits the width evenly around the mid price. | ask +W/2 · bid −W/2              |

**Spread Width** is an integer number of points — what the client sees
as the total added spread. Positive widens; negative tightens (a keener
price). The "Offsets applied on each tick" preview shows the resulting
**Ask**, **Bid** and **Client sees** totals so there is no guesswork.

### 7.4 How the adjustment reaches the price (and its safety guards)

The engine applies the chosen offsets to each tick’s bid and ask. Two
guards always run afterwards, so a mistaken setting cannot produce a
broken quote:

- If an adjustment would push the bid above the ask (a crossed quote),
  both are collapsed to the mid price instead.

- If an adjustment would drive a price to zero or below, the raw price
  is used for that side.

Finally the result is rounded to the configured number of decimal
places. There is also a proportional method available (adjusting by a
fraction of the current spread rather than a fixed amount) for feeds
that prefer spread-relative widening.

### 7.5 Spread-rule pitfalls

- **Warm-up.** VOLATILITY rules do nothing until the ATR model has
  warmed up for the symbol (Section 6.4).

- **UTC.** SCHEDULE windows are UTC; convert your local session times.

- **Ordering.** First match wins — a broad ALWAYS rule at a low priority
  will mask more specific rules beneath it.

- **Mapping.** A rule on an unmapped symbol never sees a tick (its ticks
  are dropped at step 2).

## 8. Tab 3 — Group Spreads

### 8.1 How group spreads differ from spread rules

This distinction is the key to the whole page, so it is worth being
precise.

- **Spread Rules (Tab 2) reprice the shared feed price.** They act at
  the feed layer and change the one price stream that every client
  receives, under a condition. Everyone downstream sees the same
  adjusted price.

- **Group Spreads (Tab 3) differentiate per client group inside MT5.**
  They do not change the shared feed price. Instead they set a markup in
  MT5’s own group configuration, so a "retail" group and a "VIP" group
  can see different spreads from the same feed price.

The reason two mechanisms exist is the Gateway fact from Section 3.2:
MT5 receives **one price for all clients**. Per-group differences
therefore cannot live in the feed — they must be applied by MT5 itself.
Group Spreads split the requested width across two places: the **ask**
side is applied as MT5’s native per-group spread markup, and the **bid**
side is applied as a feed repricing entry. The preview in the editor
labels these explicitly (8.3).

### 8.2 The group-spread list

Columns: MT5 Group, Symbol, Spread Mode, Points, Computed Offsets (for
example "ask +10 · bid −10 · 20 pts"), and Enabled (Yes/No). Each row
has Edit and Reset. Above the list sit "Add New Symbol Spread" and
"Re-sync to MT5".

### 8.3 Creating or editing a group spread — every parameter

**MT5 Group (required)**

The group to configure, chosen from the master node’s group list (for
example "demo\forex-hedge-usd-01"). On an existing rule this is fixed.

**Symbol (required)**

The MT5 short symbol (for example "EURUSD", not "Forex\EURUSD"). It
**must exist in Symbol Mapping**, and — see 8.4 — must also be listed in
the group’s Symbols tab in MT5 Admin.

**Spread Mode**

The same four modes as spread rules, deciding how the width is split
into ask and bid offsets:

| **Mode**               | **Ask offset** | **Bid offset** | **Effect (width = W)**                          |
|------------------------|----------------|----------------|-------------------------------------------------|
| ASK_ONLY               | +W             | 0              | Only the ask moves.                             |
| BID_ONLY               | 0              | +W             | Only the bid moves.                             |
| BOTH_SYMMETRIC         | +W             | −W             | Ask up and bid down equally — total change 2×W. |
| FROM_MID (recommended) | +W/2           | −W/2           | Split around the mid — total spread W.          |

**Spread Width (MT5 Points)**

The magnitude in MT5 points. The editor reminds you: **10 points = 1 pip
for 5-digit pairs**; **positive widens**, **negative tightens**. A width
of 10 in From Mid mode gives a 20-point total spread the client sees
(ask +10, bid −10 — wait, that is From Mid of 20; From Mid of 10 gives
ask +5, bid −5). Read the preview to confirm.

**The offsets preview**

Three tiles show exactly what will be applied, and this is where the
two-place split is made visible:

| **Tile**    | **Sublabel**   | **Meaning**                                                                  |
|-------------|----------------|------------------------------------------------------------------------------|
| Ask Offset  | MT5 SpreadDiff | The ask-side markup, applied inside MT5 as the group’s native spread markup. |
| Bid Offset  | Feed Repricing | The bid-side adjustment, applied at the feed layer as a repricing entry.     |
| Client Sees | Total spread   | The full added spread the client experiences (ask offset minus bid offset).  |

**Description and Apply to MT5**

Description is an optional audit note. "Apply to MT5" saves the rule to
the database and applies it to the live MT5 group configuration
immediately — there is no separate publish step.

### 8.4 The MT5 Admin prerequisite — read this before you apply

|                                                                                                                                                                                                                                                                         |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Prerequisite — add the symbol to the group’s Symbols tab first.** Before the platform can manage a symbol’s spread in a group, that symbol must be explicitly added in MT5 Admin under Groups → [group] → Symbols → Add. The wildcard "\*" entry is not sufficient. |

The reason is that MT5’s management interface only reports the symbols
explicitly listed in a group; a wildcard governs client trading
permissions but does not expose the symbol for programmatic spread
management, and it does not enable price streaming for it either. This
is a one-time setup per group per symbol. If a rule’s live spread reads
as "not configured" (the platform shows a live value of −1), it means
the symbol has not yet been added in MT5 Admin — add it, then apply
again. The editor itself repeats this warning inline.

### 8.5 Manager login permission

|                                                                                                                                                                                                                                                                                                                                                                                                                          |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pitfall — "Configure Groups" permission and the silent no-op.** The manager login the platform uses must hold the "Configure Groups" permission. Without it, applying a spread appears to succeed but silently does nothing. And MT5 manager sessions do not pick up permission changes mid-session — if the permission is granted while the service is running, the service must be restarted before it takes effect. |

### 8.6 Reset

Reset on a row returns that group/symbol spread to floating: it sets the
MT5 markup back to zero and disables the stored rule, after a
confirmation. Use it to remove a markup cleanly rather than deleting and
re-creating.

### 8.7 Re-sync to MT5

"Re-sync to MT5" re-applies every enabled group-spread rule to the live
MT5 configuration in one action. The platform also does this
automatically each time the service starts, so a MT5 restart or a
group-config reset does not permanently lose your managed spreads. Use
the button manually after MT5 Admin maintenance or a MT5 server restart,
to be sure the live config matches your rules.

### 8.8 What MT5 Admin shows versus what the client sees

Do not be alarmed by an apparent mismatch. For From Mid with a width of
20, **MT5 Admin’s Spread Diff shows +10** — that is the ask-side offset
only — while the **client terminal shows 20 points**, the full spread
width. Both are correct: the client figure is the ask offset minus the
bid offset (10 minus −10).

### 8.9 Group-spread pitfalls, at a glance

- Symbol not in the group’s Symbols tab → apply fails; add it in MT5
  Admin (8.4).

- Missing "Configure Groups" permission → silent no-op; grant it and
  restart the service (8.5).

- MT5 not connected → apply fails; check the master node.

- Admin shows half of what the client sees → expected for From Mid
  (8.8).

## 9. Worked Examples

### 9.1 Tighten EURUSD during the London session

1.  On **Spread Rules**, add a rule on the EURUSD feed.

2.  Condition **SCHEDULE**; Active Days Monday–Friday; From 07:00 To
    16:00 (UTC — adjust for London).

3.  Scope Symbol EURUSD.

4.  Spread Adjustment **From Mid**, a small **negative** width to
    tighten. Confirm the preview shows a keener spread.

5.  Give it a low priority so it wins over any broad default, and save.

### 9.2 Widen on extreme volatility

1.  Add a rule, condition **VOLATILITY**, ATR Ratio Min 2.5, Max empty.

2.  Spread Adjustment **From Mid**, a large positive width.

3.  Priority lower than routine rules so it takes precedence when it
    fires.

4.  Remember it will not fire until the symbol’s ATR model has warmed up
    (Section 6.4).

### 9.3 Set a 20-point retail spread on a group

1.  In MT5 Admin, confirm the symbol is listed in the group’s Symbols
    tab (8.4).

2.  On **Group Spreads**, Add New Symbol Spread; choose the group and
    symbol.

3.  Mode **FROM_MID**, Spread Width 20. The preview should read ask +10,
    bid −10, Client Sees 20 pts.

4.  Apply to MT5. In MT5 Admin the Spread Diff will read +10; the client
    sees 20 — both correct (8.8).

## 10. Troubleshooting Quick Table

| **Symptom**                                | **Likely cause**                                                                   | **Fix**                                                                               |
|--------------------------------------------|------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| "Symbol Misses" rising                     | Symbol not mapped.                                                                 | Add it on the Symbol Mapping page.                                                    |
| VOLATILITY rule has no effect              | ATR still warming up.                                                              | Wait for warm-up; expect this after any restart or period change.                     |
| SCHEDULE rule fires at the wrong time      | Window is in UTC.                                                                  | Convert local session times to UTC.                                                   |
| A specific rule never fires                | A broader rule at lower priority matches first.                                    | Reorder so the specific rule has the lower priority.                                  |
| Group spread apply fails (error)           | Symbol not in group Symbols tab, no "Configure Groups" permission, or MT5 offline. | Add the symbol in MT5 Admin; grant the permission and restart; check the master node. |
| Group spread "applied" but nothing changes | Manager login lacks "Configure Groups".                                            | Grant it, then restart the service.                                                   |
| MT5 Admin shows half the client spread     | Spread Diff is the ask side only.                                                  | Expected for From Mid — no action.                                                    |
| Live spread shows −1                       | Symbol not found in the group’s Symbols tab.                                       | Add it in MT5 Admin, then apply again.                                                |
| "Throttled" is non-zero                    | Throttle is on.                                                                    | Normal — no action unless you want every tick, in which case turn throttle off.       |
| Settings look out of sync with behaviour   | Engine state stale.                                                                | Use the feed’s Sync button to reload config and reset warm-up.                        |

## 11. Quick Reference

### 11.1 Days and points

**Days:** a schedule’s days are the usual weekday set; Monday–Friday is
the common trading week. **Points:** for 5-digit pairs (EURUSD, GBPUSD,
XAUUSD), 10 points = 1 pip. Positive widths widen the spread; negative
widths tighten it.

### 11.2 Defaults

| **Parameter**          | **Default**                        |
|------------------------|------------------------------------|
| Feed priority          | 100 (lower runs first)             |
| Throttle               | Off; interval 100 ms when on       |
| ATR fast period        | 20 (minimum 20)                    |
| ATR slow period        | 200 (minimum 20, must exceed fast) |
| Spread-rule condition  | Always                             |
| Spread mode            | From Mid                           |
| News pre / post window | 5 / 5 minutes                      |

### 11.3 The two spread mechanisms, side by side

|                | **Spread Rules**                            | **Group Spreads**                                                    |
|----------------|---------------------------------------------|----------------------------------------------------------------------|
| Layer          | Feed / pipeline                             | MT5 group configuration                                              |
| Who it affects | Everyone on the feed                        | One group at a time                                                  |
| Conditional?   | Yes (Always / Schedule / Volatility / News) | No — a standing per-group markup                                     |
| Applied where  | In the published price                      | Ask via MT5 markup, bid via feed repricing                           |
| Prerequisite   | Symbol mapped                               | Symbol mapped AND in the group’s MT5 Symbols tab; manager permission |

*End of reference.*
