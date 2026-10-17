// ============================================
// Risk Radar — Liquidity layer model (phase 1)
//
// Turns one radar.liquidity.lps payload (live, the last hour) or one history
// payload (today / 7d / mtd / 30d) into what the page shows. Pure: no React,
// no fetching. Contract: NexRisk_Risk_Radar_Liquidity_API.md v1.0.
//
// THE SUBJECT IS THE LP. Every LP gets a verdict — is it a risk to the broker
// now — from four dimensions of evidence: Rejecting, Slipping, Slow and
// Availability. The backend computes every level from the broker's thresholds
// (Settings → Liquidity); this model never re-levels anything:
//   • the LP's level is its worst dimension; two dimensions at High or worse
//     make it Critical; disconnected with open hedges makes it Critical;
//   • rank and "× median" are context, measured within the LP's group only:
//     real LPs against real LPs, test LPs against test LPs, never across;
//   • value null = too few orders (or fills, or observed time): no level, no
//     rank, drawn hollow — never as acceptable.
//
// THE MAP: one region per dimension; every LP is a dot in every region, at
// the same place in each, so the eye follows one LP across the four. The
// dot's colour is the LP's level in that dimension.
// ============================================

import type {
  LiqDimensionId,
  LiqFigures,
  LiqGroup,
  LiqLevel,
  LiqLp,
  LiqLpCore,
  LiqLpSymbol,
  LiqMetric,
  LiqPeriod,
  LiquidityPayload,
} from '@/services/api';
import { halton, layoutRegions, type InstrumentMap, type MapPosition } from './instrumentMap';
import type { Band } from './model';

// ── Dimensions and metrics ───────────────────────────────────

export interface DimensionDef { id: string; label: string; question: string }

export const DIMENSIONS: DimensionDef[] = [
  { id: 'rejecting',    label: 'Rejecting',    question: 'Does it fill our orders?' },
  { id: 'slipping',     label: 'Slipping',     question: 'At the price it showed?' },
  { id: 'slow',         label: 'Slow',         question: 'How long does it take?' },
  { id: 'availability', label: 'Availability', question: 'Is it there in trading hours?' },
];

const DIM_BY_ID = new Map(DIMENSIONS.map((d) => [d.id, d] as const));

export function dimensionLabel(id: string): string {
  return DIM_BY_ID.get(id)?.label ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
}

export type Unit = 'share' | 'ms' | 'ratio' | 'count' | 'minutes';

export interface MetricDef {
  key: string;
  dimension: string;
  label: string;
  /** What the figure is, in one line. */
  hint: string;
  unit: Unit;
}

export const METRICS: MetricDef[] = [
  { key: 'reject_rate', dimension: 'rejecting', label: 'Reject rate', unit: 'share',
    hint: 'Orders the LP rejected ÷ orders sent. Orders Taiga refused before sending are not counted.' },
  { key: 'timeout_rate', dimension: 'rejecting', label: 'Timeout rate', unit: 'share',
    hint: 'Orders with no final answer: the timeout monitor gave up, or 60 s passed.' },
  { key: 'filled_volume_pct', dimension: 'rejecting', label: 'Volume filled', unit: 'share',
    hint: 'Volume filled ÷ volume requested, over all orders.' },
  { key: 'reject_hold_ratio', dimension: 'rejecting', label: 'Time to reject ÷ time to fill', unit: 'ratio',
    hint: 'An LP that takes longer to say no than yes is holding orders to watch the price.' },
  { key: 'lp_slippage_spread_share', dimension: 'slipping', label: 'Slippage, share of spread', unit: 'share',
    hint: 'Fill against the quote at send, cost to the broker, as a share of the spread at send.' },
  { key: 'slippage_symmetry', dimension: 'slipping', label: 'Slippage in our favour', unit: 'share',
    hint: 'Of the fills that slipped, the share that went the broker’s way. An honest LP is near half.' },
  { key: 'slippage_p95_spread_share', dimension: 'slipping', label: 'Bad tail (p95), share of spread', unit: 'share',
    hint: 'The worst 5% of fills: slippage at the 95th percentile, as a share of the spread.' },
  { key: 'lp_latency_p95_ms', dimension: 'slow', label: 'LP latency p95', unit: 'ms',
    hint: 'Order sent → final answer. Taiga’s own time is not in it.' },
  { key: 'lp_latency_p99_ms', dimension: 'slow', label: 'LP latency p99', unit: 'ms',
    hint: 'The slowest 1% of answers.' },
  { key: 'uptime_pct', dimension: 'availability', label: 'Uptime in trading hours', unit: 'share',
    hint: 'Share of the trading hours with the trading session logged on.' },
  { key: 'disconnects_per_day', dimension: 'availability', label: 'Disconnects per day', unit: 'count',
    hint: 'Session drops per trading day. A bridge stop or deploy is not counted.' },
  { key: 'md_stale_minutes_per_day', dimension: 'availability', label: 'Stale quotes, min per day', unit: 'minutes',
    hint: 'Minutes per trading day its market data was up but its quotes were older than 60 s.' },
  { key: 'taiga_latency_p95_ms', dimension: 'broker_own', label: 'Taiga’s own time p95', unit: 'ms',
    hint: 'Deal seen → order sent: the broker’s own part of the delay. Never in the LP’s level.' },
];

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m] as const));

