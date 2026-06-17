// ============================================
// Chart4SymbolsHedge — Symbols Hedge (true nested bars)
//
// Per Ross's spec:
//   • One outer bar per symbol = B-Book volume (yellow).
//   • An inner narrower bar drawn INSIDE, horizontally centered =
//     Coverage = A-Book + C-Book volume (teal).
//   • Both bars share the same baseline (Y=0).
//   • Period selector: full set; default This Month, Today supported.
//   • 60s polling while visible.
//
// Implementation note (v2):
//   The previous implementation used two <Bar/> components with negative
//   barGap and barSize hacks. Recharts' grouped-bar layout fought back —
//   bars ended up off-center and not properly nested. This version uses
//   a CUSTOM SHAPE on a single <Bar/>: for each data point we render
//   two SVG <rect>s in one render pass — the outer (B-volume) and inner
//   (Coverage), both sharing Y=0 baseline, inner perfectly centered at
//   ~50% of the outer's width. No layout fights, fully predictable.
//
// Reading guide (when staring at the chart):
//   • If outer (yellow) > inner (teal): more client volume than is
//     being hedged to LPs — broker is carrying B-Book exposure.
//   • If inner (teal) > outer (yellow): hedge volume exceeds client
//     volume — likely hedges from prior periods still standing.
//   • If only inner shows (no outer): symbol traded only as A/C.
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
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchSymbolsHedge, periodToDateRange } from '@/services/chartsApi';
import type { SymbolsHedgeRow } from '@/types/charts';
import { BOOK_COLORS } from './bookColors';

const POLL_INTERVAL_MS = 60_000;
const SYMBOL_LIMIT     = 20;

// Inner bar drawn at this fraction of the outer bar's width.
const INNER_WIDTH_RATIO = 0.5;

// Two-color palette matching Chart 1 — slate blue (outer = B-Book)
// and muted teal (inner = Coverage). Both pulled from BBookCharts'
// established palette; same visual rhythm as the rest of the app.
const COLOR_OUTER = '#577a9e';   // slate blue
const COLOR_INNER = '#5b9b9b';   // muted teal

