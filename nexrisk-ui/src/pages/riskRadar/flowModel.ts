// ============================================
// Risk Radar — Flow toxicity layer model (phase 1)
//
// Turns one radar.flow.symbols payload into what the page shows. Pure
// functions only, like model.ts.
//
// THE MEASURE (docs/NexRisk_Risk_Radar_Flow_API.md v1.0):
//   per instrument, over the backend's rolling window (default 60 min),
//   client flow in USD notional, both platforms, and the part of it from
//   accounts whose latest classification is toxic (the broker's
//   `toxic_classes`, each with its own minimum confidence and, for news,
//   a minimum risk-matrix level).
//   Colour = b_toxic_share: toxic flow the broker keeps in the B-Book, as a
//   share of its B-Book flow. Toxic flow sent to the A-Book is hedged.
//
// NOTHING IS GUESSED:
//   no_b_flow     — flow in the window, but none of it in the B-Book: the
//                   share has no denominator, so no colour;
//   unclassified  — accounts with no classification (or INSUFFICIENT_DATA /
//                   UNKNOWN) are never flagged; their flow is shown apart so
//                   "not classified" is never read as "clean".
//
// PLATFORMS:
//   The colour is always measured on both platforms together: the payload
//   gives the cTrader part of the flow, not of the B-Book flow. The MT5 /
//   cTrader views show the instruments that platform traded, with that
//   platform's own flow beside the whole figure.
// ============================================

import type { FlowPayload, FlowSymbolRow } from '@/services/api';
import { bandOf, heatOf, type Band, type Platform, type PlatformScope, type Thresholds } from './model';

export type FlowState = 'rated' | 'no_b_flow';

export interface FlowClassPart {
  cls: string;
  flowUsd: number;
  fills: number;
  accounts: number;
  /** In the broker's toxic set (a flagged account of it still needs the confidence / level). */
  toxicClass: boolean;
}

export interface FlowSymbol {
  symbol: string;
  state: FlowState;
  band: Band | null;
  heat: number;
  /** 1-based rank by flagged B-Book flow among instruments that have some. */
  rank: number | null;

  /** b_toxic_share, 0..1; null without B-Book flow. */
  bShare: number | null;
  /** toxic_share, all books, 0..1; null without flow. */
  share: number | null;

  flowUsd: number;
  flaggedUsd: number;
  bFlowUsd: number;
  bFlaggedUsd: number;
  fills: number;
  flaggedFills: number;
  unpricedFills: number;
  accounts: number;
  flaggedAccounts: number;
  unclassifiedAccounts: number;
  unclassifiedUsd: number;
  /** unclassified flow ÷ flow, 0..1; null without flow. */
  unclassifiedShare: number | null;

  /** Per platform: all-books flow and its flagged part. */
  parts: Array<{ platform: Platform; flowUsd: number; flaggedUsd: number }>;
  byClass: FlowClassPart[];
}

