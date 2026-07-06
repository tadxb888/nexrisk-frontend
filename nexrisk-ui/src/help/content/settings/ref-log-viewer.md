---
id: ref-log-viewer
title: "Log viewer"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/logs
source:
  - "nexrisk-ui/src/pages/settings/help/06-log-viewer.md (dev-authored operator manual)"
related: [ref-system-settings, ref-users]
tags: [settings, log-viewer, operator-manual]
status: reviewed
version: settings-v2
---


## At a glance

The Log viewer is a read-only window onto Taiga's service logs, with the ability to tail the newest file, search within a specific file, and download full files for offline analysis. It also has a privileged "set log level" action for operators who need to temporarily increase verbosity for debugging. Four services are indexed: `nexrisk_service`, `nexrisk_gateway`, `fixbridge_service`, and a separate `fix_messages` log stream.

Settings page path: **Settings → Log viewer**
Route: `/settings/logs`

## What this page controls

Unlike the other Settings sub-pages, this one is not a form-and-save — it's a viewer. It reads log files from disk and lets you interact with them. The one write action it supports is changing a service's runtime log level, which requires elevated permissions.

This page doesn't write any config files. Log content is read directly from each service's log directory.

## Who can access it

The page itself is visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

The **Set log level** action inside the page requires additional permission: `settings >= EDIT`. Users without that permission can view and search logs but cannot change levels.

Additionally, the `fix_messages` stream is marked `level_configurable: false` by the backend — its level can't be changed from the UI regardless of your permissions.

## Before you change anything

