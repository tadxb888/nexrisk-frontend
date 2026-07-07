---
id: ref-alerting
title: "Alerting — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/alerting
order: 9
source:
  - "Settings_09_Alerting.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,alerting,notifications,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

The Alerting page controls how Taiga surfaces important events to
people: which severity counts as notable, how often alerts may fire for
a given trader, and through which delivery channels they go out. Two
channels are supported — Telegram, and webhooks (alerts delivered to
another system’s address). The page is a single scrolling column of
three cards: the core alert policy, Telegram, and webhooks. Each card
saves on its own.

You reach it at **Settings › Alerting**.

## 2. What This Page Controls

This page manages three sections of the platform’s main configuration —
the core alert policy, the Telegram settings, and the webhook settings.
They share one file, but the three cards each have their own save and
revert, so you commit one card at a time.

|                                                                                                                                                                                                                                                          |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk service (the core).** Alerting runs inside the core platform service, so changes apply after the core service is restarted. In a full platform restart, bring the price and LP feeds up first and the core last. |

## 3. How Alerting Decides What to Send

An event only becomes a delivered notification after passing through
several gates, in order. Understanding the chain makes both
configuration and troubleshooting straightforward:

1.  **Master switch.** If alerting is switched off overall, nothing goes
    out through any channel — full stop.

2.  **Severity threshold.** An event below the minimum severity is
    dropped and never reaches a channel.

3.  **Rate limits.** Repeats of the same alert for the same trader are
    held back by a cooldown, and there is a hard hourly cap per trader —
    anything over it is dropped, not queued.

4.  **Channel switch.** Each channel (Telegram, webhooks) has its own
    on/off switch, and it too must be on.

5.  **Per-destination levels.** Finally, each chat or endpoint receives
    only the severities you selected for it.

So a missing notification is almost always one of these gates being
closed — the troubleshooting in Section 12 simply walks the chain.

## 4. Before You Change Anything

- **The switches are layered.** The master switch overrides everything;
  a channel switch overrides that channel. If either is off, no
  configuration below it matters.

- **Changes to a destination apply immediately, not on a batched save.**
  Adding, editing, or deleting a chat or endpoint takes effect the
  moment you click — one action at a time. This keeps "what did I
  change?" simple, but you cannot stage five additions and commit them
  together.

- **The test buttons act for real.** A Telegram test posts a real
  message to the chat; a webhook test fires a real request to the
  endpoint. Do not test against production destinations you would rather
  not disturb.

- **The Telegram bot token is a credential.** It follows the same
  write-preserve handling as every other secret — blank keeps the
  current value, and never type three asterisks.

## 5. The Severity Levels

Four severity levels run through the whole page — in the threshold
dropdown, the per-destination pickers, and the row badges:

| **Level** | **Meaning**                      |
|-----------|----------------------------------|
| Low       | Informational (green).           |
| Medium    | Worth noting, not urgent (grey). |
| High      | Needs attention (amber).         |
| Critical  | Immediate action required (red). |

## 6. Card 1 — Core Alert Policy

Four settings that apply across every channel. No secrets here.

### 6.1 Alerting enabled

The master switch. When off, no alerts leave Taiga through any channel,
whatever the rest of the page says. Everything else is preserved.

### 6.2 Minimum severity

The lowest severity that is allowed through. Anything below it is
dropped inside the platform and never reaches a channel. A typical
production value is High (to cut noise); Low is useful during testing or
early rollout, when you want to see everything.

### 6.3 Cooldown

The minimum time between two alerts of the same kind for the same
trader, in seconds — so a single event cannot produce a burst of
duplicate notifications. A typical value is 300 (five minutes).

### 6.4 Maximum per trader per hour

A hard cap on how many alerts a single trader can generate in an hour.
Anything beyond it is dropped — not delayed, not queued. A typical value
is 12 (about one every five minutes on average, with some bursting
allowed).

## 7. Card 2 — Telegram

Telegram delivery has a channel switch and a credential, then a list of
chats that receive alerts.

### 7.1 Channel switch and bot token

The **Telegram enabled** switch turns this channel on (the master switch
must be on as well). The **bot token** is the credential for the
Telegram bot that posts the messages — you obtain it from Telegram’s
BotFather when you create the bot. It follows the usual secret handling:
it loads empty, the server never shows it back, blank-on-save keeps the
current value, and you never type three asterisks. A Validate button
beside it checks the token with Telegram and shows the bot’s name.

### 7.2 The chat list

Each chat that receives alerts is a row showing a label (a human name
such as "Ops Room"), the Telegram chat identifier, and which severities
that chat receives. To add one, open the inline form and provide a
label, the chat identifier, and at least one severity. Each chat also
has Edit, Delete (with a confirm step), and Test buttons. All of these
apply immediately when clicked.

- **The chat identifier** is the numeric id Telegram assigns the chat.
  Private chats are positive; groups are negative; supergroups and
  channels start with "-100" then digits. Getting the sign wrong is the
  most common mistake.

- **If you do not know the identifier,** a resolver lets you paste the
  chat’s handle or link and fills the identifier in for you.

