---
id: task-detection
title: "Detection — operating guide"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
order: 3
source:
  - "Behaviour_Rules_Detection_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [detection,escalation,ladder,risk-score,anomaly,thresholds]
status: reviewed
version: intel-v3
---

## 1. About This Document

The Detection tab governs how a trader’s behaviour is turned from a raw
stream of trades into a graded, actionable signal: how the data pipeline
observes them, how a risk score becomes a severity label, when the
system escalates automatically, and — most importantly — exactly how
much evidence is required to flag each archetype at each level of
action. It is the second of the four Behaviour Rules tabs (Classifier,
Detection, Clustering, AI Model); this document covers Detection in
full.

As with the Classifier document, this is written for close scrutiny by
brokers and risk managers, and every control receives the same
three-part treatment: **what it does**, **why it is set at its current
value**, and **what range would normally be acceptable** — with the
platform’s enforced limits kept separate from reasoned operating bands.

There are four blocks: Risk Scoring, Pipeline Processing,
Auto-Escalation, and the Behaviour Threshold Ladders. Each is taken in
turn, after a short note on how the Detection tab relates to the
Classifier.

## 2. How Detection Relates to the Classifier

The two tabs are two halves of one system, and keeping them distinct
avoids confusion under review:

- **The Classifier** is the **scoring model**: it combines behaviour,
  anomaly and persistence into a single 0–100 risk score and maps that
  score to an action through its own thresholds.

- **Detection** is the **detection and grading layer**: it decides how
  the pipeline observes a trader, how the score is labelled by severity,
  when to auto-escalate, and how much confidence, duration and volume a
  specific archetype pattern must show to be flagged at each action
  level (the ladders).

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Two things here mirror the Classifier — keep them aligned.** The per-archetype severity weights in Risk Scoring hold the same values as the Classifier’s Risk Severity Multipliers but are stored in a separate configuration section, so changing one does not change the other. And Detection’s risk-level bands (Section 4.2) and the Classifier’s action thresholds both slice the same 0–100 score — for different purposes. Where they overlap, keep them consistent so a "CRITICAL" severity broadly corresponds to an "Escalate" action. |

## 3. Risk Scoring

The Risk Scoring block holds two distinct things: the per-archetype
severity weights, and the boundaries that turn the numeric risk score
into a severity label.

### 3.1 Severity weights (per archetype)

One weight per archetype, 0.10–1.00, scaling how much of an archetype’s
score counts. Current values: **EA 0.30**, **Scalper 0.50**, **Arbitrage
1.00**, **Rebate 0.80**, **News 0.40** — the same set as the
Classifier’s multipliers.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> The ordering encodes how much
each behaviour actually costs the firm. Arbitrage flow is the classic
broker toxin and takes the full weight; rebate abuse is a steady drain
just below; scalping and news trading are real but more often
legitimate, so they are damped; and being automated (EA) is not, on its
own, a threat, so it is damped hardest. The same raw pattern therefore
means very different things depending on which archetype produced
it.</p>
<p><strong>Acceptable range.</strong> Each is bounded 0.10–1.00. These
are an expression of the firm’s risk appetite rather than a technical
constant, so "acceptable" is whatever the firm can justify — provided
the ordering tracks genuine toxicity (arbitrage and rebate abuse high;
benign automation low) and nothing is driven to the 0.10 floor unless
the firm truly regards it as almost harmless.</p></td>
</tr>
</tbody>
</table>

### 3.2 Risk-level bands (LOW / MEDIUM / HIGH / CRITICAL)

Three ascending boundaries turn the 0–100 risk score into a severity
**label**. Current values: **LOW ≤ 25**, **MEDIUM ≤ 50**, **HIGH ≤ 75**,
and **CRITICAL** above 75.

| **Label** | **Score** | **Reading**                  |
|-----------|-----------|------------------------------|
| LOW       | 0 – 25    | Little concern.              |
| MEDIUM    | 26 – 50   | Worth noting.                |
| HIGH      | 51 – 75   | Materially risky.            |
| CRITICAL  | above 75  | The most concerning traders. |

