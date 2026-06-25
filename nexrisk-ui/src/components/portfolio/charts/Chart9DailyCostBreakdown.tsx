// ============================================
// Chart9DailyCostBreakdown — Daily Cost Breakdown per Book (single-period summary)
//
// Per Ross's Phase 2 spec:
//   • SINGLE-PERIOD SUMMARY (not a time series). Period selector controls
//     the aggregation window — chart always renders the same 8 bars.
//   • Per book (B / A / C / Portfolio) two side-by-side bars:
//       (1) Stacked breakdown bar — three segments: commissions, swaps,
//           rebates. Green segments for positive values, red for negative.
//       (2) Solid total bar — sum of commissions+swaps+rebates, colored
//           with the book's general color regardless of sign.
//   • 8 bars total: B-Breakdown / B-Total / A-Breakdown / A-Total /
//                   C-Breakdown / C-Total / Portfolio-Breakdown / Portfolio-Total
//   • Period selector: this_week / this_month / last_month / h1 / h2 /
//     this_year. Default this_month. (No 'today' — daily-aggregate data.)
//   • 5min polling.
//
// Color palette:
//   Total bars (per-book identity, sign-agnostic) — sourced from
//   bookColors.ts (single source of truth across the app).
//   Breakdown segments (sign-driven):
//     Positive      #6aaa78
//     Negative      #d07070
//
// Implementation note:
//   Recharts handles per-X-slot stacked + grouped layouts awkwardly when
//   each slot has DIFFERENT structure (some are stacked, some aren't).
//   We sidestep that by building one row per X-axis slot (8 rows total)
//   and using two parallel data dimensions:
//     1. Stacked bars with `commissions` / `swaps` / `rebates` keys —
//        only the breakdown rows have non-zero values; total rows have
//        zero in these keys (so the stacked bars don't render).
//     2. A single `total` bar — only the total rows have non-zero
//        value; breakdown rows have zero.
//   <Cell> components inside each <Bar> drive the per-row color choices.
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import {
  fetchDailyCosts,
  periodToDateOnlyRange,
  type DailyCostsResponse,
} from '@/services/chartsApi';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Component colours — one fixed hue per cost component, identical in every
// book group so a single component reads across books at a glance. Sourced
// from the app palette (chart-7 / BBook). Sign is shown by bar DIRECTION
// (above / below the zero line), never by colour.
const COLOR_COMMISSIONS = '#3d5a80'; // blue
const COLOR_SWAPS       = '#3d7d7d'; // teal
const COLOR_REBATES     = '#5c4d7d'; // purple
const COLOR_TOTAL       = '#b87333'; // copper — per-book total only, never a book colour

// ── Format helpers ─────────────────────────────────────────────
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Row shape — one per book (4 X-axis groups) ─────────────────
interface ChartRow {
  /** X-axis group label, e.g. "B-Book". */
  label:       string;
  book:        'b' | 'a' | 'c' | 'portfolio';
  /** All four values populated per book; rendered as grouped bars. */
  commissions: number;
  swaps:       number;
  rebates:     number;
  total:       number;
}

const BOOK_LABEL: Record<ChartRow['book'], string> = {
  b:         'B-Book',
  a:         'A-Book',
  c:         'C-Book',
  portfolio: 'Portfolio',
};

/** Build 4 rows — one per book, in B / A / C / Portfolio order. Each row
 *  carries all four values (commissions, swaps, rebates, total) rendered
 *  as grouped bars within the book's X-axis slot. */
function buildRows(books: DailyCostsResponse['books']): ChartRow[] {
  const order: Array<ChartRow['book']> = ['b', 'a', 'c', 'portfolio'];
  return order.map(book => {
    const f = books[book];
    return {
      label:       BOOK_LABEL[book],
      book,
      commissions: f.commissions,
      swaps:       f.swaps,
      rebates:     f.rebates,
      total:       f.total,
    };
  });
}

// ── Component ──────────────────────────────────────────────────
export function Chart9DailyCostBreakdown({ period }: ChartComponentProps) {
  const [resp,    setResp]    = useState<DailyCostsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const range = periodToDateOnlyRange(period);
        const json  = await fetchDailyCosts({ from: range.from, to: range.to });
        if (!mounted || ctrl.signal.aborted) return;
        setResp(json);
        setError(null);
      } catch (e: any) {
        if (!mounted || ctrl.signal.aborted) return;
        setError(e?.message ?? 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [period]);

  // ── Render branches ──────────────────────────────────────────
  if (loading && !resp) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && !resp) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (!resp) {
    return <BodyMessage>No cost data for this period</BodyMessage>;
  }

  const rows = buildRows(resp.books);

  // All-zero detector — common during weekend periods or when book_pnl_daily
  // is empty.
  const allZero = rows.every(r =>
    r.commissions === 0 && r.swaps === 0 && r.rebates === 0 && r.total === 0,
  );

  return (
    <div className="h-full w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          barCategoryGap="15%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#808080"
            tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            interval={0}
            height={28}
          />
          <YAxis
            tickFormatter={fmtMoney}
            stroke="#808080"
            tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            width={64}
          />
          {/* Zero baseline — anchors the sign-split visuals. */}
          <ReferenceLine y={0} stroke="#808080" strokeDasharray="2 4" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#252429',
              border:          '1px solid #b87333',
              fontFamily:      'IBM Plex Mono, monospace',
              fontSize:        12,
            }}
            // Hide the zero entries from other-kind rows so the tooltip
            // only shows what's actually drawn.
            formatter={(value: number, name: string) => {
              if (value === 0) return [null, null] as any;
              return [fmtMoney(value), name];
            }}
            cursor={{ fill: '#ffffff10' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            // Custom payload — the underlying data series names
            // ("commissions", "swaps", "rebates", "total") are not what
            // we want shown to the user. Render explanatory chips.
            payload={[
              { value: 'Commissions', type: 'square', color: COLOR_COMMISSIONS, id: 'c' },
              { value: 'Swaps',       type: 'square', color: COLOR_SWAPS,       id: 's' },
              { value: 'Rebates',     type: 'square', color: COLOR_REBATES,     id: 'r' },
              { value: 'Total',       type: 'square', color: COLOR_TOTAL,       id: 't' },
            ]}
          />

          {/* Grouped bars — four per book group (B / A / C / Portfolio).
              Colour encodes the COMPONENT (fixed per series, identical
              across groups); sign is shown by direction — Recharts draws
              negative values below the y=0 reference line automatically.
              Total is the copper sum bar, never a book colour. */}
          <Bar dataKey="commissions" name="Commissions" fill={COLOR_COMMISSIONS} />
          <Bar dataKey="swaps"       name="Swaps"       fill={COLOR_SWAPS} />
          <Bar dataKey="rebates"     name="Rebates"     fill={COLOR_REBATES} />
          <Bar dataKey="total"       name="Total"       fill={COLOR_TOTAL} />
        </BarChart>
      </ResponsiveContainer>

      {allZero && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded font-mono text-[10px]"
          style={{
            backgroundColor: '#252429',
            border:          '1px solid #d4a05266',
            color:           '#d4a052',
            pointerEvents:   'none',
          }}
        >
          All values $0 for this period
        </div>
      )}
    </div>
  );
}

// ── BodyMessage — centered status text ─────────────────────────
function BodyMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?:    'error';
}) {
  return (
    <div
      className="h-full w-full flex items-center justify-center font-mono text-xs"
      style={{ color: tone === 'error' ? '#d07070' : '#808080' }}
    >
      {children}
    </div>
  );
}