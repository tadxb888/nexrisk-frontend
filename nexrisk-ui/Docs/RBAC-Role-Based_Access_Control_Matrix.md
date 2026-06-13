# Taiga (NexRisk) — Role-Based Access Control Matrix

Permission model: every session carries a `permissions` object mapping each
**module** to a **level**. The UI builds the menu and gates controls from it;
the Fastify server enforces the same map before proxying to the C++ services.

## Permission levels (low → high)

```
NONE < VIEW < EDIT < FULL < CRUD < SU
```

- **NONE** (or missing) — module hidden; route blocked; endpoint refused.
- **VIEW** — page visible, rendered **read-only** (no create/edit/delete/save).
- **EDIT / FULL / CRUD / SU** — full controls; write endpoints permitted.

In this document each cell is shown as one of three effective states:

| Symbol | Meaning |
|:---:|---|
| **—** | No access (NONE / missing) — hidden + blocked |
| **View** | Read-only (VIEW) |
| **Edit** | Full controls (EDIT or above) |

`dom_trader` is binary (panel **On** when the level is not NONE).

## Modules and where they live

| Menu group | Menu item | Module key | Type |
|---|---|---|---|
| Overview | Cockpit | `cockpit` | Monitoring |
| Overview | Portfolio | `portfolio` | Monitoring |
| Overview | Net Exposure | `net_exposure` | Monitoring |
| Intel | Profiler | `focus` | Monitoring |
| Intel | Predictions | `predictions` | Editable |
| Intel | Archetypes | `archetype` | Editable |
| Intel | Risk Charter | `charter` | Editable |
| Execution | B-Book | `bbook` | Monitoring |
| Execution | Coverage Book | `coverage` | Monitoring |
| Execution | Hedging Strategies | `hedge_strat` | Editable |
| Execution | Execution Report | `exec_report` | Monitoring |
| Markets | Liquidity Providers | `lp_admin` | Editable |
| Markets | Symbol Mapping | `symbol_map` | Editable |
| Markets | Route Sanity | `route_sanity` | Editable |
| Markets | Price Rules Engine | `price_rules` | Editable |
| Control | Logs | `logs` | Monitoring |
| Control | Reports | `reports` | Monitoring |
| Control | Users | `users` | Editable |
| Control | Settings | `settings` | Editable |
| System | MT5 Servers | `mt5_servers` | Editable |
| *(panel)* | DOM Trader | `dom_trader` | Panel inside Net Exposure + Coverage |

## Role × module matrix

Expected access per role, per the role specification.

| Module | Executive | Compliance Officer | Risk Manager | System Dealer | SysAdmin | Administrator |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| cockpit | View | View | View | View | View | View |
| portfolio | View | View | View | View | View | View |
| net_exposure | View | — | View | View | — | View |
| focus (Profiler) | — | View | View | View | — | View |
| predictions | — | — | Edit | Edit | — | Edit |
| archetype | — | — | Edit | Edit | — | Edit |
| charter (Risk Charter) | — | View | Edit | Edit | — | Edit |
| bbook | — | — | View | View | — | View |
| coverage | — | — | View | View | — | View |
| hedge_strat | — | — | Edit | Edit | — | Edit |
| exec_report | — | — | View | View | — | View |
| lp_admin | — | — | View | — | View | Edit |
| symbol_map | — | — | Edit | Edit | — | Edit |
| route_sanity | — | — | Edit | Edit | — | Edit |
| price_rules | — | — | Edit | Edit | — | Edit |
| logs | — | — | View | View | View | View |
| reports | View | — | View | View | View | View |
| users | — | View | — | — | Edit | Edit |
| settings | — | — | — | — | Edit | Edit |
| mt5_servers | — | — | View | — | View | Edit |
| **dom_trader (panel)** | **—** | **—** | **On** | **—** | **—** | **On** |

### Role summaries

- **Executive** — Cockpit, Portfolio, Net Exposure, Reports (all read-only). No DOM panel.
- **Compliance Officer** — Cockpit, Portfolio, Profiler; Users and Risk Charter read-only. No DOM panel.
- **Risk Manager** — everything except Users and Settings; LP and MT5 read-only; DOM panel **on**.
- **System Dealer** — like Risk Manager, but Net Exposure and Coverage read-only, DOM panel **off**, and no Users / Settings / LP / MT5.
- **SysAdmin** — Cockpit, Portfolio, Logs, Reports, Users, Settings; LP and MT5 read-only. No DOM panel.
- **Administrator** — full access to everything; DOM panel **on**.

## Enforcement layers

| Layer | What it does | Status |
|---|---|---|
| Menu visibility | Hides nav items where the module is NONE/missing | Shipped |
| Route guard | Blocks direct navigation to a NONE module (redirects) | Shipped |
| DOM panel gate | Renders the DOM Trader panel only when `dom_trader ≠ NONE` | Shipped |
| BFF enforcement | Server refuses module endpoints (VIEW to read, EDIT to write) | Shipped |
| **Per-page read-only** | **Hides create/edit/delete/save controls at VIEW** | **Not yet implemented** |

> **Known gap — per-page read-only controls.** Write pages still render their
> Edit / Add / Save controls to VIEW-only users. The action is blocked
> server-side (the BFF returns 403), so this is a UX gap, not a security hole,
> but the controls should be hidden. Affects: MT5 Servers, Settings, Hedging
> Strategies, Price Rules, Symbol Mapping, Route Sanity, Liquidity Providers,
> Users, Archetypes, Risk Charter, Predictions.

## Live verification (against deployment)

| Check | Role | Result | Verdict |
|---|---|---|---|
| `GET /auth/me` permissions present | Executive | matches spec (4× VIEW, rest NONE) | ✅ |
| `POST /fix/order` | Executive (dom_trader NONE) | 403 | ✅ deny |
| `GET /settings` | Executive | 403 | ✅ deny |
| `GET /users` | Executive | 403 | ✅ deny |
| `GET /reports/*` | Executive (reports VIEW) | 404 (passed gate → backend) | ✅ allow |
| `dom_trader` level | Risk Manager | FULL | ✅ |
| `POST /fix/order` | Risk Manager (dom_trader FULL) | 400 (passed gate → body validation) | ✅ allow |
| `GET /settings`, `GET /users` | Risk Manager | 403 / 403 | ✅ deny |
| `mt5_servers` level | Risk Manager | VIEW | ✅ |
| `GET /mt5/nodes` | Risk Manager | 200 | ✅ read allowed |
| `POST /mt5/nodes`, `PUT /mt5/nodes/:id` | Risk Manager | 403 / 403 | ✅ write blocked |

**Headline:** the same `POST /fix/order` returns **403 for Executive** and
**400 (allowed → validation) for Risk Manager** — deny where NONE, allow where
the level is present, enforced server-side independent of the UI.

> Note: permissions are read at login. After any role/permission change in the
> DB, the affected user must re-login to pick up the new map.