---
id: task-ai-model
title: "AI Model — operating guide"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
order: 5
source:
  - "Behaviour_Rules_AI_Model_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [ai-model,explanation,inference,model,reasoning]
status: reviewed
version: intel-v3
---

## 1. About This Document

The AI Model tab is the last of the four Behaviour Rules tabs
(Classifier, Detection, Clustering, AI Model). It governs the
Taiga-powered AI Model that writes the plain-English explanations you
see across the platform — the readable rationale attached to a trader’s
risk assessment. This tab does not change how traders are scored; it
controls where those written explanations are produced, what they are
allowed to cost, and how results are reused to keep that cost down.

The page is straightforward, but every figure on it means something, so
this document explains all of them: the usage summary, the routing
matrix, the cost controls, and the explanation cache. Where a setting
has a sensible operating range, that is given too.

## 2. What the AI Model Tab Controls

Throughout the platform, a trader’s risk assessment can be accompanied
by a written, plain-English explanation of why they were flagged and
what it means. The Taiga-powered AI Model produces those explanations.
Because generating them has a cost, this tab exists to keep that under
control on three fronts:

- **Where it is used** — the Routing Matrix decides, per risk level,
  whether the AI Model writes explanations at all, whether it does so
  automatically, and whether it can be asked to on demand.

- **What it may cost** — the Cost Controls cap daily and monthly spend
  and throttle how many explanations are auto-generated per hour, and
  the Usage panel tracks spend against those caps in real time.

- **How results are reused** — the Explanation Cache stores generated
  explanations so an identical one is served from memory instead of
  being paid for again.

## 3. Month-to-Date Usage

The panel across the top is a live summary of this month’s AI Model
activity and spend. Left to right:

| **Figure**     | **What it means**                                                                                                                                   |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| Cost MTD       | What the AI Model has cost so far this month, shown against the monthly limit. Turns colour as it approaches the cap.                               |
| API Calls      | How many times the AI Model has been called this month.                                                                                             |
| Auto-Gen / hr  | How many explanations have been auto-generated in the current hour, against the per-hour cap (Section 5).                                           |
| Cache Hit Rate | The share of requests served from the cache instead of a fresh call — with the raw hits / misses beneath. Higher means more cost saved (Section 6). |
| Remaining      | The monthly budget left. Shown green normally, and red once most of the budget is used.                                                             |

Two more indicators sit alongside: a progress bar and "**X% of monthly
budget used**" give the spend at a glance, and an **API Key** badge
(Section 7) shows green with a tick when the AI Model is connected and
ready, or red when its key is not set.

|                                                                                                                                                                                                                                                                                                                            |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Reading the example.** Cost MTD **$0.002** of a **$1000** limit, **2** calls this month, **0** auto-generations this hour, a **0%** cache hit rate (0 hits / 0 misses — nothing cached yet), and **$1000.00** remaining: an essentially untouched month, well within budget, with the AI Model connected (API Key ✓). |

## 4. Risk-Level Routing Matrix

This is the most important control on the tab: it decides, for each risk
level, how the AI Model is used. The five risk levels (Very Low, Low,
Medium, High, Critical) each have three independent switches:

| **Switch**    | **What turning it on means**                                                                                                                |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Use AI Model  | The master switch — the AI Model may write explanations for traders at this risk level at all. Off means no AI explanations for this level. |
| Auto-Generate | Explanations are produced automatically for traders at this level, without anyone asking — ready and waiting when you look.                 |
| On-Demand     | A user can request an explanation for a trader at this level whenever they want one.                                                        |

### 4.1 The dependency rule

The three switches are not fully independent: turning on
**Auto-Generate** automatically forces **Use AI Model** and
**On-Demand** on as well (this is enforced automatically). The logic is
common sense — you cannot auto-generate explanations without using the
AI Model, and anything generated automatically is certainly available on
demand. So Auto-Generate is effectively the "fullest" setting for a risk
level.

### 4.2 How to use it

The matrix is where coverage is traded against cost. Because
auto-generation is the part that spends money proactively, the usual
pattern is to reserve it for the risk levels that matter most:

- **Auto-Generate on for High and Critical** — the traders you most want
  an immediate, ready-made explanation for.

- **On-Demand only for the lower levels** — the AI Model is available if
  someone wants an explanation, but nothing is generated (or paid for)
  unless asked.

