// ============================================
// Chart2Combination — A/B/C Combination
//
// Spec (Ross's word doc + clarifications):
//   • 3 lines: A-Book / B-Book / C-Book Realised P/L on shared X-axis.
//   • y-axis: Realised P/L (USD).
//   • x-axis behaviour depends on period:
//     - Today           → hourly buckets (00:01 hour till current hour).
//     - Multi-day       → daily points for prior days + today's hourly
//                         portion appended at the right edge.
//   • Default period: This Month.
//   • Full period set: Today / This Week / This Month / Last Month /
//                      H1 / H2 / This Year.
//   • No floating tiles, no top strip — chart fills the panel.
//
// Data sources:
//   • Today period           → /api/v1/charts/hourly-pnl  (hours[])
//   • Multi-day periods      → /api/v1/portfolio/pnl-history (daily prior)
//                              + /api/v1/charts/hourly-pnl (today's hours)
//                              merged into a single timeline.
//
// Polling lifecycle (Q4): only the visible chart polls. Mount = start
// 30s interval; unmount or period change = clear interval + abort
// in-flight fetch.
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import {
  fetchHourlyPnl,
  fetchPnlHistory,
  periodToDateRange,
} from '@/services/chartsApi';

const POLL_INTERVAL_MS = 30_000;

// Brand colours per book.
const COLOR_B = '#c9b87c';   // yellow — primary
const COLOR_A = '#4ecdc4';   // teal — hedge
const COLOR_C = '#f4a261';   // orange — manual

// ── Format helpers ─────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Tick formatter — date for daily points, "HH:00" for hourly. */
function fmtTick(point: TimelinePoint): string {
  const d = new Date(point.ts);
  if (point.granularity === 'hour') {
    return `${pad2(d.getUTCHours())}:00`;
  }
  // daily — show "Apr 15"
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}`;
}

/** Compact money: $1.2k / -$3.4M / $0 — Y-axis ticks. */
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Unified timeline shape ─────────────────────────────────────
// Each point on the chart, regardless of source. `granularity` lets
// the tick formatter render daily and hourly portions distinctly.
interface TimelinePoint {
  ts:          number;            // ms epoch — natural numeric X-axis
  label:       string;            // pre-formatted tick label
  granularity: 'day' | 'hour';
  b_book:      number;
  a_book:      number;
  c_book:      number;
}

// ── Data loader ────────────────────────────────────────────────
async function loadTimeline(period: string): Promise<TimelinePoint[]> {
  // Today-only: just hourly.
  if (period === 'today') {
    const hr = await fetchHourlyPnl();
    return hr.hours.map(h => ({
      ts:          new Date(h.hour).getTime(),
      label:       '',                          // filled at render
      granularity: 'hour' as const,
      b_book:      h.b_book,
      a_book:      h.a_book,
      c_book:      h.c_book,
    }));
  }

  // Multi-day: daily prior days + today's hourly portion.
  const range = periodToDateRange(period as any);
  const fromDate = range.from.slice(0, 10);   // YYYY-MM-DD
  const toDate   = range.to.slice(0, 10);

  const [daily, hourly] = await Promise.all([
    fetchPnlHistory({ from: fromDate, to: toDate }),
    fetchHourlyPnl(),    // hourly-pnl is always today's window — backend default
  ]);

  // Today's date string for filtering daily points.
  const todayStr = new Date().toISOString().slice(0, 10);

  // Daily points for prior days only (skip today — replaced by hourly).
  const priorDays: TimelinePoint[] = daily.points
    .filter(p => p.date < todayStr)
    .map(p => ({
      // Anchor daily points at noon UTC so they sort cleanly between
      // 00:00-of-this-day and 00:00-of-next-day, and won't collide with
      // the first hourly tick.
      ts:          new Date(`${p.date}T12:00:00Z`).getTime(),
      label:       '',
      granularity: 'day' as const,
      // Defensive against the legacy `bbook` (no underscore) field — backend
      // is being migrated to `b_book` per Q8. Either-or, never both populated.
      b_book:      p.b_book ?? (p as any).bbook ?? 0,
      a_book:      p.a_book ?? 0,
      c_book:      p.c_book ?? 0,
    }));

  // Today's hourly points.
  const todayHours: TimelinePoint[] = hourly.hours.map(h => ({
    ts:          new Date(h.hour).getTime(),
    label:       '',
    granularity: 'hour' as const,
    b_book:      h.b_book,
    a_book:      h.a_book,
    c_book:      h.c_book,
  }));

  // Sort by timestamp — daily points (noon) interleave correctly with
  // any future hours of today.
  return [...priorDays, ...todayHours].sort((a, b) => a.ts - b.ts);
}

// ── Component ──────────────────────────────────────────────────
export function Chart2Combination({ period }: ChartComponentProps) {
  const [points,  setPoints]  = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  // Cancel in-flight fetch on period change / unmount to prevent
  // stale responses from clobbering fresh state.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const data = await loadTimeline(period);
        if (!mounted || ctrl.signal.aborted) return;
        setPoints(data);
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
  if (loading && points.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && points.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (points.length === 0) {
    return (
      <BodyMessage>
        No realised P/L yet for this period — chart will populate as fills come in
      </BodyMessage>
    );
  }

  // Decorate each point with its tick label.
  const data = points.map(p => ({ ...p, label: fmtTick(p) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" />
        <XAxis
          dataKey="label"
          stroke="#808080"
          tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={fmtMoney}
          stroke="#808080"
          tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
          width={64}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#252429',
            border: '1px solid #3a3a3c',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [fmtMoney(value), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
        <Line type="monotone" dataKey="b_book" name="B-Book" stroke={COLOR_B} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="a_book" name="A-Book" stroke={COLOR_A} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="c_book" name="C-Book" stroke={COLOR_C} strokeWidth={2} dot={false} />
      </LineChart>
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