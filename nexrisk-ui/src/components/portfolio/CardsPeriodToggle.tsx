// ============================================
// CardsPeriodToggle
//
// Compact two-button vertical toggle for the Cards Period:
//   M = This Month  (top)
//   D = Today       (bottom)
//
// Replaces the dropdown form (CardsPeriodSelector) in page headers.
// Bound to PortfolioStatsContext, so all cards stay in sync regardless
// of where the user toggles. Backend supports only Today + This Month,
// so this is the entire vocabulary — matches CARDS_PERIOD_OPTIONS in
// PortfolioStatsContext.
// ============================================

import { usePortfolioStats } from '@/stores/PortfolioStatsContext';

const ACTIVE_BG     = '#4ecdc4'; // teal — sits cleanly against any book-card accent
const ACTIVE_FG     = '#1a1a1d';
const INACTIVE_FG   = '#fff';
const INACTIVE_BORD = '#606060';

interface Props {
  /** Optional title text for the wrapper element. */
  title?: string;
}

export function CardsPeriodToggle({ title = 'Period applied to the card(s) on this page' }: Props) {
  const { cardsPeriod, setCardsPeriod } = usePortfolioStats();

  const isMonth = cardsPeriod === 'this_month';
  const isToday = cardsPeriod === 'today';

  // Shared button style — only background/colour/border vary by active state.
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    width: 22,
    height: 22,
    backgroundColor: active ? ACTIVE_BG : 'transparent',
    color:           active ? ACTIVE_FG : INACTIVE_FG,
    border:          `1px solid ${active ? ACTIVE_BG : INACTIVE_BORD}`,
    borderRadius:    2,
  });

  return (
    <div className="flex flex-col gap-px shrink-0" title={title}>
      <button
        type="button"
        onClick={() => setCardsPeriod('this_month')}
        aria-pressed={isMonth}
        title="This Month"
        className="flex items-center justify-center text-[10px] font-mono font-semibold transition-colors"
        style={buttonStyle(isMonth)}
      >
        M
      </button>
      <button
        type="button"
        onClick={() => setCardsPeriod('today')}
        aria-pressed={isToday}
        title="Today"
        className="flex items-center justify-center text-[10px] font-mono font-semibold transition-colors"
        style={buttonStyle(isToday)}
      >
        D
      </button>
    </div>
  );
}

export default CardsPeriodToggle;