# Alerting

## At a glance

The Alerting page controls how Taiga surfaces important events to humans — which severity level counts as notable, how frequently per trader, and through which delivery channels. Two delivery channels are supported: **Telegram** and **HTTP webhooks**. Both have independent on/off switches and full CRUD for their respective destinations.

The page is organised into three stacked cards on a single scrolling page:

1. **Alerts — core policy** — global switches and rate caps.
2. **Telegram** — bot token, chat list, live probes.
3. **Webhooks** — per-channel switch and endpoint list with test probe.

Settings page path: **Settings → Alerting**
Route: `/settings/alerts`

## What this page controls

This page reads and writes three subsections of `config/nexrisk_config.json`: `alerts`, `telegram`, `webhooks`. All three live in the same file, but the three cards save independently — each with its own save/revert.

All changes on this page require a restart of the **`nexrisk_service`** to take effect.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## Before you change anything

- **The master switch and channel switches are layered.** If the master `alerts.enabled` is off, no alerts go out through any channel, regardless of per-channel switches. If `telegram.enabled` is off, no alerts reach Telegram chats regardless of their individual configuration.
- **Test probes actually run.** Clicking **Test** on a Telegram chat posts a real message to that chat. Clicking **Test** on a webhook endpoint fires a real HTTP request. Don't test against production chats or endpoints you don't want to disturb.
- **CRUD actions fire immediately.** Adding, editing, or deleting a chat or webhook endpoint sends its request on button click — not on a batched save. This means the server state can change one action at a time, which simplifies reasoning ("what did I change?") but means you can't draft five additions and save them atomically.
- **The bot token is a secret.** Same write-preserve pattern as every other secret on the Settings surface.

## Card 1: Alerts — core policy

Four settings. No secrets.

### `enabled` (toggle)

Master switch. When off, **no** alerts leave Taiga through any channel. All other settings are preserved.

### `min_severity`

Dropdown with four levels: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Alerts below this threshold are dropped inside `nexrisk_service` — they never reach a delivery channel.

Typical value: `HIGH` for production (reduces noise). `LOW` during testing or early deployment (see everything).

### `cooldown_seconds`

Minimum number of seconds between two alerts of the same kind for the same trader. Prevents a single event from generating a blast of duplicate notifications.

Typical value: `300` (5 minutes).

### `max_per_trader_per_hour`

Hard cap on alerts per trader per hour. Anything beyond this is dropped on the floor (not delayed, not queued — **dropped**).

Typical value: `12` (roughly one every 5 minutes on average, with some bursting allowed).

### Save behaviour

Each card has its own Save / Revert. Click **Save changes** on this card to commit just the Alerts core fields. Restart banner appears; restart `nexrisk_service` to activate.

## Card 2: Telegram

Three sub-blocks: core config, chat list, and per-chat probes.

### Core config

#### `enabled` (toggle)

Per-channel switch for Telegram delivery. Alerts still need the master `alerts.enabled` switch to be on as well.

#### `bot_token` (secret field)

