// ============================================
// BreakdownGrid
//
// Renders the Portfolio breakdown as a 5-column / N-row CSS grid:
//   col 1: row labels rail
//   col 2: PORTFOLIO   (parent — yellow accent)
//   col 3: B-BOOK      (child — teal accent)
//   col 4: A-BOOK      (child — teal accent)
//   col 5: C-BOOK      (child — teal accent)
//
// CRITICAL DESIGN POINT — the entire pane is ONE CSS grid. The label
// rail and the 4 cards are columns of that single grid; they don't
// have their own internal grids. This means the row template lives
// in ONE place — at the parent — and a row called "Net Real P/L" sits
// at the EXACT same y-coordinate in the label rail and in all four
// card columns. Alignment is guaranteed by construction; there are
// no fudge-factor paddings.
//
// Card chrome (border, header, accent stripe, padding) is applied via
// `gridColumn` to spans of the card's own row range — so each card
// column has its own visual frame even though it lives inside the
// parent grid.
//
// Row order (per Ross's spec, top → bottom):
//   • Header row (card label + sublabel)
//   • Net Realised P/L
//   • Net Unrealised P/L
//   • Positions
//   • Volume
//   • Commissions
//   • Swaps
//   • Rebates
// ============================================

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import {
  fmtHdrMoney,
  fmtHdrCompact,
  pnlColor,
  type BookCardStats,
  type BooksPricing,
  type TotalCardStats,
} from '@/stores/PortfolioStatsContext';

import type { PortfolioPlatform } from './PlatformSelector';
import { platformColumns, type BooksBySource, type PriceMark } from './platformBooks';

interface Props {
  total: TotalCardStats;
  bbook: BookCardStats;
  abook: BookCardStats;
  cbook: BookCardStats;
  /** Platform selector. All: the books as sent; MT5 / cTrader: see platformBooks. */
  platform: PortfolioPlatform;
  bySource: BooksBySource;
  /** Books 1.2: positions left out of each book's floating P/L. */
  pricing: BooksPricing;
}

const C_BOOK_HINT =
  'C-Book holds manual trades to the LP. They belong to no platform, so the C-Book is shown in full under every platform choice.';

type VolumeMode = 'lots' | 'notional';

// ── Row layout ─────────────────────────────────────────────────
// Header row sits at top; data rows fill the rest. All in pixels so
// every column lines up to the pixel — no fractional rounding drift
// between the label rail and card columns.
const HEADER_ROW = 36;
const DATA_ROW   = 34;

const ROWS: Array<{ key: string; label: string; kind: 'pnl' | 'count' | 'volume' | 'netVolume' | 'hedgeDirection' }> = [
  { key: 'netReal',        label: 'Net Real P/L',     kind: 'pnl'            },
  // Unrealized P/L — period-scoped, computed broker-side as
  //   live_unrealized − baseline_eod_unrealized
  // (yesterday for Today, last day of previous month for This Month).
  // Cost is NOT subtracted — Unrealized is the change in floating P/L over
  // the period, separate from realized cost-of-trading. This row is
  // intentionally NOT named "Net Unrl P/L" because there is no Net concept
  // for unrealized — only for realized which IS net of cost.
  { key: 'unrl',           label: 'Unrl P/L',         kind: 'pnl'            },
  { key: 'positions',      label: 'Positions',        kind: 'count'          },
  { key: 'volume',         label: 'Volume',           kind: 'volume'         },
  { key: 'longVolume',     label: 'Long Vol',         kind: 'volume'         },
  { key: 'shortVolume',    label: 'Short Vol',        kind: 'volume'         },
  { key: 'netVolume',      label: 'Net Vol',          kind: 'netVolume'      },
  { key: 'hedgeDirection', label: 'Hedge Direction',  kind: 'hedgeDirection' },
  { key: 'commissions',    label: 'Commissions',      kind: 'pnl'            },
  { key: 'swaps',          label: 'Swaps',            kind: 'pnl'            },
  { key: 'rebates',        label: 'Rebates',          kind: 'pnl'            },
];

// ── Helpers ─────────────────────────────────────────────────────

