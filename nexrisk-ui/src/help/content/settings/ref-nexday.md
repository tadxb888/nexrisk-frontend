---
id: ref-nexday
title: "NexDay Integration — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/nexday
order: 4
source:
  - "Settings_04_NexDay_Integration.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,nexday,gopredict,integration,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

NexDay (from Forsa LTD) is an external market-data platform Taiga uses
for daily and intra-day price bars and for hedging suggestions. This
page configures the whole integration — the connection and licence, how
often data is pulled, how much history is kept, and how the
hedging-suggestion engine behaves. There are twelve settings across four
groups, one of which is a credential.

You reach it at **Settings › NexDay integration**. This page sets up the
**connection**; the separate Predictions page is where you map your
symbols to NexDay and read its signals.

|                                                                                                                                                                                                                                                                                                   |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This is a paid, licensed integration.** Your licence is the credential the service uses to authenticate with NexDay, and how often you poll affects your data costs — more frequent polling means more calls and more cost. Check your NexDay contract before increasing the polling frequency. |

## 2. What This Page Controls

This page manages the NexDay section of the platform’s main
configuration file (nexrisk_config.json). Some settings here apply as
soon as the service next polls, and others need a full restart; in
practice, **treat every change as needing a restart of the core
service** — erring on the side of a restart is always safe, and the
confirmation message will tell you which was needed.

|                                                                                                                                                                                                                                                       |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk service (the core).** The integration runs inside the core platform service. Restart the core service to apply a change; in a full platform restart, bring the price and LP feeds up first and the core last. |

## 3. Before You Change Anything

- **Treat the licence as a secret.** The licence ID is the credential
  that authenticates you with NexDay. Handle it like a password.

- **Polling frequency drives cost.** Higher frequency means more calls
  and more cost; lower frequency means less cost but older intra-day
  bars. Balance freshness against your contract.

- **Hedging suggestions are suggestions only.** Turning suggestions on
  does not place any hedges. It surfaces candidates on the Hedging
  strategies page for a person to review and act on. Automated execution
  is a separate matter entirely, not controlled here.

- **The daily poll time is US Eastern.** NexDay publishes end-of-day
  bars on a US schedule, so the daily poll time is set in New York time
  — typically shortly after the US cash-session close.

## 4. The Settings

The twelve settings fall into four groups, matching the dividers on the
page: Connection, Polling, Retention, and Hedging.

### 4.1 Connection

**Enabled**

The master switch for the whole integration. When off, there is no
polling of any kind, no hedging suggestions, and no calls to NexDay — so
no licence cost — while every other setting is preserved for when you
switch it back on.

**API server**

