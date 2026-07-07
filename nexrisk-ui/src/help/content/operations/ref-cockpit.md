---
id: ref-cockpit
title: "Cockpit — operating guide"
type: reference
domain: operations
module: cockpit
minLevel: VIEW
route: /
order: 1
source:
  - "Cockpit_Executive_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [cockpit, dashboard, cards, tiles, pnl, take-home, cost-ratio, risk, hedge, nexday, markup, rebates]
status: reviewed
version: summary-v3
---

## 1. About This Guide

The Cockpit is the platform’s front page — the business at a glance. It
answers, on one screen, the three questions an executive asks first: are
we making money, where is our risk, and what is coming next. This guide
explains all nine cards in plain language, with a worked example for
each, so the board can be read confidently without a trading background.

The page is titled **“The business at a glance — money, risk, coverage,
and what’s next.”** Each card carries a small information icon, and a
**Help** link at the top opens the same explanations in more depth. This
guide is the executive-level version of that help.

## 2. How to Read the Cockpit

Nine cards sit in a three-by-three grid, arranged in three themes — top
row Money, middle row Risk, bottom row What’s Next. Each card poses a
question and answers it in three short lines.

**Colour is the fastest read.** Across the board, colour carries the
same meaning:

**Green** = good / on track. **Amber** = worth a look. **Red** =
attention needed. A dash (—) means "no data yet", not zero.

**Freshness.** The money and risk figures update **live**. The
trader-risk card refreshes about once a minute. The three prediction
cards refresh through the day, with the daily ones set each evening. One
card even shows its own "last update" so you know the predictions are
current.

### 2.1 A one-minute primer: the three books

Several risk cards refer to the A, B and C books. In plain terms:

- **A-Book** — client trades passed straight through to a liquidity
  provider. The firm earns a spread but carries no market risk on them.

- **B-Book** — client trades the firm keeps in-house. The firm profits
  when clients lose and loses when they win, so **this is where the
  firm’s market risk sits**. When a risk card asks "where is my risk",
  it means the B-Book.

- **C-Book** — an automatically-hedged book that sits between the two:
  positions are covered at the trade level, so it should quietly
  contribute without adding much risk.

## 3. Theme 1 — Money

The top row answers: are we making money, and how much of it do we
actually keep?

### 3.1 Money

*“How much are we making today and this month?”*

| **On the card**     | **What it tells you**                                                                                                   |
|---------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Today: Net P&L**  | The profit or loss across all books so far today, before business costs. **Green** above +$10K, **red** below −$10K.  |
| **MTD: Net P&L**    | The same figure summed from the 1st of the month to now — the headline number for the month.                            |
| **MTM Performance** | How this month compares to the same day last month, as a percentage. Green means ahead of last month; red means behind. |

|                                                                                                                                                                                                                                            |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** Today reads **+$2,643**, month-to-date **+$48,673**, and performance **+41.1%**. Reading: a modest profit today, a solid month, and — most tellingly — the firm is 41% ahead of where it stood on this same date last month. |

**Bottom line:** The pulse of the business. A large red today is "the
day" — turn to **Where Is My Risk** and **Who Is My Risk** to find the
cause. Note this figure is **before costs**; the next card takes those
out.

### 3.2 Take-Home & Costs

*“How much actually reaches the bottom line?”*

| **On the card**      | **What it tells you**                                                                                                                                                                                  |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Take-Home**        | Profit after the real costs of doing business — commissions paid to providers, overnight swap charges, and rebates paid to introducing brokers. The closest number to what lands on the P&L statement. |
| **Cost Ratio**       | How much of gross revenue costs are eating. **Green** below 30%, **amber** 30–60%, **red** above 60%.                                                                                                  |
| **Effective Margin** | Take-home as a share of gross — the profitability of the flow. **Green** above 40%, **red** below 0% (costs turned a gross profit into a loss).                                                        |

|                                                                                                                                                                                                                             |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** Gross was **$100K** but costs ran **$45K**. Cost Ratio is 45% (*amber*), take-home is $55K, effective margin 55% (*green*). Healthy, but the amber cost ratio is a nudge to check commission and swap terms. |

**Bottom line:** A red margin sitting on top of a green gross is a
**costs problem, not a trading problem** — the fix is negotiating
commissions or auditing charges, not changing how the desk trades.

### 3.3 Markup vs Rebates

*“Are we earning more in markup than we pay in rebates?”*

