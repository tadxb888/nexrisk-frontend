---
id: task-clustering
title: "Clustering — operating guide"
type: task
domain: intel
module: archetype
minLevel: VIEW
route: /archetypes
order: 4
source:
  - "Behaviour_Rules_Clustering_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [clustering,hdbscan,cluster,archetype,parameters]
status: reviewed
version: intel-v3
---

## 1. About This Document

Of the four Behaviour Rules tabs, Clustering is the one built on genuine
machine learning, and the one most likely to be unfamiliar to a broker.
It uses new terms — clustering, feature vectors, noise, outliers,
centroids, drift — that do not appear anywhere else in the platform.
This document sets out to make every one of them plain, with worked
examples, so that the tab becomes something a risk team can actually use
day to day rather than a black box they leave alone.

Nothing here is summarised or skipped. It starts from the big idea (what
clustering is, and why it is different from everything else in Behaviour
Rules), walks through how it works step by step, explains every setting
and every number on the screen, answers the practical questions —
including when and how to run it — and ends with a glossary you can keep
to hand.

## 2. The Big Idea — What Clustering Is, and Why It Is Different

The Classifier and Detection tabs look for behaviours the firm has
**already defined** — "is this trader an EA bot? a scalper? an
arbitrageur?" They match traders against a fixed list of known
archetypes. Clustering does the **opposite**. It takes all your traders
and asks a different question entirely: **"which of these traders
naturally resemble each other?"** — and lets the groups emerge from the
data, without being told in advance what to look for.

This is the difference between **recognising** and **discovering**.
Recognition needs a template; discovery does not. Clustering can surface
a group of traders all doing something similar that **no one had thought
to write a rule for** — an emergent pattern the predefined detectors
would never catch, because nobody defined it.

|                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **An everyday picture.** Imagine tipping a jar of mixed coins onto a table and, without being told the denominations, sorting them into piles purely by size and weight. Piles form on their own — the big heavy ones here, the small light ones there — and a bent, one-of-a-kind coin ends up in no pile at all. Clustering does this with traders: it forms the piles by similarity, and it is content to leave an oddball out. |

Why does a broker care? Because the groups it finds are **real patterns
in your own book** — "these fourteen traders all behave alike" — and a
group you did not know existed is exactly where tomorrow’s risk, or
tomorrow’s new archetype, tends to appear. Discovered groups can later
be given names and folded back into the rule-based system (Section 10).

## 3. How It Works, Step by Step

Under the surface, clustering runs through five plain steps.
Understanding them makes every setting on the tab obvious.

### 3.1 Step 1 — Build a behavioural fingerprint for each trader

The system reduces each trader to a short list of numbers describing
**how they trade**, built from their activity over the **Feature
Window** (Section 5). This list is the trader’s **feature vector**, or
behavioural fingerprint. The actual measurements it uses are:

| **Feature**                  | **What it captures (plain English)**                                                                                     |
|------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Mean holding time            | How long, on average, a position is kept open — seconds for a scalper, hours for a swing trader.                         |
| Mean inter-trade time        | The average gap between one trade and the next.                                                                          |
| Inter-trade time variability | How consistent those gaps are — metronomic, evenly-spaced trading (low variability) points to automation.                |
| Timing regularity            | An overall score for how rhythmic the trading is; a high score is machine-like.                                          |
| Win rate                     | The share of trades that are winners.                                                                                    |
| Mean lot size                | The average trade size.                                                                                                  |
| Lot-size variety             | How varied the trade sizes are — very uniform sizing (low variety) suggests an algorithm; mixed sizing suggests a human. |
| Volume-vs-profit ratio       | How much volume is traded relative to profit made — a churn indicator.                                                   |
| Trading-hour concentration   | How tightly activity clusters into particular hours of the day.                                                          |
| News-window activity         | How much of the trading happens around news releases.                                                                    |

|                                                                                                                                                                                                                                                                                                                                              |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example.** Trader A: holds each position ~30 seconds, trades every few seconds like clockwork, uses one fixed lot size, wins 52%. Trader B: holds for hours, trades a few times a day at irregular intervals with varied sizes, wins 60%. Those two fingerprints are worlds apart — and clustering will not put A and B in the same group. |

### 3.2 Step 2 — Measure how similar two traders are

With every trader reduced to a fingerprint, the system measures how
**close** any two traders are — how similar their numbers are. Two
day-scalpers with near-identical fingerprints are "close together"; a
scalper and a long-term position trader are "far apart". The rule for
measuring that distance is the **Distance Metric** (Section 5).

