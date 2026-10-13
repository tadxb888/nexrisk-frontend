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
// ============================================

import { EMPTY_BOOK_STATS, type BookCardStats } from '@/stores/PortfolioStatsContext';
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
}

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

/** cTrader money left out of the figures (master down, unpriced, no USD rate). */
export function ctMoneyNote(ct: PortfolioSourceFields | undefined): string | null {
  if (!ct) return null;
  const lines: string[] = [];
  if (ct.available === false) {
    lines.push('The cTrader master is not connected: its positions count in positions and volume, not in money.');
  } else if ((ct.unpriced ?? 0) > 0) {
    lines.push(`${ct.unpriced} cTrader position${ct.unpriced === 1 ? ' has' : 's have'} no price yet and ${ct.unpriced === 1 ? 'is' : 'are'} not in the P/L.`);
  }
  if ((ct.no_usd_rate ?? 0) > 0) {
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
): PlatformColumns {
  const { bbook, abook, cbook } = books;

  if (platform === 'All') {
    const b = [ctMoneyNote(src.B?.CTRADER)].filter(has);
    const a = [ctMoneyNote(src.A?.CTRADER)].filter(has);
    return {
      bbook, abook, cbook,
      sum: null, sumHedgeDirection: null, sumHedgeDirectionNotional: null,
      notes: { portfolio: [...b, ...a], bbook: b, abook: a, cbook: [] },
    };
  }

  const notes: PlatformColumns['notes'] = { portfolio: [], bbook: [], abook: [], cbook: [] };
  let b: BookCardStats;
  let a: BookCardStats;

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
  } else {
    b = partStats(src.B?.CTRADER) ?? { ...EMPTY_BOOK_STATS };
    const lp = partStats(src.A?.LP_CTRADER);
    if (lp) {
      a = addStats(partStats(src.A?.CTRADER), lp);
    } else {
      a = addStats(partStats(src.A?.CTRADER), partStats(src.A?.LP));
      if (src.A?.LP) notes.abook.push(LP_NOT_SPLIT_NOTE);
    }
    notes.bbook.push(...[ctMoneyNote(src.B?.CTRADER)].filter(has));
    notes.abook.unshift(...[ctMoneyNote(src.A?.CTRADER)].filter(has));
  }
  if (src.A?.LP_MT5 || src.A?.LP_CTRADER) {
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
  };
}
