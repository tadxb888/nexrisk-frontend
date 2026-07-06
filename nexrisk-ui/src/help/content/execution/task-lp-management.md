---
id: task-lp-management
title: "Liquidity Providers — operating guide"
type: task
domain: execution
module: lp_admin
minLevel: VIEW
route: /liquidity-providers
source:
  - "Liquidity_Providers_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [lp, liquidity-provider, fix, session, credentials, connect, quarantine, health, state-machine]
status: reviewed
version: exec-v3
---

## 1. About This Reference

This reference covers the Liquidity Providers page in full, and then
steps beyond it. Adding a provider is not only a matter of filling in a
form: a liquidity provider is an external FIX counterparty, and bringing
one online involves network access, encryption, credentials, a data
dictionary, and — crucially — conformance testing before the connection
can be trusted with real hedges. This document treats both halves: what
every field on the page does, and what has to be true outside the page
for a provider to work.

It is written for the people who onboard and operate provider
connections. It assumes familiarity with trading but explains the
FIX-protocol concepts as it goes, so it is usable whether or not you
have wired up a FIX session before. FIX-protocol details here are
standard FIX 4.4 concepts, described in vendor-neutral terms.

## 2. What a Provider Connection Is

Each liquidity provider is reached over FIX — the financial-industry
messaging protocol — as one or two sessions: a Trading session for
orders and executions, and (where the provider streams prices to the
platform) a Market Data session for quotes. The Liquidity Providers page
manages the whole lifecycle of those sessions:

- **Add / edit** — define the sessions, their network endpoints and
  identity, and the trading configuration.

- **Set credentials** — supply the logon secrets separately from the
  rest of the config.

- **Test** — a quick connectivity check that the sessions can log on.

- **Start / stop** — bring the connection up or take it down.

- **Monitor** — live health, latency, message counts, and warnings, with
  a detailed view per provider.

Providers already integrated include TraderEvolution and LMAX, among
other configured integrations. The page treats each as a provider type
so the right fields and behaviour apply.

## 3. FIX in Brief — the Concepts Behind the Fields

A few FIX ideas recur throughout the page. Understanding them makes
every field self-explanatory.

### 3.1 Sessions, and the two-session model

A FIX **session** is a persistent, sequenced, authenticated connection
between two parties. Most providers separate **market data** (price
streaming) from **trading** (orders and fills) into two sessions,
because the two have very different message rates and reliability needs.
The platform models this exactly: a Trading session that every provider
has, and an optional Market Data session for providers that also stream
prices.

### 3.2 Session identity

Each side of a session is named. **SenderCompID** identifies you (the
platform) to the provider; **TargetCompID** identifies the provider to
you. Where a single connection carries more than one logical session, a
**sub-ID** distinguishes them — for example one for market data and one
for trading. These identifiers are assigned by the provider and must
match exactly, character for character.

### 3.3 Sequence numbers and reset

Every FIX message carries a sequence number so neither side loses a
message silently. On logon the platform typically requests a sequence
reset so the session starts clean; if a gap is detected mid-session, the
protocol recovers it by resending or gap-filling. This is why "reset on
logon" behaviour matters and why a mismatched sequence state can block a
logon.

### 3.4 Heartbeat

The two sides exchange heartbeats at an agreed interval to prove the
link is alive; if a heartbeat is missed, a test request is sent, and
continued silence tears the session down for reconnection. The heartbeat
interval is a configured value.

### 3.5 The data dictionary

FIX has a standard vocabulary, but most providers extend it with custom
fields. A data dictionary tells the platform how to read and validate
that provider’s particular variant. A provider using non-standard or
custom tags needs its dictionary configured; a standard provider may
not.

### 3.6 The message families

Across the two sessions, a provider integration exercises the usual FIX
message groups: session control (logon, logout, heartbeat, test request,
resend, sequence reset); market data (symbol discovery, subscribe for
snapshot and updates, snapshots, incremental updates, and subscription
rejects); and order flow (new order, execution reports and fills,
cancels and cancel-rejects, trade capture reports, and position
requests). The conformance checklist in Section 9 walks these.

## 4. Before You Add a Provider — External Prerequisites

These must be arranged outside the page. The form cannot succeed until
they are in place, and most first-connection failures trace back to one
of them.

### 4.1 Network access and IP whitelisting

FIX connectivity is **mutual** and locked down by IP. Two things must be
true: the provider must **whitelist the platform’s outbound (egress) IP
addresses** so your logon is accepted, and your own network must **allow
outbound connections to every IP address the provider publishes** for
the environment you are using. Providers commonly publish more than one
IP per environment for redundancy — all of them must be allowed, not
just the first.

