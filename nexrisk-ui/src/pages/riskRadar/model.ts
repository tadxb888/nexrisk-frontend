// ============================================
// Risk Radar — Exposure layer model
//
// Turns one per-symbol exposure snapshot, plus the broker's risk limits, the
// adverse move per symbol and the realised P&L of the month, into what the
// page shows. Pure functions only: the same inputs always give the same
// picture, which is what makes replay of buffered snapshots exact.
//
// THE MEASURE (Briefs/Taiga Risk Radar - Risk Measure.md, agreed 12 Oct):
//   per instrument, MT5 and cTrader together
//     net lots      = B + A + C, broker view (net_exposure_lots)
//     USD per lot   = contract_size × price × quote_usd_rate
//     U             = unrealised B + A + C, USD, broker view
//     move loss     = |net lots| × USD per lot × move_pct
//     stressed P&L  = U − move loss
//     risk          = max(0, −stressed P&L)
//   remaining capacity = monthly loss limit − max(0, −realised P&L MTD)
//   level              = risk ÷ remaining capacity   (instrument)
//   book level         = Σ risk ÷ remaining capacity (gains do not offset)
//   bands              = the broker's Warning / High / Critical, % of capacity
//
// NOTHING IS GUESSED:
//   unpriced — the row has a position but no USD value (priced: false), or the
//              P&L of one of its books is unknown;
//   unrated  — priced, but no adverse move yet for the symbol (move_pct null);
//   no level — no loss limit is set, or the month's P&L is not loaded yet:
//              risk is shown in USD, but nothing is coloured.
//
// PLATFORMS:
//   The risk of an instrument is always measured on the whole book. The LP
//   hedges and the C-Book are not split per platform, so a platform's own
//   risk cannot be told without guessing. The MT5 / cTrader views show the
//   instruments that platform holds, with the whole-book risk, and that
//   platform's own B-Book figures beside it.
// ============================================

import type {
  DailyMovesData,
  PortfolioExposureSymbolsData,
  PortfolioExposureSymbolRow,
  RiskLimitsSection,
} from '@/services/api';

// ── Bands ────────────────────────────────────────────────────

export type Band = 'low' | 'warning' | 'high' | 'critical';

export interface BandDef {
  id: Band;
  label: string;
  /** Badge / marker colour. Always shown together with the label. */
  color: string;
  /** Text colour that reads on `color`. */
  ink: string;
}

export const BANDS: BandDef[] = [
  { id: 'low',      label: 'Low',      color: '#3ddc57', ink: '#04130a' },
  { id: 'warning',  label: 'Warning',  color: '#ffe01f', ink: '#1a1500' },
  { id: 'high',     label: 'High',     color: '#ff8a14', ink: '#1c0d00' },
  { id: 'critical', label: 'Critical', color: '#ff3b30', ink: '#ffffff' },
];

export const BAND_BY_ID: Record<Band, BandDef> = {
  low: BANDS[0], warning: BANDS[1], high: BANDS[2], critical: BANDS[3],
};

/** Band thresholds as fractions of the remaining capacity. */
export interface Thresholds { warning: number; high: number; critical: number }

export const DEFAULT_THRESHOLDS: Thresholds = { warning: 0.5, high: 0.75, critical: 1 };

export function thresholdsOf(limits: RiskLimitsSection | null): Thresholds {
  const b = limits?.bands;
  if (!b) return DEFAULT_THRESHOLDS;
  const w = b.warning_pct / 100, h = b.high_pct / 100, c = b.critical_pct / 100;
  return [w, h, c].every((v) => Number.isFinite(v) && v > 0) && w < h && h <= c
    ? { warning: w, high: h, critical: c }
    : DEFAULT_THRESHOLDS;
}

export function bandOf(level: number, t: Thresholds): Band {
  if (level >= t.critical) return 'critical';
  if (level >= t.high) return 'high';
  if (level >= t.warning) return 'warning';
  return 'low';
}

/**
 * Level → position on the colour ramp. Band boundaries land on the ramp's
 * quarter points (0.25 / 0.50 / 0.75), so a badge and its patch always agree.
 * Twice the Critical level reaches the top of the ramp.
 */
