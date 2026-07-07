---
id: ref-lp-management
title: "LP Management — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/lp-management
order: 8
source:
  - "Settings_08_LP_Management.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,lp-management,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

LP management is where you control which liquidity providers (LPs) the
FIX bridge connects to, and what each LP’s connection configuration
looks like. An LP here is any counterparty Taiga talks to over FIX — a
liquidity venue, another broker, or an aggregator. The page has two
views: a list of which LPs exist and which are switched on, and a per-LP
editor for one provider’s full configuration profile.

You reach it at **Settings › LP management**.

## 2. This Page Is Static Configuration — Not Live Control

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This is not the operational LP page.** This page defines the **static configuration** — which LPs exist, which are enabled, and how each is set up — and its changes take effect at the next FIX bridge restart. Starting, stopping, reloading or testing a **live** FIX session is done on the separate Liquidity Providers page, which controls the running session manager in real time. Use that page for runtime control; use this one for the configuration behind it. |

## 3. What This Page Controls

The list view maintains the authoritative list of LPs the FIX bridge
will try to connect to at startup. The profile editor maintains one
configuration file per LP that describes how the bridge talks to that
counterparty. Both live under the FIX bridge’s configuration on the
server.

|                                                                                                                                                                                                                                                                  |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Which service to restart: the NexRisk FIX Bridge service.** Every change on both views — enabling an LP, or editing a profile — applies only after the FIX Bridge service is restarted, which drops and re-establishes FIX sessions. Coordinate with the desk. |

## 4. List View — Enabling and Disabling LPs

The list shows every LP that has a configuration profile on the server.
Each row has a checkbox (whether the LP is switched on), the LP’s name
and identifier, a version, and a button to edit its profile. Rows you
have changed but not yet saved show a "pending" badge and a subtle
highlight, and the header keeps a live count — for example, "3 profiles
configured · 2 enabled in draft". Your changes are held as a draft until
you save; leaving the page without saving discards them, and a Revert
control resets the draft to the saved state.

### 4.1 Two rules that catch people out

- **Enabling an LP does not create it.** The LP’s configuration profile
  must already exist on the server first. Profiles are created
  out-of-band — by LP engineering, or from a template — not from this
  page. If the LP you want is not in the list, its profile has not been
  created yet (Section 7).

- **Disabling an LP does not delete it.** Its profile stays on the
  server; the bridge simply does not start it. You can re-enable it any
  time. But disabling a currently-connected LP will drop its live
  session at the next restart — deliberately.

### 4.2 Turning an LP on or off

Tick (or untick) the LP’s checkbox, save the enablement, and restart the
FIX Bridge service. To enable a new LP, first confirm its profile exists
(coordinate with LP engineering if not), refresh the list so it appears,
then tick, save, and restart.

## 5. Profile Editor — One LP’s Configuration

Choosing "Edit profile" on a row opens that LP’s full configuration
profile. A profile describes everything the bridge needs to talk to one
counterparty, organised into eight sections. Those sections fall into
two groups.

### 5.1 Read-only sections (set at onboarding)

Three sections are shown but cannot be edited here — they are preserved
exactly as they are on save, and are set at onboarding rather than
changed day to day:

| **Section**   | **What it holds**                                                                                        |
|---------------|----------------------------------------------------------------------------------------------------------|
| Connection    | The FIX endpoints, the session identifiers, and the session parameters — how the bridge reaches this LP. |
| Custom fields | LP-specific FIX tags, such as account fields or broker codes.                                            |
| Instruments   | Instrument metadata and symbol mappings — managed on the Symbol mapping page, not here.                  |

These are collapsed by default; expand one to view its contents
(readable, but not editable). Changing a connection endpoint or a
session identifier is an LP-engineering task, done deliberately and in
coordination with the LP — which is why the page will not let it drift
by accident.

### 5.2 Editable sections (day-to-day)

Five sections are the ones administrators change:

| **Section** | **What it governs**                                                               |
|-------------|-----------------------------------------------------------------------------------|
| Trading     | Trading-session behaviour, accepted order types, time-in-force, execution policy. |
| Market data | Depth of book, subscription style, update frequency, snapshot cadence.            |
| Routes      | Per-symbol or per-client routing rules.                                           |
| Limits      | Per-instrument and per-session caps on size, rate, and exposure.                  |
| Features    | Switches for optional FIX workflows (cross trades, mass cancel, and the like).    |