This is the severity **label** used for display and grouping — distinct
from the Classifier’s **action** thresholds (20/40/60/80), which decide
what is **done**. Both slice the same score; one names how bad it is,
the other what to do about it.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Even quartile boundaries at
25/50/75 give four equally-wide, immediately-interpretable severity
bands across the 0–100 range — the simplest defensible split, and one
that lines up naturally with the four action levels. The boundaries must
ascend so the bands never cross.</p>
<p><strong>Acceptable range.</strong> Each boundary may sit anywhere in
0–100 provided low &lt; medium &lt; high. Moving them shifts how many
traders fall into each label: lowering them inflates the HIGH/CRITICAL
population (more visible concern, more noise), raising them reserves
those labels for extreme scores. Keep the top band roughly in step with
the Escalate action threshold so severity and action agree.</p></td>
</tr>
</tbody>
</table>

## 4. Pipeline Processing

Three settings control how the detection pipeline observes traders —
when it starts, how often it looks, and over what window.

### 4.1 Min Trades Gate

The minimum number of trades before the detection pipeline begins
processing a trader. Current value: **5**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> This is the observation layer’s
own gate, and it sits deliberately low — the pipeline begins watching
and snapshotting a trader after only a handful of trades, well before
the Classifier’s global gate (20) commits to an actual classification.
Observing early and classifying later means the system has history in
hand the moment a trader crosses the classification gate, rather than
starting from scratch then.</p>
<p><strong>Acceptable range.</strong> Permitted 5–500. A low value
(5–20) is appropriate here because early observation is cheap and
useful; it should generally sit at or below the Classifier’s global
gate. Raising it high defeats the purpose of an early-observation
layer.</p></td>
</tr>
</tbody>
</table>

### 4.2 Snapshot Interval

How often the pipeline captures a snapshot of a trader’s state. Current
value: **60 seconds**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Sixty seconds balances freshness
against load: it is frequent enough to catch a fast-developing pattern
within a minute, but not so frequent that the system is re-snapshotting
constantly. For behaviour that unfolds over minutes to hours, once a
minute is ample resolution.</p>
<p><strong>Acceptable range.</strong> Permitted 10–300 seconds. A
sensible band is roughly 30–120 s. Shorter intervals give fresher
detection at higher processing cost; longer intervals are cheaper but
let a fast pattern go unnoticed for longer.</p></td>
</tr>
</tbody>
</table>

### 4.3 Classification Window

The lookback window over which behaviour is assessed. Current value:
**15 minutes** (options: 5m, 15m, 1h, 1d).

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Fifteen minutes is recent enough
to reflect what a trader is doing now, and long enough to contain a
meaningful run of trades to characterise the pattern. It suits the
intraday, fast-turnover behaviours the archetypes target (scalping,
arbitrage, EA activity), which reveal themselves over minutes rather
than days.</p>
<p><strong>Acceptable range.</strong> The choices are 5m, 15m, 1h and
1d. Shorter windows (5–15m) track fast, current behaviour and react
quickly but can miss slower patterns; longer windows (1h–1d) capture
slower or intermittent behaviour but are slower to reflect a change.
Match the window to the behaviours that matter most — fast archetypes
favour a short window.</p></td>
</tr>
</tbody>
</table>

## 5. Auto-Escalation

Auto-Escalation is a hard override on top of the graded ladders: when a
trader’s risk score exceeds a set threshold, the system escalates them
automatically rather than waiting for the ladder to progress. It has two
settings: an on/off **Status** (currently **ON**) and a **Risk Score
Threshold** (currently **90**).

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A threshold of 90 out of 100 is
a very high bar — only the most extreme, near-certain cases trip it.
That is the point: automatic action should be reserved for scores so
high that waiting for manual review or ladder progression would be
negligent, while everything below still flows through the normal graded
process. Enabling it ensures the worst cases surface immediately.</p>
<p><strong>Acceptable range.</strong> Permitted 70.0–100.0. A defensible
band is roughly 80–95: below ~80 automatic escalation starts firing on
merely-high (not extreme) traders; at the very top it fires almost
never. The higher the threshold, the more conservative.</p></td>
</tr>
</tbody>
</table>

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Escalate means surface, not enforce.** Auto-escalation raises a trader’s visibility — it pushes the case up for urgent attention and review. It is not an automatic trading action: it does not freeze, reject or reroute on its own. That keeps it consistent with the platform’s human-in-the-loop stance, where consequential actions on a client remain a person’s decision. It is nonetheless the one place on this tab where the system acts on its own, so its threshold deserves deliberate sign-off. |

## 6. Behaviour Threshold Ladders

