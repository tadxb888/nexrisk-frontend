---
id: task-risk-policy
title: "Risk Policy — how traders map to actions, and how to tune it"
type: task
domain: intel
module: charter
minLevel: VIEW
route: /risk-charter
source:
  - "Risk Matrix API — Unified Complete (behaviors, PF band ladders, action codes + params, simulate, factory reset, diff, import/export, 57 factory rules)"
  - "NexRisk API v1.1 (risk-matrix lookup, action codes, modifier flags)"
related: [ref-charter-rules, ref-charter-controls, ref-trader-risk, gls-risk-severity]
tags: [risk-policy, risk-matrix, profit-factor, behavior, action-code, a-book, spread, factory]
status: reviewed
version: intel-v2
---

## What the Risk Policy does {#what}

The Risk Policy (Risk Matrix) is the rulebook that turns a trader's behaviour and
performance into a risk level and a concrete action. Each rule says: for a given
**behaviour type** and **profit-factor (PF) band**, assign a **risk level** and
apply an **action**. There are 57 factory rules across six behaviours, and every
threshold and action is adjustable.

## How a trader is scored {#lookup}

A trader is classified into a behaviour (`SCALPER`, `EA_TRADER`, `ARBITRAGE`,
`REBATE_ABUSE`, `NEWS_TRADER`, `MANUAL`), and their profit factor places them in a
PF band for that behaviour. The matching rule's risk level (`VERY_LOW` → `LOW` →
`MEDIUM` → `HIGH` → `CRITICAL`) and action then apply. You can dry-run this for a
hypothetical trader with **simulate** — give a behaviour, risk level, and PF, and
it returns the matched rule and action without writing anything (or a fallback of
MONITOR if nothing matches).

## Actions {#actions}

The action a rule assigns: `MONITOR`, `WARN`, `WIDEN_SPREAD` (needs a
`multiplier`, 1.01–10.0, optional pip cap), `MIN_HOLDING_TIME` (`min_seconds`
5–3600), `A_BOOK_REVIEW`, `A_BOOK_PARTIAL` (needs `hedge_pct` 1–99), `A_BOOK_FULL`,
`DISABLE_REBATES`, `RESTRICT_VOLUME` (`max_lots` 0.01–100), `ACCOUNT_REVIEW`, or
`NO_ACTION`. The escalation runs, roughly, from watch (MONITOR/WARN) → price
friction (WIDEN_SPREAD, MIN_HOLDING_TIME) → externalise the risk (A_BOOK_PARTIAL
/ A_BOOK_FULL) as PF and risk climb.

## The factory ladders {#ladders}

Each behaviour ships with a PF ladder. For example, **SCALPER**: PF 0–1.0 LOW
MONITOR; 1.0–1.5 MEDIUM MONITOR; 1.5–2.0 MEDIUM WARN; 2.0–3.0 HIGH WIDEN_SPREAD
×1.3; 3.0–5.0 HIGH WIDEN_SPREAD ×1.8; 5.0+ CRITICAL A_BOOK_REVIEW. **ARBITRAGE**
escalates faster — 2.0–5.0 HIGH A_BOOK_REVIEW, 5.0–10.0 CRITICAL A_BOOK_PARTIAL
80%, 10.0+ CRITICAL A_BOOK_FULL. **REBATE_ABUSE** above PF 1.0 goes HIGH
DISABLE_REBATES. A profitable trader (high PF) is the *higher* risk to the broker,
which is why actions get more aggressive as PF rises.

## Editing the policy {#edit}

Rules can be filtered by behaviour, risk level, action, enabled state, and
factory-vs-custom. You can change one band's action, move PF breakpoints, or
replace a whole behaviour's ladder atomically — a replaced ladder is validated
for contiguity (no gaps/overlaps, ascending `pf_min`, final band open-ended). Edits
require a reason for the audit trail, and every rule keeps a change history. Custom
rules can be created, toggled, and bulk-edited (up to 50 at once).

## Factory reset, diff, and export {#factory}

**Diff** shows exactly what's changed from factory (`total_changes: 0` = untouched).
A single rule can be reset to its factory values; one behaviour can be reset; or a
full reset restores all 57 factory rules — the full reset also **permanently
deletes all custom rules** and requires two explicit confirmations. The policy can
be exported to JSON and imported (merge or replace-custom); imported rules always
become custom, never factory.
