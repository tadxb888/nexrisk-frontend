---
id: ref-gateway
title: "Price feed gateway"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/gateway
source:
  - "nexrisk-ui/src/pages/settings/help/01-gateway.md (dev-authored operator manual)"
related: [ref-system-settings, ref-users]
tags: [settings, gateway, operator-manual]
status: reviewed
version: settings-v2
---


## At a glance

The Price feed gateway is a small service that sits between your upstream MetaTrader 5 (MT5) broker server and the rest of Taiga. It receives real-time tick data from MT5 and republishes it to any downstream terminals or services that need price feeds. This page configures how the gateway connects to MT5 and how it exposes itself to your network.

Settings page path: **Settings → Price feed gateway**
Route: `/settings/gateway`

## What this page controls

This page reads and writes the `gateway` object inside `config/nexrisk_gateway.json` on the server. It is a single small JSON file dedicated to the price feed gateway and is separate from the main NexRisk config. There are seven fields in total, one of which is a secret.

Changes on this page take effect only after the **`nexrisk_gateway`** process is restarted. The `nexrisk_service` is not affected — gateway is its own independent binary.

## Who can access it

This page is visible to users with one of the following roles:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

Other roles will not see a Settings entry in the navigation.

## Before you change anything

- **The gateway is a production dependency.** If your pricing feeds go through it, changing its settings and restarting it will interrupt price delivery to every downstream consumer for the duration of the restart. Coordinate with your trading desk before proceeding.
- **Have the MT5 server reachable first.** If you change `mt5_server` to an address the host cannot resolve or reach, the gateway will restart, fail to connect, and stay offline until you correct it.
- **Know your MT5 gateway account.** The `gateway_login` and `gateway_password` fields are the credentials for a dedicated MT5 account the gateway uses to pull prices. This is **not** a trader's account — it should be a service account with read-only access to the instruments you care about.

## Field reference

### `mt5_server`

The address of your upstream MT5 server, in `host:port` format. Example: `175.110.113.174:15024`.

This is the server the gateway connects to as a client — it is provided by your broker or by whoever operates your MT5 infrastructure. The gateway resolves this host on startup; if the name cannot be resolved or the TCP connection fails, the gateway will not start serving prices.

### `gateway_login`

The MT5 account number (numeric) the gateway logs in as. This account must exist on the `mt5_server` above, must have permission to subscribe to market data, and ideally has no trading permissions.

### `gateway_password`

**Secret field.** The password for the `gateway_login` account.

The input on this page always starts empty, with the placeholder *"Leave blank to keep current value"*. The server never returns the real password — it returns `"***"` — and the form never sends that masked value back. The rules are:

- Leave the field blank to keep the current password unchanged.
- Type a new password to replace it.
- Never paste `"***"` (three asterisks) into the field — doing so would literally save the string `"***"` as the password.

Passwords are stored encrypted on the server using the encryption key you can rotate on the Secret rotation page.

### `gateway_listen`

The address and port the gateway listens on for downstream consumers, in `host:port` format. Example: `0.0.0.0:16390`.

Use `0.0.0.0` to listen on all network interfaces on the host. Use `127.0.0.1` to restrict connections to the same machine. The port must be free — if something else is already bound to it, the gateway will fail to start with a bind error.

### `gateway_name`

A human-readable name for this gateway instance, shown in logs and to MT5 terminals that connect. Example: `NexRisk Price Feed`. Purely cosmetic — it does not affect behaviour.

### `timezone_minutes`

The gateway's configured timezone, expressed as an offset from UTC in **minutes**. `0` means UTC. `60` means UTC+01:00. `-300` means UTC-05:00 (US Eastern Standard Time).

This affects how timestamps in gateway-generated log lines and tick records are presented. It does not alter MT5's own server time — MT5 publishes whatever time its server uses, and the gateway passes it through.

### `log_path`

