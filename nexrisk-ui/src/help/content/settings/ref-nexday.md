---
id: ref-nexday
title: "NexDay integration"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/nexday
source:
  - "nexrisk-ui/src/pages/settings/help/04-nexday.md (dev-authored operator manual)"
related: [ref-system-settings, ref-users]
tags: [settings, nexday, operator-manual]
status: reviewed
version: settings-v2
---


## At a glance

NexDay is an upstream market-data provider used by Taiga for daily and intraday price bars, plus hedging suggestions. This page configures the full integration — connection, polling cadence, how much bar history to retain, and how the hedging-suggestion engine behaves. Twelve fields across four logical groups, one of which is a secret.

Settings page path: **Settings → NexDay integration**
Route: `/settings/nexday`

## What this page controls

This page reads and writes the `nexday` sub-object inside `config/nexrisk_config.json`. It is one of several subsections in the main NexRisk config file.

Restart semantics are **mixed** — some fields apply immediately once written to disk (the service picks them up on its next poll), others require a full service restart. In practice, treat every change on this page as requiring a restart of **`nexrisk_service`**. The backend is the authoritative source for what's "live" vs "restart", and erring on the side of restart is always safe.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## Before you change anything

- **NexDay is a paid licensed integration.** Your license ID is the credential the service uses to authenticate upstream. Keep it treated as a secret.
- **Polling frequency affects your data costs.** Higher frequency = more API calls = more cost (check your NexDay contract). Lower frequency = less cost, but also older intraday bars.
- **Hedging suggestions are suggestions only.** The `auto_suggest` toggle does *not* cause Taiga to place hedges. It surfaces suggestions for humans to act on. If you want automated execution, that's a separate page.
- **Daily poll time is US Eastern.** NexDay publishes end-of-day bars on a US schedule. The `daily_time_et` field is the local time in New York that Taiga will poll for the day's closing bars — typically shortly after 17:00 ET (close of US cash session).

## Field reference

The form is grouped into four sections. Each section has a small uppercase divider on the page itself.

### Connection

#### `enabled` (toggle)

Master switch for the NexDay integration. When **off**:

- No polling (intraday or daily).
- No hedging suggestions generated.
- No API calls to NexDay — zero license cost.
- All other settings preserved for when you flip back on.

#### `api_server`

Base URL of the NexDay API server. Example: `http://175.110.113.174:8080`.

Must start with `http://` or `https://`. In production this should almost always be `https://` — the form accepts both but the difference is whether your license credentials travel encrypted.

#### `license_id`

**Secret field.** Your NexDay license ID — a numeric string. Example: `3561334610044732`.

Same write-preserve discipline as every other secret on this page:

- Input starts empty with placeholder *"Leave blank to keep current value"*.
- Leave blank to keep the current license unchanged.
- Type a new license ID to replace it.
- Never paste `"***"` — you'd save three asterisks as your license.

Stored encrypted.

### Polling

NexDay has two polling modes — intraday (hourly or more frequent) and daily (once per day). They're controlled independently.

#### `intraday_enabled` (toggle)

Master switch for intraday polling. Disables the intraday interval field below when off.

#### `intraday_interval_minutes`

How often, in **minutes**, the service fetches intraday bars. Example: `15` means "every 15 minutes."

The form shows the human equivalent as you type: `15` displays as *"every 15 min"*, `60` as *"every 1 h"*.

Typical value: `15` during active trading sessions. Shorter intervals produce more up-to-date bars but cost more API calls.

When `intraday_enabled` is off, this field is disabled.

#### `daily_enabled` (toggle)

Master switch for daily polling. Disables the daily time field below when off.

#### `daily_time_et`

Time of day (in US Eastern time) when the service pulls daily closing bars. Format: `HH:MM`. Example: `17:01`.

Typical value: `17:01`. US cash session closes at 16:00 ET; allowing roughly an hour for end-of-day settlement, 17:00 ET is when daily bars are reliably available. Using `17:01` (one minute past the hour) avoids contention with any other process that might fire at 17:00 sharp.

The form validates the format client-side — `17:01` is accepted, `7:1` is rejected, `25:00` is rejected.

When `daily_enabled` is off, this field is disabled.

### Retention

How many bars the service holds in memory per symbol. Relevant for features that analyse recent price history without re-fetching.

#### `daily_bars`

Number of historical daily bars retained per symbol, in memory. Example: `100` (roughly 4 months of daily data, excluding weekends).

Higher numbers consume more memory but enable longer historical windows for analytics.

#### `intraday_bars`

