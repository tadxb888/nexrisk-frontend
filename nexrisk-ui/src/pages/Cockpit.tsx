// ============================================
// Cockpit Page (Landing Page)
// 3×3 grid — replaces the previous 6-tile launcher.
// Card 1 fully wired to portfolio.summary WS topics.
// Cards 2–9 render "Collecting data…" placeholders.
// ============================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  connectCockpitWebSocket,
  getPortfolioSummary,
  type CockpitWsEvent,
  cockpitApi,
  type CockpitTraderRisk,
  type CockpitPredictions,
} from '@/services/api';
import { fmtHdrMoney, fmtHdrCompact } from '@/stores/PortfolioStatsContext';
import { Link } from 'react-router-dom';
import { HelpIcon } from '../help/HelpIcon';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — match wire shape from PortfolioBroadcaster.cpp
// ═══════════════════════════════════════════════════════════════════════════

interface BookFields {
  realized:              number;
  unrealized:            number;
  positions:             number;
  volume:                number;
  volume_notional:       number;
  long_volume:           number;
  short_volume:          number;
  net_volume:            number;
  long_volume_notional:  number;
  short_volume_notional: number;
  net_volume_notional:   number;
  commissions:           number;
  swaps:                 number;
  rebates:               number;
  // Card 5 — month payload only. Optional because today's payload omits them.
  // net_revenue_usd:     present on A and C books (hedge markup revenue)
  // net_hedged_nv_usd:   present on A only (gross USD value of hedges closed MTD)
  // gross_intake_nv_usd: present on B only (gross USD value of B-Book intake MTD)
  net_revenue_usd?:      number;
  net_hedged_nv_usd?:    number;
  gross_intake_nv_usd?:  number;
}

interface TotalFields extends BookFields {
  hedge_direction:          number;
  hedge_direction_notional: number;
}

interface BySymbolRow {
  symbol:               string;
  snapshot_time:        string;
  long_lots:            number;
  short_lots:           number;
  net_exposure_lots:    number;
  a_book_lots:          number;
  b_book_lots:          number;
  c_book_lots:          number;
  // Per-symbol B-Book P&L (Card 3 Row 1)
  realized_pnl_mtd?:    number;
  unrealized_pnl?:      number;
  pnl_total_mtd?:       number;
  // Per-symbol B-Book USD notional (Card 3 Row 2)
  b_book_notional_usd?: number;
}

interface SymbolsPayload {
  as_of:       string;
  totals: {
    a_book_net_lots: number;
    b_book_net_lots: number;
    c_book_net_lots: number;
  };
  by_symbol:   BySymbolRow[];
}

interface PortfolioSummary {
  period:   'today' | 'month';
  from:     string;
  to:       string;
  baseline: string;
  type:     'SNAPSHOT';
  books:    { A: BookFields; B: BookFields; C: BookFields };
  total:    TotalFields;
  vs_prior_month?: {
    from:      string;
    to:        string;
    available: boolean;
    total:     number | null;
  };
}

type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

// Status maps to the existing design-token color classes:
//   ok       → text-pnl-positive  (green)
//   warning  → text-risk-medium   (amber)
//   critical → text-risk-critical (red)
//   undefined → text-text-primary (neutral)
type RowStatus = 'ok' | 'warning' | 'critical' | undefined;

// ═══════════════════════════════════════════════════════════════════════════
// useCockpitPortfolio — subscribes to both summary topics, exposes both periods
// ═══════════════════════════════════════════════════════════════════════════
//
// The cockpit needs BOTH Today and MTD simultaneously, unlike other pages
// which follow a period toggle. Owns its own WS subscription rather than
// extending PortfolioStatsContext, so changes here don't affect other pages.
//
// On weekdays the backend pushes SNAPSHOTs for both topics on (re)connect.
// On weekends/holidays the live feed is silent (no market activity), so a
// one-shot REST seed (portfolio.summary mirror) fills both periods on mount;
// a live SNAPSHOT, whenever it arrives, overwrites the seed (live wins).
//
// Reconnect strategy mirrors useBBookWebSocket: exponential back-off
// (1s → 2s → 4s … cap 30s).