Directory (relative to the gateway working directory, or absolute) where gateway log files are written. Default is `logs`. The gateway rotates log files daily.

## Common tasks

### Change the upstream MT5 server

1. Confirm the new server is reachable from your host (a simple TCP connectivity test to `host:port` is enough).
2. Confirm the `gateway_login` account exists on the new server and has market data permission.
3. Update `mt5_server` on this page.
4. If the password is different on the new server, update `gateway_password` at the same time. Otherwise leave it blank.
5. Click **Save**. The banner at the top of the page will show a pending restart.
6. Restart the `nexrisk_gateway` process. Prices will come back online within a few seconds of startup.

### Change the MT5 password

1. Clear the password field (it already starts empty on load — you don't have to delete `"***"`).
2. Type the new password.
3. Click **Save**.
4. Restart the gateway. If the new password is wrong, the gateway will log an authentication failure and stay offline — you won't have broken anything, but you'll need to correct it before prices flow again.

### Move the listen port

1. Confirm no other service is using the target port.
2. Confirm all downstream consumers (terminals, services) can be updated to the new port at roughly the same time as the restart.
3. Update `gateway_listen`.
4. Save and restart.
5. Reconfigure every downstream consumer to connect to the new port.

## What's not implemented yet

### Live status

The page shows a "Live status" panel in the right-hand column. Today this panel displays dashes because the backend endpoint (`GET /settings/gateway/status`) returns **501 Not Implemented**. When the backend is wired, this panel will show:

- Upstream MT5 connection state (connected / disconnected / authenticating)
- Number of downstream terminals connected
- Last tick timestamp received
- Rolling tick rate (ticks per second)

You'll see a `GET /gateway/status — 501 stub` badge in the panel header until this lands. No action needed on your part — when the endpoint returns 200, the panel will fill in automatically.

### Recent changes

The "Recent changes" panel is a placeholder. Once the audit-log integration lands in a later ticket, it will show the last five edits to `nexrisk_gateway.json` — who made them, when, and what changed.

### Service status

The "Service" panel at the bottom right shows `—` for **Status**, **Uptime**, and **Last start** with an "awaiting backend" note. These three fields need a backend health endpoint that doesn't exist yet. **Process**, **Config file**, and **Log dir** are filled in because they're known from configuration, not from runtime probing.

## After you save

- A yellow **restart banner** appears at the top of the Settings hub and on this sub-page. It stays visible on every Settings page you visit until the gateway is restarted.
- The bottom of the form confirms the save with a message like `Saved. Restart nexrisk_gateway to apply.`
- No downstream consumers notice anything until you actually restart. The new values sit in the JSON file waiting.
- After restart, the banner clears automatically within the next 30-second hub refresh cycle.

## Troubleshooting

### "Gateway won't start after I saved"

Check the gateway's log file (path shown in the **Service** panel as `Log dir`). Common causes:

- **`mt5_server` unreachable.** Host doesn't resolve, or the port is blocked. Fix the address or firewall rule and restart.
- **Authentication failure.** Wrong `gateway_login` / `gateway_password`. Re-save with corrected credentials and restart.
- **Bind error on `gateway_listen`.** Another process is using the port. Either stop the other process or pick a different port.

### "I can't tell what password is saved"

You can't — and that's intentional. The server returns `"***"` on read, and the UI never pre-fills a secret. If you're unsure whether the current password is correct, the fastest test is to restart the gateway and check whether it connects successfully. If it doesn't, update the password.

### "I typed `"***"` by accident"

Clear the password field (it starts empty on the next page load — or just reload the page, which discards unsaved input) and re-enter the correct password before saving again. If you already saved `"***"` as the password, the gateway will fail to authenticate with MT5 on next restart, and you'll need to save the real password again.

### "My changes didn't take effect"

The save was persisted but the gateway has not been restarted. The file on disk is up to date; the running process is still using the values it loaded at startup. Restart `nexrisk_gateway`.
