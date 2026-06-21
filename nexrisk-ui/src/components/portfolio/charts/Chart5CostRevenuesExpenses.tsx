// ============================================
// Chart5CostRevenuesExpenses — Cost: Revenues & Expenses
//
// Per Ross's spec (Chart 5):
//   • One group of 4 bars per month:
//       1. commission_earned   — broker commission collected from clients
//       2. swap_earned         — overnight swap collected
//       3. lp_commission_paid  — commission paid to LPs (rendered as
//                                NEGATIVE so it sits below the zero line)
//       4. net_revenue         — spread captured net of basis slippage
//   • Each bar is sign-aware:
//       value ≥ 0  → its category color (green / yellow / teal)
//       value <  0 → red (loss for the broker that period)
//   • lp_commission_paid is always ≥ 0 from backend (it's an expense the
//     broker pays). We FLIP its sign before plotting so it always
//     renders below zero in red. Tooltip still shows the absolute paid.
//   • swap_earned can legitimately be negative (broker net-pays swap to
//     clients on certain pairs) — render below zero red when so.
//   • net_revenue can be ± too.
//   • No rebates column — broker doesn't track rebates.
//
//   Default period: Last 3 Months.
//   Period options: Last 3 Months / Last 6 Months / Last 12 Months.
//   60s polling not appropriate — monthly data; spec says 5min.
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
  Cell,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchCostSummary, periodToDateRange } from '@/services/chartsApi';
import type { CostMonth } from '@/types/charts';

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes per spec

// Brand palette per series.
const COLOR_COMMISSION = '#6aaa78';   // green
const COLOR_SWAP       = '#c9b87c';   // yellow
const COLOR_NET_REV    = '#4ecdc4';   // teal
const COLOR_LP_PAID    = '#d07070';   // red
const COLOR_NEGATIVE   = '#d07070';   // sign-flipped values render in this

// ── Format helpers ─────────────────────────────────────────────
/** "2026-04" → "Apr '26" */
function fmtMonthLabel(m: string): string {
  // m is "YYYY-MM"
  const [y, mm] = m.split('-');
  if (!y || !mm) return m;
  const dt = new Date(Date.UTC(Number(y), Number(mm) - 1, 1));
  if (isNaN(dt.getTime())) return m;
  const month = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} '${y.slice(2)}`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Decorated row for plotting ─────────────────────────────────
// We flip lp_commission_paid's sign here so the chart renders it below
// zero. The original value remains in the row for the tooltip to
// display unmodified.
interface ChartRow extends CostMonth {
  label:               string;
  /** lp_commission_paid * -1 — the value used for the bar height. */
  lp_commission_paid_signed: number;
}

function decorate(months: CostMonth[]): ChartRow[] {
  return months.map(m => ({
    ...m,
    label:                     fmtMonthLabel(m.month),
    lp_commission_paid_signed: -Math.abs(m.lp_commission_paid),
  }));
}

// ── Component ──────────────────────────────────────────────────
export function Chart5CostRevenuesExpenses({ period }: ChartComponentProps) {
  const [rows,    setRows]    = useState<ChartRow[]>([]);
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
        const range = periodToDateRange(period);
        const json  = await fetchCostSummary({ from: range.from, to: range.to });
        if (!mounted || ctrl.signal.aborted) return;
        setRows(decorate(json.months));
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
  if (loading && rows.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && rows.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (rows.length === 0) {
    return <BodyMessage>No revenue data for this period</BodyMessage>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        // Auto-shrinks bar widths as month count grows. 3 months = wide
        // bars; 12 months = thin bars. Recharts handles the math.
        barCategoryGap="20%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="#808080"
          tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
          interval={0}
        />
        <YAxis
          tickFormatter={fmtMoney}
          stroke="#808080"
          tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
          width={64}
        />
        {/* Zero baseline emphasised — colour split anchor. */}
        <ReferenceLine y={0} stroke="#808080" strokeDasharray="2 4" />
        <Tooltip
          contentStyle={{
            backgroundColor: '#252429',
            border:          '1px solid #3a3a3c',
            fontFamily:      'IBM Plex Mono, monospace',
            fontSize:        12,
          }}
          // Tooltip needs to (a) translate signed lp_commission_paid back
          // to its display value, (b) rename _signed dataKey to a
          // human label.
          formatter={(value: number, name: string, item: any) => {
            if (name === 'LP Commission Paid') {
              // lp_commission_paid_signed is shown — flip back.
              const original = item?.payload?.lp_commission_paid ?? Math.abs(value);
              return [`-${fmtMoney(Math.abs(original))}`, name];
            }
            return [fmtMoney(value), name];
          }}
          cursor={{ fill: '#ffffff10' }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
        />

        {/* commission_earned — green (red if anomalous negative) */}
        <Bar dataKey="commission_earned" name="Commission Earned" fill={COLOR_COMMISSION}>
          {rows.map((r, i) => (
            <Cell
              key={`com-${i}`}
              fill={r.commission_earned < 0 ? COLOR_NEGATIVE : COLOR_COMMISSION}
            />
          ))}
        </Bar>

        {/* swap_earned — yellow when positive, red when negative
            (legit case: broker net-pays swap on a high-positive-swap
            currency where clients hold long overnight). */}
        <Bar dataKey="swap_earned" name="Swap Earned" fill={COLOR_SWAP}>
          {rows.map((r, i) => (
            <Cell
              key={`swap-${i}`}
              fill={r.swap_earned < 0 ? COLOR_NEGATIVE : COLOR_SWAP}
            />
          ))}
        </Bar>

        {/* net_revenue — teal positive / red negative */}
        <Bar dataKey="net_revenue" name="Spread Revenue" fill={COLOR_NET_REV}>
          {rows.map((r, i) => (
            <Cell
              key={`net-${i}`}
              fill={r.net_revenue < 0 ? COLOR_NEGATIVE : COLOR_NET_REV}
            />
          ))}
        </Bar>

        {/* lp_commission_paid — always red, always below zero (we
            flipped the sign in `decorate`). */}
        <Bar dataKey="lp_commission_paid_signed" name="LP Commission Paid" fill={COLOR_LP_PAID}>
          {rows.map((_r, i) => (
            <Cell key={`lp-${i}`} fill={COLOR_LP_PAID} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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