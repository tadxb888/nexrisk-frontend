---
id: task-traders
title: "Traders — operating guide"
type: task
domain: intel
module: focus
minLevel: VIEW
route: /flow
order: 7
source:
  - "Traders_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [traders,classification,risk,profile,cohort]
status: reviewed
version: intel-v3
---

## 1. About This Document

The Traders page is where everything the platform knows about a trader
comes together. The classifier decides what kind of trader they are; the
detection layer scores how risky; clustering groups them with their
peers; the Risk Charter decides what to do about them; and the AI Model
explains it all in plain English. The Traders page is the single screen
that synthesises those findings and presents them to the risk desk in a
form that can be acted on quickly.

Because it is the page a risk manager works from, this document explains
it in plain terms — with particular care on the four things that most
often need clarifying: the difference between Risk Score and Confidence,
what the behavioural metrics are and why they matter, where a
recommendation such as Monitor or Widen Spread actually comes from, and
how far the AI Model explanation should be trusted, including how long
it stays valid.

## 2. What the Traders Page Is

Every trader on the book generates activity the platform is constantly
assessing. On their own, the raw numbers are hard to act on at speed.
The Traders page turns them into a ranked, readable answer to the
question a risk manager actually asks: which traders need my attention,
how sure are we, and what should I do?

It does this by bringing five things into one place for each trader: a
**classification** (what kind of trader), a **Risk Score** (how
dangerous), a **Confidence** (how sure of the classification), a
**recommended action** (what to do), and a plain-English **explanation**
(why). The rest of this document takes each of those in turn.

## 3. The Page at a Glance

The page has two ways of looking at the same population:

- **The trader list** — every trader, ranked so the most concerning rise
  to the top, each row showing their classification, risk level, Risk
  Score, Confidence and recommended action at a glance. This is the
  triage view.

- **The trader detail** — open a trader to see the full picture: their
  risk figures, the behavioural evidence, the rules that fired, and the
  AI Model explanation.

- **The clusters view** — the same traders grouped into behavioural
  clusters (Section 9), for seeing patterns across the population rather
  than one trader at a time.

Traders are colour-coded by risk level — Critical, High, Medium, Low —
so the eye is drawn to what matters first.

## 4. Risk Score vs Confidence — the Two Numbers That Matter Most

These two numbers sit side by side and are easy to confuse, but they
answer completely different questions. Getting the distinction clear is
the single most useful thing on this page.

### 4.1 Risk Score — how dangerous

The Risk Score is a number from **0 to 100** answering "**how much of a
threat is this trader to the firm?**" A high score means a trader whose
behaviour is costly or toxic to hold; a low score means a trader who is
safe and probably profitable to keep internally. It is driven by the
trader’s behaviour and how dangerous their archetype is.

### 4.2 Confidence — how sure of the classification

Confidence is a **percentage** answering a different question: "**how
sure are we that this trader really is the type we have labelled
them?**" A confidence of 95% means the evidence for the classification
(scalper, EA, swing trader…) is strong and consistent; a lower
confidence means the trader’s behaviour is more ambiguous and the label
is a best guess.

### 4.3 The difference — they are independent

The key insight is that the two do not move together. A trader can be
any combination of risky/safe and certain/uncertain:

| **Trader (example)** | **Risk Score** | **Confidence** | **Read**                                                                      |
|----------------------|----------------|----------------|-------------------------------------------------------------------------------|
| Alpha Scalper Pro    | 94             | 97%            | Clearly a dangerous latency arbitrageur — and we are almost certain of it.    |
| Steady Eddie         | 25             | 92%            | Clearly a swing trader — and we are very sure — but a low threat.             |
| Momentum Chaser      | 48             | 72%            | A moderate threat, and we are less sure exactly what kind of trader they are. |