- **Tail auto-refresh polls every 3 seconds.** File I/O on a busy server adds up. The 3-second cadence is deliberately not faster. If the tail seems to lag behind real time, that's usually a matter of server-side buffering, not UI lag.
- **Search is whole-file, substring-only.** It's plain substring matching (not regex), scanning the file you select. Large files take longer to search.
- **Downloads stream directly from disk.** Clicking "download" on a file triggers a browser download of the raw log content. Large files download as large files — there's no pre-processing or filtering on the way out.
- **Changing log level affects the *running* service.** This is a live configuration change on the running process, not a config-file edit. The service needs to support dynamic log-level changes (all four services do). On restart, the service re-reads its config file, which may revert the level — if you want the change to persist across restarts, update the relevant settings page too (e.g. FIX bridge's Log level field).

## Page layout

The page doesn't use the 40/60 split that form pages do. Instead:

- **Top:** service tabs for the four services.
- **Controls row:** mode toggle (Tail / Search) plus mode-specific inputs, and a "Set log level" button at the right (admin-only, for level-configurable services).
- **Main area:** a split between the log viewer (~70%, left) and the file list sidebar (~30%, right).
- **Viewer footer:** indicates which file is being shown, line count, and a "truncated" indicator if output was capped.

## Modes

### Tail mode (default)

Shows the most recent lines of the newest file for the selected service, auto-refreshing. Controls:

- **Lines** dropdown — how many trailing lines to fetch. Choices: 50, 100, 250, 500, 1000.
- **Auto-refresh 3s** toggle — when on, the tail re-fetches every 3 seconds. When off, you see a static snapshot.

Auto-scroll behaviour: if you're near the bottom of the viewer when new lines arrive, the viewer scrolls to show them. If you've scrolled up to read older lines, your position is preserved — new lines stream in above the viewport, but the viewer won't yank you away from what you're reading.

### Search mode

Runs a substring search within a single file. Controls:

- **File** dropdown — picks which file to search. Populated from the file list; defaults to the newest.
- **Substring to find** input — whatever you're looking for. Enter key submits.
- **Limit** dropdown — max matches to return. Choices: 50, 100, 250, 500.
- **Search** button — fires the request.

The viewer shows matched lines in order they appear in the file. A `"truncated"` badge appears if the file had more matches than your limit.

### File list sidebar

Regardless of mode, the right sidebar shows every file in the selected service's log directory. For each file:

- Filename (monospaced)
- Size (human-readable: B, KB, MB, GB)
- Modified time (relative, e.g. "2 min ago"; hover for full ISO timestamp)
- A **download** link that streams the raw file to your browser

The sidebar footer shows the service's `log_dir` (absolute path, from the backend).

## Setting log level

For services flagged `level_configurable: true` (which is `nexrisk`, `gateway`, and `fixbridge` — not `fix_messages`), admins with `settings >= EDIT` can click **Set log level ▾** at the right of the controls row. This opens a dropdown with the five levels:

- `trace`, `debug`, `info`, `warn`, `error`

Clicking a level shows a confirmation row at the bottom of the dropdown ("Set to `debug`? Cancel / Confirm"). Clicking **Confirm** fires the request.

On success:

- A green banner appears below the controls: `Log level set to debug. Restart nexrisk_service to apply.`
- The banner's wording depends on whether the change requires restart. In practice, log level changes apply to the running service *and* require a restart to persist across process restarts. Don't be surprised if the message says "restart" — the actual level change often happens instantly anyway.

On failure, a red banner shows the error.

## Common tasks

### Watch a service's log live

1. Click the service tab at the top (`NexRisk`, `Price feed gateway`, `FIX bridge`, `FIX messages`).
2. Leave mode on **Tail**.
3. Leave auto-refresh on. Watch lines stream in.

### Find a specific error in an old file

1. Click the service tab.
2. Switch to **Search** mode.
3. Pick the file from the **File** dropdown (sidebar shows modification times so you can identify when something happened).
4. Type the error substring into the input.
5. Press Enter or click **Search**.

### Download a file for offline analysis

1. Click the service tab.
2. In the sidebar, click the **download** link next to the file you want.
3. The browser prompts to save. The file is streamed raw — no compression, no filtering.

### Turn on debug logging for the FIX bridge temporarily

1. Tab to **FIX bridge**.
2. Click **Set log level ▾** at top-right.
3. Click **debug**, then **Confirm**.
4. Reproduce your issue. Watch the tail or search for relevant lines.
5. When done, set level back to **info** using the same flow.

Remember: the level change may or may not persist depending on the service implementation. To make it persistent across restarts, also change the `log_level` field on the FIX bridge settings page (or equivalent for other services).

### Diagnose "why is this service slow?" using logs

1. Tab to the suspect service.
2. Switch to **Search** mode.
3. Search for `warn`, `error`, or specific error substrings.
4. Cross-reference timestamps with when the slowness occurred.
5. Download the file if you need to grep for multiple patterns offline.

## What's not implemented yet

The page is feature-complete for v1. A few things worth noting:

- **Search is substring only, not regex.** Regex support is not currently on the roadmap.
- **No multi-service search.** Each search targets one file in one service. To search across services, search each in turn.
- **No line-range deep-linking.** You can't link someone to "line 12345 of yesterday's log" — download the file instead.
- **No "load more" pagination in tail mode.** If you want more lines, change the **Lines** dropdown and the tail re-fetches with the new count. The `truncated: true` flag from the backend means "there was more than you asked for" — the UI's hint to use the Lines dropdown.

## After you interact

Nothing is "saved" in the traditional sense — log viewing is a read operation. The only persistent action is setting a log level, which either updates the running service immediately, or requires a restart to take effect, depending on the service. The banner beneath the controls row tells you which, per operation.

## Troubleshooting

### "The tail stopped updating"

Check the **auto-refresh** toggle — it might have been clicked off accidentally. If it's on and the tail still isn't moving, the service may genuinely not be logging anything (it's idle), or the log file might have rotated. Switch to Search mode, look at the file list, and pick a newer file if one appeared.

### "I can't download a file"

The download link is a direct `<a href>` — it streams the file via the BFF. Common failures:

- Your session has expired. Log back in and try again.
- The file has been rotated away between when you loaded the list and when you clicked. Refresh the page (switch service tabs and back) to re-fetch the list.

### "My search returns nothing"

- Check spelling and case. Search is case-sensitive.
- Check the file: the default is the newest file; your target might be in an older one.
- Check the limit: if set to 50 and the match is further into the file than 50 other matches, the `truncated` flag will show but your target may not appear. Raise the limit.

### "Set log level button is missing"

Either you don't have `settings >= EDIT` permission, or the current service doesn't support dynamic level changes (that's `fix_messages` — its log level is not configurable from the UI). Try a different tab.

### "Set log level succeeded but verbosity didn't change"

Most likely the service processes log level at startup from its config file, and the dynamic change applied only momentarily. Check the service's settings sub-page and change the `log_level` field there (for FIX bridge, or the equivalent for other services), save, and restart the service.
