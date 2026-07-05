---
id: ref-gateway
title: "Price feed gateway"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source: ["settings/GatewayPage.tsx", "Price Feed & Spread Management Architecture Reference"]
related: [ref-price-rules-states, ref-system-settings]
tags: [gateway, price-feed, service, status, config]
status: reviewed
version: settings-v1
---

## What it is {#what}

The **Price feed gateway** is the service that receives LP price ticks and
delivers repriced prices to MT5. This page shows its **Live status** and
**Service** health and lets you edit its **Configuration**; **Recent changes**
lists recent config edits.