function useCockpitPortfolio() {
  const [today, setToday]     = useState<PortfolioSummary | null>(null);
  const [month, setMonth]     = useState<PortfolioSummary | null>(null);
  const [symbols, setSymbols] = useState<SymbolsPayload | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  const retryRef   = useRef(0);
  const mountedRef = useRef(true);
  // Per-period guards: once a live SNAPSHOT lands, the REST seed must not
  // overwrite it (live wins, regardless of arrival order).
  const liveToday  = useRef(false);
  const liveMonth  = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    setWsStatus('connecting');

    const cleanup = connectCockpitWebSocket(
      (ev: CockpitWsEvent) => {
        if (ev.topic === 'portfolio.summary.today' && ev.type === 'SNAPSHOT') {
          liveToday.current = true;
          setToday(ev.data as PortfolioSummary);
        } else if (ev.topic === 'portfolio.summary.month' && ev.type === 'SNAPSHOT') {
          liveMonth.current = true;
          setMonth(ev.data as PortfolioSummary);
        } else if (ev.topic === 'portfolio.exposure.symbols' && ev.type === 'SNAPSHOT') {
          setSymbols(ev.data as SymbolsPayload);
        }
        // additional topics for other cards wired here as they come online
      },
      (status) => {
        if (status === 'open') {
          retryRef.current = 0;
          setWsStatus('live');
        } else if (status === 'closed' || status === 'error') {
          if (!mountedRef.current) return;
          setWsStatus(status === 'error' ? 'error' : 'reconnecting');
          const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
          retryRef.current++;
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        }
      }
    );

    cleanupRef.current = cleanup;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cleanupRef.current?.();
    };
  }, [connect]);

  // One-shot REST seed for both periods — populates the cards immediately on
  // mount and, crucially, on weekends/holidays when the WS pushes nothing.
  // Applied only if no live SNAPSHOT has landed for that period yet.
  useEffect(() => {
    let cancelled = false;
    getPortfolioSummary('today')
      .then((d) => { if (!cancelled && !liveToday.current) setToday(d as unknown as PortfolioSummary); })
      .catch(() => { /* best-effort; WS remains primary */ });
    getPortfolioSummary('month')
      .then((d) => { if (!cancelled && !liveMonth.current) setMonth(d as unknown as PortfolioSummary); })
      .catch(() => { /* best-effort; WS remains primary */ });
    return () => { cancelled = true; };
  }, []);

  return { today, month, symbols, wsStatus };
}

// ═══════════════════════════════════════════════════════════════════════════
// useCockpitTraderRisk — Card 4 REST poller (60s cadence)
// ═══════════════════════════════════════════════════════════════════════════
//
// Polls GET /api/v1/cockpit/trader-risk. Update cadence on the backend is
// minutes-to-hours, so 60 s is plenty fresh. Silent on errors — the card
// falls back to "Collecting data…" until a response arrives.
function useCockpitTraderRisk() {
  const [data, setData] = useState<CockpitTraderRisk | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const result = await cockpitApi.getTraderRisk();
        if (!cancelled) setData(result);
      } catch {
        // Silent — placeholder remains visible.
      }
    };

    fetchOnce();
    const interval = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return data;
}
// ═══════════════════════════════════════════════════════════════════════════
// useCockpitPredictions — Cards 7/8/9 REST poller (60 s cadence)
// ═══════════════════════════════════════════════════════════════════════════
//
// Polls GET /api/v1/cockpit/predictions. Backend data updates at most every
// 15 min (intraday) / once daily (daily outlook, opportunities) — 60 s on the
// client is more than fresh enough. Silent on errors.
function useCockpitPredictions() {
  const [data, setData] = useState<CockpitPredictions | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const result = await cockpitApi.getPredictions();
        if (!cancelled) setData(result);
      } catch {
        // Silent — placeholder remains visible.
      }
    };

    fetchOnce();
    const interval = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return data;
}
// ═══════════════════════════════════════════════════════════════════════════
// FORMATTERS / SIGN HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Percentage with explicit sign, 1 decimal.  +4.1%   -2.3%   0.0%
const fmtPct = (v: number): string => {
  const rounded = Math.round(v * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};

const moneyStatus = (v: number): RowStatus => {
  if (v > 0) return 'ok';
  if (v < 0) return 'critical';
  return undefined;
};

const pctStatus = (v: number): RowStatus => {
  if (v > 0.1)  return 'ok';
  if (v < -0.1) return 'critical';
  return undefined;
};

// ═══════════════════════════════════════════════════════════════════════════
// COCKPIT CARD COMPONENTS — use platform design tokens
// ═══════════════════════════════════════════════════════════════════════════

interface CardRowProps {
  label: string;
  /** When `null`, renders the muted "Collecting data…" placeholder. */
  value: { display: string; status?: RowStatus } | null;
}

function CardRow({ label, value }: CardRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      {value !== null ? (
        <span className={clsx(
          'font-mono',
          value.status === 'ok'       && 'text-pnl-positive',
          value.status === 'warning'  && 'text-risk-medium',
          value.status === 'critical' && 'text-risk-critical',
          !value.status               && 'text-text-primary',
        )}>
          {value.display}
        </span>
      ) : (
        <span className="text-text-muted italic">Collecting data…</span>
      )}
    </div>
  );
}

interface CockpitCardProps {
  title:       string;
  question:    string;
  rows:        Array<[string, { display: string; status?: RowStatus } | null]>;
  helpCardId?: string;
}