The ladders are the heart of the Detection tab — the per-archetype
definition of how much evidence is needed to flag a trader at each level
of action. Every archetype (EA, Scalper, Arbitrage, Rebate, News) has
its own ladder of four levels, and each level sets three requirements.

### 6.1 The structure

Each level — **MONITOR**, **WARN**, **RESTRICT**, **ESCALATE** —
requires three things to be met together:

- **Confidence** — how sure the detector is that the trader matches this
  archetype (0.40–1.00).

- **Duration** — how long the pattern must have been observed (30
  seconds to 24 hours).

- **Min trades** — how many trades the assessment must rest on (5–2000).

To be flagged at a level, a trader must clear all three of that level’s
requirements. A high confidence on too few trades, or over too short a
time, does not qualify — the three guard against each other.

### 6.2 The ascending rule

Confidence, duration and trades must all **increase at each level** —
the platform enforces it. Each rung up the ladder therefore demands more
certainty, a longer-established pattern, and more evidence. MONITOR is a
low bar to start watching; ESCALATE is reserved for overwhelming,
sustained, high-volume evidence.

### 6.3 Reading a ladder — the EA example

The EA ladder, as currently set, shows the progression clearly:

| **Level** | **Confidence** | **Duration** | **Min trades** | **Meaning**                                  |
|-----------|----------------|--------------|----------------|----------------------------------------------|
| MONITOR   | 70%            | 5m           | 30             | Reasonable suspicion — begin watching.       |
| WARN      | 80%            | 10m          | 75             | A firmer, longer-observed pattern.           |
| RESTRICT  | 85%            | 15m          | 100            | Strong, sustained evidence.                  |
| ESCALATE  | 95%            | 30m          | 200            | Near-certain, well-established, high-volume. |

Each archetype has its own ladder, so the evidence bar can differ by
behaviour — a pattern that is dangerous and easy to confirm can be given
a lower bar, while one that is easy to mistake for legitimate trading
can be given a higher one.

### 6.4 Acceptable ranges

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> The EA ladder’s shape is the
model to follow: a modest confidence and short duration to start
monitoring, rising to a stringent confidence and long, high-volume
requirement to escalate. Requiring 95% confidence, half an hour, and 200
trades before the top action is exactly the kind of conservatism that
protects against acting on a false positive.</p>
<p><strong>Acceptable range.</strong> Per field: confidence 0.40–1.00
(typically ~0.65–0.75 at MONITOR rising to ~0.90–0.98 at ESCALATE);
duration 30 s–24 h (minutes at the bottom, tens of minutes to hours at
the top); trades 5–2000 (tens at the bottom, low hundreds at the top).
The absolute values are a policy choice, but the ascending shape is
mandatory and the top rung should be demanding.</p></td>
</tr>
</tbody>
</table>

## 7. How It Fits Together — A Worked Example

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>A trader is showing EA-like regularity. After <strong>5
trades</strong> the detection pipeline begins observing them (Min Trades
Gate), snapshotting every <strong>60 s</strong> over a
<strong>15-minute</strong> window.</p>
<p>At <strong>30 trades</strong> over <strong>6 minutes</strong> with EA
confidence <strong>72%</strong>, they clear the EA
<strong>MONITOR</strong> rung (70% / 5m / 30) — the desk starts
watching.</p>
<p>The pattern holds; by <strong>110 trades</strong> over <strong>16
minutes</strong> at <strong>86%</strong> confidence they have climbed
past WARN to <strong>RESTRICT</strong> (85% / 15m / 100).</p>
<p>Separately, their composite risk score reaches <strong>92</strong>.
That is above the <strong>auto-escalation threshold of 90</strong>, so
they are <strong>escalated immediately</strong> — surfaced for urgent
human review — without needing to complete the ESCALATE rung (95% / 30m
/ 200). The score label reads <strong>CRITICAL</strong> (above
75).</p></td>
</tr>
</tbody>
</table>

The example shows the two routes to the top: the graded ladder
(accumulating confidence, duration and trades) and the auto-escalation
override (an extreme score short-circuiting the climb). Both exist so
that a slow, ambiguous case is handled carefully while an extreme one is
not made to wait.

## 8. Tuning Guidance — Conservative vs Aggressive

As on the Classifier tab, every dial trades false positives against
false negatives. The direction each moves that balance:

| **Setting**                           | **More conservative (fewer flags)** | **More aggressive (more flags)** |
|---------------------------------------|-------------------------------------|----------------------------------|
| Severity weights                      | Lower (damp the archetype)          | Higher (toward 1.00)             |
| Risk-level bands                      | Higher (reserve HIGH/CRITICAL)      | Lower (inflate them)             |
| Min Trades Gate                       | Higher (observe later)              | Lower (observe sooner)           |
| Snapshot Interval                     | Longer (staler, cheaper)            | Shorter (fresher, costlier)      |
| Classification Window                 | Longer (slower to react)            | Shorter (reacts to recent)       |
| Auto-escalation threshold             | Higher (rarely auto-escalates)      | Lower (auto-escalates sooner)    |
| Ladder confidence / duration / trades | Higher (demand more evidence)       | Lower (flag on less)             |

|                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The shipped defaults are deliberately cautious at the top end.** An early, cheap observation gate; even severity bands; a very high (90) auto-escalation bar; and ladders that demand near-certainty, long observation and high volume before the most severe action — together these bias the Detection layer toward acting only on strong, sustained evidence. That is the appropriate default for a control that affects how clients are handled. |

## 9. Reset, Export and Change Tracking

Every block — Risk Scoring, Pipeline Processing, Auto-Escalation, and
each archetype’s ladder — can be returned to its shipped factory value
individually, or all at once via **Reset to Factory** (with
confirmation). The page shows how far the live configuration has drifted
from factory, and **Export Factory Defaults** and **Export Current
Settings** capture the baseline and the live policy for review. The
**Change History** tab records changes over time. No tuning is
unattributable or irreversible.

## 10. How This Connects to the Rest of the Platform

- **The Classifier tab** — supplies the composite risk score the
  Detection bands, ladders and auto-escalation act on; the two share
  severity weights (keep them aligned) and complementary banding
  (severity vs action).

- **The Risk Charter** — the archetype and severity that Detection
  grades feed the behaviour axis and posture of the Charter’s matrix.

- **Risk-monitoring surfaces** — the severity label and any
  auto-escalation surface on "Who Is My Risk" and the trader views,
  where flagged traders are actioned by a person.

- **The other tabs** — Clustering groups traders into emergent
  archetypes; the AI Model produces the explanations. Detection is the
  grading layer between the raw signals and those surfaces.

## 11. Quick Reference — All Settings

Current value, the platform’s enforced range, a reasoned operating band,
and the effect of increasing each setting.

| **Setting**                   | **Current** | **Permitted** | **Operating band** | **Increasing it…**                      |
|-------------------------------|-------------|---------------|--------------------|-----------------------------------------|
| Severity: Arbitrage           | 1.00        | 0.10–1.00     | high               | More of its score counts                |
| Severity: Rebate              | 0.80        | 0.10–1.00     | high               | More of its score counts                |
| Severity: Scalper             | 0.50        | 0.10–1.00     | mid                | More of its score counts                |
| Severity: News                | 0.40        | 0.10–1.00     | low-mid            | More of its score counts                |
| Severity: EA                  | 0.30        | 0.10–1.00     | low                | More of its score counts                |
| LOW band max                  | 25          | 0–100         | ~25                | Widens LOW, shrinks the rest            |
| MEDIUM band max               | 50          | 0–100         | ~50                | Widens MEDIUM                           |
| HIGH band max                 | 75          | 0–100         | ~75                | Reserves CRITICAL for higher scores     |
| Min Trades Gate               | 5           | 5–500         | 5–20               | Observes later                          |
| Snapshot Interval             | 60 s        | 10–300 s      | 30–120 s           | Fresher vs cheaper (lower = fresher)    |
| Classification Window         | 15m         | 5m/15m/1h/1d  | 5–15m              | Slower to react, captures more          |
| Auto-escalation status        | ON          | ON / OFF      | —                  | On surfaces extreme cases automatically |
| Auto-escalation threshold     | 90          | 70–100        | 80–95              | Auto-escalates less often               |
| Ladder confidence (per level) | 70–95%      | 0.40–1.00     | rising             | Demands more certainty                  |
| Ladder duration (per level)   | 5–30m       | 30 s–24 h     | rising             | Demands a longer pattern                |
| Ladder min-trades (per level) | 30–200      | 5–2000        | rising             | Demands more evidence                   |

*End of document. Detection tab — two of four in the Behaviour Rules set
(Classifier · Detection · Clustering · AI Model).*
