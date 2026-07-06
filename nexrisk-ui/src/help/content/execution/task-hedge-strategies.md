---
id: task-hedge-strategies
title: "Hedging Strategies — how a strategy works and how to build one"
type: task
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source:
  - "Hedging Strategies — Operating Guide for Risk Managers & Dealers, v1.0 (screen-by-screen manual: header, strategy list, settings sections 1-5, intelligence panel, quick reference)"
related: [ref-lp-admin-states, task-route-sanity, task-lp-management, ref-route-sanity-fields, task-execution-report]
tags: [hedging, strategy, rule, create, guard, escalation, failover, fallback, route-sanity, lp-health, activation]
status: reviewed
version: exec-v3
---

## 1. About this guide

This guide explains the Hedging Strategies page in full — every panel, button, field, indicator and automatic behaviour, in the order you meet it on screen.

**Who does what.** The page supports two kinds of user. A **risk manager** with edit rights can create, change, pause, stop and delete strategies, and can adjust routing safeguards. A **dealer** without edit rights sees exactly the same information but read-only: the New Strategy button, the Save and status-change buttons, and the escalation action buttons are hidden or unavailable. Everyone can monitor health, routing and escalations.

## 2. What the page does

When a client trade is executed and kept in-house (the B-Book), the broker carries that market risk. A hedging strategy is a standing instruction that decides whether — and how much of — that risk should be pushed out to a liquidity provider (the A-Book) as an offsetting hedge, and under what conditions.

The page lets you build a library of these strategies, control which client flow each applies to, decide how large a hedge to send and to which provider, set the conditions and time windows under which each fires, and watch it all operate in real time. It also gives safeguards that automatically protect you when a provider degrades, and a triage queue for any hedge that could not be completed.

**The three books, in brief.** The A-Book is rule-driven hedging routed to a liquidity provider — the output of this page. The B-Book is client flow kept in-house. The C-Book is manual coverage placed by a dealer. This page is about the A-Book: the automatic hedges strategies generate from B-Book flow.

## 3. How the page is laid out

Three columns, read left to right, with a header strip on top.

- **Header strip** — the page title, live counts of strategies and escalations, and the New Strategy button.
- **Left column — Strategy list** — every strategy as a card, sorted by priority, with quick-glance health indicators. Where you pick which strategy to work on.
- **Middle column — Strategy settings** — the full definition of the selected strategy, in five numbered sections. The main workspace.
- **Right column — Intelligence panel** — three tabs (LP Health, Route Sanity, Escalations) showing live provider health, the routing safeguards, and any hedges needing attention.

Nothing on the page is entered manually into the market. Every action either defines an automatic behaviour or responds to one.

## 4. The page header

- **Title and subtitle** — "Hedging Strategies", with "Define and control exposure routing from executed client trades".
- **Strategies count** — the total number of strategies defined, of any status.
- **Active count** — how many are currently Active, shown in green.
- **Overlap warning** — if two or more Active strategies could both apply to the same client flow, an amber "overlap" warning appears with a count.
- **Escalated (all strategies)** — a red badge showing the total escalated hedge positions across *every* strategy, not just the one you're viewing. Your at-a-glance signal that something needs triage somewhere.
- **Confirmation messages** — after you save, create, delete or change a status, a brief green confirmation appears for a few seconds.
- **New Strategy button** — starts a blank strategy in the middle column. Visible only with edit rights, and greyed out while you're already creating one.

## 5. The strategy list (left column)

### 5.1 Filter tabs

Four tabs filter by status: Active, Paused, Stopped and All. The list always sorts by priority, lowest number first, so the highest-priority strategy sits at the top.

### 5.2 Reading a strategy card

Each card packs several indicators into a small space:

- **Priority number** — the boxed number on the left. Lower numbers are evaluated first when more than one strategy could apply.
- **Strategy name** — the title you gave it.
- **Status pill** — Active (green), Paused (amber) or Stopped (red), each with a matching dot.
- **Server and provider chips** — the MT5 server the strategy targets and the provider it hedges to (shown as "LP: …").
- **Overlap chip** — an amber "Overlap" tag if this strategy competes with another Active strategy for the same flow.
- **Escalated chip** — a red "N escalated" tag if this strategy has hedges awaiting triage.
- **Routing dot** — a coloured dot with a word (Healthy, Breached, Failover or Hold) describing the live routing state.
- **Provider dot and "sent" count** — a dot showing the provider connection colour, and, once it has hedged, a running count of hedges sent.
- **Coloured base bar** — a thin bar along the bottom repeats the routing colour, so you can scan the whole list at a glance.

Clicking a card opens that strategy in the middle and right columns; the selected card gets a teal edge.

### 5.3 What "overlap" means

The page continuously checks whether any two Active strategies could both catch the same client trade. Two are treated as overlapping when their targeting is broad enough to collide — that is, when they share (or either leaves open to all) their symbols, groups, behavioural cohorts and login IDs at the same time. An overlap is a warning, not a block: it tells you two strategies may fire on the same flow, usually worth reviewing so you don't double-hedge.

## 6. The strategy settings (middle column)

Selecting a strategy (or starting a new one) fills the middle column with its full definition. Until then it shows a prompt to select or create one.

### 6.1 The settings header and action buttons

A slim header sits above the form: on the left the strategy name and, for an existing strategy, its rule number and last-updated time; on the right the action buttons, which change with what you're doing.

- **Activate** — turns a Paused or Stopped strategy on. Shown only when not already Active.
- **Pause** — temporarily suspends an Active strategy; it stops firing but keeps its definition. Shown only when Active.
- **Stop** — fully stops the strategy. Shown unless already Stopped.
- **Delete** — permanently removes it, after a confirmation. Cannot be undone.
- **Cancel** — discards unsaved edits and restores the last saved version. Appears while you have unsaved changes or are creating.
- **Save** — the main button: "Create Strategy" for a new one, "Save Changes" with unsaved edits, "Saved" when there's nothing to save.

Activate, Pause, Stop and Delete appear only for an existing strategy, and only with edit rights.

### 6.2 The setup-progress banner

Below the header, a progress banner tells you at a glance whether the strategy is complete: a tally of required and optional items done, and a row of chips (one per item) that turn green with a tick when satisfied and stay amber (or grey, for optional) when not. When every required item is done it reads "Strategy complete".

| Item | Required? | Counts as done when |
|---|---|---|
| Strategy name | Required | a name has been entered |
| MT5 server | Required | an enabled MT5 server exists to target |
| Scope (groups / logins / cohorts) | Optional | at least one group, login ID or cohort is chosen |
| Symbols | Optional | at least one symbol is chosen |
| Hedge volume % | Required | a hedge volume above zero is set |
| Primary LP | Required | a liquidity provider is chosen |
| Activation | Required | the chosen activation type is fully configured |
| Guard threshold | Required (if a guard is set) | a threshold value is entered for the guard |

Optional items don't block saving; they're prompts to make the strategy more precise. Required items must be satisfied before it will save.

### 6.3 Section 1 — Identity & Status

- **Strategy Name (required)** — a clear, human name, e.g. "Hedge 60% — Scalper Group (Major FX)".
- **Description (optional)** — a free-text note on intent and scope.
- **Priority** — a number setting the running order; lower runs first, and decides which strategy wins when two could apply.
- **Status** — Active, Paused or Stopped. Settable here or via the header buttons.
- **Routing Status (view only)** — for an existing strategy, the live routing state (Healthy, Breached, Failover or Hold). You can't edit it; it reflects what the safeguards are currently doing.

### 6.4 Section 2 — Source Targeting

Decides which client flow the strategy applies to. Leaving a selection empty means "match everything within B-Book scope", and groups must already be assigned to the B-Book in the MT5 server configuration.

