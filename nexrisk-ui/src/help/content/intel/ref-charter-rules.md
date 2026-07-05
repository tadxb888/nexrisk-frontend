---
id: ref-charter-rules
title: "Risk Policy — rule bands and filters"
type: reference
domain: intel
module: charter
minLevel: VIEW
route: /risk-charter
source:
  - "Risk Matrix API — Unified Complete (Factory Default PF Bands; factory reset)"
  - "Charter.tsx (rule filter, PF ladder, factory/modified state)"
related: [gls-risk-severity, ref-trader-risk]
tags: [risk-policy, charter, factory, modified, pf-band, action-code]
status: reviewed
version: intel-v1
---

## Rule source filter {#filter}

The rule list can be filtered by origin: **ALL** — every rule; **FACTORY** —
only rules still at their shipped factory values; **MODIFIED** — only rules an
operator has changed from factory.

## Profit-factor bands {#pf-bands}

Risk Policy maps each archetype's Profit Factor (PF) to a risk band and a default
action code. The severity bands ascend **VERY_LOW → LOW → MEDIUM → HIGH →
CRITICAL**; each band carries an action (e.g. MONITOR, WARN, WIDEN_SPREAD,
A_BOOK_REVIEW, A_BOOK_PARTIAL, A_BOOK_FULL). A rule can be reverted to its
factory-shipped values, or all rules reset to factory at once.
