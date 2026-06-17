// ============================================
// Chart1MostTradedSymbols — Most Traded Symbols (B-Book)
//
// Spec (Ross's word doc + CHARTS_API.md):
//   • Vertical bar chart with rotated symbol labels (Highcharts demo
//     "column-rotated-labels"): one bar per symbol, colored yellow
//     (B-Book brand color).
//   • X-axis: symbol (rotated 45° for readability).
//   • Y-axis: volume (long + short, in MT5 lots).
//   • Sorted descending by volume_lots — backend returns this order.
//   • Period selector: full set (Today / This Week / This Month /
//     Last Month / H1 / H2 / This Year). Default: This Month.
//   • Polling: 60s while visible (per spec table).
//
// Data source:
//   GET /api/v1/charts/most-traded-symbols?from&to&limit
//
// Behaviour:
//   • limit fixed at 20 (the spec's default — fits comfortably on one
//     screen with rotated labels). Could be made configurable later.
//   • Period change triggers immediate refetch + restarts polling timer.
//   • Mount → first fetch + 60s interval. Unmount/period-change →
//     interval cleared and in-flight fetch aborted (only-visible-chart
//     polls per Q4 / spec).
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
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchMostTradedSymbols, periodToDateRange } from '@/services/chartsApi';
import type { SymbolVolume } from '@/types/charts';
const POLL_INTERVAL_MS = 60_000;
const SYMBOL_LIMIT     = 20;

// Alternating two-color palette matching the rest of the app
// (BBookCharts BLUE_GRADIENT + TEAL_GRADIENT mid tones).
// Bars cycle even / odd to give a clean rhythm to the chart.
const BAR_COLORS = ['#577a9e', '#5b9b9b'] as const;

// ── Format helpers ─────────────────────────────────────────────
/** Compact lots: 206.4 / 1.2k / 1.2M */
function fmtLots(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

// ── Component ──────────────────────────────────────────────────
export function Chart1MostTradedSymbols({ period }: ChartComponentProps) {
  const [symbols, setSymbols] = useState<SymbolVolume[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  // Cancel in-flight fetch on period change / unmount — prevents stale
  // responses from late requests clobbering fresh state.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const range = periodToDateRange(period);
        const json  = await fetchMostTradedSymbols({
          from:  range.from,
          to:    range.to,
          limit: SYMBOL_LIMIT,
        });
        if (!mounted || ctrl.signal.aborted) return;
        setSymbols(json.symbols);
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
  if (loading && symbols.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && symbols.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (symbols.length === 0) {
    return <BodyMessage>No B-Book trades for this period</BodyMessage>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={symbols}
        // Bottom margin pulled out to leave room for the rotated X-axis
        // labels — at angle -45 they extend below the axis line.
        margin={{ top: 8, right: 16, bottom: 56, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" vertical={false} />
        <XAxis
          dataKey="symbol"
          stroke="#808080"
          tick={{
            fill:       '#d2d6e2',
            fontSize:   11,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
          interval={0}             // show every label, no auto-skip
          angle={-45}              // rotated, matches the Highcharts demo
          textAnchor="end"
        />
        <YAxis
          tickFormatter={fmtLots}
          stroke="#808080"
          tick={{
            fill:       '#d2d6e2',
            fontSize:   11,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
          width={56}
          label={{
            value:    'volume (lots)',
            angle:    -90,
            position: 'insideLeft',
            style:    {
              fill: '#808080',
              fontSize: 10,
              fontFamily: 'IBM Plex Mono, monospace',
            },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#252429',
            border:          '1px solid #3a3a3c',
            fontFamily:      'IBM Plex Mono, monospace',
            fontSize:        12,
          }}
          // Tooltip body: "EURUSD — 206.4 lots (186 deals)"
          formatter={(value: number, _name: string, item: any) => {
            const dealCount = item?.payload?.deal_count;
            return [
              `${fmtLots(value)} lots${dealCount != null ? `  (${dealCount} deals)` : ''}`,
              'Volume',
            ];
          }}
          cursor={{ fill: '#ffffff10' }}
        />
        <Bar dataKey="volume_lots">
          {symbols.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
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