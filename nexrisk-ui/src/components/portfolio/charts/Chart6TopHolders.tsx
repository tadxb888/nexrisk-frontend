// ============================================
// Chart6TopHolders — Top 30 Holders
//
// Per Ross's spec (Chart 6):
//   • Pure ranked horizontal bar chart, sorted descending by volume_lots.
//   • Period FIXED to month-to-date — backend ignores from/to.
//     The UI does NOT expose a period selector for this chart.
//   • Y-axis tick = "login — name" when `name` is non-empty,
//     just `login` when empty (MT5 convention).
//   • X-axis = volume in lots.
//   • Tooltip surfaces deal_count + group_name (group may contain
//     backslashes — React renders text content safely so no
//     additional escaping needed for the JSX path; backslashes in
//     attribute values would need handling but we don't put them
//     there).
//   • 60s polling per spec.
//
// Data:
//   GET /api/v1/charts/top-holders?limit=30
//   Backend already returns rows sorted descending by volume_lots,
//   but we sort defensively here too in case a future revision
//   relaxes that.
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchTopHolders } from '@/services/chartsApi';
import type { Holder } from '@/types/charts';

const POLL_INTERVAL_MS = 60_000;
const HOLDER_LIMIT     = 30;

// Single-color ranked bar — yellow (B-Book brand color) since these
// are gross broker volumes, not directional.
const BAR_COLOR    = '#c9b87c';
const BAR_STROKE   = '#a89a64';

// ── Format helpers ─────────────────────────────────────────────
function fmtLots(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

/** Y-axis label per row: "login — name" if name; else just "login". */
function fmtHolderLabel(h: Holder): string {
  const name = (h.name ?? '').trim();
  return name ? `${h.login} — ${name}` : h.login;
}

// ── Decorated row for plotting ─────────────────────────────────
// We pre-compute the Y-axis label so Recharts can use a simple
// dataKey and we don't recompute on every render.
interface ChartRow extends Holder {
  label: string;
}

function decorate(holders: Holder[]): ChartRow[] {
  return holders
    // Defensive sort — backend returns sorted but never trust without
    // checking. Use stable descending by volume_lots.
    .slice()
    .sort((a, b) => b.volume_lots - a.volume_lots)
    .map(h => ({ ...h, label: fmtHolderLabel(h) }));
}

// ── Component ──────────────────────────────────────────────────
// `period` prop is in the signature for ChartComponentProps compat —
// this chart ignores it (backend hardcodes MTD).
export function Chart6TopHolders(_props: ChartComponentProps) {
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
        const json = await fetchTopHolders({ limit: HOLDER_LIMIT });
        if (!mounted || ctrl.signal.aborted) return;
        setRows(decorate(json.holders));
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
  }, []);  // No dependencies — period locked, mount once.

  // ── Render branches ──────────────────────────────────────────
  if (loading && rows.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && rows.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (rows.length === 0) {
    return <BodyMessage>No holders found for this month</BodyMessage>;
  }

  // Each ranked bar is capped at maxBarSize so single-holder cases
  // don't render a single enormous bar filling the pane.
  const MAX_BAR_SIZE = 20;

  // Dynamic Y-axis width — rough char-pixel multiplier for the 11px
  // IBM Plex Mono font, plus a little padding. Floor of 80 so a
  // single short label doesn't produce a cramped left margin; cap of
  // 200 keeps very long group names from eating the chart area.
  const longestLabelChars = rows.reduce(
    (max, r) => Math.max(max, r.label.length),
    0,
  );
  const yAxisWidth = Math.min(200, Math.max(80, longestLabelChars * 7 + 16));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 8, right: 32, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={fmtLots}
          stroke="#808080"
          tick={{
            fill:       '#d2d6e2',
            fontSize:   11,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        />
        <YAxis
          type="category"
          dataKey="label"
          stroke="#808080"
          tick={{
            fill:       '#d2d6e2',
            fontSize:   11,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
          // Auto-width based on actual label content — tight when names
          // are short, wider when they're long.
          width={yAxisWidth}
          interval={0}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#252429',
            border:          '1px solid #3a3a3c',
            fontFamily:      'IBM Plex Mono, monospace',
            fontSize:        12,
          }}
          // Tooltip shows volume + deals + group. group_name may
          // contain backslashes; React renders as text, no escape
          // problem.
          formatter={(value: number, _name: string, item: any) => {
            const p          = item?.payload as ChartRow | undefined;
            const dealCount  = p?.deal_count;
            const groupName  = p?.group_name;
            const dealsText  = dealCount != null ? `   (${dealCount} deals)` : '';
            const groupText  = groupName       ? `   group: ${groupName}`    : '';
            return [
              `${fmtLots(value)} lots${dealsText}${groupText}`,
              'Volume',
            ];
          }}
          cursor={{ fill: '#ffffff10' }}
        />
        <Bar
          dataKey="volume_lots"
          fill={BAR_COLOR}
          stroke={BAR_STROKE}
          strokeWidth={1}
          maxBarSize={MAX_BAR_SIZE}
          isAnimationActive={false}
        />
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