export function metricDef(key: string, dimension = ''): MetricDef {
  return METRIC_BY_KEY.get(key) ?? {
    key, dimension, unit: 'count', hint: '',
    label: key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
  };
}

// ── Formatting ───────────────────────────────────────────────

/** A fraction as a percentage, with the digits a small share needs. */
export function fmtFrac(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const p = v * 100;
  const a = Math.abs(p);
  const trim = (t: string) => t.replace(/\.?0+$/, '');
  if (a !== 0 && a < 1) return `${p.toFixed(2)}%`;
  if (a < 10) return `${p.toFixed(1)}%`;
  // Near 100% the decimals carry the meaning: 99.9% uptime is not 100%.
  if (a >= 99 && a < 100) return `${trim(p.toFixed(2))}%`;
  return `${trim(p.toFixed(1))}%`;
}

export function fmtMetric(unit: Unit, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  switch (unit) {
    case 'share': return fmtFrac(v);
    case 'ms': return v >= 10_000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v).toLocaleString('en-US')} ms`;
    case 'ratio': return `${v < 10 ? v.toFixed(1) : Math.round(v)}×`;
    case 'minutes': return `${v < 10 ? v.toFixed(1) : Math.round(v)} min`;
    default: return v % 1 === 0 ? v.toLocaleString('en-US') : v.toFixed(1);
  }
}

export function fmtMs(v: number | null | undefined): string {
  return fmtMetric('ms', v);
}

export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('en-US');
}

/** "3.4×" — the LP against the median of its group. */
export function fmtX(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}×`;
}

export const PERIODS: Array<{ id: LiqPeriod; label: string; long: string }> = [
  { id: 'live',  label: 'Live',  long: 'last hour' },
  { id: 'today', label: 'Today', long: 'today' },
  { id: '7d',    label: '7 d',   long: 'last 7 days' },
  { id: 'mtd',   label: 'MTD',   long: 'month to date' },
  { id: '30d',   label: '30 d',  long: 'last 30 days' },
];

export function periodText(p: LiqPeriod): string {
  return PERIODS.find((x) => x.id === p)?.long ?? p;
}

export const GROUP_LABEL: Record<LiqGroup, string> = { real: 'Real LPs', test: 'Test LPs' };

// ── Levels ───────────────────────────────────────────────────

const LEVEL_RANK: Record<LiqLevel, number> = { LOW: 0, WARNING: 1, HIGH: 2, CRITICAL: 3 };

export function bandOf(l: LiqLevel | null | undefined): Band | null {
  return l ? (l.toLowerCase() as Band) : null;
}

