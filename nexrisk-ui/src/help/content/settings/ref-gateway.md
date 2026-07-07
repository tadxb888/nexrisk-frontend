---
id: ref-gateway
title: "Price Feed Gateway — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/gateway
order: 1
source:
  - "Settings_01_Price_Feed_Gateway.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,gateway,price-feed,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

The Price feed gateway is a standalone service that sits between your
upstream MetaTrader 5 (MT5) broker server and the rest of Taiga. It logs
in to MT5 as a dedicated market-data account, subscribes to real-time
price ticks, and republishes those ticks on a network port to any
terminals and services downstream that need a price feed. This page
configures both sides of that job: how the gateway connects up to MT5,
and how it exposes itself down to your network.

You reach it at **Settings › Price feed gateway**. It has seven
settings, one of which is a password.

|                                                                                                                                                                                                                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The gateway is a production dependency.** If your pricing runs through it, changing its settings and restarting the gateway service interrupts price delivery to every downstream consumer — including Taiga’s own core service — for the length of the restart. Always coordinate with the trading desk, and mind the service restart order in Section 3. |

## 2. How the Gateway Fits Together

The data path is simple: **MT5 server → NexRisk Gateway service →
downstream consumers**. The gateway holds one authenticated session
upstream to MT5 and serves many connections downstream on its listen
port. It runs as its own process with its own configuration, so it can
be restarted on its own — but the platform depends on it, so the restart
is not without consequence.

There are three moving parts around this page, and it is worth being
precise about which is which, because only one of them is the service
you restart here:

| **Component**           | **What it is**                                                                                                                                | **Restarted here?**                                        |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| Upstream MT5 server     | Your broker’s (or infrastructure provider’s) MT5 server — the source of prices, and where symbols are defined. The gateway is a client of it. | No. External to Taiga; never restarted from here.          |
| NexRisk Gateway service | The standalone Taiga service this page configures — the MT5 client and price republisher, running as its own process.                         | Yes. This is the service you restart to apply changes.     |
| NexRisk service (core)  | The core Taiga service (risk, dashboards, sessions). It is a downstream consumer of the gateway’s prices.                                     | Not by this page — but see the restart order in Section 3. |

## 3. The Three Services and the Restart Order

Taiga runs as three cooperating services. This page configures one of
them, but a gateway restart has to be planned with the other two in
mind, because they depend on each other in a fixed order.

| **Service**                | **Role**                                                             |
|----------------------------|----------------------------------------------------------------------|
| NexRisk FIX Bridge service | Liquidity-provider connectivity — the FIX sessions to your LPs.      |
| NexRisk Gateway service    | The price feed — MT5 prices republished to the platform (this page). |
| NexRisk service (core)     | Risk, dashboards and user sessions — it consumes both of the above.  |

The core service **subscribes to the two feeds at startup**. If the core
starts before the FIX bridge and the gateway are up and running, its
subscriptions attach to nothing — it will sit there without prices or LP
connectivity until it is restarted after the feeds are ready. The feeds
must therefore be fully up before the core.

### 3.1 The order to bring services up

1.  **NexRisk FIX Bridge service** — start first, and wait until it is
    fully up (logged on and connected).

2.  **NexRisk Gateway service** — start next; confirm it has connected
    to MT5 and is serving prices.

3.  **NexRisk service (core)** — start last; it now attaches to the two
    feeds that are ready and waiting.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **What this means when you change gateway settings.** Restarting the gateway cuts the price feed to the core service. If the core does not re-establish its price subscription on its own once the gateway is back, restart the core service after the gateway — always the gateway first, the core last. For a full platform restart, follow the order above: FIX bridge, then gateway, then core. Coordinate the sequence with the desk so nobody is watching a dashboard that has quietly lost its feed. |

## 4. Symbols, LP Mapping, and the MT5 Administrator’s Scope

The gateway is the pipe. What flows through it — which symbols exist and
what they are called — is defined upstream on the MT5 server, not on
this page and mostly not in Taiga at all. Two symbol matters sit outside
this page and are worth calling out, because when a symbol is missing
the cause is almost always here rather than in a gateway setting.

### 4.1 The MT5-side symbol set (out of Taiga’s scope)

Which symbols exist on the server, how they are named, and whether the
gateway’s market-data account is entitled to and subscribed to them, is
all configured **on the MT5 server** — the symbol list, the account’s
market-data permissions, and the symbol subscription. This is the **MT5
administrator’s responsibility, not Taiga’s**. Creating or adjusting
that symbol mapping happens on the MT5 side, outside this application.