- **There is no separate per-chat on/off switch** on Telegram — the
  severity selection is the effective enabler. To silence a chat without
  deleting it, edit it and clear all its severities; re-add them to
  restore it.

## 8. Card 3 — Webhooks

A webhook delivers each alert to another system’s address — an on-call
tool, a chat app, or your own service. The card has a channel switch and
a list of endpoints.

### 8.1 Channel switch

The Webhooks enabled switch turns the channel on (again, the master
switch must also be on).

### 8.2 The endpoint list

Each endpoint is a row showing its address, the severities it receives,
its own on/off switch, and whether an authorization value is configured.
To add one, provide:

- **Address** — the full secure (or, rarely, unsecured) address the
  alert is sent to. The page checks the address form.

- **Authorization value (optional)** — sent with each alert so the
  receiving system can accept it (for example, a bearer token or basic
  credential your system expects).

- **Enabled** — an endpoint saved as disabled still exists but is
  skipped when alerts are dispatched.

- **Severities** — at least one; typically just High and Critical for an
  on-call destination.

Edit, Delete and Test work as they do for Telegram. The Test button
fires a real request to the address and reports whether it succeeded,
the response the endpoint returned, and how long it took.

## 9. Common Tasks

### 9.1 Set up a new Telegram integration

6.  Create a bot via Telegram’s BotFather and save its token; add the
    bot to the chat(s) that should receive alerts (in supergroups it
    typically needs to be an admin).

7.  On this page, turn the Telegram channel on, paste the token, and
    save the core Telegram settings; restart the core service.

8.  Add a chat: provide its identifier (or use the resolver), pick the
    severities to route there, and add it.

9.  Once the test button is switched on, use it to confirm a message
    arrives; until then, generate a real low-severity alert to verify.

### 9.2 Send High/Critical alerts to an on-call system

10. In your on-call tool, create an incoming webhook address and note
    any authorization it requires.

11. On this page, turn the Webhooks channel on, save core, and restart.

12. Add an endpoint with that address, the authorization value if
    needed, High and Critical selected, and Enabled on.

### 9.3 Rotate the Telegram bot token

Obtain a new token (create a new bot, or revoke and reissue via
BotFather), paste it into the token field, save core, and restart. Your
chats do not need re-configuring — they are keyed to the chat
identifier, which does not change with the bot.

### 9.4 Pause all alerting quickly

Turn off the master switch on the core policy card, save, and restart —
this halts every alert regardless of channel configuration. Turn it back
on when ready.

## 10. Saving and Restarting

- Each card saves independently — saving the Telegram core, for
  instance, does not require touching the others, and adding a chat or
  endpoint does not require saving that card’s core first.

- Any change here is a change to the platform configuration, so **treat
  every save as needing a restart of the core service**. The yellow
  restart banner appears and clears itself shortly after the restart.

## 11. Live Actions and Side Panels

Four live actions help you verify a setup:

- **Validate** (Telegram) — confirms a bot token is valid and shows the
  bot’s name.

- **Resolve** (Telegram) — turns a chat handle into its numeric
  identifier.

- **Test** (Telegram) — sends a real message to a chat.

- **Test** (webhook) — fires a real request to an endpoint and reports
  the result.

The Recent changes panel lists the last few edits to these settings, and
the Service panel shows the service’s status, uptime, last start,
process, configuration and log details.

## 12. Troubleshooting

### 12.1 Nothing is arriving in Telegram

Walk the chain (Section 3): is the master switch on; is the Telegram
channel on; is the bot token valid; does the target chat have an entry
with at least one severity selected; has the core service been restarted
since the last core change; and have you actually generated an alert
that meets the minimum severity and is not being suppressed by the
cooldown or the hourly cap? If all six are fine, check the core service
logs via the Log viewer — delivery failures (wrong token, bot not in the
chat) are logged there.

### 12.2 A test did not arrive

If a Telegram test does not appear in the chat, confirm the bot is a
member of that chat and the token is valid (use Validate). If a webhook
test reports a failure, check the endpoint address and the authorization
value. You can also generate a real, low-severity alert to confirm
end-to-end delivery.

### 12.3 I saved a new bot token and now nothing works

Either the token is wrong (a paste typo or hidden whitespace) or you
accidentally saved three asterisks. Re-enter the correct token, save,
and restart.

### 12.4 The chat identifier is not right

Check the sign: private chats are positive, groups negative, and
supergroups/channels start with "-100". The sign is the usual culprit;
the resolver gets it right for you from a handle.

### 12.5 The webhook is reached but my system does not react

Once the test is live, check its result: a success response means your
system accepted the request, anything else means it rejected it. Confirm
the authorization value is what your system expects, and that your
system can parse the message format Taiga sends (that format is
documented outside this page).

### 12.6 I added several destinations but not all appear

Each add is independent and can fail on its own — look for a red error
on the row at the time. Refresh the page to re-fetch the current list
from the server; what you see is whatever the server actually holds.

*End of guide — Settings › Alerting. One of nine Settings operator
guides.*