|                                                                                                                                                                                                                                                                                                                                                  |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Pitfall — resolve DNS on every connection.** Providers load-balance and fail over behind a DNS name. The connection host should be re-resolved on each connection attempt rather than pinned to one cached address, or a failover will look like an outage. If a TLS tunnel sits in front (see 4.2), enable its "resolve each attempt" option. |

### 4.2 Encryption (TLS)

FIX sessions to a provider run over TLS. Where the platform’s FIX layer
does not terminate TLS itself, a tunnel (for example stunnel) provides
the encryption between the platform and the provider endpoint. The
page’s SSL toggle records that a session is encrypted; the actual
tunnel, certificates and DNS-resolution behaviour are arranged at the
network layer.

### 4.3 Time synchronisation

FIX timestamps and sequencing depend on an accurate clock. The host
running the connection should be synchronised to UTC via NTP (or PTP
where available). A drifting clock causes timestamp and sequence
problems that are hard to diagnose after the fact.

### 4.4 Credentials and identity from the provider

The provider assigns the connection’s identity and secrets: the
SenderCompID and TargetCompID (and any sub-IDs), a username and password
for logon, the account, and — for providers that use a retail/partner
account model — an account-type or brand code supplied as a custom logon
field. Collect all of these before you start.

### 4.5 Data dictionary

Obtain the provider’s FIX specification and, if it uses custom tags, its
data dictionary, so the platform can be pointed at the right dictionary
for that provider. A standard-vanilla provider may not need one; most
real providers do.

### 4.6 Environments — sandbox first

Providers offer separate sandbox (test) and production environments, on
different hosts and IPs. Always onboard and conformance-test in the
sandbox, and only repoint to production once the sandbox connection has
passed (Section 9).

## 5. The Liquidity Providers Page — Layout

The page shows each configured provider as a card in a grid, with an
"Add LP" button (available to users with provider-admin edit rights). If
none are configured, it prompts you to add your first. Each card
carries:

- **Name and status** — the display name and a colour-coded connection
  state (Section 10.2).

- **Session dots** — a small indicator for the Trading session and,
  where present, the Market Data session.

- **Health line** — latency and uptime when the provider is running, or
  a "Credentials not configured" warning when it cannot start.

- **Actions** — Start, Stop, Test, Set Credentials, Edit, and Delete
  (Delete is available only when the provider is stopped). Clicking the
  card opens the detailed view (Section 11).

## 6. Adding or Editing a Provider — Every Field

The Add LP button (and Edit on a card) opens the provider form. It has
four sections.

### 6.1 Identity

| **Field**     | **What it is**                                                                                                                                                                                       |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| LP ID         | A short internal identifier (at least three characters) used everywhere else in the platform to refer to this provider, for example in Symbol Mapping and hedge routing.                             |
| Display Name  | The human-readable name shown on the card and across the app.                                                                                                                                        |
| Provider Type | The integration to use (for example TraderEvolution, LMAX, or another configured provider). It determines which fields and behaviours apply — for instance whether a Market Data session is offered. |
| Enabled       | Whether the provider is enabled. Disabled providers are not started or polled.                                                                                                                       |

### 6.2 Trading Session

The always-present session for orders and executions. Each field maps
directly to a FIX concept:

| **Field**     | **FIX meaning**                                                                   |
|---------------|-----------------------------------------------------------------------------------|
| Host          | The provider’s trading endpoint hostname (resolved per 4.1).                      |
| Port          | The trading endpoint port.                                                        |
| SenderCompID  | Your identity to the provider on this session (assigned by the provider).         |
| TargetCompID  | The provider’s identity to you on this session.                                   |
| FIX Version   | The FIX protocol version for the session (FIX 4.4).                               |
| Heartbeat (s) | The heartbeat interval in seconds — how often each side proves the link is alive. |
| Reconnect (s) | How long to wait between reconnection attempts after a drop.                      |
| SSL           | Marks the session as running over TLS (encryption arranged per 4.2).              |

### 6.3 Market Data Session

Shown for providers that stream prices. It is a second, independent
session with its own identity, so market data and trading can be brought
up and diagnosed separately:

| **Field**         | **What it is**                                                                  |
|-------------------|---------------------------------------------------------------------------------|
| MD Host · MD Port | The market-data endpoint (often the same host as trading, on a different port). |
| MD SenderCompID   | Your identity to the provider on the market-data session.                       |
| MD TargetCompID   | The provider’s identity on the market-data session.                             |

### 6.4 Trading Config

