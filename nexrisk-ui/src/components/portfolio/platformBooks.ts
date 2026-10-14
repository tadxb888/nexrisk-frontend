// ============================================
// platformBooks
//
// The Portfolio breakdown under the platform selector (backend contract:
// NexRisk_Books_cTrader_Frontend.md, books.{A,B,C}.by_source).
//
//   All      B, A, C and Portfolio as the books are sent (whole book).
//   MT5      B = B.MT5
//            A = A.LP_MT5 (the hedge rules' LP positions hedging the MT5 B-Book)
//   cTrader  B = B.CTRADER
//            A = A.CTRADER (cTrader book A) + A.LP_CTRADER (the hedge rules'
//                LP positions hedging the cTrader B-Book)
//   MT5 and cTrader: C = C.LP in full (manual LP trades belong to no
//   platform); Portfolio = the sum of the three columns shown.
//
// Until the backend sends LP_MT5 / LP_CTRADER, the A column under a single
// platform carries the whole LP part, marked: those positions cover both
// platforms.
//
// A part has `floating` (live floating P/L) where a book has `unrealized`
// (the change since the baseline, kept per book only). Under a single
// platform the Unrl row therefore reads Floating P/L, in every column.
//
// Partly priced books (Books 1.2): each book says how many of its open
// positions could not be priced (`unpriced_positions`, `pricing_hint`). The
// count is per whole book; a column that shows only part of a book (A under
// MT5, or under cTrader once LP is split) says so in the hint. MT5 positions
// are always priced, so the B-Book count is the cTrader B-Book's.
// ============================================

import { EMPTY_BOOK_STATS, type BookCardStats, type BookPricing, type BooksPricing } from '@/stores/PortfolioStatsContext';
import type { PortfolioBySource, PortfolioSourceFields } from '@/services/api';

import type { PortfolioPlatform } from './PlatformSelector';

export interface BooksBySource {
  B: PortfolioBySource | null;
  A: PortfolioBySource | null;
  C: PortfolioBySource | null;
}

export interface PlatformColumns {
  bbook: BookCardStats;
  abook: BookCardStats;
  cbook: BookCardStats;
  /** Portfolio column under a single platform (sum of the three); null under All. */
  sum:   BookCardStats | null;
  /** Hedge Direction of that sum: (A.net + C.net) − B.net. */
  sumHedgeDirection:          number | null;
  sumHedgeDirectionNotional:  number | null;
  /** Amber-asterisk notes per column (money or attribution missing). */
  notes: { portfolio: string[]; bbook: string[]; abook: string[]; cbook: string[] };
  /** Marker on the P/L cell per column: positions left out of the floating P/L. */
  priceMarks: { portfolio: PriceMark | null; bbook: PriceMark | null; abook: PriceMark | null; cbook: PriceMark | null };
}

/** Positions left out of a column's floating P/L, and why (tooltip). */
export interface PriceMark {
  count: number;
  hint:  string;
}

const NO_BOOK_PRICING: BooksPricing = { A: null, B: null, C: null };

function priceMark(p: BookPricing | null, prefix = ''): PriceMark | null {
  if (!p || !(p.unpriced > 0)) return null;
  const hint = p.hint
    ?? `${p.unpriced} position${p.unpriced === 1 ? '' : 's'} not priced. Their floating P&L is left out; their volume is counted.`;
  return { count: p.unpriced, hint: prefix + hint };
}

function sumMarks(parts: Array<[string, PriceMark | null]>): PriceMark | null {
  const shown = parts.filter((x): x is [string, PriceMark] => x[1] != null);
  if (shown.length === 0) return null;
  return {
    count: shown.reduce((s, [, m]) => s + m.count, 0),
    hint:  shown.map(([book, m]) => `${book}: ${m.hint}`).join('\n'),
  };
}

const WHOLE_A = 'Whole A-Book, not this platform alone. ';

