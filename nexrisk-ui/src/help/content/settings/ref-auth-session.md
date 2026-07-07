---
id: ref-auth-session
title: "Auth & Session — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/auth
order: 2
source:
  - "Settings_02_Auth_Session.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,auth,session,login,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

This page controls two things: how long a user stays logged in before
the platform makes them sign in again, and what counts as an acceptable
password. There are six settings, all numbers or short labels, and none
of them is a secret. The values here shape the balance between security
(frequent re-authentication) and convenience (staying logged in through
a session).

You reach it at **Settings › Auth & session**.

## 2. What This Page Controls

This page manages the authentication section of the platform’s main
configuration file (nexrisk_config.json). Every setting here is read by
the core platform service **once, at startup**, and held in memory while
it runs — which is the single most important operational fact about this
page, and the source of most of its surprises (Section 4).

|                                                                                                                                                                                                                                                                                                                                                                                         |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk service (the core).** These settings live in the core platform service, so a change applies only after the core service is restarted. If you happen to be doing a full platform restart, bring the price and LP feed services up first and the core service last; for an auth-only change, restarting the core service is all that is required. |

## 3. How Login and Sessions Work

To set the lifetimes sensibly, it helps to understand the two
credentials a logged-in session actually uses. When a user signs in —
username, password, and a one-time code from their authenticator app
(TOTP) — the platform hands the browser two things:

| **Credential** | **What it is**                                                                                                                                                | **Lifetime**     |
|----------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|
| Access token   | The short-lived pass the browser presents on every request. It proves the user is logged in.                                                                  | Short (minutes). |
| Refresh token  | A longer-lived credential the browser keeps quietly. When the access token expires, the browser uses the refresh token to obtain a new one — no login prompt. | Long (hours).    |

So a session runs like this: the access token expires often and is
silently renewed using the refresh token, over and over, invisibly to
the user. The user only has to log in again — typing password and
one-time code — when the **refresh token** itself expires. That is why
the refresh-token lifetime is effectively "how long a user stays logged
in", and the access-token lifetime is really "how often the session
renews behind the scenes".

|                                                                                                                                                                                                                                                     |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The practical upshot.** Shortening the access-token lifetime is invisible to users (it just renews more often) as long as the refresh token is still valid. Shortening the refresh-token lifetime is what actually forces people to log in again. |

**4. The Golden Rule: Changing a Lifetime Does Not End Existing
Sessions**

A lifetime is stamped onto a token when the token is **issued**, and it
keeps that stamp for its whole life. Changing a setting here does
**not** reach back and re-stamp tokens that are already in circulation.

- If an access token was issued with a 60-minute life, it stays valid
  for its full 60 minutes even if you shorten the setting to 5 minutes.
  The new, shorter life applies only to tokens issued **after the next
  restart**.

- The same applies to passwords: raising the minimum length does **not**
  invalidate existing passwords. The new rule is enforced only when a
  password is next created — at sign-up, reset, or change.

|                                                                                                                                                                                                                                                                                                                                                       |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **So "shorten the lifetime and everyone logs out now" is not how it works.** Existing sessions run out their original lifetimes; the new values take over gradually as old tokens expire and new ones are issued after the restart. If you need to end all sessions immediately, that is a separate administrative action, not a change on this page. |

## 5. The Settings

Six settings. The four lifetimes are entered in seconds; the form shows
the human equivalent next to the field as you type (for example, 28800
shows as "8 h").

### 5.1 TOTP issuer

The label users see in their authenticator app (the app that generates
their one-time codes) next to their account, set when they first enrol
by scanning the code. For example, "NexRisk" or "Taiga Production". It
is cosmetic, but worth getting right — keep it short, readable, and
distinct from the other services a user protects with the same app, so
they can tell them apart.

### 5.2 Access token lifetime

How long the short-lived access pass stays valid before the browser
silently renews it. This is a pure security-versus-chatter trade-off,
and it is invisible to users either way:

- **Short (5–15 minutes)** — better security: if a token is ever stolen,
  the window it can be misused in is small. Costs a little more renewal
  traffic.

