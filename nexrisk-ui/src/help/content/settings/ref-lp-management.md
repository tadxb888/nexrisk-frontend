---
id: ref-lp-management
title: "LP management"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/lp
source:
  - "nexrisk-ui/src/pages/settings/help/08-lp-management.md (dev-authored operator manual)"
related: [ref-system-settings, ref-users]
tags: [settings, lp-management, operator-manual]
status: reviewed
version: settings-v2
---


## At a glance

LP management is where you control which liquidity providers (LPs) the FIX bridge connects to, and what the configuration of each LP's connection looks like. An "LP" in Taiga is a counterparty Taiga talks to using the FIX protocol — typically a liquidity venue, another broker, or an aggregator.

This page has **two distinct views**:

1. **List view** (`/settings/lp`) — which LPs exist, which are enabled, and a link to each one's profile editor.
2. **Profile editor** (`/settings/lp/<lp_id>`) — the full capability JSON for one LP, split into read-only and editable sections.

Settings page path: **Settings → LP management**

## What this page controls

Two files, split across the two views:

- **List view** writes the top-level `enabled_lps` array inside `config/fixbridge/fixbridge_config.json`. This array is the authoritative list of LPs the FIX bridge will try to connect to on startup.
- **Profile editor** writes a single LP's capability JSON at `config/fixbridge/lp/<lp_id>.json`. These per-LP files describe how the bridge talks to that counterparty.

All changes on both views require a restart of the **`fixbridge_service`** to take effect.

**Important:** this page is **not** the operational LP page. For start / stop / reload / test operations on a live FIX session, use the separate **Liquidity Providers** page, which talks to `/fix/admin/lp/*` endpoints and controls the live session manager. This page is about static configuration; that page is about runtime control.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## List view

### What you see

A single list showing every LP whose capability file exists under `config/fixbridge/lp/`. Each row has:

- **A checkbox** — whether this LP is in `enabled_lps` (either in the saved file, or in your pending draft).
- **LP name** — human-readable name from the capability file.
- **LP id** — technical identifier, used in file paths and logs.
- **Version** — version string from the capability file (if present).
- **Edit profile** button — navigates to the profile editor for this LP.

Rows where the draft differs from the saved file show a **pending** badge and are highlighted in a subtle dark-teal tint. The page header shows a count — *"3 profiles configured · 2 enabled in draft"*.

### Before you change enablement

- **Disabling an LP does not delete its profile.** The capability file stays under `config/fixbridge/lp/`; the LP is simply not started by the bridge. You can re-enable any time.
- **Enabling an LP does not create a profile.** The capability file must already exist on disk (created out-of-band by LP engineering, or copied from a template).
- **Live sessions are severed by disabling.** If you disable an LP that is currently connected, the restart will drop its FIX session — deliberately.

### Common tasks

#### Turn an LP off

1. Uncheck the checkbox for that LP.
2. Click **Save enablement**.
3. Restart `fixbridge_service`.

#### Turn a new LP on

1. Verify the capability file exists at `config/fixbridge/lp/<new_lp_id>.json` — if not, coordinate with LP engineering to create it.
2. Refresh the page. The new LP should appear in the list.
3. Check the checkbox.
4. Save and restart.

#### Review pending changes before committing

The header count updates live (*"2 enabled in draft"*) and rows that changed show a **pending** badge. The draft is held in-memory only — closing the page without saving discards it. Click **Revert** to reset the draft to the saved state.

### Right-hand panel content

Two panels on the right side of the list view:

- **About LP profiles** — a short explanation of what a profile is and how the enabled/disabled distinction works. Read once, ignore thereafter.
- **Service** — standard service metadata panel. Process name, config file path, profile directory, log directory. Status / Uptime / Last start show `—` pending backend support.

## Profile editor

Clicking **Edit profile** on any row in the list view navigates you to `/settings/lp/<lp_id>`, showing the full capability JSON for that LP as a structured editor.

### What a profile is

A profile is a JSON file that describes everything the FIX bridge needs to know to talk to one specific LP. The file has eight top-level sections (plus identifiers like `lp_id`, `lp_name`, `version`).

The eight sections split into two groups:

- **Read-only (3 sections):** `connection`, `custom_fields`, `instruments`. The backend **silently preserves** these on save — anything the UI sends for them is ignored. They are set at onboarding and shouldn't drift without a deliberate LP-engineering change.
- **Editable (5 sections):** `trading`, `market_data`, `routes`, `limits`, `features`. These are what admins change day-to-day. Each replaces its section in the file wholesale on save.

### Why raw JSON?

Every section is an opaque JSON object edited in a textarea, not a structured form. This is deliberate:

- The inner schemas vary per LP type (a CMC LP and a PrimeXM LP have quite different `trading` objects).
- The schemas aren't fully documented — forcing a structured form would mean inventing field meanings for every LP permutation, which risks being wrong in subtle ways.
- Admins editing capability profiles are a small, technical audience who already know the shape of these objects.

Brief §4 of the implementation brief explicitly permits raw JSON for v1.

### Page layout