export function heatOf(level: number, t: Thresholds): number {
  if (!(level > 0)) return 0;
  const knots: Array<[number, number]> = [
    [0, 0.12], [t.warning, 0.25], [t.high, 0.5], [t.critical, 0.75], [t.critical * 2, 1],
  ];
  for (let i = 1; i < knots.length; i++) {
    const [l1, h1] = knots[i];
    const [l0, h0] = knots[i - 1];
    if (level <= l1) return l1 > l0 ? h0 + ((level - l0) / (l1 - l0)) * (h1 - h0) : h1;
  }
  return 1;
}

// ── Inputs ───────────────────────────────────────────────────

/** Open B-Book positions per symbol, as the MT5 servers report them (client side). */
export interface Mt5BookRow {
  symbol: string;
  buy_lots: number;
  sell_lots: number;
  positions: number;
  logins: number;
}

/** What the measure needs besides the snapshot. Constant across replayed samples. */
export interface RiskContext {
  /** Adverse move per symbol. null until loaded. */
  moves: DailyMovesData | null;
  /** The Risk Limits section. null until loaded. */
  limits: RiskLimitsSection | null;
  /** Realised P&L of the whole book, month to date, broker view. null until loaded. */
  realizedMtd: number | null;
}

// ── Platforms ────────────────────────────────────────────────

export type Platform = 'MT5' | 'CTRADER';
export type PlatformScope = 'ALL' | Platform;

export const PLATFORM_LABEL: Record<Platform, string> = { MT5: 'MT5', CTRADER: 'cTrader' };

export function scopeLabel(scope: PlatformScope): string {
  return scope === 'ALL' ? 'MT5 + cTrader' : PLATFORM_LABEL[scope];
}

function toPlatform(v: unknown): Platform {
  return typeof v === 'string' && /ctrader/i.test(v) ? 'CTRADER' : 'MT5';
}

export function platformOfRow(row: { platform?: string }): Platform {
  return toPlatform(row.platform);
}

/** Platforms this snapshot has data for. */
export function coverageOf(snapshot: PortfolioExposureSymbolsData | null): Set<Platform> {
  const out = new Set<Platform>();
  if (!snapshot) return out;
  if (Array.isArray(snapshot.platforms)) {
    for (const p of snapshot.platforms) out.add(toPlatform(p));
    return out;
  }
  out.add('MT5');
  for (const r of snapshot.by_symbol ?? []) {
    out.add(platformOfRow(r));
    if (r && typeof r.b_book_lots_ctrader === 'number') out.add('CTRADER');   // merged rows carry cTrader
  }
  return out;
}

/** One platform's B-Book share of an instrument. */
export interface PlatformPart {
  platform: Platform;
  bLots: number;
  /** |B-Book lots| in USD; null when unpriced. */
  bUsd: number | null;
  /** B-Book unrealised P&L on this platform, USD, broker view; null when not known. */
  bU: number | null;
}

// ── Output ───────────────────────────────────────────────────

/**
 * rated    — risk is known (or the net position is flat: no move needed);
 * unrated  — priced, but the symbol has no adverse move yet;
 * unpriced — no USD value for the position, or a book's P&L is unknown.
 */
export type Rating = 'rated' | 'unrated' | 'unpriced';

export type WorstDayState = 'ok' | 'no_history' | 'excluded' | 'unpriced' | 'flat';

export interface RadarSymbol {
  symbol: string;
  rating: Rating;
  /** Why it is unpriced, in words ("no price", "A-Book P&L unknown"…). */
  missing: string[];
  /** null when there is no level (unrated, unpriced, or no capacity). */
  band: Band | null;
  heat: number;
  /** 1-based rank by risk among instruments with risk > 0. */
  rank: number | null;

  bLots: number;
  aLots: number;
  cLots: number;
  netLots: number;

  /** Unrealised P&L per book and in total, USD, broker view. null = unknown. */
  bU: number | null;
  aU: number | null;
  cU: number | null;
  u: number | null;

