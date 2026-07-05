---
id: ref-alerting
title: "Alerting — delivery channels"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source:
  - "Economic Calendar / Alerts notification integration docs"
  - "settings/AlertingPage.tsx"
related: [ref-alerts-bar, ref-system-settings]
tags: [alerting, telegram, webhook, delivery, severity]
status: reviewed
version: settings-v1
---

## Enabling alerts {#enable}

**Alerts enabled** turns outbound alert delivery on. **Alert levels** selects
which severities are delivered.

## Telegram {#telegram}

**Telegram delivery** sends alerts to Telegram. **Chats** / **Telegram chat ID**
are the destination chats. **Authorization** holds the bot credential (write-only
— leave blank to keep the current value).

## Webhooks {#webhooks}

**Webhook delivery** posts alerts to an HTTP endpoint; the webhook URL and an
optional **Authorization** header (e.g. a Bearer token) are configured here.
