// ============================================
// Portfolio Page
//
// Layout (top → bottom):
//   • ChartWorkspace fills the entire page body.
//
// The workspace itself contains 3 zones:
//   • Left:   collapsible thumbnail rail (7 charts, ★ pin)
//   • Center: chart container (chart + optional AI Insight side panel)
//   • Right:  collapsible Portfolio breakdown pane (Period + MT5 Node
//             selectors + parent Portfolio Card + 3 indented child
//             Book cards). Replaces the page-level cards strip.
//
// Removed in this revision (vs. previous):
//   • The horizontal cards row (B + A + C + Cost) at top
//   • The "Cards Period" Row 2 (the selector now lives inside the
//     Portfolio breakdown pane)
//
// The TopBar's CardsPeriodSelector is unchanged — clicking it still
// changes `cardsPeriod` in PortfolioStatsContext, and the breakdown
// pane mirrors that selection through its own copy of the selector.
// ============================================

import { useState } from 'react';

import { ChartWorkspace } from '@/components/portfolio/ChartWorkspace';
import { useDefaultChart } from '@/hooks/useDefaultChart';
import type { ChartId } from '@/components/portfolio/charts/registry';

export function PortfolioPage() {
  const { pinnedId, setPinnedId } = useDefaultChart();
  const [selectedChartId, setSelectedChartId] = useState<ChartId>(pinnedId);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>
      <ChartWorkspace
        selectedChartId={selectedChartId}
        pinnedChartId={pinnedId}
        onSelectChart={setSelectedChartId}
        onPinChart={setPinnedId}
      />
    </div>
  );
}

export default PortfolioPage;