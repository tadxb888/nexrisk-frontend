---
id: task-classifier
title: "Classifier — operating guide"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
order: 2
source:
  - "Behaviour_Rules_Classifier_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [classifier,behaviour,detector,weights,confidence,archetype]
status: reviewed
version: intel-v3
---

## 1. About This Document

The Classifier is the engine that turns a trader’s raw activity into a
behavioural classification and a risk score — the score that ultimately
drives how the firm treats that trader’s flow. It is the first of four
tabs on the Behaviour Rules page (the others being Detection,
Clustering, and the AI Model); this document covers the Classifier in
full.

Because these settings decide which traders are flagged, and how
strongly, they are examined closely by both brokers and risk managers.
This document is written for that scrutiny. For **every** control it
states three things: **what it does**, **why it is set at its current
value**, and **what range would normally be considered acceptable** —
separating the platform’s hard permitted limits (which are enforced)
from a reasoned operating band (which is judgement, and is presented as
such).

The Classifier does not act on traders by itself; it produces the
classification and score that other parts of the platform — the Risk
Charter and the risk-monitoring surfaces — consume. Understanding it
therefore means understanding both the settings and how they combine
into a single decision.

## 2. What the Classifier Does

Every trader generates a stream of trades. The Classifier reads that
stream and answers two questions: what kind of trader is this (which
behavioural archetype do they match — EA bot, scalper, arbitrageur,
rebate abuser, news trader), and how much of a risk are they (a single
0–100 score). It reaches those answers by combining several independent
lines of evidence rather than trusting any one of them, and it holds
back until it has seen enough activity to be confident.

The settings on this tab are the dials of that process: how much
evidence is enough to start, how the lines of evidence are weighted, how
persistent a behaviour must be to count, how dangerous each archetype is
considered, and where the score cut-offs sit that turn a number into an
action. The rest of this document takes them one at a time — but they
are best understood against the pipeline they sit in.

## 3. The Classification Pipeline

The settings interlock as a sequence. Reading them in order shows why
each exists:

1.  **Global gate.** A trader must have traded a minimum number of times
    before any classification runs at all — no gate, no scoring.

2.  **Behaviour detectors.** Five archetype detectors each score the
    trader on their characteristic signals; each has its own
    minimum-trades gate.

3.  **Anomaly detection.** An independent model flags traders whose
    overall pattern is statistically unusual, regardless of archetype.

4.  **Persistence.** A behaviour must have persisted for a minimum time
    and number of trades to be treated as real rather than a passing
    streak.

5.  **Composite score.** The decision engine combines the behaviour,
    anomaly and persistence signals by their weights, amplifies the
    result when an anomaly is present, and scales it by how dangerous
    the matched archetype is — producing one 0–100 risk score.

6.  **Action bands.** The score is compared against ascending thresholds
    that map it to an action — monitor, warn, restrict, escalate — with
    a separate human-review pull.

Each numbered stage corresponds to a section below. Nothing downstream
fires until the gates upstream are satisfied, which is the single most
important idea for reading the settings: they are deliberately
conservative about acting on thin evidence.

## 4. Global Gate

The Global Gate is a single number: the **minimum trades before any
classification fires**. Below it, the Classifier stays silent for that
trader entirely — no archetype, no score. It is the master "do we have
enough to judge?" switch. Current value: **20 trades**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Twenty trades is a small but
meaningful sample — enough for the behavioural signals (timing
regularity, holding periods, win/loss shape) to separate a genuine
pattern from noise, while still flagging a trader early in their life
rather than after hundreds of trades. Set it far lower and the system
classifies on a handful of trades, producing confident-looking labels
that are really just luck; set it far higher and genuinely risky traders
operate unclassified for too long.</p>
<p><strong>Acceptable range.</strong> The platform permits 5–500. A
sensible operating band is roughly 10–50: below ~10 the classification
is statistically fragile, and above ~50 the firm is carrying
unclassified risk longer than necessary. Move it up to be more
conservative (fewer premature labels), down to react faster.</p></td>
</tr>
</tbody>
</table>

## 5. Decision Engine — Composite Weights and Action Thresholds

The Decision Engine is where the separate signals become one score and
that score becomes an action. It has four parts: the composite weights,
the anomaly boost, the persistence minimums, and the action thresholds.
Two structural rules are enforced: the composite weights must sum to
1.0, and the action thresholds must ascend.

