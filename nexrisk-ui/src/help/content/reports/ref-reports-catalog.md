---
id: ref-reports-catalog
title: "Reports — available report types"
type: reference
domain: reports
module: reports
minLevel: VIEW
route: /reports
source:
  - "LP Volume Report API; Risk Matrix API; Price Rules Engine API; FIX Bridge API"
  - "ReportsPage.tsx"
related: [ref-reports-columns, ref-logs-fields]
tags: [reports, catalog, financial, fix, risk-matrix, cluster, feed]
status: reviewed
version: reports-v1
---

## Report categories {#categories}

**Financial** / **Profitability** — LP volume and P&L. **Order Execution** /
**Execution Summary** — fills and routing. **FIX Message Log** — raw FIX traffic
by **Msg Type**, with **Received** and **Rejections**. **Health & Escalations** —
route sanity and escalated positions. **Risk Matrix Config** / **Risk Matrix
Rules** / **Risk Matrix History** — the risk policy and its change log. **Cluster
Profiles** / **Cluster Assignments** — clustering output by **Run ID**. **LP
Instruments** / **LP Audit Log** — LP symbol sets and change history. **Feed
Configuration** / **Feed Summary** / **Spread Rules** / **Group Spread Rules** —
price-feed setup by **Feed ID**. **Access Control** / **Users** — roles and
accounts, including **Inactive** ones.

## Running a report {#run}

Configure the filters, choose a **Group by**, and run; results paginate with
**Rows per page** and **Next**.
