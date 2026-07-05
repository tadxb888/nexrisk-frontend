---
id: ref-charter-controls
title: "Risk Policy — behaviours, lookup, and editing"
type: reference
domain: intel
module: charter
minLevel: VIEW
route: /risk-charter
source:
  - "Risk Matrix API — Unified Complete (behaviours, PF bands, factory reset, audit)"
  - "Charter.tsx (Rule Lookup, PF Min/Max, change reason, export)"
related: [ref-charter-rules, gls-risk-severity]
tags: [risk-policy, behaviour, pf-band, lookup, audit, export]
status: reviewed
version: intel-v1
---

## Behaviours {#behaviours}

Rules are organised by trader behaviour: **Manual Trader**, **EA / Bot**,
**Scalper**, **Arbitrage**, **News Trader**, **Rebate Abuse**, **Day Trader**,
and **Swing Trader**. Each behaviour has its own Profit-Factor ladder.

## Rule lookup {#lookup}

**Rule Lookup** filters rules by any combination of **Behavior**, **PF Min** /
**PF Max**, action, and whether a rule is **Modified from default**. A **Preview**
shows the effect before saving.

## Editing and audit {#edit}

Editing a rule or restructuring a ladder requires a change reason (**Required for
audit**). **Change History** records each edit with its **Change Type**. A rule
can be reverted to factory, or all rules reset. **Export JSON** downloads the
current policy.
