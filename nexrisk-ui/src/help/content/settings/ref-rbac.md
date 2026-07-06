---
id: ref-rbac
title: "Roles & access — who can see and edit each page"
type: reference
domain: settings
module: users
minLevel: VIEW
route: /users
source:
  - "Taiga RBAC Matrix (permission levels, role x module matrix, role summaries, enforcement layers, known per-page read-only gap)"
related: [ref-auth-session, ref-users, ref-secret-rotation]
tags: [rbac, roles, permissions, access-control, view, edit, dom-trader, enforcement]
status: reviewed
version: settings-v2
---

## How access works {#model}

Every session carries a permission level per module. The menu, the routes, and the
Fastify server all read the same map. Levels run low to high: **NONE** (hidden,
route blocked, endpoint refused) < **VIEW** (page visible, read-only) < **EDIT** /
**FULL** / **CRUD** / **SU** (full controls, writes permitted). The DOM Trader
panel is binary — on whenever its level isn't NONE.

## The roles {#roles}

- **Executive** — Cockpit, Portfolio, Net Exposure, Reports, all read-only. No DOM
  panel.
- **Compliance Officer** — Cockpit, Portfolio, Profiler; Users and Risk Charter
  read-only. No DOM panel.
- **Risk Manager** — everything except Users and Settings; Liquidity Providers and
  MT5 read-only; DOM panel on. This is the main risk-desk role.
- **System Dealer** — like Risk Manager, but Net Exposure and Coverage read-only,
  DOM panel off, and no Users / Settings / LP / MT5.
- **SysAdmin** — Cockpit, Portfolio, Logs, Reports, Users, Settings; LP and MT5
  read-only. No DOM panel.
- **Administrator** — full access to everything; DOM panel on.

## Which pages are editable {#editable}

Editable modules (need EDIT+): Predictions, Archetypes, Risk Charter, Hedging
Strategies, Liquidity Providers, Symbol Mapping, Route Sanity, Price Rules, Users,
Settings, MT5 Servers. Monitoring modules are view-only by nature: Cockpit,
Portfolio, Net Exposure, Profiler, B-Book, Coverage, Execution Report, Logs,
Reports.

## How it's enforced {#enforcement}

Four layers are live: menu visibility hides NONE modules; the route guard blocks
direct navigation to them; the DOM-panel gate renders that panel only when its
module isn't NONE; and the Fastify server refuses module endpoints (VIEW to read,
EDIT to write) before proxying to C++. So access is enforced server-side, not just
hidden in the UI.

## Known gap {#gap}

Per-page read-only control hiding isn't implemented yet: on write pages, a
VIEW-only user still sees the Edit / Add / Save controls. The action itself is
blocked server-side (the server returns 403), so it's a UX gap, not a security
hole — but the controls should be hidden. It affects MT5 Servers, Settings,
Hedging Strategies, Price Rules, Symbol Mapping, Route Sanity, Liquidity Providers,
Users, Archetypes, Risk Charter, and Predictions.
