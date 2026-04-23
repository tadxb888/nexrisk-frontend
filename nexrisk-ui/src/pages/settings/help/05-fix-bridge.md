# FIX bridge

## At a glance

The FIX bridge is the process that connects Taiga to your liquidity providers using the FIX protocol — the industry standard for broker-to-broker and broker-to-venue connectivity. This page configures the *operational* aspects of the bridge: log verbosity, audit capture (raw FIX traffic and normalised order book snapshots), incident bundling, and backpressure queue caps. Fifteen fields across five sections, **no secrets**.

This page does **not** configure specific LP connections or credentials. That lives on the LP management page. Think of this page as the bridge's "plumbing": how much it logs, how much history it keeps, what it does when things go wrong, how much it buffers before dropping messages.

Settings page path: **Settings → FIX bridge**
Route: `/settings/fixbridge`

## What this page controls

This page reads and writes the `log_level`, `audit`, `incident`, and `backpressure` sections of `config/fixbridge/fixbridge_config.json`. Other sections of that file (enabled_lps, session config) are managed elsewhere and are **silently preserved** on save — the backend scope-limits writes from this page to the four sections above.

All changes on this page require a restart of the **`fixbridge_service`** to take effect.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## Before you change anything

- **Audit and incident storage consume disk.** If you enable audit with large retention and large segment sizes, make sure the host has enough disk. The `raw_fix` stream on a busy bridge can be tens of GB per day before compression.
- **Backpressure caps are silent drops.** When a queue hits its cap, new messages are dropped, not buffered indefinitely. Setting caps too low will lose messages under load; setting them too high will consume more memory and delay the failure signal.
- **`trace` and `debug` log levels are heavy.** Raising the log level on a production bridge generates enormous log files fast. Use only for active debugging, and drop back to `info` when done.

## Field reference

The form is grouped into five sections, each with a small uppercase divider.

### Log level

#### `log_level`

Verbosity of the FIX bridge process's main log output. Dropdown with five choices (increasing detail):

- `trace` — extremely verbose. Every internal event logged. For deep debugging only.
- `debug` — verbose. Per-session state transitions, per-message details. Heavy but tractable.
- `info` — default for production. Significant events only: session up/down, error conditions.
- `warn` — suppresses info; only reports things that might be wrong.
- `error` — suppresses warnings; only reports outright failures.

Typical production value: `info`.

### Audit · Raw FIX

"Raw FIX" means every FIX message that crosses the bridge — inbound market data, outbound order submissions, session-level heartbeats, everything — captured to disk. Useful for post-trade analysis, dispute resolution, compliance, and debugging.

#### Raw FIX capture (`audit.raw_fix.enabled`)

Toggle. When **on**, raw FIX is written to disk segmented into rotating files. When **off**, no raw FIX capture — less disk, less detail.

#### Retention hours (`audit.raw_fix.retention_hours`)

How many hours of raw FIX segments stay on disk before being pruned. Example: `6` means "keep the last 6 hours; delete older files."

Typical value: `6` to `24`. Longer retention for compliance; shorter for disk-constrained hosts.

Disabled when the toggle above is off.

#### Segment size MB (`audit.raw_fix.segment_size_mb`)

Each raw FIX capture file rotates when it reaches this size, in megabytes. Example: `50` means "start a new file every 50 MB."

Smaller segments are easier to handle (download, copy, analyse) but produce more files. Larger segments reduce file-count overhead but are harder to work with.

Typical value: `50`.

#### Compression (`audit.raw_fix.compression`)

Compression format applied to rotated segments. Dropdown:

- `none` — no compression. Fastest writes, largest disk.
- `zstd` — good ratio, low CPU. **Usually the right choice.**
- `gzip` — widely compatible, slightly worse ratio than zstd at similar CPU cost.

Typical value: `zstd`.

### Audit · Normalized DOM

"Normalized DOM" means Taiga's internal depth-of-market representation — not raw FIX, but the bridge's processed view of the book after merging sources. Periodic snapshots of this state can be invaluable when trying to reconstruct "what did the book look like at 10:42:03?".

#### Normalized DOM snapshots (`audit.normalized_dom.enabled`)

Toggle. When **on**, the service takes periodic snapshots of its internal book state and writes them to disk. When **off**, no DOM snapshots.

#### Retention hours (`audit.normalized_dom.retention_hours`)

How many hours of DOM snapshots stay on disk. Example: `48` (2 days).

#### Snapshot interval seconds (`audit.normalized_dom.snapshot_interval_sec`)

How often a snapshot is taken, in **seconds**. Example: `1` (one snapshot every second).

Lower = more detail but more disk and more CPU. Higher = less detail, cheaper.

Typical value: `1` during active sessions; `5` or more for quieter environments.

#### Segment size MB (`audit.normalized_dom.segment_size_mb`)

Same idea as raw FIX segment size. Each DOM snapshot file rotates at this size in MB. Typical value: `100`.

### Incident

When the bridge detects a significant issue (session dropped, book stale, burst of rejects), it can export an "incident bundle" — a package of the relevant raw FIX, DOM snapshots, and log slices from around the time of the event. These are the first thing you reach for when debugging a post-mortem.

#### Bundle path (`incident.bundle_path`)

Directory (relative to the service working directory, or absolute) where incident bundles are written. Example: `incidents`.

#### Max bundles (`incident.max_bundles`)