| **On the card** | **What it tells you**                                                                                                        |
|-----------------|------------------------------------------------------------------------------------------------------------------------------|
| **Markup MTD**  | The spread revenue the firm earned on flow this month — "we charged a spread and it stuck." Should grow roughly with volume. |
| **Rebates MTD** | What the firm paid out to introducing brokers and affiliates this month. Watch for unexpected spikes.                        |
| **Net MTD**     | Markup minus rebates — the bottom line of the pricing book. Should be **positive** over any reasonable window.               |

|                                                                                                                                                                                                                                                  |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** Markup **$120K**, rebates **−$40K**, net **+$80K**. The pricing engine is paying for itself three times over. If net ever goes *red*, the firm is paying partners more than its pricing earns — a structural problem to escalate. |

**Bottom line:** This card proves the **pricing economics** are sound. A
sudden rebate jump can signal a new partner, a config error, or
something worth auditing.

## 4. Theme 2 — Risk

The middle row answers: who is exposing us, is the hedging desk earning
its seat, and which instruments carry the danger?

### 4.1 Who Is My Risk

*“Which traders are exposing us, and how?”*

| **On the card**               | **What it tells you**                                                                                                                                                                        |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Critical traders**          | How many traders are currently scored at the highest risk level. **Green** at zero, **red** above zero. Click to see exactly who.                                                            |
| **Behavioral classification** | A count of the two most severe risk levels — Critical and High. (Lower levels are hidden as executive noise.) A rising High count week over week signals the trading population is shifting. |
| **Active risk clusters**      | Recognised patterns of behaviour detected across many traders at once — for example martingale, news-scalping or grid styles. A brand-new pattern appearing is worth investigating.          |

|                                                                                                                                                                                                               |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "**2 Critical**, 5 High, clusters: Martingale +1 more." Two traders need eyes on them now, a martingale pattern is active across a group, and the High count is the early-warning trend to track. |

**Bottom line:** Puts a name on the risk. If something goes wrong, this
card tells you whose desk to look at first.

### 4.2 Risk Manager Performance

*“Is the coverage strategy adding value?”*

| **On the card**         | **What it tells you**                                                                                                                                                                       |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A-Book hedge yield**  | How much the firm earns per million hedged. **Green** when positive; **red** means the firm is losing money on its hedges.                                                                  |
| **Hedge coverage**      | The share of in-house (B-Book) intake that was hedged out — the dial between keeping risk and passing it on. **Green** inside policy (around 30–70%), **amber** or **red** at the extremes. |
| **C-Book contribution** | What the automatically-hedged book added, as a share of combined earnings. It should quietly contribute; a rising share is good, a negative one means the auto-hedge needs review.          |

|                                                                                                                                                                                                           |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "**+$5K per $1M** hedged, **42% hedged**, C-Book +$8K." Hedges are profitable, coverage sits comfortably in policy, and the auto-hedged book is chipping in. The desk is earning its seat. |

**Bottom line:** Grades the hedging desk. Low coverage means more risk
is being kept (cross-check the next card); very high coverage means the
firm may be giving away too much markup.

### 4.3 Where Is My Risk

*“Which symbols are exposing us?”*

*This card looks only at the B-Book — the in-house book — because that
is where the firm’s balance-sheet risk lives.*

| **On the card**        | **What it tells you**                                                                                                               |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Top losing symbol**  | The single instrument costing the firm the most this month in the in-house book.                                                    |
| **1% move impact**     | A stress test: what the firm would lose if every in-house position moved 1% against it at once. A "what if" number, not a forecast. |
| **Largest 1-day risk** | An estimate of the worst realistic one-day loss (this measure is being built out; it may read "Collecting data").                   |

|                                                                                                                                                                                                                                                                          |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "Top losing symbol: none this month; **1% move impact −$41,904**." No single instrument is bleeding, but if the whole in-house book moved 1% the wrong way at once, the firm would be down about $42K. That is the size of the bet currently on the table. |

**Bottom line:** Tells you **where** the danger is concentrated. A large
stress number in a calm market means the firm is carrying a lot of
in-house weight — a prompt to tighten hedging.

## 5. Theme 3 — What’s Next

The bottom row is forward-looking. It surfaces the platform’s predictive
engine, **NexDay** (powered by a model referred to as GoPredict), so the
desk can see where tomorrow’s surprises and opportunities might come
from. These are **signals to consider, not instructions**.

### 5.1 NexDay · Daily Outlook

*“If GoPredict is right, where does today end up?”*