export function levelRank(l: LiqLevel | null | undefined): number {
  return l ? LEVEL_RANK[l] ?? -1 : -1;
}

/**
 * Map heat per level. Low is acceptable: its dot shows, it does not glow, so
 * a dozen acceptable LPs do not merge into a carpet around the one that is not.
 */
export function heatOfLevel(l: LiqLevel | null | undefined): number {
  switch (l) {
    case 'LOW': return 0;
    case 'WARNING': return 0.32;
    case 'HIGH': return 0.64;
    case 'CRITICAL': return 0.9;
    default: return 0;
  }
}

/** Threshold text: "Warning 1% · High 3% · Critical 5%", with "under" when lower is worse. */
export function thresholdText(def: MetricDef, m: LiqMetric | undefined): string {
  const t = m?.thresholds;
  if (!t) return '';
  const under = t.worse === 'LOWER' ? 'under ' : '';
  const f = (v: number) => `${under}${fmtMetric(def.unit, v)}`;
  return `Warning ${f(t.warning)} · High ${f(t.high)} · Critical ${f(t.critical)}`;
}

// ── View ─────────────────────────────────────────────────────

export interface MetricRow { key: string; def: MetricDef; m: LiqMetric }

export interface DimRow { id: string; label: string; level: LiqLevel | null; metrics: MetricRow[] }

export interface LpRow {
  lpId: string;
  name: string;
  isTest: boolean;
  providerType: string | null;
  state: LiqLp['state'] | null;
  openHedges: number | null;
  level: LiqLevel | null;
  reasons: string[];
  drivers: LiqLp['verdict']['drivers'];
  dimensionsHigh: number;
  dims: DimRow[];
  dimById: Map<string, DimRow>;
  brokerOwn: MetricRow | null;
  figures: LiqFigures;
  orders: number;
  tooFew: boolean;
  /** Live only. */
  symbols: LiqLpSymbol[];
  byDay: NonNullable<LiqLp['by_day']>;
}

export interface LiqView {
  period: LiqPeriod;
  asOf: number | null;
  windowSec: number | null;
  group: LiqGroup;
  groups: Record<LiqGroup, number>;
  symbol: string | null;
  minOrders: number | null;
  /** Dimensions present in the payload, in their fixed order. */
  dimensions: string[];
  rows: LpRow[];
  byId: Map<string, LpRow>;
  counts: Record<LiqLevel, number>;
  tooFew: number;
  totals: { orders: number; lpRejects: number; taigaRejects: number; ordersAtRisk: number };
  worst: LpRow | null;
  /** Instruments any LP of the group filled (live payload), for the filter. */
  instruments: string[];
}