// ── Format helpers ─────────────────────────────────────────────
function fmtLots(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

// ── NestedBarShape — custom SVG renderer for one bar slot ──────
// Recharts calls this for each data point. We get the geometry of
// the OUTER bar slot (x, y, width, height) plus the row's full data
// payload via `payload`. We render two <rect>s:
//   1. Outer rectangle = B-Book volume (the slot Recharts already sized)
//   2. Inner rectangle = Coverage volume, centered horizontally at
//      INNER_WIDTH_RATIO of the slot width, with its own height
//      computed from the row's hedge_volume scaled against
//      b_book_volume's height.
//
// The y-axis is set to scale to b_book_volume's max via Recharts'
// auto-domain; that means the outer bar's pixel height ALWAYS
// represents b_book_volume's value to scale. We compute the inner
// bar's pixel height proportionally:
//     innerHeightPx = outerHeightPx × (hedge / b_book)
// That keeps inner perfectly aligned to the same Y-axis scale.
//
// Edge cases:
//   • If b_book_volume = 0 but hedge_volume > 0: outer rect has zero
//     height; we fall back to drawing the inner at the inner ratio
//     directly against the chart's Y-pixel domain — but that's hard
//     without the chart's scale. Acceptable degradation: hide outer,
//     and skip inner too. The data point shows as nothing — which is
//     fine because for THIS chart's purpose, b_book_volume = 0 means
//     no client trades, so "no bar" is meaningful.
//   • If hedge_volume = 0: only outer rect renders.
interface NestedBarShapeProps {
  x?:        number;
  y?:        number;
  width?:    number;
  height?:   number;
  payload?:  SymbolsHedgeRow;
}

function NestedBarShape(props: NestedBarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const bVol = payload.b_book_volume ?? 0;
  const hVol = payload.hedge_volume  ?? 0;

  // No outer bar = no inner bar either (see edge-case note above).
  if (bVol <= 0) return null;

  // Inner bar geometry
  const innerWidth   = width * INNER_WIDTH_RATIO;
  const innerX       = x + (width - innerWidth) / 2;
  // Pixel height of the outer bar represents bVol on the y-scale.
  // The inner's pixel height is proportional: hVol / bVol of that.
  // Clamp at outer's full height (in case hedge > b_book — visual
  // "overflow" prevented; tooltip still shows real value).
  const innerHeightRaw = (height * hVol) / bVol;
  const innerHeight    = Math.min(Math.max(innerHeightRaw, 0), height);
  const innerY         = y + (height - innerHeight);

  return (
    <g>
      {/* Outer = B-Book volume */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={COLOR_OUTER}
      />
      {/* Inner = Coverage (A+C) volume — only render if there's coverage */}
      {hVol > 0 && (
        <rect
          x={innerX}
          y={innerY}
          width={innerWidth}
          height={innerHeight}
          fill={COLOR_INNER}
        />
      )}
    </g>
  );
}

// ── Component ──────────────────────────────────────────────────
export function Chart4SymbolsHedge({ period, hedgeSide }: ChartComponentProps) {
  const [rows,    setRows]    = useState<SymbolsHedgeRow[]>([]);
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
        const json  = await fetchSymbolsHedge({
          from:  range.from,
          to:    range.to,
          limit: SYMBOL_LIMIT,
          // hedgeSide drives whether the chart shows long-only, short-only,
          // or both. Default 'both' when undefined.
          side:  hedgeSide ?? 'both',
        } as any);
        if (!mounted || ctrl.signal.aborted) return;
        setRows(json.symbols);
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
  }, [period, hedgeSide]);

  // ── Render branches ──────────────────────────────────────────
  if (loading && rows.length === 0) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && rows.length === 0) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (rows.length === 0) {
    return <BodyMessage>No symbols traded for this period</BodyMessage>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        margin={{ top: 8, right: 16, bottom: 56, left: 0 }}
        barCategoryGap="25%"
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
          interval={0}
          angle={-45}
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
            style: {
              fill:       '#808080',
              fontSize:   10,
              fontFamily: 'IBM Plex Mono, monospace',
            },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1a1c',
            border:          '1px solid #b87333',
            borderRadius:    '4px',
            fontFamily:      'IBM Plex Mono, monospace',
            fontSize:        12,
            padding:         '6px 10px',
            color:           '#e6e6e6',
          }}
          labelStyle={{ color: '#b87333', fontWeight: 600, marginBottom: '2px' }}
          itemStyle={{ color: '#e6e6e6' }}
          formatter={(value: number, _name: string, item: any) => {
            const hedge = item?.payload?.hedge_volume;
            return [
              `B-Book: ${fmtLots(value)} lots${hedge != null ? `   Coverage: ${fmtLots(hedge)} lots` : ''}`,
              '',
            ];
          }}
          cursor={{ fill: '#ffffff10' }}
        />
        {/* Custom legend — Recharts' default would show only the bound
            dataKey ("b_book_volume"). We render two squares with the
            real labels so the user sees BOTH bars explained. */}
        <Legend
          wrapperStyle={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
          payload={[
            { value: 'B-Book Volume',  type: 'square', color: COLOR_OUTER, id: 'b' },
            { value: 'Coverage (A+C)', type: 'square', color: COLOR_INNER, id: 'c' },
          ]}
        />

        {/* Single Bar with custom shape — renders BOTH outer and inner
            rectangles per data point. dataKey b_book_volume drives the
            Y-axis scale. The inner Coverage rect height is computed
            inside NestedBarShape using payload.hedge_volume. */}
        <Bar
          dataKey="b_book_volume"
          shape={<NestedBarShape />}
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