- **Use AI Model off entirely for a level** — if AI explanations add no
  value there.

|                                                                                                                                                                                                                                                                                                                                                   |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Current setting.** On the live screen, all three switches are on for every risk level — the AI Model is used, auto-generates, and is available on demand across the board. That gives the fullest coverage; if spend needed trimming, the first move would be to turn Auto-Generate off for the lower risk levels and let those stay On-Demand. |

## 5. Cost Controls

These are the hard guardrails on spend. They work alongside the routing
matrix: routing decides where the AI Model is used, cost controls cap
what that usage may cost.

### 5.1 Daily Cost Limit

The most the AI Model may cost in a single day. Current value:
**$15.00**. When the day’s spend reaches this cap, the AI Model stops
generating new explanations until the next day, protecting against a
runaway day.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A daily cap is the fast-acting
safety net — it stops a single bad day (a spike in flagged traders, a
misconfiguration) from consuming a large share of the monthly budget
before anyone notices. $15/day is modest and comfortably inside the
monthly limit.</p>
<p><strong>Acceptable range.</strong> Permitted $1–$500 per day. Set it
in proportion to the monthly limit — roughly the monthly cap divided
across the trading days — with a little headroom for busy days. Too low
and explanations stop mid-day; too high and it no longer protects the
month.</p></td>
</tr>
</tbody>
</table>

### 5.2 Monthly Cost Limit

The most the AI Model may cost in a calendar month — the overall budget
the Usage panel tracks against. Current value: **$1000.00**. Once
reached, generation stops for the rest of the month.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> This is the headline budget —
the number that answers "what is the most this feature can cost us".
Everything else (the daily cap, the hourly throttle, the cache) exists
to keep spend comfortably under it.</p>
<p><strong>Acceptable range.</strong> Permitted $1–$15,000 per month.
Set it to whatever the firm is willing to spend on explanations; the
daily cap and cache then keep actual spend well below it. It can also be
left unset if only the daily cap is used.</p></td>
</tr>
</tbody>
</table>

### 5.3 Max Auto-Gen / Hour

A throttle on how many explanations may be **auto-generated** in any one
hour. Current value: **100**. On-demand requests are not throttled by
this — only the automatic ones.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> This smooths spend and load:
even with Auto-Generate on for several risk levels, a sudden burst of
flagged traders cannot trigger an unbounded flood of paid generations in
a short window — they are capped per hour and the rest wait. It is a
rate limit, complementing the daily and monthly cost caps.</p>
<p><strong>Acceptable range.</strong> Permitted 10–1000 per hour. Set it
high enough that normal auto-generation is never starved, but low enough
to blunt a pathological spike. 100/hour suits a typical book; raise it
for a large, active one.</p></td>
</tr>
</tbody>
</table>

## 6. Explanation Cache

The cache is the main cost-saver. When the AI Model writes an
explanation, the result is stored; if the same explanation is needed
again while it is still fresh, it is served from the cache **for free**
instead of being regenerated at cost. The block shows whether the cache
is on, and its two settings, plus the live hit rate.

### 6.1 On / Off

A master switch for caching. Current state: **ON**. With it off, every
explanation is generated fresh (and paid for) every time — rarely
desirable.

### 6.2 TTL (time to live)

How long a cached explanation stays usable before it is considered stale
and regenerated. Current value: **1 hour**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> TTL trades freshness against
savings. A short TTL keeps explanations current with the latest data but
regenerates (and pays) more often; a long TTL saves more but can serve a
slightly dated explanation. One hour is a sensible middle — fresh enough
for risk work, long enough to absorb repeated views of the same
trader.</p>
<p><strong>Acceptable range.</strong> Permitted 5 minutes to 24 hours
(300–86,400 seconds). Minutes if explanations must always reflect the
very latest activity; hours if the underlying assessment changes slowly
and savings matter more.</p></td>
</tr>
</tbody>
</table>

### 6.3 Max Entries

How many explanations the cache holds at once. Current value:
**10,000**. When full, the oldest give way to new ones.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A larger cache holds
explanations for more traders at once, so more requests are served free
— at the cost of a little more memory. Ten thousand entries covers a
large trader population comfortably.</p>
<p><strong>Acceptable range.</strong> Permitted 100–10,000. Size it to
your trader population so the cache can hold an explanation for everyone
you routinely look at; if it is much smaller than your active book, the
hit rate suffers.</p></td>
</tr>
</tbody>
</table>

