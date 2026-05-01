// ============================================
// Chart2Combination — A/B/C Combination (3 synchronized stacked charts)
//
// Spec: matches the Highcharts "synchronized-charts" demo
// (https://www.highcharts.com/demo/highcharts/synchronized-charts).
//
// Layout:
//   Three vertically-stacked LineCharts, equal height (1/3 each):
//     • Top    — B-Book (yellow)
//     • Middle — A-Book (teal)
//     • Bottom — C-Book (orange)
//   Each panel has its own independent Y-axis so the smaller books
//   are still readable when B-Book has 100x larger swings.
//   X-axis is shared across the three (same data points, same labels).
//
// Synchronized cursor:
//   When the user hovers one panel, a vertical cursor line appears at
//   the same X-index on the OTHER two panels too. Implemented via a
//   shared `activeIndex` state held at the parent level — each panel
//   receives the index, draws a ReferenceLine at that X, and reports
//   its own mouse moves up to the parent.
//
// Data:
//   Same dual-source pattern as the previous Chart 2 implementation:
//     • Period = today           → /api/v1/charts/hourly-pnl  (hourly)
//     • Period = multi-day       → /api/v1/portfolio/pnl-history (daily)
//                                  + /api/v1/charts/hourly-pnl  (today's hours)
//   Merged into a single timeline shared across the three panels.
//
// Polling: 30s while visible (cancel on unmount or period change).
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import {
  fetchHourlyPnl,
  fetchPnlHistory,
  periodToDateRange,
} from '@/services/chartsApi';
import { BOOK_COLORS } from './bookColors';

const POLL_INTERVAL_MS = 30_000;

// Brand colours per book — sourced from the central palette.
const COLOR_B = BOOK_COLORS.b;
const COLOR_A = BOOK_COLORS.a;
const COLOR_C = BOOK_COLORS.c;