- **Breadcrumb:** Settings → LP management → `<lp_id>` (clickable).
- **Header:** LP name and version, with a pill showing `restart: fixbridge_service`.
- **Top save bar:** shows which sections are pending changes, plus Revert all and Save profile buttons.
- **Read-only group (3 sections):** each section as a collapsible card with a `read-only` badge. Collapsed by default. Expand to see the JSON as pretty-printed, selectable, but not editable.
- **Editable group (5 sections):** each section as a collapsible card. Open by default. Contains a textarea, a format/revert button pair, and a parse-error banner if the JSON is invalid.
- **Bottom save bar:** same buttons as the top, for long-scroll convenience.

### Section semantics

The form shows one-line help text for each section as you expand them. Summarised:

- **`connection`** (read-only) — FIX endpoints, sender/target comp IDs, session parameters.
- **`custom_fields`** (read-only) — LP-specific FIX tags (e.g. account fields, broker codes).
- **`instruments`** (read-only) — Instrument metadata and symbol mappings. Managed through the Symbol mapping page, not here.
- **`trading`** (editable) — trading session behaviour, order types accepted, time-in-force whitelist, execution policy.
- **`market_data`** (editable) — depth of book, subscription style, update frequency, snapshot cadence.
- **`routes`** (editable) — per-symbol or per-client routing rules.
- **`limits`** (editable) — per-instrument and per-session caps on size, rate, exposure.
- **`features`** (editable) — feature flags for optional FIX workflows (cross trades, mass cancel, quote cancel replace).

### Editing a section

1. Expand the section by clicking the header row.
2. Edit the JSON in the textarea. Changes are checked for parse validity on every keystroke.
3. Parse errors show a red banner below the textarea and an `invalid` badge on the section header.
4. Click **Format** to re-indent the JSON (disabled if the JSON is currently invalid).
5. Click **Revert this section** to discard changes to just that section.

The section header shows a **modified** badge when the current textarea content differs from what's on disk.

### Saving

- The **Save profile** button at the top or bottom is enabled only when (a) at least one editable section is modified, and (b) every section parses as valid JSON.
- Save sends the **full profile object** — starting from the currently-loaded initial, with the five editable sections overlaid from your drafts. This includes the read-only sections as they were fetched (the backend ignores client values there, but sending them is safe and explicit).
- On success, the editor re-fetches to capture any server-side normalisation, and the pending-changes list empties.
- Restart banner appears site-wide.

## What's not implemented yet

### Live session state in the list

The list view shows which LPs are *configured to be enabled*, not which are *currently connected*. For runtime state (connected, disconnected, latency, etc.) use the Liquidity Providers page — that one is backed by live FIX session metrics.

### Audit log integration

Recent changes panel is not surfaced on these two pages in v1. Will land as a separate ticket.

### Service status

Same pattern as every other sub-page — Process / Status / Uptime / Last start shows `—` with "awaiting backend" pending a health endpoint.

## Common tasks

### Enable a new LP end-to-end

1. Coordinate with LP engineering to produce the capability file at `config/fixbridge/lp/<lp_id>.json`.
2. Refresh the LP management list.
3. (Optional) Click **Edit profile** to review what LP engineering delivered — particularly the `trading`, `market_data`, and `limits` sections.
4. Back on the list, check the LP's checkbox.
5. Save enablement, restart `fixbridge_service`.
6. Monitor the FIX bridge logs — you should see a session attempting to connect.
7. Monitor the Liquidity Providers page for connection status.

### Tighten a limit across one LP

1. Navigate to Settings → LP management.
2. Click **Edit profile** on the target LP.
3. Expand the `limits` section.
4. Edit the JSON. Click Format to re-indent.
5. Save profile.
6. Restart `fixbridge_service`.

### Review what's silently preserved when you save

Expand the three read-only sections (`connection`, `custom_fields`, `instruments`). The content shown is what the backend has on disk and what it will keep no matter what the UI sends. Useful for verifying that, say, a FIX endpoint or a sender-comp-id hasn't drifted from what you expect.

### Temporarily block an LP without deleting its config

Easiest: uncheck the LP in the list view, save, restart. To re-enable, check it again, save, restart. The profile file is untouched.

## Troubleshooting

### "I enabled an LP but it's not connecting"

1. Confirm the `fixbridge_service` was restarted after you saved.
2. Check the FIX bridge logs (via the Log viewer page) — look for errors mentioning the LP id.
3. Open the profile editor. Expand `connection`. Verify the host, port, and comp IDs look right.
4. Verify credentials exist — credentials are stored separately (not in the capability file). If the LP has never had credentials set, the session will fail at logon.

### "The profile editor shows an empty read-only section"

That section is genuinely empty in the file. Some LPs don't use all three read-only sections — e.g. not every LP has `custom_fields`. The editor surfaces this honestly: *"This section is empty in the profile file."*

### "My JSON won't save"

Check the pending-changes strip at the top of the page. Any section showing `invalid` means that section's textarea contains unparseable JSON. Fix the syntax (usually a missing comma or unmatched bracket) and the invalid badge clears. The save button stays disabled until all sections parse.

### "I saved and the LP behaviour didn't change"

Standard pattern — the file is updated but the bridge hasn't restarted. Restart `fixbridge_service`.

### "I accidentally saved bad values"

Revert by editing the JSON back to sensible values and saving again. There is no undo history on this page — if you don't know what the previous values were, ask LP engineering, check git history of the capability file, or restore from backup.

### "The read-only sections should not be read-only"

They should. That's a design decision codified in the backend — the UI can't bypass it. If you genuinely need to change `connection` or `custom_fields`, that's an LP-engineering task involving direct file editing and coordination with the LP.