The address of the NexDay server (for example,
https://175.110.113.174:8080). In production this should be a secure
(encrypted) address; an unencrypted one would mean your licence
credentials travel unprotected, so it is only for rare test setups.

**Licence ID**

**This is a credential field, handled specially for security.** It is
your NexDay licence ID (a numeric string). It loads empty with the
prompt "Leave blank to keep current value"; the server returns three
asterisks instead of the real value and the page never sends those back.
Leave it blank to keep the current licence, type a new one to replace
it, and never type three asterisks yourself. It is stored encrypted.

### 4.2 Polling

NexDay is polled in two independent modes — intra-day (frequent) and
daily (once a day) — each with its own on/off switch.

**Intra-day polling**

A switch and an interval. When on, the service fetches intra-day bars
every so many minutes (shown with the human equivalent as you type, e.g.
"every 15 min"). A typical value is 15 minutes during active sessions —
shorter intervals give fresher bars at higher cost. When the switch is
off, the interval field is disabled and no intra-day polling happens.

**Daily polling**

A switch and a time-of-day. When on, the service pulls the day’s closing
bars at the set time, entered in US Eastern time (for example, 17:01).
The page checks the time is well-formed. A typical value is 17:01 — the
US cash session closes at 16:00 ET and end-of-day bars are reliably
available about an hour later, and one minute past the hour avoids
clashing with anything set to fire exactly on the hour. When the switch
is off, the time field is disabled.

### 4.3 Retention

How many bars the service keeps in memory per symbol, so recent history
can be analysed without re-fetching.

**Daily bars**

How many past daily bars to retain per symbol (for example, 100 —
roughly four months of trading days). More bars allow longer historical
analysis but use more memory.

**Intra-day bars**

How many recent intra-day bars to retain per symbol (for example, 12 —
which at a 15-minute interval is the last three hours). This is
expressed in intervals, so its span depends on the intra-day interval
above.

### 4.4 Hedging

The hedging-suggestion engine surfaces candidate hedges from NexDay’s
signals onto the Hedging strategies page for review.

**Auto-suggest**

**The master switch for generating suggestions** — when off, none are
produced. To be completely clear: this surfaces suggestions for a person
to consider; it **does not place any hedge automatically**. The
decision, and the action, remain with a human.

**Minimum position size**

The smallest position (in lots) that can trigger a suggestion — for
example, 0.01 means positions below that size raise no suggestions.
Decimals are allowed; raise it to suppress noise from very small
positions. Disabled when auto-suggest is off.

**Suggestion expiry**

How long a suggestion stays actionable before it is automatically
dismissed, in minutes (for example, 60 keeps it on the Hedging page for
an hour). Shorter expiry keeps the list "live" but a suggestion may
vanish before anyone sees it; longer expiry risks acting on a suggestion
after conditions have moved. Disabled when auto-suggest is off.

## 5. Common Tasks

### 5.1 Rotate the licence

1.  Obtain the new licence from your NexDay account, type it into the
    (empty) licence field, and save.

2.  Restart the core service and watch the logs for authentication
    success.

### 5.2 Pull daily bars only, skip intra-day

Turn intra-day polling off, leave daily polling on, save, and restart.
The service still authenticates and pulls the daily close once a day; it
simply stops polling between daily runs.

### 5.3 Stop hedging suggestions without stopping the feed

Turn auto-suggest off, save, and restart. Polling continues and bars are
still retained — only suggestion generation stops.

### 5.4 Pause the integration overnight

Turn the main Enabled switch off, save, and restart; reverse it in the
morning. (A scheduled, automatic pause is not offered here — that would
be arranged outside the application.)

## 6. Saving and Restarting

- Saving raises the **yellow restart banner**. The confirmation message
  tells you whether the change applied live or needs a restart — treat a
  restart as the norm.

- The integration keeps running on its old settings until the core
  service is restarted; the banner clears itself shortly after.

## 7. The Side Panels

- **Integration summary** — restates your current draft in plain terms
  ("every 15 min", "at 17:01 ET", the retention counts, the hedging
  thresholds) so you can check a change before saving.

- **Live status** — shows whether the integration is currently polling
  and when the last bar was received.

- **Recent changes** — lists the last few edits to these settings, with
  attribution.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file and Log directory.

## 8. Troubleshooting

### 8.1 No bars after restart

Check the logs for authentication failures. Confirm the NexDay server
address is reachable from the host, and that the licence is correct —
and if you accidentally saved three asterisks, that is the stored
licence now, so save the real one again.

### 8.2 Authenticating, but no intra-day bars

Intra-day polling is probably switched off. With it off, daily bars
still arrive but no intra-day polling occurs — turn it on if you need
intra-day data.

### 8.3 Daily bars look old

The daily poll time may be firing before NexDay has published the day’s
close. Move it to 17:01 ET or later.

### 8.4 Hedging suggestions never appear

Work down the chain: the main Enabled switch on; auto-suggest on; your
positions larger than the minimum size (if all are smaller, nothing
triggers); and recent suggestions not already expired. If all of those
are fine, check the logs for signal-generation errors.

### 8.5 The form will not save

Look for a red message above the save buttons — usually a malformed
daily poll time, a server address missing its secure/unsecured prefix,
or a numeric field left blank or zero where a positive number is
required. Fix the highlighted field and try again.

*End of guide — Settings › NexDay integration. One of nine Settings
operator guides.*
