# Trading Economics

## At a glance

Trading Economics is an upstream data provider for the economic calendar — the schedule of scheduled events that can move markets (NFP prints, central bank decisions, inflation releases, etc.). This page configures Taiga's connection to their calendar feed: whether it's running, what credentials to use, how much historical and upcoming data to hold on startup, and how often to poll.

Settings page path: **Settings → Trading Economics**
Route: `/settings/trading-economics`

## What this page controls

This page reads and writes the `trading_economics` sub-object inside `config/nexrisk_config.json`. It is one of several subsections sharing the main NexRisk config file.

All changes on this page require a restart of the **`nexrisk_service`** to take effect.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## Before you change anything

- **The feed consumes API quota.** Your Trading Economics subscription has an allowed request rate and a monthly quota. Short poll intervals and wide preload windows both push quota consumption up. Check your subscription tier before lowering the poll interval.
- **Know your API key.** The key is stored encrypted and never returned to the UI — if you're unsure whether the current key is correct, the simplest test is to enable the feed, restart, and watch the logs for authentication errors.
- **The feed is safe to disable.** Turning it off stops polling immediately after restart; the stored config is preserved, so you can re-enable without re-entering anything. Downstream features that rely on calendar events (news-driven trader archetypes, pre-event risk flags) will have no new data during the off period.

## Field reference

### `enabled` (toggle)

Master switch for the Trading Economics integration. When **off**:

- The service stops polling the REST endpoint for the calendar.
- The service stops maintaining a WebSocket subscription for live events.
- No API quota is consumed.
- Any downstream features that filter on upcoming economic events will see an empty calendar.
- All other settings on this page are preserved — flip it back on later to resume.

When **on**, behaviour depends on the remaining fields below.

### `api_key`

**Secret field.** Your Trading Economics API key.

Format is typically two hex strings separated by a colon — e.g. `51056C49BC90461:C5F849F9F1F84A5`. This is what Trading Economics issues you; it is not something you can generate locally.

The input always starts empty, with the placeholder *"Leave blank to keep current value"*. The server never returns the real key (it returns `"***"` on read), and the form never sends that masked value back. Rules:

- Leave blank to keep the current key unchanged.
- Type a new key to replace it.
- Never paste `"***"` — you'd literally save three asterisks as your API key.

Stored encrypted.

### `ws_endpoint`

The WebSocket URL for live event streaming. Example: `wss://stream.tradingeconomics.com/`.

Must start with either `ws://` (unencrypted) or `wss://` (TLS). Trading Economics' production endpoint is `wss://`; `ws://` would only be used in rare test environments. The form validates the prefix client-side and rejects anything else before the save request is sent.

### `poll_interval_seconds`

How often the service polls the REST calendar endpoint for new or updated events, in **seconds**. This is separate from the WebSocket — the poll catches edits and revisions that the stream might not push.

The form shows the human equivalent as you type: `90` displays as *"every 90 s"*, `300` as *"every 5 min"*, `3600` as *"every 1 h"*.

Typical value: `90` (90 seconds).

Short intervals (30s, 60s) cost more API quota. Long intervals (5 min, 15 min) mean calendar edits take longer to show up in Taiga.

### `preload_days_back`

Number of days of **historical** calendar events to pull on service startup. Example: `2` means "on boot, fetch events from the last 2 days."

Typical value: `2`. You want enough history to correlate recent events against current market moves, but pulling weeks of history on every restart wastes startup time and quota.

Positive integer, zero allowed.

### `preload_days_ahead`

Number of days of **upcoming** calendar events to prefetch on service startup. Example: `14` means "on boot, fetch events from today through 14 days out."

Typical value: `14`. Two weeks is enough lookahead that pre-event risk features have time to react.

Positive integer, zero allowed.

## Common tasks

### Rotate the API key

1. Obtain the new key from your Trading Economics account.
2. Clear the `api_key` field (it starts empty on load anyway).
3. Paste the new key.
4. Click **Save**. The banner shows a pending restart.
5. Restart `nexrisk_service`. Watch the logs for authentication success; if the new key is wrong, you'll see the Trading Economics API return 401 Unauthorized.

### Disable the feed temporarily (e.g. to save quota during a quiet week)

1. Flip the **Feed enabled** toggle off.
2. Click **Save**.
3. Restart `nexrisk_service`.
4. When you're ready to resume, flip it back on, save, and restart again.

Disabling does not delete your API key or any other settings — the feed just goes quiet.

### Lower quota consumption without disabling

Increase `poll_interval_seconds`. Going from 60 to 300 reduces poll traffic by a factor of five. The trade-off is that calendar *edits* on the provider side take up to 5 minutes to propagate into Taiga.

### Move to a different Trading Economics endpoint

Update `ws_endpoint` to the new URL. Make sure the prefix is `wss://` (or `ws://` if you have a specific reason). Save and restart.

## What's not implemented yet

### Feed summary panel

The right-hand **Feed summary** panel *is* live — it updates as you edit the form and shows your current draft in human terms (*"every 90 s"*, *"14 days ahead"*, etc.). This exists so you can sanity-check your changes before hitting Save.

### Live status / health

There's no runtime probe for Trading Economics itself yet — the page doesn't show "currently connected" or "last event received at…". That is tracked on the backend but not exposed to this page in v1.

### Recent changes

Placeholder, awaiting audit-log integration.

### Service status

Process / Status / Uptime / Last start panel shows `—` with "awaiting backend" — same pattern as every other sub-page.

## After you save

- Yellow **restart banner** appears site-wide, cleared automatically after the next 30-second hub refresh following the restart.
- Confirmation line: `Saved. Restart nexrisk_service to apply.`
- The feed continues running with *old* settings until you restart. On restart, the new settings take effect.

## Troubleshooting

### "Trading Economics isn't returning data after restart"

1. Check the logs at `nexrisk_service`'s log directory.
2. Look for `401 Unauthorized` — that means the API key is wrong or expired. Re-save with a correct key.
3. Look for DNS or connection timeouts — that means `ws_endpoint` isn't reachable from the host. Check the URL and test connectivity from the server.
4. Look for rate-limit errors (`429 Too Many Requests`). Your poll interval may be too short for your subscription tier. Increase `poll_interval_seconds`.

### "My API key looks right but authentication fails"

- Trading Economics keys have a specific format: two alphanumeric strings separated by a colon. A key that doesn't contain a colon is wrong.
- Whitespace in the key will cause silent failures. Check for trailing spaces or newlines when pasting from email.
- If you saved `"***"` by mistake (by clearing the placeholder and re-typing three asterisks), you literally saved three asterisks as your key. Save the real key again.

### "Events are showing up late"

Increase `preload_days_ahead` if you want more lookahead. Decrease `poll_interval_seconds` if you want updates faster. Note that live streaming via the WebSocket is usually faster than polling — make sure `ws_endpoint` is correctly configured.

### "Events from last week aren't showing up"

Increase `preload_days_back`. The service only loads history on startup, so you'll need to restart for the new value to apply.