|                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Coordinate the symbol set with your MT5 administrator.** Setting up which symbols the gateway account can see, and their MT5 names, falls outside the scope of Taiga. Agree the symbol set and naming with your MT5 administrator before relying on the feed. If a symbol you expect never appears, the fix is on the MT5 server — an entitlement or subscription that the MT5 administrator must add — not a change on this page. |

**4.2 LP-to-MT5 symbol mapping (elsewhere in Taiga, and dependent on the
above)**

For pricing and hedging to line up end to end, the symbol names your
**liquidity providers** use must correspond to the **MT5** symbol names
the gateway delivers. That LP-to-MT5 correspondence is maintained
elsewhere in Taiga (on the Symbol mapping page), and it can only be
completed once the MT5 symbols exist and are named consistently. In
other words, the MT5-side naming (Section 4.1, agreed with your MT5
administrator) has to be settled first; the LP-to-MT5 mapping in Taiga
is built on top of it. The gateway page itself does not map symbols — it
simply delivers whatever the MT5 account is subscribed to.

## 5. What This Page Controls

This page reads and writes the gateway’s own configuration file on the
server (named nexrisk_gateway.json), dedicated to the gateway and kept
separate from the platform’s main configuration. The gateway loads this
file once, at startup — which is why every change here is inert until
the gateway service restarts and re-reads it. The service to restart is
the **NexRisk Gateway service** (Section 3): not the upstream MT5
server, and not, by this change alone, the core service.

## 6. Before You Change Anything

- **Have the MT5 server reachable first.** If you point the gateway at
  an address the host cannot resolve or reach, the service will restart,
  fail to connect, and stay offline until you correct it. Verify basic
  network reachability to the address and port before saving.

- **Use a dedicated market-data account.** The login and password should
  belong to a service account on the MT5 server with permission to
  subscribe to market data and, ideally, no trading permission — not a
  trader’s account.

- **Confirm the symbol set with the MT5 administrator.** Make sure the
  account is entitled to the symbols you need (Section 4) — the gateway
  can only serve what the account can see.

- **Plan the restart window and order.** Nothing applies until you
  restart the gateway service, that restart stops prices, and the core
  service may need to follow (Section 3). Pick a moment the desk is
  expecting.

## 7. The Settings

The seven settings, in the order they appear on the page.

### 7.1 MT5 server

The address of your upstream MT5 server, given as an address and port
(for example, 175.110.113.174:15024). This is the endpoint the gateway
connects to as a client, supplied by your broker or MT5 infrastructure
provider. The gateway resolves and connects to this address on startup;
if the host cannot be resolved or the connection is refused, the gateway
will not begin serving prices, and it will keep retrying while logging
the failure.

### 7.2 Gateway login

The numeric MT5 account the gateway logs in as. This account must exist
on the MT5 server above, must be entitled to subscribe to the symbols
you care about, and ideally carries no trading rights. If the account
lacks market-data entitlement for a symbol, the gateway connects but no
ticks arrive for that symbol — an entitlement matter for the MT5
administrator (Section 4).

### 7.3 Gateway password

**This is a password field, and it behaves specially for security.** It
always loads empty, showing the prompt "Leave blank to keep current
value". The server never returns the stored password — it returns three
asterisks — and the page never sends those asterisks back. The rules
are:

- Leave the field **blank** to keep the current password unchanged.

- Type a **new password** to replace it.

- **Never type three asterisks yourself** — that literally stores
  "\*\*\*" as the password, and the gateway then fails MT5
  authentication on the next restart.

The password is held encrypted at rest on the server, using the
encryption key you can change on the Secret rotation page. It is
decrypted only in memory, at startup, to log in to MT5.

### 7.4 Listen address

The address and port the gateway binds to for downstream consumers (for
example, 0.0.0.0:16390). Binding to 0.0.0.0 accepts connections on every
network interface on the host; binding to 127.0.0.1 restricts
connections to the same machine only. The chosen port must be free at
startup — if another process already holds it, the gateway cannot bind
and will not start. Remember to allow the port through any host or
network firewall in front of your downstream consumers.

### 7.5 Gateway name