| **Field**         | **What it is**                                                                  |
|-------------------|---------------------------------------------------------------------------------|
| Account           | The account at the provider that orders are placed on.                          |
| Security Exchange | An optional exchange qualifier sent with orders where the provider requires it. |
| Default TIF       | The default time-in-force for orders — GTC, IOC, DAY or FOK.                    |
| MD Depth          | The order-book depth to request on market-data subscriptions (1–20).            |

### 6.5 Saving

The button reads **Create LP** when adding and **Save Changes** when
editing. It stays disabled until the essentials are present: an LP ID of
at least three characters, a display name, and the trading session’s
host, port, SenderCompID and TargetCompID. Saving stores the
configuration but **not** the credentials — those are set separately
(Section 7).

## 7. Credentials

Credentials are handled apart from the rest of the configuration,
through the Set Credentials action, so the secrets are never mixed into
ordinary config edits.

- **Password (FIX logon)** — the logon password, required. A show/hide
  control lets you check it as you type.

- **Username** — for providers that require it, a logon username (a
  custom logon field).

- **Brand / account-type code** — for providers using a retail/partner
  account model, the account-type or brand code supplied as a custom
  logon field.

Credentials are stored encrypted (AES-256) and are never returned by the
platform once set — you can replace them but not read them back. A
provider cannot be started until its credentials are configured; until
then the card shows "Credentials not configured" and Start is disabled.

## 8. Testing the Connection

The Test action runs a **Connection Test**: it attempts to log on each
configured session and reports the result. You get an overall **PASS**
or **FAIL**, and per-session detail — whether the Trading and Market
Data sessions connected, the logon time in milliseconds, and the
server’s FIX version — or the error if a session failed (a common one
being "Credentials not configured").

|                                                                                                                                                                                                                                                                                                                |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **This is a smoke test, not conformance.** A PASS here means the sessions can log on — network, TLS, identity and credentials are correct. It does not prove the provider behaves correctly across the full message set. Before trusting a new provider with hedges, run the conformance testing in Section 9. |

## 9. Conformance Testing a New Provider

Conformance testing is the real gate before a provider goes live. It
exercises every message flow the platform relies on, in the provider’s
sandbox, and confirms the provider behaves as its specification claims.
Only after a clean pass should you repoint the provider to production
and validate again there.

### 9.1 Session layer

- Logon succeeds, with a sequence reset, and a logon confirmation is
  returned.

- Heartbeats flow at the agreed interval; a test request is answered.

- Logout is clean from both sides.

- A deliberate sequence gap is recovered by resend / gap-fill.

- The session reconnects automatically after a dropped connection.

### 9.2 Market data

- Symbol discovery returns the instruments the account may access.

- A subscription for snapshot-plus-updates returns a correct snapshot,
  then live incremental updates.

- The requested book depth is honoured.

- Unsubscribe stops the stream.

- An unfulfillable subscription returns a proper reject, and the
  platform handles it gracefully.

### 9.3 Order flow

- A market order and a limit order are accepted and produce execution
  reports.

- Full and partial fills are reported correctly.

- An order cancel works; an invalid cancel returns a cancel-reject.

- Open and close (position-effect) behave as specified.

- Trade capture reports and position requests return the expected data.

### 9.4 Data integrity

- **Symbol mapping** — the provider’s symbol names map correctly to the
  platform’s symbols. Configure these on the Symbol Mapping page; an
  unmapped symbol will drop ticks and fail hedges.

- **Price and volume scaling** — the provider’s price and volume
  conventions match what the mapping expects, so quotes and sizes are
  not off by a factor.

- **Timestamps** — times are UTC and sensible (confirming clock sync
  from 4.3).

|                                                                                                                                                                                                                                                                                                               |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Only promote to production after a clean sandbox pass.** Repoint the host, port and IPs to production, re-run the connection test and a focused subset of the conformance checks there, and confirm symbol mappings and scaling again — production instrument sets and identifiers can differ from sandbox. |

## 10. Starting, Stopping, Health and States

### 10.1 Start and stop

Start brings the provider’s sessions up; it is disabled until
credentials are set. Stop takes them down. A provider must be stopped
before it can be deleted, so a running connection cannot be removed by
accident.

### 10.2 Provider states

| **State**              | **Colour** | **Meaning**                                                       |
|------------------------|------------|-------------------------------------------------------------------|
| Connected              | Green      | Sessions up and healthy.                                          |
| Connecting             | Amber      | Logon in progress.                                                |
| Degraded               | Amber      | Up but impaired (for example one session down, or high latency).  |
| Disconnected / Stopped | Grey       | Not connected — either taken down or never started.               |
| Quarantined            | Red        | Isolated after repeated failures, to protect the platform.        |
| Session Error          | Red        | A session-level fault (bad identity, credentials, or sequencing). |