  usdPerLot: number | null;
  /** |net lots| in USD. */
  netUsd: number | null;
  /** |B-Book lots| in USD. Information only. */
  bUsd: number | null;
  /** Share of the priced B-Book in USD, 0..1. Information only. */
  share: number;

  /** Adverse move, percent (0.92 = 0.92 %). */
  movePct: number | null;
  moveSamples: number | null;
  moveLoss: number | null;
  stressed: number | null;
  risk: number | null;
  /** risk ÷ remaining capacity; Infinity when capacity is used up. null without capacity. */
  level: number | null;

  worstRange: number | null;
  worstDayLoss: number | null;
  worstDay: WorstDayState;

  /** B-Book P&L month to date, USD (all platforms). */
  pnlMtd: number | null;
  /** B-Book by platform. */
  parts: PlatformPart[];
  /** The exposure feed has no figure for it; the lots come from the MT5 servers. */
  fromMt5Book: boolean;
}

export type CapacityState = 'loading' | 'no_limit' | 'no_pnl' | 'ok';

export interface Capacity {
  state: CapacityState;
  currency: string;
  month: string | null;
  limit: number | null;
  carriedOver: boolean;
  realizedMtd: number | null;
  /** max(0, −realised MTD). */
  lossTaken: number | null;
  /** limit − loss taken. May be ≤ 0 when the limit is used up. */
  remaining: number | null;
}

export interface RadarView {
  /** Snapshot time, epoch ms; null if the service sent none we can read. */
  asOf: number | null;
  /** Instruments in the chosen platform scope. */
  symbols: RadarSymbol[];
  bySymbol: Map<string, RadarSymbol>;
  thresholds: Thresholds;
  capacity: Capacity;
  /** Σ risk of the rated instruments — always the whole book. */
  bookRisk: number;
  bookLevel: number | null;
  bookBand: Band | null;
  /** Counts over the instruments shown. */
  rated: number;
  unrated: number;
  unpriced: number;
  atRisk: number;
  bandCounts: Record<Band, number>;
  /** Σ |B-Book USD| over priced instruments shown. Information only. */
  totalBUsd: number;
  /** Σ worst-day loss over instruments shown that have a usable range; null if none. */
  worstDayTotal: number | null;
  worstDayCovered: number;
  worstDayReady: boolean;
  movesReady: boolean;
  /** Instruments MT5 holds B-Book positions in that the exposure feed has no figure for. */
  feedGaps: number;
}

/** Same guard as the Cockpit: a one-day range above 10 % is a bad bar. */
export const MAX_DAILY_RANGE = 0.10;

const EPS_LOTS = 1e-9;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function flat(lots: number): boolean {
  return Math.abs(lots) < EPS_LOTS;
}

/** null = unknown, except that a book with no position has nothing to lose. */
function leg(v: unknown, lots: number): number | null {
  const n = optNum(v);
  if (n !== null) return n;
  return flat(lots) ? 0 : null;
}