A human-readable label for this gateway instance (for example, "NexRisk
Price Feed"), shown in the gateway’s logs and to MT5 terminals that
connect. Cosmetic — it does not affect behaviour, and is useful mainly
for telling instances apart if you run more than one.

### 7.6 Timezone

The gateway’s timezone, as an offset from UTC in minutes: 0 is UTC, 60
is UTC+1, and −300 is UTC−5 (US Eastern Standard Time). It affects only
how timestamps are presented in the gateway’s own log lines and tick
records; it does not alter MT5’s server time, which is passed through
unchanged.

### 7.7 Log directory

Where the gateway writes its log files — a relative folder in the
gateway’s working directory (default "logs") or an absolute path. Logs
rotate daily. This is the first place to look when the gateway will not
start or reconnect (Section 10).

## 8. Common Tasks

### 8.1 Change the upstream MT5 server

1.  Confirm the new server is reachable from the host (address and
    port).

2.  Confirm the gateway login exists on the new server and is entitled
    to the symbols you need (with the MT5 administrator).

3.  Update the MT5 server address; if the password differs on the new
    server, enter it too, otherwise leave it blank.

4.  Save — the restart banner appears — then restart the **NexRisk
    Gateway service**, and the core service afterwards if it does not
    re-subscribe on its own (Section 3).

### 8.2 Change the MT5 password

5.  Leave the password field as it loads (empty) and type the new
    password.

6.  Save, then restart the NexRisk Gateway service. If the new password
    is wrong, the gateway logs an authentication failure and stays
    offline — nothing is broken, but correct it before prices flow.

### 8.3 Move the listen port

7.  Confirm no other process is using the target port, and that every
    downstream consumer can be moved to it at about the same time.

8.  Update the listen address, save, and restart the NexRisk Gateway
    service.

9.  Point every downstream consumer at the new port, update firewall
    rules, and restart the core service if it consumed the old port
    directly.

## 9. Saving and Restarting

Saving and applying are two separate steps, by design — which is what
makes changes safe to stage and easy to undo.

- When you save, the values are written to the gateway’s configuration
  file, and a **yellow restart banner** appears across the Settings area
  and stays on every Settings page until the gateway service is
  restarted. The form also confirms with a short "restart to apply"
  message.

- Until you restart the gateway service, **nothing downstream changes**
  — the new values sit in the file while the running gateway keeps using
  what it loaded at its last startup.

- After the restart, the banner clears by itself within about half a
  minute, when the Settings area next re-checks the server for pending
  changes.

|                                                                                                                                                                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Staged changes are reversible until you restart.** Save a bad value and notice before restarting? Correct it and save again — no restart means no effect, so the running gateway never saw it. This also lets you stage several changes and apply them in one planned restart, in the right service order. |

## 10. Live Status and Service Panels

The right-hand column carries three panels:

- **Live status** — shows the upstream MT5 connection state, the number
  of downstream terminals connected, the last tick received, and the
  rolling tick rate.

- **Recent changes** — lists the last few edits to the gateway
  configuration: who changed what, and when.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file, and Log directory.

## 11. Troubleshooting

### 11.1 The gateway will not start after I saved

Open the gateway’s log file (location shown in the Service panel as the
log directory). The usual causes:

- **MT5 server unreachable** — the address does not resolve or the port
  is blocked. Correct the address or firewall rule and restart the
  gateway service.

- **Authentication failure** — wrong gateway login or password. Re-save
  the correct credentials and restart.

- **Port already in use** — another process holds the listen port, so
  the gateway cannot bind. Free the port or choose another, then
  restart.

### 11.2 I cannot tell which password is saved

You cannot, by design — the server never returns a saved password and
the page never pre-fills one. The quickest test is to restart the
gateway service and see whether it authenticates and serves prices; if
not, enter the password again.

### 11.3 I entered three asterisks by accident

Reload the page — that discards the unsaved input and the field loads
empty again — then enter the correct password and save. If you had
already saved the asterisks, the gateway fails MT5 authentication at the
next restart; save the real password and restart again.

### 11.4 A symbol is missing from the feed

If the gateway is connected and serving other symbols but one is
missing, the gateway login most likely lacks market-data entitlement or
subscription for that symbol on the MT5 server, or the symbol is not set
up upstream. This is an MT5-side matter for your MT5 administrator
(Section 4), not a gateway setting.

### 11.5 The dashboard lost prices after I restarted the gateway

The core service consumes the gateway’s feed, and a gateway restart
interrupts it. If the core does not re-establish its price subscription
on its own, restart the core service after the gateway (Section 3).
Always the gateway first, the core last.

### 11.6 My changes did not take effect

The save succeeded, but the gateway service has not been restarted. The
configuration file holds the new values; the running gateway is still
using what it loaded at startup. Restart the NexRisk Gateway service.

*End of guide — Settings › Price feed gateway. One of nine Settings
operator guides.*
