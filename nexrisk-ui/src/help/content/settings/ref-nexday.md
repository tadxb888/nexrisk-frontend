---
id: ref-nexday
title: "NexDay integration"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source: ["settings/NexDayPage.tsx", "Tech-lead: NexDay is a separate app providing market predictions, opportunity detection, and entry/exit strategies; Taiga injects some of it to assist hedging"]
related: [ref-predictions, ref-system-settings]
tags: [nexday, integration, predictions, polling, hedging]
status: reviewed
version: settings-v1
---

## What it is {#what}

**NexDay** is a separate application that produces market predictions, trading
opportunity detection, and entry/exit strategies. Taiga ingests some of that
information to help risk managers shape hedging decisions. This page configures
that integration.

## Configuration {#config}

**NexDay enabled** turns the integration on. **Auto-suggest hedges** lets the
injected NexDay signals surface hedging suggestions. **Daily polling** and
**Intraday polling** set how often Taiga pulls fresh NexDay data. The
**Integration summary** shows current status and the **Service** health;
**Recent changes** lists recent config edits.