// Net Realized P/L = Realized − Cost, where Cost = commissions + swaps + rebates.
// Cost components are stored as POSITIVE magnitudes by the backend
// (BookSnapshotWriter aggregates `std::abs(deal->Commission())` etc.) — they
// represent the broker's actual outflow regardless of which book is the cost
// payer/receiver. The frontend subtracts them from gross to land at net.
//
// Uniform across all books: B-Book, A-Book, C-Book, Portfolio. The semantic
// of the resulting number differs per book (B-Book net realized is broker
// revenue minus broker outlays; A/C net realized is hedge P/L minus
// LP-charged costs) but the formula is identical.
function netRealized(realized: number | null,
                      commissions: number | null,
                      swaps: number | null,
                      rebates: number | null): number | null {
  if (realized == null && commissions == null && swaps == null && rebates == null) {
    return null;
  }
  const cost = (commissions ?? 0) + (swaps ?? 0) + (rebates ?? 0);
  return (realized ?? 0) - cost;
}

interface ColumnStats {
  netReal:        number | null;
  unrl:           number | null;
  positions:      number | null;
  volume:         number | null;
  longVolume:     number | null;
  shortVolume:    number | null;
  netVolume:      number | null;
  /** Per-book columns: same as netVolume — used to render directional label
   *  (Long/Short/Flat) in the Hedge Direction row. Portfolio column: also
   *  same as netVolume — rendered as Over-hedged/Under-hedged/Balanced.
   *  Backend serves hedge_direction equal to net_volume for the portfolio
   *  total; for per-book we copy net_volume locally so the kind handler
   *  has data to render. */
  hedgeDirection: number | null;
  commissions:    number | null;
  swaps:          number | null;
  rebates:        number | null;
}

function rollUp(stats: BookCardStats, volumeMode: VolumeMode): ColumnStats {
  // Mode switch:
  //   lots     → read raw lot fields
  //   notional → read notional fields (lots × MT5 contract size)
  const inLots = volumeMode === 'lots';
  const netVol = inLots ? stats.net_volume : stats.net_volume_notional;
  return {
    netReal:        netRealized(stats.realized, stats.commissions, stats.swaps, stats.rebates),
    unrl:           stats.unrealized,
    positions:      stats.positions,
    volume:         inLots ? stats.volume       : stats.volume_notional,
    longVolume:     inLots ? stats.long_volume  : stats.long_volume_notional,
    shortVolume:    inLots ? stats.short_volume : stats.short_volume_notional,
    netVolume:      netVol,
    // Per-book Hedge Direction = the book's own Net Vol. Sign indicates
    // direction (Long/Short/Flat) for that book in isolation. The
    // "over/under-hedged" interpretation only applies at Portfolio level.
    hedgeDirection: netVol,
    commissions:    stats.commissions,
    swaps:          stats.swaps,
    rebates:        stats.rebates,
  };
}

