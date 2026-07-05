---
id: ref-residual-controls
title: "Remaining page controls and labels"
type: reference
domain: execution
module: hedge_strat
minLevel: VIEW
route: /hedging-strategies
source: ["BookPages.tsx, PriceRulesPage.tsx, ReportsPage.tsx, Charter.tsx, Sidebar.tsx, NetworkClusterPage.tsx, NodeManagement.tsx, CBookPage.tsx, LiquidityProviders.tsx, PredictionsPage.tsx, RouteSanityPage.tsx, AlertingPage.tsx, settings/LpListPage.tsx, settings/TradingEconomicsPage.tsx, chart components"]
related: [ref-reports-catalog, ref-price-rules-controls, ref-charter-controls]
tags: [controls, labels, residual]
status: reviewed
version: exec-v1
---

## Book overview {#book}

The book overview shows **Total Positions**, **Total Volume**, **Total P&L**, **Open Positions**, and **Active Traders** across the selected book.

## Price rules {#price}

Throttle presets are **20 ms  (LP native)** and **100 ms  (NexRisk default)**. **From Mid ★** is the recommended spread mode (starred). The **OFFSETS APPLIED ON EACH TICK** panel shows the resolved bid/ask offsets applied to every tick.

## Reports {#reports}

Report types include **Risk Matrix Rules** (the current risk policy rules), **Cluster Profiles** (clustering output), **LP Instruments** (the symbols each LP offers), and **Feed Configuration** (price-feed setup).

## Risk policy {#charter}

The **Risk Charter** page marks rules **Previously customised** when changed from factory, and edits are **Required for audit** (a change reason must be given).

## Navigation and infrastructure {#nav}

The sidebar links to **Network Cluster** (the infrastructure world map) and the **Operational Manual** (this help). On the Network Cluster page a node reads **Online** when reachable.

## MT5, coverage, and LP {#misc}

MT5 symbol/group properties include **Trade Flags (raw)** and **Last on** (last connection time). The DOM panel shows **Available Margin**; LP position state shows **Short Qty**. A hedge strategy can **Notify on recovery**.

## Other controls {#other}

B-Book filter: **All Groups / All Accounts**. Predictions: **Clear All Mappings** removes all NexDay symbol mappings. Route sanity flags a route as **Earning** when it is net revenue-positive. Alert delivery uses named channels such as **Ops Room**. **Feed enabled** turns the Trading Economics feed on. **About LP profiles** explains LP profile setup. Charts show **Slippage Detection** and **Top Profitable** clients; the alert drawer offers **LLM Explanations**. **Dismiss** clears a notification.
