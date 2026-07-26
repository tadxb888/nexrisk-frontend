## 1. About This Reference

This reference documents the Alert Thresholds page in full. It is written
for the people who receive the platform's alerts and have to judge whether
an alert is telling them something real — dealers, risk managers and
system administrators — and it treats every section, row and field in
detail rather than summarising.

The page answers one question: **what counts as a problem worth telling
someone about?** It sets the limits at which the health monitor raises an
alert, and the delivery rules for how those alerts reach Telegram.

**It tunes monitoring, it does not show it.** For the current state of
the platform use the Cockpit and the system health bar along the bottom
of the screen. Nothing on this page tells you whether anything is wrong
right now. Everything on it is a definition of "wrong" that some other
part of the platform then applies.

That distinction matters more than it first sounds. A threshold set too
tight produces an alert channel nobody can read; a threshold set too
loose, or a row switched off, produces silence that looks exactly like
health. The first failure is noisy and gets fixed within a day. The
second can sit unnoticed for months.

## 2. What Alert Thresholds Controls

The health monitor watches twenty-seven distinct conditions, each with a
short code — A3, D3, F1 and so on. Those codes appear in the title of
every alert the platform sends, which is what makes them useful: a code
in a message maps to exactly one row here.

Twelve of the twenty-seven are tunable on this page. Each of those has:

- **An on/off switch.** Off means the row never alerts.
- **One or more limits.** A percentage, a duration, or a count.
- **In most cases a duration the condition must hold for**, so a
  momentary spike does not alert.

The page also controls two **delivery** settings that apply to every
alert rather than to one row: the minimum severity forwarded to Telegram,
and whether a continuing breach re-sends or alerts once.

The other fifteen rows are shown but not editable here. They are not
locked — they are owned by a different part of the platform, and the page
says which. Section 8 covers them.

## 3. How the Page Is Laid Out

Top to bottom:

1. **Header** — page title, row counts, configuration file path and node
   role.
2. **Banners** — restart required, configuration file problems, standby
   warning, read-only notice, and the result of your last save.
3. **Counts and search** — how many fields differ from their defaults,
   how many rows are switched off, and a search box.
4. **Platform limits** — the twelve tunable rows, grouped by area.
5. **Alert delivery** — the two settings that apply to every alert.
6. **Per-provider limits**, **External monitoring** and **Not in
   service** — the rows owned elsewhere.
7. **Save bar** — appears at the foot of the page only once you have
   changed something.

## 4. The Header

### 4.1 Configuration path and node role

The top right shows the configuration file this page is editing and the
role of the node answering — `master` or `standby`. Both matter, and the
node role in particular is worth reading before you change anything;
section 10 explains why.

### 4.2 Banners

Banners appear above the content in a fixed order of importance.

| **Banner**                            | **When it appears**                 | **What it means**                                                            |
|---------------------------------------|-------------------------------------|------------------------------------------------------------------------------|
| Standby server                        | The node role is `standby`          | You are editing the backup server's settings. Amber.                         |
| No configuration file / not parseable | The file is missing or malformed    | Every value shown is a compiled default, not a value anyone chose.           |
| Restart required                      | Saved values are not yet in force   | The service is still enforcing its previous values. Amber.                   |
| Save result                           | After a successful save             | Lists what moved, as before-and-after.                                       |
| Rejected                              | After a refused save                | Nothing was written; the reasons appear next to the fields that caused them. |
| View access                           | You hold VIEW rather than EDIT      | Values are visible, controls are not.                                        |

## 5. The Counts and the Search

### 5.1 Fields differing from defaults

A count of every field whose saved value is not the shipped default, and
a filter that hides everything else.

When alerting is behaving oddly, this is the first thing to check. It
answers "what is not standard here?" without reading twenty-seven rows,
and it is usually a short list.

### 5.2 Disabled rows

If any tunable row is switched off, a red marker names the codes. It is
not behind a filter and it does not disappear.

A row that has been switched off produces no alerts, no errors and no
record anywhere except this page. It looks identical to a row that has
nothing to report. If that count is not zero, someone turned something
off deliberately, and it is worth knowing who and why.

### 5.3 Searching by row code

The search box matches row codes, row names, descriptions and field
names. Typing `D3` finds the row directly.

The page also accepts a code in the address bar:

```
/alert-thresholds?row=D3
```

