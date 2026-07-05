---
id: ref-system-settings
title: "System Settings — configuration fields"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source:
  - "Settings API"
  - "NexRisk Auth Frontend Developer Reference (tokens, secrets)"
  - "Settings.tsx"
related: [ref-mt5-config, ref-users]
tags: [settings, gateway, tokens, retention, secrets, environment]
status: reviewed
version: settings-v1
---

## Connectivity {#connectivity}

**Upstream MT5** — the MT5 server the platform connects to; **Listen** — the
address/port the service listens on; **Gateway login** — the gateway account.
**Environment** identifies the deployment (e.g. demo/live) and **Last sync**
shows when config last synchronised.

## Polling and data windows {#polling}

**Intraday poll** and **Poll interval** — how often intraday data refreshes;
**Daily bars kept** — how much daily history is retained.

## Security {#security}

**Access token** / **Refresh token** — session token lifetimes; **Password min**
— minimum password length; **JWT secret** — the signing key for session tokens;
**Internal secret** — the shared secret the frontend server uses to authenticate
to the C++ service; **Encryption key** — the key protecting data at rest.

## Retention and delivery {#retention}

**Raw FIX retention** — how long raw FIX logs are kept; **Incident bundles** —
retention of diagnostic bundles; **Log level** — verbosity. **Telegram chats**,
**Webhooks**, and **Min severity** configure where and at what threshold alerts
are delivered. **Services** and **Browser** show component status.
