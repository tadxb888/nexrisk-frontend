// ============================================
// Chart8DailyVolumes — Daily Volumes per Book (time series)
//
// Per Ross's Phase 2 spec:
//   • 4 lines: B-Book, A-Book, C-Book, Portfolio
//   • One point per day over the selected period
//   • Gross volume only (long + short) — no Long/Short toggle in v1
//   • Local Lots/Notional toggle (defaults to Lots)
//   • Period selector: this_week / this_month / last_month / h1 / h2 /
//     this_year — default this_month. "today" intentionally excluded
//     (single-day data point isn't useful for a time-series view).
//   • 5min polling per spec.
//
// Visual conventions:
//   • Colors come from the central bookColors module (single source of
//     truth — see bookColors.ts).
//   • Tooltip is FIXED to the top-right of the chart and never follows
//     the cursor — keeps the lines unobscured. Lists all four books
//     with labels and the active unit suffix ("Lots" / "Units").
//   • Legend is click-to-toggle: click a book's chip to hide/show its
//     line. Hidden books are dimmed in the legend.
//
// Data source:
//   GET /api/v1/charts/daily-volumes?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Response shape (see DailyVolumesResponse in chartsApi.ts):
//   { from, to, points: [{ date, b, a, c, portfolio }, ...] }
//   each book object has volume_lots / volume_notional / longs_lots /
//   shorts_lots / long_volume_notional / short_volume_notional.
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
} from 'recharts';

import type { ChartComponentProps } from './registry';
import {
  fetchDailyVolumes,
  periodToDateOnlyRange,
  type DailyVolumePoint,
} from '@/services/chartsApi';
import { BOOK_COLORS, BOOK_LABELS } from './bookColors';

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes per spec

// ── Local volume mode toggle ──────────────────────────────────
type VolumeMode = 'lots' | 'notional';

// ── Series identity — drives line + legend + tooltip rendering ────
type BookKey = 'b' | 'a' | 'c' | 'portfolio';

interface SeriesDef {
  key:        BookKey;
  dataKey:    'b_value' | 'a_value' | 'c_value' | 'p_value';
  name:       string;
  color:      string;
  /** Portfolio line is slightly thicker — it's the aggregate. */
  strokeWidth: number;
}

const SERIES: SeriesDef[] = [
  { key: 'b',         dataKey: 'b_value', name: BOOK_LABELS.b,         color: BOOK_COLORS.b,         strokeWidth: 2.5 },
  { key: 'a',         dataKey: 'a_value', name: BOOK_LABELS.a,         color: BOOK_COLORS.a,         strokeWidth: 2.5 },
  { key: 'c',         dataKey: 'c_value', name: BOOK_LABELS.c,         color: BOOK_COLORS.c,         strokeWidth: 2.5 },
  { key: 'portfolio', dataKey: 'p_value', name: BOOK_LABELS.portfolio, color: BOOK_COLORS.portfolio, strokeWidth: 3   },
];