|                                                                                                                                                                                                                                                                                                                                        |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **In one sentence.** **Confidence** tells you how much to trust the **label**; **Risk Score** tells you how much to worry about the **trader**. "Steady Eddie" shows why you need both: we are 92% sure he is a swing trader, and that is precisely why his risk is low — high confidence in a benign archetype is good news, not bad. |

### 4.4 Effective Risk — the score after modifiers

Alongside the Risk Score you may see an **Effective Risk**, which is
usually equal to or a little higher. The Risk Score is the base
behavioural risk; Effective Risk is that score after any **modifier
flags** have been applied — extra risk factors (unusual conditions the
firm has defined) that bump the number up when they are present. It is
the Effective Risk that the recommendation is ultimately based on. When
no modifiers fire, the two are the same.

## 5. The Classification

The classification is the archetype the trader has been matched to — the
"what kind of trader" label that the Confidence figure refers to. Common
ones include:

| **Classification**      | **In plain terms**                                                            |
|-------------------------|-------------------------------------------------------------------------------|
| Latency Arbitrage       | Exploits tiny timing/price gaps — the most toxic flow to hold.                |
| Scalper / Micro Scalper | Very short holds, high frequency, small targets.                              |
| EA Trader               | Automated (algorithmic) trading.                                              |
| Grid / Martingale       | Position-averaging systems that add on adverse moves — large hidden exposure. |
| News Trader             | Concentrates activity around news events.                                     |
| Rebate Hunter           | Churns volume to harvest rebates.                                             |
| Swing Trader            | Multi-day, trend-following — generally benign.                                |
| Manual Retail           | Discretionary human trading — generally the safest.                           |

## 6. Behavioural Metrics — the Evidence

The classification and the Risk Score are not verdicts pulled from
nowhere — they rest on measured facts about how the trader trades. Those
facts are the behavioural metrics, and they matter here because they are
the evidence a risk manager can check for themselves. If the numbers
support the label, the assessment is trustworthy; if they do not, that
is a reason to look closer.

The main metrics, in plain terms:

| **Metric**                        | **What it measures**                             | **Why it matters**                                              |
|-----------------------------------|--------------------------------------------------|-----------------------------------------------------------------|
| Holding time                      | How long positions are kept open.                | Seconds = scalping/arbitrage; days = swing trading.             |
| Inter-trade time & its regularity | The gap between trades and how consistent it is. | Metronomic gaps point to automation (an EA/bot).                |
| Win rate                          | Share of trades that win.                        | A very high win rate on short holds flags toxic/arbitrage flow. |
| Profit factor                     | Gross profit ÷ gross loss.                       | How consistently profitable — the higher, the costlier to hold. |
| Lot size & its variety            | Average trade size and how uniform it is.        | Very uniform sizing suggests an algorithm.                      |
| Volume vs profit                  | Volume traded relative to profit.                | High churn for little profit can signal rebate abuse.           |
| Timing regularity                 | How rhythmic the trading is overall.             | High regularity is machine-like.                                |
| News-window activity              | How much trading clusters around news.           | Flags news trading.                                             |
| Session & weekend exposure        | When in the day/week they trade.                 | Concentration patterns characterise the archetype.              |
| Stop / target distances           | Typical stop-loss and take-profit sizes.         | Tight, consistent levels suggest systematic execution.          |

These are what the classifier reads to decide the archetype and what the
risk scoring weighs to decide the threat. On the page they let a risk
manager sanity-check the machine: a "scalper" label next to a two-second
average hold time and a high win rate is self-evidently sound.

## 7. The Recommended Action — Where Monitor and Widen Spread Come From

Each trader carries a recommended action — Monitor, Widen Spread, route
to the A-Book, and so on. These do not come from the AI Model, and they
are not invented per trader. They come **directly from the Risk
Charter** (the risk-policy matrix): the trader’s archetype and profit
factor are looked up in the matrix, which returns the risk level and the
action the firm has decided to take for that combination. The Traders
page simply surfaces that decision.

The common recommendations and what they mean:

