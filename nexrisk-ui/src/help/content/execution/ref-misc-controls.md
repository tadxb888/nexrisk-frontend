---
id: ref-misc-controls
title: "Additional controls and labels"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source: ["HedgingStrategies.tsx, LiquidityProviders.tsx, PriceRulesPage.tsx, Charter.tsx, SymbolMapping.tsx, NodeManagement.tsx, ExecutionReport.tsx, Archetype.tsx, NetExposure.tsx"]
related: [ref-hedge-strat-form, ref-lp-fix-config, ref-price-rules-controls, ref-archetype-results]
tags: [controls, labels, misc]
status: reviewed
version: exec-v1
---

## Strategy list and form {#hedge}

**Strategies:** and **Active:** count configured and live strategies. Guard basis
includes **Symbol — Combined P&L**. Escalation toggles include **Notify on
recovery** and **Hold then restore**.

## LP admin {#lp}

**TEORDER** and **TEPRICE** are the TraderEvolution order and price session
identifiers. **Trading Config** holds session settings; **Long Qty** / **Short
Qty** / **Unrealized P&L** show live LP position state. **Session Error** flags a
FIX session fault; **Credentials not configured** means logon details are missing.

## Price rules {#price}

Throttle presets are **20 ms (LP native)** and **100 ms (NexRisk default)**.
**From Mid** (recommended default) is a spread mode. **Offsets applied on each
tick** describes how resolved bid/ask offsets are used. Filters: **All symbols**,
**All groups**.

## Risk policy {#charter}

**Very Low** is the lowest severity band. Editing requires a reason (**Required
for audit**); **Ladder validation** checks a ladder before saving. **Previously
customised** marks a rule changed from factory. Filter: **All Behaviors**.

## Symbol mapping and nodes {#symbol}

**Bulk Import Log** records past imports; counters show **Mappings:**, **Nodes:**,
and **LPs:**. **All Servers** filters the LP server list. On MT5 nodes, **Trade
Flags (raw)** and **Profit Currency** are properties; **Connection failed** and
**Connect node first** are connection states; **All folders** / **All paths**
filter the group/symbol trees.

## Execution and clustering labels {#labels}

Execution stats: **Avg RT:**, **Best RT:**, **Worst RT:**, **Rejections:**,
**Rejection %:**, and per-LP **Liquidity Provider:** / **Positions:** / **Long /
Short:** / **Vol:**. Cluster labels: **Noise:**, **High:**, **Med:**, **Exec:**,
**Established:**, **Emerging:**, **Mapped:**, **Avg Risk:**, **Severity:**,
**Suggested:**, **Confidence:**. The cheapest AI model is **Haiku (cheapest)**.
Net Exposure **DOUBLE LOSS** marks both legs losing; **Coverage Vol** is LP-side
exposure; **MT5 Node:** is the source node. User counts: **Total:**, **Active:**,
**Pending:**, **Inactive:**.
