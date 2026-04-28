// ============================================
// ChartPlaceholders
//
// All 7 chart components live here as placeholder panels until their
// backend endpoints land. Each is a no-op render that respects the
// container size (h-full, w-full) and shows the chart's name.
//
// As each chart's data source becomes available, EXTRACT it to its own
// file (e.g. AbcCombinationChart.tsx) and update the import in
// registry.ts. Keeping them here for now avoids 7 nearly-empty files.
// ============================================

import type { ChartComponentProps } from './registry';

// ── Generic placeholder body ────────────────────────────────────
function Placeholder({
  title,
  period,
  mt5NodeId,
}: {
  title: string;
  period: string;
  mt5NodeId: number | null;
}) {
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center gap-2 font-mono text-xs"
      style={{ color: '#808080' }}
    >
      <div className="text-sm" style={{ color: '#d2d6e2' }}>{title}</div>
      <div>Backend endpoint pending</div>
      <div className="opacity-60">
        period={period} · mt5_node={mt5NodeId ?? '—'}
      </div>
    </div>
  );
}

// ── 1 ─────────────────────────────────────────────────────────────
export function MostTradedSymbolsChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="Most Traded Symbols" period={period} mt5NodeId={mt5NodeId} />;
}

// ── 2 ─────────────────────────────────────────────────────────────
export function AbcCombinationChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="A/B/C Combination" period={period} mt5NodeId={mt5NodeId} />;
}

// ── 3 ─────────────────────────────────────────────────────────────
export function PortfolioPerformanceChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="Portfolio Performance" period={period} mt5NodeId={mt5NodeId} />;
}

// ── 4 ─────────────────────────────────────────────────────────────
export function SymbolsHedgeChart({ period, mt5NodeId, hedgeSide }: ChartComponentProps) {
  return (
    <Placeholder
      title={`Symbols Hedge (${hedgeSide ?? 'both'})`}
      period={period}
      mt5NodeId={mt5NodeId}
    />
  );
}

// ── 5 ─────────────────────────────────────────────────────────────
export function CostRevenuesExpensesChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="Cost: Revenues & Expenses" period={period} mt5NodeId={mt5NodeId} />;
}

// ── 6 ─────────────────────────────────────────────────────────────
export function TopHoldersChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="Top 30 Holders by Gross Volume" period={period} mt5NodeId={mt5NodeId} />;
}

// ── 7 ─────────────────────────────────────────────────────────────
export function AbcNetVolumeChart({ period, mt5NodeId }: ChartComponentProps) {
  return <Placeholder title="A/B/C Net Volume" period={period} mt5NodeId={mt5NodeId} />;
}