// ── Format helpers ─────────────────────────────────────────────
/** "2026-04-15" → "Apr 15" */
function fmtDateLabel(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  if (isNaN(dt.getTime())) return d;
  const month = dt.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${dt.getUTCDate()}`;
}

/** Compact units: 206.4 / 1.2k / 1.2M. Used for both lots and notional —
 *  same "units" semantics, magnitudes vary by asset class (XAU lot ≠ FX lot). */
function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

// ── Decorated row for plotting ─────────────────────────────────
interface ChartRow {
  date:      string;
  label:     string;
  b_value:   number;
  a_value:   number;
  c_value:   number;
  p_value:   number;
}

function decorate(points: DailyVolumePoint[], mode: VolumeMode): ChartRow[] {
  const key = mode === 'lots' ? 'volume_lots' : 'volume_notional';
  return points.map(p => ({
    date:    p.date,
    label:   fmtDateLabel(p.date),
    b_value: p.b[key],
    a_value: p.a[key],
    c_value: p.c[key],
    p_value: p.portfolio[key],
  }));
}

// ── Component ──────────────────────────────────────────────────
export function Chart8DailyVolumes({ period }: ChartComponentProps) {
  const [points,     setPoints]     = useState<DailyVolumePoint[]>([]);
  const [loading,    setLoading]    = useState<boolean>(true);
  const [error,      setError]      = useState<string | null>(null);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>('lots');
  // Per-book hidden state — map from BookKey → true means hidden.
  // Click a legend chip to toggle. Hidden lines render at 0 opacity
  // so the chart re-layouts smoothly (vs. removing the <Line> entirely
  // which would jolt the Y-axis scale on every toggle).
  const [hidden, setHidden] = useState<Record<BookKey, boolean>>({
    b:         false,
    a:         false,
    c:         false,
    portfolio: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const range = periodToDateOnlyRange(period);
        const json  = await fetchDailyVolumes({ from: range.from, to: range.to });
        if (!mounted || ctrl.signal.aborted) return;
        setPoints(json.points);
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

  // Re-decorate whenever points or mode change. Cheap (small arrays).
  const data = decorate(points, volumeMode);

  const toggleBook = (k: BookKey) => {
    setHidden(prev => ({ ...prev, [k]: !prev[k] }));
  };

  // ── Render branches ──────────────────────────────────────────
  if (loading && points.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && points.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (points.length === 0) {
    return <BodyMessage>No volume data for this period</BodyMessage>;
  }

  const unitLabel = volumeMode === 'lots' ? 'Lots' : 'Units';

  return (
    <div className="h-full w-full flex flex-col">
      {/* ── Top strip — Lots/Notional toggle ───────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-end gap-2 pb-2 px-1">
        <span className="text-[10px] font-mono text-[#808080]">Volume:</span>
        <div className="flex bg-[#232225] border border-[#555] rounded overflow-hidden">
          {(['lots', 'notional'] as VolumeMode[]).map((m, i) => (
            <button
              key={m}
              onClick={() => setVolumeMode(m)}
              className={
                'px-2 py-0.5 text-[11px] font-mono transition-colors ' +
                (volumeMode === m
                  ? 'text-white'
                  : 'text-[#aaa] hover:text-white') +
                (i > 0 ? ' border-l border-[#555]' : '')
              }
              style={
                // Selected uses a darker teal (#2a6d6d) instead of the
                // bright teal that washed out white text.
                volumeMode === m
                  ? { backgroundColor: '#2a6d6d' }
                  : undefined
              }
            >
              {m === 'lots' ? 'Lots' : 'Notional'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart body — relative so the fixed-corner tooltip can
          anchor inside the chart's bounding box. ─────────────── */}
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            // Right margin pulled out to make room for the fixed
            // tooltip card sitting in the top-right corner.
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
              tickFormatter={fmtCompact}
              stroke="#808080"
              tick={{ fill: '#d2d6e2', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
              width={64}
              label={{
                value:    volumeMode === 'lots' ? 'volume (lots)' : 'volume (units)',
                angle:    -90,
                position: 'insideLeft',
                offset:   10,
                style: {
                  fill: '#808080',
                  fontSize: 10,
                  fontFamily: 'IBM Plex Mono, monospace',
                },
              }}
            />
            {/* Custom tooltip — uses Recharts' standard cursor (vertical
                line at the hovered X) but renders our own card OUT OF
                the way of the lines via `position={{x:..,y:..}}` and a
                custom content function. */}
            <Tooltip
              cursor={{ stroke: '#ffffff66', strokeWidth: 1 }}
              // Anchor the tooltip card to a fixed position inside the
              // chart bounding box (top-right corner). Recharts treats
              // these coords as offsets from the chart container's
              // top-left, so {x: 0, y: 0} would be top-left. We push it
              // toward the right edge with a generous offset; the
              // CustomTooltip itself uses absolute width so it doesn't
              // depend on Recharts' overflow detection.
              position={{ x: undefined as any, y: 8 }}
              wrapperStyle={{
                pointerEvents: 'none',
                // Pin to the right edge of the chart container.
                right: 8,
                left:  'auto',
              }}
              content={(props) => (
                <CustomTooltip
                  {...(props as any)}
                  unitLabel={unitLabel}
                  hidden={hidden}
                />
              )}
            />
            {SERIES.map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.strokeWidth}
                dot={false}
                isAnimationActive={false}
                // Hide via opacity instead of unmounting so the Y-axis
                // domain doesn't snap on each toggle. `connectNulls` is
                // unaffected because we're not nulling values, just
                // making the line invisible.
                strokeOpacity={hidden[s.key] ? 0 : 1}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Custom legend — click chip to toggle that book's line ── */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 pt-1 px-1">
        {SERIES.map(s => {
          const isHidden = hidden[s.key];
          return (
            <button
              key={s.key}
              onClick={() => toggleBook(s.key)}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono transition-opacity"
              style={{
                color:   isHidden ? '#666' : '#d2d6e2',
                opacity: isHidden ? 0.5   : 1,
                cursor:  'pointer',
              }}
              title={isHidden ? `Show ${s.name}` : `Hide ${s.name}`}
            >
              <span
                style={{
                  display:         'inline-block',
                  width:           10,
                  height:          10,
                  backgroundColor: isHidden ? 'transparent' : s.color,
                  border:          `1px solid ${s.color}`,
                  borderRadius:    2,
                }}
              />
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── CustomTooltip — fixed position card, all 4 books with labels + unit ──
interface CustomTooltipProps {
  active?:    boolean;
  payload?:   Array<any>;
  label?:     string | number;
  unitLabel:  string;
  hidden:     Record<BookKey, boolean>;
}

function CustomTooltip({ active, payload, label, unitLabel, hidden }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // payload is [{ name, value, dataKey, ... }] per Line. Map dataKey → series.
  const byDataKey = new Map<string, { value: number; color: string; name: string }>();
  for (const p of payload) {
    if (p?.dataKey == null) continue;
    byDataKey.set(p.dataKey, { value: p.value as number, color: p.color, name: p.name });
  }

  return (
    <div
      className="font-mono text-[12px]"
      style={{
        backgroundColor: '#252429',
        border:          '1px solid #3a3a3c',
        borderRadius:    4,
        padding:         '6px 10px',
        minWidth:        180,
      }}
    >
      <div className="text-[#808080] mb-1">{label}</div>
      {SERIES.map(s => {
        const entry = byDataKey.get(s.dataKey);
        const v     = entry?.value;
        const isHid = hidden[s.key];
        return (
          <div
            key={s.key}
            className="flex items-center justify-between gap-3"
            style={{
              color:   isHid ? '#666' : '#d2d6e2',
              opacity: isHid ? 0.5   : 1,
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                style={{
                  display:         'inline-block',
                  width:           8,
                  height:          8,
                  backgroundColor: s.color,
                  borderRadius:    2,
                }}
              />
              {s.name}:
            </span>
            <span style={{ color: isHid ? '#666' : '#FFFFFF' }}>
              {v == null ? '—' : `${fmtCompact(v)} ${unitLabel}`}
            </span>
          </div>
        );
      })}
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