const NUM_KEYS = [
  'positions', 'volume', 'volume_notional',
  'long_volume', 'short_volume', 'net_volume',
  'long_volume_notional', 'short_volume_notional', 'net_volume_notional',
  'unrealized', 'realized', 'commissions', 'swaps', 'rebates',
] as const;

function sumOrNull(vals: (number | null | undefined)[]): number | null {
  const present = vals.filter((v): v is number => v != null);
  return present.length === 0 ? null : present.reduce((s, v) => s + v, 0);
}

function diffOrNull(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null ? null : a - b;
}

/** A by_source part as a column. `unrealized` carries the part's `floating`. */
export function partStats(p: PortfolioSourceFields | undefined): BookCardStats | null {
  if (!p) return null;
  const vn = p.volume_notional ?? null;
  return {
    ...EMPTY_BOOK_STATS,
    positions:             p.positions,
    volume:                p.volume,
    volume_notional:       vn,
    long_volume:           p.long_volume ?? null,
    short_volume:          p.short_volume ?? null,
    net_volume:            p.net_volume ?? diffOrNull(p.long_volume, p.short_volume),
    long_volume_notional:  p.long_volume_notional ?? null,
    short_volume_notional: p.short_volume_notional ?? null,
    net_volume_notional:   p.net_volume_notional ?? diffOrNull(p.long_volume_notional, p.short_volume_notional),
    volumeNotional:        vn,
    unrealized:            p.floating,
    realized:              p.realized,
    commissions:           p.commissions,
    swaps:                 p.swaps,
    rebates:               p.rebates,
  };
}

export function addStats(...xs: (BookCardStats | null)[]): BookCardStats {
  const out: BookCardStats = { ...EMPTY_BOOK_STATS };
  for (const k of NUM_KEYS) out[k] = sumOrNull(xs.map(x => (x ? x[k] : null)));
  out.volumeNotional = out.volume_notional;
  return out;
}

/** cTrader money left out of the figures (master down, unpriced, no USD rate).
 *  With `counted` (the book carries Books 1.2 pricing), the unpriced and
 *  no-rate counts are on the P/L marker instead and are not repeated here. */
export function ctMoneyNote(ct: PortfolioSourceFields | undefined, counted = false): string | null {
  if (!ct) return null;
  const lines: string[] = [];
  if (ct.available === false) {
    lines.push('The cTrader master is not connected: its positions count in positions and volume, not in money.');
  } else if (!counted && (ct.unpriced ?? 0) > 0) {
    lines.push(`${ct.unpriced} cTrader position${ct.unpriced === 1 ? ' has' : 's have'} no price yet and ${ct.unpriced === 1 ? 'is' : 'are'} not in the P/L.`);
  }
  if (!counted && (ct.no_usd_rate ?? 0) > 0) {
    lines.push(`${ct.no_usd_rate} cTrader position${ct.no_usd_rate === 1 ? ' has' : 's have'} no rate to USD and ${ct.no_usd_rate === 1 ? 'is' : 'are'} not in the P/L.`);
  }
  return lines.length ? lines.join(' ') : null;
}

export const LP_NOT_SPLIT_NOTE =
  'LP hedge positions cover both platforms; not split per platform yet. This column shows all of them.';

function unassignedNote(p: PortfolioSourceFields | undefined): string | null {
  if (!p || !(p.positions > 0 || p.volume > 0)) return null;
  return `${p.positions} LP hedge position${p.positions === 1 ? ' is' : 's are'} not attributed to a platform; shown under All only.`;
}

const has = (v: string | null): v is string => v != null;