// ── Main ────────────────────────────────────────────────────────
export function BreakdownGrid({ total, bbook, abook, cbook, platform, bySource, pricing }: Props) {
  // Volume display mode — Lots (raw) or Notional (lots × per-symbol contract size).
  // Mirrors CBookPage's identical toggle. Local to this component; doesn't
  // need persistence (cheap to flip again).
  const [volumeMode, setVolumeMode] = useState<VolumeMode>('lots');

  const inLots = volumeMode === 'lots';
  const perPlatform = platform !== 'All';
  const cols = platformColumns(platform, { bbook, abook, cbook }, bySource, pricing);

  const wholeBook: ColumnStats = {
    // Net Realized = Realized − Cost (uniform across all books).
    // Uses the same netRealized helper as the per-book rows for consistency.
    netReal:     netRealized(total.realized, total.commissions, total.swaps, total.rebates),
    // Unrealized — direct from total.unrealized (already period-scoped on
    // the wire as live − baseline_eod). Cost is NOT subtracted: Unrealized
    // is the floating-P/L delta over the period, separate from cost-of-trading.
    unrl:        total.unrealized,
    positions:   total.positions,
    volume:      inLots ? total.volume       : total.volume_notional,
    // Long/Short/Net at portfolio level = straight sum across A+B+C of the
    // per-book broker-direction volumes. Net Vol indicates firm directional
    // LEAN (positive = net long lean, negative = net short lean) — distinct
    // from the over/under-hedged framing rendered in Hedge Direction.
    longVolume:  inLots ? total.long_volume  : total.long_volume_notional,
    shortVolume: inLots ? total.short_volume : total.short_volume_notional,
    netVolume:   inLots ? total.net_volume   : total.net_volume_notional,
    // Hedge Direction at Portfolio level = Net Vol (backend ships them
    // equal). Same number; rendered with directional verbiage:
    //   positive → over-hedged (firm net long across all books combined)
    //   negative → under-hedged (firm net short)
    //   zero     → fully balanced
    hedgeDirection: inLots ? total.hedge_direction : total.hedge_direction_notional,
    // Cost categories as separate Portfolio totals.
    // Each is the straight sum across A+B+C of that category, served on the
    // wire by PortfolioBroadcaster. The Portfolio column thus shows three
    // distinct cost lines that match the per-book columns visually rather
    // than collapsing them all into one "Commissions" cell.
    commissions: total.commissions,
    swaps:       total.swaps,
    rebates:     total.rebates,
  };

  // Under a single platform the Portfolio column is the sum of the three
  // columns shown; Hedge Direction = (A.net + C.net) − B.net over them.
  const portfolio: ColumnStats = cols.sum
    ? {
        ...rollUp(cols.sum, volumeMode),
        hedgeDirection: inLots ? cols.sumHedgeDirection : cols.sumHedgeDirectionNotional,
      }
    : wholeBook;

  const platformName = platform === 'cTrader' ? 'cTrader' : 'MT5';
  const columns: Array<{ kind: 'parent' | 'child'; label: string; sublabel?: string; stats: ColumnStats; tooltip?: string; notes: string[]; priceMark: PriceMark | null }> = [
    { kind: 'parent', label: 'PORTFOLIO', stats: portfolio, priceMark: cols.priceMarks.portfolio,
      sublabel: perPlatform ? `${platformName} + C-Book` : undefined,
      tooltip: perPlatform ? `Portfolio: the sum of the ${platformName} B-Book, the ${platformName} A-Book and the C-Book.` : undefined,
      notes: cols.notes.portfolio },
    { kind: 'child',  label: 'B-BOOK',    stats: rollUp(cols.bbook, volumeMode), priceMark: cols.priceMarks.bbook,
      sublabel: perPlatform ? platformName : undefined,
      tooltip: perPlatform
        ? `B-Book: internalized flow held against the house, ${platformName} master only.`
        : 'B-Book: Internalized flow held against the house.',
      notes: cols.notes.bbook },
    { kind: 'child',  label: 'A-BOOK',    stats: rollUp(cols.abook, volumeMode), priceMark: cols.priceMarks.abook,
      sublabel: perPlatform ? platformName : undefined,
      tooltip: platform === 'MT5'
        ? 'A-Book: LP positions opened by the hedging strategies on the MT5 B-Book.'
        : platform === 'cTrader'
        ? 'A-Book: cTrader book A (passed to its LP) and the LP positions opened by the hedging strategies on the cTrader B-Book.'
        : 'A-Book: positions opened by hedging strategies (automated execution).',
      notes: cols.notes.abook },
    { kind: 'child',  label: 'C-BOOK',    stats: rollUp(cols.cbook, volumeMode), priceMark: cols.priceMarks.cbook,
      sublabel: perPlatform ? 'All platforms' : undefined,
      tooltip: `C-Book: positions executed manually via Terminal or DOM Trader. ${C_BOOK_HINT}`,
      notes: cols.notes.cbook },
  ];

  // Row track string — header + N data rows.
  const gridTemplateRows = `${HEADER_ROW}px ${ROWS.map(() => `${DATA_ROW}px`).join(' ')}`;

  return (
    <div className="flex flex-col gap-2">
      {/* ── Volume toggle — sits above the grid, right-aligned ────────
          Mirrors the Lots / Notional pill on CBookPage so the visual
          language is consistent across pages. */}
      <div className="flex items-center justify-end px-1">
        <VolumeToggle mode={volumeMode} onChange={setVolumeMode} />
      </div>

      {/* ── The breakdown grid itself ─────────────────────────────── */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: '130px repeat(4, 1fr)',
          gridTemplateRows,
          columnGap: 6,
        }}
      >
      {/* ── Column 1: label rail ─────────────────────────────────
          Header row in this column is empty (no label above the rail). */}
      <div style={{ gridColumn: 1, gridRow: 1 }} />
      {ROWS.map((row, i) => (
        <div
          key={row.key}
          style={{ gridColumn: 1, gridRow: i + 2 }}
          className="flex items-center pr-3"
        >
          <span
            className="text-[13px] uppercase tracking-wider text-white leading-tight whitespace-nowrap"
            title={row.key === 'unrl'
              ? (perPlatform
                  ? 'Live floating P/L of the open positions shown (the change since the baseline is kept per whole book only).'
                  : 'Change in floating P/L since the baseline (end of the day before the period).')
              : undefined}
          >
            {row.key === 'unrl' && perPlatform ? 'Floating P/L' : row.label}
          </span>
        </div>
      ))}

      {/* ── Columns 2-5: cards ───────────────────────────────────
          Each card is rendered as TWO things on the parent grid:
            1. A "frame" element spanning all rows of that column, which
               provides the card's border, background, and accent stripe.
            2. The header cell + data cells, which sit OVER the frame in
               the same grid position. CSS grid's natural overlap means
               z-order is ok — frame is rendered first, content on top.
          This way the card visuals (border, etc.) span the full column
          height including the header row, and all values stay perfectly
          aligned to the parent grid's row heights. */}
      {columns.map((col, idx) => {
        const gridCol = idx + 2; // columns 2..5
        const isParent = col.kind === 'parent';

        const frameStyle: React.CSSProperties = isParent
          ? {
              gridColumn:  gridCol,
              gridRow:     `1 / ${ROWS.length + 2}`,
              backgroundColor: '#252429',
              border: '1px solid #c9b87c66',
              borderLeft: '3px solid #c9b87c',
              borderRadius: 4,
            }
          : {
              gridColumn:  gridCol,
              gridRow:     `1 / ${ROWS.length + 2}`,
              backgroundColor: '#1f1e22',
              border: '1px solid #49b3b366',
              borderLeft: '3px solid #49b3b3',
              borderRadius: 4,
            };

        return (
          <div key={col.label} style={{ display: 'contents' }}>
            {/* The frame */}
            <div style={frameStyle} title={col.tooltip} />

            {/* Header cell — card label, sits inside the frame visually */}
            <div
              style={{ gridColumn: gridCol, gridRow: 1 }}
              className="flex items-center justify-center px-3 border-b border-[#3a3a3e] z-10"
              title={col.tooltip}
            >
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[14px] uppercase tracking-wider text-white font-semibold">
                  {col.label}
                  {col.notes.length > 0 && (
                    <span
                      className="ml-1 cursor-help"
                      style={{ color: '#c09060' }}
                      title={Array.from(new Set(col.notes)).join('\n')}
                    >
                      *
                    </span>
                  )}
                </span>
                {col.sublabel && (
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: '#c8c8cc' }}>
                    {col.sublabel}
                  </span>
                )}
              </div>
            </div>

            {/* Data cells */}
            {ROWS.map((row, i) => (
              <div
                key={row.key}
                style={{ gridColumn: gridCol, gridRow: i + 2 }}
                className="flex items-center justify-center gap-1.5 px-3 z-10"
              >
                <ValueCell
                  row={row}
                  value={col.stats[row.key as keyof ColumnStats]}
                  isPortfolio={isParent}
                  inLots={inLots}
                />
                {row.key === 'unrl' && col.priceMark && <PriceMarker mark={col.priceMark} />}
              </div>
            ))}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── PriceMarker — positions left out of the floating P/L ───────
// Amber triangle + count next to the P/L; the backend's pricing hint is the
// tooltip. Usually short-lived (no tick yet after a start, a reconnect).
function PriceMarker({ mark }: { mark: PriceMark }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 cursor-help"
      style={{ color: '#c09060' }}
      title={mark.hint}
      aria-label={`${mark.count} position${mark.count === 1 ? '' : 's'} not priced`}
    >
      <AlertTriangle style={{ width: 12, height: 12 }} />
      <span className="font-mono" style={{ fontSize: 11 }}>{mark.count}</span>
    </span>
  );
}

// ── ValueCell — renders the right format per row kind ──────────
function ValueCell({
  row,
  value,
  isPortfolio,
  inLots,
}: {
  row: typeof ROWS[number];
  value: number | null;
  isPortfolio: boolean;
  inLots: boolean;
}) {
  if (value == null) {
    return <span className="text-[14px] font-mono text-white opacity-60">—</span>;
  }

  if (row.kind === 'count') {
    return <span className="text-[14px] font-mono text-white">{value} pos</span>;
  }

  if (row.kind === 'volume') {
    return <span className="text-[14px] font-mono text-white">{fmtHdrCompact(value)}</span>;
  }

  if (row.kind === 'netVolume') {
    // Net Vol = long − short. Sign indicates directional lean. Neutral
    // coloring; not a risk signal in itself. (The Hedge Direction row
    // below renders the same number with directional verbiage.)
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    const absValue = Math.abs(value);
    return (
      <span className="text-[14px] font-mono text-white">
        {sign}{fmtHdrCompact(absValue)}
      </span>
    );
  }

  if (row.kind === 'hedgeDirection') {
    // Directional label varies by column:
    //   Portfolio: Over-hedged / Under-hedged / Balanced
    //   B/A/C:     Long / Short / Flat
    // Tooltip exposes the magnitude with units.
    const absValue = Math.abs(value);
    const unit = inLots ? 'lots' : 'units';

    const label = isPortfolio
      ? (value > 0 ? 'Over-hedged' : value < 0 ? 'Under-hedged' : 'Balanced')
      : (value > 0 ? 'Long'        : value < 0 ? 'Short'        : 'Flat');

    // Color: amber for "long lean / over-hedged" side, dim teal for "short
    // lean / under-hedged" side, neutral for flat. Same visual language as
    // the prior implementation.
    const color = value > 0 ? '#e0a020' : value < 0 ? '#49b3b3' : '#d2d6e2';

    const tooltip = isPortfolio
      ? (value > 0 ? `Over-hedged by ${fmtHdrCompact(absValue)} ${unit} — firm net long across A+B+C`
        : value < 0 ? `Under-hedged by ${fmtHdrCompact(absValue)} ${unit} — firm net short across A+B+C`
        :            'Fully balanced — no net firm exposure')
      : (value > 0 ? `Long ${fmtHdrCompact(absValue)} ${unit}`
        : value < 0 ? `Short ${fmtHdrCompact(absValue)} ${unit}`
        :            'Flat — no open exposure');

    return (
      <span className="text-[14px] font-mono" style={{ color }} title={tooltip}>
        {label}
      </span>
    );
  }

  // pnl
  return (
    <span className="text-[14px] font-mono" style={{ color: pnlColor(value) }}>
      {fmtHdrMoney(value)}
    </span>
  );
}

// ── VolumeToggle — Lots / Notional pill ────────────────────────
// Visual matches the toggle on CBookPage (Lots / Notional pair, dot
// slides to indicate active mode). Local component since it's only
// used here.
function VolumeToggle({
  mode,
  onChange,
}: {
  mode: VolumeMode;
  onChange: (m: VolumeMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider">
      <button
        onClick={() => onChange('lots')}
        className="transition-colors"
        style={{
          color: mode === 'lots' ? '#FFFFFF' : '#808080',
          fontWeight: mode === 'lots' ? 600 : 400,
        }}
      >
        Lots
      </button>

      {/* Pill switch */}
      <button
        onClick={() => onChange(mode === 'lots' ? 'notional' : 'lots')}
        className="relative h-4 w-7 rounded-full transition-colors"
        style={{ backgroundColor: '#3a3a3e' }}
        aria-label={mode === 'lots' ? 'Switch to Notional' : 'Switch to Lots'}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full transition-all"
          style={{
            backgroundColor: '#c9b87c',
            left: mode === 'lots' ? 2 : 14,
          }}
        />
      </button>

      <button
        onClick={() => onChange('notional')}
        className="transition-colors"
        style={{
          color: mode === 'notional' ? '#FFFFFF' : '#808080',
          fontWeight: mode === 'notional' ? 600 : 400,
        }}
      >
        Notional
      </button>
    </div>
  );
}