function CockpitCard({ title, question, rows, helpCardId }: CockpitCardProps) {
  return (
    <div className="panel p-5">
      <div className="flex items-center mb-1">
        <h3 className="text-lg font-medium text-text-primary">{title}</h3>
        {helpCardId && <HelpIcon cardId={helpCardId} />}
      </div>
      <p className="text-sm text-text-secondary mb-4">{question}</p>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <CardRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 1 — Money (fully wired)
// ═══════════════════════════════════════════════════════════════════════════
//
// Net P&L on this card = book P&L (B+A+C), gross of business costs.
// Take-home (net of costs) is Card 2.
//
// Wire-source contract:
//   today.total.realized + today.total.unrealized  → Today Net P&L
//   month.total.realized + month.total.unrealized  → MTD  Net P&L
//   month.vs_prior_month.total                     → prior comparator (must be
//                                                   realized+unrealized to match)
//
// MTM Performance %: (current MTD − prior) / |prior| × 100.
// |denominator| guards against sign inversion when prior was a losing month;
// matches the audit Section "Edge case 1" decision.

interface Card1Props {
  today: PortfolioSummary | null;
  month: PortfolioSummary | null;
}

function Card1Money({ today, month }: Card1Props) {
  const rows = useMemo<Array<[string, { display: string; status?: RowStatus } | null]>>(() => {
    // Row 1 — Today
    let row1: { display: string; status?: RowStatus } | null = null;
    if (today?.total) {
      const v = today.total.realized + today.total.unrealized;
      row1 = { display: fmtHdrMoney(v), status: moneyStatus(v) };
    }

    // Row 2 — MTD
    let row2: { display: string; status?: RowStatus } | null = null;
    if (month?.total) {
      const v = month.total.realized + month.total.unrealized;
      row2 = { display: fmtHdrMoney(v), status: moneyStatus(v) };
    }

    // Row 3 — MTM Performance %
    // Honest fallbacks:
    //   - no MTD snapshot yet                 → "Collecting data…"
    //   - prior month available=false          → "Collecting data…"
    //   - prior month total is null            → "Collecting data…"
    //   - prior |total| below floor ($50K)     → render "—" (too small to ratio)
    let row3: { display: string; status?: RowStatus } | null = null;
    if (month?.total && month.vs_prior_month) {
      const vsPrior = month.vs_prior_month;
      if (vsPrior.available && vsPrior.total !== null) {
        // Net P&L on this card is realized + unrealized (matches Rows 1–2 and
        // is why the figures tick live). The prior comparator must therefore
        // ALSO be realized + unrealized for the ratio to be valid — see note
        // below if vs_prior_month.total is realized-only.
        const current = month.total.realized + month.total.unrealized;
        const prior   = vsPrior.total;
        const FLOOR   = 50_000;
        if (Math.abs(prior) < FLOOR) {
          row3 = { display: '—', status: undefined };
        } else {
          const pct = ((current - prior) / Math.abs(prior)) * 100;
          row3 = { display: fmtPct(pct), status: pctStatus(pct) };
        }
      }
    }

    return [
      ['Today: Net P&L',   row1],
      ['MTD: Net P&L',     row2],
      ['MTM Performance',  row3],
    ];
  }, [today, month]);

  return (
    <CockpitCard
      title="Money"
      question="How much are we making today and this month?"
      rows={rows}
      helpCardId="card1"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARDS 2–9 — placeholder shells (real rows wired in subsequent PRs)
// ═══════════════════════════════════════════════════════════════════════════

const placeholderRows = (labels: string[]):
  Array<[string, { display: string; status?: RowStatus } | null]> =>
  labels.map(l => [l, null]);

// ═══════════════════════════════════════════════════════════════════════════
// CARD 2 — Take-Home & Costs (fully wired)
// ═══════════════════════════════════════════════════════════════════════════
//
// Take-Home = Gross P&L − (commissions + swaps + rebates).
// Sign convention on the wire: total.{commissions,swaps,rebates} are SIGNED
// (earned positive, paid negative — bBook earns commission, aBook/cBook
// pay it, summed across books at total.* level). So Take-Home is simply:
//
//   take_home = realized + unrealized + commissions + swaps + rebates
//
// Gross P&L on this card = realized + unrealized (same as Card 1).
// Cost Ratio + Effective Margin are MTD-only — they're trend signals,
// not intraday.
//
// Edge case: when |Gross MTD| < $50K, the ratios become unstable (small
// denominator amplifies noise). Suppress with the explanatory placeholder
// rather than show a misleading number.

interface Card2Props {
  today: PortfolioSummary | null;
  month: PortfolioSummary | null;
}

function Card2TakeHome({ today, month }: Card2Props) {
  const rows = useMemo<Array<[string, { display: string; status?: RowStatus } | null]>>(() => {
    // Row 1 — Take-Home Today
    let row1: { display: string; status?: RowStatus } | null = null;
    if (today?.total) {
      const t = today.total;
      const takeHome = t.realized + t.unrealized + t.commissions + t.swaps + t.rebates;
      row1 = { display: fmtHdrMoney(takeHome), status: moneyStatus(takeHome) };
    }

    // Rows 2 and 3 depend on MTD gross. Compute once.
    let row2: { display: string; status?: RowStatus } | null = null;
    let row3: { display: string; status?: RowStatus } | null = null;

    if (month?.total) {
      const m         = month.total;
      const grossMtd  = m.realized + m.unrealized;
      const costsMtd  = m.commissions + m.swaps + m.rebates;            // signed (net cost flows)
      const takeMtd   = grossMtd + costsMtd;
      const FLOOR     = 50_000;

      if (Math.abs(grossMtd) < FLOOR) {
        // Ratios unstable — surface honestly rather than print noise.
        row2 = { display: '—', status: undefined };
        row3 = { display: '—', status: undefined };
      } else {
        // Cost Ratio = |net cost flows| / |gross|, displayed as "$X.XX / $1".
        // We take absolute values so the ratio reads naturally regardless of
        // whether the broker had a winning or losing month.
        const ratio = Math.abs(costsMtd) / Math.abs(grossMtd);
        row2 = {
          display: `$${ratio.toFixed(2)} / $1`,
          // Lower is better — flag elevated cost ratios as warning.
          status:  ratio > 0.50 ? 'warning' : ratio > 0.30 ? undefined : 'ok',
        };

        // Effective Margin = take_home / gross, as a percent.
        // Sign on take_home preserved (a negative margin signals more costs
        // than gross book P&L).
        const margin = (takeMtd / Math.abs(grossMtd)) * 100;
        row3 = {
          display: fmtPct(margin),
          status:  margin >= 50 ? 'ok'
                 : margin >= 20 ? undefined
                 : margin <  0  ? 'critical'
                 :                'warning',
        };
      }
    }

    return [
      ['Take-Home Today',  row1],
      ['Cost Ratio MTD',   row2],
      ['Effective Margin', row3],
    ];
  }, [today, month]);

  return (
    <CockpitCard
      title="Take-Home & Costs"
      question="How much actually reaches the bottom line?"
      rows={rows}
      helpCardId="card2"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 3 — Where Is My Risk (B-Book only by design)
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 1 — Top losing symbol MTD: min(pnl_total_mtd) across by_symbol[].
//         Scope is B-Book by definition; A/C books are hedged and don't
//         represent broker risk. Display: "SYMBOL  −$XXXK".
// Row 2 — 1% adverse move: pending notional-USD per symbol (follow-up PR).
// Row 3 — ES: pending ES engine (per spec).

interface Card3Props {
  symbols: SymbolsPayload | null;
}

function Card3SymbolRisk({ symbols }: Card3Props) {
  const rows = useMemo<Array<[string, { display: string; status?: RowStatus } | null]>>(() => {
    // ── Row 1 — Top losing symbol MTD ────────────────────────────────────
    let row1: { display: string; status?: RowStatus } | null = null;
    if (symbols?.by_symbol && symbols.by_symbol.length > 0) {
      let worst: BySymbolRow | null = null;
      for (const r of symbols.by_symbol) {
        const pnl = r.pnl_total_mtd ?? 0;
        if (pnl >= 0) continue;
        if (worst === null || pnl < (worst.pnl_total_mtd ?? 0)) {
          worst = r;
        }
      }
      if (worst) {
        const pnl = worst.pnl_total_mtd ?? 0;
        row1 = {
          display: `${worst.symbol}  ${fmtHdrMoney(pnl)}`,
          status:  'critical',
        };
      } else {
        row1 = { display: 'No losing symbols MTD', status: 'ok' };
      }
    }

    // ── Row 2 — 1% adverse move impact (B-Book USD notional × 1%) ────────
    // Sum across all B-Book exposed symbols. Symbols whose USD-conversion
    // path is unavailable ship 0.0 from the backend and are silently
    // excluded. Direction is always "adverse" → displayed sign is negative.
    let row2: { display: string; status?: RowStatus } | null = null;
    if (symbols?.by_symbol) {
      let totalNotional = 0;
      for (const r of symbols.by_symbol) {
        totalNotional += r.b_book_notional_usd ?? 0;
      }
      const impact = totalNotional * 0.01;
      row2 = {
        display: fmtHdrMoney(-impact),
        status:  impact > 0 ? 'warning' : undefined,
      };
    }

    return [
      ['Top losing symbol',  row1],
      ['1% move impact',     row2],
      ['Largest 1-day risk', null],  // placeholder — ES engine pending
    ];
  }, [symbols]);

  return (
    <CockpitCard
      title="Where Is My Risk"
      question="Which symbols are exposing us?"
      rows={rows}
      helpCardId="card3"
    />
  );
}

/// ═══════════════════════════════════════════════════════════════════════════
// CARD 4 — Who Is My Risk (custom layout)
// ═══════════════════════════════════════════════════════════════════════════
//
// Three rows with interactive elements that don't fit the generic CardRow:
//   Row 1 — Critical traders: count, clickable when > 0
//   Row 2 — Behavioral classification: "Critical · High" labels, each
//           independently active/greyed depending on detection count
//   Row 3 — Active clusters: archetype displayName(s), "+ N more…" form
//
// Field names are camelCase because the BFF transforms snake_case →
// camelCase before responses reach the frontend (snakeToCamel in
// nexrisk-api.ts).
//
// TODO(routing): the Trader Intelligence page is being renamed. Update the
// paths in handleBehavioralClick and handleClustersClick once the rename
// lands. Row 1's /b-book?login_ids=... route also requires the B-Book page
// to read the URL param and apply it to its AG-Grid filter.

interface Card4Props {
  data: CockpitTraderRisk | null;
}

function Card4TraderRisk({ data }: Card4Props) {
  const navigate = useNavigate();

  const handleCriticalClick = () => {
    if (!data || data.criticalTraders.count === 0) return;
    const param = data.criticalTraders.logins.join(',');
    navigate(`/b-book?login_ids=${param}`);
  };

  const handleBehavioralClick = () => {
    navigate('/trader-intelligence');
  };

  const handleClustersClick = () => {
    navigate('/trader-intelligence?tab=clusters');
  };

  return (
    <div className="panel p-5">
      <div className="flex items-center mb-1">
        <h3 className="text-lg font-medium text-text-primary">Who Is My Risk</h3>
        <HelpIcon cardId="card4" />
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Which traders are exposing us, and how?
      </p>

      <div className="space-y-2">

        {/* Row 1 — Critical traders */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Critical traders</span>
          {!data ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : data.criticalTraders.count === 0 ? (
            <span className="font-mono text-pnl-positive">0</span>
          ) : (
            <button
              onClick={handleCriticalClick}
              className="font-mono text-risk-critical hover:underline focus:outline-none"
            >
              {data.criticalTraders.count}
            </button>
          )}
        </div>

        {/* Row 2 — Behavioral classification */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Behavioral classification</span>
          {!data ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : (
            <div className="flex items-center gap-2">
              {data.behavioral.criticalCount > 0 ? (
                <button
                  onClick={handleBehavioralClick}
                  className="text-risk-critical hover:underline focus:outline-none"
                >
                  Critical ({data.behavioral.criticalCount})
                </button>
              ) : (
                <span className="text-text-muted">Critical</span>
              )}
              <span className="text-text-muted">·</span>
              {data.behavioral.highCount > 0 ? (
                <button
                  onClick={handleBehavioralClick}
                  className="text-risk-medium hover:underline focus:outline-none"
                >
                  High ({data.behavioral.highCount})
                </button>
              ) : (
                <span className="text-text-muted">High</span>
              )}
            </div>
          )}
        </div>

        {/* Row 3 — Active risk clusters */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Active risk clusters</span>
          {!data ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : data.clusters.length === 0 ? (
            <span className="font-mono text-pnl-positive">None</span>
          ) : (
            <button
              onClick={handleClustersClick}
              className="text-text-primary hover:underline focus:outline-none"
            >
              {data.clusters[0].displayName}
              {data.clusters.length > 1 && (
                <span className="text-text-muted">
                  {' '}+ {data.clusters.length - 1} more…
                </span>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 5 — Risk Manager Performance (custom layout)
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 1 — A-Book hedge yield:
//   numerator: hedge markup revenue from hedge_records.net_revenue_usd
//   denominator: net hedged notional value (USD) MTD
//   displayed as: "+$5,000 / $1M NV hedged → $12M total NV hedged"
//
// Row 2 — Hedge coverage:
//   ratio: net hedged NV ÷ B-Book gross intake NV
//   displayed as: "42% hedged of $28M intake → $12M NV hedged"
//
// Row 3 — C-Book contribution:
//   C P&L = C.net_revenue_usd (parallel to Row 1 for consistency)
//   contribution % = C ÷ (A + C) where A = A.net_revenue_usd
//   displayed as: "+$8K · 28% of A+C → A+C total: +$28K"
//
// $50K floor applied to ratios with small denominators — display "—" instead
// of unstable noise. Absolute dollar values always display (true zeros are
// honest data; only ratios suppress).

interface Card5Props {
  month: PortfolioSummary | null;
}

function Card5RiskMgrPerf({ month }: Card5Props) {
  const FLOOR = 50_000;

  // Helper: signed money format with leading +/-.
  const fmtSignedMoney = (v: number): string => {
    const formatted = fmtHdrMoney(v);
    return v > 0 && !formatted.startsWith('+') ? `+${formatted}` : formatted;
  };

  // Compact, signed — for the large notional/revenue figures so a $3.48B
  // reads as "$3.48B" rather than "$3,482,082,770.10".
  const fmtSignedCompact = (v: number): string => {
    const s = fmtHdrCompact(Math.abs(v), '$');
    return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s;
  };

  // ── Compute values once ──────────────────────────────────────────────
  const A = month?.books?.A;
  const B = month?.books?.B;
  const C = month?.books?.C;

  const aRevenue     = A?.net_revenue_usd     ?? 0;
  const aHedgedNv    = A?.net_hedged_nv_usd   ?? 0;
  const bIntakeNv    = B?.gross_intake_nv_usd ?? 0;
  const cRevenue     = C?.net_revenue_usd     ?? 0;
  const acTotal      = aRevenue + cRevenue;

  // Row 1 — yield per $1M NV hedged
  let row1Yield: { display: string; status?: RowStatus } | null = null;
  let row1Total: string = '';
  if (month) {
    if (Math.abs(aHedgedNv) < FLOOR) {
      row1Yield = { display: '—', status: undefined };
    } else {
      const yieldPerMillion = (aRevenue / aHedgedNv) * 1_000_000;
      row1Yield = {
        display: `${fmtSignedMoney(yieldPerMillion)} / $1M NV`,
        status:  yieldPerMillion > 0 ? 'ok' : yieldPerMillion < 0 ? 'critical' : undefined,
      };
    }
    row1Total = `→ ${fmtHdrCompact(aHedgedNv, '$')} total`;
  }

  // Row 2 — hedge coverage
  let row2: { display: string; status?: RowStatus } | null = null;
  if (month) {
    if (Math.abs(bIntakeNv) < FLOOR) {
      // No meaningful intake → can't show a ratio. Show literal zeros.
      row2 = {
        display: `— hedged → ${fmtHdrCompact(aHedgedNv, '$')} / ${fmtHdrCompact(bIntakeNv, '$')} intake`,
        status:  undefined,
      };
    } else {
      const pct = (aHedgedNv / bIntakeNv) * 100;
      row2 = {
        display: `${pct.toFixed(0)}% hedged → ${fmtHdrCompact(aHedgedNv, '$')} / ${fmtHdrCompact(bIntakeNv, '$')} intake`,
        status:  undefined,
      };
    }
  }

  // Row 3 — C-Book contribution
  let row3: { display: string; status?: RowStatus } | null = null;
  if (month) {
    let pctLabel: string;
    if (Math.abs(acTotal) < FLOOR) {
      pctLabel = '—';
    } else {
      const pct = (cRevenue / acTotal) * 100;
      pctLabel = `${pct.toFixed(0)}%`;
    }
    row3 = {
      display: `${fmtSignedCompact(cRevenue)} · ${pctLabel} of ${fmtSignedCompact(acTotal)} A+C`,
      status:  cRevenue > 0 ? 'ok' : cRevenue < 0 ? 'critical' : undefined,
    };
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center mb-1">
        <h3 className="text-lg font-medium text-text-primary">Risk Manager Performance</h3>
        <HelpIcon cardId="card5" />
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Is the coverage strategy adding value?
      </p>

      <div className="space-y-2">

        {/* Row 1 — A-Book hedge yield */}
        <div className="flex items-center justify-between text-sm gap-3">
          <span className="text-text-muted whitespace-nowrap">A-Book hedge yield</span>
          {!month || !row1Yield ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : (
            <span className="text-right font-mono">
              <span className={clsx(
                row1Yield.status === 'ok'       && 'text-pnl-positive',
                row1Yield.status === 'critical' && 'text-risk-critical',
                !row1Yield.status               && 'text-text-primary',
              )}>
                {row1Yield.display}
              </span>
              <span className="text-text-muted"> {row1Total}</span>
            </span>
          )}
        </div>

        {/* Row 2 — Hedge coverage */}
        <div className="flex items-center justify-between text-sm gap-3">
          <span className="text-text-muted whitespace-nowrap">Hedge coverage</span>
          {!month || !row2 ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : (
            <span className="text-right font-mono text-text-primary">
              {row2.display}
            </span>
          )}
        </div>

        {/* Row 3 — C-Book contribution */}
        <div className="flex items-center justify-between text-sm gap-3">
          <span className="text-text-muted whitespace-nowrap">C-Book contribution</span>
          {!month || !row3 ? (
            <span className="text-text-muted italic">Collecting data…</span>
          ) : (
            <span className="text-right font-mono">
              <span className={clsx(
                row3.status === 'ok'       && 'text-pnl-positive',
                row3.status === 'critical' && 'text-risk-critical',
                !row3.status               && 'text-text-primary',
              )}>
                {row3.display}
              </span>
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 6 — Markup vs Rebates (fully wired)
// ═══════════════════════════════════════════════════════════════════════════
//
// Three simple sums from the month payload. Comparison is direct: markup is
// what the broker earns on bid/ask spread to clients (via LP hedges); rebate
// cost is what the broker pays out to introducing brokers. Net = whether
// markup wins.
//
// Markup MTD = A.net_revenue_usd + C.net_revenue_usd
//   Why both A and C: both are hedged flows where the broker captures the
//   spread between client fill and LP fill. A is rule-driven (auto-hedge),
//   C is manual (dealer). Both contribute markup revenue.
//
// Rebate cost MTD = A.rebates + B.rebates + C.rebates
//   ASSUMPTION (verify after first deploy): rebates on the wire are SIGNED —
//   negative = paid out by broker, matching the convention used for
//   commissions and swaps. If they're stored as magnitudes (positive cost
//   amounts), flip the sign here: `-(A.rebates + B.rebates + C.rebates)`.
//
// Net MTD = Markup + Rebates (both signed). Tells the exec at a glance
// whether the spread business is paying for itself after distribution costs.

interface Card6Props {
  month: PortfolioSummary | null;
}

function Card6MarkupRebates({ month }: Card6Props) {
  const rows = useMemo<Array<[string, { display: string; status?: RowStatus } | null]>>(() => {
    if (!month) {
      return [
        ['LP→MT markup MTD',  null],
        ['IB rebate cost MTD', null],
        ['Net MTD',           null],
      ];
    }

    const A = month.books.A;
    const B = month.books.B;
    const C = month.books.C;

    const markup  = (A.net_revenue_usd ?? 0) + (C.net_revenue_usd ?? 0);
    const rebates = (A.rebates ?? 0) + (B.rebates ?? 0) + (C.rebates ?? 0);
    const net     = markup + rebates;

    // Signed money format with explicit + on positives.
    const fmt = (v: number): string => {
      const formatted = fmtHdrMoney(v);
      return v > 0 && !formatted.startsWith('+') ? `+${formatted}` : formatted;
    };

    return [
      ['LP→MT markup MTD',  { display: fmt(markup),  status: moneyStatus(markup)  }],
      ['IB rebate cost MTD', { display: fmt(rebates), status: moneyStatus(rebates) }],
      ['Net MTD',           { display: fmt(net),     status: moneyStatus(net)     }],
    ];
  }, [month]);

  return (
    <CockpitCard
      title="Markup vs Rebates"
      question="Are we earning more in markup than we pay in rebates?"
      rows={rows}
      helpCardId="card6"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 7 — NexDay · Daily Outlook
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 1: Top losing predicted — symbol + signed % delta of predicted_close
//        from typical_price. Negative-tinted.
// Row 2: Developing opportunities — symbols with days_since_reversal ∈ {1..3}
//        AND momentum text agreeing with predicted_trend. Compact list, no
//        link-through.
// Row 3: Momentum shifts — symbols with momentum ∈ {Tilting Up, Tilting Down,
//        Reversed}. First two shown with the transition state in parens.
//
// Data updates once daily (5 days/week) — no need to refresh more than once
// per minute on the client.

interface Card7Props { data: CockpitPredictions | null; }

function Card7NexDayDaily({ data }: Card7Props) {
  const outlook = data?.dailyOutlook ?? null;

  // Row 1
  let row1: { display: string; status?: RowStatus } | null = null;
  if (outlook?.topLosing) {
    const tl = outlook.topLosing;
    const pct = tl.typicalPrice !== 0
      ? ((tl.predictedClose - tl.typicalPrice) / tl.typicalPrice) * 100
      : 0;
    row1 = {
      display: `${tl.mt5Symbol}  ↓ ${fmtPct(pct)}`,
      status:  'critical',
    };
  } else if (outlook) {
    // We have a response but no losing prediction at all today.
    row1 = { display: 'None today', status: 'ok' };
  }

  // Row 2 — Developing opportunities (compact list)
  let row2: { display: string; status?: RowStatus } | null = null;
  if (outlook) {
    const list = outlook.developingOpportunities;
    if (list.length === 0) {
      row2 = { display: 'None' };
    } else {
      const head = list.slice(0, 3).map(o => o.mt5Symbol).join(', ');
      const more = list.length > 3 ? ` +${list.length - 3} more` : '';
      row2 = { display: `${head}${more}` };
    }
  }

  // Row 3 — Momentum shifts (first two shown with transition state)
  let row3: { display: string; status?: RowStatus } | null = null;
  if (outlook) {
    const list = outlook.momentumShifts;
    if (list.length === 0) {
      row3 = { display: 'None' };
    } else {
      const head = list.slice(0, 2)
        .map(s => `${s.mt5Symbol} (${s.momentum})`)
        .join(', ');
      const more = list.length > 2 ? ` +${list.length - 2} more` : '';
      row3 = { display: `${head}${more}` };
    }
  }

  return (
    <CockpitCard
      title="NexDay · Daily Outlook"
      question="If GoPredict is right, where does today end up?"
      rows={[
        ['Top losing predicted',     row1],
        ['Developing opportunities', row2],
        ['Momentum shifts',          row3],
      ]}
      helpCardId="card7"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 8 — NexDay · Intraday Signals (Co-Trending)
// ═══════════════════════════════════════════════════════════════════════════
//
// "Co-Trending" = symbol where sign(trend) is consistent across all four
// intraday timeframes (15m / 30m / 1h / 2h). Counts shown match the
// GoPredict UI's "Up N / Down N" pill totals. ENTIRE NexDay universe — no
// mapping filter — to match the source UI's universe semantics.

interface Card8Props { data: CockpitPredictions | null; }

function Card8NexDayIntraday({ data }: Card8Props) {
  const sig = data?.intradaySignals ?? null;

  // Row 1 — Up Co-Trending
  let row1: { display: string; status?: RowStatus } | null = null;
  if (sig) {
    if (sig.upCount === 0) {
      row1 = { display: '0' };
    } else {
      const head = sig.upCoTrending.slice(0, 3).map(s => s.nexdaySymbol).join(', ');
      const more = sig.upCount > 3 ? ` +${sig.upCount - 3} more` : '';
      row1 = {
        display: `${sig.upCount}  ·  ${head}${more}`,
        status:  'ok',   // green for Up
      };
    }
  }

  // Row 2 — Down Co-Trending
  let row2: { display: string; status?: RowStatus } | null = null;
  if (sig) {
    if (sig.downCount === 0) {
      row2 = { display: '0' };
    } else {
      const head = sig.downCoTrending.slice(0, 3).map(s => s.nexdaySymbol).join(', ');
      const more = sig.downCount > 3 ? ` +${sig.downCount - 3} more` : '';
      row2 = {
        display: `${sig.downCount}  ·  ${head}${more}`,
        status:  'critical',  // red for Down
      };
    }
  }

  // Row 3 — Freshness
  let row3: { display: string; status?: RowStatus } | null = null;
  if (sig && sig.latestPredictionTime) {
    const ts = Date.parse(sig.latestPredictionTime);
    if (!isNaN(ts)) {
      const ageMin = Math.max(0, Math.round((Date.now() - ts) / 60_000));
      row3 = {
        display: ageMin === 0 ? 'Just now' : `${ageMin} min ago`,
      };
    }
  } else if (sig) {
    row3 = { display: '—' };
  }

  return (
    <CockpitCard
      title="NexDay · Intraday Signals"
      question="What is GoPredict saying right now?"
      rows={[
        ['Up Co-Trending',   row1],
        ['Down Co-Trending', row2],
        ['Last update',      row3],
      ]}
      helpCardId="card8"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD 9 — NexDay · Best Opportunities
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 1: Top opportunity — single symbol with full detail (conviction +
//        opportunity + direction + score).
// Row 2: Hottest — all Prime:In-Play symbols (tier ≤ 3).
// Row 3: Strong tier — Strong/Sustained non-Prime symbols (tier 4 or 5).
//        The "act-on surface" — second-tier opportunities below Prime.

interface Card9Props { data: CockpitPredictions | null; }

function Card9NexDayOpps({ data }: Card9Props) {
  const opps = data?.bestOpportunities ?? null;

  // Row 1 — Top opportunity
  let row1: { display: string; status?: RowStatus } | null = null;
  if (opps?.top) {
    const t = opps.top;
    const dirArrow = t.opportunityDirection === 'UP' ? '↑' : '↓';
    const dirStatus: RowStatus | undefined =
      t.opportunityDirection === 'UP' ? 'ok'
      : t.opportunityDirection === 'DOWN' ? 'critical'
      : undefined;
    row1 = {
      display: `${t.mt5Symbol}  ${dirArrow} ${t.conviction} · ${t.opportunity} · ${t.opportunityScore.toFixed(1)}`,
      status:  dirStatus,
    };
  } else if (opps) {
    row1 = { display: 'None today' };
  }

  // Row 2 — Hottest (Prime:In-Play tier)
  let row2: { display: string; status?: RowStatus } | null = null;
  if (opps) {
    const list = opps.hottest;
    if (list.length === 0) {
      row2 = { display: 'None' };
    } else {
      const head = list.slice(0, 3).map(o => o.mt5Symbol).join(', ');
      const more = list.length > 3 ? ` +${list.length - 3} more` : '';
      row2 = { display: `${head}${more}` };
    }
  }

  // Row 3 — Strong tier (non-Prime)
  let row3: { display: string; status?: RowStatus } | null = null;
  if (opps) {
    const list = opps.strongTier;
    if (list.length === 0) {
      row3 = { display: 'None' };
    } else {
      const head = list.slice(0, 3).map(o => o.mt5Symbol).join(', ');
      const more = list.length > 3 ? ` +${list.length - 3} more` : '';
      row3 = { display: `${head}${more}` };
    }
  }

  return (
    <CockpitCard
      title="NexDay · Best Opportunities"
      question="What should we be acting on?"
      rows={[
        ['Top opportunity',  row1],
        ['Hottest',          row2],
        ['Strong tier',      row3],
      ]}
      helpCardId="card9"
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — page assembly
// ═══════════════════════════════════════════════════════════════════════════

export function CockpitPage() {
  const { today, month, symbols, wsStatus } = useCockpitPortfolio();
  const traderRisk = useCockpitTraderRisk();
  const predictions = useCockpitPredictions();

  // When WS is not live, dim the grid uniformly. Live state has no decoration.
  const gridOpacity = wsStatus === 'live' ? 1 : 0.5;

  return (
    <div className="h-full p-6">

      {/* Page header — matches original Cockpit's heading hierarchy */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">NexRisk Cockpit</h1>
          <p className="text-text-secondary">
            The business at a glance — money, risk, coverage, and what's next.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-1">
          {/* Connection status — only visible when not live */}
          {wsStatus !== 'live' && (
            <div className="text-sm font-mono text-risk-medium">
              ●{' '}
              {wsStatus === 'connecting'   && 'connecting…'}
              {wsStatus === 'reconnecting' && 'reconnecting…'}
              {wsStatus === 'error'        && 'connection error'}
            </div>
          )}

          <Link
            to="/cockpit/help"
            className="text-sm text-text-secondary hover:text-text-primary underline"
          >
            Help
          </Link>
        </div>
      </div>

      {/* 3×3 grid — responsive: 1 col mobile, 2 col tablet, 3 col desktop.
          Matches the original launcher grid breakpoints. */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        style={{ opacity: gridOpacity, transition: 'opacity 200ms ease' }}
      >
        {/* Row 1 — Money / Take-Home / Markup vs Rebates */}
        <Card1Money         today={today} month={month} />
        <Card2TakeHome      today={today} month={month} />
        <Card6MarkupRebates month={month} />

        {/* Row 2 — Who Is My Risk / Risk Manager Performance / Where Is My Risk */}
        <Card4TraderRisk    data={traderRisk} />
        <Card5RiskMgrPerf   month={month} />
        <Card3SymbolRisk    symbols={symbols} />

        {/* Row 3 — NexDay predictions */}
        <Card7NexDayDaily    data={predictions} />
        <Card8NexDayIntraday data={predictions} />
        <Card9NexDayOpps     data={predictions} />
      </div>
    </div>
  );
}

export default CockpitPage;