This scrolls to that row and highlights it, which is the intended path
from an alert to the setting behind it. If a message arrives titled with
`(D3)` and it is firing too often, the code is the answer to "where do I
change this?"

## 6. Platform Limits — The Twelve Tunable Rows

These are grouped by the area they watch: the server, MT5, prices, the
provider link, execution quality and infrastructure.

### 6.1 The row card

Each row shows its code as a badge, a name, a one-line description of
what the check actually does, its class, and its on/off switch. Below
that are the row's fields.

### 6.2 The enable switch

The switch on the right of each card turns that row on or off entirely.
Off means the row will never alert regardless of the values below it,
which remain visible and editable.

### 6.3 Field markers

Each field shows the current value, its unit, and its default. Markers
appear beside it:

| **Marker**      | **Meaning**                                                        |
|-----------------|--------------------------------------------------------------------|
| non-default     | The saved value differs from the shipped default.                  |
| unsaved         | Changed in the browser but not yet saved.                          |
| pending restart | Saved to file, but the service is still enforcing the old value.   |
| ⚠ warning       | This value carries a known cost. It does not block saving.         |

The warnings are worth reading rather than dismissing. They are not
validation — the value is legal and will save. They state what the
setting costs at the moment you are deciding it, rather than in a
document read once at handover.

### 6.4 The rows and their defaults

| **Code** | **Row**                       | **Fields and defaults**                                                                 |
|----------|-------------------------------|-----------------------------------------------------------------------------------------|
| A3       | CPU saturation                | Warn above 50 %; Alert above 70 %; Held for 60 000 ms                                    |
| A4       | Memory pressure               | Warn above 50 %; Alert above 60 %; Held for 60 000 ms                                    |
| C1       | MT5 connection lost           | Down for 10 000 ms                                                                       |
| D1       | Price feed gateway stopped    | Not running for 45 000 ms                                                                |
| D2       | Market data session down      | Down for 10 000 ms                                                                       |
| D3       | Prices have stopped arriving  | Silence before alert 120 s; Cooldown after recovery 120 s; Symbols before summary 12     |
| E1       | FIX Bridge unreachable        | Down for 5 000 ms                                                                        |
| E2       | Trading session down          | Down for 10 000 ms                                                                       |
| F1       | Hedge dispatch speed          | Alert above 50 ms; Held for 300 000 ms                                                   |
| F4       | Rejection streak              | Rejections in a row 3                                                                    |
| G1       | Database unreachable          | Down for 5 000 ms                                                                        |
| G3       | Live state cache unreachable  | Down for 5 000 ms                                                                        |

Every field has a permitted range enforced by the service. A value
outside it is refused, with the reason shown next to the field.

## 7. Alert Delivery

Two settings apply to every alert rather than to a single row.

| **Setting**                       | **Default** | **What it does**                                                                          |
|-----------------------------------|-------------|--------------------------------------------------------------------------------------------|
| Minimum severity sent to Telegram | HIGH        | Alerts below this level are recorded but not sent. Options are LOW, MEDIUM and HIGH.       |
| One alert per state change        | On          | On, a breach alerts once. Off, it re-sends on every evaluation.                            |

Both are quick ways to quieten the channel and equally quick ways to stop
hearing about real problems. Raising the severity floor silences whole
categories of alert with no indication on the rows themselves.

## 8. Rows Owned Elsewhere

Fifteen rows are shown read-only. The page names where each is actually
changed rather than greying it out with no explanation.

### 8.1 Per-provider limits (Class 1)

**F2 latency, F3 rejection, uptime/day.** Latency and rejection limits
differ from one liquidity provider to the next, so a single platform-wide
number would be wrong for most of them. They are set per provider in the
**Route Sanity** panel, and these rows link straight there.

### 8.2 External monitoring (Class 3)

**A1, B1, B2, G2, I1 to I6.** These run on the Taiga Witness host, which
watches this server from the outside.

That is deliberate rather than an oversight. A check running on the
machine it is checking cannot report that the machine is down — if the
box is unreachable or the process is dead, anything running on that box
is unreachable or dead too. The Witness host exists to be the thing still
running when this one is not.

Changing them is a request to Taiga.

### 8.3 Not in service

**E6** was dropped and has no code path. **uptime/60min** is deferred and
not built.

They appear only so that a code from an older alert or an older document
resolves to something rather than looking like a typo.

## 9. Saving

### 9.1 The review step