function addOpt(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/** ISO 8601 or PostgreSQL timestamp text → epoch ms (UTC when no zone given). */
export function parseTime(text: string | null | undefined): number | null {
  if (!text) return null;
  let t = text.trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(t)) t += 'Z';
  t = t.replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

// ── Capacity ─────────────────────────────────────────────────

export function capacityOf(ctx: RiskContext): Capacity {
  const l = ctx.limits;
  const base: Capacity = {
    state: 'loading', currency: l?.currency || 'USD', month: l?.limit?.month ?? null,
    limit: null, carriedOver: !!l?.limit?.carried_over, realizedMtd: ctx.realizedMtd,
    lossTaken: ctx.realizedMtd === null ? null : Math.max(0, -ctx.realizedMtd), remaining: null,
  };
  if (!l) return base;
  const limit = optNum(l.limit?.monthly_loss_limit);
  if (limit === null || !(limit > 0)) return { ...base, state: 'no_limit' };
  if (base.lossTaken === null) return { ...base, limit, state: 'no_pnl' };
  return { ...base, limit, state: 'ok', remaining: limit - base.lossTaken };
}

function levelOf(risk: number, cap: Capacity): number | null {
  if (cap.state !== 'ok' || cap.remaining === null) return null;
  if (cap.remaining > 0) return risk / cap.remaining;
  return risk > 0 ? Infinity : 0;
}

// ── Per instrument, whole book ───────────────────────────────

interface Acc {
  symbol: string;
  bLots: number; aLots: number; cLots: number; netLots: number;
  bU: number | null; aU: number | null; cU: number | null;
  /** First USD-per-lot found (rows come MT5 first). */
  usdPerLot: number | null;
  /** A row with lots had no USD value. */
  unpricedLots: boolean;
  pnlMtd: number | null;
  parts: Array<{ platform: Platform; bLots: number; bU: number | null }>;
  fromMt5Book: boolean;
}

function usdPerLotOf(r: PortfolioExposureSymbolRow): number | null {
  if (r.priced === false) return null;
  const cs = optNum(r.contract_size), px = optNum(r.price), fx = optNum(r.quote_usd_rate);
  if (cs === null || px === null || fx === null) return null;
  const v = cs * px * fx;
  return v > 0 ? v : null;
}

function addPart(m: Acc, platform: Platform, bLots: number, bU: number | null) {
  if (flat(bLots)) return;
  const p = m.parts.find((x) => x.platform === platform);
  if (p) { p.bLots += bLots; p.bU = addOpt(p.bU, bU); }
  else m.parts.push({ platform, bLots, bU });
}

function accumulate(snapshot: PortfolioExposureSymbolsData | null): Map<string, Acc> {
  const byKey = new Map<string, Acc>();
  for (const r of snapshot?.by_symbol ?? []) {
    if (!r || typeof r.symbol !== 'string' || !r.symbol) continue;
    const key = typeof r.instrument === 'string' && r.instrument ? r.instrument : r.symbol;
    let m = byKey.get(key);
    if (!m) {
      m = {
        symbol: key, bLots: 0, aLots: 0, cLots: 0, netLots: 0, bU: 0, aU: 0, cU: 0,
        usdPerLot: null, unpricedLots: false, pnlMtd: null, parts: [], fromMt5Book: false,
      };
      byKey.set(key, m);
    }
    const b = num(r.b_book_lots), a = num(r.a_book_lots), c = num(r.c_book_lots);
    const net = typeof r.net_exposure_lots === 'number' ? num(r.net_exposure_lots) : b + a + c;
    const bU = leg(r.unrealized_pnl, b);
    m.bLots += b; m.aLots += a; m.cLots += c; m.netLots += net;
    m.bU = addOpt(m.bU, bU);
    m.aU = addOpt(m.aU, leg(r.a_book_unrealized_usd, a));
    m.cU = addOpt(m.cU, leg(r.c_book_unrealized_usd, c));
    const perLot = usdPerLotOf(r);
    if (perLot !== null) { if (m.usdPerLot === null) m.usdPerLot = perLot; }
    else if (!flat(net) || !flat(b)) m.unpricedLots = true;
    const mtd = optNum(r.pnl_total_mtd);
    if (mtd !== null) m.pnlMtd = (m.pnlMtd ?? 0) + mtd;

    if (r.platform) {
      addPart(m, platformOfRow(r), b, bU);
    } else if (typeof r.b_book_lots_ctrader === 'number') {
      // A merged row: the cTrader share of the B-Book is given apart.
      const bCt = num(r.b_book_lots_ctrader);
      const uCt = optNum(r.unrealized_pnl_ctrader) ?? (flat(bCt) ? 0 : null);
      addPart(m, 'MT5', b - bCt, bU === null || uCt === null ? null : bU - uCt);
      addPart(m, 'CTRADER', bCt, uCt);
    } else {
      addPart(m, 'MT5', b, bU);
    }
  }
  return byKey;
}

/**
 * Instruments the MT5 servers hold open B-Book positions in, for which the
 * exposure feed carries no figure. They are added as unpriced rows — lots
 * only, broker view — so a gap in the feed shows as a grey instrument
 * instead of a missing one.
 */
function addFeedGaps(rows: Map<string, Acc>, mt5Book: Mt5BookRow[]): number {
  let gaps = 0;
  for (const b of mt5Book) {
    const lots = num(b.sell_lots) - num(b.buy_lots);          // client buy = broker short
    const gross = num(b.sell_lots) + num(b.buy_lots);
    if (!(gross > EPS_LOTS)) continue;
    const row = rows.get(b.symbol);
    if (row && row.parts.some((p) => p.platform === 'MT5')) continue;   // the feed has it
    if (row) {
      row.bLots += lots; row.netLots += lots; row.bU = null;
      row.unpricedLots = true; row.fromMt5Book = true;
      row.parts.push({ platform: 'MT5', bLots: lots, bU: null });
    } else {
      rows.set(b.symbol, {
        symbol: b.symbol, bLots: lots, aLots: 0, cLots: 0, netLots: lots,
        bU: null, aU: 0, cU: 0, usdPerLot: null, unpricedLots: true, pnlMtd: null,
        parts: [{ platform: 'MT5', bLots: lots, bU: null }], fromMt5Book: true,
      });
    }
    gaps++;
  }
  return gaps;
}

function moveOf(moves: DailyMovesData | null, symbol: string): { pct: number | null; samples: number | null } {
  const e = moves?.symbols?.[symbol] ?? moves?.ctrader_symbols?.[symbol];
  if (!e) return { pct: null, samples: null };
  const pct = optNum(e.move_pct);
  return { pct: pct !== null && pct >= 0 ? pct : null, samples: optNum(e.samples) };
}

function measure(
  m: Acc,
  ctx: RiskContext,
  cap: Capacity,
  t: Thresholds,
  largest1Day: Record<string, number> | null,
): RadarSymbol {
  const u = addOpt(addOpt(m.bU, m.aU), m.cU);
  const priced = m.usdPerLot !== null && !m.unpricedLots;
  const netFlat = flat(m.netLots);
  const move = moveOf(ctx.moves, m.symbol);

  const missing: string[] = [];
  if (!priced && !netFlat) missing.push(m.fromMt5Book ? 'not in the exposure feed' : 'no USD value (price, contract size or rate)');
  if (m.bU === null && !m.fromMt5Book) missing.push('B-Book P&L unknown');
  if (m.aU === null) missing.push('A-Book P&L unknown');
  if (m.cU === null) missing.push('C-Book P&L unknown');

  let rating: Rating;
  if (missing.length > 0) rating = 'unpriced';
  else if (!netFlat && move.pct === null) rating = 'unrated';
  else rating = 'rated';

  const usdPerLot = m.usdPerLot;
  const netUsd = usdPerLot !== null ? Math.abs(m.netLots) * usdPerLot : null;
  const bUsd = usdPerLot !== null && !m.unpricedLots ? Math.abs(m.bLots) * usdPerLot : null;

  let moveLoss: number | null = null, stressed: number | null = null, risk: number | null = null;
  if (rating === 'rated' && u !== null) {
    moveLoss = netFlat ? 0 : (netUsd as number) * (move.pct as number) / 100;
    stressed = u - moveLoss;
    risk = Math.max(0, -stressed);
  }
  const level = risk !== null ? levelOf(risk, cap) : null;
  const band = level !== null ? bandOf(level, t) : null;

  let worstRange: number | null = null, worstDayLoss: number | null = null;
  let worstDay: WorstDayState = netFlat ? 'flat' : netUsd === null ? 'unpriced' : 'no_history';
  if (!netFlat && netUsd !== null) {
    const range = largest1Day ? largest1Day[m.symbol] : undefined;
    if (typeof range === 'number' && range > 0) {
      if (range > MAX_DAILY_RANGE) worstDay = 'excluded';
      else { worstDay = 'ok'; worstRange = range; worstDayLoss = range * netUsd; }
    }
  }

  return {
    symbol: m.symbol, rating, missing, band,
    heat: level !== null ? heatOf(level, t) : 0,
    rank: null,
    bLots: m.bLots, aLots: m.aLots, cLots: m.cLots, netLots: m.netLots,
    bU: m.bU, aU: m.aU, cU: m.cU, u,
    usdPerLot, netUsd, bUsd, share: 0,
    movePct: move.pct, moveSamples: move.samples, moveLoss, stressed, risk, level,
    worstRange, worstDayLoss, worstDay,
    pnlMtd: m.pnlMtd,
    parts: m.parts.map((p) => ({
      platform: p.platform, bLots: p.bLots, bU: p.bU,
      bUsd: usdPerLot !== null && !m.unpricedLots ? Math.abs(p.bLots) * usdPerLot : null,
    })),
    fromMt5Book: m.fromMt5Book,
  };
}

function inScope(s: RadarSymbol, scope: PlatformScope): boolean {
  if (scope === 'ALL') return true;
  if (s.parts.some((p) => p.platform === scope)) return true;
  // cTrader book A is the cTrader platform's too; no split of it is given
  // apart from lots, so an instrument held only there shows under Both.
  return false;
}

// Whole-book risk per snapshot, cached: replay and the trend lines ask for
// the same snapshots many times.
const riskCache = new WeakMap<PortfolioExposureSymbolsData, { ctx: RiskContext; total: number; bySymbol: Map<string, number> }>();

function wholeBookRisk(snapshot: PortfolioExposureSymbolsData, ctx: RiskContext) {
  const hit = riskCache.get(snapshot);
  if (hit && hit.ctx === ctx) return hit;
  const cap = capacityOf(ctx);
  const t = thresholdsOf(ctx.limits);
  const bySymbol = new Map<string, number>();
  let total = 0;
  for (const m of accumulate(snapshot).values()) {
    const s = measure(m, ctx, cap, t, null);
    if (s.risk !== null) { bySymbol.set(s.symbol, s.risk); total += s.risk; }
  }
  const out = { ctx, total, bySymbol };
  riskCache.set(snapshot, out);
  return out;
}

export function buildView(
  snapshot: PortfolioExposureSymbolsData | null,
  largest1Day: Record<string, number> | null,
  scope: PlatformScope,
  mt5Book: Mt5BookRow[] | null,
  ctx: RiskContext,
): RadarView {
  const rows = accumulate(snapshot);
  const feedGaps = mt5Book && scope !== 'CTRADER' ? addFeedGaps(rows, mt5Book) : 0;
  const cap = capacityOf(ctx);
  const t = thresholdsOf(ctx.limits);

  const all = [...rows.values()].map((m) => measure(m, ctx, cap, t, largest1Day));

  // The book is the whole book, whatever the platform shown.
  let bookRisk = 0;
  for (const s of all) if (s.risk !== null) bookRisk += s.risk;
  const bookLevel = levelOf(bookRisk, cap);

  const symbols = all.filter((s) => inScope(s, scope));

  let totalBUsd = 0;
  for (const s of symbols) if (s.bUsd !== null) totalBUsd += s.bUsd;
  for (const s of symbols) s.share = s.bUsd !== null && totalBUsd > 0 ? s.bUsd / totalBUsd : 0;

  // Risk first (largest first), then unrated by size, then unpriced, then the
  // instruments with nothing at risk.
  const order = (s: RadarSymbol) =>
    s.rating === 'rated' && (s.risk ?? 0) > 0 ? 0 : s.rating === 'unrated' ? 1 : s.rating === 'unpriced' ? 2 : 3;
  symbols.sort((a, b) =>
    order(a) - order(b) ||
    (b.risk ?? 0) - (a.risk ?? 0) ||
    (b.netUsd ?? 0) - (a.netUsd ?? 0) ||
    Math.abs(b.netLots) - Math.abs(a.netLots) ||
    a.symbol.localeCompare(b.symbol),
  );

  const bandCounts: Record<Band, number> = { low: 0, warning: 0, high: 0, critical: 0 };
  let rank = 0, rated = 0, unrated = 0, unpriced = 0;
  let worstDayTotal = 0, worstDayCovered = 0;
  for (const s of symbols) {
    if (s.rating === 'rated') rated++;
    else if (s.rating === 'unrated') unrated++;
    else unpriced++;
    if ((s.risk ?? 0) > 0) s.rank = ++rank;
    if (s.band) bandCounts[s.band]++;
    if (s.worstDayLoss !== null) { worstDayTotal += s.worstDayLoss; worstDayCovered++; }
  }

  return {
    asOf: parseTime(snapshot?.as_of),
    symbols,
    bySymbol: new Map(symbols.map((s) => [s.symbol, s] as const)),
    thresholds: t,
    capacity: cap,
    bookRisk,
    bookLevel,
    bookBand: bookLevel !== null ? bandOf(bookLevel, t) : null,
    rated, unrated, unpriced, atRisk: rank,
    bandCounts,
    totalBUsd,
    worstDayTotal: worstDayCovered > 0 ? worstDayTotal : null,
    worstDayCovered,
    worstDayReady: largest1Day !== null,
    movesReady: ctx.moves !== null,
    feedGaps,
  };
}

// ── Observed history (buffered in the page) ──────────────────

export interface Sample {
  /** Epoch ms: snapshot `as_of`, or receive time when that is unreadable. */
  t: number;
  snapshot: PortfolioExposureSymbolsData;
}

export const HISTORY_WINDOW_MS = 30 * 60 * 1000;
export const SAMPLE_EVERY_MS = 5_000;

/** Risk of one instrument in a snapshot (whole book); 0 when not rated. */
export function riskOf(snapshot: PortfolioExposureSymbolsData, symbol: string, ctx: RiskContext): number {
  return wholeBookRisk(snapshot, ctx).bySymbol.get(symbol) ?? 0;
}

/** Book risk of a snapshot: Σ instrument risks, whole book. */
export function bookRiskOf(snapshot: PortfolioExposureSymbolsData, ctx: RiskContext): number {
  return wholeBookRisk(snapshot, ctx).total;
}

export type TrendDir = 'building' | 'easing' | 'steady';

export interface Trend {
  dir: TrendDir;
  /** Relative change over `spanMs`, e.g. 0.12 = +12 %. Null when it started from zero. */
  change: number | null;
  spanMs: number;
}

const TREND_LOOKBACK_MS = 5 * 60 * 1000;
const TREND_MIN_SPAN_MS = 60 * 1000;
const TREND_THRESHOLD = 0.05;

/**
 * Direction of a value across the buffered samples, ending at `uptoIndex`:
 * now against five minutes earlier (or the oldest sample, once a minute of
 * history exists). Null while there is too little history to say.
 */
export function trendOf(
  history: Sample[],
  uptoIndex: number,
  pick: (s: Sample) => number,
): Trend | null {
  if (uptoIndex < 1 || uptoIndex >= history.length) return null;
  const now = history[uptoIndex];
  let ref = history[0];
  for (let i = uptoIndex - 1; i >= 0; i--) {
    ref = history[i];
    if (now.t - history[i].t >= TREND_LOOKBACK_MS) break;
  }
  const spanMs = now.t - ref.t;
  if (spanMs < TREND_MIN_SPAN_MS) return null;
  const a = pick(ref), b = pick(now);
  if (a <= 0 && b <= 0) return { dir: 'steady', change: 0, spanMs };
  if (a <= 0) return { dir: 'building', change: null, spanMs };
  const change = (b - a) / a;
  const dir: TrendDir = change >= TREND_THRESHOLD ? 'building' : change <= -TREND_THRESHOLD ? 'easing' : 'steady';
  return { dir, change, spanMs };
}

// ── Formatting ───────────────────────────────────────────────

export function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e7) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(share: number, digits = 0): string {
  if (!Number.isFinite(share)) return share > 0 ? 'over limit' : '—';
  const p = share * 100;
  if (p > 0 && p < 1 && digits === 0) return '<1%';
  return `${p.toFixed(digits)}%`;
}

/** Percent figure already in percent (move_pct). */
export function fmtMovePct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

export function fmtLots(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const text = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 && abs >= 0.005 ? `−${text}` : text;
}

/** "broker long" / "broker short" — lots on this feed are broker view. */
export function sideOf(v: number): string {
  if (Math.abs(v) < 0.005) return 'flat';
  return v > 0 ? 'broker long' : 'broker short';
}

export function fmtUtcTime(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

export function fmtUtcDateTime(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${fmtUtcTime(ms)}`;
}

export function fmtSpan(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} s`;
  return `${Math.round(s / 60)} min`;
}
