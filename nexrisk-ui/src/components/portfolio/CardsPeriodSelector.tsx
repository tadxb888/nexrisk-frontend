// ============================================
// CardsPeriodSelector
//
// Period selector for the page-level B / A / C / Cost cards on the
// Portfolio page AND the global Portfolio Card on the TopBar. Bound
// to PortfolioStatsContext so all five cards stay in sync regardless
// of where the user changes the selection.
//
// Two render points: TopBar (left of the Portfolio Card) and Row 2
// of the Portfolio page. Both use the same component — context owns
// the state.
//
// Today the cards are still WS-driven real-time aggregates: changing
// the period doesn't yet alter the values shown. The selector is in
// place for when the backend exposes period-scoped card aggregates;
// the context will then re-seed (or re-subscribe) on period change.
// ============================================

import {
  usePortfolioStats,
  CARDS_PERIOD_LABEL,
  CARDS_PERIOD_OPTIONS,
  type CardsPeriod,
} from '@/stores/PortfolioStatsContext';

interface Props {
  /** Tighter padding for the TopBar render. */
  compact?: boolean;
}

export function CardsPeriodSelector({ compact = false }: Props) {
  const { cardsPeriod, setCardsPeriod } = usePortfolioStats();

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {!compact && <span className="text-[#aaa]">Period:</span>}
      <select
        value={cardsPeriod}
        onChange={(e) => setCardsPeriod(e.target.value as CardsPeriod)}
        className={
          compact
            ? 'bg-[#232225] border border-[#c9b87c44] rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-[#c9b87c]'
            : 'bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-[#c9b87c]'
        }
        title="Period applied to B-Book, A-Book, C-Book, Cost and the global Portfolio Card."
      >
        {CARDS_PERIOD_OPTIONS.map(opt => (
          <option key={opt} value={opt}>{CARDS_PERIOD_LABEL[opt]}</option>
        ))}
      </select>
    </div>
  );
}