export function platformColumns(
  platform: PortfolioPlatform,
  books: { bbook: BookCardStats; abook: BookCardStats; cbook: BookCardStats },
  src: BooksBySource,
  pricing: BooksPricing = NO_BOOK_PRICING,
): PlatformColumns {
  const { bbook, abook, cbook } = books;
  const cMark = priceMark(pricing.C);

  if (platform === 'All') {
    const b = [ctMoneyNote(src.B?.CTRADER, pricing.B != null)].filter(has);
    const a = [ctMoneyNote(src.A?.CTRADER, pricing.A != null)].filter(has);
    const bMark = priceMark(pricing.B), aMark = priceMark(pricing.A);
    return {
      bbook, abook, cbook,
      sum: null, sumHedgeDirection: null, sumHedgeDirectionNotional: null,
      notes: { portfolio: [...b, ...a], bbook: b, abook: a, cbook: [] },
      priceMarks: {
        portfolio: sumMarks([['B-Book', bMark], ['A-Book', aMark], ['C-Book', cMark]]),
        bbook: bMark, abook: aMark, cbook: cMark,
      },
    };
  }

  const notes: PlatformColumns['notes'] = { portfolio: [], bbook: [], abook: [], cbook: [] };
  let b: BookCardStats;
  let a: BookCardStats;
  let bMark: PriceMark | null = null;
  let aMark: PriceMark | null;
  const lpSplit = !!(src.A?.LP_MT5 || src.A?.LP_CTRADER);

  if (platform === 'MT5') {
    // A payload without by_source is the MT5 book alone.
    b = src.B ? (partStats(src.B.MT5) ?? { ...EMPTY_BOOK_STATS }) : bbook;
    const split = partStats(src.A?.LP_MT5);
    if (split) {
      a = split;
    } else {
      a = partStats(src.A?.LP) ?? (src.A ? { ...EMPTY_BOOK_STATS } : abook);
      notes.abook.push(LP_NOT_SPLIT_NOTE);
    }
    // MT5 positions are always priced: no B mark. The A count is the whole
    // book's unless the column is the whole book (LP not split, no cTrader A).
    const wholeA = !lpSplit && !((src.A?.CTRADER?.positions ?? 0) > 0);
    aMark = priceMark(pricing.A, wholeA ? '' : WHOLE_A);
  } else {
    b = partStats(src.B?.CTRADER) ?? { ...EMPTY_BOOK_STATS };
    const lp = partStats(src.A?.LP_CTRADER);
    if (lp) {
      a = addStats(partStats(src.A?.CTRADER), lp);
    } else {
      a = addStats(partStats(src.A?.CTRADER), partStats(src.A?.LP));
      if (src.A?.LP) notes.abook.push(LP_NOT_SPLIT_NOTE);
    }
    notes.bbook.push(...[ctMoneyNote(src.B?.CTRADER, pricing.B != null)].filter(has));
    notes.abook.unshift(...[ctMoneyNote(src.A?.CTRADER, pricing.A != null)].filter(has));
    // B: only cTrader positions can be unpriced, so the book count is exact.
    bMark = priceMark(pricing.B);
    aMark = priceMark(pricing.A, lpSplit ? WHOLE_A : '');
  }
  if (lpSplit) {
    const u = unassignedNote(src.A?.LP_UNASSIGNED);
    if (u) notes.abook.push(u);
  }

  // Manual LP trades belong to no platform: C in full under every choice.
  const c = partStats(src.C?.LP) ?? cbook;

  const sum = addStats(b, a, c);
  const hedge = (k: 'net_volume' | 'net_volume_notional') =>
    diffOrNull(sumOrNull([a[k], c[k]]), b[k]);

  notes.portfolio = [...notes.bbook, ...notes.abook];
  return {
    bbook: b, abook: a, cbook: c,
    sum,
    sumHedgeDirection:         hedge('net_volume'),
    sumHedgeDirectionNotional: hedge('net_volume_notional'),
    notes,
    priceMarks: {
      portfolio: sumMarks([['B-Book', bMark], ['A-Book', aMark], ['C-Book', cMark]]),
      bbook: bMark, abook: aMark, cbook: cMark,
    },
  };
}