How many incident bundles to keep before pruning the oldest. Example: `100`.

#### Auto-export triggers (`incident.auto_export_on`)

Which conditions trigger automatic bundle export. Multi-select — any subset of:

- `SESSION_GAP` — a FIX session dropped or reconnected with a sequence-number gap. Usually indicates network trouble or LP-side issues.
- `BOOK_STALE_EXTENDED` — the normalised book stopped updating for longer than an internal threshold. Usually an upstream MD issue.
- `MASS_REJECT` — a burst of order rejects crossed a configured threshold. Often a compliance rule, a bad config, or an angry LP.
- `SEQ_RESET_FORCED` — a forced sequence-number reset was issued on a session. Happens during recovery from severe session state issues.

Each trigger is rendered as a checkbox row with the trigger name in monospace and a short description of what condition fires it.

Typical practice: enable all four. Incident bundles are cheap to produce and invaluable to have after the fact.

### Backpressure

Three queue caps. Each controls how many messages can be buffered in a specific internal queue before new arrivals are **dropped** (not buffered indefinitely, not blocked upstream). These exist so the bridge can protect itself from cascading failures when one downstream consumer slows down.

#### Trading outbound queue cap (`backpressure.trading_outbound_max`)

Max messages queued for outbound delivery to trading sessions. Example: `10000`.

#### MD inbound queue cap (`backpressure.md_inbound_max`)

Max inbound market-data messages queued for processing. Example: `100000`.

#### DOM publish queue cap (`backpressure.dom_publish_max`)

Max normalised DOM events queued for delivery to downstream consumers. Example: `50000`.

### Typical backpressure-cap sizing

- Trading outbound tends to be smallest — order flow is relatively low-rate.
- MD inbound is largest — raw market data can be very chatty.
- DOM publish sits in between.

If your bridge is routinely hitting these caps and dropping, that's a signal that something downstream is too slow or the caps are too low. Raise cautiously and watch memory.

## Common tasks

### Enable full audit for a new compliance requirement

1. Turn on `audit.raw_fix.enabled`.
2. Turn on `audit.normalized_dom.enabled`.
3. Set retention hours based on your compliance window (e.g. 168 for 7 days).
4. Check `compression` is `zstd` to save disk.
5. Save and restart.

### Turn on verbose logging temporarily to debug an issue

1. Change `log_level` from `info` to `debug`.
2. Save and restart.
3. Reproduce the problem. Pull logs.
4. Change `log_level` back to `info`.
5. Save and restart.

Be disciplined about the second restart — leaving `debug` on in production fills disks.

### Reduce incident noise

If `SESSION_GAP` is firing constantly due to a flaky LP connection, you can temporarily untick it from `auto_export_on` to stop generating bundles for that specific issue. Fix the underlying connectivity problem first, though — the incident itself isn't noise; it's a signal.

### Suspect messages are being dropped due to backpressure

1. Check the bridge logs — there'll be a "queue full, dropping" warning when caps hit.
2. If `md_inbound_max` is the culprit, the processor downstream of it is too slow.
3. If `trading_outbound_max` is the culprit, the session writer to an LP is too slow.
4. Raise the cap gradually. Monitor memory.
5. Fix the underlying slowness if possible (it's usually more useful than raising caps).

## What's not implemented yet

### Live status

The right-hand **Live status** panel shows `—` for all metrics with a `GET /fixbridge/status — 501 stub` badge. Today the backend returns 501 for this endpoint. When wired, it will show:

- Number of FIX sessions connected / configured
- Last message timestamp
- Inbound messages per second
- Outbound messages per second

When the endpoint lands, the panel fills in automatically — no UI change needed.

### Recent changes

Placeholder, awaiting audit-log integration.

### Service status

Process / Status / Uptime / Last start panel shows `—` with "awaiting backend" notes — same pattern as every other sub-page.

## After you save

- Yellow **restart banner** appears site-wide. Cleared after the next 30-second hub refresh following the restart.
- Confirmation line: `Saved. Restart fixbridge_service to apply.`
- The bridge continues with *old* settings until you restart. On restart, new settings take effect.

## Troubleshooting

### "The bridge won't start after I saved"

Check the bridge logs (`Log dir` in the Service panel). Common causes:

- **`incident.bundle_path` doesn't exist and can't be created.** Fix permissions or pre-create the directory.
- **A numeric cap was set to zero.** All three backpressure caps must be positive.
- **Segment size is absurdly small (e.g. 0 or 1 MB).** The service may refuse to start, or rotate so fast it can't keep up.

### "Disk is filling up fast"

1. Check `audit.raw_fix.retention_hours` — too long? Dial it back.
2. Check `audit.normalized_dom.retention_hours` — same.
3. Check `log_level` — did someone leave it on `debug`?
4. Check the incident directory — too many bundles? Lower `incident.max_bundles`.

### "Incident bundles aren't being generated"

1. Is the trigger checkbox for that event type enabled?
2. Is `incident.bundle_path` writeable by the service process?
3. Has `max_bundles` been hit? When the cap is hit, new bundles replace oldest — but also check disk space.

### "I can see messages are being dropped"

Backpressure kicked in somewhere. Find the offending queue in the logs, then either raise the cap or address the downstream slowness.

### "I saved, but the log level didn't change"

The service hasn't been restarted yet. The log_level is read at startup only. Restart `fixbridge_service`.