### 5.1 Composite Weights

Three weights decide how much each line of evidence contributes to the
score. They must sum to 1.0. Current values: **Behaviour 60%**,
**Anomaly 20%**, **Persistence 20%**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> The behavioural archetype match
is the primary evidence — it is the thing the firm most wants to act on
— so it carries the majority weight at 60%. Anomaly and persistence are
corroborating signals: they should influence the score meaningfully but
not override the core behavioural judgement, so each takes 20%. This
60/20/20 split says "trust the archetype, but let a strong anomaly or a
well-established pattern move the number."</p>
<p><strong>Acceptable range.</strong> Each weight may be 0–1 and the
three must sum to 1.0. In normal operation the behaviour weight is the
largest — typically 50–70% — with anomaly and persistence each in the
15–30% range. Pushing behaviour much below half makes the score driven
by statistics rather than recognised behaviour; pushing it near 1.0
discards the corroborating checks that guard against false
positives.</p></td>
</tr>
</tbody>
</table>

### 5.2 Anomaly Boost

When the anomaly detector flags a trader, the engine multiplies the risk
contribution by the anomaly boost. Current value: **×1.5**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A statistically anomalous trader
deserves extra attention — anomalies are often where the real,
un-templated risk hides — so their score is amplified. But an anomaly is
a flag, not a verdict, so the amplification is moderate (half again)
rather than overwhelming; ×1.5 raises the case without letting a single
unusual metric dominate an otherwise ordinary trader.</p>
<p><strong>Acceptable range.</strong> The platform permits 1.0–3.0 (1.0
= no boost). A moderate 1.3–2.0 is the usual band. Above ~2.5 the
anomaly signal starts to swamp the behavioural score, which risks
over-flagging merely-unusual-but-harmless traders; at 1.0 the anomaly
detector effectively contributes nothing beyond its base
weight.</p></td>
</tr>
</tbody>
</table>

### 5.3 Minimum Persistence

Before a behaviour is treated as persistent, it must last at least a
minimum time **and** a minimum number of trades. Current values: **300
seconds (5 minutes)** and **20 trades**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A trader can look like a scalper
for ninety seconds during a volatile spell and then stop. Persistence
filtering prevents a brief burst from being scored as an entrenched
behaviour: only a pattern that holds for at least five minutes and
twenty trades is treated as the trader’s real style. Requiring both a
time and a count guards against both a slow trickle and a fast burst
gaming the gate.</p>
<p><strong>Acceptable range.</strong> Permitted: 60–3600 seconds and
5–200 trades. A reasonable band is a few minutes to an hour (roughly
300–1800 s) and 10–50 trades. Too short and momentary behaviour is
over-classified; too long and a fast-moving abusive pattern is
recognised only after it has done its damage.</p></td>
</tr>
</tbody>
</table>

### 5.4 Action Thresholds

The composite score runs 0–100. Four ascending thresholds band it into
escalating actions, and a fifth — Human Review — pulls a case to a
person in parallel. Current values: **Monitor ≥ 20**, **Warn ≥ 40**,
**Restrict ≥ 60**, **Escalate ≥ 80**, **Human Review ≥ 70**.

| **Band**     | **Score** | **Meaning**                                            |
|--------------|-----------|--------------------------------------------------------|
| Monitor      | ≥ 20      | Low bar — start watching the trader.                   |
| Warn         | ≥ 40      | A meaningful pattern — raise attention.                |
| Human Review | ≥ 70      | Pull the case to a person before automated escalation. |
| Restrict     | ≥ 60      | Strong enough to constrain the trader’s handling.      |
| Escalate     | ≥ 80      | Only the clearest, strongest cases.                    |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Evenly spaced cut-offs at
20/40/60/80 divide the 0–100 score into interpretable quarters: a low
bar to begin observing, then successively firmer actions as the score
climbs, with escalation reserved for the top fifth. Human Review is
deliberately set at 70 — between Restrict (60) and Escalate (80) — so a
person looks at a serious case before the system reaches its most severe
automated band. The thresholds must ascend (monitor &lt; warn &lt;
restrict &lt; escalate) so the bands never cross.</p>
<p><strong>Acceptable range.</strong> Each threshold may sit anywhere in
0–100 provided the ordering holds. The exact cuts are the primary policy
dial: lowering them flags more traders sooner (more sensitive, more
false positives); raising them flags fewer, later (more specific, more
misses). A common, defensible layout keeps them spread across the range
with escalation in the top 15–20 points; bunching them together
collapses the graduated response into an effective on/off
switch.</p></td>
</tr>
</tbody>
</table>

