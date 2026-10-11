// ============================================
// Risk Radar — Exposure layer model
//
// Turns one per-symbol exposure snapshot into what the page shows. Pure
// functions only: the same snapshot always gives the same picture, which is
// what makes replay of buffered snapshots exact.
//
// EXPOSURE BASIS (stated on the page as well):
//   The measure is the B-Book USD notional per instrument — the exposure the
//   broker carries itself. It is the only USD exposure figure the service
//   publishes today, and the one the Cockpit already uses.
//
// PLATFORMS:
//   Every figure is for the chosen scope — MT5, cTrader, or both merged. Merged,
//   the same instrument is netted across the two platforms (see rowsInScope).
//
// COLOUR CALIBRATION:
//   Each instrument is coloured by its SHARE of total B-Book exposure
//   (concentration). The bands below are fixed, so an evenly spread book stays
//   green and only real concentration turns red. They are a relative scale:
//   they say where the risk sits, not whether the book as a whole is large.
//   Absolute limits per instrument are a backend item.
// ============================================

import type { PortfolioExposureSymbolsData } from '@/services/api';

export type Band = 'low' | 'moderate' | 'high' | 'critical';

export interface BandDef {
  id: Band;
  label: string;
  /** Lower bound, share of total B-Book exposure (0..1). */
  from: number;
  /** Badge / marker colour. Always shown together with the label. */
  color: string;
  /** Text colour that reads on `color`. */
  ink: string;
}

export const BANDS: BandDef[] = [
  { id: 'low',      label: 'Low',      from: 0.00, color: '#3ddc57', ink: '#04130a' },
  { id: 'moderate', label: 'Moderate', from: 0.10, color: '#ffe01f', ink: '#1a1500' },
  { id: 'high',     label: 'High',     from: 0.25, color: '#ff8a14', ink: '#1c0d00' },
  { id: 'critical', label: 'Critical', from: 0.40, color: '#ff3b30', ink: '#ffffff' },
];

export const BAND_BY_ID: Record<Band, BandDef> = {
  low: BANDS[0], moderate: BANDS[1], high: BANDS[2], critical: BANDS[3],
};

export function bandOf(share: number): Band {
  if (share >= BANDS[3].from) return 'critical';
  if (share >= BANDS[2].from) return 'high';
  if (share >= BANDS[1].from) return 'moderate';
  return 'low';
}

// Share → position on the colour ramp. Band boundaries land on the ramp's
// quarter points (0.25 / 0.50 / 0.75), so a badge and its patch always agree.
const HEAT_KNOTS: Array<[number, number]> = [
  [0.00, 0.17], [0.10, 0.25], [0.25, 0.50], [0.40, 0.75], [0.70, 1.00],
];

export function heatOf(share: number): number {
  if (!(share > 0)) return 0;
  for (let i = 1; i < HEAT_KNOTS.length; i++) {
    const [s1, t1] = HEAT_KNOTS[i];
    if (share <= s1) {
      const [s0, t0] = HEAT_KNOTS[i - 1];
      return t0 + ((share - s0) / (s1 - s0)) * (t1 - t0);
    }
  }
  return 1;
}

/**
 * priced   — has a B-Book position and a USD value;
 * unpriced — has a B-Book position but the feed carries no USD value for it;
 * flat     — no B-Book position (the instrument is held in A/C books only).
 */
export type Pricing = 'priced' | 'unpriced' | 'flat';

export type WorstDayState = 'ok' | 'no_history' | 'excluded' | 'unpriced';

export interface RadarSymbol {
  symbol: string;
  pricing: Pricing;
  /** |B-Book USD notional|. 0 unless priced. */
  usd: number;
  /** Share of total priced B-Book exposure, 0..1. */
  share: number;
  band: Band | null;
  heat: number;
  /** 1-based rank by B-Book exposure among priced instruments. */
  rank: number | null;
  bLots: number;
  aLots: number;
  cLots: number;
  netLots: number;
  longLots: number;
  shortLots: number;
  impact1pct: number | null;
  worstRange: number | null;
  worstDayLoss: number | null;
  worstDay: WorstDayState;
  unrealized: number | null;
  pnlMtd: number | null;
  /** Where the B-Book position sits, per platform (one entry when one platform is shown). */
  parts: PlatformPart[];
  /** Priced, but one platform's part has no USD value and is missing from `usd`. */
  partlyUnpriced: boolean;
  /** The exposure feed has no B-Book figure for it; the lots come from the MT5 servers. */
  fromMt5Book: boolean;
}

/** Open B-Book positions per symbol, as the MT5 servers report them (client side). */
export interface Mt5BookRow {
  symbol: string;
  buy_lots: number;
  sell_lots: number;
  positions: number;
  logins: number;
}

