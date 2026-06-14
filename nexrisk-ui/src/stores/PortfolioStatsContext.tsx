// ============================================
// PortfolioStatsContext — WS-driven, period-aware
//
// Backend pushes two topics:
//   - portfolio.summary.today  → today midnight UTC → now
//   - portfolio.summary.month  → 1st of month UTC → now
//
// CardsPeriod type retains all five legacy values for backward compat with
// chartsApi/registry.ts. Selector exposes only Today + This Month. Any other
// value falls back to month.
// ============================================

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

import {
  connectPortfolioWebSocket,
  getPortfolioSummary,
  type PortfolioWsEvent,
  type PortfolioWsBookFields,
  type PortfolioWsTotalFields,
  type PortfolioWsPeriod,
  type PortfolioSummaryData,
  type PortfolioVsPriorMonth,
} from '@/services/api';

// =============================================================================
// SHAPES
// =============================================================================

export interface BookCardStats {
  positions:      number | null;
  buys:           number | null;
  sells:          number | null;
  /** Gross traded volume over the period (lots). */
  volume:         number | null;
  /** Gross traded volume in notional (lots × MT5 contract size). */
  volume_notional: number | null;
  /** Broker-direction long volume (lots). */
  long_volume:    number | null;
  /** Broker-direction short volume (lots). */
  short_volume:   number | null;
  /** long_volume - short_volume (per-book). For Portfolio: directional lean
   *  via straight sum across A+B+C. POSITIVE = net long lean. */
  net_volume:     number | null;
  /** Notional equivalents — used by the consumer when "Notional" mode is selected. */
  long_volume_notional:  number | null;
  short_volume_notional: number | null;
  net_volume_notional:   number | null;
  /** Legacy field name retained for backward compat with older renderers
   *  that look up volumeNotional (camelCase). Will be removed once those
   *  renderers are updated to read volume_notional. */
  volumeNotional: number | null;
  unrealized:     number | null;
  realized:       number | null;
  commissions:    number | null;
  swaps:          number | null;
  rebates:        number | null;
}

export const EMPTY_BOOK_STATS: BookCardStats = {
  positions: null, buys: null, sells: null,
  volume: null, volume_notional: null,
  long_volume: null, short_volume: null, net_volume: null,
  long_volume_notional: null, short_volume_notional: null, net_volume_notional: null,
  volumeNotional: null,
  unrealized: null, realized: null,
  commissions: null, swaps: null, rebates: null,
};

export interface CostCardStats {
  net:         number | null;
  commissions: number | null;
  swaps:       number | null;
  fees:        number | null;
}

export const EMPTY_COST_STATS: CostCardStats = {
  net: null, commissions: null, swaps: null, fees: null,
};

export interface TotalCardStats {
  positions:      number | null;
  buys:           number | null;
  sells:          number | null;
  /** Gross traded volume over the period (lots). Straight sum across A+B+C. */
  volume:         number | null;
  volume_notional: number | null;
  /** Broker-direction long volume — straight sum across A+B+C. */
  long_volume:    number | null;
  short_volume:   number | null;
  /** Net Vol — directional lean (long − short straight sum). */
  net_volume:     number | null;
  long_volume_notional:  number | null;
  short_volume_notional: number | null;
  net_volume_notional:   number | null;
  /** Hedge Direction — (A.net + C.net) − B.net.
   *  POSITIVE = over-hedged, NEGATIVE = under-hedged, ZERO = fully hedged.
   *  Surfaced as a separate row below Net Vol in the breakdown grid. */
  hedge_direction:          number | null;
  hedge_direction_notional: number | null;
  volumeNotional: number | null;
  unrealized:     number | null;
  realized:       number | null;
  /** Backend-supplied cost components. */
  commissions:    number | null;
  swaps:          number | null;
  rebates:        number | null;
  /** Convenience: sum of commissions + swaps + rebates. */
  cost:           number | null;
}

const EMPTY_TOTAL_STATS: TotalCardStats = {
  positions: null, buys: null, sells: null,
  volume: null, volume_notional: null,
  long_volume: null, short_volume: null, net_volume: null,
  long_volume_notional: null, short_volume_notional: null, net_volume_notional: null,
  hedge_direction: null, hedge_direction_notional: null,
  volumeNotional: null,
  unrealized: null, realized: null,
  commissions: null, swaps: null, rebates: null,
  cost: null,
};

export interface PortfolioStatsValue {
  bbook: BookCardStats;
  abook: BookCardStats;
  cbook: BookCardStats;
  cost:  CostCardStats;
  total: TotalCardStats;

  cardsPeriod:    CardsPeriod;
  setCardsPeriod: (p: CardsPeriod) => void;

