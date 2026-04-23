# Taiga System Administration — Operator Manual

This folder contains the operator manual for the System Administration section of Taiga. Each sub-page of the Settings area has its own dedicated file, intended to be read standalone.

## Intended audience

A new system administrator. Each file is self-contained — no cross-file dependencies, no "see previous section" references. A reader who has never operated Taiga before should be able to read any one file and be confident operating that sub-page.

## How this manual is used

Two modes:

1. **In-app** — each file renders inside its corresponding Settings sub-page, behind a help icon. Content is read-only; interactive behaviour stays in the page itself.
2. **Standalone** — each file is plain markdown and can be read outside the app (in a git repository, static site, printed PDF, etc.).

## Index

| File | Sub-page | Path |
|------|----------|------|
| `01-gateway.md`           | Price feed gateway    | `/settings/gateway` |
| `02-auth-session.md`      | Auth & session        | `/settings/auth` |
| `03-trading-economics.md` | Trading Economics     | `/settings/trading-economics` |
| `04-nexday.md`            | NexDay integration    | `/settings/nexday` |
| `05-fix-bridge.md`        | FIX bridge            | `/settings/fixbridge` |
| `06-log-viewer.md`        | Log viewer            | `/settings/logs` |
| `07-secret-rotation.md`   | Secret rotation       | `/settings/rotation` |
| `08-lp-management.md`     | LP management         | `/settings/lp` and `/settings/lp/<lp_id>` |
| `09-alerting.md`          | Alerting              | `/settings/alerts` |

## Cross-cutting concepts

These concepts apply to most or all sub-pages. They're repeated briefly in each file where relevant, but understanding them once here saves re-reading.

### Role-based access

The Settings section itself is visible only to users with one of these roles:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

Users with other roles (e.g. `trader`, `analyst`) do not see a Settings entry in the navigation at all.

Two sub-pages have stricter gates on top of this:

- **Secret rotation** (`/settings/rotation`) — visible only to `root`. Other admins don't see the tile.
- **Log viewer → Set log level** — available only to users with `settings >= EDIT` permission, and only for services the backend flags as level-configurable.

### Two response envelope shapes

When you save a settings change, the backend returns one of two response shapes:

1. **Standalone file-backed** (Gateway, FIX bridge): `{ success, restart_required: [...], message }`
2. **SettingsManager** (NexDay, TE, Auth, Alerting, Secret rotation): `{ success, warnings, pending_restart, restart_notice }`

The UI handles both transparently. Both produce the same user-visible outcome: a green confirmation message and a yellow restart banner.

### The restart banner

Most changes on Settings pages don't take effect until a backend service is restarted. The Settings hub polls `GET /pending-restart` on a modest cadence (roughly every 30 seconds). When the backend reports that a saved change is awaiting restart, a yellow banner appears at the top of every Settings page.

The banner stays until either:

- The service is restarted and the next poll confirms no pending changes exist, or
- The offending field is reverted and re-saved.

### Write-preserve for secrets

Every secret field on every page follows the same rule:

- The input always starts empty on page load.
- The placeholder reads *"Leave blank to keep current value"*.
- The server returns `"***"` when asked for the current value; the form **never** sends that masked string back.
- Blank-on-save means "omit this field from the update body, keep existing". Any non-empty value means "replace".
- **Never paste `"***"` into a secret field.** Doing so saves three asterisks as the secret.

Fields that follow this pattern:

- Gateway `gateway_password`
- NexDay `license_id`
- Trading Economics `api_key`
- Telegram `bot_token`

The Secret rotation page has its own copy-once modal pattern, covered in `07-secret-rotation.md`.

### 501 stubs

Several endpoints are documented but return `501 Not Implemented` today. The UI handles this by rendering a blue badge or banner explaining the endpoint isn't wired yet. When the backend implements the endpoint, no UI change is needed — the success state just starts rendering in place of the stub.

Known 501 stubs as of this writing:

- `GET /settings/gateway/status` — Live status panel on the Gateway page.
- `GET /settings/fixbridge/status` — Live status panel on the FIX bridge page.
- `POST /settings/nexrisk/telegram/validate` — Validate button on the Alerting page.
- `POST /settings/nexrisk/telegram/resolve-chat` — Resolve helper in the Add chat form.
- `POST /settings/nexrisk/telegram/test` — Test button on each Telegram chat row.
- `POST /settings/nexrisk/webhooks/endpoints/<id>/test` — Test button on each webhook endpoint row.
- `POST /auth/rotate/encryption-key` — Destructive rotation on the Secret rotation page. (The preflight endpoint is live.)

### Pending integrations

Several features in the Settings pages are deliberately surfaced as placeholders today:

- **Audit-log integration** — every sub-page has a "Recent changes" panel that reads *"Audit log integration is scheduled for a follow-up ticket."* Will populate from the existing audit-log infrastructure once wired to the Settings-section subscription path.
- **Service health metadata** — every Service panel shows `—` for Status / Uptime / Last start with "awaiting backend" notes. Process name, config file path, and log directory are known from configuration and do render. Runtime health requires a backend endpoint per service that doesn't exist yet.

### File structure of each page

Most pages use a 40/60 split:

- **Left (40%)** — the configuration form with save/revert at the bottom.
- **Right (60%)** — supplementary panels: Live status (or a derivative), Recent changes, Service metadata.

Exceptions:

- **Log viewer** — full-width, controls on top, viewer + file sidebar below. Viewing logs wants space.
- **Secret rotation** — 60/40 inverted: three rotation cards stacked on the left, policy and service panels on the right.
- **LP management list** — 60/40: LP table on the left, help + service panel on the right.
- **LP profile editor** — single column, wide.
- **Alerting** — single column, three stacked cards.

### Restart safety

Every save prompts a restart banner. In practice:

- Services can be restarted at any time, but coordinate with the desk — a restart interrupts whatever the service is doing (user sessions for `nexrisk_service`, price delivery for `nexrisk_gateway`, FIX sessions for `fixbridge_service`).
- Saving and *not* restarting is safe. The file on disk has the new values; the running process uses the old values. Your next restart — whenever that happens — picks up the new values.
- If you save bad values and realise before restart, edit back to good values and save again. No restart = no effect.

## Colours and visual language

Across the Settings pages, colours have consistent meaning:

- **Teal `#49b3b3`** — primary accent. Active elements, save buttons, success confirmations.
- **Amber `#e09a55` / background `#2a2016`** — pending state, "needs attention", restart required.
- **Red `#ff5c5c` / background `#2c1417`** — errors, destructive actions (Delete, Rotate).
- **Green `#66e07a` / background `#162a1c`** — success, saved, validated.
- **Blue `#5b86b8` / background `#18202a`** — info, 501 stubs, "not implemented yet".
- **Muted grey `#b6babf`** — disabled, awaiting backend, read-only.

No neon, no high-saturation colours. Everything is grey-blended (roughly 10-20% grey mix) for sustained readability on a dark terminal-style UI.

## Feedback

Found a mistake in this manual? A field behaves differently than described? An edge case the manual doesn't cover? Report it via the usual Taiga feedback channel — the manual is versioned alongside the Settings UI and is updated as behaviour changes.