- **Long (1 hour)** — fewer renewals, but a stolen token stays useful
  longer.

A typical value is 15 minutes. Lengthen it if renewals are showing up as
noticeable pauses on slow networks.

### 5.3 Refresh token lifetime

How long a user stays logged in before the platform makes them sign in
again from scratch. When this expires, the user must re-enter username,
password, and a one-time code. This is the setting that actually governs
session length:

- **Short (1–4 hours)** — more frequent re-login; sensible in
  high-security environments.

- **Long (8–24 hours)** — users log in once per shift; more convenient,
  slightly more exposure.

A typical value is 8 hours — one trading session.

### 5.4 Invite link lifetime

How long a new-user invitation stays usable. When you invite someone,
they receive a one-time link; if they do not use it within this window,
the invitation expires and you must send a fresh one. A typical value is
24 hours.

### 5.5 Minimum password length

The fewest characters a new password may have, enforced at sign-up,
reset, and change (not retroactively — Section 4). A typical value is
10–12. Note that length is the only rule here — there are deliberately
no "must contain a digit" or character-class requirements. Length alone,
combined with the mandatory one-time code at login, is the accepted
basis for a strong-enough policy.

### 5.6 Password-reset link lifetime

How long a "forgot password" reset link stays usable. A user who
requests a reset receives a one-time link; if it is not used within this
window, it expires and they must request another. A typical value is 1
hour — short, because a reset link is a powerful, sensitive credential.

## 6. Common Tasks

### 6.1 Make everyone log in again each trading session

Set the refresh-token lifetime a little shorter than the gap between
sessions, so it always expires overnight. For a desk that runs
07:00–17:00, a 10-hour refresh lifetime means anyone still logged in at
day’s end is signed out and must re-authenticate next morning. Save and
restart the core service.

### 6.2 Reduce session chatter on slow networks

If access-token renewals are causing visible pauses, lengthen the
access-token lifetime. Going from 15 minutes to 1 hour cuts renewal
frequency to a quarter, with no change to how long users stay logged in.

### 6.3 Tighten password policy without disrupting anyone

Raise the minimum length, save, and restart. Existing users keep their
current passwords and are undisturbed; the new rule applies the next
time each one sets a password. Forcing everyone onto the new policy at
once (expiring all passwords) is a separate administrative action, not
owned by this page.

## 7. Saving and Restarting

- When you save, a **yellow restart banner** appears across the Settings
  area and stays until the core service is restarted; the form confirms
  with a short "restart to apply" message.

- No current session is disturbed by saving — the values are only read
  when the core service starts.

- After the restart, new tokens use the new lifetimes; tokens already in
  circulation keep their original lifetimes until they expire (Section
  4). The banner clears itself within about half a minute.

## 8. The Side Panels

- **Policy preview** — updates as you edit, restating the current
  settings in plain terms ("Access tokens expire after 15 min. Refresh
  tokens last 8 hours…"). Use it to sanity-check a change before saving.

- **Recent changes** — lists the last few edits to these settings, with
  attribution.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file, and Log directory.

## 9. Troubleshooting

### 9.1 I shortened a lifetime but sessions did not end

Expected. Either the core service has not been restarted, or the
in-flight tokens have not expired yet. The new lifetime applies only to
tokens issued after the restart; already-issued tokens run out the
lifetime they were born with (Section 4).

### 9.2 Users are being logged out constantly

Check the two lifetimes. If either is set very small (seconds, or a few
minutes), the browser renews constantly and soon hits the refresh-token
expiry, forcing a re-login. Sane starting values are about 15 minutes
for access and 8 hours for refresh.

### 9.3 I set a lifetime of zero by accident

Avoid this. The core service treats zero or negative lifetimes as a
misconfiguration and may refuse to start, or fall back to an internal
default. Set a positive number and restart.

### 9.4 Can I set an unlimited lifetime?

No — and you should not want to. A token that never expires is a token
that is never rotated, which is a security liability rather than a
convenience. If you want near-unlimited convenience, use a long lifetime
(many hours, or a full day), not an unlimited one.

*End of guide — Settings › Auth & session. One of nine Settings operator
guides.*
