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
  type PortfolioWsEvent,
  type PortfolioWsBookFields,
  type PortfolioWsPeriod,
} from '@/services/api';

// =============================================================================
// SHAPES
// =============================================================================

export interface BookCardStats {
  positions:      number | null;
  buys:           number | null;
  sells:          number | null;
  volume:         number | null;
  volumeNotional: number | null;
  unrealized:     number | null;
  realized:       number | null;
  commissions:    number | null;
  swaps:          number | null;
  rebates:        number | null;
}

export const EMPTY_BOOK_STATS: BookCardStats = {
  positions: null, buys: null, sells: null,
  volume: null, volumeNotional: null,
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
  volume:         number | null;
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
  volume: null, volumeNotional: null,
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

  wsStatus:       'open' | 'closed' | 'error' | 'connecting';
}

const DEFAULT_VALUE: PortfolioStatsValue = {
  bbook: EMPTY_BOOK_STATS,
  abook: EMPTY_BOOK_STATS,
  cbook: EMPTY_BOOK_STATS,
  cost:  EMPTY_COST_STATS,
  total: EMPTY_TOTAL_STATS,
  cardsPeriod:    'today',
  setCardsPeriod: () => { /* no-op fallback */ },
  periodFrom:   null,
  periodTo:     null,
  baselineDate: null,
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
    positions:      b.positions,
    buys:           null,
    sells:          null,
    volume:         b.volume,
    volumeNotional: null,
    unrealized:     b.unrealized,
    realized:       b.realized,
    commissions:    b.commissions,
    swaps:          b.swaps,
    rebates:        b.rebates,
  };
}

function mapTotal(t: PortfolioWsBookFields): TotalCardStats {
  const cost = (t.commissions ?? 0) + (t.swaps ?? 0) + (t.rebates ?? 0);
  return {
    positions:      t.positions,
    buys:           null,
    sells:          null,
    volume:         t.volume,
    volumeNotional: null,
    unrealized:     t.unrealized,
    realized:       t.realized,
    commissions:    t.commissions,
    swaps:          t.swaps,
    rebates:        t.rebates,
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
    return 'today';
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

    const cleanup = connectPortfolioWebSocket(
      periodToWs(cardsPeriod),
      (event: PortfolioWsEvent) => {
        if (event.type === 'SNAPSHOT') {
          const d = event.data;
          setBbook(mapBook(d.books.B));
          setAbook(mapBook(d.books.A));
          setCbook(mapBook(d.books.C));
          setTotal(mapTotal(d.total));
          setPeriodFrom(d.from ?? null);
          setPeriodTo(d.to ?? null);
          setBaselineDate(d.baseline ?? null);
        }
      },
      (status) => setWsStatus(status),
    );
    return cleanup;
  }, [cardsPeriod]);

  const cost: CostCardStats = EMPTY_COST_STATS;

  const value = useMemo<PortfolioStatsValue>(
    () => ({
      bbook, abook, cbook, cost, total,
      cardsPeriod, setCardsPeriod,
      periodFrom, periodTo, baselineDate,
      wsStatus,
    }),
    [bbook, abook, cbook, cost, total,
     cardsPeriod, setCardsPeriod,
     periodFrom, periodTo, baselineDate,
     wsStatus],
  );

  return (
    <PortfolioStatsContext.Provider value={value}>
      {children}
    </PortfolioStatsContext.Provider>
  );
}