### 3.3 Step 3 — Let the dense groups emerge

Now the algorithm looks for **clumps** — places where many traders sit
close together. A tight clump of similar traders becomes a **cluster**.
A trader sitting on their own, far from any clump, is left out and
labelled **noise**. The clustering engine that does this is explained in
the next section.

### 3.4 Step 4 — Score how much of an oddball each trader is

Each trader gets two numbers from the analysis. The **membership
probability** says how strongly they belong to their assigned group — a
trader deep in the middle of a tight cluster scores near 1, one clinging
to the edge scores lower. The **outlier score** (0 to 1) says how
unusual they are relative to everyone else; it weighs how much of an
oddball a trader is both within their own group and against the whole
population. Two thresholds turn that score into a label: **high** and
**medium** outlier (Section 5).

### 3.5 Step 5 — Present the groups

Finally the results are shown: how many clusters formed, how many
traders fell into each, how many were left as noise, and which clusters
are mature versus newly-forming. From there a risk manager can click
into any group to examine who is in it (Section 6).

## 4. The Clustering Engine in Plain English

The clustering engine works on a simple idea, and the two words that
matter are **density** and **noise**.

- **Density-based** means it forms groups where traders are **packed
  tightly together**, rather than forcing everyone into a fixed number
  of boxes. Wherever the data is crowded, a cluster forms; where it is
  sparse, none does.

- **with Noise** means it is allowed to say **"this trader belongs to no
  group"**. It does not force every trader into a cluster — genuine
  one-of-a-kind traders are set aside as noise, which is a feature, not
  a failure.

|                                                                                                                                                                                                                                                                                                                                                                                                               |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **The map analogy.** Picture dropping a pin for every person in a country onto a map. Cities appear by themselves as dense clusters of pins; a lone farmhouse in the hills is not dragged into the nearest city — it is simply "not in a city". The engine reads your traders the same way: the crowded regions become clusters, the loners become noise. You never had to tell it how many cities to expect. |

That last point is the big practical advantage. Older methods make you
**specify the number of groups up front** and force every point into
one. The engine works out the number of groups on its own and honestly
reports the traders who fit none — which is exactly what you want when
you are **discovering** unknown patterns rather than sorting into known
ones.

## 5. The Clustering Config — Every Setting Explained

The config panel controls how the grouping behaves. Each setting is
given below in plain terms, with an example, its current value, and a
reasonable range.

### 5.1 Min Cluster Size

The **smallest number of traders** that counts as a real group. Below
it, a would-be clump is not called a cluster. Current value: **5**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A group has to be big enough to
be meaningful. With Min Cluster Size 5, four look-alike traders are not
yet a cluster, but five are. Set it too low and you get lots of tiny,
accidental "groups" of two or three; set it too high and small but real
behavioural groups are missed and dumped into noise.</p>
<p><strong>Acceptable range.</strong> Permitted 2–50. A sensible band
depends on how many traders you have: for a modest book, 5–10 is
reasonable; for a very large book, higher. Think of it as "how many
traders behaving alike before I care".</p></td>
</tr>
</tbody>
</table>

### 5.2 Min Samples

How **crowded** a spot must be before it counts as the dense core of a
cluster — in effect, how cautious the algorithm is. Higher values make
it stricter, so more traders end up labelled noise. Current value:
**3**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> This is the conservativeness
dial. A low Min Samples groups readily and calls few traders noise; a
high one demands denser cores and is quicker to set traders aside as
unusual. Three is a gentle setting that forms groups without being
trigger-happy about noise.</p>
<p><strong>Acceptable range.</strong> Permitted 1–20. Typically kept
small (1–5) and at or below Min Cluster Size. Raise it if the groups
look too loose or you want more traders flagged as outliers; lower it if
too many traders are being pushed into noise.</p></td>
</tr>
</tbody>
</table>

### 5.3 Distance Metric

The rule for measuring how far apart two fingerprints are. Current
value: **euclidean** — ordinary straight-line distance, the same
"as-the-crow-flies" distance you would measure between two points on a
map. It is the standard, intuitive choice and suits the numeric
fingerprints used here.

### 5.4 Feature Window

The **period of activity** used to build each trader’s fingerprint.
Current value: **1 day**. With a one-day window, traders are judged on
their most recent day of trading.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> The window decides whether you
are grouping traders on recent behaviour or long-run behaviour. A short
window (a day) captures what traders are doing now and reacts quickly to
change; a longer window captures their settled, long-term style but is
slower to notice a shift.</p>
<p><strong>Acceptable range.</strong> Choose to match the question you
are asking: a day or a few days to see current behaviour, longer to
characterise established style. Note a trader must have enough trades
within the window (next setting) to be included at all.</p></td>
</tr>
</tbody>
</table>

