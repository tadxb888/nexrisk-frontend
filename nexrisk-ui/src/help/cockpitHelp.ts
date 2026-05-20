/**
 * Cockpit help content.
 * Single source of truth for both the per-card help modal and the
 * dedicated /cockpit/help page. Edit here once, both surfaces update.
 *
 * Audience: risk manager / dealing desk lead.
 * Depth: per-row breakdown + thresholds + action guidance.
 * Tone: direct, declarative, FX-comfortable.
 */

export interface HelpRow {
  label:           string;
  whatItShows:     string;
  howCalculated:   string;
  colorThresholds: string;
  whatToDo:        string;
}

export interface CardHelp {
  cardId:          string;
  title:           string;
  oneLineSummary:  string;
  whatItAnswers:   string;
  scope:           string;
  refresh:         string;
  rows:            HelpRow[];
  extras?:         Array<{ heading: string; bodyMarkdown: string }>;
  gotchas:         string[];
}

export const COCKPIT_HELP: Record<string, CardHelp> = {

  // ─────────────────────────────────────────────────────────────────────
  card1: {
    cardId:         'card1',
    title:          'Money',
    oneLineSummary: 'Net P&L across all books — today, MTD, and how MTD compares to the same point last month.',
    whatItAnswers:  'Are we making money today, this month, and is this month tracking better or worse than last?',
    scope:          'All books (A + B + C net).',
    refresh:        'Live (WebSocket).',
    rows: [
      {
        label:           'Today Net P&L',
        whatItShows:     'Realized + unrealized P&L across all books for today\'s session, gross of business costs.',
        howCalculated:   'Sum of (realized + unrealized) across A, B, and C books. Commissions, swaps, and rebates are not subtracted here — those land on Card 2.',
        colorThresholds: 'Green above +$10K. Red below −$10K. Neutral in between.',
        whatToDo:        'A large red figure means today is the day. Investigate via Card 3 (which symbol) and Card 4 (which trader).',
      },
      {
        label:           'MTD Net P&L',
        whatItShows:     'Same calculation as Today, summed from month-start through now.',
        howCalculated:   'Aggregated realized + unrealized across all books from the 1st of the current month.',
        colorThresholds: 'Same thresholds as Today.',
        whatToDo:        'This is the headline number for the month. It drives the comparison in Row 3.',
      },
      {
        label:           'MTM Performance %',
        whatItShows:     'How current MTD stacks up against the same point last month — month-of-month performance.',
        howCalculated:   '(current_MTD − prior_month_at_same_DOM) / |prior_month_at_same_DOM| × 100. Absolute value in the denominator keeps the sign correct when last month was a loss.',
        colorThresholds: 'Green if better than last month; red if worse.',
        whatToDo:        'A positive number on a negative MTD = losing less than last month (still good news). A negative number on a positive MTD = earning less than last month (worth a look).',
      },
    ],
    gotchas: [
      'Net P&L here is *gross of costs*. Take-Home (net of costs) is on Card 2.',
      'The MTD comparison is *day-of-month aligned* — comparing day 15 of this month to day 15 of last month, not full month vs partial.',
      'If the prior month\'s same-point P&L was effectively zero, Row 3 renders as `—`.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card2: {
    cardId:         'card2',
    title:          'Take-Home & Costs',
    oneLineSummary: 'What we actually keep after commissions, swaps, and rebates — and how much of gross gets eaten.',
    whatItAnswers:  'Of the money the books made, how much survived business costs?',
    scope:          'All books, all costs.',
    refresh:        'Live (WebSocket).',
    rows: [
      {
        label:           'Take-Home MTD',
        whatItShows:     'Net P&L minus business costs — commissions paid to the LP, swaps charged on overnight positions, rebates paid to IBs.',
        howCalculated:   'realized + unrealized + commissions + swaps + rebates, all signed. Commissions and rebates are typically negative; swaps can go either way.',
        colorThresholds: 'Green if positive, red if negative.',
        whatToDo:        'Closest single number to "what shows on the P&L statement". Trend matters more than any single day.',
      },
      {
        label:           'Cost Ratio',
        whatItShows:     'How much of gross revenue is consumed by costs.',
        howCalculated:   '|costs| / |gross| × 100. Both terms are absolute values — keeps the ratio interpretable regardless of sign.',
        colorThresholds: 'Green below 30%. Yellow 30%–60%. Red above 60% — costs are eating most of the revenue.',
        whatToDo:        'Persistent red is a signal to negotiate commissions or audit swap charges. Yellow is normal in slow months when gross compresses — not always actionable.',
      },
      {
        label:           'Effective Margin',
        whatItShows:     'Take-Home as a percentage of gross revenue. The inverse view of Cost Ratio.',
        howCalculated:   'take_home / |gross| × 100. Signed.',
        colorThresholds: 'Green above +40%. Yellow 0%–40%. Red below 0% (losing money even though gross was positive).',
        whatToDo:        'A red margin on a green gross is a costs problem, not a trading problem.',
      },
    ],
    gotchas: [
      'Cost Ratio uses absolute gross — a $1M gross loss eaten by $300K in costs still reads as 30%, not 130%. It\'s "how much of the flow are costs taking", not "are costs bigger than what we made".',
      'Effective Margin can exceed 100% if costs were net positive (rebates received exceeded commissions paid). Real but uncommon.',
      'If gross is below $50K, all three rows render as `—`. The $50K floor suppresses ratios that go unstable on tiny denominators.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card3: {
    cardId:         'card3',
    title:          'Where Is My Risk',
    oneLineSummary: 'Where money could leave the firm today — concentrated B-Book symbols and stress impact.',
    whatItAnswers:  'If something goes wrong, what symbol is exposing us most?',
    scope:          '**B-Book only.** A-Book is externalized — doesn\'t expose us. C-Book is hedged at the trade level. The risk on our balance sheet is B-Book.',
    refresh:        'Live (WebSocket symbol exposure feed).',
    rows: [
      {
        label:           'Top losing symbol',
        whatItShows:     'The single B-Book symbol with the worst combined realized + unrealized P&L month-to-date.',
        howCalculated:   'For each symbol with B-Book positions: realized (from closed deals this month) + unrealized (from open positions). Pick the most negative.',
        colorThresholds: 'Red. Always — this row only shows when there is a loser.',
        whatToDo:        'If the loss is material (say, > 5% of MTD gross), open the symbol\'s exposure detail. The trader or cluster behind it usually shows up on Card 4.',
      },
      {
        label:           '1% adverse move impact',
        whatItShows:     'How much we\'d lose if every open B-Book position moved 1% against us simultaneously. Stress number, not a forecast.',
        howCalculated:   'Sum across open B-Book positions of (lots × contract_size × symbol_price), converted to USD via each symbol\'s profit currency, then × 0.01.',
        colorThresholds: 'Red above −$50K stress impact. Yellow −$20K to −$50K. Neutral below.',
        whatToDo:        'Scales with total open exposure. A large number in a quiet market means we\'re carrying too much B-Book weight — consider tightening hedge thresholds.',
      },
      {
        label:           'Expected Shortfall (95%)',
        whatItShows:     'Currently `Collecting data…`. The ES engine is in development.',
        howCalculated:   'Will compute the average loss in the worst 5% of historical scenarios for current B-Book exposure, once `risk.symbol_daily_returns` history is online.',
        colorThresholds: 'Pending implementation.',
        whatToDo:        'Pending.',
      },
    ],
    gotchas: [
      'The "1% adverse" stress doesn\'t model correlation. If EURUSD and GBPUSD fell 1% together, real stress could be smaller (correlated hedges) or larger (correlated losses). Order-of-magnitude check, not a precise number.',
      'Symbols with missing currency data in `risk.symbols` fall back to name-parsing (e.g. "EURUSD" → profit ccy USD). Usually right; flag anything that looks suspiciously zero.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card4: {
    cardId:         'card4',
    title:          'Who Is My Risk',
    oneLineSummary: 'Which traders are dangerous right now — by behavior and by cluster.',
    whatItAnswers:  'If we have a problem, whose name is on it?',
    scope:          'All traders across all monitored MT5 nodes.',
    refresh:        'Polled every 60 seconds (REST).',
    rows: [
      {
        label:           'Critical traders',
        whatItShows:     'Count of traders currently classified as `overall_risk_level = CRITICAL`.',
        howCalculated:   'Traders are continuously scored against `risk_matrix_rules` by behavior type (martingale, scalper, grid, etc.) using profit-factor bands. When a trader\'s profile triggers the CRITICAL band, they land here.',
        colorThresholds: 'Red if > 0. Green if 0.',
        whatToDo:        'Click the number to jump to the B-Book page pre-filtered to these traders\' login IDs. Common triggers: martingale escalation, sustained win streaks, unusual session timing.',
      },
      {
        label:           'Behavioral classification',
        whatItShows:     'Counts of traders at the two most severe levels: Critical and High. MEDIUM and LOW are intentionally hidden — exec-level noise.',
        howCalculated:   'Same engine as Row 1. Counts CRITICAL and HIGH separately.',
        colorThresholds: 'Each count tinted by severity — red Critical, yellow High.',
        whatToDo:        'Click either count to open Trader Intelligence filtered to that severity. Trend matters more than absolute number — if High counts climb week-over-week, something in the trading population is shifting.',
      },
      {
        label:           'Active risk clusters',
        whatItShows:     'Distinct cluster archetypes detected in the most recent HDBSCAN clustering run.',
        howCalculated:   'After each clustering run completes, traders get assigned to clusters; clusters get mapped to known archetypes (Martingale, News Scalper, Grid, etc.). Shows names of effective archetypes.',
        colorThresholds: 'Neutral. First cluster name shown; "+N more" if longer.',
        whatToDo:        'Click for the Clusters tab. If a new archetype appears that wasn\'t there last week, investigate — sometimes a market regime change manifests as a new behavior pattern across many traders.',
      },
    ],
    gotchas: [
      'Trader classification is a *materialized* result. The trader_strategy_summary table is recomputed on schedule, not in real time. A new CRITICAL trader in the last hour may not show up immediately.',
      'Clusters refresh only when a clustering run completes — typically nightly. Mid-day, the cluster list reflects last night\'s snapshot.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card5: {
    cardId:         'card5',
    title:          'Risk Manager Performance',
    oneLineSummary: 'How well the hedging desk is doing — yield, coverage, and C-Book contribution.',
    whatItAnswers:  'Is the risk manager earning their seat?',
    scope:          'A-Book net revenue + **B-Book** gross intake (denominator for hedge ratio) + C-Book net revenue.',
    refresh:        'Live (WebSocket).',
    rows: [
      {
        label:           'A-Book yield per $1M hedged',
        whatItShows:     'Net revenue from A-Book divided by notional volume hedged, scaled to $1M, with total hedged volume alongside.',
        howCalculated:   'A.net_revenue_usd / A.net_hedged_nv_usd × $1M. Display format: "+$5K / $1M NV → $12M total".',
        colorThresholds: 'Green if positive yield. Red if negative (losing money on hedges).',
        whatToDo:        'Low or negative yield on high volume means the hedging strategy or LP pricing is bleeding — review LP quotes and routing logic. High yield on low volume might mean we\'re under-hedging (see Row 2).',
      },
      {
        label:           '% hedged of B-Book intake',
        whatItShows:     'How much of B-Book gross intake (notional volume) was hedged out. The dial between absorbing risk and externalizing it.',
        howCalculated:   'A.net_hedged_nv_usd / B.gross_intake_nv_usd × 100. Display: "42% hedged → $12M / $28M intake".',
        colorThresholds: 'Green within policy band (typically 30%–70%). Yellow outside. Red at either extreme.',
        whatToDo:        'Below 30% — we\'re carrying more B-Book risk than usual; cross-check with Card 3. Above 70% — we\'re externalizing too much and giving away markup; revisit hedge thresholds.',
      },
      {
        label:           'C-Book contribution',
        whatItShows:     'Net revenue from the C-Book (auto-hedged book) as a share of combined A+C revenue, with the C dollar value alongside.',
        howCalculated:   'C.net_revenue_usd / (A.net_revenue_usd + C.net_revenue_usd) × 100. Display: "+$8K · 28% of $28K A+C".',
        colorThresholds: 'Green if positive. Red if negative.',
        whatToDo:        'C-Book is "set and forget" — should quietly contribute. Rising share = auto-hedge logic is finding alpha; consider more allocation. Negative = auto-hedge is misfiring; review the logic.',
      },
    ],
    gotchas: [
      'Row 2\'s ratio can read negative if A.net_hedged_nv_usd is negative (rare data anomaly). Investigate, don\'t act.',
      'A-Book net revenue is the markup spread captured — not the same as A-Book trade P&L. Related but distinct concepts.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card6: {
    cardId:         'card6',
    title:          'Markup vs Rebates',
    oneLineSummary: 'Spread markup earned versus rebates paid — and the net of both.',
    whatItAnswers:  'Is our pricing economics positive?',
    scope:          'All books for rebates (A, B, C). Markup is A + C only — B\'s earnings include the spread internally as part of trade P&L.',
    refresh:        'Live (WebSocket).',
    rows: [
      {
        label:           'Markup MTD',
        whatItShows:     'Total markup revenue from spread across A-Book and C-Book, month-to-date.',
        howCalculated:   'A.net_revenue_usd + C.net_revenue_usd.',
        colorThresholds: 'Green if positive. Red if negative (rare — would indicate negative spread net of LP costs).',
        whatToDo:        '"We charged a spread and it stuck." Should grow roughly linearly with total volume.',
      },
      {
        label:           'Rebates MTD',
        whatItShows:     'Total rebates paid out to Introducing Brokers and affiliates, month-to-date.',
        howCalculated:   'A.rebates + B.rebates + C.rebates. Signed — rebates paid out are negative; rebates received are positive. Most months: negative.',
        colorThresholds: 'Neutral. Size matters relative to Markup, not in absolute terms.',
        whatToDo:        'Monitor for unexpected spikes. A sudden jump could mean a new IB onboarded, a fraudulent rebate scheme, or a config error.',
      },
      {
        label:           'Net MTD',
        whatItShows:     'Markup + Rebates (rebates being signed). Bottom line of the pricing book.',
        howCalculated:   'Markup MTD + Rebates MTD.',
        colorThresholds: 'Green above zero. Red below.',
        whatToDo:        'Should always be positive over any reasonable window. If negative, we\'re paying more in rebates than we\'re earning in markup — structural problem.',
      },
    ],
    gotchas: [
      'Rebate sign convention: paid-out rebates are negative in the database, so adding to markup subtracts them. Confirm direction if any number looks counterintuitive.',
      'A single large rebate settlement (annual true-up, for example) can distort the MTD picture. Check deal history before drawing conclusions from a one-month view.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card7: {
    cardId:         'card7',
    title:          'NexDay · Daily Outlook',
    oneLineSummary: 'Today\'s read from GoPredict — biggest predicted loser, fresh reversals, and momentum shifts to watch.',
    whatItAnswers:  'Where might today\'s surprises come from?',
    scope:          '**Mapped symbols only** (broker tradeable set). NexDay covers symbols we don\'t necessarily trade; this card filters to those we do.',
    refresh:        'Once daily, ~17:01 ET (5 days/week, Sun–Thu).',
    rows: [
      {
        label:           'Top losing predicted',
        whatItShows:     'The mapped symbol with the most negative predicted move for today.',
        howCalculated:   'Most-negative `predicted_strength` from `nexday.predictions_daily`, filtered through `nexday.symbol_mappings`. Display: MT5 symbol + ↓ percentage delta of predicted_close vs typical_price.',
        colorThresholds: 'Red.',
        whatToDo:        'If we have meaningful B-Book exposure on this symbol, consider hedging or tightening stops. If we don\'t, informational only.',
      },
      {
        label:           'Developing opportunities',
        whatItShows:     'Symbols where the model just reversed direction (1–3 days ago) AND the momentum text confirms the new direction. Early-stage trend candidates.',
        howCalculated:   'Filter: `days_since_reversal ∈ {1, 2, 3}` AND momentum agrees with predicted trend (Down ↔ Bearish / Bearish: Strengthening / Downtrend Weakening; Up ↔ Bullish / Bullish: Strengthening / Uptrend Weakening).',
        colorThresholds: 'Neutral.',
        whatToDo:        '"Potential setup" candidates. If any are in our universe and the desk wants to lean into the new direction, they have a 1–3 day head start vs. the rest of the market.',
      },
      {
        label:           'Momentum shifts',
        whatItShows:     'Symbols whose momentum text is transitional — Tilting Up, Tilting Down, or Reversed — without yet matching predicted trend.',
        howCalculated:   '`momentum ∈ {Tilting Up, Tilting Down, Reversed}`. No trend-agreement requirement.',
        colorThresholds: 'Neutral. Each symbol shown with its transition state in parentheses.',
        whatToDo:        'Pre-confirmation watchlist. Momentum is inflecting but the model hasn\'t flipped predicted trend yet. Some of these resolve into Row 2 of tomorrow\'s outlook.',
      },
    ],
    gotchas: [
      '"Top losing predicted" may render `None today` if no mapped symbol has a negative prediction — real result, not a data issue.',
      'predicted_strength is a model output, not a percentage. The displayed % uses predicted_close vs typical_price as a sanity-checkable proxy.',
      'Saturdays and Mondays before market open, the card shows the most recent weekday\'s outlook.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card8: {
    cardId:         'card8',
    title:          'NexDay · Intraday Signals',
    oneLineSummary: 'Symbols where all four intraday timeframes (15m / 30m / 1h / 2h) agree on direction.',
    whatItAnswers:  'What is the model collectively certain about right now?',
    scope:          '**Entire NexDay universe** (~90 symbols). Not filtered to our mappings — matches GoPredict\'s UI semantics so the two surfaces stay consistent.',
    refresh:        'Every 15 minutes via background poller; cockpit re-queries every 60 seconds.',
    rows: [
      {
        label:           'Up Co-Trending',
        whatItShows:     'Count of symbols where predicted trend is positive across all four intraday timeframes simultaneously. First three symbols shown by name.',
        howCalculated:   'Sign of `trend` numeric across 15min / 30min / 1hour / 2hour predictions, latest snapshot per (symbol, timeframe). Symbol qualifies only if all four are positive.',
        colorThresholds: 'Green.',
        whatToDo:        'Strongest collective Up signals the model is producing. Tradeable if in our universe; informational if not.',
      },
      {
        label:           'Down Co-Trending',
        whatItShows:     'Same logic, all four timeframes negative. First three symbols shown.',
        howCalculated:   'As above, with all four signs negative.',
        colorThresholds: 'Red.',
        whatToDo:        'Strongest collective Down signals.',
      },
      {
        label:           'Last update',
        whatItShows:     'How long ago the latest intraday prediction landed in our DB. Humane format: "4 min ago", "2h 15m ago", "1d 3h ago".',
        howCalculated:   '`NOW() − MAX(prediction_time)` across all four timeframes.',
        colorThresholds: 'Green/neutral if < 30 min. Yellow 30 min – 4 hours. Red beyond 4 hours.',
        whatToDo:        'Over 30 minutes during market hours = data pipeline problem. Upstream NexDay may be down or our poller has stalled. Yellow = investigate. Red = the cards above are not current; do not act on them until the pipeline catches up.',
      },
    ],
    gotchas: [
      'Co-Trending counts won\'t exactly match GoPredict\'s UI because we may poll at slightly different points in their refresh window. Within a few percent = normal. Large divergence (e.g. ours 3, theirs 16) = bug; flag it.',
      'A symbol with `trend = 0` (model uncertain) is excluded from both Up and Down — not counted as either.',
      'During weekends and major holidays, the model continues producing predictions, but absolute counts are less meaningful.',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  card9: {
    cardId:         'card9',
    title:          'NexDay · Best Opportunities',
    oneLineSummary: 'Best-ranked trades the model is recommending today, tiered by conviction strength.',
    whatItAnswers:  'If we\'re going to take a directional position today, what should it be?',
    scope:          '**Mapped symbols only** (broker tradeable set).',
    refresh:        'Once daily, ~17:01 ET (5 days/week).',
    rows: [
      {
        label:           'Top opportunity',
        whatItShows:     'The single highest-ranked opportunity for today, filtered to symbols we trade. Shows MT5 symbol, direction arrow, conviction tag, opportunity strength, and numeric score.',
        howCalculated:   'Rank all `opportunities_daily` rows by tier (see Tier Reference below); within tier by `opportunity_score` descending. Take the top row.',
        colorThresholds: 'Green if direction is UP. Red if DOWN.',
        whatToDo:        'The model\'s single best idea for today. If we agree with the thesis and have capacity, size accordingly. Starting point, not a directive.',
      },
      {
        label:           'Hottest',
        whatItShows:     'All symbols in the top three tiers — Prime:In-Play conviction combined with Strong, Sustained, or Qualified opportunity. The model\'s high-confidence set.',
        howCalculated:   'Tiers 1, 2, 3. First three symbol names shown; "+N more" if longer.',
        colorThresholds: 'Neutral.',
        whatToDo:        'Portfolio-level view of highest conviction. Should be a small, focused list. If 15+ names show up, something is off.',
      },
      {
        label:           'Strong tier',
        whatItShows:     'Non-Prime symbols with Strong or Sustained opportunity. The act-on surface below the headline tier.',
        howCalculated:   'Tiers 4 and 5.',
        colorThresholds: 'Neutral.',
        whatToDo:        'Second-tier candidates. Worth attention if Row 2 is empty or if the desk wants diversification beyond the hottest names.',
      },
    ],
    extras: [
      {
        heading:      'Tier reference',
        bodyMarkdown:
`| Tier | Conviction × Opportunity |
|------|--------------------------|
| 1    | Prime:In-Play + Strong (hottest combination) |
| 2    | Prime:In-Play + Sustained |
| 3    | Prime:In-Play + Qualified |
| 4    | Strong (any non-Prime conviction) |
| 5    | Sustained (any non-Prime conviction) |
| 9    | Everything else (not shown) |`,
      },
    ],
    gotchas: [
      '"Top" may render `None today` if no mapped symbols are in tiers 1–5 — meaning the model has no strong recommendations for our universe today. Real result.',
      'A symbol in Tier 1 today might drop to Tier 4 tomorrow as conditions shift. The list churns; don\'t expect persistence.',
      'The Hottest count (`primeInPlayCount`) is the size of Row 2 — should match.',
    ],
  },

};