// ============================================
// ChartPanel
//
// Container for the selected chart. Composes:
//   • ChartHeader — title, per-chart Period, optional hedge-side
//     toggle, "Get Insight" button.
//   • Chart body — 60% width when insightOn, 100% otherwise.
//   • AI Insight side panel — 40% width, only when insightOn.
//
// The AI Insight lives INSIDE the chart container (per Ross's mock).
// When the user toggles insightOn via the header button, the workspace
// auto-collapses the right Portfolio breakdown pane to give this
// container room to host both chart and AI panel side-by-side.
// ============================================

import { ChartHeader } from './ChartHeader';
import { ChartExplanation } from './ChartExplanation';
import type { ChartEntry, ChartPeriod } from './charts/registry';

interface Props {
  entry:           ChartEntry;
  period:          ChartPeriod;
  onPeriod:        (p: ChartPeriod) => void;
  mt5NodeId:       number | null;
  hedgeSide:       'long' | 'short' | 'both';
  onHedgeSide:     (s: 'long' | 'short' | 'both') => void;
  insightOn:       boolean;
  onToggleInsight: () => void;
}

export function ChartPanel({
  entry,
  period,
  onPeriod,
  mt5NodeId,
  hedgeSide,
  onHedgeSide,
  insightOn,
  onToggleInsight,
}: Props) {
  const Chart = entry.Component;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ backgroundColor: '#1e1e20' }}>
      <ChartHeader
        entry={entry}
        period={period}
        onPeriod={onPeriod}
        hedgeSide={hedgeSide}
        onHedgeSide={onHedgeSide}
        insightOn={insightOn}
        onToggleInsight={onToggleInsight}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Chart body — full width unless AI Insight is open ── */}
        <div
          className="h-full overflow-hidden p-3 transition-[width] duration-150"
          style={{ width: insightOn ? '60%' : '100%' }}
        >
          <Chart period={period} mt5NodeId={mt5NodeId} hedgeSide={hedgeSide} />
        </div>

        {/* ── AI Insight side panel — 40% width when toggled on ── */}
        {insightOn && (
          <div
            className="h-full border-l border-[#3a3a3c] overflow-hidden"
            style={{ width: '40%' }}
          >
            <ChartExplanation entry={entry} period={period} mt5NodeId={mt5NodeId} />
          </div>
        )}

      </div>
    </div>
  );
}