---
id: ref-log-viewer
title: "Log viewer"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source: ["settings/LogViewerPage.tsx"]
related: [ref-logs-fields, ref-system-settings]
tags: [logs, viewer, files, tail]
status: reviewed
version: settings-v1
---

## What it is {#what}

The **Log viewer** reads raw service log files from disk (distinct from the Audit
Logs, which record user actions). Pick a **Log directory** and a **File** from
the list of **Files**, and set **Limit** / **Lines** to control how many lines
are shown.
