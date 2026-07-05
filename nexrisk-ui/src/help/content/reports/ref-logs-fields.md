---
id: ref-logs-fields
title: "Audit Logs — severity and columns"
type: reference
domain: reports
module: logs
minLevel: VIEW
route: /logs
source:
  - "Logs.tsx / AuditLogPage.tsx (severity, column headers)"
related: [gls-risk-severity]
tags: [logs, audit, severity, info, warn, critical]
status: reviewed
version: reports-v1
---

## Severity {#severity}

Log lines carry a severity of **INFO** (routine), **WARN** (a condition worth
attention), or **CRITICAL** (an urgent fault).

## Columns {#columns}

**Sev** — the severity above. **Category** — the log category. **Actor** — the
user or service that performed the action. **Entity** — the object acted on.
**Context** — additional structured detail. **Service** — the originating
service. **Notes** — free-text remarks.