## 6. Risk Severity Multipliers

Not every archetype is equally dangerous to the firm, so the score is
scaled by a per-archetype **severity multiplier** between 0.10 and 1.00.
A multiplier of 1.00 lets the full score through; 0.30 keeps only 30% of
it. Current values:

| **Archetype** | **Multiplier** | **Why it sits there**                                                                                             |
|---------------|----------------|-------------------------------------------------------------------------------------------------------------------|
| Arbitrage     | 1.00           | The most toxic flow — latency/price-discrepancy exploitation is pure cost to the firm, so it carries full weight. |
| Rebate Abuse  | 0.80           | Churning to harvest rebates drains the firm steadily; high but not maximal.                                       |
| Scalper       | 0.50           | Fast in-and-out trading is a moderate concern — costly at scale, but often legitimate.                            |
| News Trader   | 0.40           | Event-driven trading is a lesser, situational risk.                                                               |
| EA Bot        | 0.30           | Automation alone is not dangerous — many EAs are benign — so it is weighted lowest.                               |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> The ordering encodes the firm’s
view of which behaviours actually hurt the book. Arbitrage flow is the
classic broker toxin and takes the full multiplier; rebate abuse is a
persistent drain just below it; scalping and news trading are real but
more often legitimate, so they are damped; and being an EA is, on its
own, not a threat, so it is damped hardest. The multiplier lets the same
raw score mean very different things depending on who produced it.</p>
<p><strong>Acceptable range.</strong> Each is bounded 0.10–1.00. The
values are a direct expression of risk appetite rather than a technical
constant, so "acceptable" is whatever the firm can justify — but the
ordering should track genuine toxicity (arbitrage and rebate abuse high;
benign automation low), and no archetype should be driven to the 0.10
floor unless the firm truly considers it almost harmless, since that all
but silences its detector.</p></td>
</tr>
</tbody>
</table>

## 7. Anomaly Detector

Independently of the archetypes, an **Isolation Forest** model flags
traders whose overall behaviour is statistically unusual. Its one
setting is **contamination** — the fraction of the trader population the
model should expect to be anomalous. Current value: **10%**.

Isolation Forest is an unsupervised outlier detector: it isolates
unusual points more easily than typical ones. The contamination
parameter tells it, in effect, "assume about this share of traders are
outliers", which sets how aggressively it draws the line between normal
and anomalous. At 10% it treats roughly one trader in ten as worth
flagging as unusual.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> Ten percent is a common,
balanced prior for outlier fraction: high enough to surface the
genuinely unusual minority, low enough that the label still means
something. Set contamination too low and the model becomes blind to all
but the most extreme outliers; set it too high and it flags a large,
noisy fraction of ordinary traders, devaluing the anomaly signal that
the boost in Section 5.2 amplifies.</p>
<p><strong>Acceptable range.</strong> The platform permits 0.01–0.30
(1%–30%). A typical operating band is roughly 5–15%. Below ~2% only the
starkest outliers surface; above ~20% the "anomalous" set becomes too
large to be actionable. This should be set with the anomaly boost in
mind — a wide contamination and a high boost together will
over-escalate.</p></td>
</tr>
</tbody>
</table>

## 8. Behaviour Detectors

Five detectors do the archetype recognition. Each scores a trader on a
handful of characteristic signals, each signal carrying a **weight**; a
detector’s weights sum to 1.0, so a detector is really a small weighted
scorecard for one behaviour. Each also has its own **minimum-trades**
gate — separate from, and on top of, the global gate — because some
patterns need more data than others to confirm.

| **Detector** | **What it looks for**                                         | **Min trades** | **Example signal**                                        |
|--------------|---------------------------------------------------------------|----------------|-----------------------------------------------------------|
| EA Bot       | Machine-like regularity — automated trading.                  | 20             | Inter-trade CV (how regular the gaps between trades are). |
| Scalper      | Very short holds, high trade frequency.                       | 20             | Frequency (trades per unit time).                         |
| Arbitrage    | Latency / price-discrepancy exploitation — ultra-short holds. | 30             | Holding time.                                             |
| Rebate Abuse | Churn with near-zero edge to harvest rebates.                 | 100            | Expectancy (P&L per trade near zero at high volume).      |
| News Trader  | Activity clustered around events.                             | 20             | Concentration (of activity in time/symbols).              |