function parseMs(text: string | null | undefined): number | null {
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function rowOf(core: LiqLpCore, parent: LiqLp | null): LpRow {
  const dims: DimRow[] = [];
  const present = Object.keys(core.dimensions ?? {});
  const order = [...DIMENSIONS.map((d) => d.id).filter((d) => present.includes(d)), ...present.filter((d) => !DIM_BY_ID.has(d))];
  for (const id of order) {
    const d = core.dimensions[id as LiqDimensionId];
    if (!d) continue;
    const metrics: MetricRow[] = [];
    const keys = Object.keys(d.metrics ?? {});
    const known = METRICS.filter((m) => m.dimension === id && keys.includes(m.key)).map((m) => m.key);
    for (const key of [...known, ...keys.filter((k) => !known.includes(k))]) {
      const m = d.metrics[key];
      if (m) metrics.push({ key, def: metricDef(key, id), m });
    }
    dims.push({ id, label: dimensionLabel(id), level: d.level ?? null, metrics });
  }
  const own = core.broker_own?.taiga_latency_p95_ms;
  const orders = num(core.figures?.orders);
  return {
    lpId: core.lp_id,
    name: core.lp_name || core.lp_id,
    isTest: core.is_test === true,
    providerType: core.provider_type ?? null,
    state: parent?.state ?? null,
    openHedges: typeof parent?.open_hedges === 'number' ? parent.open_hedges : null,
    level: core.verdict?.level ?? null,
    reasons: core.verdict?.reasons ?? [],
    drivers: core.verdict?.drivers ?? [],
    dimensionsHigh: num(core.verdict?.dimensions_high),
    dims,
    dimById: new Map(dims.map((d) => [d.id, d] as const)),
    brokerOwn: own ? { key: 'taiga_latency_p95_ms', def: metricDef('taiga_latency_p95_ms'), m: own } : null,
    figures: core.figures ?? {},
    orders,
    tooFew: core.figures?.enough_orders === false || core.verdict?.level === null,
    symbols: parent?.by_symbol ?? [],
    byDay: parent?.by_day ?? [],
  };
}

export function compareRows(a: LpRow, b: LpRow): number {
  return levelRank(b.level) - levelRank(a.level)
    || b.dimensionsHigh - a.dimensionsHigh
    || a.name.localeCompare(b.name);
}

export function groupOf(lp: { is_test?: boolean }): LiqGroup {
  return lp.is_test ? 'test' : 'real';
}

/** The group shown by default: real LPs, unless there are none. */
export function defaultGroup(p: LiquidityPayload | null): LiqGroup {
  if (!p) return 'real';
  const real = p.lps.filter((l) => !l.is_test).length;
  return real === 0 && p.lps.length > 0 ? 'test' : 'real';
}

/**
 * @param payload  live or history payload (null while none)
 * @param group    real or test LPs: they are never shown together
 * @param symbol   instrument filter. On a live payload the LP's row for that
 *                 symbol is used; a history payload fetched with ?symbol= is
 *                 already filtered by the backend.
 */
export function buildLiqView(payload: LiquidityPayload | null, group: LiqGroup, symbol: string | null): LiqView {
  const groups: Record<LiqGroup, number> = { real: 0, test: 0 };
  for (const lp of payload?.lps ?? []) groups[groupOf(lp)]++;

  const instruments = new Set<string>();
  const rows: LpRow[] = [];
  for (const lp of payload?.lps ?? []) {
    if (groupOf(lp) !== group) continue;
    for (const s of lp.by_symbol ?? []) instruments.add(s.symbol);
    if (symbol && payload?.period === 'live') {
      const s = (lp.by_symbol ?? []).find((x) => x.symbol === symbol);
      if (s) rows.push(rowOf(s, lp));
    } else {
      rows.push(rowOf(lp, lp));
    }
  }
  rows.sort(compareRows);

  const counts: Record<LiqLevel, number> = { LOW: 0, WARNING: 0, HIGH: 0, CRITICAL: 0 };
  let tooFew = 0;
  const totals = { orders: 0, lpRejects: 0, taigaRejects: 0, ordersAtRisk: 0 };
  for (const r of rows) {
    if (r.level) counts[r.level]++; else tooFew++;
    totals.orders += r.orders;
    totals.lpRejects += num(r.figures.lp_rejects);
    totals.taigaRejects += num(r.figures.taiga_rejects);
    if (r.level === 'HIGH' || r.level === 'CRITICAL') totals.ordersAtRisk += r.orders;
  }

  const dimensions = DIMENSIONS.map((d) => d.id).filter((id) => rows.some((r) => r.dimById.has(id)));
  for (const r of rows) for (const d of r.dims) if (!dimensions.includes(d.id)) dimensions.push(d.id);

  return {
    period: payload?.period ?? 'live',
    asOf: parseMs(payload?.as_of),
    windowSec: typeof payload?.window_sec === 'number' ? payload.window_sec : null,
    group,
    groups,
    symbol,
    minOrders: typeof payload?.settings?.min_orders === 'number' ? payload.settings.min_orders : null,
    dimensions: dimensions.length ? dimensions : DIMENSIONS.map((d) => d.id),
    rows,
    byId: new Map(rows.map((r) => [r.lpId, r] as const)),
    counts,
    tooFew,
    totals,
    worst: rows.find((r) => r.level !== null) ?? null,
    instruments: [...instruments].sort(),
  };
}

// ── The verdict in words ─────────────────────────────────────

/** "reject rate 4.1%, 3.4× the median of your real LPs, rank 5 of 5" */
/** "Reject rate" → "reject rate"; "LP latency p95" keeps its capitals. */
export function lowerFirst(text: string): string {
  return /^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export function metricSentence(row: MetricRow, group: LiqGroup): string {
  const { def, m } = row;
  const parts = [`${lowerFirst(def.label)} ${fmtMetric(def.unit, m.value)}`];
  if (m.x_peer_median !== null && m.x_peer_median !== undefined && Number.isFinite(m.x_peer_median)) {
    parts.push(`${fmtX(m.x_peer_median)} the median of your ${group === 'test' ? 'test' : 'real'} LPs`);
  }
  if (m.rank && m.ranked_of) parts.push(`rank ${m.rank} of ${m.ranked_of}`);
  return parts.join(', ');
}

/** Why the LP has its level, one line per reason, worst first. */
export function verdictLines(r: LpRow, group: LiqGroup, minOrders: number | null): string[] {
  const out: string[] = [];
  if (r.level === null) {
    out.push(`Too few orders to judge${minOrders ? ` (under ${minOrders} in the period)` : ''}.`);
    return out;
  }
  if (r.reasons.includes('DISCONNECTED_WITH_OPEN_HEDGES')) {
    out.push(`Disconnected in trading hours while it holds ${r.openHedges ?? 'open'} open hedge${r.openHedges === 1 ? '' : 's'}.`);
  }
  if (r.reasons.includes('TWO_DIMENSIONS_HIGH')) {
    const high = r.dims.filter((d) => levelRank(d.level) >= LEVEL_RANK.HIGH).map((d) => d.label);
    out.push(`${high.length || r.dimensionsHigh} dimensions at High or worse${high.length ? `: ${high.join(' and ')}` : ''}.`);
  }
  const seen = new Set<string>();
  for (const d of [...r.drivers].sort((a, b) => levelRank(b.level) - levelRank(a.level))) {
    const k = `${d.dimension}|${d.metric}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const row = r.dimById.get(d.dimension)?.metrics.find((x) => x.key === d.metric);
    const sentence = row
      ? metricSentence(row, group)
      : `${lowerFirst(metricDef(d.metric).label)} ${fmtMetric(metricDef(d.metric).unit, d.value)}`;
    out.push(`${dimensionLabel(d.dimension)}: ${sentence}.`);
  }
  if (out.length === 0 && r.level === 'LOW') out.push('Every measure is within the acceptable level.');
  return out;
}

// ── Best LP for an instrument ────────────────────────────────

/**
 * The best LP of the group on one instrument, from the live payload: lowest
 * level, then lowest reject rate. Null when no other LP of the group has a
 * level on it.
 */
export function bestLpFor(
  payload: LiquidityPayload | null,
  group: LiqGroup,
  symbol: string,
  exclude: string,
): { lpId: string; name: string; level: LiqLevel; rejectRate: number | null } | null {
  let best: { lpId: string; name: string; level: LiqLevel; rejectRate: number | null } | null = null;
  for (const lp of payload?.lps ?? []) {
    if (groupOf(lp) !== group || lp.lp_id === exclude) continue;
    const s = (lp.by_symbol ?? []).find((x) => x.symbol === symbol);
    const level = s?.verdict?.level;
    if (!s || !level) continue;
    const rr = s.dimensions?.rejecting?.metrics?.reject_rate?.value ?? null;
    if (
      !best
      || LEVEL_RANK[level] < LEVEL_RANK[best.level]
      || (LEVEL_RANK[level] === LEVEL_RANK[best.level] && (rr ?? Infinity) < (best.rejectRate ?? Infinity))
    ) {
      best = { lpId: lp.lp_id, name: lp.lp_name || lp.lp_id, level, rejectRate: rr };
    }
  }
  return best;
}

// ── The map ──────────────────────────────────────────────────

export const KEY_SEP = '|';

export function mapKey(dimension: string, lpId: string): string {
  return `${dimension}${KEY_SEP}${lpId}`;
}

// An LP keeps its place for the session: the n-th LP seen takes the n-th
// point in every region, so it sits at the same spot in each.
const lpOrder: string[] = [];

/** The map: one region per dimension, every LP at the same place in each. */
export function buildLiqMap(dimensions: string[], lpIds: string[]): InstrumentMap {
  for (const id of [...lpIds].sort()) if (!lpOrder.includes(id)) lpOrder.push(id);
  const names = dimensions.map(dimensionLabel);
  const regions = layoutRegions(names);
  const positions = new Map<string, MapPosition>();
  const regionOfKey = new Map<string, string>();
  dimensions.forEach((dim, i) => {
    const region = regions[i];
    if (!region) return;
    for (const id of lpIds) {
      const n = lpOrder.indexOf(id) + 1;
      const u = 0.13 + halton(n, 2) * 0.74;
      const v = 0.36 + halton(n, 3) * 0.44;
      const key = mapKey(dim, id);
      positions.set(key, {
        region: region.name,
        x: region.rect.x + u * region.rect.w,
        y: region.rect.y + v * region.rect.h,
      });
      regionOfKey.set(key, region.name);
    }
  });
  return { regions, positions, regionOf: (k: string) => regionOfKey.get(k) ?? '' };
}

/** Dimension cell of an LP, for the map and the league table. */
export function cellOf(r: LpRow, dimension: string): { level: LiqLevel | null; tooFew: boolean } {
  const d = r.dimById.get(dimension);
  if (!d) return { level: null, tooFew: true };
  const anyValue = d.metrics.some((m) => m.m.value !== null && m.m.value !== undefined);
  return { level: d.level, tooFew: !anyValue || d.level === null };
}

// ── Evidence export ──────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The orders behind a figure as CSV, every field flattened. */
export function ordersCsv(orders: Array<import('@/services/api').LiqOrder>): string {
  const cols: Array<[string, (o: import('@/services/api').LiqOrder) => unknown]> = [
    ['clord_id', (o) => o.clord_id], ['symbol', (o) => o.symbol], ['lp_symbol', (o) => o.lp_symbol],
    ['source', (o) => o.source], ['side', (o) => o.side], ['qty', (o) => o.qty], ['filled_qty', (o) => o.filled_qty],
    ['avg_px', (o) => o.avg_px], ['outcome', (o) => o.outcome], ['lp_reject', (o) => o.lp_reject],
    ['taiga_reject', (o) => o.taiga_reject], ['timed_out', (o) => o.timed_out], ['reason', (o) => o.reason],
    ['deal', (o) => o.times?.deal], ['seen', (o) => o.times?.seen], ['built', (o) => o.times?.built],
    ['sent', (o) => o.times?.sent], ['ack', (o) => o.times?.ack], ['answer', (o) => o.times?.answer],
    ['timeout', (o) => o.times?.timeout],
    ['lp_ms', (o) => o.latency_ms?.lp], ['lp_ack_ms', (o) => o.latency_ms?.lp_ack], ['taiga_ms', (o) => o.latency_ms?.taiga],
    ['end_to_end_ms', (o) => o.latency_ms?.end_to_end],
    ['quote_source', (o) => o.quote?.source], ['quote_bid', (o) => o.quote?.bid], ['quote_ask', (o) => o.quote?.ask],
    ['quote_age_ms', (o) => o.quote?.age_ms],
    ['slippage_price', (o) => o.slippage?.price], ['slippage_spread_share', (o) => o.slippage?.spread_share],
    ['slippage_bps', (o) => o.slippage?.bps],
  ];
  const head = cols.map(([h]) => h).join(',');
  const lines = orders.map((o) => cols.map(([, f]) => csvCell(f(o))).join(','));
  return [head, ...lines].join('\n');
}