Telegram bot API token. Obtained from [@BotFather](https://t.me/BotFather) on Telegram when you create the bot.

Same write-preserve pattern as every other secret: input always starts empty with placeholder *"Leave blank to keep current value"*. Stored encrypted. Blank-on-save leaves the existing value unchanged.

Next to the input is a **Validate** button that calls the live probe endpoint. When the endpoint lands, Validate asks Telegram "is this token valid?" and shows the bot's username and numeric id on success. Today the endpoint is 501; Validate shows a blue "not implemented yet" banner.

After editing core fields, click **Save core** to commit. Restart `nexrisk_service` to activate.

### Chat list

A list of Telegram chats that receive alerts. For each chat:

- **Label** — human-readable name, e.g. *"Ops Room"*.
- **Telegram chat ID** — the numeric id Telegram assigns to the chat (e.g. `-1001234567890` for a supergroup). Can be negative.
- **Alert levels** — which severities this chat receives. Any subset of LOW / MEDIUM / HIGH / CRITICAL.
- **Internal id** — `chat_<12hex>`, shown in small grey text. Used for CRUD operations; not a Telegram-side concept.

Click **+ Add chat** to open the add form inline. Edit / Delete / Test buttons appear on each row.

#### Add chat form

Three main fields: Label, Chat ID, Alert levels.

Plus an optional **handle resolver** — if you don't know the numeric chat id, paste a handle or link (e.g. `@myroom`, `https://t.me/myroom`) and click **Resolve**. The live probe converts the handle to a numeric id and auto-fills the Chat ID (and Label, if empty). Today the endpoint is 501; Resolve shows a blue "not implemented yet" banner.

The form validates:

- Label non-empty
- Chat ID non-empty
- At least one alert level selected

Click **Add chat** to commit. The CRUD fires immediately — there's no draft state.

#### Edit chat

Click **Edit** on a row. Same form as Add, pre-populated with the current values. Changes fire on **Save chat**.

#### Delete chat

Click **Delete**. Shows *"Confirm? No / Yes, delete"* in place. Yes fires the delete; No cancels. Delete fires immediately.

#### Test chat

Click **Test**. This calls the live probe to send an actual message to the chat — something like *"NexRisk test message — 2026-04-23T06:15:32Z"*. Recipients see it as a normal bot message.

Today the endpoint is 501; Test shows the blue stub banner. Once implemented, success shows *"Message sent · id 12345"* in green.

## Card 3: Webhooks

Two sub-blocks: core config, endpoint list with test probes.

### Core config

Only one field today:

#### `enabled` (toggle)

Per-channel switch for webhook delivery. Alerts still need `alerts.enabled` to be on as well.

Click **Save core** to commit. Restart `nexrisk_service` to activate.

### Endpoint list

A list of HTTP endpoints that receive alert POSTs. For each endpoint:

- **URL** — the full `https://` (or `http://`) URL the alert is POSTed to.
- **Alert levels** — which severities this endpoint receives. Any subset.
- **Enabled / disabled** — per-endpoint switch. Disabled endpoints are skipped on dispatch.
- **Auth header presence** — indicated in small grey text if an `Authorization` header is configured.
- **Internal id** — `wh_<12hex>`. Used for CRUD.

Click **+ Add endpoint** to open the add form inline.

#### Add endpoint form

Four fields:

- **URL** — must start with `http://` or `https://`. Form validates the prefix client-side.
- **Authorization header (optional)** — sent as the literal HTTP `Authorization` header value on each alert POST. Examples: `Bearer abc123`, `Basic dXNlcjpwYXNz`.
- **Enabled** — toggle. When off on save, endpoint exists but is skipped on dispatch.
- **Alert levels** — at least one required.

Click **Add endpoint**. CRUD fires immediately.

#### Edit / Delete endpoint

Same patterns as Telegram chats. Edit opens an inline form; Delete shows a confirm step.

#### Test endpoint

Click **Test**. This fires a real HTTP request to the endpoint's URL (with the configured Authorization header if present), carrying a test payload. The probe shows:

- **OK / Failed** — whether the HTTP request completed.
- **HTTP status code** — e.g. `200`, `404`, `500`.
- **Duration ms** — how long the request took.
- **Message** — any text the endpoint returned (trimmed).

Today the endpoint is 501; Test shows the blue stub banner. Once implemented, the test fires live and reports back.

## Alert levels — severity palette

Used throughout this page (in dropdowns, multi-select pickers, row badges):

- `LOW` — green badge. Informational.
- `MEDIUM` — neutral grey badge. Worth noting but not urgent.
- `HIGH` — amber badge. Needs attention.
- `CRITICAL` — red badge. Immediate action required.

A multi-select picker shows all four as toggle pills. Click each to toggle. Selected pills are filled teal with dark text; unselected are transparent with white text.

## Common tasks

### Set up a brand-new Telegram integration

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram. Save the token.
2. Add the bot to the chat(s) you want alerts to go to. In supergroups, the bot must be an admin or the chat must have its privacy mode settings configured correctly.
3. On this page, scroll to Telegram.
4. Turn on the Telegram **enabled** toggle.
5. Paste the token into **Bot token**.
6. Click **Validate** (when wired). Confirm the bot username matches what you expect.
7. Click **Save core**. Restart `nexrisk_service`.
8. Back on this page, click **+ Add chat**.
9. Either paste the numeric chat ID, or use the **Resolve** helper with the chat's @handle.
10. Pick which alert levels route here.
11. Click **Add chat**.
12. Click **Test** on the new row to confirm a test message arrives in the chat.

### Add a second Telegram chat for lower-severity alerts

1. Ensure Telegram is already enabled and bot token is configured.
2. Click **+ Add chat**.
3. Fill in a label like *"Dev Room"*.
4. Enter or resolve the chat ID.
5. Select only `LOW` and `MEDIUM` (leaving `HIGH` and `CRITICAL` for the main Ops Room).
6. Click **Add chat**, then **Test**.

### Rotate the Telegram bot token

1. Create a new bot (or revoke the current token via @BotFather and request a new one).
2. Paste the new token into **Bot token**.
3. Click **Save core**. Restart `nexrisk_service`.

No need to re-configure chats — they are keyed by chat_id, which doesn't change when you change the bot.

### Set up a webhook to your on-call system

1. In your on-call system (PagerDuty, OpsGenie, your own Slack app, etc.), create an incoming webhook URL.
2. Note any required `Authorization` header format.
3. On this page, scroll to Webhooks.
4. Turn on the Webhooks **enabled** toggle if it isn't already. Save core, restart.
5. Click **+ Add endpoint**.
6. Paste the URL. Add the `Authorization` header value if needed.
7. Select alert levels — typically just `HIGH` and `CRITICAL` for on-call.
8. Leave **Enabled** on.
9. Click **Add endpoint**.
10. Click **Test** on the row to fire a real test request. Check your on-call system received it.

### Disable a chat without deleting it

Click **Edit**, uncheck all alert levels, save. The chat record persists but receives nothing. Or, to restore it later, re-tick the levels.

There is no per-chat enabled toggle on the Telegram side — the alert-levels multi-select is the effective enabler. Webhooks *do* have a dedicated per-endpoint enabled toggle.

### Pause alerting temporarily

Easiest: turn off `alerts.enabled` on the core policy card, save, restart. This halts all alerts regardless of channel config. Flip back on when ready.

## What's not implemented yet

### All four live probes return 501

- `telegram.validate` — verifies a bot token
- `telegram.resolve-chat` — resolves @handle to numeric chat id
- `telegram.test` — sends a real Telegram message
- `webhooks.test` — fires a real HTTP request to an endpoint

Each one shows a blue "not implemented yet" banner when clicked. The rest of the CRUD (add / edit / delete chats and endpoints, core config saves) is fully live.

When the backend wires these endpoints, no UI change is needed — the banners will automatically switch to success/failure presentation.

### Recent changes

Placeholder, awaiting audit-log integration.

### Service status

Standard pattern — Process / Status / Uptime / Last start shows `—` with "awaiting backend" pending a health endpoint.

### Inferred bulk-PUT schemas

The bulk-PUT body shapes for `/nexrisk/telegram` and `/nexrisk/webhooks` are not fully documented in the backend spec. The TypeScript types here cover the documented fields (enabled, bot_token, chats; enabled, endpoints) but fall through to `[key: string]: unknown` for anything else. Should the backend add fields to these subsections, they will round-trip safely but won't appear in the UI until the types and form are extended.

## After you save

Each card has its own save flow:

- **Alerts core saved:** banner appears site-wide. Confirmation line below the card. Restart `nexrisk_service`.
- **Telegram core saved:** same pattern. Chat CRUD does not need the core saved first — they're independent.
- **Webhooks core saved:** same pattern. Endpoint CRUD does not need the core saved first.
- **Chat CRUD succeeded:** no restart banner needed for individual chat adds/edits/deletes specifically — but in practice any change to `nexrisk_config.json` is a `restart:nexrisk` operation. The page doesn't distinguish; treat all saves as requiring a restart.

## Troubleshooting

### "I configured everything but nothing's arriving in Telegram"

Work through the chain top to bottom:

1. Is `alerts.enabled` (master switch) on?
2. Is `telegram.enabled` (channel switch) on?
3. Is the bot token valid? Click **Validate** when implemented, or rotate to a known-good token.
4. Does the target chat have an entry on this page with at least one alert level selected?
5. Has `nexrisk_service` been restarted since you last changed core config?
6. Have you actually generated an alert that meets `min_severity` and isn't being suppressed by `cooldown_seconds` or `max_per_trader_per_hour`?

If all six check out, look at `nexrisk_service` logs via the Log viewer page. Delivery failures (bot token wrong, bot not in chat, etc.) log on the server side.

### "Test button is giving me a blue 'not implemented' banner"

The live probe endpoint isn't wired yet. There's no way to test from the UI until the backend implements it. Until then, generate a real alert (low severity, cheap to trigger) and watch whether it arrives.

### "I saved a new bot token and now nothing works"

Either the token is wrong (typo on paste, whitespace, etc.) or you saved `"***"` by mistake. The masked placeholder is just display — if you typed `***` into the field and saved, you literally stored three asterisks. Re-paste the correct token and save again. Restart `nexrisk_service`.

### "Chat ID isn't right"

Telegram chat IDs for private chats are positive numbers. For groups, they are negative. For supergroups and channels, they start with `-100` followed by digits. Getting the sign wrong is the most common mistake. The **Resolve** helper (when live) takes a handle and does this correctly.

### "Webhook is hitting but my system isn't triggering"

Check the response in the Test output once live. HTTP status 200 means the endpoint accepted the request; anything else means your system rejected it. Check the Authorization header is what your system expects. Check the payload format matches what your system parses — the format is whatever `nexrisk_service` sends, which is documented elsewhere (outside this page).

### "I added 5 chats but only 4 appear"

Each add is independent and can fail independently. If one failed, look for a red error banner on that row during the add. Refresh the page to re-fetch the list from the backend — the list you see is whatever the backend currently has.