export interface FlowView {
  asOf: number | null;
  windowSec: number | null;
  thresholds: Thresholds;
  /** The toxic set in force, as the backend echoes it. */
  toxicClasses: Array<{ cls: string; minConfidence: number | null; minRiskLevel: string | null }>;
  platforms: Platform[];
  symbols: FlowSymbol[];
  bySymbol: Map<string, FlowSymbol>;
  /** Instruments traded in the window that the platform chosen leaves out. */
  hiddenByScope: number;
  /** Whole book, both platforms (the payload's totals). */
  totals: {
    flowUsd: number; flaggedUsd: number; bFlowUsd: number; bFlaggedUsd: number;
    share: number | null; bShare: number | null;
    fills: number; flaggedFills: number; unpricedFills: number;
    accounts: number; flaggedAccounts: number; unclassifiedAccounts: number;
    unclassifiedUsd: number;
  };
  bookBand: Band | null;
  bandCounts: Record<Band, number>;
  rated: number;
  noBFlow: number;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseTime(text: unknown): number | null {
  if (typeof text !== 'string' || !text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

export function flowThresholds(payload: FlowPayload | null): Thresholds {
  const b = payload?.bands;
  if (!b) return DEFAULT_FLOW_THRESHOLDS;
  const w = num(b.warning_pct) / 100, h = num(b.high_pct) / 100, c = num(b.critical_pct) / 100;
  return w > 0 && w < h && h <= c ? { warning: w, high: h, critical: c } : DEFAULT_FLOW_THRESHOLDS;
}

/** The backend's documented defaults (placeholders until Ross sets them). */
export const DEFAULT_FLOW_THRESHOLDS: Thresholds = { warning: 0.10, high: 0.25, critical: 0.40 };


function toPlatform(v: unknown): Platform | null {
  if (v === 'MT5') return 'MT5';
  if (typeof v === 'string' && /ctrader/i.test(v)) return 'CTRADER';
  return null;
}

function rowOf(r: FlowSymbolRow, t: Thresholds, toxic: Set<string>): FlowSymbol {
  const flowUsd = num(r.flow_usd);
  const bShare = optNum(r.b_toxic_share);
  const ctFlow = num(r.flow_usd_ctrader);
  const ctFlagged = num(r.flagged_flow_usd_ctrader);
  const flaggedUsd = num(r.flagged_flow_usd);
  const parts: FlowSymbol['parts'] = [];
  if (flowUsd - ctFlow > 0.5) parts.push({ platform: 'MT5', flowUsd: flowUsd - ctFlow, flaggedUsd: Math.max(0, flaggedUsd - ctFlagged) });
  if (ctFlow > 0.5) parts.push({ platform: 'CTRADER', flowUsd: ctFlow, flaggedUsd: ctFlagged });

  const byClass: FlowClassPart[] = Object.entries(r.by_class ?? {})
    .map(([cls, v]) => ({ cls, flowUsd: num(v?.flow_usd), fills: num(v?.fills), accounts: num(v?.accounts), toxicClass: toxic.has(cls) }))
    .sort((a, b) => b.flowUsd - a.flowUsd || a.cls.localeCompare(b.cls));

  const unclassifiedUsd = num(r.unclassified_flow_usd);
  return {
    symbol: r.symbol,
    state: bShare === null ? 'no_b_flow' : 'rated',
    band: bShare === null ? null : bandOf(bShare, t),
    heat: bShare === null ? 0 : heatOf(bShare, t),
    rank: null,
    bShare,
    share: optNum(r.toxic_share),
    flowUsd,
    flaggedUsd,
    bFlowUsd: num(r.b_flow_usd),
    bFlaggedUsd: num(r.b_flagged_flow_usd),
    fills: num(r.fills),
    flaggedFills: num(r.flagged_fills),
    unpricedFills: num(r.unpriced_fills),
    accounts: num(r.accounts),
    flaggedAccounts: num(r.flagged_accounts),
    unclassifiedAccounts: num(r.unclassified_accounts),
    unclassifiedUsd,
    unclassifiedShare: flowUsd > 0 ? unclassifiedUsd / flowUsd : null,
    parts,
    byClass,
  };
}

function inScope(s: FlowSymbol, scope: PlatformScope): boolean {
  return scope === 'ALL' || s.parts.some((p) => p.platform === scope);
}

export function buildFlowView(payload: FlowPayload | null, scope: PlatformScope): FlowView {
  const t = flowThresholds(payload);
  const toxicEntries = Object.entries(payload?.toxic_classes ?? {});
  const toxic = new Set(toxicEntries.map(([k]) => k));
  const all = (payload?.by_symbol ?? [])
    .filter((r) => r && typeof r.symbol === 'string' && r.symbol)
    .map((r) => rowOf(r, t, toxic));
  const symbols = all.filter((s) => inScope(s, scope));

  // Most flagged B-Book flow first, then instruments with B-Book flow and
  // nothing flagged (by flow), then those with no B-Book flow.
  symbols.sort((a, b) =>
    Number(b.bFlaggedUsd > 0) - Number(a.bFlaggedUsd > 0) ||
    b.bFlaggedUsd - a.bFlaggedUsd ||
    Number(a.state === 'no_b_flow') - Number(b.state === 'no_b_flow') ||
    b.flowUsd - a.flowUsd ||
    a.symbol.localeCompare(b.symbol),
  );

  const bandCounts: Record<Band, number> = { low: 0, warning: 0, high: 0, critical: 0 };
  let rank = 0, rated = 0, noBFlow = 0;
  for (const s of symbols) {
    if (s.bFlaggedUsd > 0) s.rank = ++rank;
    if (s.band) bandCounts[s.band]++;
    if (s.state === 'rated') rated++; else noBFlow++;
  }

  const tt = payload?.totals;
  const bShare = optNum(tt?.b_toxic_share);
  return {
    asOf: parseTime(payload?.as_of),
    windowSec: optNum(payload?.window_sec),
    thresholds: t,
    toxicClasses: toxicEntries.map(([cls, v]) => ({
      cls,
      minConfidence: optNum(v?.min_confidence),
      minRiskLevel: typeof v?.min_risk_level === 'string' ? v.min_risk_level : null,
    })),
    platforms: (payload?.platforms ?? []).map(toPlatform).filter((p): p is Platform => p !== null),
    symbols,
    bySymbol: new Map(symbols.map((s) => [s.symbol, s] as const)),
    hiddenByScope: all.length - symbols.length,
    totals: {
      flowUsd: num(tt?.flow_usd), flaggedUsd: num(tt?.flagged_flow_usd),
      bFlowUsd: num(tt?.b_flow_usd), bFlaggedUsd: num(tt?.b_flagged_flow_usd),
      share: optNum(tt?.toxic_share), bShare,
      fills: num(tt?.fills), flaggedFills: num(tt?.flagged_fills), unpricedFills: num(tt?.unpriced_fills),
      accounts: num(tt?.accounts), flaggedAccounts: num(tt?.flagged_accounts),
      unclassifiedAccounts: num(tt?.unclassified_accounts), unclassifiedUsd: num(tt?.unclassified_flow_usd),
    },
    bookBand: bShare === null ? null : bandOf(bShare, t),
    bandCounts,
    rated,
    noBFlow,
  };
}

/** Whole-book B-Book toxic share of a payload (for the observed-history line). */
export function bookShareOf(payload: FlowPayload): number {
  return optNum(payload.totals?.b_toxic_share) ?? 0;
}

/** One instrument's B-Book toxic share in a payload; 0 when absent. */
export function shareOf(payload: FlowPayload, symbol: string): number {
  const r = payload.by_symbol?.find((x) => x.symbol === symbol);
  return optNum(r?.b_toxic_share) ?? 0;
}

/** "60 min", "4 h", "24 h". */
export function fmtWindow(sec: number | null): string {
  if (sec === null || !(sec > 0)) return '—';
  if (sec % 3600 === 0) return `${sec / 3600} h`;
  return `${Math.round(sec / 60)} min`;
}

/** Classifier names in plain words. */
export function classLabel(cls: string | null | undefined): string {
  if (!cls) return 'Not classified';
  const map: Record<string, string> = {
    ARBITRAGE: 'Arbitrage', REBATE_ABUSE: 'Rebate abuse', NEWS_TRADER: 'News trader',
    SCALPER: 'Scalper', EA_SCALPER: 'EA scalper', EA_TRADER: 'EA trader', EA_BOT: 'EA bot',
    MANUAL: 'Manual', DAY_TRADER: 'Day trader', SWING_TRADER: 'Swing trader',
    INSUFFICIENT_DATA: 'Too few trades', UNKNOWN: 'Unknown',
  };
  return map[cls] ?? cls.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