| **On the card**              | **What it tells you**                                                                                                                          |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| **Top losing predicted**     | The instrument the model expects to fall the most today (limited to instruments the firm trades).                                              |
| **Developing opportunities** | Instruments that have just changed direction and whose momentum confirms the new move — early-stage trends, a 1–3 day head start.              |
| **Momentum shifts**          | Instruments whose momentum is turning ("tilting up / down / reversed") but where the model has not yet flipped — a pre-confirmation watchlist. |

|                                                                                                                                                                                                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "Top losing predicted: **GOLD ↓0.1%**; developing: EURGBP, EURJPY, EURUSD +8 more." If the firm carries in-house gold exposure, that is a prompt to consider hedging; the developing list is where tomorrow’s trends may start. |

**Bottom line:** Where today’s surprises might come from. Actionable
only where the firm actually has exposure or capacity; otherwise
informational.

### 5.2 NexDay · Intraday Signals

*“What is GoPredict saying right now?”*

| **On the card**      | **What it tells you**                                                                                                                                            |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Up Co-Trending**   | How many instruments the model reads as heading **up** across all four short timeframes at once — its strongest collective up signals.                           |
| **Down Co-Trending** | The same, heading **down** on all four timeframes — its strongest collective down signals.                                                                       |
| **Last update**      | How long ago the latest prediction landed. **Under 30 min** is healthy; **30 min–4 hrs** investigate; **over 4 hrs** the signals are stale — do not act on them. |

|                                                                                                                                                                                                         |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "**6 Up** (EURAUD, +2 more), **4 Down**, last update 8 min ago." The model is confidently long six instruments and short four, and the data is fresh, so the read is trustworthy right now. |

**Bottom line:** The model’s live conviction. Always check **Last
update** first — if it is red, treat the counts as out of date.

### 5.3 NexDay · Best Opportunities

*“What should we be acting on?”*

| **On the card**     | **What it tells you**                                                                                                                                |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Top opportunity** | The model’s single best idea for today (among instruments the firm trades), with direction and a conviction score. **Green** if up, **red** if down. |
| **Hottest**         | The small set of highest-conviction ideas. Should be a short, focused list — if it swells to fifteen-plus names, something is off.                   |
| **Strong tier**     | The next tier of solid-but-not-top ideas — useful for diversification or when the hottest list is empty.                                             |

|                                                                                                                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Example** "Top: **USDCAD ↑ Strong · 70.2**; hottest: USDCAD, GOLD, XAUUSD +1 more." The model’s best single idea is long USDCAD with a strong score, and its high-conviction shortlist is tight — a sensible starting point for the desk, not a directive. |

**Bottom line:** The model’s best ideas, ranked. A **starting point**
for a directional decision — the desk still applies judgement and
sizing.

## 6. Reading the Whole Board in Sixty Seconds

An executive glance moves across the three themes:

- **Money row.** Are today and the month green, and does take-home
  survive costs? A green month with a green margin means the engine is
  running well.

- **Risk row.** Any critical traders? Is coverage in policy? How big is
  the 1% stress number? This is the "what could hurt us" scan.

- **What’s-Next row.** Anything predicted to move against our exposure,
  and is the data fresh? This is the "what to watch" scan.

If every card is green or benign, the business is healthy and nothing
needs a decision. The value of the Cockpit is that the one card that is
not green draws the eye immediately — and each card tells you exactly
which page to open next to act.

## 7. Quick Reference

### 7.1 The nine cards

| **On the card**               | **What it tells you**                                  |
|-------------------------------|--------------------------------------------------------|
| **Money**                     | Profit today and this month, and versus last month.    |
| **Take-Home & Costs**         | What survives after commissions, swaps and rebates.    |
| **Markup vs Rebates**         | Spread earned versus rebates paid — pricing economics. |
| **Who Is My Risk**            | Which traders are dangerous, by behaviour and pattern. |
| **Risk Manager Performance**  | Whether the hedging desk is adding value.              |
| **Where Is My Risk**          | Which in-house instruments carry the exposure.         |
| **NexDay Daily Outlook**      | Predicted movers and developing trends for today.      |
| **NexDay Intraday Signals**   | What the model is collectively certain of right now.   |
| **NexDay Best Opportunities** | The model’s ranked best ideas to consider.             |

### 7.2 Colour and freshness

**Green** good · **Amber** watch · **Red** attention · — no data yet
(not zero).

Money and risk figures are **live**; the trader card refreshes about
once a minute; predictions refresh through the day, with the "last
update" line on the intraday card as the freshness check.

*End of guide.*