- **MT5 Server (required)** — strategies always target the Master server, shown as a fixed panel with the server name, type and a live connection indicator, not a chooser.
- **B-Book Groups** — the B-Book groups on the Master server, as tags you switch on or off. Selecting none applies to all B-Book groups.
- **Target Login IDs** — specific client login numbers, comma-separated. Entering logins bypasses group selection and narrows to just those accounts; leaving it empty falls back to group targeting.

Below a "Cohort Targeting" divider are three further filters:

- **Classified Cohorts** — behavioural categories you can switch on: EA, Scalper, Arbitrage, News, Normal and Rebate. Selecting none includes all behavioural types.
- **Risk Cohorts (coming soon)** — Critical, High, Medium and Low tags are shown but disabled, reserved for a future risk-scoring capability.
- **Cluster IDs** — behavioural-cluster numbers, comma-separated, for advanced targeting by trading pattern. Forward-looking; leaving it empty ignores clustering.

### 6.5 Section 3 — Instrument Targeting

- **Symbols** — type a symbol and press Enter (or comma) to add it as a tag. Only recognised MT5 symbol names are accepted; an unknown entry is rejected as "not a known MT5 symbol". Empty means all instruments.
- **Direction** — Long, Both or Short, choosing which side of the client trade the strategy hedges. Both is the usual choice.

### 6.6 Section 4 — Execution Parameters

- **Hedge Volume %** — how much of the client position to hedge. 100 is a full hedge; above 100 is an over-hedge. Required.
- **Confirm Timeout** — how long, in milliseconds, the system waits for the provider to confirm before treating the attempt as timed out and escalating it. Default 5000 (five seconds).
- **Primary LP (required)** — the provider the hedge routes to, from a list of enabled providers. Once chosen, a small live health line shows the connection and, if available, latency and fill rate.
- **LP Sub-Account (optional)** — a specific account at the provider, if you route through more than one. Empty uses the provider default.

Below a "Guard Clause" divider is an optional condition that must be true for the hedge to fire:

- **Condition Type** — "None (fires unconditionally)" by default. The other choices gate the hedge on P&L: by symbol or overall, and on realised or combined P&L.
- **Operator and Threshold** — with a condition other than None, pick a comparison (less than, less-or-equal, greater than, greater-or-equal) and a US-dollar threshold. The hedge then fires only when the chosen P&L meets that test — e.g. only when a symbol's realised P&L falls below −$5,000.

### 6.7 Section 5 — Activation Window

Decides when the strategy is allowed to fire. Pick one activation type and its settings appear beneath.

| Activation type | What it means | Extra settings that appear |
|---|---|---|
| Always | Fires on every matching position while Active. | None — a note confirms it's always on. |
| Schedule | Fires only on chosen days and within a chosen time window (UTC). | A day picker (Mon–Sun) and "Time From" / "Time To". |
| News Event | Fires around a specific economic-calendar release. | An event picker, plus minutes before and after the event. |
| PnL Trigger | Fires when a chosen P&L measure crosses a threshold. | P&L scope, a comparison, and a US-dollar threshold. |
| Manual | Never fires on its own; only becomes Active by explicit manager action. | A note explaining the manual-only behaviour. |

**The News Event picker.** Choosing News Event reveals a button to select an economic event. It opens a searchable list of releases for the next fourteen days, filtered by importance (toggle between two-star and three-star). Each entry shows the event name, star rating, country, scheduled UTC time and — where available — consensus and previous figures. Once picked, it's summarised in a panel you can clear and re-choose. Two fields set the window: "Activate before event" and "Deactivate after event", both in minutes. An event must be chosen before the strategy can save.