  periodFrom:     string | null;
  periodTo:       string | null;
  baselineDate:   string | null;
  /** Pre-formatted 'dd/mm/yyyy — hh:mm:ss' of the latest snapshot (periodTo),
   *  local time. Null until first snapshot/seed arrives. */
  lastUpdated:    string | null;
  /** Prior-month pace comparison (net realized). Null outside This Month or
   *  when the backend marks it unavailable. */
  vsPriorMonth:   PortfolioVsPriorMonth | null;

  wsStatus:       'open' | 'closed' | 'error' | 'connecting';
}

const DEFAULT_VALUE: PortfolioStatsValue = {
  bbook: EMPTY_BOOK_STATS,
  abook: EMPTY_BOOK_STATS,
  cbook: EMPTY_BOOK_STATS,
  cost:  EMPTY_COST_STATS,
  total: EMPTY_TOTAL_STATS,
  cardsPeriod:    'this_month',
  setCardsPeriod: () => { /* no-op fallback */ },
  periodFrom:   null,
  periodTo:     null,
  baselineDate: null,
  lastUpdated:  null,
  vsPriorMonth: null,
  wsStatus:     'connecting',
};

// =============================================================================
// FORMAT HELPERS
// =============================================================================

export const fmtHdrMoney = (val: number): string => {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${val < 0 ? '-' : ''}$${abs}`;
};

export const fmtHdrCompact = (val: number, prefix = ''): string => {
  const abs  = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000_000)  return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)     return `${sign}${prefix}${(abs / 1_000).toFixed(0)}K`;
  if (abs >= 1_000)      return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`;
  const hasFraction = Math.abs(abs - Math.round(abs)) > 0.001;
  return `${sign}${prefix}${abs.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

export const pnlColor = (v: number | null | undefined): string =>
  v == null ? '#d2d6e2' : v > 0 ? '#6aaa78' : v < 0 ? '#d07070' : '#d2d6e2';

/** Format an ISO timestamp as 'dd/mm/yyyy — hh:mm:ss' in local time.
 *  Used for the "Updated …" caption so a quiet-market (weekend/holiday)
 *  reading is visibly distinct from a live one. */
export const fmtLastUpdated = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} — ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// =============================================================================
// CARDS PERIOD
//
// Type kept identical to the previous version so chartsApi/registry.ts and
// other consumers don't break. Only the SELECTOR options are restricted.
// =============================================================================

export type CardsPeriod =
  | 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year';

/** What the dropdown actually offers users. Backend supports only these two. */
export const CARDS_PERIOD_OPTIONS: CardsPeriod[] = [
  'today', 'this_month',
];

export const CARDS_PERIOD_LABEL: Record<CardsPeriod, string> = {
  today:      'Today',
  this_week:  'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year:  'This Year',
};

const CARDS_PERIOD_KEY = 'taiga:portfolio-cards-period';

/** Map any CardsPeriod to one of the two backend-supported windows. */
function periodToWs(p: CardsPeriod): PortfolioWsPeriod {
  return p === 'today' ? 'today' : 'month';
}

// =============================================================================
// MAPPING
// =============================================================================

function mapBook(b: PortfolioWsBookFields): BookCardStats {
  return {
    positions:             b.positions,
    buys:                  null,
    sells:                 null,
    volume:                b.volume,
    volume_notional:       b.volume_notional,
    long_volume:           b.long_volume,
    short_volume:          b.short_volume,
    net_volume:            b.net_volume,
    long_volume_notional:  b.long_volume_notional,
    short_volume_notional: b.short_volume_notional,
    net_volume_notional:   b.net_volume_notional,
    volumeNotional:        b.volume_notional,   // legacy alias for older renderers
    unrealized:            b.unrealized,
    realized:              b.realized,
    commissions:           b.commissions,
    swaps:                 b.swaps,
    rebates:               b.rebates,
  };
}

function mapTotal(t: PortfolioWsTotalFields): TotalCardStats {
  const cost = (t.commissions ?? 0) + (t.swaps ?? 0) + (t.rebates ?? 0);
  return {
    positions:                t.positions,
    buys:                     null,
    sells:                    null,
    volume:                   t.volume,
    volume_notional:          t.volume_notional,
    long_volume:              t.long_volume,
    short_volume:             t.short_volume,
    net_volume:               t.net_volume,
    long_volume_notional:     t.long_volume_notional,
    short_volume_notional:    t.short_volume_notional,
    net_volume_notional:      t.net_volume_notional,
    hedge_direction:          t.hedge_direction,
    hedge_direction_notional: t.hedge_direction_notional,
    volumeNotional:           t.volume_notional,   // legacy alias
    unrealized:               t.unrealized,
    realized:                 t.realized,
    commissions:              t.commissions,
    swaps:                    t.swaps,
    rebates:                  t.rebates,
    cost,
  };
}

// =============================================================================
// CONTEXT + HOOK
// =============================================================================

const PortfolioStatsContext = createContext<PortfolioStatsValue>(DEFAULT_VALUE);

export function usePortfolioStats(): PortfolioStatsValue {
  return useContext(PortfolioStatsContext);
}

// =============================================================================
// PROVIDER
// =============================================================================

export function PortfolioStatsProvider({ children }: { children: ReactNode }) {
  const [cardsPeriod, setCardsPeriodState] = useState<CardsPeriod>(() => {
    try {
      const raw = localStorage.getItem(CARDS_PERIOD_KEY);
      // Accept any legacy value but treat as the two-option world: anything
      // that isn't 'today' becomes 'this_month'.
      if (raw === 'today') return 'today';
      if (raw && raw !== '') return 'this_month';
    } catch { /* ignore */ }
    return 'this_month';   // unset → default to This Month (weekend-friendly)
  });

  const setCardsPeriod = useCallback((p: CardsPeriod) => {
    // Coerce any legacy value to the two-option set.
    const coerced: CardsPeriod = p === 'today' ? 'today' : 'this_month';
    setCardsPeriodState(coerced);
    try { localStorage.setItem(CARDS_PERIOD_KEY, coerced); } catch { /* ignore */ }
  }, []);

  const [bbook, setBbook] = useState<BookCardStats>(EMPTY_BOOK_STATS);
  const [abook, setAbook] = useState<BookCardStats>(EMPTY_BOOK_STATS);
  const [cbook, setCbook] = useState<BookCardStats>(EMPTY_BOOK_STATS);
  const [total, setTotal] = useState<TotalCardStats>(EMPTY_TOTAL_STATS);

  const [periodFrom,   setPeriodFrom]   = useState<string | null>(null);
  const [periodTo,     setPeriodTo]     = useState<string | null>(null);
  const [baselineDate, setBaselineDate] = useState<string | null>(null);
  const [vsPriorMonth, setVsPriorMonth] = useState<PortfolioVsPriorMonth | null>(null);
  const [wsStatus, setWsStatus] = useState<'open' | 'closed' | 'error' | 'connecting'>('connecting');

  // ─── WS subscription ───────────────────────────────────────────────────────
  // Re-runs when cardsPeriod changes — closes the old socket and opens a new
  // one for the corresponding topic.
  useEffect(() => {
    setWsStatus('connecting');
    setBbook(EMPTY_BOOK_STATS);
    setAbook(EMPTY_BOOK_STATS);
    setCbook(EMPTY_BOOK_STATS);
    setTotal(EMPTY_TOTAL_STATS);
    setVsPriorMonth(null);

    let cancelled = false;
    // Per-run flag: once a live WS SNAPSHOT arrives for this period, the REST
    // seed must not overwrite it (live wins, regardless of arrival order).
    const live = { received: false };

    const applySnapshot = (d: PortfolioSummaryData) => {
      setBbook(mapBook(d.books.B));
      setAbook(mapBook(d.books.A));
      setCbook(mapBook(d.books.C));
      setTotal(mapTotal(d.total));
      setPeriodFrom(d.from ?? null);
      setPeriodTo(d.to ?? null);
      setBaselineDate(d.baseline ?? null);
      setVsPriorMonth(d.vs_prior_month ?? null);
    };

    const cleanup = connectPortfolioWebSocket(
      periodToWs(cardsPeriod),
      (event: PortfolioWsEvent) => {
        if (event.type === 'SNAPSHOT') {
          live.received = true;
          if (!cancelled) applySnapshot(event.data);
        }
      },
      (status) => { if (!cancelled) setWsStatus(status); },
    );

    // One-shot REST seed (the portfolio.summary REST mirror). Populates the
    // grid immediately on mount and — crucially — on weekends/holidays when
    // the live WS pushes nothing. Applied only if no live SNAPSHOT has landed
    // for this period and the effect is still current. Best-effort: failure
    // leaves the WS as the sole source.
    getPortfolioSummary(periodToWs(cardsPeriod))
      .then((data) => { if (!cancelled && !live.received) applySnapshot(data); })
      .catch(() => { /* seed is best-effort; WS remains primary */ });

    return () => { cancelled = true; cleanup(); };
  }, [cardsPeriod]);

  const cost: CostCardStats = EMPTY_COST_STATS;

  const value = useMemo<PortfolioStatsValue>(
    () => ({
      bbook, abook, cbook, cost, total,
      cardsPeriod, setCardsPeriod,
      periodFrom, periodTo, baselineDate,
      lastUpdated: fmtLastUpdated(periodTo),
      vsPriorMonth,
      wsStatus,
    }),
    [bbook, abook, cbook, cost, total,
     cardsPeriod, setCardsPeriod,
     periodFrom, periodTo, baselineDate,
     vsPriorMonth,
     wsStatus],
  );

  return (
    <PortfolioStatsContext.Provider value={value}>
      {children}
    </PortfolioStatsContext.Provider>
  );
}