### 8.1 How a detector scores

Within a detector, each signal is measured for the trader and combined
by its weight into a single archetype score. The weight is the
**relative importance** of that signal to the pattern: a higher weight
means that signal matters more to deciding "is this an X?". Because the
weights sum to 1.0, raising one lowers the others — they are shares of a
fixed whole, and the drawer requires them to be edited together so the
sum is preserved.

### 8.2 Why the minimum-trades gates differ

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A detector’s min-trades gate
reflects how much evidence its pattern needs. EA, scalper and news
patterns show up quickly in timing and clustering, so 20 trades
suffices. Arbitrage needs a little more (30) to confirm consistently
ultra-short, one-sided holds. Rebate abuse is set highest at 100,
because it is a statistical churn pattern — near-zero expectancy over
high volume — that only becomes distinguishable from ordinary trading
over a large sample; flagging it early would mislabel normal active
traders.</p>
<p><strong>Acceptable range.</strong> Each gate is bounded 5–500.
Sensible values track the pattern’s data hunger: fast-timing patterns
15–30, statistical/expectancy patterns 75–150. Setting rebate abuse’s
gate low is the classic mistake — it produces false accusations of abuse
against merely-active clients.</p></td>
</tr>
</tbody>
</table>

### 8.3 The individual signal weights

The signal shown on each detector card (inter-trade CV for EA, frequency
for Scalper, holding for Arbitrage, expectancy for Rebate Abuse,
concentration for News Trader) is the headline signal for that
archetype; each detector combines several such signals under the
sum-to-1.0 rule. Because the weights are shares, "acceptable" is any set
that keeps the defining signal dominant enough to characterise the
archetype while leaving room for corroborating signals — there is no
single correct split, but a detector whose defining signal is weighted
near zero has effectively stopped detecting its own archetype.

## 9. How the Settings Interlock — A Worked Example

Following one trader through shows why the settings are a system, not a
list:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>A trader has placed <strong>45 trades</strong> — past the global
gate of 20, so the Classifier runs.</p>
<p>The <strong>Arbitrage</strong> detector (min-trades 30, satisfied)
scores them highly on ultra-short holds; the anomaly model also flags
them as unusual; and the pattern has held for 12 minutes and 40 trades —
past the 300 s / 20-trade persistence gate.</p>
<p>The engine combines the signals at <strong>60/20/20</strong>, applies
the <strong>×1.5</strong> anomaly boost (an anomaly is present), then
scales by the <strong>Arbitrage severity 1.00</strong> — producing, say,
a score of <strong>84</strong>.</p>
<p>84 clears <strong>Escalate (80)</strong> and <strong>Human Review
(70)</strong>: the case escalates and is pulled for a person to review.
Had they been an <strong>EA Bot</strong> instead (severity 0.30), the
same raw evidence would have scored ~25 — only Monitor.</p></td>
</tr>
</tbody>
</table>

The example makes the dependencies concrete: the same behaviour produces
a very different outcome depending on the archetype’s severity
multiplier, the anomaly boost, and where the thresholds sit. Changing
any one setting shifts where traders land — which is exactly why each is
documented with its effect.

## 10. Tuning Guidance — Conservative vs Aggressive

Every setting trades the same two errors against each other: flagging
traders who are fine (false positives) versus missing traders who are
not (false negatives). The table shows which way each dial moves that
balance.

| **Setting**           | **More conservative (fewer flags)**  | **More aggressive (more flags)** |
|-----------------------|--------------------------------------|----------------------------------|
| Global gate           | Higher (wait for more trades)        | Lower (classify sooner)          |
| Behaviour weight      | Higher (trust the archetype)         | Lower (let stats/anomaly drive)  |
| Anomaly boost         | Lower (toward 1.0)                   | Higher (toward 3.0)              |
| Persistence minimums  | Higher (demand a longer pattern)     | Lower (accept brief patterns)    |
| Action thresholds     | Higher (act only on strong scores)   | Lower (act on weaker scores)     |
| Severity multipliers  | Lower (damp the archetype)           | Higher (toward 1.00)             |
| Anomaly contamination | Lower (fewer outliers)               | Higher (more outliers)           |
| Detector min-trades   | Higher (more evidence per archetype) | Lower (flag on less)             |

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The current defaults are a balanced starting point.** Taken together — a 20-trade gate, behaviour-led 60/20/20 weights, a moderate ×1.5 anomaly boost, a five-minute persistence floor, quartile thresholds, and severity multipliers ordered by real toxicity — the shipped settings lean deliberately toward **not** over-flagging. That is the right default for a control that influences how clients are treated: it is easier to justify tightening in response to observed abuse than to defend having flagged legitimate traders. |

