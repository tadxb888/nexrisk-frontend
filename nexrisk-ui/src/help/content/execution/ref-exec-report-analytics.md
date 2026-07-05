---
id: ref-exec-report-analytics
title: "Execution Report — analytics and blotter"
type: reference
domain: execution
module: exec_report
minLevel: VIEW
route: /execution-report
source:
  - "FIX Bridge API / DOM Trader (order blotter, execution reports)"
  - "ExecutionReport.tsx"
related: [ref-exec-report-states]
tags: [execution, analytics, latency, blotter, rejection]
status: reviewed
version: exec-v1
---

## Order blotter {#blotter}

The **FIX Bridge order blotter** lists routed orders, filterable by **Liquidity
Provider** (or **All Liquidity Providers**). Summary stats: **Positions**,
**Long / Short**, **Vol**, average/best/worst round-trip (**Avg RT** / **Best
RT** / **Worst RT**), and **Rejections** / **Rejection %**.

## Charts {#charts}

**Latency Over Time** and **Latency by LP** plot round-trip latency (with **Min**
/ **Avg** / **Max**); **Orders by Status** breaks orders down by execution state;
**Volume by Symbol** shows traded volume per instrument.