### 5.3 How the editable sections are edited

Each editable section is a block of **structured configuration you edit
directly as text**, rather than a form of individual fields. This is
deliberate: the exact structure differs from one LP type to another, and
is not fully standardised, so a fixed form would risk being subtly wrong
for some providers. These blocks are intended for a technically-informed
operator who already knows the shape each one should take, working in
coordination with LP engineering. As you type, the page checks the text
is well-formed and flags any section that is not; you cannot save while
a section is malformed.

## 6. Editing and Saving a Profile

1.  Expand an editable section and change its text. The page checks it
    is well-formed on every keystroke.

2.  If a section is not well-formed, it shows a clear error and an
    "invalid" marker on its header; a "Format" control re-tidies the
    layout once it is valid, and a per-section revert discards just that
    section’s changes.

3.  Save is available only when at least one editable section has
    changed **and** every section is well-formed. Saving sends the whole
    profile (your edits over the read-only sections as they were loaded
    — the read-only ones are preserved regardless).

4.  On success the editor reloads to pick up any tidying by the server,
    the pending list empties, and the restart banner appears. Restart
    the FIX Bridge service to apply.

## 7. Coordinating with LP Engineering

Two things about an LP live outside this page, and both are coordinated
with LP engineering rather than done here:

- **Creating a profile.** A new LP’s configuration profile is produced
  out-of-band before it can appear in the list and be enabled. If an LP
  you need is missing, that profile has to be created first.

- **Credentials.** An LP’s login credentials are stored separately from
  its configuration profile — not in the profile you edit here. An LP
  whose credentials have never been set will fail to log on even when
  everything on this page looks right.

The instruments/symbol side is likewise handled elsewhere — the
read-only Instruments section is maintained on the Symbol mapping page.

## 8. Common Tasks

### 8.1 Enable a new LP end-to-end

5.  With LP engineering, confirm the LP’s configuration profile has been
    created on the server.

6.  Refresh the list; the LP should now appear. Optionally open its
    profile to review what was delivered (especially Trading, Market
    data, and Limits).

7.  Tick its checkbox, save the enablement, and restart the FIX Bridge
    service.

8.  Watch the bridge logs for a session connecting, and the Liquidity
    Providers page for its live status.

### 8.2 Tighten a limit for one LP

Open the LP’s profile, expand Limits, edit the text, use Format to tidy
it, save, and restart the FIX Bridge service.

### 8.3 Temporarily block an LP without deleting it

Untick it in the list, save, and restart. Re-enable the same way later —
the profile is untouched throughout.

## 9. The Side Panels

- **Live session state** — this list shows which LPs are configured and
  enabled; for live connection status (connected, latency, and so on)
  use the Liquidity Providers page, which tracks the running sessions.

- **Recent changes** — lists the last few edits to these settings, with
  attribution.

- **Service panel** — shows the service’s Status, Uptime and Last start,
  along with its Process name, Configuration file, Profile directory and
  Log directory.

## 10. Troubleshooting

### 10.1 I enabled an LP but it is not connecting

Confirm the FIX Bridge service was restarted. Check the bridge logs (via
the Log viewer) for the LP’s identifier. Open the profile and check the
Connection section looks right. And verify credentials exist — they are
stored separately (Section 7), and an LP without them fails at log-on
even when the profile is correct.

### 10.2 A read-only section is empty

That section is genuinely empty in the profile — not every LP uses all
three read-only sections. The editor says so honestly rather than
showing nothing.

### 10.3 My profile will not save

A section is not well-formed — look for the "invalid" marker on a
section header (usually a missing separator or an unmatched bracket in
the text). Fix it and the marker clears; save stays disabled until every
section is well-formed.

### 10.4 I saved but the LP’s behaviour did not change

The profile is saved but the FIX Bridge service has not been restarted.
Restart it.

### 10.5 I saved bad values

Edit the text back to sensible values and save again. There is no undo
history here — if you do not know the previous values, ask LP
engineering, or restore the profile from a backup.

*End of guide — Settings › LP management. One of nine Settings operator
guides.*
