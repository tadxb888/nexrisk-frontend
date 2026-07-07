---
id: ref-trading-economics
title: "Trading Economics — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/trading-economics
order: 3
source:
  - "Settings_03_Trading_Economics.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,trading-economics,calendar,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

Trading Economics is an external data provider for the economic calendar
— the schedule of market-moving events such as non-farm payrolls,
central-bank decisions, and inflation releases. This page configures
Taiga’s connection to that calendar feed: whether it is running, what
credentials it uses, how much past and upcoming data it loads at
startup, and how often it checks for updates.

You reach it at **Settings › Trading Economics**. Six settings, one of
which is a credential.

|                                                                                                                                                                                                                                                                                                       |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This is a licensed, metered external feed.** Your Trading Economics subscription has an allowed request rate and a monthly quota. Frequent polling and wide data windows both consume quota faster — check your subscription tier with the provider before making the feed poll harder (Section 4). |

## 2. What This Page Controls

This page manages the Trading Economics section of the platform’s main
configuration file (nexrisk_config.json). Every setting is read by the
core platform service, so a change here applies only after that service
is restarted.

|                                                                                                                                                                                                                                                                                                           |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk service (the core).** The feed runs inside the core platform service. Restart the core service to apply a change; the feed keeps running with the old settings until you do. In a full platform restart, bring the price and LP feeds up first and the core last. |

## 3. How the Feed Gets Its Data

The feed uses two channels together. A live stream delivers events in
real time as the provider pushes them, and a periodic poll re-checks the
calendar on a fixed cadence to catch edits and revisions the stream may
not push. Together they keep Taiga’s calendar current. Downstream
features that depend on the calendar — news-driven trader behaviour,
pre-event risk flags — read from this data, so when the feed is off,
they simply see an empty calendar.

## 4. Before You Change Anything

- **Mind your quota.** Short poll intervals and wide preload windows
  both increase how much of your monthly quota the feed uses. Confirm
  your subscription tier before lowering the poll interval.

- **Know your key.** The credential is stored encrypted and never shown
  back. If you are unsure the stored key is correct, the simplest test
  is to enable the feed, restart, and watch the logs for authentication
  errors.

- **Disabling is safe and non-destructive.** Turning the feed off stops
  it consuming quota after the next restart, and preserves every setting
  — you can switch it back on later without re-entering anything.

## 5. The Settings

### 5.1 Feed enabled

The master switch for the integration. When off, the feed stops polling
and stops maintaining its live stream, no quota is consumed, and any
downstream feature that filters on upcoming events sees an empty
calendar. Every other setting is preserved, so you can turn it back on
to resume exactly as before.

### 5.2 API key

**This is a credential field, handled specially for security.** It is
the key Trading Economics issues you (typically two strings separated by
a colon, such as 51056C49BC90461:C5F849F9F1F84A5) — you cannot generate
it yourself. It loads empty with the prompt "Leave blank to keep current
value"; the server returns three asterisks instead of the real key, and
the page never sends those back. Leave it blank to keep the current key,
type a new one to replace it, and never type three asterisks yourself.
The key is stored encrypted.

### 5.3 Stream address

The address of the live event stream (for example,
wss://stream.tradingeconomics.com/). It must be a secure streaming
address; the page checks the address form and rejects anything malformed
before saving. The provider’s production address is the secure one — an
unencrypted address would only ever be for a rare test setup, where
credentials would not travel encrypted.

### 5.4 Poll interval

How often the feed re-checks the calendar for new or revised events,
entered in seconds, with the human equivalent shown as you type (90
shows as "every 90 s", 300 as "every 5 min"). A typical value is 90
seconds. Short intervals (30–60 s) cost more quota; long intervals (5–15
min) mean calendar edits take longer to appear in Taiga. This poll is
separate from the live stream — it exists to catch the edits the stream
might miss.

### 5.5 Preload — days back

How many days of past calendar events to load when the feed starts (for
example, 2 loads the last two days). A typical value is 2 — enough
recent history to relate events to current market moves, without
spending startup time and quota pulling weeks of history. Zero is
allowed.

### 5.6 Preload — days ahead

How many days of upcoming events to fetch at startup (for example, 14
loads today through two weeks out). A typical value is 14 — enough
lookahead for pre-event risk features to react in good time. Zero is
allowed.

## 6. Common Tasks

### 6.1 Rotate the API key

1.  Obtain the new key from your Trading Economics account.

2.  Type the new key into the (empty) key field and save.

3.  Restart the core service, and watch the logs for authentication
    success — a wrong key shows as an authentication (unauthorised)
    error from the provider.

### 6.2 Disable the feed temporarily (to save quota)

4.  Turn the Feed enabled switch off, save, and restart the core
    service.

5.  When ready to resume, turn it back on, save, and restart again. Your
    key and settings are untouched throughout.

### 6.3 Lower quota use without disabling

Increase the poll interval. Going from 60 to 300 seconds cuts poll
traffic to a fifth; the trade-off is that provider-side calendar edits
take up to five minutes to appear in Taiga.

## 7. Saving and Restarting

- Saving raises the **yellow restart banner** across the Settings area
  and confirms with a short "restart to apply" message.

- The feed keeps running on its **old** settings until you restart the
  core service; the new settings take effect on restart, and the banner
  clears itself shortly after.

## 8. The Side Panels

- **Feed summary** — updates as you edit, restating your current draft
  in plain terms ("every 90 s", "14 days ahead"). Use it to sanity-check
  a change before saving.

- **Live status** — shows the current connection state and when the last
  event was received.

- **Recent changes** — lists the last few edits to these settings, with
  attribution.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file and Log directory.

## 9. Troubleshooting

### 9.1 No data after restart

Check the core service’s logs. Authentication (unauthorised) errors mean
the key is wrong or expired — re-save a correct key. Connection or
name-resolution timeouts mean the stream address is not reachable from
the host — check the address and test connectivity. Rate-limit ("too
many requests") errors mean the poll interval is too short for your tier
— lengthen it.

### 9.2 The key looks right but authentication fails

These keys have a specific shape: two alphanumeric strings separated by
a colon — a key with no colon is wrong. Hidden whitespace also causes
silent failures, so check for trailing spaces or line breaks when
pasting from an email. And if you accidentally saved three asterisks,
that is literally the stored key now — save the real one again.

### 9.3 Events show up late, or history is missing

For faster updates, shorten the poll interval (mindful of quota); the
live stream is usually faster than polling, so confirm the stream
address is correct. For more lookahead, raise days-ahead; for more past
events, raise days-back — remembering history is only loaded at startup,
so a restart is needed for a new value to take effect.

*End of guide — Settings › Trading Economics. One of nine Settings
operator guides.*