## 11. Reset, Export and Change Tracking

Every section can be returned to its shipped factory value —
individually (each card’s Reset) or all at once (**Reset to Factory**),
with a confirmation. The page also shows how far the live configuration
has drifted from factory, so any deviation is visible. Two export
actions — **Export Factory Defaults** and **Export Current Settings** —
let the baseline and the live policy be captured for review or
archiving, and the **Change History** tab records changes over time. As
with the Risk Charter, the intent is that no tuning is unattributable or
irreversible.

## 12. How This Connects to the Rest of the Platform

- **The Risk Charter** — the archetype this Classifier assigns is the
  "behaviour" axis of the Risk Charter’s matrix, and the risk score
  informs the posture applied to a trader. Tuning the Classifier changes
  which traders the Charter’s rules act on.

- **Risk-monitoring surfaces** — the score and classification feed "Who
  Is My Risk" and the trader views, where critical and high-risk traders
  surface for attention.

- **The other three tabs** — Detection tunes the raw signal extraction,
  Clustering groups traders into emergent archetypes, and the AI Model
  produces the plain-English explanations. This Classifier is the
  scoring core they feed into and around.

## 13. Quick Reference — All Settings

Current value, the platform’s enforced range, a reasoned operating band,
and the effect of increasing each setting.

| **Setting**                           | **Current** | **Permitted** | **Operating band** | **Increasing it…**                       |
|---------------------------------------|-------------|---------------|--------------------|------------------------------------------|
| Global gate (min trades)              | 20          | 5–500         | 10–50              | Classifies later, fewer premature labels |
| Behaviour weight                      | 60%         | 0–100%        | 50–70%             | Trusts the archetype more                |
| Anomaly weight                        | 20%         | 0–100%        | 15–30%             | Lets statistics drive more               |
| Persistence weight                    | 20%         | 0–100%        | 15–30%             | Rewards established patterns             |
| Anomaly boost                         | ×1.5        | 1.0–3.0       | 1.3–2.0            | Amplifies anomalous traders              |
| Min persistence (time)                | 300 s       | 60–3600 s     | 300–1800 s         | Demands a longer pattern                 |
| Min persistence (trades)              | 20          | 5–200         | 10–50              | Demands more trades                      |
| Monitor threshold                     | 20          | 0–100         | low                | Watches fewer traders                    |
| Warn threshold                        | 40          | 0–100         | mid-low            | Warns on fewer                           |
| Restrict threshold                    | 60          | 0–100         | mid                | Restricts fewer                          |
| Escalate threshold                    | 80          | 0–100         | high               | Escalates fewer                          |
| Human Review threshold                | 70          | 0–100         | 60–80              | Reviews fewer                            |
| Severity: Arbitrage                   | 1.00        | 0.10–1.00     | high               | More of its score counts                 |
| Severity: Rebate Abuse                | 0.80        | 0.10–1.00     | high               | More of its score counts                 |
| Severity: Scalper                     | 0.50        | 0.10–1.00     | mid                | More of its score counts                 |
| Severity: News Trader                 | 0.40        | 0.10–1.00     | low-mid            | More of its score counts                 |
| Severity: EA Bot                      | 0.30        | 0.10–1.00     | low                | More of its score counts                 |
| Anomaly contamination                 | 10%         | 1–30%         | 5–15%              | Flags more traders as unusual            |
| Detector min-trades (EA/Scalper/News) | 20          | 5–500         | 15–30              | Needs more evidence to fire              |
| Detector min-trades (Arbitrage)       | 30          | 5–500         | 25–40              | Needs more evidence to fire              |
| Detector min-trades (Rebate Abuse)    | 100         | 5–500         | 75–150             | Needs more evidence to fire              |

*End of document. Classifier tab — one of four in the Behaviour Rules
set (Classifier · Detection · Clustering · AI Model).*