Number of recent intraday bars retained per symbol, in memory. Example: `12` (12 intervals of whatever `intraday_interval_minutes` is set to — so at 15-minute intervals, that's 3 hours of recent intraday data).

### Hedging

The hedging-suggestion engine surfaces candidate hedges based on NexDay's signals. Suggestions appear in the Hedging strategies page for operators to review and act on.

#### `auto_suggest` (toggle)

Master switch for suggestion generation. When off, no suggestions are produced regardless of the remaining fields below.

Critically: this does **not** cause automatic execution. Suggestions are surfaced; humans decide.

#### `min_position_volume`

Minimum position size (in lots) that can trigger a hedging suggestion. Example: `0.01` means "positions smaller than 0.01 lots won't trigger suggestions."

Decimals are allowed. Set higher to suppress noise from very small positions.

When `auto_suggest` is off, this field is disabled.

#### `suggestion_expiry_minutes`

How long a suggestion stays actionable before it is auto-dismissed, in **minutes**. Example: `60` means "a suggestion remains on the Hedging page for an hour, then disappears if no one acts on it."

Shorter expiry produces a more "live" list but suggestions may vanish before an operator sees them. Longer expiry risks stale suggestions being acted on after market conditions have moved.

When `auto_suggest` is off, this field is disabled.

## Common tasks

### Rotate the NexDay license ID

1. Obtain the new license from your NexDay account.
2. Clear the `license_id` field (starts empty anyway).
3. Paste the new license.
4. Save and restart `nexrisk_service`.
5. Watch logs for authentication success.

### Pause the integration overnight to save API calls

1. Turn off the main `enabled` toggle.
2. Save and restart.
3. In the morning, turn it back on, save, and restart.

If you want a scheduled pause (rather than manual), that's not supported on this page — you'd need to script it externally.

### Only pull daily bars, skip intraday

1. Turn off the `intraday_enabled` toggle under Polling.
2. Leave `daily_enabled` on.
3. Save and restart.

The service still runs, still authenticates, still pulls daily bars once per day — it just stops polling intraday between daily runs.

### Disable hedging suggestions without disabling the feed entirely

1. Turn off `auto_suggest` under Hedging.
2. Save and restart.

Polling continues. Bars continue to be retained. Only the suggestion-generation engine stops.

### Shorten the daily poll window

If you want daily bars pulled earlier than 17:01 ET (e.g. for a market that closes before US cash):

1. Update `daily_time_et` to the desired `HH:MM`.
2. Save and restart.

Be aware that pulling before NexDay has published the day's closing bars will return stale data.

## What's not implemented yet

### Integration summary panel

The right-hand **Integration summary** panel is live — it updates as you edit and summarises your current draft (*"every 15 min"*, *"at 17:01 ET"*, retention counts, hedging thresholds). This is the sanity-check panel.

### Live status / health

No runtime probe for NexDay yet. The page doesn't show "currently polling" or "last bar received at…". That's on the backend roadmap.

### Recent changes

Placeholder, awaiting audit-log integration.

### Service status

Process / Status / Uptime / Last start panel shows `—` with "awaiting backend" notes. Same as every other sub-page.

## After you save

- Yellow **restart banner** appears site-wide. Cleared after the next 30-second hub refresh once the service is restarted.
- Confirmation message below the form: either `Saved.` (for mixed-tag fields that apply live) or `Saved. Restart nexrisk_service to apply.` (if any restart-tagged field was touched). Treat restart as the norm.
- The service continues with *old* settings until restart. On restart, new settings take effect.

## Troubleshooting

### "NexDay isn't returning bars after restart"

1. Check logs — look for authentication failures.
2. Verify `api_server` is reachable from the host (simple TCP test to the host:port).
3. Confirm `license_id` is correct. If you saved `"***"` by mistake, you saved three asterisks as your license; save the real one.

### "I see NexDay authenticating but no intraday bars"

Check `intraday_enabled`. If it's off, daily bars still come in but no intraday polling occurs.

### "Daily bars are showing up but look old"

`daily_time_et` might be firing before NexDay publishes the day's close. Try `17:01` or later.

### "Hedging suggestions never appear"

Work through the chain:

1. Is the main `enabled` toggle on?
2. Is `auto_suggest` on?
3. Are your positions all smaller than `min_position_volume`? If so, nothing triggers.
4. Have recent suggestions expired? `suggestion_expiry_minutes` controls the dismissal window.
5. Check the logs for signal-generation errors.

### "The form won't let me save"

Look for a red error message above the save buttons. Common issues:

- `daily_time_et` not in `HH:MM` format.
- `api_server` missing `http://` or `https://` prefix.
- A numeric field left blank or set to zero when the field requires a positive integer.

Fix the highlighted problem and try again.
