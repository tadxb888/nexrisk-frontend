// ============================================
// Chart3PortfolioPerformance — Portfolio Performance
//
// Per Ross's spec (option α — single clean cumulative line):
//   • One line: cumulative P/L over the selected period.
//   • Period selector: full set; default This Month.
//   • Backend uses date-only YYYY-MM-DD (daily grain — intentional,
//     not ISO 8601 like the other endpoints).
//   • 5min polling per the spec table.
//
// Data:
//   GET /api/v1/portfolio/pnl-history?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Response: { from, to, points: [{ date, daily_pnl, cumulative_pnl,
//                                    a_book, b_book, c_book }], note }
//
// Known data gap (per spec):
//   `daily_bbook_stats` EOD job is currently not running, so points
//   may all be zeros across April. Same all-zero overlay pattern as
//   Chart 2 — call out the upstream data state honestly so the user
//   doesn't think the chart is broken.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchPnlHistory, periodToDateOnlyRange } from '@/services/chartsApi';
import type { PnlHistoryPoint } from '@/types/charts';

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes per spec

// P/L colours — green = positive, red = negative. Same palette the rest
// of the app uses for P/L sign indicators (see pnlColor in
// PortfolioStatsContext).
const COLOR_POSITIVE        = '#6aaa78';
const COLOR_POSITIVE_FILL   = 'rgba(106, 170, 120, 0.25)';
const COLOR_NEGATIVE        = '#d07070';
const COLOR_NEGATIVE_FILL   = 'rgba(208, 112, 112, 0.25)';

// ── Format helpers ─────────────────────────────────────────────
/** "2026-04-15" → "Apr 15" */
function fmtDateLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  if (isNaN(dt.getTime())) return d;
  const month = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${dt.getUTCDate()}`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// ── Component ──────────────────────────────────────────────────
export function Chart3PortfolioPerformance({ period }: ChartComponentProps) {
  const [points,  setPoints]  = useState<PnlHistoryPoint[]>([]);
  const [note,    setNote]    = useState<string>('');
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
        // Date-only YYYY-MM-DD format — Chart 3 is daily-grain by design.
        const range = periodToDateOnlyRange(period);
        const json  = await fetchPnlHistory({ from: range.from, to: range.to });
        if (!mounted || ctrl.signal.aborted) return;
        setPoints(json.points);
        setNote(json.note ?? '');
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

  // ── Derived data (must be computed BEFORE any conditional return) ─
  // Both of these are unconditional renders — `data` is a plain map,
  // `gradientOffset` is a useMemo. Hooks must run on every render in
  // the same order, so they go above the early-return guards below.
  const data = points.map(p => ({ ...p, label: fmtDateLabel(p.date) }));

  // ── Sign-split gradient offset ────────────────────────────────
  // The gradient spans the chart's vertical extent (from the data's
  // max value at the top down to its min at the bottom). The "zero
  // line" sits somewhere in between — we calculate where as a 0..1
  // fraction of the gradient's height. `offset` becomes the stop
  // position where colour flips from positive (above) to negative
  // (below).
  //
  //   gradient top    = max value     → offset 0
  //   gradient bottom = min value     → offset 1
  //   zero crossing   = max / (max - min) when min < 0 < max
  //
  // If all positive: offset = 1 (entire gradient = positive colour).
  // If all negative: offset = 0 (entire gradient = negative colour).
  // Empty data: offset = 1 (harmless — chart never renders anyway).
  const gradientOffset = useMemo(() => {
    if (data.length === 0) return 1;
    const values = data.map(d => d.cumulative_pnl);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [data]);

  // All-zero detector — same overlay pattern as Chart 2.
  const allZero =
    points.length > 0 &&
    points.every(p => p.cumulative_pnl === 0 && p.daily_pnl === 0);

  // ── Render branches ──────────────────────────────────────────
  if (loading && points.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && points.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  // Backend returns a non-empty `note` when the period has no data
  // available at all — surface it directly rather than rendering an
  // empty axis.
  if (note && points.length === 0) {
    return <BodyMessage>{note}</BodyMessage>;
  }
  if (points.length === 0) {
    return <BodyMessage>No P/L history yet for this period</BodyMessage>;
  }

  return (
    <div className="h-full w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          {/* SVG gradient defs — both stroke and fill share the same
              zero-crossing offset, so the line and the area below it
              flip colour together at y=0. */}
          <defs>
            <linearGradient id="pnlStrokeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset={gradientOffset} stopColor={COLOR_POSITIVE} stopOpacity={1} />
              <stop offset={gradientOffset} stopColor={COLOR_NEGATIVE} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="pnlFillGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset={gradientOffset} stopColor={COLOR_POSITIVE_FILL} stopOpacity={1} />
              <stop offset={gradientOffset} stopColor={COLOR_NEGATIVE_FILL} stopOpacity={1} />
            </linearGradient>
          </defs>

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
          {/* Subtle zero baseline so the colour split is visually anchored. */}
          <ReferenceLine y={0} stroke="#808080" strokeDasharray="2 4" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#252429',
              border:          '1px solid #3a3a3c',
              fontFamily:      'IBM Plex Mono, monospace',
              fontSize:        12,
            }}
            formatter={(value: number, _name: string, item: any) => {
              const daily = item?.payload?.daily_pnl;
              const sign  = daily != null && daily >= 0 ? '+' : '';
              return [
                `${fmtMoney(value)}${daily != null ? `   (day: ${sign}${fmtMoney(daily)})` : ''}`,
                'Cumulative P/L',
              ];
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative_pnl"
            // Both stroke and fill point at their own gradient — defined
            // above with matching offsets so they flip in sync at zero.
            stroke="url(#pnlStrokeGradient)"
            fill="url(#pnlFillGradient)"
            // baseValue=0 is what makes the fill "anchor" at the zero
            // line instead of the chart's bottom edge. Without this, a
            // negative cumulative value would still fill up to the
            // chart's bottom from the curve down — which would look
            // like a positive area.
            baseValue={0}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {allZero && (
        <div
          className="absolute top-2 right-2 px-2 py-1 rounded font-mono text-[10px]"
          style={{
            backgroundColor: '#252429',
            border:          '1px solid #c9b87c66',
            color:           '#c9b87c',
            pointerEvents:   'none',
          }}
        >
          All values $0 — daily P&L pipeline pending
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