export interface RadarView {
  /** Snapshot time, epoch ms; null if the service sent none we can read. */
  asOf: number | null;
  symbols: RadarSymbol[];
  bySymbol: Map<string, RadarSymbol>;
  /** Σ |B-Book USD notional| over priced instruments. */
  totalUsd: number;
  impact1pct: number;
  /** Σ worst-day loss over instruments that have a usable range; null if none. */
  worstDayTotal: number | null;
  worstDayCovered: number;
  /** null until the worst-day ranges have been fetched. */
  worstDayReady: boolean;
  priced: number;
  unpriced: number;
  flat: number;
  bandCounts: Record<Band, number>;
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

/** ISO 8601 or PostgreSQL timestamp text → epoch ms (UTC when no zone given). */
export function parseTime(text: string | null | undefined): number | null {
  if (!text) return null;
  let t = text.trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(t)) t += 'Z';
  t = t.replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

// ── Platforms ────────────────────────────────────────────────
// The radar can be read for one trading platform or for both merged.
//
// A row says which platform it belongs to in `platform`. Rows without it are
// the MT5 book — that is what the exposure feed carries today. The snapshot
// may list what it covers in `platforms`; when it does not, coverage is what
// the rows show. A platform that is not covered is "no data", never "flat".

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
  for (const r of snapshot.by_symbol ?? []) out.add(platformOfRow(r));
  return out;
}

/** One platform's share of an instrument. */
export interface PlatformPart {
  platform: Platform;
  /** |B-Book USD notional| on this platform; null when it has lots but no USD value. */
  usd: number | null;
  bLots: number;
}

interface Merged {
  symbol: string;
  /** Σ signed B-Book USD notional over the priced parts (sign from the B-Book lots). */
  signedUsd: number;
  pricedParts: number;
  unpricedParts: number;
  bLots: number;
  aLots: number;
  cLots: number;
  netLots: number;
  longLots: number;
  shortLots: number;
  unrealized: number | null;
  pnlMtd: number | null;
  parts: PlatformPart[];
  fromMt5Book: boolean;
}

