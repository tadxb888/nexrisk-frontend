// ============================================
// ChartWorkspace
//
// Body of the Portfolio page. Two horizontally-arranged zones (the
// left thumbnail rail was removed in Phase 1A — chart switching now
// happens via the dropdown in ChartHeader):
//
//   ┌──[chart container]──┬─[breakdown pane]─┐
//   │ ▾Chart Selector  ⓘ  │  Period          │
//   │ Period              │  MT5 Node        │
//   ├─────────────────────┤  ── Cards ──     │
//   │                     │  Portfolio       │
//   │     CHART           │  B-Book          │
//   │   (+ AI panel       │  A-Book          │
//   │     when on)        │  C-Book          │
//   │                     │                  │
//   └─────────────────────┴──────────────────┘
//
// Interaction rules:
//   • Click ChartSelector dropdown → switch chart.
//   • Click ★ inside a dropdown row → pin as default (localStorage).
//   • Click breakdown chevron → breakdown collapses to vertical strip.
//   • Click "Get Insight" in chart header → AI panel opens INSIDE the
//       chart container; if breakdown was expanded, it AUTO-COLLAPSES
//       (Ross's spec) to give the chart container room. Breakdown
//       remains user-controlled — they can re-expand if they want
//       both visible at once (chart will share width).
//   • Click "Get Insight" again → AI panel closes; breakdown stays
//       collapsed (no surprise re-open — user can re-expand).
//
// State owned here:
//   • mt5NodeId             — single page-level master node id.
//                             Hydrated from /mt5/nodes via Mt5NodeSelector
//                             on first paint.
//   • breakdownCollapsed    — chevron + Get Insight both write this.
//   • per-chart period      — keyed map, survives chart switches.
//   • per-chart hedge side  — keyed map (Symbols Hedge only).
//   • per-chart insightOn   — keyed map. Each chart remembers whether
//                             its AI panel was open last time it was
//                             selected.
// ============================================

import { useEffect, useMemo, useState } from 'react';

import { ChartPanel } from './ChartPanel';
import { PortfolioBreakdownPane } from './PortfolioBreakdownPane';
import {
  getChartById,
  type ChartId,
  type ChartPeriod,
} from './charts/registry';

interface Props {
  selectedChartId: ChartId;
  pinnedChartId:   ChartId;
  onSelectChart:   (id: ChartId) => void;
  onPinChart:      (id: ChartId) => void;
}

export function ChartWorkspace({
  selectedChartId,
  pinnedChartId,
  onSelectChart,
  onPinChart,
}: Props) {
  const entry = useMemo(() => getChartById(selectedChartId), [selectedChartId]);

  // Per-chart state — survives chart switches in the same session.
  const [periodByChart, setPeriodByChart] = useState<Record<string, ChartPeriod>>({});
  const [hedgeSideByChart, setHedgeSideByChart] = useState<Record<string, 'long' | 'short' | 'both'>>({});
  const [insightOnByChart, setInsightOnByChart] = useState<Record<string, boolean>>({});

  // Page-level state.
  const [mt5NodeId, setMt5NodeId] = useState<number | null>(null);
  const [breakdownCollapsed, setBreakdownCollapsed] = useState<boolean>(false);

  const period    = periodByChart[selectedChartId]    ?? entry.defaultPeriod;
  const hedgeSide = hedgeSideByChart[selectedChartId] ?? 'both';
  const insightOn = insightOnByChart[selectedChartId] ?? false;

  // If the user-selected period isn't in the new chart's option set,
  // fall back to that chart's default.
  useEffect(() => {
    if (!entry.periodOptions.includes(period)) {
      setPeriodByChart(prev => ({ ...prev, [selectedChartId]: entry.defaultPeriod }));
    }
  }, [selectedChartId, entry, period]);

  const handleToggleInsight = () => {
    const next = !insightOn;
    setInsightOnByChart(prev => ({ ...prev, [selectedChartId]: next }));
    // Per spec: turning Get Insight ON auto-collapses the breakdown pane
    // so the chart container has room for the chart + AI panel side-by-side.
    if (next) setBreakdownCollapsed(true);
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">

      {/* ── Center: chart container (chart + optional AI panel) ─── */}
      <div className="flex-1 min-w-0 h-full">
        <ChartPanel
          entry={entry}
          period={period}
          onPeriod={(p) => setPeriodByChart(prev => ({ ...prev, [selectedChartId]: p }))}
          mt5NodeId={mt5NodeId}
          hedgeSide={hedgeSide}
          onHedgeSide={(s) => setHedgeSideByChart(prev => ({ ...prev, [selectedChartId]: s }))}
          insightOn={insightOn}
          onToggleInsight={handleToggleInsight}
          selectedChartId={selectedChartId}
          pinnedChartId={pinnedChartId}
          onSelectChart={onSelectChart}
          onPinChart={onPinChart}
        />
      </div>

      {/* ── Right: portfolio breakdown pane ──────────────────────── */}
      <PortfolioBreakdownPane
        collapsed={breakdownCollapsed}
        onToggle={() => setBreakdownCollapsed(c => !c)}
        mt5NodeId={mt5NodeId}
        onMt5Node={setMt5NodeId}
      />

    </div>
  );
}