// ── Format helpers ─────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtTickLabel(ts: number, granularity: 'day' | 'hour'): string {
  const d = new Date(ts);
  if (granularity === 'hour') {
    return `${pad2(d.getUTCHours())}:00`;
  }
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCDate()}`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Unified timeline shape ─────────────────────────────────────
interface TimelinePoint {
  ts:          number;            // ms epoch — natural numeric X
  label:       string;            // pre-formatted tick label
  granularity: 'day' | 'hour';
  b_book:      number;
  a_book:      number;
  c_book:      number;
}

// ── Data loader (unchanged behaviour from previous Chart 2) ────
async function loadTimeline(period: string): Promise<TimelinePoint[]> {
  if (period === 'today') {
    const hr = await fetchHourlyPnl();
    return hr.hours.map(h => ({
      ts:          new Date(h.hour).getTime(),
      label:       fmtTickLabel(new Date(h.hour).getTime(), 'hour'),
      granularity: 'hour' as const,
      b_book:      h.b_book,
      a_book:      h.a_book,
      c_book:      h.c_book,
    }));
  }

  const range = periodToDateRange(period as any);
  const fromDate = range.from.slice(0, 10);
  const toDate   = range.to.slice(0, 10);

  const [daily, hourly] = await Promise.all([
    fetchPnlHistory({ from: fromDate, to: toDate }),
    fetchHourlyPnl(),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const priorDays: TimelinePoint[] = daily.points
    .filter(p => p.date < todayStr)
    .map(p => {
      // Daily points anchored at noon UTC for clean sort.
      const ts = new Date(`${p.date}T12:00:00Z`).getTime();
      return {
        ts,
        label:       fmtTickLabel(ts, 'day'),
        granularity: 'day' as const,
        // Defensive: backend transitionally still emits legacy `bbook`.
        b_book:      p.b_book ?? (p as any).bbook ?? 0,
        a_book:      p.a_book ?? 0,
        c_book:      p.c_book ?? 0,
      };
    });

  const todayHours: TimelinePoint[] = hourly.hours.map(h => {
    const ts = new Date(h.hour).getTime();
    return {
      ts,
      label:       fmtTickLabel(ts, 'hour'),
      granularity: 'hour' as const,
      b_book:      h.b_book,
      a_book:      h.a_book,
      c_book:      h.c_book,
    };
  });

  return [...priorDays, ...todayHours].sort((a, b) => a.ts - b.ts);
}

// ── Component ──────────────────────────────────────────────────
export function Chart2Combination({ period }: ChartComponentProps) {
  const [points,  setPoints]  = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  // Synchronized cursor — null means "no panel hovered". Set by the
  // panel currently under the mouse via onMouseMove; cleared on
  // onMouseLeave. Read by all three panels to draw the ReferenceLine.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  // All-zero detector for the pipeline-pending overlay.
  const allZero =
    points.every(p => p.a_book === 0 && p.b_book === 0 && p.c_book === 0);

  // Panel descriptors — same data array, different dataKey + color
  // per panel. Top panel keeps the X-axis hidden (label-less), middle
  // also; only the bottom panel renders the X-axis labels (saves
  // vertical space and matches the Highcharts demo).
  const panels = [
    { dataKey: 'b_book' as const, name: 'B-Book', color: COLOR_B, showXAxis: false },
    { dataKey: 'a_book' as const, name: 'A-Book', color: COLOR_A, showXAxis: false },
    { dataKey: 'c_book' as const, name: 'C-Book', color: COLOR_C, showXAxis: true  },
  ];

  return (
    <div className="h-full w-full flex flex-col gap-1 relative">
      {panels.map(panel => (
        <div key={panel.dataKey} className="flex-1 min-h-0">
          <SyncPanel
            data={points}
            dataKey={panel.dataKey}
            name={panel.name}
            color={panel.color}
            showXAxis={panel.showXAxis}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
          />
        </div>
      ))}

      {allZero && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded font-mono text-[10px]"
          style={{
            backgroundColor: '#252429',
            border: '1px solid #d4a05266',
            color: '#d4a052',
            pointerEvents: 'none',
          }}
        >
          All values $0 — daily P&L pipeline pending
        </div>
      )}
    </div>
  );
}

// ── SyncPanel — one of the three stacked charts ────────────────
interface SyncPanelProps {
  data:                TimelinePoint[];
  dataKey:             'b_book' | 'a_book' | 'c_book';
  name:                string;
  color:               string;
  showXAxis:           boolean;
  activeIndex:         number | null;
  onActiveIndexChange: (idx: number | null) => void;
}

function SyncPanel({
  data,
  dataKey,
  name,
  color,
  showXAxis,
  activeIndex,
  onActiveIndexChange,
}: SyncPanelProps) {
  // Recharts gives us activeTooltipIndex on every mouse-move event; we
  // bubble it to the parent via onActiveIndexChange. Other panels read
  // back through `activeIndex` and draw the ReferenceLine.
  const handleMove = (state: any) => {
    if (state && state.activeTooltipIndex != null) {
      onActiveIndexChange(state.activeTooltipIndex);
    }
  };
  const handleLeave = () => onActiveIndexChange(null);

  // The label at the synced index — drives ReferenceLine x-coordinate.
  const activeLabel =
    activeIndex != null && activeIndex >= 0 && activeIndex < data.length
      ? data[activeIndex].label
      : null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 4, right: 16, bottom: showXAxis ? 16 : 0, left: 0 }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" />
        <XAxis
          dataKey="label"
          stroke="#808080"
          tick={
            showXAxis
              ? { fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }
              : false
          }
          axisLine={showXAxis}
          tickLine={showXAxis}
          height={showXAxis ? 20 : 0}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={fmtMoney}
          stroke="#808080"
          tick={{ fill: '#d2d6e2', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
          width={64}
          // Each panel scales independently — readable even when other
          // books have very different magnitudes.
          domain={['auto', 'auto']}
          label={{
            value:    name,
            angle:    -90,
            position: 'insideLeft',
            offset:   10,
            style: {
              fill:       color,
              fontSize:   11,
              fontFamily: 'IBM Plex Mono, monospace',
              fontWeight: 600,
              textAnchor: 'middle',
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
          formatter={(value: number) => [fmtMoney(value), name]}
          // Hide cursor here — we draw our own ReferenceLine for sync.
          cursor={false}
        />
        {/* Synchronized cursor — drawn in EVERY panel at the same
            X-label, regardless of which panel the mouse is over. */}
        {activeLabel != null && (
          <ReferenceLine
            x={activeLabel}
            stroke="#ffffff66"
            strokeWidth={1}
            ifOverflow="extendDomain"
          />
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
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