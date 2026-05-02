// ============================================
// PortfolioCard
//
// Compact 5-cell horizontal card for Portfolio totals. Lives in the
// reserved strip on the Portfolio page only (mounted by TopBar based
// on route). Bound to PortfolioStatsContext.total — same source as
// every other card in the app, so the M/D selector keeps everything
// in sync.
//
// Cells: PORTFOLIO | REV. & EXP. | VOLUME | UNREALIZED P/L (NET) | REALIZED P/L (NET)
//
// Visual style mirrors the B-Book card pattern (rounded box, vertical
// dividers between cells) but uses the muted-gold accent #c9b87c instead
// of the book teal — distinguishes a portfolio-level card from a
// book-specific one.
// ============================================

import {
  fmtHdrMoney,
  fmtHdrCompact,
  pnlColor,
  usePortfolioStats,
} from '@/stores/PortfolioStatsContext';

const ACCENT      = '#c9b87c';
const ACCENT_SOFT = '#c9b87c44';
const BG          = '#252429';
const DIVIDER     = '#3a3a3e';
const TITLE_FG    = '#fff';
const NEUTRAL     = '#d2d6e2';

export function PortfolioCard() {
  const { total } = usePortfolioStats();

  // REV. & EXP. = commissions + swaps + rebates (per Ross — same as the
  // page-header Cost cell on B-Book). Backend exposes this as total.cost,
  // which is precomputed in mapTotal() inside PortfolioStatsContext as
  // (commissions ?? 0) + (swaps ?? 0) + (rebates ?? 0). Fall back to null
  // if all three are still null (WS hasn't snapped yet).
  const revExp =
    total.commissions == null && total.swaps == null && total.rebates == null
      ? null
      : total.cost;

  return (
    <div
      className="inline-flex items-stretch gap-2 rounded px-2 py-1 shrink-0"
      style={{
        backgroundColor: BG,
        border: `1px solid ${ACCENT_SOFT}`,
        borderLeft: `3px solid ${ACCENT}`,
      }}
      title="Portfolio card. Aggregate across A-Book + B-Book + C-Book. Period follows the M/D toggle to the left."
    >
      {/* Cell 1 — Card name + position count */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TITLE_FG }}>
          Portfolio
        </div>
        <div className="text-xs font-mono text-white">
          {total.positions != null ? `${total.positions} pos` : '—'}
        </div>
      </div>
      <div className="w-px self-stretch" style={{ backgroundColor: DIVIDER }} />

      {/* Cell 2 — REV. & EXP. (= commissions + swaps + rebates) */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TITLE_FG }}>
          Rev. & Exp.
        </div>
        {revExp != null ? (
          <div className="text-xs font-mono" style={{ color: pnlColor(revExp) }}>
            {fmtHdrMoney(revExp)}
          </div>
        ) : (
          <div className="text-xs font-mono" style={{ color: NEUTRAL }}>—</div>
        )}
      </div>
      <div className="w-px self-stretch" style={{ backgroundColor: DIVIDER }} />

      {/* Cell 3 — Volume (lots, gross across A+B+C) */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TITLE_FG }}>
          Volume
        </div>
        {total.volume != null ? (
          <div className="text-xs font-mono text-white">
            {fmtHdrCompact(total.volume, '')}
          </div>
        ) : (
          <div className="text-xs font-mono" style={{ color: NEUTRAL }}>—</div>
        )}
      </div>
      <div className="w-px self-stretch" style={{ backgroundColor: DIVIDER }} />

      {/* Cell 4 — Unrealized P/L (Net) */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TITLE_FG }}>
          Unrealized P/L (Net)
        </div>
        {total.unrealized != null ? (
          <div className="text-xs font-mono" style={{ color: pnlColor(total.unrealized) }}>
            {fmtHdrMoney(total.unrealized)}
          </div>
        ) : (
          <div className="text-xs font-mono" style={{ color: NEUTRAL }}>—</div>
        )}
      </div>
      <div className="w-px self-stretch" style={{ backgroundColor: DIVIDER }} />

      {/* Cell 5 — Realized P/L (Net) */}
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: TITLE_FG }}>
          Realized P/L (Net)
        </div>
        {total.realized != null ? (
          <div className="text-xs font-mono" style={{ color: pnlColor(total.realized) }}>
            {fmtHdrMoney(total.realized)}
          </div>
        ) : (
          <div className="text-xs font-mono" style={{ color: NEUTRAL }}>—</div>
        )}
      </div>
    </div>
  );
}

export default PortfolioCard;