### 5.5 Min Trades

The **minimum number of trades** a trader must have in the window to be
included in the analysis at all. Current value: **10**.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> A fingerprint built from two or
three trades is meaningless — there is not enough behaviour to describe.
Requiring at least ten trades keeps barely-active accounts out of the
analysis so they neither form spurious groups nor distort real ones.</p>
<p><strong>Acceptable range.</strong> Set it high enough that each
included trader has a stable fingerprint. Ten is a light floor; raise it
if low-activity accounts are muddying the groups. (This is separate from
the minimum number of traders needed to run at all — see Section
7.)</p></td>
</tr>
</tbody>
</table>

### 5.6 High Outlier and Medium Outlier thresholds

The outlier score (Step 4) runs 0–1. These two cut-offs turn that score
into a label: at or above the **High** threshold a trader is a high
outlier; at or above the **Medium** threshold, a medium one; below both,
normal. Current values: **High ≥ 0.79**, **Medium ≥ 0.49**. The high
threshold must be greater than the medium one.

|                                                                                                                                                                                                                                                    |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example.** Trader P scores 0.85 — above 0.79, so a **high** outlier: in a group but a distinctly unusual member, worth a look. Trader Q scores 0.55 — a **medium** outlier. Trader R scores 0.20 — a comfortable, typical member of their group. |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Why this value.</strong> 0.79 and 0.49 place the "high"
bar high (only genuinely unusual traders trip it) and the "medium" bar
near the middle (a broader net for mildly-unusual ones). Together they
grade unusualness rather than treating it as on/off, so you can triage:
look hard at the highs, keep an eye on the mediums.</p>
<p><strong>Acceptable range.</strong> Both are bounded 0.0–1.0 and High
must exceed Medium. Move them together to widen or narrow how many
traders get flagged: lower thresholds surface more (more noise to sift),
higher thresholds reserve the labels for the truly unusual.</p></td>
</tr>
</tbody>
</table>

## 6. The Run Bar and Results — What You Are Looking At

After a run, the bar across the top of the tab summarises what was
found. Each term is defined here in plain language.

| **You see…**                               | **What it means**                                                                                                                                            |
|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Run · N clusters · M traders               | The latest run found N groups across M included traders.                                                                                                     |
| COMPLETED                                  | The run finished successfully (its status).                                                                                                                  |
| Established                                | Mature, actionable groups — clusters that have reached the "action" size (about 10+ members), large enough to treat as a settled trader "tribe" and act on.  |
| Emerging                                   | Newly-forming groups — clusters with at least the emerging minimum (about 5 members) but not yet at the action size. Real, but worth watching before acting. |
| Noise                                      | Traders who fit no group — the loners set aside (Section 4).                                                                                                 |
| Mapped                                     | Clusters that have been given a named archetype (Section 10).                                                                                                |
| Noise / High / Med counts                  | How many traders were noise, and how many were high- or medium-outliers.                                                                                     |
| Select a cluster / Click a card to analyse | Click any cluster to see who is in it and examine the group.                                                                                                 |

When there is too little data, the tab says so plainly — "No clusters
formed — Insufficient data — need 5+ traders with enough trades." That
is the minimum-to-run gate (Section 7), not an error.

## 7. Running Clustering — Manual vs Automatic

This is the question the screen raises most often, so it is worth
answering directly and in full.

### 7.1 What the "Run Clustering" button does

The **Run Clustering** button triggers one clustering run, there and
then. It gathers every eligible trader’s recent activity, builds their
fingerprints, runs the clustering, and shows you the resulting groups.
It runs **on demand** — press it whenever you want an immediate, fresh
run (for example right after onboarding a batch of new traders), in
addition to the automatic runs described next.

### 7.2 Does it run automatically? (Yes — by default)

Yes. The **Auto Run** setting defaults to **On (Enabled)**, so
clustering runs by itself on a schedule — you do not need to press
anything for it to keep an up-to-date picture. The **Run Clustering**
button (above) is simply there for when you want an extra run on demand
between the scheduled ones. If Auto Run is ever set to **Disabled**,
clustering stops running on its own and happens only when you press the
button.

|                                                                                                                                                                                                     |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **In one line.** Auto Run is On by default — clustering runs itself on a schedule. Press Run Clustering any time you want an immediate, extra run. Set Auto Run to Disabled to make it manual-only. |

### 7.3 When should you run it?