Changing anything reveals a save bar at the foot of the page with a count
of staged changes, a Discard control and **Review & save**.

Review opens a list of every change as a before-and-after — `120 → 30` —
which you confirm before anything is written. This is not a "are you
sure?" prompt to be clicked through. A mistyped threshold is invisible
inside an input box and obvious as a pair of numbers side by side.

### 9.2 What a save actually writes

**Saving writes to the configuration file. It does not change what the
service is currently enforcing.** The service reads its values at
startup, so a saved change takes effect at the next restart.

Until then the page shows a **Restart required** banner, marks each
changed field **pending restart**, and the previous value continues to
produce alerts. A change saved an hour ago has changed nothing if the
service has not been restarted since.

The page separates these two states deliberately: what is on disk, and
what is in force. They are frequently not the same thing.

### 9.3 Rejected values

Saves are all or nothing. If any single value fails validation, nothing
is written, and each reason appears next to the field that caused it.
There is no partial save to reconcile.

Some limits exist because of a specific past incident rather than a
theoretical bound — see section 11.

## 10. Two Servers, Two Files

The Master and the Standby each hold their own copy of this configuration
file, and each answers independently. **A change saved on one is not a
change on the other.**

When you are working on the Standby, the page says so in a banner and the
node label in the header turns amber. Editing the backup server's
thresholds is occasionally what you want and usually not.

When the two disagree, row **I5 — config parity drift** is the check that
catches it. That row runs on the Witness host, which is why it can see
both.

## 11. Pitfalls and Notes

**D3 is the most-tuned row in the platform and the easiest to get wrong
in both directions.** Quoting is not a steady stream: many providers send
bursts separated by long silences, especially near market close and in
thin symbols. Set the silence window below your provider's normal quiet
gap and every one of those gaps becomes an alert. At 30 seconds against a
feed bursting with 60 to 70 second gaps, this row produced 658 messages
in a single night — working exactly as configured, and the channel became
unusable anyway. Measure the real gaps across a few sessions before
lowering it. Set it far too high instead and the row stops catching
genuine staleness, with no signal that it has.

**D3's summary threshold protects the channel during an outage.** When
this many symbols fall silent at once, one summary message replaces the
per-symbol messages, so a provider-wide outage sends one alert rather
than forty. Set it to 1 and every outage sends only a summary — you lose
the ability to see which symbol went quiet.

**C1 should favour speed.** Every second added is a second of hedging
decisions made against position data that has stopped updating. A brief
false alarm costs less than hedging blind.

**D1 should survive a routine restart.** Below about 30 seconds it fires
every time the service is restarted normally, and an alert that fires on
routine events is one people learn to ignore — including on the occasion
it is real.

**Switching a row off is silent.** It is one click, it produces no record
outside this page, and the result is indistinguishable from a healthy
system. The disabled count at the top is the only routine way to notice.

**The values here apply to this node only.** See section 10.

**Non-default is not the same as wrong.** Several rows are legitimately
tuned away from their shipped defaults for a particular deployment. The
drift filter is a starting point for investigation, not a list of faults.

## 12. Quick Reference

### 12.1 Where each row is set

| **Class** | **Rows**                                          | **Set where**                             |
|-----------|---------------------------------------------------|-------------------------------------------|
| 1         | F2, F3, uptime/day                                | Route Sanity panel, per provider          |
| 2         | A3, A4, C1, D1, D2, D3, E1, E2, F1, F4, G1, G3    | This page                                 |
| 3         | A1, B1, B2, G2, I1–I6                             | Taiga Witness host — request to Taiga     |
| —         | E6, uptime/60min                                  | Not in service                            |

### 12.2 Markers at a glance

| **Marker**      | **Colour** | **Meaning**                                       |
|-----------------|------------|---------------------------------------------------|
| non-default     | Grey       | Saved value differs from the shipped default.     |
| unsaved         | Teal       | Changed in the browser, not yet saved.            |
| pending restart | Amber      | On disk, not yet in force.                        |
| Disabled        | Red        | Row will never alert.                             |
| ⚠               | Amber      | This value has a known cost.                      |

### 12.3 Who can change what

| **Role**                                                            | **Access** |
|---------------------------------------------------------------------|------------|
| Root                                                                | Full       |
| Administrator, System Administrator, System Dealer, Risk Manager    | Edit       |
| Compliance Officer, Executive                                       | View only  |

Every change is recorded against the user who made it, one entry per
threshold changed.