### 6.4 Cache Hit Rate

The live measure of how well the cache is working — the share of
requests served from cache rather than a fresh call, shown here and in
the Usage panel. **Higher is better**: every hit is a generation the
firm did not pay for. A rate of 0% simply means nothing has been cached
yet (a quiet month).

## 7. The AI Model Connection

For the AI Model to run, Taiga must be connected to its AI Model service
by a credential — an **API key**. The badge at the top of the tab shows
the state: **API Key ✓** (green) when the key is set and the AI Model is
ready, or **API Key Not Set** (red) when it is missing, in which case no
explanations can be generated.

The key is **write-only**: it can be entered but is never displayed back
or returned anywhere, so it cannot leak through the interface. If
explanations stop appearing and the badge is red, the key needs to be
re-entered.

## 8. Tuning — Balancing Coverage and Cost

The tab’s settings pull between two goals: having a ready explanation
wherever it is useful, and not overspending. They combine cleanly:

- **Routing sets the reach.** Auto-Generate for the levels you want
  explanations ready for (typically High and Critical); On-Demand for
  the rest; off where it adds nothing.

- **The cache does the saving.** Keep it on, size Max Entries to your
  book, and set a TTL that matches how fast your assessments move. A
  healthy hit rate is what keeps real spend far below the budget.

- **The cost caps are the backstop.** Daily and monthly limits guarantee
  an absolute ceiling; the hourly throttle blunts spikes. They should
  rarely be hit if routing and caching are set sensibly — they are there
  for the day something goes wrong.

|                                                                                                                                                                                                                                                                                                                                                                    |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The safe default is generous coverage with firm caps.** Because the cache and the cost limits bound spend regardless, it is reasonable to route broadly (as the current all-on setting does) and let caching and the budget ceiling keep the cost small. If spend ever climbs, tighten routing (Auto-Generate off for low risk levels) before touching the caps. |

## 9. Reset, Export and Change Tracking

Each block — routing, cost controls, and caching — can be edited and
returned to its shipped factory value, individually or all at once via
**Reset to Factory**. **Export Factory Defaults** and **Export Current
Settings** capture the baseline and the live configuration for review,
and the **Change History** tab records changes over time. As elsewhere
in Behaviour Rules, no change is unattributable or irreversible.

## 10. How This Connects to the Rest of the Platform

- **The explanations themselves** — appear wherever a trader’s risk
  assessment is shown (the risk decision and trader surfaces). This tab
  decides whether those explanations are AI-written, ready in advance,
  or produced on request.

- **The other Behaviour Rules tabs** — Classifier, Detection and
  Clustering decide what a trader is and how risky; the AI Model turns
  those findings into readable prose. It is the last step, not part of
  the scoring.

- **Cost governance** — the budget and usage figures here are the firm’s
  handle on what the explanation feature costs, tracked live against the
  caps.

## 11. Quick Reference — Settings

| **Setting**            | **Current**     | **Permitted**      | **What it controls**                                                       |
|------------------------|-----------------|--------------------|----------------------------------------------------------------------------|
| Routing: Use AI Model  | On (all levels) | On / Off per level | Whether the AI Model writes explanations for a risk level.                 |
| Routing: Auto-Generate | On (all levels) | On / Off per level | Whether explanations are produced automatically (forces the other two on). |
| Routing: On-Demand     | On (all levels) | On / Off per level | Whether explanations can be requested on demand.                           |
| Daily Cost Limit       | $15.00         | $1–$500          | Hard cap on AI Model spend per day.                                        |
| Monthly Cost Limit     | $1000.00       | $1–$15,000       | Hard cap on AI Model spend per month (the budget).                         |
| Max Auto-Gen / Hour    | 100             | 10–1000            | Throttle on automatic generations per hour.                                |
| Cache                  | ON              | On / Off           | Reuse explanations instead of paying to regenerate.                        |
| Cache TTL              | 1 hour          | 5 min–24 h         | How long a cached explanation stays fresh.                                 |
| Cache Max Entries      | 10,000          | 100–10,000         | How many explanations the cache holds.                                     |

*End of document. AI Model tab — four of four in the Behaviour Rules set
(Classifier · Detection · Clustering · AI Model).*