| **Recommendation**       | **What it means for the trader**                                |
|--------------------------|-----------------------------------------------------------------|
| B-Book (Safe / Standard) | Keep the flow internal — low risk, no special handling.         |
| Monitor                  | Keep internal but watch closely, with enhanced alerts.          |
| Widen Spread             | Keep the flow but widen pricing to reduce the firm’s edge loss. |
| A-Book Partial           | Route part of the flow out to a liquidity provider.             |
| A-Book Full              | Route all of the flow out — shed the risk entirely.             |

Because the recommendation comes from the Charter, it is fully
traceable: the detail view lists the **rules that fired** for that
trader (for example, "high-frequency scalping detected" or "win rate
exceeds threshold"), so a manager can see exactly why a given action was
proposed. For the full logic behind these actions and how they are
governed, see the Risk Charter guide — this page is where its decisions
are applied to real traders.

|                                                                                                                                                                                                                                                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A recommendation is a proposal, not an automatic action.** Nothing on this page routes, widens or freezes on its own. The recommendation tells the risk manager what the policy suggests; a person decides and carries it out. The heavier actions require approval and manual execution. |

## 8. The AI Model Explanation

Next to the numbers, most higher-risk traders carry a written,
plain-English explanation produced by the Taiga-powered AI Model. This
is the part that turns a screen of figures into something you can read
and act on in seconds — but it also needs the clearest understanding of
what it is and is not.

### 8.1 What it is

The AI Model reads the same underlying evidence a risk manager would —
the classification, the Risk Score, the behavioural metrics, the rules
that fired — and writes a short narrative that ties them together: what
this trader appears to be doing, why it is risky, and what to consider.
It is a synthesis of the data into prose, not a separate opinion pulled
from thin air.

### 8.2 Its purpose

Its job is speed and clarity. A risk manager triaging a long list cannot
study every metric on every trader; a two-paragraph explanation lets
them grasp a trader’s situation at a glance and move on or dig in. It
makes the numbers actionable.

### 8.3 The three kinds of explanation you will see

| **Type**             | **When it appears**                                                                                                                                                            |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| AI Model explanation | A full written narrative — generated automatically for the higher-risk traders (per the AI Model routing), or on demand via an "explain" button.                               |
| Template explanation | A short, standard summary for lower-risk traders where a full AI write-up is not generated automatically — available, with an on-demand button to generate the fuller version. |
| Triggered rules      | The plain list of which policy rules fired — always present, and the most literal "why".                                                                                       |

### 8.4 How reliable is it — should it be trusted blindly?

**No — and it is important to be clear about this.** The explanation is
a decision-support aid, not ground truth. It is grounded in the real
metrics, so it is usually a faithful and useful summary — but it is
still an **interpretation**, and an interpretation can be confidently
worded and still be incomplete or wrong. The reliable, hard facts on the
page are the **numbers**: the Risk Score, the Confidence, the
behavioural metrics, and the rules that fired. The explanation is the
readable story around those facts.

The right habit is: let the explanation orient you quickly, then verify
against the metrics before doing anything consequential. If the
explanation says "classic scalper" and the holding times and frequency
agree, trust it. If the narrative and the numbers disagree, trust the
numbers and look closer. Treat it as you would a well-briefed junior
analyst’s summary — valuable, worth reading first, but checked before
you act on it.

### 8.5 How long is it valid? Staleness and review

An explanation is **not valid forever**. It is a snapshot, written from
the trader’s data at a particular moment, and it is stamped with when it
was generated. Meanwhile the trader keeps trading and their behaviour
data is refreshed continuously in the background. So the platform
**keeps checking every explanation against the freshness of the
underlying data**, and when the data has moved on since the explanation
was written, it marks the explanation **stale**.

A stale explanation is flagged plainly to the risk manager — for
example, "**Behaviour data updated 3 hours ago. Consider regenerating
for current analysis.**" — and a **Regenerate** action is offered to
produce a fresh one from the latest data. The explanation is never
silently trusted past its freshness; the staleness is surfaced so a
person can decide whether an update is worth it.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>So, in answer to "how long is it good for?"</strong></p>
<p>• It is valid as of the moment it was generated (its timestamp is
shown).</p>
<p>• It is <strong>reviewed continuously</strong> against fresh
behaviour data — not trusted blindly for an hour or forever.</p>
<p>• When the data has changed, it is <strong>flagged stale</strong>
with a clear warning and the age of the newer data.</p>
<p>• The risk manager regenerates it on demand to refresh — the decision
to update stays with the human.</p></td>
</tr>
</tbody>
</table>

This is why the timestamps and stale warnings matter: they are the page
telling you how much to trust what you are reading, and prompting a
refresh exactly when the picture may have changed.

## 9. The Clusters View

Beyond individual traders, the page can show the **clusters** the
population naturally forms — the groups discovered by the clustering
engine. Each cluster shows a suggested archetype name, how many members
it has, its typical risk severity, its average Risk Score, and a plain
description (for example, "Micro Scalpers — ultra-short hold times,
high-frequency execution"), with the member traders listed.

This is the population-level companion to the per-trader view: instead
of "is this trader risky?", it answers "what kinds of traders do we
have, and how big and how risky is each group?" A cluster with a high
average Risk Score and many members is a concentration worth
understanding. For how these groups are formed, see the Clustering
guide.

## 10. Acting on the Page — the Risk Manager’s Workflow

Put together, the page supports a fast, repeatable triage:

1.  **Scan the list.** The riskiest traders are at the top,
    colour-coded. Start there.

2.  **Read the two numbers.** Risk Score for how much to worry;
    Confidence for how sure the label is. Low confidence on a high score
    means "worth a closer human look".

3.  **Check the evidence.** Glance at the behavioural metrics — do they
    support the classification and the score?

4.  **Read the explanation — then verify.** Let it orient you fast;
    confirm against the metrics before acting. Watch for a stale flag;
    regenerate if the data has moved.

5.  **Act via the recommendation.** The recommended action is the
    policy’s proposal; apply it (with approval where required). The
    rules that fired show why.

The whole design goal of the page is to make that loop fast — which is
why the synthesis, the ranking, and the plain-English explanation exist.

## 11. How It All Connects

The Traders page is the meeting point of the whole Behaviour Rules and
Risk Policy stack:

- **Classifier** — provides the classification and the Confidence.

- **Detection** — provides the Risk Score and the risk level.

- **Clustering** — provides the group view.

- **Risk Charter** — provides the recommended action and the rules that
  fired.

- **AI Model** — provides the plain-English explanation.

None of those, on its own, is enough to act quickly. The Traders page is
where they become one decision.

## 12. Quick Reference

| **Term**             | **Plain meaning**                                                                                        |
|----------------------|----------------------------------------------------------------------------------------------------------|
| Risk Score           | How dangerous the trader is to the firm (0–100).                                                         |
| Effective Risk       | The Risk Score after modifier flags (extra risk factors) are applied — what the recommendation uses.     |
| Confidence           | How sure the platform is that the classification (archetype) is correct (a percentage).                  |
| Classification       | The archetype the trader is matched to (scalper, EA, swing trader…).                                     |
| Risk level           | The severity band — Low / Medium / High / Critical.                                                      |
| Recommended action   | What the Risk Charter says to do (Monitor, Widen Spread, A-Book…) — a proposal, not an automatic action. |
| Triggered rules      | The specific policy rules that fired for this trader — the literal "why".                                |
| Behavioural metrics  | The measured facts about how the trader trades — the evidence behind the label and score.                |
| AI Model explanation | A plain-English synthesis of the evidence — a decision-support aid, to be verified, not trusted blindly. |
| Stale                | The explanation is older than the latest behaviour data; a warning is shown and it can be regenerated.   |
| Cluster              | A discovered group of behaviourally-similar traders.                                                     |

*End of document.*
