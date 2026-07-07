---
id: ref-log-viewer
title: "Log Viewer — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/log-viewer
order: 6
source:
  - "Settings_06_Log_Viewer.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,log-viewer,logs,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

The Log viewer is a read-only window onto Taiga’s service logs. It lets
you follow the newest log as it is written, search within a chosen file,
and download whole files for offline analysis. It also has one
privileged action — temporarily raising a service’s log detail for
debugging. Four log sources are indexed: the core service, the price
gateway, the FIX bridge, and a separate stream of FIX messages.

You reach it at **Settings › Log viewer**.

|                                                                                                                                                                                                                                                                   |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This page reads; it does not save settings.** Unlike the other Settings pages, this is a viewer, not a form. It reads log files straight from disk and does not write any configuration. Its one write action — changing a log level — is covered in Section 5. |

## 2. Layout

The page is full-width, not the usual split layout, because reading logs
wants room. From the top down: a row of tabs for the four log sources; a
controls row with a Tail / Search toggle and its inputs, plus a "Set log
level" button on the right; and the main area, split between the log
viewer on the left and a file list on the right. A footer under the
viewer notes which file is shown, its line count, and whether the output
was capped.

## 3. The Two Modes

### 3.1 Tail — follow the newest log live

Tail mode shows the most recent lines of the newest file for the
selected source and keeps them updating. You choose how many trailing
lines to fetch (50 up to 1000), and whether it auto-refreshes.

- **Auto-refresh** re-fetches every three seconds when on. The cadence
  is deliberately not faster — constant reads on a busy server add up.
  If the tail seems to lag real time, that is usually server-side
  buffering, not the page.

- **Auto-scroll behaves considerately.** If you are near the bottom when
  new lines arrive, the viewer follows them. If you have scrolled up to
  read something, your place is kept — new lines arrive above without
  yanking you away.

### 3.2 Search — find text in one file

Search mode looks for a piece of text within a single chosen file. You
pick the file (the file list shows modification times, so you can find
the one from the right period), type what to look for, set a maximum
number of matches to return (50 up to 500), and run it. Matching lines
are shown in the order they appear; a "truncated" marker appears if the
file held more matches than your limit. Two things to know:

- **Plain text, not pattern-based** — it matches the exact characters
  you type, so it is straightforward but not a regular-expression
  search.

- **case-sensitive and single-file** — spelling and capitalisation must
  match, and each search covers one file in one source; to search across
  sources, search each in turn.

### 3.3 The file list

In either mode, the right sidebar lists every file in the selected
source’s log directory, each showing its name, size, and how recently it
was modified (hover for the exact time), plus a download link that
streams the raw file to your browser — no filtering or compression on
the way out, so a large file downloads as a large file. The sidebar
footer shows the source’s log directory.

## 4. Downloading a File

Click the download link beside any file to save it locally. Downloads
stream straight from disk, unmodified, which is the right tool when you
want to search a log for several patterns at once offline, or hand it to
someone else. If a download fails, the usual causes are an expired
session (log back in) or the file having rotated away between loading
the list and clicking (switch source tabs and back to refresh the list).

## 5. Changing a Service’s Log Level

This is the page’s one write action. For the three services whose level
can be changed — the core service, the gateway, and the FIX bridge — the
"Set log level" button opens a short menu of the five levels (trace,
debug, info, warn, error). Choosing one asks you to confirm, then
applies it.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This is a live change to the running service — and it does not persist.** Raising the level takes effect immediately on the running service, without a restart. But it is not written to the service’s configuration file, so the next time that service restarts it reverts to whatever its settings page specifies. If you need the change to survive restarts, also set the log level on that service’s own settings page (for example, the FIX bridge page) and save. |

Two limits worth knowing: this action needs edit permission on Settings
(viewing and searching do not), and the separate FIX-messages stream
cannot have its level changed from here at all.

|                                                                                                                                                                                                                                                                                                 |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The confirmation wording mentions "restart".** Because a lasting change needs the settings-page edit too, the confirmation may say "restart to apply". Do not be thrown by it — the live level change itself usually takes effect instantly; the "restart" note is about making it permanent. |

## 6. Common Tasks

### 6.1 Watch a service live

Pick the source tab, leave the mode on Tail with auto-refresh on, and
watch the lines stream in.

### 6.2 Find an error in an older file

Pick the source tab, switch to Search, choose the file from the list
(using its modification time to find the right period), type the error
text, and run. Raise the match limit if a "truncated" marker suggests
your target is further in than the returned matches.

### 6.3 Turn on debug logging for a service temporarily

1.  Select the service tab, use "Set log level", choose Debug, and
    confirm.

2.  Reproduce the issue and read it in the tail or via search.

3.  Set the level back to Info the same way when done. To make a level
    change permanent, also set it on that service’s settings page and
    save (Section 5).

## 7. What the Page Deliberately Does Not Do

The viewer is complete for its purpose; a few boundaries are
intentional:

- **Plain-text search only** — no pattern (regular-expression) matching.

- **One source at a time** — no search across services in a single
  query; search each source in turn.

- **No deep links to a line** — to share an exact spot in a big log,
  download the file.

- **No "load more" in tail** — to see more lines, raise the line count
  and the tail re-fetches. A "truncated" flag simply means there was
  more than you asked for.

## 8. Troubleshooting

### 8.1 The tail stopped updating

Check the auto-refresh toggle — it may have been switched off. If it is
on and still not moving, the service may genuinely be idle (nothing to
log), or the file may have rotated; switch to Search, look at the file
list, and pick a newer file if one has appeared.

### 8.2 I cannot download a file

Usually an expired session (log back in) or the file rotating away
between loading the list and clicking (refresh the list by switching
source tabs and back).

### 8.3 My search returns nothing

Check spelling and capitalisation (the search is case-sensitive),
confirm you are searching the right file (the default is the newest —
your target may be in an older one), and raise the match limit if a
truncated result may be hiding it.

### 8.4 The "Set log level" button is missing

Either you do not have edit permission on Settings, or the selected
source does not support live level changes — the FIX-messages stream
cannot be changed from here. Try a different source tab.

### 8.5 I set the level but detail did not change (or reverted)

The live change may have applied only briefly, or the service re-read
its configuration file at a restart and reverted. To make it stick, set
the level on that service’s own settings page, save, and restart the
service (Section 5).

*End of guide — Settings › Log viewer. One of nine Settings operator
guides.*
