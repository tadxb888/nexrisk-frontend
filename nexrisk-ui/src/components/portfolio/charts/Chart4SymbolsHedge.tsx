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

const POLL_INTERVAL_MS = 60_000;
const SYMBOL_LIMIT     = 20;

// Inner bar drawn at this fraction of the outer bar's width.
const INNER_WIDTH_RATIO = 0.5;

// Two-color palette — slate blue (outer = B-Book) and muted teal
// (inner = Coverage). Original Chart 4 palette, kept by request.
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
// The <Bar/> is bound to max(b_book_volume, hedge_volume) (see dataKey below),
// so the slot Recharts hands us — and the Y-axis domain — is sized to whichever
// of the two is LARGER. That fixes the old defect where the axis scaled to
// B-Book only: when Coverage > B-Book the inner bar got clamped to the outer's
// height and the two looked identical despite different values.
//
// Given the slot geometry (x, y, width, height) representing scaleMax lots:
//   perLot   = height / scaleMax           (pixels per lot, shared scale)
//   baseline = y + height                  (Y = 0)
//   outer    = b_book_volume × perLot      (slate / B-Book)
//   inner    = hedge_volume  × perLot      (orange / Coverage), centered
// Both rise from the same baseline on the same scale, so inner is taller than
// outer exactly when Coverage > B-Book — and shorter when it isn't.
//
// Edge cases:
//   • B-Book = 0, Coverage > 0  → outer has zero height, inner still renders
//     (symbol traded only as A/C — e.g. metals with no B-Book flow).
//   • Coverage = 0              → only the outer renders.
//   • both 0                    → nothing.
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

  const scaleMax = Math.max(bVol, hVol);
  if (scaleMax <= 0) return null;          // nothing traded — no bar

  // Shared pixel-per-lot scale derived from the slot (sized to scaleMax).
  const perLot   = height / scaleMax;
  const baseline = y + height;             // Y = 0

  const outerHeight = bVol * perLot;
  const outerY      = baseline - outerHeight;

  const innerWidth  = width * INNER_WIDTH_RATIO;
  const innerX      = x + (width - innerWidth) / 2;
  const innerHeight = hVol * perLot;
  const innerY      = baseline - innerHeight;

  return (
    <g>
      {/* Outer = B-Book volume */}
      {bVol > 0 && (
        <rect
          x={x}
          y={outerY}
          width={width}
          height={outerHeight}
          fill={COLOR_OUTER}
        />
      )}
      {/* Inner = Coverage (A+C) volume */}
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
          formatter={(_value: number, _name: string, item: any) => {
            const b     = item?.payload?.b_book_volume;
            const hedge = item?.payload?.hedge_volume;
            return [
              `B-Book: ${fmtLots(b)} lots${hedge != null ? `   Coverage: ${fmtLots(hedge)} lots` : ''}`,
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

        {/* Single Bar with custom shape — renders BOTH outer (B-Book) and
            inner (Coverage) rectangles per data point. dataKey returns
            max(b_book_volume, hedge_volume) so the Y-axis and the slot scale
            to whichever is larger; NestedBarShape draws both rects against
            that shared scale, so the inner can legitimately exceed the outer
            when Coverage > B-Book. */}
        <Bar
          dataKey={(d: SymbolsHedgeRow) =>
            Math.max(d.b_book_volume ?? 0, d.hedge_volume ?? 0)
          }
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