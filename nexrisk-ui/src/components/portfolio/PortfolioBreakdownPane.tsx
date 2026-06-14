// ============================================
// PortfolioBreakdownPane
//
// Right column of the Portfolio workspace. Collapsible to a thin
// vertical bar via the chevron at its top edge — same pattern as
// the right-side panels in CBookPage / DOM Trader.
//
// Composition (top → bottom, expanded state):
//   • Header strip: chevron toggle + label
//   • Page-level Period selector (drives both the breakdown values
//     and stays in sync with the TopBar Cards Period selector via
//     PortfolioStatsContext.cardsPeriod)
//   • MT5 Master node selector (single option for now)
//   • Portfolio (parent) summary card — Net of Costs
//   • B-Book / A-Book / C-Book (child cards, indented)
//
// Visibility is controlled by the parent (ChartWorkspace) which also
// auto-collapses this pane when "Get Insight" opens the AI panel
// inside the chart container.
// ============================================

import { ChevronRight, ChevronLeft } from 'lucide-react';

import { CardsPeriodSelector } from './CardsPeriodSelector';
import { Mt5NodeSelector } from './Mt5NodeSelector';
import { BreakdownGrid } from './BreakdownGrid';
import { usePortfolioStats } from '@/stores/PortfolioStatsContext';

interface Props {
  collapsed:    boolean;
  onToggle:     () => void;
  mt5NodeId:    number | null;
  onMt5Node:    (id: number | null) => void;
}

export function PortfolioBreakdownPane({
  collapsed,
  onToggle,
  mt5NodeId,
  onMt5Node,
}: Props) {
  const { bbook, abook, cbook, total, lastUpdated } = usePortfolioStats();

  // ── Collapsed state: 28px vertical strip with chevron + rotated label
  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center justify-start py-2 border-l border-[#3a3a3c] cursor-pointer hover:bg-[#252527] transition-colors"
        style={{ backgroundColor: '#1e1e20', width: 28 }}
        onClick={onToggle}
        title="Expand Portfolio breakdown"
      >
        <ChevronLeft className="w-4 h-4 text-[#aaa]" />
        <div
          className="text-[10px] uppercase tracking-widest text-[#aaa] mt-3"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Portfolio
        </div>
      </div>
    );
  }

  // ── Expanded state
  // Width tuned for: 130px label rail + 4 cards × ~140px each + paddings.
  // The label rail is sized to fit the longest row label ("NET UNRL P/L",
  // "COMMISSIONS") on a single line at 13px font; narrower forces wrap.
  return (
    <div
      className="h-full flex flex-col overflow-hidden border-l border-[#3a3a3c] flex-shrink-0"
      style={{ backgroundColor: '#1e1e20', width: 720 }}
    >
      {/* Header strip — title + collapse chevron */}
      <div
        className="px-3 py-2 border-b border-[#3a3a3c] flex items-center justify-between flex-shrink-0"
        style={{ backgroundColor: '#252527' }}
      >
        <div className="text-[11px] uppercase tracking-wider text-white">Portfolio</div>
        <button
          onClick={onToggle}
          className="text-[#aaa] hover:text-white transition-colors"
          title="Collapse Portfolio breakdown"
          aria-label="Collapse Portfolio breakdown"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Selectors strip — Period + MT5 Node on the same line */}
      <div className="px-3 py-2 border-b border-[#3a3a3c] flex items-center gap-4 flex-shrink-0">
        <CardsPeriodSelector />
        <Mt5NodeSelector value={mt5NodeId} onChange={onMt5Node} />
        <div
          className="ml-auto text-[10px] uppercase tracking-wider whitespace-nowrap"
          style={{ color: '#8a8a8a' }}
          title="Time of the most recent portfolio snapshot. On weekends and market holidays this is the last business-day reading — values do not update while markets are closed."
        >
          Updated {lastUpdated ?? '—'}
        </div>
      </div>

      {/* Breakdown body — single CSS grid: label rail + 4 card columns,
          with a unified row template at the parent level so every row
          ("Net Real P/L" etc.) sits at the identical y-coordinate across
          the rail and all 4 cards. Reading horizontally → compare a
          metric across books. Reading down a card → full breakdown of
          that book. Cards keep their identity via per-column borders +
          accent stripes (Portfolio yellow, B/A/C teal). */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <BreakdownGrid total={total} bbook={bbook} abook={abook} cbook={cbook} />
      </div>
    </div>
  );
}