Clustering is a batch analysis over your whole trader population, not a
per-trader check, so it does not need to run every second. The automatic
schedule keeps it current; the situations where an up-to-date picture
matters most — and where you might also force a manual run — are:

- **Periodically** — for example weekly or monthly — to keep an
  up-to-date map of how your traders group.

- **As the book grows** — when you have taken on enough new traders that
  the picture may have changed.

- **After enough activity** — it needs at least a handful of traders
  (5+) each with enough trades before it can form any groups at all.

Because it looks across the whole population and is more computationally
involved than the per-trader Classifier, it runs as a periodic batch
rather than continuously — the automatic schedule handles the routine
cadence, and the Run Clustering button covers the on-demand cases above.

## 8. Auto-Labelling — the System Suggests What Each Group Is

Finding a group is useful; knowing **what it is** is more useful still.
After a cluster forms, the system reads its **centroid** — the average
fingerprint of everyone in it — and automatically suggests a plain label
for the group, with a confidence, plus up to two secondary hints. You
are never left staring at an anonymous "Cluster 3"; the system offers
its best guess at the behaviour.

The suggestion comes from simple, transparent rules on the group’s
average fingerprint:

| **If the group’s average…**                       | **It is labelled…**                                   |
|---------------------------------------------------|-------------------------------------------------------|
| Holds positions under ~10s / ~30s / ~60s          | "ultra-short-hold" / "micro-scalper" / "scalper"      |
| Trades very rhythmically (high timing regularity) | "automated execution" — i.e. a bot                    |
| Uses very uniform lot sizes                       | "systematic sizing" — algorithmic                     |
| Wins over 85% and holds under ~30s                | "latency arbitrage pattern" — the toxic one to notice |
| Wins over 85% otherwise                           | "high win rate"                                       |
| Holds positions over an hour                      | "swing trader"                                        |
| Trades irregularly with varied sizes              | "manual retail" — a human                             |
| Matches none of the above                         | "unknown pattern"                                     |

|                                                                                                                                                                                                                                                                                                                                                                                                                          |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example.** A run turns up a cluster of nine traders whose average member holds positions about 8 seconds and wins 88% of the time. The system auto-labels it **"latency arbitrage pattern"** at high confidence — a toxic group surfaced and named automatically, without anyone having written a rule for it. That is the whole promise of discovery: the system found the group **and** told you what it looks like. |

These labels are **hints**, not verdicts — a starting point for a human
to confirm. When a hint is right, you can **map** the cluster to a named
archetype (Section 11), and the system can also match a group to an
existing archetype by comparing its fingerprint against the archetype’s
defined feature ranges. That is the mechanism behind the "Mapped" count
and the bridge to the rule-based side of the platform.

## 9. Reading and Using the Results

A run is only useful if it changes what you do. Here is how a risk team
turns the output into action:

- **Established clusters — know your tribes.** These are your stable
  trader populations. Understanding each one (what they trade, how, how
  profitably) tells you where the bulk of your book’s behaviour sits and
  how to treat it.

- **Emerging clusters — watch them.** A new group forming is an early
  signal: a fresh style of trading is spreading. Catching it here,
  before it is large, is the whole point of discovery.

- **Noise and high outliers — investigate the one-offs.** Traders who
  fit no group, or sit at the unusual edge of one, are where novel or
  toxic behaviour often hides. The outlier grading tells you which to
  look at first.

- **Map what you recognise.** When a discovered cluster clearly
  corresponds to a known behaviour, map it to a named archetype
  (Section 10) so the rule-based side of the platform can act on it
  going forward.

## 10. Cluster Drift — Keeping the Picture Current

Traders change, and so do the groups they form. A cluster that centred
on one kind of behaviour last month may have shifted by this month — its
**centre of gravity** (its **centroid**) has moved. This is called
**drift**. The platform compares a later run against an earlier one and
raises a **drift alert** when a group’s centroid has moved beyond a set
distance: a **warning** at moderate movement and a **critical** alert at
large movement (by default, moved by more than about 0.5 raises a
warning and more than about 1.0 a critical alert).

|                                                                                                                                                                                                                                                                                               |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example.** Last month, a cluster of active traders averaged about 50 trades a day. This month, the same group averages 120. The cluster has drifted — the behaviour that defined it has intensified. A drift alert flags it so you re-examine the group rather than trusting a stale label. |

Drift is why re-running clustering periodically matters: the map goes
out of date as behaviour evolves, and drift detection is how you know
when the old map can no longer be trusted.

## 11. The Archetype Library (Coming Soon)