### 10.3 Session states

Each session (Trading and Market Data) has its own state, shown as a
dot: Disconnected, Connecting, Logged On, Reconnecting, or Session
Error. A provider can be "Degraded" overall while one session is Logged
On and the other is Reconnecting — the dots tell you which.

### 10.4 Health

When a provider is running, the platform polls its health and reports an
overall status — Healthy, Degraded, Unhealthy or Unknown — alongside
live figures:

- **Trading session** — latency, and messages sent and received.

- **Market data session** — active subscriptions and updates per second.

- **Totals** — instruments loaded, open positions, active orders, and
  uptime.

- **Warnings** — any health warnings the platform has raised, shown on
  the card and in the overview.

## 11. The Detail View

Clicking a provider opens a detailed view with tabs:

| **Tab**       | **Shows**                                                                                                                                                                                                                          |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Overview      | Health summary, plus the Trading and Market Data session panels (state, host, identity, latency, message counts, subscriptions) and a configuration summary (account, default TIF, exchange, credentials status, created/updated). |
| Instruments   | The instruments loaded from the provider (symbol, identifiers, type, route, description).                                                                                                                                          |
| Positions     | Open positions held at the provider.                                                                                                                                                                                               |
| Orders        | Active orders at the provider.                                                                                                                                                                                                     |
| Routes        | The provider’s available trade routes.                                                                                                                                                                                             |
| Configuration | The full stored configuration for the provider.                                                                                                                                                                                    |
| Audit Log     | A history of changes — who changed what and when.                                                                                                                                                                                  |

Instruments, Positions, Orders and Routes are live views of the
provider; Overview, Configuration and Audit Log describe how it is set
up and how it has changed.

## 12. How This Page Connects to Others

- **Symbol Mapping** — a provider’s symbol names must be mapped to
  platform symbols there; unmapped symbols drop ticks and fail hedges.
  This is a required step in onboarding (9.4).

- **Price Rules** — a price feed names its source provider; a provider
  that streams market data feeds the repricing pipeline.

- **Route Sanity** — the health of these providers is what Route Sanity
  monitors, and what the automated route-sanity gate acts on.

- **Hedging / Coverage** — hedge orders route to the provider configured
  here; the account and trade config set here are what those orders use.

- **Execution Report** — the order flow to this provider appears there,
  order by order, for confirmation and investigation.

## 13. Pitfalls and Notes

- **Whitelist both directions, all IPs.** The provider whitelists you;
  you allow every provider IP, not just one.

- **Re-resolve DNS each connect.** Pinning a cached IP breaks failover.

- **Sync the clock to UTC.** Drift causes timestamp and sequence faults.

- **Identity must match exactly.** SenderCompID / TargetCompID / sub-IDs
  are case- and character-exact.

- **Credentials before Start.** Start is disabled until they are set;
  they are stored encrypted and never returned.

- **A passing Test is not conformance.** Logon success is necessary but
  not sufficient — run Section 9.

- **Map symbols before going live.** And confirm price/volume scaling,
  or quotes and sizes will be wrong.

- **Stop before Delete.** A running provider cannot be deleted.

## 14. Quick Reference

### 14.1 FIX identity and session fields

| **Term**        | **Meaning**                                                               |
|-----------------|---------------------------------------------------------------------------|
| SenderCompID    | Your identity to the provider on a session.                               |
| TargetCompID    | The provider’s identity to you on a session.                              |
| Sub-ID          | Distinguishes logical sessions (e.g. market data vs trading) on one link. |
| Heartbeat       | Interval at which each side proves the link is alive.                     |
| Sequence reset  | Clean restart of message numbering, usually requested on logon.           |
| Data dictionary | Defines the provider’s FIX variant and custom fields.                     |

### 14.2 Onboarding at a glance

| **Step**                                                               | **Where**                      |
|------------------------------------------------------------------------|--------------------------------|
| Arrange IP whitelisting, TLS, clock sync, credentials, data dictionary | Network / provider (Section 4) |
| Add the provider and both sessions; set trading config                 | This page (Section 6)          |
| Set credentials                                                        | This page (Section 7)          |
| Test connectivity (logon smoke test)                                   | This page (Section 8)          |
| Run conformance tests in sandbox                                       | Section 9                      |
| Map symbols; confirm scaling                                           | Symbol Mapping (9.4)           |
| Repoint to production; re-validate; Start                              | This page (Sections 9–10)      |

*End of reference.*
