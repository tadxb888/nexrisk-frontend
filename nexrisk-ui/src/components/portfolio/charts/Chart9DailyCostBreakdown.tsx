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
  Cell,
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
import { BOOK_COLORS } from './bookColors';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Per-book total-bar colours — sourced from the central palette.
const COLOR_A         = BOOK_COLORS.a;
const COLOR_B         = BOOK_COLORS.b;
const COLOR_C         = BOOK_COLORS.c;
const COLOR_PORTFOLIO = BOOK_COLORS.portfolio;

// Sign-driven colours — breakdown segments. Independent of book identity.
const COLOR_POSITIVE = '#6aaa78';
const COLOR_NEGATIVE = '#d07070';

// ── Format helpers ─────────────────────────────────────────────
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Row shape for the 8 X-axis slots ───────────────────────────
type RowKind = 'breakdown' | 'total';

interface ChartRow {
  /** X-axis label, e.g. "B Breakdown" or "B Total". */
  label:      string;
  /** Which book this row belongs to — drives color of the total bar. */
  book:       'b' | 'a' | 'c' | 'portfolio';
  /** Distinguishes breakdown rows (stacked) from total rows (single bar). */
  kind:       RowKind;
  /** Stacked-bar values — non-zero only on breakdown rows. */
  commissions: number;
  swaps:       number;
  rebates:     number;
  /** Total bar value — non-zero only on total rows. */
  total:       number;
}

const BOOK_COLOR: Record<ChartRow['book'], string> = {
  a:         COLOR_A,
  b:         COLOR_B,
  c:         COLOR_C,
  portfolio: COLOR_PORTFOLIO,
};

const BOOK_LABEL: Record<ChartRow['book'], string> = {
  b:         'B-Book',
  a:         'A-Book',
  c:         'C-Book',
  portfolio: 'Portfolio',
};

/** Build the 8 rows in the order: B-Breakdown, B-Total, A-Breakdown,
 *  A-Total, C-Breakdown, C-Total, Portfolio-Breakdown, Portfolio-Total.
 *  Per Ross — books in B/A/C order, each pair (breakdown then total). */
function buildRows(books: DailyCostsResponse['books']): ChartRow[] {
  const order: Array<ChartRow['book']> = ['b', 'a', 'c', 'portfolio'];
  const rows: ChartRow[] = [];
  for (const book of order) {
    const f = books[book];
    rows.push({
      label:       `${BOOK_LABEL[book]} Breakdown`,
      book,
      kind:        'breakdown',
      commissions: f.commissions,
      swaps:       f.swaps,
      rebates:     f.rebates,
      total:       0,
    });
    rows.push({
      label:       `${BOOK_LABEL[book]} Total`,
      book,
      kind:        'total',
      commissions: 0,
      swaps:       0,
      rebates:     0,
      total:       f.total,
    });
  }
  return rows;
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
          margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
          barCategoryGap="15%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#808080"
            tick={{ fill: '#d2d6e2', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={50}
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
              border:          '1px solid #3a3a3c',
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
              { value: 'Commissions',      type: 'square', color: '#aaa',           id: 'c' },
              { value: 'Swaps',            type: 'square', color: '#aaa',           id: 's' },
              { value: 'Rebates',          type: 'square', color: '#aaa',           id: 'r' },
              { value: 'Positive segment', type: 'square', color: COLOR_POSITIVE,   id: 'p' },
              { value: 'Negative segment', type: 'square', color: COLOR_NEGATIVE,   id: 'n' },
              { value: 'Total (book)',     type: 'square', color: COLOR_PORTFOLIO, id: 't' },
            ]}
          />

          {/* Stacked breakdown bars — only render on breakdown rows.
              The three series share a stackId so they pile vertically.
              Each cell color is sign-driven (positive green / negative
              red). Total rows have zero in all three keys → no bars. */}
          <Bar dataKey="commissions" stackId="cost" name="Commissions">
            {rows.map((r, i) => (
              <Cell
                key={`comm-${i}`}
                fill={r.commissions >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE}
              />
            ))}
          </Bar>
          <Bar dataKey="swaps" stackId="cost" name="Swaps">
            {rows.map((r, i) => (
              <Cell
                key={`swap-${i}`}
                fill={r.swaps >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE}
              />
            ))}
          </Bar>
          <Bar dataKey="rebates" stackId="cost" name="Rebates">
            {rows.map((r, i) => (
              <Cell
                key={`reb-${i}`}
                fill={r.rebates >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE}
              />
            ))}
          </Bar>

          {/* Total bar — its own (un-stacked) bar, only renders on total
              rows. Color comes from the row's book. */}
          <Bar dataKey="total" name="Total">
            {rows.map((r, i) => (
              <Cell key={`tot-${i}`} fill={BOOK_COLOR[r.book]} />
            ))}
          </Bar>
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