The panel marked "Archetype Library — Coming soon" is the planned home
for the bridge from **discovery** back to **recognition**. Today, a
discovered cluster can be **mapped** to a named archetype (that is what
the "Mapped" count tracks). The Library will make managing those named
archetypes — browsing them, describing them, assigning their risk
severity — a first-class part of the tab.

The significance for a broker is this: clustering **finds** a new group;
mapping **names** it; and once named, it can inform the predefined
detectors on the other tabs. That closes the loop — the unsupervised
discovery here feeds the rule-based classification elsewhere, so the
system can learn new behaviours rather than only recognising the ones it
shipped with.

## 12. How This Connects to the Rest of Behaviour Rules

- **Classifier and Detection** — these recognise **predefined**
  archetypes (EA, Scalper, Arbitrage…). Clustering **discovers** groups
  that were never predefined — including new archetypes the rules would
  miss. The two are complementary: recognition for the known, discovery
  for the unknown.

- **The Archetype Library** — the route by which a discovered cluster
  becomes a named archetype the rule-based side can use.

- **The AI Model tab** — produces the plain-English explanations across
  Behaviour Rules; clustering results are among the things it can help
  interpret.

## 13. Glossary — Every Term in One Place

| **Term**                     | **Plain meaning**                                                                                                                           |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Clustering                   | Grouping traders by how similar their behaviour is, letting the groups emerge from the data.                                                |
| Clustering engine            | The method used here — forms groups where traders are densely packed, and leaves loners as noise. Works out the number of groups by itself. |
| Feature vector / fingerprint | The short list of numbers describing how a trader trades (frequency, holding time, win rate, timing…).                                      |
| Distance metric              | The rule for measuring how far apart two fingerprints are. Here: euclidean (straight-line).                                                 |
| Feature window               | The period of activity used to build each fingerprint (currently 1 day).                                                                    |
| Cluster                      | A group of traders whose behaviour is similar enough to sit together.                                                                       |
| Noise                        | A trader who fits no group — set aside rather than forced into one.                                                                         |
| Outlier score                | A 0–1 measure of how unusual a trader is relative to the rest.                                                                              |
| Membership probability       | How strongly a trader belongs to their assigned cluster — near 1 for a core member, lower at the edge.                                      |
| High / Medium outlier        | Labels applied when the outlier score passes the high (0.79) or medium (0.49) threshold.                                                    |
| Auto-label hint              | The system’s automatic guess at what a cluster is (e.g. "scalper"), read from its average fingerprint, with a confidence.                   |
| Silhouette score             | A quality measure for a whole run — how cleanly separated the clusters are.                                                                 |
| Stability score              | How stable/persistent an individual cluster is.                                                                                             |
| Established cluster          | A mature, stable group.                                                                                                                     |
| Emerging cluster             | A newly-forming group, not yet established — worth watching.                                                                                |
| Mapped cluster               | A cluster that has been given a named archetype.                                                                                            |
| Centroid                     | The centre of gravity of a cluster — its average fingerprint.                                                                               |
| Drift                        | A cluster’s centroid moving over time as behaviour changes; flagged at warning or critical level.                                           |
| Min cluster size             | The smallest group that counts as a cluster (currently 5).                                                                                  |
| Min samples                  | How dense a core must be to anchor a cluster; higher = more noise (currently 3).                                                            |
| Auto Run                     | Whether clustering runs on a schedule. On by default — clustering runs automatically; set to Off to make it manual-only.                    |

## 14. Quick Reference — Settings

| **Setting**      | **Current** | **Permitted** | **What it controls**                                           |
|------------------|-------------|---------------|----------------------------------------------------------------|
| Min Cluster Size | 5           | 2–50          | Smallest group that counts as a cluster.                       |
| Min Samples      | 3           | 1–20          | How strict the density requirement is (higher = more noise).   |
| Distance Metric  | euclidean   | —             | How similarity between fingerprints is measured.               |
| Feature Window   | 1d          | 5m/1h/1d/…    | Period of activity used to build each fingerprint.             |
| Min Trades       | 10          | —             | Minimum trades to be included in the analysis.                 |
| Auto Run         | ON          | ON / OFF      | Runs automatically on a schedule (default); Off = manual only. |
| High Outlier ≥   | 0.79        | 0.0–1.0       | Score at/above which a trader is a high outlier.               |
| Medium Outlier ≥ | 0.49        | 0.0–1.0       | Score at/above which a trader is a medium outlier.             |

*End of document. Clustering tab — three of four in the Behaviour Rules
set (Classifier · Detection · Clustering · AI Model).*