function addOpt(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

/**
 * Rows in scope, one per instrument. For both platforms merged, the same
 * instrument is NETTED: long on one platform against short on the other
 * leaves only the difference, which is what the broker carries.
 */
function rowsInScope(snapshot: PortfolioExposureSymbolsData | null, scope: PlatformScope): Merged[] {
  const byKey = new Map<string, Merged>();
  for (const r of snapshot?.by_symbol ?? []) {
    if (!r || typeof r.symbol !== 'string' || !r.symbol) continue;
    const platform = platformOfRow(r);
    if (scope !== 'ALL' && platform !== scope) continue;

    const key = typeof r.instrument === 'string' && r.instrument ? r.instrument : r.symbol;
    let m = byKey.get(key);
    if (!m) {
      m = {
        symbol: key, signedUsd: 0, pricedParts: 0, unpricedParts: 0,
        bLots: 0, aLots: 0, cLots: 0, netLots: 0, longLots: 0, shortLots: 0,
        unrealized: null, pnlMtd: null, parts: [], fromMt5Book: false,
      };
      byKey.set(key, m);
    }

    const usd = Math.abs(num(r.b_book_notional_usd));
    const bLots = num(r.b_book_lots);
    const hasLots = Math.abs(bLots) > EPS_LOTS;
    if (usd > 0) { m.signedUsd += bLots < 0 ? -usd : usd; m.pricedParts++; }
    else if (hasLots) m.unpricedParts++;

    m.bLots += bLots;
    m.aLots += num(r.a_book_lots);
    m.cLots += num(r.c_book_lots);
    m.netLots += num(r.net_exposure_lots);
    m.longLots += num(r.long_lots);
    m.shortLots += num(r.short_lots);
    m.unrealized = addOpt(m.unrealized, optNum(r.unrealized_pnl));
    m.pnlMtd = addOpt(m.pnlMtd, optNum(r.pnl_total_mtd));
    if (usd > 0 || hasLots) m.parts.push({ platform, usd: usd > 0 ? usd : null, bLots });
  }
  return [...byKey.values()];
}

/**
 * Instruments the MT5 servers hold open B-Book positions in, for which the
 * exposure feed carries no B-Book figure. They are added as unpriced rows —
 * lots only, broker view — so a gap in the feed shows as a grey instrument
 * instead of a missing one.
 */
function addFeedGaps(rows: Merged[], mt5Book: Mt5BookRow[]): number {
  const have = new Map(rows.map((r) => [r.symbol, r] as const));
  let gaps = 0;
  for (const b of mt5Book) {
    const lots = num(b.sell_lots) - num(b.buy_lots);          // client buy = broker short
    const gross = num(b.sell_lots) + num(b.buy_lots);
    if (!(gross > EPS_LOTS)) continue;
    const row = have.get(b.symbol);
    if (row && row.parts.some((p) => p.platform === 'MT5')) continue;   // the feed has it

    const part: PlatformPart = { platform: 'MT5', usd: null, bLots: lots };
    if (row) {
      row.bLots += lots;
      row.netLots += lots;
      row.unpricedParts++;
      row.parts.push(part);
      row.fromMt5Book = true;
    } else {
      rows.push({
        symbol: b.symbol, signedUsd: 0, pricedParts: 0, unpricedParts: 1,
        bLots: lots, aLots: 0, cLots: 0, netLots: lots,
        longLots: num(b.sell_lots), shortLots: num(b.buy_lots),
        unrealized: null, pnlMtd: null, parts: [part], fromMt5Book: true,
      });
    }
    gaps++;
  }
  return gaps;
}

export function buildView(
  snapshot: PortfolioExposureSymbolsData | null,
  largest1Day: Record<string, number> | null,
  scope: PlatformScope = 'ALL',
  mt5Book: Mt5BookRow[] | null = null,
): RadarView {
  const rows = rowsInScope(snapshot, scope);
  const feedGaps = mt5Book && scope !== 'CTRADER' ? addFeedGaps(rows, mt5Book) : 0;

  let totalUsd = 0;
  for (const r of rows) totalUsd += Math.abs(r.signedUsd);

  const symbols: RadarSymbol[] = [];
  const bandCounts: Record<Band, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  let worstDayTotal = 0;
  let worstDayCovered = 0;
  let unpriced = 0;
  let flat = 0;

  for (const r of rows) {
    const usd = Math.abs(r.signedUsd);
    // Priced parts that cancel out leave a flat instrument, not an unpriced one.
    const pricing: Pricing = usd > 0 ? 'priced' : r.unpricedParts > 0 ? 'unpriced' : 'flat';
    const share = pricing === 'priced' && totalUsd > 0 ? usd / totalUsd : 0;
    const band = pricing === 'priced' ? bandOf(share) : null;

    let worstRange: number | null = null;
    let worstDayLoss: number | null = null;
    let worstDay: WorstDayState = 'unpriced';
    if (pricing === 'priced') {
      const range = largest1Day ? largest1Day[r.symbol] : undefined;
      if (!(typeof range === 'number' && range > 0)) worstDay = 'no_history';
      else if (range > MAX_DAILY_RANGE) worstDay = 'excluded';
      else {
        worstDay = 'ok';
        worstRange = range;
        worstDayLoss = range * usd;
        worstDayTotal += worstDayLoss;
        worstDayCovered++;
      }
    }

    if (band) bandCounts[band]++;
    if (pricing === 'unpriced') unpriced++;
    if (pricing === 'flat') flat++;

    symbols.push({
      symbol: r.symbol,
      pricing,
      usd: pricing === 'priced' ? usd : 0,
      share,
      band,
      heat: pricing === 'priced' ? heatOf(share) : 0,
      rank: null,
      bLots: r.bLots,
      aLots: r.aLots,
      cLots: r.cLots,
      netLots: r.netLots,
      longLots: r.longLots,
      shortLots: r.shortLots,
      impact1pct: pricing === 'priced' ? usd * 0.01 : null,
      worstRange,
      worstDayLoss,
      worstDay,
      unrealized: r.unrealized,
      pnlMtd: r.pnlMtd,
      parts: r.parts,
      partlyUnpriced: pricing === 'priced' && r.unpricedParts > 0,
      fromMt5Book: r.fromMt5Book,
    });
  }

  // Priced first by exposure, then unpriced by lots, then flat by name.
  const order: Record<Pricing, number> = { priced: 0, unpriced: 1, flat: 2 };
  symbols.sort((a, b) =>
    order[a.pricing] - order[b.pricing] ||
    b.usd - a.usd ||
    Math.abs(b.bLots) - Math.abs(a.bLots) ||
    a.symbol.localeCompare(b.symbol),
  );
  let rank = 0;
  for (const s of symbols) if (s.pricing === 'priced') s.rank = ++rank;

  return {
    asOf: parseTime(snapshot?.as_of),
    symbols,
    bySymbol: new Map(symbols.map((s) => [s.symbol, s] as const)),
    totalUsd,
    impact1pct: totalUsd * 0.01,
    worstDayTotal: worstDayCovered > 0 ? worstDayTotal : null,
    worstDayCovered,
    worstDayReady: largest1Day !== null,
    priced: rank,
    unpriced,
    flat,
    bandCounts,
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

/** B-Book exposure of one instrument in a snapshot, in the given scope. */
export function usdOf(snapshot: PortfolioExposureSymbolsData, symbol: string, scope: PlatformScope): number {
  for (const r of rowsInScope(snapshot, scope)) {
    if (r.symbol === symbol) return Math.abs(r.signedUsd);
  }
  return 0;
}

/** Total B-Book exposure of a snapshot, in the given scope. */
export function totalUsdOf(snapshot: PortfolioExposureSymbolsData, scope: PlatformScope): number {
  let t = 0;
  for (const r of rowsInScope(snapshot, scope)) t += Math.abs(r.signedUsd);
  return t;
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
  if (!Number.isFinite(share)) return '—';
  const p = share * 100;
  if (p > 0 && p < 1 && digits === 0) return '<1%';
  return `${p.toFixed(digits)}%`;
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
