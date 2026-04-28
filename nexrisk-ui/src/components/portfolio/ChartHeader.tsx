// ============================================
// ChartHeader
//
// Strip at the top of ChartPanel — chart title on the left, controls
// on the right.
//
// In this revision:
//   • MT5 Node selector REMOVED — moved to PortfolioBreakdownPane.
//     The chart still uses the mt5NodeId, but it's sourced from
//     workspace state (controlled by the breakdown pane).
//   • "Get Insight" toggle added — when on, opens an AI panel beside
//     the chart inside the chart container (and signals the workspace
//     to auto-collapse the breakdown pane).
//
// Per-chart Period and (for Symbols Hedge only) hedge-side toggle stay
// here — they belong to the chart, not the page.
// ============================================

import { Sparkles } from 'lucide-react';

import { PeriodSelector } from './PeriodSelector';
import type { ChartEntry, ChartPeriod } from './charts/registry';

interface Props {
  entry:        ChartEntry;
  period:       ChartPeriod;
  onPeriod:     (p: ChartPeriod) => void;
  hedgeSide?:   'long' | 'short' | 'both';
  onHedgeSide?: (s: 'long' | 'short' | 'both') => void;
  /** Get Insight toggle — controls AI panel visibility in ChartPanel. */
  insightOn:    boolean;
  onToggleInsight: () => void;
}

export function ChartHeader({
  entry,
  period,
  onPeriod,
  hedgeSide = 'both',
  onHedgeSide,
  insightOn,
  onToggleInsight,
}: Props) {
  return (
    <div
      className="px-3 py-2 border-b border-[#3a3a3c] flex items-center justify-between gap-3 flex-shrink-0"
      style={{ backgroundColor: '#252527' }}
    >
      <div className="text-xs font-semibold text-white truncate" title={entry.description}>
        {entry.label}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {entry.hasHedgeToggle && onHedgeSide && (
          <HedgeSideToggle value={hedgeSide} onChange={onHedgeSide} />
        )}
        <PeriodSelector value={period} onChange={onPeriod} options={entry.periodOptions} />

        {/* ── Get Insight toggle ────────────────────────────────────
            On:  button with the yellow accent; the workspace auto-
                 collapses the breakdown pane and ChartPanel renders
                 ChartExplanation as a side panel beside the chart.
            Off: muted button; chart fills the container. */}
        <button
          onClick={onToggleInsight}
          title={insightOn ? 'Hide AI Insight panel' : 'Open AI Insight panel for this chart'}
          aria-pressed={insightOn}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded transition-colors font-medium"
          style={
            insightOn
              ? { backgroundColor: '#c9b87c', color: '#1e1e20' }
              : { backgroundColor: 'transparent', color: '#c9b87c', border: '1px solid #c9b87c66' }
          }
        >
          <Sparkles className="w-3 h-3" />
          Get Insight
        </button>
      </div>
    </div>
  );
}

// ── HedgeSideToggle ────────────────────────────────────────────
function HedgeSideToggle({
  value,
  onChange,
}: {
  value: 'long' | 'short' | 'both';
  onChange: (s: 'long' | 'short' | 'both') => void;
}) {
  const opts: Array<'long' | 'short' | 'both'> = ['long', 'short', 'both'];
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-[#aaa]">Side:</span>
      <div className="flex bg-[#232225] border border-[#555] rounded overflow-hidden">
        {opts.map((opt, i) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={
              'px-2 py-0.5 text-xs font-mono transition-colors ' +
              (value === opt
                ? 'bg-[#49b3b3] text-white'
                : 'text-[#aaa] hover:text-white') +
              (i > 0 ? ' border-l border-[#555]' : '')
            }
          >
            {opt[0].toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}