**The PnL Trigger fields.** Choosing PnL Trigger reveals three fields: the P&L scope (the matched symbol's P&L, or overall P&L across all positions), a comparison, and a US-dollar threshold — e.g. activate when overall P&L drops below −$10,000.

## 7. The intelligence panel (right column)

Three tabs — LP Health, Route Sanity and Escalations — all focused on the selected strategy. The Escalations tab shows a small red badge with the number of escalations for the current strategy.

### 7.1 LP Health

Shows the live health of the provider your strategy routes to (the Primary LP) and, if configured, its fallback. Each provider is a card.

- **Connection status** — a coloured word at the top: Connected (green), Degraded (amber) or Disconnected (red); Unknown if no reading yet.

Below the status, four quality measures, each with the live reading and — where you've set a limit in Route Sanity — the limit it's judged against. Within-limit reads green; a breach reads red.

| Measure | What it tells you | Good direction |
|---|---|---|
| Latency | How long the provider takes to respond, in milliseconds. | Lower is better |
| Fill Rate | The share of orders the provider fills, as a percentage. | Higher is better |
| Reject Rate | The share of orders the provider rejects, as a percentage. | Lower is better |
| Slippage | The average price slippage on fills, in pips. | Lower is better |

- **Heartbeat and check times** — the foot of each card shows when the provider last sent a heartbeat and when the page last checked.
- **"Metrics populate…" note** — a connected provider with no readings yet shows a note that measurement begins once safeguards have collected session data, sampling from the first hedge sent. A brand-new provider shows Connected with dashes until it has handled traffic.

The tab refreshes every five seconds, and its limits come from the Route Sanity settings.

### 7.2 Route Sanity

Where you set the safeguards that protect the strategy when its provider degrades. It answers three questions: what counts as unacceptable quality, what to do when that happens, and how to recover.

**Global default versus per-strategy override.** Every provider can have a shared global default set of safeguards. If the selected strategy has none of its own, the tab shows it's inheriting the global default, with an "Override" button; until you override, the fields are shown but locked. Overriding tailors the safeguards for this one strategy; "Revert to global" later removes the per-strategy version.

**The quality limits.** Each corresponds to a measure on the LP Health tab.

- **Max Latency (ms)** — the slowest acceptable response time.
- **Min Fill Rate (%)** — the lowest acceptable fill rate.
- **Max Reject Rate (%)** — the highest acceptable rejection rate.
- **Max Slippage (pips)** — the largest acceptable average slippage.
- **Heartbeat Timeout (ms)** — how long a silence is tolerated before the provider is treated as down.
- **Rolling Window (seconds)** — the recent period the measures are averaged over, so a single blip doesn't trip the safeguards. Default 60 seconds.

**On Breach — what happens when a limit is broken.** Three choices decide the immediate response:

- **Pause Rule** — quietly pause this strategy until the provider recovers.
- **Stop Rule** — fully stop the strategy.
- **Fallback LP** — switch hedging to a backup provider. This reveals a Fallback LP chooser (excluding the current provider) and an optional fallback account.

Two tick-boxes control alerting: "Notify on breach" and "Notify on recovery", both on by default.

**Recovery Policy — how to come back.** Once a provider recovers:

- **Auto-restore immediately** — return to the original provider as soon as it looks healthy.
- **Hold then restore** — wait and confirm stability first. Reveals a hold period (seconds), a number of stability checks that must pass, and whether to restore to the original provider or stay on the fallback.
- **Manual only** — don't restore automatically; a manager must do it.

**Final Fallback — when every provider is exhausted.** If no provider can take the hedge:

- **B-Book** — accept the risk in-house, silently.
- **Reject** — leave the position unhedged, with no alert.
- **Reject + Notify** — leave it unhedged but raise an escalation alert. The recommended choice.

At the foot, "Save Config" stores the safeguards for this strategy; "Revert to global" removes them. Saving is offered only once you have an override or unsaved changes.

### 7.3 Escalations

The triage queue: hedges that could not complete normally and need a human decision. The list is limited to the selected strategy, but the summary line and empty-state message tell you about the wider picture across all strategies.

**The summary line and Purge All.** When escalations exist anywhere, a summary line shows the total across all strategies, next to a red "Purge All" button. Purge All is a bulk, destructive action: it clears the entire escalation queue across every strategy at once, after a confirmation, and cannot be undone. It's for clearing a large backlog, not individual positions.

**Reading an escalation card.** Each carries the symbol, direction and size (lots); a state badge — "Timeout Escalated" (amber), "Rejected Escalated" (red) or "Normalizer Error" (red); the login, provider and time it escalated; and a plain-language reason (with the provider's rejection code for a rejection). Four action buttons sit at the foot:

| Button | What it does | When it's available |
|---|---|---|
| Retry | Attempts the hedge again with the provider. | Hidden for a Normalizer Error. |
| Force Close | Closes the hedge position at the provider. | Disabled unless the provider fill has been confirmed; a tooltip explains why when greyed out. |
| B-Book | Accepts the risk in-house instead of hedging it. | Always available. |
| Dismiss | Acknowledges the escalation and removes it from the queue. | Always available. |

With no escalations for the selected strategy it shows "No escalated positions"; if escalations exist elsewhere it still reminds you of that total. The tab refreshes every ten seconds.

## 8. Quick reference

### 8.1 Status colours and meanings

| Status | Colour | Meaning |
|---|---|---|
| Active | Green | The strategy is on and will fire on matching flow. |
| Paused | Amber | Temporarily suspended; definition kept, not firing. |
| Stopped | Red | Fully stopped; not firing. |

### 8.2 Routing status meanings

| Routing status | Colour | Meaning |
|---|---|---|
| Healthy | Teal | The provider is within limits; hedging is routing normally. |
| Breached | Amber | A quality limit has been broken; the breach response is in effect. |
| Failover | Amber | Hedging has switched to a fallback provider. |
| Hold | Amber | The provider looks recovered, but the strategy is waiting to confirm stability before restoring. |

### 8.3 Provider connection meanings

| Connection | Colour | Meaning |
|---|---|---|
| Connected | Green | The provider link is up. |
| Degraded | Amber | The link is up but quality is impaired. |
| Disconnected | Red | The provider link is down. |
| Unknown | Grey | No reading is available yet. |

### 8.4 Escalation states

| State | Colour | What happened |
|---|---|---|
| Timeout Escalated | Amber | The provider did not confirm within the confirm-timeout window, so a cancel was sent and the hedge escalated. |
| Rejected Escalated | Red | The provider rejected the hedge; a rejection code is shown. |
| Normalizer Error | Red | The hedge could not be prepared for the provider. Retry is not offered for this state. |

### 8.5 The breach-to-recovery flow

Read together, the safeguards work as a chain: the quality limits define what "bad" means; the On-Breach choice decides the immediate response (pause, stop, or switch to a fallback); the Recovery Policy decides how and when to return to normal; and the Final Fallback decides what to do with the exposure if no provider at all can take it. Alerts can be raised at breach and again at recovery. The routing status on the card and in Section 1 shows where in this chain the strategy currently sits.

## 9. Permissions and refresh behaviour

### 9.1 Who can do what

Editing is gated by permission. Users with edit rights see the New Strategy, Save, Activate, Pause, Stop, Delete, Route Sanity save and escalation-action controls. Users without edit rights see the same live information — strategy definitions, LP Health, Route Sanity settings and the escalation queue — but the controls that change anything are hidden or unavailable. Dealers can monitor routing and health safely without being able to alter strategies.

### 9.2 How often the page updates

| What | Refresh |
|---|---|
| Strategy list and definitions | Every 30 seconds |
| LP Health readings | Every 5 seconds |
| Escalation queue | Every 10 seconds |

Your selected strategy is remembered within a session, so refreshing or returning keeps you on the same strategy.
