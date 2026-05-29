/**
 * NetExposure.tsx — Net Exposure page
 *
 * This page is PURE WEBSOCKET. REST is used only for one-shot bootstrap on
 * mount and on LP change; every subsequent position and price update arrives
 * via WebSocket.
 *
 * Exposure grid data sources:
 *   B-Book rows:        REST bootstrap via mt5Api, then /ws/v1/mt5/events.
 *                       Initial SNAPSHOT frame is a full replacement; subsequent
 *                       POSITION_* events upsert/remove in place.
 *   Coverage Book rows: REST bootstrap at GET /api/v1/fix/positions/{lp_id}
 *                       (v3 flat path — same endpoint CBookPage uses; the
 *                       nested /fix/lp/{id}/positions legacy path does not
 *                       return the full operational set). Combines Terminal +
 *                       DOM Trader + Hedging Strategies into a single LP-side
 *                       net per symbol. Subsequent updates arrive as
 *                       POSITION_REPORT / POSITION_CLOSED / POSITION_UPDATED
 *                       on the shared FIX WebSocket. Closed-position tombstones
 *                       from CBookPage (localStorage 'nexrisk_closed_positions')
 *                       are honoured so just-closed positions don't ghost back.
 *   Live prices:        MD depth:1 subscribed for every symbol with an open
 *                       position. FIX WS feeds currentPricesRef; the exposure
 *                       aggregation re-runs on every tick so Mkt Px and Broker
 *                       P/L update in real time. Symbol-group rows sum child
 *                       values (aggFunc:'sum') — hedged symbols net to zero.
 *   Sign convention:    Net Vol as the user sees it on screen.
 *                       B-Book row        = broker's side of the internal book
 *                                           (inverse of client direction).
 *                       Coverage Book row = broker's actual LP position direction.
 *                       On a fully hedged symbol the two rows are equal in
 *                       magnitude, opposite in sign, and the symbol-group
 *                       parent row (aggFunc:'sum') reads zero.
 *
 * DOM Trader: same FIX WS stream, plus a depth-10 MD subscription for the
 *             selected DOM symbol driving the book-depth panel.
 *   Order entry:  POST /api/v1/fix/order — fill confirmation arrives as
 *                 POSITION_REPORT; no explicit refresh needed.
 *
 * Intraday Monitor: NexDay prediction panel (unchanged).
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { mt5Api, type MT5PositionWithNode, type MT5NodeAPI } from '@/services/api';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  RowClickedEvent,
  GridReadyEvent,
  FirstDataRenderedEvent,
  GridSizeChangedEvent,
  ColumnVisibleEvent,
  ColumnResizedEvent,
  ColumnRowGroupChangedEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ======================
// CONSTANTS / FETCH
// ======================
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
const WS_BASE  = (import.meta as any).env?.VITE_WS_URL  || 'ws://localhost:8080';
const FIX_WS_PATH = '/ws/v1/fix/events';

async function bff<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function nexdayFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ======================
// THEME — matches BBookPage (the definitive styling reference).
// No page-wide fontFamily override; Quartz's default sans (Inter) keeps
// column headers out of monospace. Per-cell numeric formatting uses the
// 'font-mono' Tailwind class in column defs below.
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#232326',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontSize: 14,
  foregroundColor: '#FFF',
  headerFontSize: 14,
});

// ======================
// TYPES
// ======================
interface HedgeExposureRow {
  id: string;
  // Display symbol — what the leaf row's Symbol cell shows. For B-Book leaves,
  // this is the broker-side mt5_symbol (e.g. 'Gold' on Highness MT5). For
  // Coverage leaves, this is the LP-side lp_symbol (e.g. 'XAUUSD' on TE) —
  // the leaf row identifies the venue-specific instrument as it actually
  // exists on that venue's books.
  symbol: string;
  // Grouping key — drives AG Grid's row grouping so that B-Book and Coverage
  // legs of the same logical instrument fall under one parent. For B-Book
  // this is the same as `symbol`. For Coverage with an active LP mapping
  // (e.g. TE 'XAUUSD' → MT5 'Gold'), this is the mapped mt5_symbol; for
  // Coverage with no mapping it equals `symbol` as a passthrough.
  groupSymbol: string;
  lp: string;
  lpAccount: string;
  clientNetVol: number;
  hedgeNetVol: number;
  brokerNetVol: number;
  clientNetNotional: number;
  hedgeNetNotional: number;
  brokerNetNotional: number;
  avgPrice: number;
  brokerFloatingPL: number;
  unhedgedLots: number;
  breakEvenPrice: number;
  probableIdp30: 'Up' | 'Down' | 'Neutral';
  bevh: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  marketMovePercent: number;
  plImpact: number;
  isBBook: boolean;
}

interface FIXPosition {
  position_id: string;
  account: string;
  symbol: string;
  open_price: number;
  long_qty: number;
  short_qty: number;
  net_qty: number;
  side: string;
  commission: number;
  swap: number;
  received_ts: number;
  unrealized_pnl?: number;
  current_price?: number;
}

interface FIXLpEntry {
  lp_id: string;
  lp_name: string;
  state: string;
  provider_type: string;
}

// Subset of the LP-mapping row shape served by GET /api/v1/symbol-mappings
// (the BFF route that proxies to C++ /api/v1/mappings/lp). Mirrors
// SymbolMapping.tsx's LPMapping interface for the fields this page needs:
// the join key (lp_id, lp_symbol) and the canonical mt5_symbol it points
// to, plus `enabled` so disabled rows don't influence grouping.
//
// Note: SymbolMapping.tsx's interface declares an `approved: boolean` but
// the C++ API does not currently emit that field. Filtering on `enabled`
// alone matches what the backend exposes.
interface LPMapping {
  id:           number;
  mt5_symbol:   string;
  lp_id:        string;
  lp_name:      string;
  lp_symbol:    string;
  enabled:      boolean;
}

// Backend-sourced Coverage-side daily aggregates (same endpoint CBookPage uses).
// realized_pnl persists across the day even when all positions close — that's
// exactly the property the header bar needs.
interface DailyStats {
  trade_date:     string;
  realized_pnl:   number;
  commission:     number;
  swap_long:      number | null;
  swap_short:     number | null;
  swap_net:       number;
  position_count: number;
}

// Client-side fallback for B-Book realised P/L. The MT5 backend doesn't expose
// a daily-stats equivalent yet, so we accumulate closed-position P/L into this
// structure on every POSITION_DELETE event, using the last-known P/L snapshot
// captured just before the delete. Persisted to localStorage keyed by trade_date
// so the header bar survives page refreshes within a trading day. Clears on
// rollover (detected via DailyStats.trade_date advancing).
interface BBookDayStats {
  trade_date:     string;
  realized_pnl:   number;
  closed_count:   number;
}

interface FIXInstrument {
  symbol: string;
  security_id: string;
  currency: string;
  description: string;
  instrument_group: string;
  min_trade_vol: number;
  max_trade_vol: number;
  price_precision: number;
  has_trade_route: boolean;
  trade_route: string;
}

interface FIXCapabilities {
  lp_id: string;
  order_types: string[];
  time_in_force: string[];
  max_order_qty: number;
  min_order_qty: number;
  custom_fields: { sl_tp?: boolean; product_type?: boolean; open_close?: boolean };
}

interface FIXLpStatus {
  lp_id: string;
  state: string;
  trading_session: { state: string; active_orders: number; positions_loaded: number; instruments_loaded: number };
  md_session: { state: string };
}

interface BookLevel { price: number; size: number; }

interface BookData {
  symbol: string;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
  last_update_ts: number;
}

interface FIXOrderResp { success: boolean; clord_id?: string; error?: string; }

interface ExecEntry {
  clord_id: string;
  ts: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  orderType: string;
  tif: string;
  lpId: string;
  status: 'SENT' | 'REJECTED';
  rejectReason?: string;
}

interface PredictionRow {
  id: string;
  symbol: string;
  targetTime: string;
  pred15High: number; pred15Trend: 'Up' | 'Down' | 'Neutral'; pred15Low: number;
  pred30High: number; pred30Trend: 'Up' | 'Down' | 'Neutral'; pred30Low: number;
  pred1hHigh: number; pred1hTrend: 'Up' | 'Down' | 'Neutral'; pred1hLow: number;
  pred2hHigh: number; pred2hTrend: 'Up' | 'Down' | 'Neutral'; pred2hLow: number;
}

// ======================
// SEED / CONSTANTS
// ======================
const SEED_LPS: FIXLpEntry[] = [
  { lp_id: 'traderevolution', lp_name: 'TraderEvolution', state: 'CONNECTED', provider_type: 'traderevolution' },
];

const DOM_DEPTH = 5;

// ── Big-figure price (mirrors FxAskCell typography) ──────────────────────────
// handle (white, smaller) · pip pair (accent, large) · pipette (accent, sup).
// Precision-aware: >=3 → handle|pip|pipette; ==2 → handle|pip; <2 → handle only.
// Used in the DOM Trader Market Depth panel so the sensitive (last) digits read
// the same way they do in the reserved FX cells.
function BigFigurePrice({
  price, precision, accent, handlePx, pipPx, pipettePx,
}: {
  price: number; precision: number; accent: string;
  handlePx: number; pipPx: number; pipettePx: number;
}) {
  const fixed = price.toFixed(Math.max(0, precision));
  let handle = fixed, pip = '', pipette: string | null = null;
  if (precision >= 3)       { handle = fixed.slice(0, -3); pip = fixed.slice(-3, -1); pipette = fixed.slice(-1); }
  else if (precision === 2) { handle = fixed.slice(0, -2); pip = fixed.slice(-2); }
  return (
    <span className="font-mono" style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#fff', fontSize: handlePx }}>{handle}</span>
      {pip && <span style={{ color: accent, fontSize: pipPx, fontWeight: 600 }}>{pip}</span>}
      {pipette && <sup style={{ color: accent, fontSize: pipettePx, fontWeight: 600, marginLeft: 1 }}>{pipette}</sup>}
    </span>
  );
}

// ======================
// BOOK HELPERS — exact copy from CBookPage
// ======================
function buildBookFromMaps(
  symbol: string,
  bidsMap: Map<number, number>,
  asksMap: Map<number, number>,
): BookData | null {
  const bids: BookLevel[] = [...bidsMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => b.price - a.price)
    .slice(0, DOM_DEPTH);
  const asks: BookLevel[] = [...asksMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => a.price - b.price)
    .slice(0, DOM_DEPTH);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  if (bestBid == null || bestAsk == null) return null;
  return { symbol, best_bid: bestBid, best_ask: bestAsk, spread: +(bestAsk - bestBid).toFixed(5), bids, asks, last_update_ts: Date.now() };
}

function primeBookFromRest(data: any, bidsMap: Map<number, number>, asksMap: Map<number, number>): void {
  if (!data) return;
  let rawBids: any[] = data.bids || [];
  let rawAsks: any[] = data.asks || [];
  const refBid: number | null = data.best_bid ?? null;
  const refAsk: number | null = data.best_ask ?? null;
  if (refBid != null && refAsk != null && refBid > refAsk) [rawBids, rawAsks] = [rawAsks, rawBids];
  bidsMap.clear(); asksMap.clear();
  for (const b of rawBids) if (b.price && b.size) bidsMap.set(Number(b.price), Number(b.size));
  for (const a of rawAsks) if (a.price && a.size) asksMap.set(Number(a.price), Number(a.size));
}

function applyBookMessage(data: any, type: string, bidsMap: Map<number, number>, asksMap: Map<number, number>): boolean {
  if (!data) return false;
  const isSnapshot    = type === 'MARKET_DATA_SNAPSHOT' || type === 'MD_SNAPSHOT';
  const isIncremental = type === 'MARKET_DATA_INCREMENTAL' || type === 'MD_INCREMENTAL';
  if (!isSnapshot && !isIncremental) return false;
  if (isSnapshot) { primeBookFromRest(data, bidsMap, asksMap); return bidsMap.size > 0 || asksMap.size > 0; }
  if (Array.isArray(data.entries) && data.entries.length > 0) {
    for (const e of data.entries) {
      const map = (e.entry_type === 'BID') ? bidsMap : asksMap;
      if (e.action === 'DELETE' || e.size === 0) map.delete(Number(e.price));
      else map.set(Number(e.price), Number(e.size));
    }
    return true;
  }
  let rawBids: any[] = data.bids || [];
  let rawAsks: any[] = data.asks || [];
  const refBid: number | null = data.best_bid ?? null;
  const refAsk: number | null = data.best_ask ?? null;
  if (refBid != null && refAsk != null && refBid > refAsk) [rawBids, rawAsks] = [rawAsks, rawBids];
  bidsMap.clear(); asksMap.clear();
  let mutated = false;
  for (const b of rawBids) if (b.price != null && b.size != null) { bidsMap.set(Number(b.price), Number(b.size)); mutated = true; }
  for (const a of rawAsks) if (a.price != null && a.size != null) { asksMap.set(Number(a.price), Number(a.size)); mutated = true; }
  return mutated;
}

// ======================
// B-BOOK AGGREGATOR
// ======================
// Class flags for an MT5 symbol — drives lotSize/pipValue lookup. Built from
// LP mappings: a broker-specific name like 'Gold' on the MT5 server can be
// resolved to 'XAUUSD' (its lp_symbol counterpart) which we then classify on
// .includes('XAU'). Without this lookup, 'Gold'.includes('XAU') is false and
// the symbol falls into the FX-default branch (lotSize=100,000), so 1.06 lots
// of Gold renders as 106,000 units instead of the correct 106 oz.
type Mt5SymbolClass = { isJPY: boolean; isXAU: boolean; isBTC: boolean };

function aggregateBBookPositions(
  positions: MT5PositionWithNode[],
  lpLabel: string,
  mt5SymbolClass?: Map<string, Mt5SymbolClass>,
): HedgeExposureRow[] {
  if (!positions.length) return [];
  const riskLevels: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  // bidSample / askSample: the latest non-zero price_current observed in this
  // bucket from a BUY position (= current Bid, close-at-bid) and from a SELL
  // position (= current Ask, close-at-ask) respectively. These drive the live
  // Mkt Px below — Mkt Px is the actual close-out market price for the
  // broker's net position, NOT a volume-weighted average.
  const bySymbol = new Map<string, {
    netVol: number; totalProfit: number; totalSwap: number; totalComm: number;
    weightedOpenPriceSum: number; totalVolForPrice: number;
    bidSample: number; askSample: number;
  }>();
  for (const p of positions) {
    const sign = p.action === 'BUY' ? 1 : -1;
    const vol  = p.volume_lots * sign;
    const cur  = bySymbol.get(p.symbol);
    // BUY position's price_current = current Bid (broker closes a client BUY at Bid).
    // SELL position's price_current = current Ask (broker closes a client SELL at Ask).
    const isBuy = p.action === 'BUY';
    const hasPx = p.price_current > 0;
    if (cur) {
      cur.netVol += vol; cur.totalProfit += p.profit; cur.totalSwap += p.swap; cur.totalComm += p.commission;
      cur.weightedOpenPriceSum += p.price_open * p.volume_lots;
      cur.totalVolForPrice     += p.volume_lots;
      if (hasPx) {
        if (isBuy) cur.bidSample = p.price_current;
        else       cur.askSample = p.price_current;
      }
    } else {
      bySymbol.set(p.symbol, {
        netVol: vol, totalProfit: p.profit, totalSwap: p.swap, totalComm: p.commission,
        weightedOpenPriceSum: p.price_open * p.volume_lots,
        totalVolForPrice: p.volume_lots,
        bidSample: (isBuy  && hasPx) ? p.price_current : 0,
        askSample: (!isBuy && hasPx) ? p.price_current : 0,
      });
    }
  }
  const rows: HedgeExposureRow[] = [];
  let idx = 0;
  bySymbol.forEach((data, symbol) => {
    // Class detection: prefer the LP-mapping-derived class (handles broker-
    // specific names like 'Gold' → XAU). Fall back to the substring heuristic
    // for symbols that don't have a mapping (e.g. NDX100, native EURUSD, etc.).
    const cls = mt5SymbolClass?.get(symbol);
    const isJPY = cls?.isJPY ?? symbol.includes('JPY');
    const isXAU = cls?.isXAU ?? symbol.includes('XAU');
    const isBTC = cls?.isBTC ?? symbol.includes('BTC');
    const lotSize  = isXAU ? 100 : isBTC ? 1 : 100000;
    const pipValue = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
    const breakEvenPrice = data.totalVolForPrice > 0 ? data.weightedOpenPriceSum / data.totalVolForPrice : 0;
    const clientNetVol  = Math.round(data.netVol * 100) / 100;
    // Net Vol convention on this page — signs are what the user sees on screen:
    //   B-Book row:        broker's side of the internal book = INVERSE of client direction.
    //                      Client sold 500K  → B-Book shows BUY  +500K (broker is long).
    //                      Client bought 500K → B-Book shows SELL -500K (broker is short).
    //   Coverage Book row: broker's actual LP position direction (signed as placed).
    //                      Broker sold 500K on LP → Coverage shows SELL -500K.
    // When the broker is fully hedged, the two signs are opposites of equal magnitude,
    // so the symbol-group parent (aggFunc:'sum') reads zero.
    const brokerNetVol  = Math.round(-clientNetVol * 100) / 100;
    // Mkt Px: live close-out market price for the broker's net position.
    //   +brokerNetVol (broker is long)   → BID  (broker closes by selling at bid)
    //   −brokerNetVol (broker is short)  → ASK  (broker closes by buying at ask)
    //   net flat                         → BID by convention
    // bidSample/askSample refresh tick-to-tick because PositionPnLBroadcaster
    // re-publishes every position's price_current on every tick (BUY→bid, SELL→ask).
    // If the bucket has only one side (e.g. every client is long on this symbol so
    // there are no client SELL positions to source Ask from), fall back to the side
    // that is available — a same-side close-out price is still informative.
    let mktPx: number;
    if (brokerNetVol > 0) {
      mktPx = data.bidSample > 0 ? data.bidSample : data.askSample;
    } else if (brokerNetVol < 0) {
      mktPx = data.askSample > 0 ? data.askSample : data.bidSample;
    } else {
      mktPx = data.bidSample > 0 ? data.bidSample : data.askSample;
    }
    const clientNetNotional = Math.round(clientNetVol * lotSize);
    const brokerNetNotional = Math.round(brokerNetVol * lotSize);
    const unhedgedLots = Math.abs(brokerNetVol);
    const brokerFloatingPL = Math.round(-(data.totalProfit + data.totalSwap + data.totalComm) * 100) / 100;
    const riskIdx = unhedgedLots > 5 ? 3 : unhedgedLots > 2 ? 2 : unhedgedLots > 0.5 ? 1 : 0;
    rows.push({
      id: `bbook-${symbol}-${idx++}`,
      // B-Book: display symbol IS the mt5 symbol (broker's name) AND the
      // grouping key. They're identical because there's no LP-side rename
      // for B-Book — Highness's MT5 server uses 'Gold', and the broker-
      // side risk view groups by 'Gold'.
      symbol, groupSymbol: symbol,
      lp: lpLabel, lpAccount: 'Internal',
      clientNetVol, hedgeNetVol: 0, brokerNetVol,
      clientNetNotional, hedgeNetNotional: 0, brokerNetNotional,
      avgPrice: Math.round(mktPx * 100000) / 100000,
      brokerFloatingPL, unhedgedLots,
      breakEvenPrice: Math.round(breakEvenPrice * 100000) / 100000,
      probableIdp30: 'Neutral', bevh: Math.round(unhedgedLots * 100) / 100,
      riskLevel: riskLevels[riskIdx], marketMovePercent: 0,
      plImpact: Math.round(unhedgedLots * lotSize * 0.001 * pipValue * 100) / 100,
      isBBook: true,
    });
  });
  return rows;
}

// ======================
// COVERAGE BOOK AGGREGATOR
// Aggregates real open FIX/LP positions into one exposure row per symbol.
// Takes a livePrices map (symbol+':bid'/:ask → price) built from MD ticks so
// Mkt Px and Broker P/L reflect the current market, not the stale per-position
// snapshot fields (which TE sandbox does not populate reliably).
// ======================
// Per-symbol latch for the missing-instrMap warning — entries are added the
// first time we see a Coverage position whose lp_symbol has no entry in the
// instruments map. When this fires for a symbol, the aggregator falls back
// to the FX-default min_trade_vol=100000 / lotSize=100000, which only
// happens to be correct when TE actually uses 100000 as min_trade_vol for
// that symbol. The fix lives upstream — the FIX bridge needs to surface
// ALL traded symbols via /api/v1/fix/lp/{lpId}/instruments — but until
// that's done, the warning lets the operator see at a glance which
// positions are at risk of mis-conversion.
const _missingInstrMapWarned = new Set<string>();

function aggregateCoverageBookPositions(
  positions: FIXPosition[],
  lpId: string,
  lpDisplayName: string,
  instrMap: Record<string, FIXInstrument>,
  livePrices: Map<string, number>,
  lpToMt5Map?: Map<string, string[]>,
): HedgeExposureRow[] {
  // ── Symbol mapping translation ────────────────────────────────────────
  // A Coverage position lives on the LP-side symbol (e.g. 'XAUUSD' on
  // TraderEvolution). The Net Exposure grid groups by the canonical
  // broker-side `mt5_symbol` (e.g. 'Gold' on Highness MT5) so the operator
  // sees the B-Book row and its hedge under one symbol group. If the broker
  // has configured the LP mapping table to redirect (lp_id, lp_symbol) to
  // one or more `mt5_symbol`s, expand the position into one entry per
  // mapped MT5 symbol. Many-to-one is allowed (Symbol Mapping API §4) —
  // a single LP symbol can be the hedge target for multiple MT5 symbols,
  // which produces "as many leafs as combinations" per the deliberate
  // broker setup. Future Symbol-Grouping (Main-Symbol) feature will
  // reconcile those into a single roll-up. Positions without a mapping
  // (or where the mapping table hasn't loaded yet) keep their original
  // lp-side symbol — preserves today's behaviour for FX where mt5_symbol
  // happens to equal lp_symbol naturally.
  //
  // IMPORTANT: do not rewrite p.symbol here. p.symbol is the LP-side symbol
  // (e.g. 'XAUUSD' on TE) and must remain the source of truth for:
  //   • Unit conversion. TE delivers net_qty in TE-lot units (XAUUSD: 1 TE
  //     lot = 10 oz). The aggregator's (qtyContracts × minVol) / lotSize
  //     formula converts that to MT5-lot units (XAUUSD: 1 MT5 lot = 100 oz),
  //     which is the canonical unit for cross-venue comparison with the
  //     B-Book row. Renaming p.symbol → 'Gold' would land the position in
  //     the FX-default branch (identity math) and the Coverage row would
  //     display in TE lots while the B-Book row displays in MT5 lots —
  //     mixing units within the symbol group and making the hedge look
  //     10× more covered than it actually is.
  //   • Live-price lookup. MD ticks subscribed against TE are keyed by the
  //     lp_symbol ('XAUUSD'), not the mt5 group symbol ('Gold').
  // We carry the mt5 group key on a separate internal field so the bucket
  // can group by it without disturbing p.symbol.
  type FIXPositionWithGroup = FIXPosition & { _groupSymbol?: string };
  const positionsToAggregate: FIXPositionWithGroup[] = (() => {
    if (!lpToMt5Map || lpToMt5Map.size === 0) return positions;
    const out: FIXPositionWithGroup[] = [];
    for (const p of positions) {
      const mapped = lpToMt5Map.get(`${lpId}:${p.symbol}`);
      if (mapped && mapped.length > 0) {
        for (const mt5Sym of mapped) out.push({ ...p, _groupSymbol: mt5Sym });
      } else {
        out.push(p);
      }
    }
    return out;
  })();

  const bySymbol = new Map<string, {
    hedgeNetLots: number;                 // MT5 lots (not TE contracts)
    // Legs: kept so we can compute P/L per-position once, then sum. Summing
    // per-position P/L (each with its own direction) is more accurate than
    // a weighted-price approach when long and short legs coexist on a symbol.
    legs: { openPrice: number; lots: number; sign: number }[]; // lots = MT5 lots
    weightedOpenSum: number;
    totalAbsLots: number;                 // MT5 lots
    account: string;
    lotSize: number;                      // MT5 lot size (units per 1 lot)
    // Original LP-side symbol of the FIRST leg added to this bucket. Used by
    // the outer forEach for live-price lookup (livePrices is keyed on lp_symbol)
    // and instrument-class detection. In a future multi-LP convergence (e.g.
    // both TE 'XAUUSD' and LMAX 'XAU/USD' mapped to MT5 'Gold'), this field
    // would need to become per-leg; today's single-LP setup is fine with one.
    lpSymbol: string;
  }>();

  for (const p of positionsToAggregate) {
    if (!p.position_id || p.open_price <= 0) continue;
    // Direction — TE sandbox may return side='FLAT' with real qtys in long/short.
    // Prefer the side field, then fall back to long/short qty.
    const isLong = p.side === 'LONG' || p.side === 'BUY'
      || (p.long_qty > 0 && p.short_qty === 0);
    const isShort = p.side === 'SHORT' || p.side === 'SELL'
      || (p.short_qty > 0 && p.long_qty === 0);
    const sign = isLong ? 1 : isShort ? -1 : (p.net_qty >= 0 ? 1 : -1);

    // ── Unit conversion ────────────────────────────────────────────────
    // TE sends net_qty in CONTRACTS where one contract = min_trade_vol units.
    //   EURUSD: min_trade_vol = 100,000 → 5 contracts = 500,000 units = 5 MT5 lots
    //           (100,000 per lot), conversion factor 1.
    //   XAUUSD: min_trade_vol = 10      → 50 contracts = 500 ounces = 5 MT5 lots
    //           (100 per lot), conversion factor 0.1.
    // Converting to MT5 lots here keeps Net Vol / Notional / P/L consistent
    // with the B-Book aggregator (which is in MT5 lots) so that when the broker
    // is fully hedged, the two rows in the symbol group sum to zero regardless
    // of instrument class.
    const ins     = instrMap[p.symbol];
    const isXAU   = p.symbol.includes('XAU');
    const isBTC   = p.symbol.includes('BTC');
    const lotSize = isXAU ? 100 : isBTC ? 1 : 100000;
    // Prefer the authoritative min_trade_vol from /instruments; fall back to
    // known defaults for the moment before the instrument map has loaded.
    const minVol  = ins?.min_trade_vol ?? (isXAU ? 10 : isBTC ? 1 : 100000);

    // Surface incomplete instrument coverage from the FIX bridge. Without an
    // instrMap entry the aggregator silently uses a fallback that's wrong
    // for any symbol whose TE min_trade_vol differs from the assumed default
    // (e.g. AUDUSD with TE min_trade_vol=50000 vs fallback 100000 → 2× notional).
    if (!ins && !_missingInstrMapWarned.has(p.symbol)) {
      _missingInstrMapWarned.add(p.symbol);
      // eslint-disable-next-line no-console
      console.warn(
        `[NetExposure] instrMap missing entry for '${p.symbol}'. Using fallback minVol=${minVol}, lotSize=${lotSize}. ` +
        `If TE's actual min_trade_vol for this symbol differs, brokerNetVol/Notional on this row will be off by that ratio. ` +
        `Upstream fix: ensure /api/v1/fix/lp/${lpId}/instruments returns this symbol.`,
      );
    }

    const qtyContracts = Math.abs(p.net_qty) || Math.max(p.long_qty, p.short_qty);
    if (qtyContracts === 0) continue;
    const lots = (qtyContracts * minVol) / lotSize;  // MT5 lots
    const signedLots = lots * sign;

    // Bucket key = mt5 group symbol from the mapping (when present) or
    // p.symbol (the lp_symbol, when no mapping applies). p.symbol itself is
    // never overwritten by the expansion — it stays as the LP-side symbol
    // so the unit math above used the right instrument-class branch.
    const groupKey = p._groupSymbol ?? p.symbol;
    const cur = bySymbol.get(groupKey);
    if (cur) {
      cur.hedgeNetLots    += signedLots;
      cur.legs.push({ openPrice: p.open_price, lots, sign });
      cur.weightedOpenSum += p.open_price * lots;
      cur.totalAbsLots    += lots;
    } else {
      bySymbol.set(groupKey, {
        hedgeNetLots: signedLots,
        legs: [{ openPrice: p.open_price, lots, sign }],
        weightedOpenSum: p.open_price * lots,
        totalAbsLots: lots,
        account: p.account,
        lotSize,
        // p.symbol is always the LP-side symbol (no rename in expansion),
        // so this is unconditionally the correct lp_symbol for the outer
        // forEach to feed into livePrices and instrument-class detection.
        lpSymbol: p.symbol,
      });
    }
  }

  const riskLevels: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  const rows: HedgeExposureRow[] = [];
  let idx = 0;

  bySymbol.forEach((data, groupSymbol) => {
    // Instrument-class detection MUST use the LP-side symbol — that's the
    // one livePrices is keyed on and the one whose suffix tells us metals
    // vs crypto vs FX. groupSymbol may have been remapped (e.g. lp 'XAUUSD'
    // → mt5 'Gold') and would mis-classify here.
    const lpSym  = data.lpSymbol;
    const isJPY  = lpSym.includes('JPY');
    const isXAU  = lpSym.includes('XAU');
    const isBTC  = lpSym.includes('BTC');
    const lotSize  = data.lotSize;        // authoritative — set at accumulation time
    const pipValue = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;

    // Live mid-price from MD ticks. Fall back to weighted-open if no tick yet.
    // Keyed on lp_symbol — MD subscribed against TE for 'XAUUSD', not 'Gold'.
    const bid = livePrices.get(lpSym + ':bid');
    const ask = livePrices.get(lpSym + ':ask');
    const mid = (bid != null && ask != null) ? (bid + ask) / 2 : null;
    const avgPrice       = mid ?? (data.totalAbsLots > 0 ? data.weightedOpenSum / data.totalAbsLots : 0);
    const breakEvenPrice = data.totalAbsLots > 0 ? data.weightedOpenSum / data.totalAbsLots : 0;

    // Broker P/L — summed client-side per leg using live prices:
    //   long leg  → close at bid,  P/L = (bid - open) × lots × lotSize
    //   short leg → close at ask,  P/L = (open - ask) × lots × lotSize
    // lots are MT5 lots and lotSize is MT5 lot size, so lots × lotSize = units.
    // Falls back to 0 if no tick is in yet (don't leave a stale-looking value).
    let brokerFloatingPL = 0;
    if (bid != null && ask != null) {
      for (const leg of data.legs) {
        const close = leg.sign > 0 ? bid : ask;
        brokerFloatingPL += (close - leg.openPrice) * leg.sign * leg.lots * lotSize;
      }
      brokerFloatingPL = Math.round(brokerFloatingPL * 100) / 100;
    }

    const hedgeNetVol = Math.round(data.hedgeNetLots * 100) / 100;
    // Keep clientNetVol as the inverse of hedge (what clients would have done in
    // aggregate if this coverage fully hedged them) — display uses brokerNetVol.
    const clientNetVol  = Math.round(-hedgeNetVol * 100) / 100;
    const brokerNetVol  = hedgeNetVol;

    const clientNetNotional = Math.round(clientNetVol * lotSize);
    const hedgeNetNotional  = Math.round(hedgeNetVol  * lotSize);
    const brokerNetNotional = Math.round(brokerNetVol * lotSize);
    const unhedgedLots = Math.abs(brokerNetVol);
    const riskIdx = unhedgedLots > 5 ? 3 : unhedgedLots > 2 ? 2 : unhedgedLots > 0.5 ? 1 : 0;

    rows.push({
      id: `cbook-${lpId}-${groupSymbol}-${idx++}`,
      // Coverage: leaf row identifies the LP-side instrument (lp_symbol)
      // because that's what actually exists on the LP venue's books and
      // matches what the operator sees on Coverage Book / TE Terminal.
      // The grouping key is the mapped mt5_symbol (when a mapping exists)
      // so this row sits under the same parent as its B-Book counterpart.
      symbol: lpSym,
      groupSymbol,
      lp: lpDisplayName, lpAccount: data.account,
      clientNetVol, hedgeNetVol, brokerNetVol,
      clientNetNotional, hedgeNetNotional, brokerNetNotional,
      avgPrice:        Math.round(avgPrice       * 100000) / 100000,
      brokerFloatingPL,
      unhedgedLots,
      breakEvenPrice: Math.round(breakEvenPrice * 100000) / 100000,
      probableIdp30: 'Neutral',
      bevh: Math.round(unhedgedLots * 100) / 100,
      riskLevel: riskLevels[riskIdx],
      marketMovePercent: 0,
      plImpact: Math.round(unhedgedLots * lotSize * 0.001 * pipValue * 100) / 100,
      isBBook: false,
    });
  });

  return rows;
}

// Legacy export alias — kept so the call site inside hedgeExposureData continues
// to resolve without touching that useMemo. The implementation is the new one above.
const aggregateABookPositions = aggregateCoverageBookPositions;

// ======================
// COMPONENT
// ======================
export function NetExposurePage() {
  // ── Exposure grid ─────────────────────────────────────────────
  const exposureGridRef = useRef<AgGridReact<HedgeExposureRow>>(null);
  const expandedGroupsRef = useRef<Set<string>>(new Set());
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null); // intraday monitor
  // True when the user's most recent click was a B-Book row. B-Book positions
  // don't route through the LP, so the DOM Trader panel is muted to make the
  // "can't trade this here" state obvious and to prevent mistaken order entry.
  const [bBookSelected, setBBookSelected] = useState<boolean>(false);

  // ── Display ───────────────────────────────────────────────────
  const [volumeDisplayMode, setVolumeDisplayMode] = useState<'Lots' | 'Notional'>('Notional');

  // ── B-Book data ───────────────────────────────────────────────
  const [bBookPositions, setBBookPositions] = useState<MT5PositionWithNode[]>([]);
  const [bBookNodes,     setBBookNodes]     = useState<MT5NodeAPI[]>([]);
  // filterServer is the master node's node_name. Set once the node list arrives
  // (see effect further down). Only the master is displayed in the dropdown per
  // product decision — non-master MT5 servers are not relevant to this page.
  const [filterServer,   setFilterServer]   = useState<string>('');

  // ── A-Book data — live FIX/LP positions ───────────────────────
  const [aBookPositions, setABookPositions] = useState<FIXPosition[]>([]);

  // ── Header-bar daily aggregates (persist across full-day close-outs) ──────
  // Coverage side: backend-sourced. Same endpoint CBookPage uses — polled on
  // mount, on LP change, and refreshed 500 ms after every POSITION_CLOSED
  // (debounced). realized_pnl, commission, swap_net all roll over at the
  // backend's trade_date boundary.
  const [coverageDailyStats, setCoverageDailyStats] = useState<DailyStats | null>(null);

  // B-Book side: no backend endpoint yet, so accumulate client-side.
  //   1. lastKnownPnlRef captures the current all-in P/L (profit + swap + commission)
  //      for every open B-Book position, updated on every SNAPSHOT / POSITION_CHANGE.
  //   2. On POSITION_DELETE we attribute the cached value as realised P/L,
  //      push it into bBookDayStats, and persist to localStorage.
  //   3. When coverageDailyStats.trade_date advances (backend's rollover signal),
  //      we reset the B-Book accumulator to match — keeps both sides on the same day.
  // This is best-effort until the backend exposes MT5 closed-position aggregates;
  // accuracy may drift by 1 tick's worth of P/L vs actual close price.
  const lastKnownBBookPnlRef = useRef<Map<number, number>>(new Map());

  // Coverage-side per-position P/L cache — mirrors lastKnownBBookPnlRef.
  // TE FIX POSITION_CLOSED events don't carry realized_pnl (confirmed by the
  // FIX_Bridge_API_Documentation POSITION_REPORT schema), so we compute the
  // figure client-side the same way we compute Broker P/L everywhere else:
  //   (close - open) × sign × lots × lotSize
  // using live MD tick prices. Updated on every POSITION_REPORT / price tick
  // so the cache is fresh at the moment of close. On POSITION_CLOSED we pull
  // the cached value and accumulate it into coverageDailyStats.realized_pnl.
  const lastKnownCoveragePnlRef = useRef<Map<string, number>>(new Map());
  const [bBookDayStats, setBBookDayStats] = useState<BBookDayStats | null>(() => {
    try {
      const raw = localStorage.getItem('nexrisk_bbook_day_stats');
      if (raw) return JSON.parse(raw) as BBookDayStats;
    } catch {}
    return null;
  });
  const saveBBookDayStats = useCallback((stats: BBookDayStats | null) => {
    try {
      if (stats) localStorage.setItem('nexrisk_bbook_day_stats', JSON.stringify(stats));
      else       localStorage.removeItem('nexrisk_bbook_day_stats');
    } catch {}
  }, []);

  // ── LP list ───────────────────────────────────────────────────
  const [allLps, setAllLps] = useState<FIXLpEntry[]>(SEED_LPS);

  // ── LP symbol-mapping table ───────────────────────────────────
  // Loaded once on mount via /api/v1/symbol-mappings. Filtered to
  // enabled+approved rows so half-configured mappings can't redirect
  // grouping. Empty array on fetch failure → page falls back to grouping
  // by raw lp-side symbol (current pre-mapping behaviour preserved).
  const [lpMappings, setLpMappings] = useState<LPMapping[]>([]);

  // ── DOM / FIX ─────────────────────────────────────────────────
  const [domLpId,       setDomLpId]       = useState<string>('traderevolution');
  const [domSymbol,     setDomSymbol]     = useState<string>('');
  // DOM Trader panel defaults to collapsed. Opens on Coverage row click (so
  // the user's intent — "trade this symbol" — explicitly summons the panel)
  // or via the chevron on the collapsed-state rail. Kept as state so the
  // entire order form (qty, limit, log) stays mounted across open/close
  // transitions; we're hiding the panel, not tearing it down.
  const [domDrawerOpen, setDomDrawerOpen] = useState<boolean>(false);
  const [symbolSearch,  setSymbolSearch]  = useState<string>('');
  const [showPicker,    setShowPicker]    = useState(false);
  const [instruments,   setInstruments]   = useState<FIXInstrument[]>([]);
  const [instrLoading,  setInstrLoading]  = useState(false);
  const [capabilities,  setCapabilities]  = useState<FIXCapabilities | null>(null);
  const [lpStatus,      setLpStatus]      = useState<FIXLpStatus | null>(null);
  const [liveBook,      setLiveBook]      = useState<BookData | null>(null);
  const [bookStatus,    setBookStatus]    = useState<string>('—');
  const [domOrderType,  setDomOrderType]  = useState<string>('MARKET');
  const [domTif,        setDomTif]        = useState<string>('GTC');
  const [domQtyLots,    setDomQtyLots]    = useState<string>('');
  const [limitPrice,    setLimitPrice]    = useState<string>('');
  const [submitting,    setSubmitting]    = useState(false);
  const [execLog,       setExecLog]       = useState<ExecEntry[]>([]);

  // ── DOM refs ──────────────────────────────────────────────────
  const wsRef           = useRef<WebSocket | null>(null);
  const liveBookRef     = useRef<BookData | null>(null);
  const localBidsRef    = useRef<Map<number, number>>(new Map());
  const localAsksRef    = useRef<Map<number, number>>(new Map());
  const subscribedRef   = useRef<string>('');
  const wsSymbolRef     = useRef<string>('');
  const wsLpIdRef       = useRef<string>('');
  const bookRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced refresh of Coverage daily stats, called by the WS handler after
  // POSITION_CLOSED. Stored as a ref so the handler (which captures refs, not
  // state/callbacks) always calls the latest version. Populated further down.
  const fetchCoverageDailyStatsRef = useRef<() => void>(() => {});
  const coverageStatsRefreshTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Live price feed for exposure rows (WS-driven) ─────────────
  // symbol+':bid' / symbol+':ask' → latest MD tick. Fed by the FIX WS handler
  // for ANY symbol a position exists on (not just the DOM symbol). Drives
  // Mkt Px and Broker P/L in the exposure grid.
  const currentPricesRef     = useRef<Map<string, number>>(new Map());
  // Symbols we've already posted /md/subscribe for (avoid duplicate subscribes).
  const posSubscribedRef     = useRef<Set<string>>(new Set());
  // Bumps on every MD tick so useMemo-based aggregation re-runs with fresh prices.
  // State, not ref, because useMemo needs a dep that changes. Batched via RAF below.
  const [priceTickCounter, setPriceTickCounter] = useState(0);
  const pendingTickRef       = useRef<boolean>(false);

  // ── Signal / intraday ─────────────────────────────────────────
  const [signalMap,        setSignalMap]        = useState<Map<string, string>>(new Map());
  const [intradayData,     setIntradayData]     = useState<PredictionRow | null>(null);
  const [intradayLoading,  setIntradayLoading]  = useState(false);
  const [intradayUnmapped, setIntradayUnmapped] = useState(false);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // ── B-Book: one-shot REST bootstrap + MT5 WebSocket for updates ──────────
  // Pure WS: after the initial snapshot fetch, all B-Book position mutations
  // flow through /ws/v1/mt5/events. The BFF's mt5-ws module emits an initial
  // SNAPSHOT frame (topic='mt5.position', type='SNAPSHOT') followed by
  // incremental events from the C++ MT5 service. Unknown `type`s are ignored
  // with a log line so the incremental event names can be confirmed.
  useEffect(() => {
    let cancelled = false;
    // Bootstrap via REST so the grid is populated before the first WS frame.
    (async () => {
      try {
        const { positions, nodes } = await mt5Api.getAllBBookPositions();
        if (cancelled) return;
        setBBookPositions(positions);
        setBBookNodes(nodes);
      } catch { /* WS will populate */ }
    })();

    // MT5 WebSocket
    const ws = new WebSocket(`${WS_BASE}/ws/v1/mt5/events`);
    ws.onopen    = () => { if (!cancelled) console.log('[NetExposure MT5 WS] connected'); };
    ws.onerror   = (e) => console.warn('[NetExposure MT5 WS] error', e);
    ws.onclose   = () => { if (!cancelled) console.log('[NetExposure MT5 WS] closed'); };
    ws.onmessage = (evt) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(evt.data);

        // All-in P/L for a single MT5 position (matches BBookPage.stats.netPnL).
        const allInPnl = (p: MT5PositionWithNode): number =>
          (p.profit ?? 0) + (p.swap ?? 0) + (p.commission ?? 0);

        // SNAPSHOT — full replacement. Re-seed the last-known-P/L map from the
        // snapshot; any position_id we were tracking that's absent from the
        // snapshot must have closed while the WS was down — attribute its last
        // cached P/L to realised before dropping it.
        if (msg.type === 'SNAPSHOT' && Array.isArray(msg.data)) {
          const incoming = msg.data as MT5PositionWithNode[];
          const prevMap = lastKnownBBookPnlRef.current;
          const newMap  = new Map<number, number>();
          for (const p of incoming) newMap.set(p.position_id, allInPnl(p));
          // Positions that disappeared between snapshots → realise them.
          let gapRealised = 0; let gapCount = 0;
          for (const [pid, pnl] of prevMap) {
            if (!newMap.has(pid)) { gapRealised += pnl; gapCount += 1; }
          }
          if (gapCount > 0) {
            setBBookDayStats((cur) => {
              const today = new Date().toISOString().slice(0, 10);
              const base  = (cur && cur.trade_date === today) ? cur : { trade_date: today, realized_pnl: 0, closed_count: 0 };
              const next  = { ...base, realized_pnl: base.realized_pnl + gapRealised, closed_count: base.closed_count + gapCount };
              saveBBookDayStats(next);
              return next;
            });
          }
          lastKnownBBookPnlRef.current = newMap;
          setBBookPositions(incoming);
          return;
        }

        // Upsert on add/change. Event names per api.ts BBookWsEvent union.
        if (msg.type === 'POSITION_ADD' || msg.type === 'POSITION_CHANGE') {
          const p = msg.data as MT5PositionWithNode | undefined;
          if (!p || !p.nodeName) return;
          lastKnownBBookPnlRef.current.set(p.position_id, allInPnl(p));
          const keyOf = (pp: MT5PositionWithNode) =>
            `${pp.nodeName}:${(pp as any).position_id ?? (pp as any).ticket ?? ''}`;
          const k = keyOf(p);
          setBBookPositions((prev) => {
            const idx = prev.findIndex((q) => keyOf(q) === k);
            // Merge — DO NOT replace. The C++ backend's POSITION_CHANGE is a
            // delta event: it carries only the fields that change tick-to-tick
            // (price_current, profit, swap, commission) and omits the static
            // lifetime fields (action, volume_lots, price_open, time_create
            // etc.). A naïve `next[idx] = p` would strip those from the row,
            // turning Net Vol into NaN and Mkt Px / Break-Even Px into 0 the
            // first time a tick arrives after the REST/SNAPSHOT bootstrap.
            // Spreading the existing row first preserves the static fields;
            // the delta then overwrites only what it actually contains.
            if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...p }; return next; }
            return [...prev, p];
          });
          return;
        }

        if (msg.type === 'POSITION_DELETE') {
          const pid = msg.data?.position_id;
          if (pid == null) return;
          // Attribute the last cached P/L as realised. Drop the cache entry.
          const cachedPnl = lastKnownBBookPnlRef.current.get(pid) ?? 0;
          lastKnownBBookPnlRef.current.delete(pid);
          setBBookDayStats((cur) => {
            const today = new Date().toISOString().slice(0, 10);
            const base  = (cur && cur.trade_date === today) ? cur : { trade_date: today, realized_pnl: 0, closed_count: 0 };
            const next  = { ...base, realized_pnl: base.realized_pnl + cachedPnl, closed_count: base.closed_count + 1 };
            saveBBookDayStats(next);
            return next;
          });
          setBBookPositions((prev) => prev.filter((q) =>
            ((q as any).position_id ?? (q as any).ticket) !== pid
          ));
          return;
        }
        // Subscription ack / pong — ignore quietly.
        if (msg.type === 'subscribed' || msg.type === 'pong') return;
        if (msg.type) console.debug('[NetExposure MT5 WS] unhandled type:', msg.type);
      } catch { /* malformed */ }
    };

    return () => { cancelled = true; ws.close(); };
  }, []);

  // ── Coverage Book: one-shot REST bootstrap — WebSocket drives updates afterwards.
  // This page is pure WebSocket: after the initial snapshot, POSITION_REPORT,
  // POSITION_CLOSED, and POSITION_UPDATED events on the shared FIX WS (opened in
  // the DOM effect below) mutate aBookPositions in place. No polling timer.
  // Uses the v3 flat-path endpoint — the only one that returns the full
  // operational set including hedging-strategy LP positions.
  // Closed-position tombstones (populated by CBookPage on close) are honoured so a
  // just-closed position doesn't ghost back in before the WS tombstone arrives.
  useEffect(() => {
    if (!domLpId) { setABookPositions([]); return; }
    let cancelled = false;
    const readClosedIds = (): Set<string> => {
      try {
        const raw = localStorage.getItem('nexrisk_closed_positions');
        if (raw) return new Set<string>(JSON.parse(raw) as string[]);
      } catch {}
      return new Set<string>();
    };
    (async () => {
      try {
        const r = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(
          `/api/v1/fix/positions/${domLpId}`
        );
        if (cancelled || !r.success) return;
        const closedIds = readClosedIds();
        setABookPositions(
          r.data.positions.filter((p) =>
            p.position_id !== '' && p.open_price > 0 && !closedIds.has(p.position_id)
          )
        );
      } catch { /* silent — WS will populate when first event arrives */ }
    })();
    return () => { cancelled = true; };
  }, [domLpId]);

  // ── LP list: seed from /fix/status ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    bff<{ success: boolean; data: { lps: Record<string, any> } }>('/api/v1/fix/status')
      .then((r) => {
        if (cancelled || !r.success) return;
        const live: FIXLpEntry[] = Object.entries(r.data.lps ?? {}).map(([id, info]: [string, any]) => ({
          lp_id:         id,
          lp_name:       info.lp_name ?? SEED_LPS.find((s) => s.lp_id === id)?.lp_name ?? id,
          state:         info.state   ?? 'UNKNOWN',
          provider_type: info.provider_type ?? '',
        }));
        for (const seed of SEED_LPS) {
          if (!live.find((l) => l.lp_id === seed.lp_id)) live.push({ ...seed, state: 'DISCONNECTED' });
        }
        setAllLps(live);
        // Auto-select first connected LP
        const first = live.find((l) => l.state === 'CONNECTED');
        if (first) setDomLpId((prev) => prev || first.lp_id);
      })
      .catch(() => { /* seed data shown */ })
      .finally(() => { if (!cancelled) {} });
    return () => { cancelled = true; };
  }, []);

  // ── LP symbol mappings: one-shot fetch ────────────────────────
  // Loaded once at mount. Deliberately NOT keyed on domLpId — mappings for
  // every LP are needed at once so a Coverage-row symbol on LP A can be
  // resolved even when DOM/order-entry is currently focused on LP B.
  // No WS topic for mapping changes today, so a page refresh is required
  // after editing on the Symbol Mapping page (acceptable: that page already
  // operates on a refresh-to-see-changes model).
  useEffect(() => {
    let cancelled = false;
    bff<{ mappings: LPMapping[] }>('/api/v1/symbol-mappings')
      .then((r) => {
        if (cancelled) return;
        setLpMappings((r.mappings ?? []).filter((m) => m.enabled));
      })
      .catch(() => { /* table empty → page falls back to raw lp_symbol grouping */ });
    return () => { cancelled = true; };
  }, []);

  // ── Instruments + capabilities for DOM ───────────────────────
  useEffect(() => {
    if (!domLpId) { setInstruments([]); setCapabilities(null); return; }
    let cancelled = false;
    setInstrLoading(true);
    Promise.allSettled([
      bff<{ success: boolean; data: { instruments: FIXInstrument[] } }>(`/api/v1/fix/lp/${domLpId}/instruments`),
      bff<{ success: boolean; data: FIXCapabilities }>(`/api/v1/fix/lp/${domLpId}/capabilities`),
    ]).then(([instrR, capsR]) => {
      if (cancelled) return;
      if (instrR.status === 'fulfilled' && instrR.value.success) {
        setInstruments(instrR.value.data.instruments);
      }
      if (capsR.status === 'fulfilled' && capsR.value.success) {
        setCapabilities(capsR.value.data);
        setDomTif(capsR.value.data.time_in_force[0] || 'GTC');
      }
    }).finally(() => { if (!cancelled) setInstrLoading(false); });
    return () => { cancelled = true; };
  }, [domLpId]);

  // ── FIX WebSocket — opens per LP, stays up across DOM symbol changes ─────
  // This is the sole source of position + market-data updates for this page.
  // The DOM-symbol MD subscribe and per-position-symbol MD subscribe effects
  // below tell the backend which symbols to stream; all resulting frames land
  // here. Position events mutate aBookPositions in place (no polling).
  useEffect(() => {
    if (!domLpId) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsLpIdRef.current = '';
      setBookStatus('—');
      return;
    }
    let cancelled = false;
    wsLpIdRef.current = domLpId;

    const readClosedIds = (): Set<string> => {
      try {
        const raw = localStorage.getItem('nexrisk_closed_positions');
        if (raw) return new Set<string>(JSON.parse(raw) as string[]);
      } catch {}
      return new Set<string>();
    };

    // Coalesce price-tick state bumps to one per animation frame — MD can fire
    // many times per second per symbol and we don't want to re-render that often.
    const scheduleTick = () => {
      if (pendingTickRef.current) return;
      pendingTickRef.current = true;
      requestAnimationFrame(() => {
        pendingTickRef.current = false;
        setPriceTickCounter((n) => n + 1);
      });
    };

    const ws = new WebSocket(`${WS_BASE}${FIX_WS_PATH}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      setBookStatus((prev) => prev === 'HEALTHY' ? 'HEALTHY' : 'EMPTY');
    };

    ws.onmessage = (evt) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(evt.data);

        // ── Market data — any symbol, feeds currentPricesRef ─────────────
        if (msg.type === 'MARKET_DATA_SNAPSHOT' || msg.type === 'MARKET_DATA_INCREMENTAL' ||
            msg.type === 'MD_SNAPSHOT' || msg.type === 'MD_INCREMENTAL') {
          const bookRaw = msg.data ?? msg;
          const sym = bookRaw.symbol ?? msg.symbol;
          if (!sym) return;
          if (msg.lp_id && msg.lp_id !== wsLpIdRef.current) return;

          // DOM panel book — only the selected DOM symbol drives the depth view.
          if (sym === wsSymbolRef.current) {
            const mutated = applyBookMessage(bookRaw, msg.type, localBidsRef.current, localAsksRef.current);
            if (mutated) {
              const bd = buildBookFromMaps(sym, localBidsRef.current, localAsksRef.current);
              if (bd) {
                liveBookRef.current = bd;
                setBookStatus('HEALTHY');
                if (!bookRenderTimer.current) {
                  bookRenderTimer.current = setTimeout(() => {
                    bookRenderTimer.current = null;
                    if (liveBookRef.current) setLiveBook({ ...liveBookRef.current });
                  }, 100);
                }
              }
            }
          }

          // Exposure grid prices — every symbol with a position feeds here.
          const refBid: number | null = bookRaw.best_bid ?? null;
          const refAsk: number | null = bookRaw.best_ask ?? null;
          if (refBid != null && refAsk != null) {
            const prevBid = currentPricesRef.current.get(sym + ':bid');
            const prevAsk = currentPricesRef.current.get(sym + ':ask');
            if (prevBid !== refBid || prevAsk !== refAsk) {
              currentPricesRef.current.set(sym + ':bid', refBid);
              currentPricesRef.current.set(sym + ':ask', refAsk);
              scheduleTick();
            }
          }
          return;
        }

        // ── Position events — mutate Coverage Book state ──────────────────
        if (msg.type === 'POSITION_REPORT') {
          const evtLp = msg.lp_id;
          if (evtLp && evtLp !== wsLpIdRef.current) return;
          const pd = msg.data ?? msg;
          const pid: string = pd.position_id ?? '';
          if (!pid) return;
          if (readClosedIds().has(pid)) return;

          const pos: FIXPosition = {
            position_id: pid,
            account:     pd.account     ?? '',
            symbol:      pd.symbol      ?? '',
            open_price:  pd.open_price  ?? 0,
            long_qty:    pd.long_qty    ?? 0,
            short_qty:   pd.short_qty   ?? 0,
            net_qty:     pd.net_qty     ?? 0,
            side:        pd.side        ?? 'FLAT',
            commission:  pd.commission  ?? 0,
            swap:        pd.swap        ?? 0,
            received_ts: msg.timestamp_ms ?? Date.now(),
            unrealized_pnl: pd.unrealized_pnl ?? undefined,
            current_price:  pd.current_price  ?? undefined,
          };
          // open_price === 0 on a TE POSITION_REPORT signals external close.
          if (pos.open_price === 0) {
            setABookPositions((prev) => prev.filter((p) => p.position_id !== pid));
            return;
          }
          if (pos.open_price > 0 && (pos.long_qty + pos.short_qty > 0 || Math.abs(pos.net_qty) > 0)) {
            setABookPositions((prev) => {
              const idx = prev.findIndex((p) => p.position_id === pid);
              if (idx >= 0) { const next = [...prev]; next[idx] = pos; return next; }
              return [...prev, pos];
            });
          }
          return;
        }

        if (msg.type === 'POSITION_CLOSED') {
          const evtLp = msg.lp_id;
          if (evtLp && evtLp !== wsLpIdRef.current) return;
          const pid = msg.position_id ?? msg.data?.position_id;
          if (!pid) return;

          // Realised P/L for this close. TE FIX POSITION_CLOSED does NOT
          // include realized_pnl in its payload (see FIX_Bridge_API_Documentation
          // POSITION_REPORT schema — the same event shape, just with net_qty=0),
          // so we read the last computed per-position P/L from our cache.
          // Updated on every MD tick by the hedgeExposureData memo above.
          // If the cache is empty (close arrived before any tick), fall back to 0
          // and let the 500ms debounced refetch correct from backend.
          const cachedPnl = lastKnownCoveragePnlRef.current.get(pid) ?? 0;
          lastKnownCoveragePnlRef.current.delete(pid);

          // Accumulate into coverageDailyStats immediately so the header card
          // reflects the close without waiting for a REST round-trip.
          if (cachedPnl !== 0) {
            setCoverageDailyStats((prev) => prev
              ? {
                  ...prev,
                  realized_pnl:   prev.realized_pnl   + cachedPnl,
                  position_count: Math.max(0, prev.position_count - 1),
                }
              : {
                  trade_date:     new Date().toISOString().slice(0, 10),
                  realized_pnl:   cachedPnl,
                  commission:     0,
                  swap_long:      null,
                  swap_short:     null,
                  swap_net:       0,
                  position_count: 0,
                }
            );
          }

          setABookPositions((prev) => prev.filter((p) => p.position_id !== pid));

          // Debounced refresh so if the backend ever starts reporting realised
          // P/L authoritatively, its value overrides our client-side estimate.
          if (coverageStatsRefreshTimer.current) clearTimeout(coverageStatsRefreshTimer.current);
          coverageStatsRefreshTimer.current = setTimeout(() => fetchCoverageDailyStatsRef.current(), 500);
          return;
        }

        if (msg.type === 'POSITION_UPDATED') {
          const evtLp = msg.lp_id;
          if (evtLp && evtLp !== wsLpIdRef.current) return;
          const upd = msg.data ?? msg;
          const pid = upd.position_id ?? upd.positionId;
          if (!pid) return;
          setABookPositions((prev) => prev.map((p) => p.position_id === pid ? {
            ...p,
            long_qty:  upd.long_qty  ?? p.long_qty,
            short_qty: upd.short_qty ?? p.short_qty,
            net_qty:   upd.net_qty   ?? p.net_qty,
          } : p));
          return;
        }

        // ── Session ───────────────────────────────────────────────────
        if (msg.type === 'SESSION_LOGON')  setBookStatus((prev) => prev === 'HEALTHY' ? 'HEALTHY' : 'EMPTY');
        if (msg.type === 'SESSION_LOGOUT') setBookStatus('DISCONNECTED');
      } catch { /* malformed frame */ }
    };

    ws.onerror = (e) => console.warn('[NetExposure WS] error', e);
    ws.onclose = () => { if (!cancelled) console.log('[NetExposure WS] closed'); };

    return () => {
      cancelled = true;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (bookRenderTimer.current) { clearTimeout(bookRenderTimer.current); bookRenderTimer.current = null; }
      wsLpIdRef.current = '';
      // Unsubscribe every symbol we subscribed for this LP.
      const lp = domLpId;
      for (const sym of posSubscribedRef.current) {
        bff('/api/v1/fix/md/unsubscribe', {
          method: 'POST', body: JSON.stringify({ lp_id: lp, symbol: sym }),
        }).catch(() => {});
      }
      posSubscribedRef.current.clear();
      currentPricesRef.current.clear();
    };
  }, [domLpId]);

  // ── DOM-symbol MD subscription (depth 10) — for the book-depth panel ─────
  // Separate from the FIX WS lifecycle above so that picking a new DOM symbol
  // only resubscribes MD — it does NOT tear down the WS or the position stream.
  useEffect(() => {
    if (!domLpId || !domSymbol) {
      setLiveBook(null); liveBookRef.current = null;
      wsSymbolRef.current = '';
      localBidsRef.current.clear(); localAsksRef.current.clear();
      return;
    }

    const key = `${domLpId}:${domSymbol}`;
    if (subscribedRef.current === key) return;
    subscribedRef.current = key;
    wsSymbolRef.current   = domSymbol;
    localBidsRef.current.clear(); localAsksRef.current.clear();
    setLiveBook(null); liveBookRef.current = null;
    setBookStatus('SUBSCRIBING');
    // Ensure we're tracking this symbol for per-position prices too.
    posSubscribedRef.current.add(domSymbol);

    let cancelled = false;
    (async () => {
      // Check LP session (non-fatal).
      try {
        const st = await bff<{ success: boolean; data: FIXLpStatus }>(`/api/v1/fix/status/${domLpId}`);
        if (!cancelled && st.success) setLpStatus(st.data);
      } catch { /* non-fatal */ }
      // Subscribe at depth 10 for the DOM book panel.
      try {
        await bff(`/api/v1/fix/md/subscribe`, {
          method: 'POST', body: JSON.stringify({ lp_id: domLpId, symbol: domSymbol, depth: 10 }),
        });
      } catch { /* non-fatal */ }
      if (cancelled) return;
      // TE first snapshot lands within ~400 ms; seed local maps from REST cache after.
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      try {
        const bookR = await bff<any>(`/api/v1/fix/md/book/${domLpId}/${domSymbol}`);
        if (!cancelled) {
          primeBookFromRest(bookR, localBidsRef.current, localAsksRef.current);
          const bd = buildBookFromMaps(domSymbol, localBidsRef.current, localAsksRef.current);
          if (bd) { liveBookRef.current = bd; setLiveBook(bd); setBookStatus('HEALTHY'); }
        }
      } catch { /* non-fatal */ }
    })();

    return () => { cancelled = true; };
  }, [domLpId, domSymbol]);

  // ── Per-position MD subscription (depth 1) — live Mkt Px + P/L every row ─
  // Every symbol that has an open position in either book gets a depth-1 MD
  // subscription so the FIX WS handler above feeds currentPricesRef for it.
  // Subscriptions accumulate for the LP session and are torn down when the LP
  // changes (the FIX WS cleanup unsubscribes the full set).
  useEffect(() => {
    if (!domLpId) return;
    const symbols = new Set<string>();
    for (const p of aBookPositions) if (p.symbol) symbols.add(p.symbol);
    for (const p of bBookPositions) if (p.symbol) symbols.add(p.symbol);
    for (const sym of symbols) {
      if (posSubscribedRef.current.has(sym)) continue;
      posSubscribedRef.current.add(sym);
      bff('/api/v1/fix/md/subscribe', {
        method: 'POST', body: JSON.stringify({ lp_id: domLpId, symbol: sym, depth: 1 }),
      }).catch(() => {});
    }
  }, [aBookPositions, bBookPositions, domLpId]);

  // ── Signal column ─────────────────────────────────────────────
  useEffect(() => {
    const symbols = [...new Set(
      aBookPositions.map((p) => p.symbol)
    )];
    if (!symbols.length) return;
    let cancelled = false;
    nexdayFetch<{ signals: Record<string, { signal: string }> }>(
      `/api/v1/predictions/signals?mt5_symbols=${symbols.join(',')}`
    )
      .then((res) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const [sym, val] of Object.entries(res.signals ?? {})) {
          if (val?.signal) map.set(sym, val.signal);
        }
        setSignalMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [aBookPositions]);

  // ── Intraday monitor ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedSymbol) { setIntradayData(null); setIntradayUnmapped(false); return; }
    let cancelled = false;
    setIntradayLoading(true); setIntradayUnmapped(false);
    nexdayFetch<{
      mapped: boolean; generated_at: string;
      timeframes?: {
        '15min'?: { predicted_high: number; predicted_low: number; trend: number; target_time: string };
        '30min'?: { predicted_high: number; predicted_low: number; trend: number; target_time: string };
        '1hour'?: { predicted_high: number; predicted_low: number; trend: number; target_time: string };
        '2hour'?: { predicted_high: number; predicted_low: number; trend: number; target_time: string };
      };
    }>(`/api/v1/predictions/intraday/${selectedSymbol}`)
      .then((res) => {
        if (cancelled) return;
        if (!res.mapped || !res.timeframes) { setIntradayUnmapped(true); setIntradayData(null); return; }
        const { timeframes: tfs, generated_at } = res;
        const t15 = tfs['15min']; const t30 = tfs['30min']; const t1h = tfs['1hour']; const t2h = tfs['2hour'];
        const trend = (t?: { trend: number }): 'Up' | 'Down' | 'Neutral' =>
          !t ? 'Neutral' : t.trend > 0 ? 'Up' : t.trend < 0 ? 'Down' : 'Neutral';
        const rawTarget = t15?.target_time ?? '';
        const targetTime = (!rawTarget || rawTarget.startsWith('1970')) ? generated_at : rawTarget;
        setIntradayData({
          id: `pred-${selectedSymbol}`, symbol: selectedSymbol, targetTime,
          pred15High: t15?.predicted_high ?? 0, pred15Trend: trend(t15), pred15Low: t15?.predicted_low ?? 0,
          pred30High: t30?.predicted_high ?? 0, pred30Trend: trend(t30), pred30Low: t30?.predicted_low ?? 0,
          pred1hHigh: t1h?.predicted_high ?? 0, pred1hTrend: trend(t1h), pred1hLow: t1h?.predicted_low ?? 0,
          pred2hHigh: t2h?.predicted_high ?? 0, pred2hTrend: trend(t2h), pred2hLow: t2h?.predicted_low ?? 0,
        });
      })
      .catch(() => { if (!cancelled) { setIntradayUnmapped(true); setIntradayData(null); } })
      .finally(() => { if (!cancelled) setIntradayLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSymbol]);

  // ── Coverage daily stats — poll every 30 s as a safety net, plus WS-driven
  // refresh after POSITION_CLOSED (via fetchCoverageDailyStatsRef above).
  const fetchCoverageDailyStats = useCallback(() => {
    if (!domLpId) { setCoverageDailyStats(null); return; }
    bff<{ success: boolean; data: DailyStats }>(
      `/api/v1/fix/daily-stats?lp_id=${encodeURIComponent(domLpId)}`
    )
      .then((r) => { if (r.success) setCoverageDailyStats(r.data); })
      .catch(() => {});
  }, [domLpId]);

  useEffect(() => { fetchCoverageDailyStatsRef.current = fetchCoverageDailyStats; }, [fetchCoverageDailyStats]);

  useEffect(() => {
    if (!domLpId) { setCoverageDailyStats(null); return; }
    fetchCoverageDailyStats();
    const timer = setInterval(fetchCoverageDailyStats, 30_000);
    return () => clearInterval(timer);
  }, [domLpId, fetchCoverageDailyStats]);

  // ── B-Book daily stats rollover — when the backend's trade_date advances,
  // reset the client-side accumulator to match. Uses Coverage's trade_date as
  // the authoritative day marker (same pattern as CBookPage strategyDayStats).
  useEffect(() => {
    const td = coverageDailyStats?.trade_date;
    if (!td) return;
    setBBookDayStats((cur) => {
      if (cur && cur.trade_date === td) return cur;
      const next = { trade_date: td, realized_pnl: 0, closed_count: 0 };
      saveBBookDayStats(next);
      return next;
    });
  }, [coverageDailyStats?.trade_date, saveBBookDayStats]);

  // ==========================================================================
  // DERIVED
  // ==========================================================================
  const instrMap = useMemo<Record<string, FIXInstrument>>(() => {
    const map: Record<string, FIXInstrument> = {};
    for (const ins of instruments) map[ins.symbol] = ins;
    return map;
  }, [instruments]);

  // Identify the master node — there must be exactly one (see MT5 Servers page).
  // Fall back to the first node only if nothing is flagged as master so the UI
  // still renders during config setup; in normal operation is_master is set.
  const masterNode = useMemo(() => {
    return bBookNodes.find((n) => n.is_master) ?? bBookNodes[0] ?? null;
  }, [bBookNodes]);

  const bBookLpLabel = useMemo(() => {
    // Always shows the master's node_name — non-master nodes aren't represented
    // in this page's exposure grid per product decision.
    return masterNode ? `B-Book-${masterNode.node_name}` : 'B-Book';
  }, [masterNode]);

  // Dropdown shows ONLY the master node, labelled "<node_name> - Master".
  // Value is the raw node_name so the bBookPositions filter below matches
  // p.nodeName as stamped by mt5-ws.ts.
  const serverOptions = useMemo(
    () => masterNode ? [masterNode.node_name] : [],
    [masterNode]
  );

  // Auto-select the master as soon as we know which one it is — only when
  // filterServer hasn't been set yet, so we don't clobber a manual selection.
  useEffect(() => {
    if (!masterNode) return;
    if (!filterServer) setFilterServer(masterNode.node_name);
  }, [masterNode, filterServer]);

  // Build the (lp_id, lp_symbol) → mt5_symbol[] lookup for the Coverage
  // aggregator. Many-to-one is allowed: a single LP-side symbol may be the
  // hedge target for multiple MT5 symbols (e.g. broker has both 'Gold' and
  // 'XAUUSD' on the same MT5 server, both routed to LP 'XAUUSD'), so the
  // value is an array. The aggregator emits one Coverage leaf per mapped
  // mt5_symbol when this fans out.
  const lpToMt5Map = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const mp of lpMappings) {
      const key = `${mp.lp_id}:${mp.lp_symbol}`;
      const cur = m.get(key);
      if (cur) {
        // Dedup: a duplicate (lp_id, lp_symbol, mt5_symbol) row in the
        // mapping table would otherwise expand the position into multiple
        // entries with the same bucket key, double-counting it in the
        // aggregator and producing notional values 2× larger than reality.
        if (!cur.includes(mp.mt5_symbol)) cur.push(mp.mt5_symbol);
      } else {
        m.set(key, [mp.mt5_symbol]);
      }
    }
    return m;
  }, [lpMappings]);

  // mt5_symbol → instrument-class flags. Built from LP mappings: classify each
  // mt5_symbol by its corresponding lp_symbol (which uses standardised names
  // like 'XAUUSD' / 'EURJPY' / 'BTCUSD'). Lets the B-Book aggregator and the
  // header-bar volume rollups apply the right lotSize/pipValue for broker-
  // specific symbols like 'Gold' that don't include 'XAU' in their name.
  // Ambiguous case (one mt5_symbol mapped to lp_symbols of different classes)
  // is resolved first-write-wins; in practice that doesn't happen because a
  // single instrument doesn't change asset class across LPs.
  const mt5SymbolClass = useMemo(() => {
    const m = new Map<string, Mt5SymbolClass>();
    for (const mp of lpMappings) {
      if (m.has(mp.mt5_symbol)) continue;
      const lpSym = mp.lp_symbol;
      m.set(mp.mt5_symbol, {
        isJPY: lpSym.includes('JPY'),
        isXAU: lpSym.includes('XAU'),
        isBTC: lpSym.includes('BTC'),
      });
    }
    return m;
  }, [lpMappings]);

  const aBookLpName = useMemo(() => {
    const lp = allLps.find((l) => l.lp_id === domLpId);
    const base = lp?.lp_name ?? 'TraderEvolution';
    // Prefix makes the Coverage Book row visually distinct from the B-Book row under
    // each symbol group. Mirrors the 'B-Book-<server>' convention on the MT5 side.
    return `Coverage-${base}`;
  }, [allLps, domLpId]);

  const hedgeExposureData = useMemo(() => {
    // priceTickCounter in deps so the memo re-evaluates on every MD tick — the
    // aggregator uses currentPricesRef.current to compute live Mkt Px and P/L.
    const livePrices = currentPricesRef.current;
    const aBookRows = aggregateCoverageBookPositions(aBookPositions, domLpId, aBookLpName, instrMap, livePrices, lpToMt5Map);

    // Refresh the per-position Coverage P/L cache used by the POSITION_CLOSED
    // handler to compute realised P/L at close time. Mirrors the aggregator's
    // math exactly: (close - open) × sign × lots × lotSize, where `close` is
    // bid for long legs / ask for short legs.
    const cov = lastKnownCoveragePnlRef.current;
    for (const p of aBookPositions) {
      if (!p.position_id || p.open_price <= 0) continue;
      const isLong = p.side === 'LONG' || p.side === 'BUY'
        || (p.long_qty > 0 && p.short_qty === 0);
      const isShort = p.side === 'SHORT' || p.side === 'SELL'
        || (p.short_qty > 0 && p.long_qty === 0);
      const sign = isLong ? 1 : isShort ? -1 : (p.net_qty >= 0 ? 1 : -1);
      const ins = instrMap[p.symbol];
      const isXAU = p.symbol.includes('XAU');
      const isBTC = p.symbol.includes('BTC');
      const lotSize = isXAU ? 100 : isBTC ? 1 : 100000;
      const minVol  = ins?.min_trade_vol ?? (isXAU ? 10 : isBTC ? 1 : 100000);
      const qtyContracts = Math.abs(p.net_qty) || Math.max(p.long_qty, p.short_qty);
      if (qtyContracts === 0) continue;
      const lots = (qtyContracts * minVol) / lotSize;
      const bid = livePrices.get(p.symbol + ':bid');
      const ask = livePrices.get(p.symbol + ':ask');
      if (bid == null || ask == null) continue; // no tick yet — leave stale entry
      const close = sign > 0 ? bid : ask;
      const pnl = (close - p.open_price) * sign * lots * lotSize
                + (p.swap ?? 0) + (p.commission ?? 0);
      cov.set(p.position_id, pnl);
    }

    // B-Book rows are filtered to the master node only (non-masters are not shown
    // on this page). filterServer is defaulted to the master's node_name above.
    const filtered = filterServer
      ? bBookPositions.filter((p) => p.nodeName === filterServer)
      : bBookPositions;
    const bBookRowsLabel = filterServer ? `B-Book-${filterServer}` : bBookLpLabel;
    // Order matters: B-Book rows first, Coverage rows second. AG Grid
    // preserves array order within row groups when no sort column is active,
    // so this is what puts the broker's own book above its hedge inside each
    // symbol group. (Replaces the previous hidden 'sortOrder' column.)
    return [...aggregateBBookPositions(filtered, bBookRowsLabel, mt5SymbolClass), ...aBookRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aBookPositions, domLpId, aBookLpName, instrMap, bBookPositions, bBookLpLabel, filterServer, priceTickCounter, lpToMt5Map, mt5SymbolClass]);

  // ── Header-bar stats ──────────────────────────────────────────────────────
  // All P/L is broker-perspective:
  //   • MT5 `profit` field is already broker-side (MT5 books from broker's angle)
  //   • Coverage `brokerFloatingPL` is computed broker-side in aggregator above
  // So direct sums give broker-perspective totals — no sign flips.
  //
  // Hedge metrics use per-symbol MT5-lot absolute values from the already-built
  // exposure rows, which means they share the same unit conversion (including
  // the TE contracts→lots fix) and lot-size conventions as everything else on
  // the page. That keeps the math self-consistent across instrument classes.
  const headerStats = useMemo(() => {
    // ── Position / volume counts ──────────────────────────────────────────
    // Count both books, broker-perspective:
    //   - B-Book position contributes +volume_lots with broker direction
    //     inverse of client action (`action === 'SELL'` → client sold →
    //     broker is LONG). Uses MT5 lots natively.
    //   - Coverage position contributes the LP side as placed. Needs a
    //     contracts→lots conversion (TE reports in contracts).
    // This way the Positions/Long/Short/Volume line reflects EVERY position
    // the operator is responsible for, not just the B-Book side. Orphan
    // Coverage (client closed, hedge still open) and Naked B-Book (client
    // open, no hedge) both show up in the tally.
    const bbFiltered = filterServer
      ? bBookPositions.filter((p) => p.nodeName === filterServer)
      : bBookPositions;

    let longCount     = 0;
    let shortCount    = 0;

    // Three distinct volume concepts, each in both lots and notional:
    //   bbookLots / bbookNotional       — house inventory
    //   coverageLots / coverageNotional — LP exposure (inclusive of orphans
    //                                     — client closed but hedge still on)
    //   Net Exposure is computed from per-symbol signed signed_lots below,
    //   so that EURUSD +5 B-Book and −5 Coverage cancel on the same symbol.
    let bbookLots = 0, bbookNotional = 0;
    let coverageLots = 0, coverageNotional = 0;

    // Per-symbol signed broker-perspective lots & notional, for Net Exposure.
    // Signed: broker long = +, broker short = −. Summed across the symbol so
    // B-Book and Coverage cancel where they offset.
    const symNet = new Map<string, { lots: number; notional: number; lotSize: number }>();
    // Class-aware lot-size resolver. Prefers mt5SymbolClass (built from LP
    // mappings) so broker-specific names like 'Gold' resolve to XAU lotSize=100
    // rather than falling into the FX default. Fallback is the original
    // substring heuristic for symbols that don't have a mapping.
    const getSymLotSize = (sym: string) => {
      const cls = mt5SymbolClass.get(sym);
      const isXAU = cls?.isXAU ?? sym.includes('XAU');
      const isBTC = cls?.isBTC ?? sym.includes('BTC');
      return isXAU ? 100 : isBTC ? 1 : 100000;
    };
    const upsertSym = (sym: string, signedLots: number) => {
      const lotSize = getSymLotSize(sym);
      const cur = symNet.get(sym) ?? { lots: 0, notional: 0, lotSize };
      cur.lots     += signedLots;
      cur.notional += signedLots * lotSize;
      symNet.set(sym, cur);
    };

    for (const p of bbFiltered) {
      // MT5 `action` is the client's action; broker is the inverse.
      const brokerLong = p.action === 'SELL';
      if (brokerLong) longCount++; else shortCount++;
      const lotSize = getSymLotSize(p.symbol);
      bbookLots     += p.volume_lots;
      bbookNotional += p.volume_lots * lotSize;
      // Signed broker direction for per-symbol net exposure.
      upsertSym(p.symbol, brokerLong ? p.volume_lots : -p.volume_lots);
    }

    // Coverage positions — broker direction is the LP side as placed, so
    // `side === 'BUY'` (or long_qty > 0) means broker long on LP.
    for (const p of aBookPositions) {
      if (!p.position_id || p.open_price <= 0) continue;
      const isLong = p.side === 'LONG' || p.side === 'BUY'
        || (p.long_qty > 0 && p.short_qty === 0);
      const isShort = p.side === 'SHORT' || p.side === 'SELL'
        || (p.short_qty > 0 && p.long_qty === 0);
      if (!isLong && !isShort) continue;
      if (isLong) longCount++; else shortCount++;
      // Convert TE contracts → MT5 lots (same math as the aggregator).
      const ins = instrMap[p.symbol];
      const isXAU = p.symbol.includes('XAU');
      const isBTC = p.symbol.includes('BTC');
      const lotSize = isXAU ? 100 : isBTC ? 1 : 100000;
      const minVol  = ins?.min_trade_vol ?? (isXAU ? 10 : isBTC ? 1 : 100000);
      const qtyContracts = Math.abs(p.net_qty) || Math.max(p.long_qty, p.short_qty);
      const lots = (qtyContracts * minVol) / lotSize;
      coverageLots     += lots;
      coverageNotional += lots * lotSize;
      upsertSym(p.symbol, isLong ? lots : -lots);
    }

    // Net Exposure — Σ |per-symbol signed net|. This is the residual
    // directional risk after B-Book and Coverage offset each other on
    // matched symbols. Perfect hedge → 0; orphans and naked positions
    // contribute their full magnitude.
    let netExposureLots = 0;
    let netExposureNotional = 0;
    for (const v of symNet.values()) {
      netExposureLots     += Math.abs(v.lots);
      netExposureNotional += Math.abs(v.notional);
    }

    const totalLots     = bbookLots + coverageLots;
    const totalNotional = bbookNotional + coverageNotional;

    const positions = longCount + shortCount;

    // ── Float P/L — broker-perspective sum across both books ──────────────
    // MT5 `profit` is client-side (BBookPage line 78: `profit: -raw.profit`).
    // Negate to get broker's float. Coverage rows already store broker-side
    // P/L, so sum them directly.
    const bbookFloat    = bbFiltered.reduce((s, p) => s - (p.profit ?? 0), 0);
    const coverageFloat = hedgeExposureData
      .filter((r) => !r.isBBook)
      .reduce((s, r) => s + (r.brokerFloatingPL ?? 0), 0);
    const floatPnl = bbookFloat + coverageFloat;

    // ── Net P/L — Float + swap + commission, both sides.
    // B-Book swap/commission follow BBookPage's convention (not negated —
    // treated as already-broker-side; see BBookPage stats.netPnL line 437).
    // Coverage swap/commission from dailyStats (backend-sourced; TE doesn't
    // populate per-position swap reliably). Best-effort until the backend
    // reports Coverage swap/commission consistently — 0 fallback on null.
    const bbookSwap = bbFiltered.reduce((s, p) => s + (p.swap ?? 0) + (p.commission ?? 0), 0);
    const coverageSwapComm = (coverageDailyStats?.swap_net ?? 0) + (coverageDailyStats?.commission ?? 0);
    const netPnl = floatPnl + bbookSwap + coverageSwapComm;

    // ── Realised P/L Today — backend (Coverage) + client-side accumulator (B-Book).
    // Survives full-day close-outs because both sources persist across
    // zero-position states. B-Book side is a client-side approximation until
    // a proper MT5 closed-position endpoint exists — flagged via isBBookRealisedEstimated.
    const bbookRealised    = bBookDayStats?.realized_pnl ?? 0;
    const coverageRealised = coverageDailyStats?.realized_pnl ?? 0;
    const realisedPnl      = bbookRealised + coverageRealised;

    // ── Hedge metrics — built from grid-row values (already broker-perspective).
    // For each symbol we need the broker-side B-Book net volume, LP-side
    // Coverage net volume, and the float P/L on each side. All four come from
    // rows the aggregators produced above, which means sign and unit are
    // already consistent with everything else on the page.
    //
    // Populates TWO outputs:
    //   1. perSymbolMetrics (Map<symbol, { hedgeRatio, hedgeEfficiency, status }>)
    //      — read by the per-symbol grid columns and also by the symbol-group
    //      roll-up valueGetters (currently pass-through since we have at most
    //      one B-Book and one Coverage row per symbol; future multi-LP would
    //      re-aggregate here).
    //   2. portfolio-level hedgedRatio for the header bar.
    type SymAgg = { bLots: number; cLots: number; bPnl: number; cPnl: number };
    const perSymbolAgg = new Map<string, SymAgg>();
    for (const r of hedgeExposureData) {
      // Key on groupSymbol — the canonical mt5-side identifier — so the
      // B-Book leg and the (possibly remapped) Coverage leg of one logical
      // instrument land in the same bucket. Keying on r.symbol would split
      // them whenever an LP mapping renames the lp_symbol (e.g. TE 'XAUUSD'
      // ↔ MT5 'Gold'), and the Hedge Ratio column queried by group key
      // ('Gold') would only see the B-Book side and read 0 % coverage.
      const key = r.groupSymbol;
      const cur = perSymbolAgg.get(key) ?? { bLots: 0, cLots: 0, bPnl: 0, cPnl: 0 };
      if (r.isBBook) {
        cur.bLots += r.brokerNetVol;            // signed, broker direction
        cur.bPnl  += r.brokerFloatingPL ?? 0;   // broker-side float
      } else {
        cur.cLots += r.brokerNetVol;            // signed, LP direction
        cur.cPnl  += r.brokerFloatingPL ?? 0;
      }
      perSymbolAgg.set(key, cur);
    }

    const perSymbolMetrics = new Map<string, {
      hedgeRatio:  number | null;   // null when undefined (no B-Book)
      hedgeImpact: 'HEDGE_WORKING' | 'HEDGE_DRAG' | 'BONUS' | 'DOUBLE_LOSS' | 'FLAT' | null;
      status:      'MATCHED' | 'PARTIAL' | 'OVER' | 'ORPHAN' | 'NAKED' | 'WRONG-WAY' | 'FLAT';
    }>();

    // P/L threshold below which Hedge Impact stays blank — prevents the
    // four-state flag from flickering on rounding noise when the book is
    // sitting near break-even. $5 picked so a full mini-lot of spread doesn't
    // trip a state change.
    const IMPACT_FLOOR = 5.0;

    let matchedSum = 0;
    let bAbsSum    = 0;

    for (const [sym, a] of perSymbolAgg) {
      const bAbs = Math.abs(a.bLots);
      const cAbs = Math.abs(a.cLots);
      bAbsSum += bAbs;

      let hedgeRatio: number | null = null;
      let hedgeImpact: 'HEDGE_WORKING' | 'HEDGE_DRAG' | 'BONUS' | 'DOUBLE_LOSS' | 'FLAT' | null = null;
      let status: 'MATCHED' | 'PARTIAL' | 'OVER' | 'ORPHAN' | 'NAKED' | 'WRONG-WAY' | 'FLAT';

      if (bAbs === 0 && cAbs === 0) {
        status = 'FLAT';
      } else if (bAbs === 0 && cAbs > 0) {
        // Orphan over-hedge — client closed their side, broker's LP hedge still open.
        status = 'ORPHAN';
      } else if (bAbs > 0 && cAbs === 0) {
        // No hedge against an active B-Book position — directional risk wide open.
        status = 'NAKED';
        hedgeRatio = 0;
      } else {
        // Both sides present. Opposite signs → a legitimate hedge.
        const opposed = (a.bLots > 0 && a.cLots < 0) || (a.bLots < 0 && a.cLots > 0);
        if (!opposed) {
          // Same direction — hedge is doubling up, not offsetting.
          status     = 'WRONG-WAY';
          hedgeRatio = 0;
        } else {
          const matched = Math.min(bAbs, cAbs);
          matchedSum += matched;
          // Hedge Ratio = Coverage / B-Book (signed magnitudes).
          //   100%  → matched (coverage equals book)
          //   <100% → partial (broker still net-exposed in book direction)
          //   >100% → over-hedge (broker has more LP coverage than book —
          //                       creates exposure on the LP side)
          // Earlier formula was min(b,c)/b which capped at 100% and hid over-
          // hedge entirely; surfacing the actual ratio lets the operator see
          // both directions of mismatch in a single number.
          hedgeRatio = cAbs / bAbs;
          if (cAbs > bAbs)       status = 'OVER';
          else if (cAbs < bAbs)  status = 'PARTIAL';
          else                   status = 'MATCHED';
        }
      }

      // ── Hedge Impact ────────────────────────────────────────────────────
      // Answers "is my hedge helping right now?" in four discrete states based
      // on the live P/L signs of each side. Blanked when either side is below
      // IMPACT_FLOOR — a nearly-flat book doesn't have a meaningful state.
      //
      //   B-Book | Coverage | Reading
      //   -------|----------|---------------------
      //   profit | profit   | BONUS         (both sides winning — hedge aligned with move)
      //   profit | loss     | HEDGE_DRAG    (broker winning, hedge eating into it — cost of insurance)
      //   loss   | profit   | HEDGE_WORKING (broker losing, hedge offsetting — what hedging is for)
      //   loss   | loss     | DOUBLE_LOSS   (both sides losing — hedge misaligned)
      //
      // Only renders on MATCHED/PARTIAL/OVER rows — on NAKED/ORPHAN/WRONG-WAY
      // the Status column already tells the whole story.
      if (status === 'MATCHED' || status === 'PARTIAL' || status === 'OVER') {
        const bSig = Math.abs(a.bPnl) < IMPACT_FLOOR ? 0 : (a.bPnl > 0 ? 1 : -1);
        const cSig = Math.abs(a.cPnl) < IMPACT_FLOOR ? 0 : (a.cPnl > 0 ? 1 : -1);
        if (bSig === 0 && cSig === 0) hedgeImpact = 'FLAT';
        else if (bSig >= 0 && cSig >= 0 && (bSig + cSig) > 0) hedgeImpact = 'BONUS';
        else if (bSig > 0 && cSig < 0)  hedgeImpact = 'HEDGE_DRAG';
        else if (bSig < 0 && cSig > 0)  hedgeImpact = 'HEDGE_WORKING';
        else if (bSig < 0 && cSig < 0)  hedgeImpact = 'DOUBLE_LOSS';
        else hedgeImpact = 'FLAT'; // mixed with one side flat — don't mislead
      }

      perSymbolMetrics.set(sym, { hedgeRatio, hedgeImpact, status });
    }

    // Portfolio Hedged Ratio = Σ matched / Σ |B-Book|. Only symbols with
    // active B-Book positions contribute to the denominator (orphans don't
    // make the book "less hedged" in this metric — they're flagged by status
    // in the grid instead).
    const hedgedRatio = bAbsSum > 0 ? matchedSum / bAbsSum : null;

    return {
      positions,
      longCount, shortCount,
      // Volume cells — three honest numbers:
      //   • B-Book       : house inventory
      //   • Coverage     : LP exposure (inclusive of orphans)
      //   • Net Exposure : residual directional risk after offset
      bbookLots, bbookNotional,
      coverageLots, coverageNotional,
      netExposureLots, netExposureNotional,
      totalLots, totalNotional, // retained for any downstream consumer
      floatPnl,
      netPnl,
      realisedPnl,
      hedgedRatio,
      perSymbolMetrics,
      // Flags for UI polish
      isBBookRealisedEstimated: bbookRealised !== 0,
      hasCoverageRealised:      coverageDailyStats != null,
    };
  }, [bBookPositions, aBookPositions, instrMap, filterServer, hedgeExposureData, coverageDailyStats, bBookDayStats, priceTickCounter, mt5SymbolClass]);

  // ── STABILIZER FOR COLUMN DEFS ───────────────────────────────────────────
  // `headerStats.perSymbolMetrics` recomputes every MD tick (~10/sec under
  // load). If the column-defs useMemo depends on `headerStats` directly, the
  // entire column-defs array identity churns on every tick, which makes AG
  // Grid tear down and rebuild every cell renderer — including the built-in
  // group-expand checkbox. That rebuild triggers a setState deep inside AG
  // Grid (setCheckboxSpacing), which triggers another component update, which
  // re-runs the column-defs memo. Infinite loop → "Maximum update depth
  // exceeded" → blank page.
  //
  // Fix: mirror perSymbolMetrics into a ref. The ref identity never changes,
  // so columns stay stable. valueGetters read from the ref's current value,
  // which updates synchronously alongside headerStats.
  const perSymbolMetricsRef = useRef(headerStats.perSymbolMetrics);
  useEffect(() => {
    perSymbolMetricsRef.current = headerStats.perSymbolMetrics;
    // Nudge AG Grid to re-run valueGetters on the three ref-backed columns.
    // This is a cell-level refresh — does NOT rebuild cell renderers or
    // trigger the checkbox re-mount that caused the render loop.
    const api = exposureGridRef.current?.api;
    if (api) {
      try {
        api.refreshCells({
          columns: ['hedgeRatio', 'hedgeImpact', 'hedgeStatus'],
          force: true,
        });
      } catch { /* api not ready yet */ }
    }
  }, [headerStats.perSymbolMetrics]);

  const activeInstrument = useMemo(
    () => instruments.find((i) => i.symbol === domSymbol) ?? null,
    [instruments, domSymbol]
  );

  const instrDecimals = activeInstrument?.price_precision
    ?? (domSymbol.includes('JPY') ? 3 : (domSymbol.includes('XAU') || domSymbol.includes('BTC')) ? 2 : 5);

  const filteredInstruments = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase();
    const src = q
      ? instruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
      : instruments;
    return src.slice(0, 60);
  }, [instruments, symbolSearch]);

  const effectiveCaps = capabilities ?? {
    lp_id: domLpId, order_types: ['MARKET', 'LIMIT'], time_in_force: ['GTC', 'IOC', 'DAY'],
    max_order_qty: 10000000, min_order_qty: 1000, custom_fields: {},
  };

  const domLpInfo  = allLps.find((l) => l.lp_id === domLpId) ?? null;
  const isConnected = domLpInfo?.state === 'CONNECTED';
  const canBuy  = isConnected && !!domSymbol && !!domQtyLots && !submitting && !bBookSelected;
  const canSell = isConnected && !!domSymbol && !!domQtyLots && !submitting && !bBookSelected;

  // ==========================================================================
  // GRID FIT HELPERS
  // Per product decision: columns autosize to content on initial render and
  // on structural changes (column visibility, group toggle, mode toggle,
  // viewport resize). If the grid overflows the viewport, the user
  // horizontally scrolls — we never compress columns below their content
  // width. (The previous sizeColumnsToFit fallback would truncate values
  // on narrow screens, which defeats the point.)
  //
  // Manual-resize protection: once the user drags any column header to
  // resize, fitColumns becomes a no-op for the rest of the session. The
  // flag lives in a ref (no re-render on flip) and naturally resets when
  // the component remounts on page reload — matching the "leave it alone
  // until next refresh" semantic.
  // ==========================================================================
  const userResizedRef = useRef(false);
  const fitColumns = useCallback(() => {
    if (userResizedRef.current) return;
    const api = exposureGridRef.current?.api;
    if (!api) return;
    try { api.autoSizeAllColumns(false); } catch { /* no-op */ }
  }, []);

  // Manual-resize detector. AG Grid emits onColumnResized for many sources:
  // autoSizeColumns (us), api programmatic, and uiColumnDragged (the user).
  // We only flip the flag for genuine user drags AND only on the final
  // event of a drag (event.finished === true), so dragging mid-motion
  // doesn't latch us off prematurely.
  const onColumnResized = useCallback((e: ColumnResizedEvent) => {
    if (e.finished && e.source === 'uiColumnDragged') {
      userResizedRef.current = true;
    }
  }, []);

  // Initial group expansion — all symbols COLLAPSED by default. Runs once per
  // session; user's subsequent manual expand/collapse choices are preserved
  // because getRowId keeps row identity stable across data refreshes.
  // MUST be declared before onFirstDataRendered references it (JS const TDZ).
  const hasAppliedInitialExpansionRef = useRef(false);
  const applyInitialGroupExpansion = useCallback((api: any): number => {
    // Restrict to top-level groups (level === 0) to avoid touching child nodes.
    // forEachNodeAfterFilterAndSort follows display order — consistent with
    // what the user sees on screen. Returns the number of root groups touched
    // so the caller knows whether real data had arrived yet.
    let touched = 0;
    api.forEachNodeAfterFilterAndSort((node: any) => {
      if (!node.group || node.level !== 0) return;
      node.setExpanded(false);
      touched++;
    });
    return touched;
  }, []);

  // ── Fallback: onFirstDataRendered only fires once per grid mount, and can
  // fire before data has arrived from the backend (especially on a fresh
  // page load where WS/REST are still in flight). onRowDataUpdated fires on
  // every rowData refresh, so we retry the collapse there until real groups
  // are found — then latch off via hasAppliedInitialExpansionRef.
  const onRowDataUpdated = useCallback((e: { api: any }) => {
    if (hasAppliedInitialExpansionRef.current) return;
    const touched = applyInitialGroupExpansion(e.api);
    if (touched > 0) hasAppliedInitialExpansionRef.current = true;
  }, [applyInitialGroupExpansion]);

  const onFirstDataRendered = useCallback((e: FirstDataRenderedEvent<HedgeExposureRow>) => {
    // Staggered retry sequence — initial autosize is racey because
    //   • REST bootstrap may have rendered before WS SNAPSHOT brings the
    //     full set of symbols / longer P/L strings / new columns of data.
    //   • IBM Plex Mono may not have finished loading at the moment AG Grid
    //     measures cell content — it'll measure with the fallback font and
    //     pick a width that's wrong once the real font swaps in.
    //   • AG Grid theme CSS occasionally settles a tick after the grid
    //     mounts (depends on bundling).
    // Multiple retries cheaply cover all three. fitColumns() short-circuits
    // if the user has already resized, so this never overwrites a manual
    // drag — the retries here only ever fire before the user has had a
    // chance to interact.
    requestAnimationFrame(fitColumns);
    setTimeout(fitColumns, 100);
    setTimeout(fitColumns, 300);
    setTimeout(fitColumns, 800);
    setTimeout(fitColumns, 1500);
    setTimeout(fitColumns, 3000);
    // Final pass after web fonts have actually loaded — handles the
    // measure-with-fallback-font race specifically.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => setTimeout(fitColumns, 50)).catch(() => { /* no-op */ });
    }
    // Only apply initial expansion once per session AND only once real groups
    // have appeared — if the first render was before data arrived, we'd mark
    // the flag prematurely and the groups would then come up in whatever
    // default state the grid chose. applyInitialGroupExpansion returns the
    // number of root groups it touched; we only flip the flag when > 0.
    if (!hasAppliedInitialExpansionRef.current) {
      const touched = applyInitialGroupExpansion(e.api);
      if (touched > 0) hasAppliedInitialExpansionRef.current = true;
    }
  }, [fitColumns, applyInitialGroupExpansion]);
  const onGridSizeChanged    = useCallback((_e: GridSizeChangedEvent<HedgeExposureRow>) => fitColumns(), [fitColumns]);
  const onColumnVisible      = useCallback((_e: ColumnVisibleEvent) => fitColumns(), [fitColumns]);
  const onColumnRowGroupChanged = useCallback((_e: ColumnRowGroupChangedEvent) => fitColumns(), [fitColumns]);

  useEffect(() => { setTimeout(fitColumns, 50); }, [fitColumns]);
  useEffect(() => { setTimeout(fitColumns, 50); }, [volumeDisplayMode, fitColumns]);

  // Symbol-set change detector — drives initial autosize (the first time
  // non-empty data appears) and re-fits when the universe of symbols changes
  // mid-session (new instrument, position fully closed). Skips trivial price-
  // tick refreshes by keying off the displayed groupSymbol set rather than the
  // hedgeExposureData reference itself, which churns on every MD tick.
  //
  // Why this is needed: onFirstDataRendered fires once per grid mount and can
  // race ahead of the WS SNAPSHOT. If REST-bootstrapped rows render first,
  // the staggered retries autosize to those (potentially empty / partial)
  // widths, and then nothing re-fits when the WS SNAPSHOT arrives with the
  // real set of symbols. This effect catches that case.
  //
  // The first-time path runs the full retry sequence (RAF + 100/300/800ms +
  // fonts.ready) — same race conditions as initial render. Subsequent
  // symbol-set changes get a single 50ms-delayed autosize, which is enough
  // because fonts/theme/etc are settled by then.
  //
  // userResizedRef is checked inside fitColumns, so once the user manually
  // resizes a column, none of these passes overwrite their drag.
  const lastSymbolSetRef = useRef<string>('');
  useEffect(() => {
    if (hedgeExposureData.length === 0) return;
    const symbolSetKey = [...new Set(hedgeExposureData.map((r) => r.groupSymbol))].sort().join('|');
    if (symbolSetKey === lastSymbolSetRef.current) return;
    const isFirstNonEmpty = lastSymbolSetRef.current === '';
    lastSymbolSetRef.current = symbolSetKey;
    if (isFirstNonEmpty) {
      requestAnimationFrame(fitColumns);
      setTimeout(fitColumns, 100);
      setTimeout(fitColumns, 300);
      setTimeout(fitColumns, 800);
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => setTimeout(fitColumns, 50)).catch(() => { /* no-op */ });
      }
    } else {
      setTimeout(fitColumns, 50);
    }
  }, [hedgeExposureData, fitColumns]);

  // Note: the previous `useEffect([hedgeExposureData])` that walked every node
  // and re-called node.setExpanded(true) has been removed. It fired on every MD
  // tick (many times per second) and was a primary cause of grid flashing.
  // With getRowId + immutable rowData diff, AG Grid preserves group expansion
  // across updates automatically; expandedGroupsRef is retained only as a hint
  // for any future session-restore / tab-switch recovery.

  // ==========================================================================
  // COLUMN DEFINITIONS
  // Layout conventions:
  //   • Header + data both LEFT-aligned (no type: rightAligned mix). Autosize
  //     calculates widths from content; centre/right-aligned headers with
  //     left-aligned cells wasted column width.
  //   • No per-column filters (no funnel icons on headers) — the page-level
  //     MT5 Node filter in the toolbar is the only filter we surface.
  //   • Numeric cells use 'font-mono' so digits align; headers stay in sans.
  //
  // Colour conventions:
  //   • Net Vol direction:  teal / amber (BBookPage convention)
  //   • Broker P/L:         muted green / muted red (branding palette)
  // ==========================================================================
  const exposureColDefs = useMemo<ColDef<HedgeExposureRow>[]>(() => {
    // Money formatter — US thousands separators, always 2 decimals:
    //   $4,567.30  /  $5,123,456.78  /  -$1,234.56
    const fmtMoney = (val: number) => {
      const abs = Math.abs(val).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${val < 0 ? '-' : ''}$${abs}`;
    };
    const fmtLots = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
    // Notional column shows UNITS of the base instrument (oz for XAU, EUR for
    // EURUSD, etc.), not USD value. So no $ prefix. K/M suffix kept for
    // readability on large unit counts.
    const fmtNotional = (val: number) => {
      const abs = Math.abs(val);
      if (abs >= 1_000_000) return `${val < 0 ? '-' : '+'}${(abs / 1_000_000).toFixed(2)}M`;
      if (abs >= 1_000)     return `${val < 0 ? '-' : '+'}${(abs / 1_000).toFixed(1)}K`;
      return `${val < 0 ? '-' : '+'}${abs.toFixed(2)}`;
    };
    const volColor   = (val: number) => ({ color: val > 0 ? '#49b3b3' : val < 0 ? '#e0a020' : '#999' });
    const plColor    = (val: number) => ({ color: val > 0 ? '#6aaa78' : val < 0 ? '#d07070' : '#999' });
    const signalColor = (signal: string) =>
      signal.startsWith('Hdg') ? '#49b3b3' : signal.startsWith('Opp') ? '#c09060' : '#666';

    return [
      // Grouping driver — hidden. Drives the parent rows so B-Book and Coverage
      // legs of the same logical instrument land under one group, even when
      // they have different lp/mt5 symbol strings (e.g. 'Gold' on MT5 ↔
      // 'XAUUSD' on TraderEvolution).
      { field: 'groupSymbol', rowGroup: true, hide: true, lockVisible: true },
      // Visible Symbol column — shows the leaf row's actual venue-side symbol
      // (mt5_symbol on B-Book, lp_symbol on Coverage). Group rows render blank
      // here because the parent identity is already shown in the auto-group
      // column to the left.
      { field: 'symbol', headerName: 'Symbol' },
      {
        field: 'lp', headerName: 'Liquidity Provider',
        // No [B]/[C] badges — the LP name itself carries enough context
        // (`B-Book-Ross Weiler` vs `Coverage-TraderEvolution`). Colour keeps
        // the book distinction without the extra visual noise.
        cellRenderer: (p: { value: string; data?: HedgeExposureRow }) => {
          if (!p.data) return p.value;
          return (
            <span style={{ color: p.data.isBBook ? '#49b3b3' : '#c09060' }}>{p.value}</span>
          );
        },
      },
      { field: 'lpAccount', headerName: 'Account' },
      {
        field: volumeDisplayMode === 'Lots' ? 'brokerNetVol' : 'brokerNetNotional',
        headerName: 'Net Vol.',
        aggFunc: 'sum',
        cellClass: 'font-mono',
        valueFormatter: (p) => p.value == null ? '' : volumeDisplayMode === 'Lots' ? fmtLots(Number(p.value)) : fmtNotional(Number(p.value)),
        cellStyle: (p) => p.value != null ? volColor(Number(p.value)) : {},
      },
      {
        field: 'breakEvenPrice', headerName: 'Break-Even Px',
        aggFunc: 'avg',
        cellClass: 'font-mono',
        valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(5) : '',
      },
      {
        field: 'avgPrice', headerName: 'Mkt Px',
        // Parent (group) Mkt Px: live close-out market price for the
        // aggregate net position — NOT a weighted/simple average of the
        // children's Mkt Px (which mixes BID and ASK across B-Book and
        // Coverage children and produces a meaningless mid-of-mids).
        //
        // Rule (matches the leaf logic):
        //   sum(brokerNetVol) > 0  (broker net long)  → BID
        //   sum(brokerNetVol) < 0  (broker net short) → ASK
        //   sum(brokerNetVol) = 0  (flat)             → BID by convention
        //
        // Source of BID/ASK: live FIX MD subscription in currentPricesRef,
        // keyed on the LP-side symbol. We find that LP symbol by looking
        // at a Coverage leaf child (whose `symbol` is the LP-side identifier
        // by construction — see aggregateCoverageBookPositions row build).
        // For orphan B-Book groups with no Coverage leg, currentPricesRef
        // has no entry, so we fall back to a leaf's already-resolved
        // avgPrice (which is itself BID-or-ASK aligned to that leaf's own
        // net direction via aggregateBBookPositions).
        aggFunc: (params: any) => {
          const node = params?.rowNode;
          const leaves = (node && node.allLeafChildren) || [];
          if (leaves.length === 0) return null;

          let sumNet = 0;
          let lpSymbol: string | null = null;
          for (const lf of leaves) {
            const d = lf?.data;
            if (!d) continue;
            sumNet += (d.brokerNetVol as number) || 0;
            if (lpSymbol === null && d.isBBook === false && typeof d.symbol === 'string') {
              lpSymbol = d.symbol;
            }
          }

          let bid: number | undefined;
          let ask: number | undefined;
          if (lpSymbol) {
            bid = currentPricesRef.current.get(lpSymbol + ':bid');
            ask = currentPricesRef.current.get(lpSymbol + ':ask');
          }

          // Pick BID/ASK from live MD per the rule.
          if (sumNet > 0) {
            if (bid != null && bid > 0) return bid;
            if (ask != null && ask > 0) return ask;   // one-sided LP feed fallback
          } else if (sumNet < 0) {
            if (ask != null && ask > 0) return ask;
            if (bid != null && bid > 0) return bid;   // one-sided LP feed fallback
          } else {
            if (bid != null && bid > 0) return bid;
            if (ask != null && ask > 0) return ask;
          }

          // No LP MD for this symbol (orphan). Pick a leaf whose own
          // direction matches the parent's net; otherwise just the first leaf.
          if (sumNet !== 0) {
            for (const lf of leaves) {
              const lfNet = (lf?.data?.brokerNetVol as number) || 0;
              if ((sumNet > 0 && lfNet > 0) || (sumNet < 0 && lfNet < 0)) {
                const v = lf?.data?.avgPrice;
                if (typeof v === 'number' && v > 0) return v;
              }
            }
          }
          for (const lf of leaves) {
            const v = lf?.data?.avgPrice;
            if (typeof v === 'number' && v > 0) return v;
          }
          return null;
        },
        cellClass: 'font-mono',
        valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(5) : '',
      },
      {
        field: 'brokerFloatingPL', headerName: 'Broker P/L',
        aggFunc: 'sum',
        cellClass: 'font-mono',
        valueFormatter: (p) => p.value == null ? '' : fmtMoney(Number(p.value)),
        cellStyle: (p) => p.value != null ? plColor(Number(p.value)) : {},
      },

      // ── Hedge Ratio (per-symbol, group rows only) ────────────────────────
      // A single symbol-level metric — not a B-Book-vs-Coverage-row metric —
      // so it's blanked on leaf rows entirely. The value is the Coverage-to-
      // B-Book magnitude ratio (see headerStats.perSymbolMetrics):
      //   100%      → matched
      //   below 100 → partial / under-hedged
      //   above 100 → over-hedged (LP coverage exceeds the book)
      // Colour bands flag both directions of mismatch:
      //   95%–105% → green (effectively matched)
      //   80%–94% under or 106%–120% over → amber (slight off)
      //   anything else → red (significant)
      {
        colId: 'hedgeRatio',
        headerName: 'Hedge Ratio',
        cellClass: 'font-mono',
        valueGetter: (p) => {
          if (!p.node?.group) return null;            // leaves: no value
          const sym = p.node.key as string | undefined;
          if (!sym) return null;
          const m = perSymbolMetricsRef.current.get(sym);
          return m?.hedgeRatio ?? null;
        },
        valueFormatter: (p) => {
          if (!p.node?.group)  return '';             // leaves: blank cell
          if (p.value == null) return '—';
          return `${(Number(p.value) * 100).toFixed(1)}%`;
        },
        cellStyle: (p) => {
          if (p.value == null || !p.node?.group) return {};
          const v = Number(p.value);
          if (v >= 0.95 && v <= 1.05)                              return { color: '#6aaa78' };
          if ((v >= 0.80 && v < 0.95) || (v > 1.05 && v <= 1.20))  return { color: '#c09060' };
          return { color: '#d07070' };
        },
      },

      // ── Hedge Impact (per-symbol) ────────────────────────────────────────
      // Answers "is my hedge helping right now?" in four discrete states
      // driven by the live P/L signs of each side:
      //   HEDGE WORKING  — broker losing on B-Book, hedge profiting (offset)
      //   HEDGE DRAG     — broker winning on B-Book, hedge losing (cost of insurance)
      //   BONUS          — both sides winning (hedge aligned with move)
      //   DOUBLE LOSS    — both sides losing (hedge misaligned — red flag)
      //   —              — book near flat or side without a matching peer
      // Renders only on MATCHED / PARTIAL / OVER symbols — for
      // ORPHAN / NAKED / WRONG-WAY the Status column already tells the story.
      {
        colId: 'hedgeImpact',
        headerName: 'Hedge Impact',
        valueGetter: (p) => {
          const sym = (p.node?.group ? p.node.key : p.data?.symbol) as string | undefined;
          if (!sym) return '';
          const m = perSymbolMetricsRef.current.get(sym);
          return m?.hedgeImpact ?? '';
        },
        cellRenderer: (p: { value: string; node?: { group?: boolean } }) => {
          if (!p.value || !p.node?.group) return null;
          // Palette — lifted-but-muted per branding guideline (no neon, no
          // pure saturation, "border glow" for alert states). FG bumped ~20%
          // lightness vs the previous tones; borders brightened so the badge
          // reads as a ring against the dark grid background; fontWeight 600
          // so 11px badge text doesn't get lost.
          const palette: Record<string, { c: string; bg: string; border: string; label: string }> = {
            HEDGE_WORKING: { c: '#5ed4d4', bg: '#1b2d2d', border: '#4a8a8a', label: 'HEDGE WORKING' },
            HEDGE_DRAG:    { c: '#e0b075', bg: '#2a241a', border: '#8a6d44', label: 'HEDGE DRAG'    },
            BONUS:         { c: '#80cc90', bg: '#1a2620', border: '#5a8a68', label: 'BONUS'         },
            DOUBLE_LOSS:   { c: '#e88a8a', bg: '#2a1a1d', border: '#8a4a52', label: 'DOUBLE LOSS'   },
            FLAT:          { c: '#bbb',    bg: '#1a1a1d', border: '#666',    label: '—'             },
          };
          const s = palette[p.value] ?? palette.FLAT;
          return (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '0 6px', lineHeight: '16px',
              borderRadius: '3px',
              color: s.c, backgroundColor: s.bg, border: `1px solid ${s.border}`,
            }}>
              {s.label}
            </span>
          );
        },
      },

      // ── Hedge Status (per-symbol) ────────────────────────────────────────
      // Short-form tag surfacing the coverage state at a glance:
      //   ✓ MATCHED / PARTIAL / OVER / ORPHAN / NAKED / WRONG-WAY / FLAT
      {
        colId: 'hedgeStatus',
        headerName: 'Status',
        valueGetter: (p) => {
          const sym = (p.node?.group ? p.node.key : p.data?.symbol) as string | undefined;
          if (!sym) return '';
          const m = perSymbolMetricsRef.current.get(sym);
          return m?.status ?? '';
        },
        cellRenderer: (p: { value: string; node?: { group?: boolean } }) => {
          if (!p.value || !p.node?.group) return null;
          // Lifted-but-muted palette — kept in lock-step with the Hedge
          // Impact column above so the two tag columns share colour per state.
          const palette: Record<string, { c: string; bg: string; border: string }> = {
            MATCHED:     { c: '#80cc90', bg: '#1a2620', border: '#5a8a68' },
            PARTIAL:     { c: '#e0b075', bg: '#2a241a', border: '#8a6d44' },
            OVER:        { c: '#e0b075', bg: '#2a241a', border: '#8a6d44' },
            ORPHAN:      { c: '#e88a8a', bg: '#2a1a1d', border: '#8a4a52' },
            NAKED:       { c: '#e88a8a', bg: '#2a1a1d', border: '#8a4a52' },
            'WRONG-WAY': { c: '#e88a8a', bg: '#2a1a1d', border: '#8a4a52' },
            FLAT:        { c: '#bbb',    bg: '#1a1a1d', border: '#666'    },
          };
          const s = palette[p.value] ?? palette.FLAT;
          return (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '0 6px', lineHeight: '16px',
              borderRadius: '3px',
              color: s.c, backgroundColor: s.bg, border: `1px solid ${s.border}`,
            }}>
              {p.value === 'MATCHED' ? '✓ MATCHED' : p.value}
            </span>
          );
        },
      },

      {
        field: 'signal' as any, headerName: 'Signal',
        valueGetter: (p) => {
          if (!p.data) return '—';
          if (p.data.isBBook) return '—';
          return signalMap.get(p.data.symbol) ?? '—';
        },
        cellStyle: (p) => ({ color: signalColor(p.value || '—') }),
      },
    ];
  }, [volumeDisplayMode, signalMap]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: false,    // no per-column filter menus — the page toolbar has the only filter
    resizable: true,
    minWidth: 80,
    suppressHeaderMenuButton: true,  // hide the 3-dot menu next to each header
  }), []);
  const autoGroupColumnDef = useMemo<ColDef>(() => ({
    headerName: 'Symbol',
    minWidth: 150,
    cellRendererParams: { suppressCount: false },
  }), []);

  // ==========================================================================
  // GRID EVENT HANDLERS
  // ==========================================================================
  const onRowGroupOpened = useCallback((event: { node: { group: boolean; key?: string; expanded: boolean } }) => {
    if (!event.node.group || !event.node.key) return;
    if (event.node.expanded) expandedGroupsRef.current.add(event.node.key);
    else expandedGroupsRef.current.delete(event.node.key);
  }, []);

  const onExposureGridReady = useCallback((_event: GridReadyEvent<HedgeExposureRow>) => {
    // Data arrives in onFirstDataRendered, not here — see that handler.
    // Kept for future use (initial column state restoration, etc).
  }, []);

  // Refs mirror the latest domSymbol and instrMap so _handleRowSelect can be
  // a stable function (no deps that change per-click). Without this, changing
  // domSymbol would churn the callback, which churns onExposureRowClicked,
  // which makes AG Grid re-wire its handler mid-click — row clicks then fire
  // intermittently depending on which render is mid-flight when you click.
  const domSymbolRef = useRef(domSymbol);
  const instrMapRef  = useRef(instrMap);
  useEffect(() => { domSymbolRef.current = domSymbol; }, [domSymbol]);
  useEffect(() => { instrMapRef.current  = instrMap;  }, [instrMap]);

  const _handleRowSelect = useCallback((data: HedgeExposureRow | null, groupKey?: string) => {
    if (data) {
      setSelectedSymbol(data.symbol); // drives intraday monitor
      if (data.isBBook) {
        // B-Book row → mute the DOM Trader panel. These positions don't route
        // through the LP; letting the user place a FIX order here would be a
        // mistake. Clearing domSymbol tears down the book subscription too.
        setBBookSelected(true);
        if (domSymbolRef.current) { subscribedRef.current = ''; setDomSymbol(''); }
        setDomQtyLots('');
        setLimitPrice('');
      } else {
        // Coverage row → drive DOM to this symbol, un-mute and OPEN the drawer.
        setBBookSelected(false);
        setDomDrawerOpen(true);  // click-to-trade intent surfaces the panel
        if (data.symbol !== domSymbolRef.current) {
          subscribedRef.current = ''; // force re-subscribe on new symbol
          setDomSymbol(data.symbol);
          setShowPicker(false);
          setLimitPrice('');
          // Pre-fill qty from LP position size (in lots)
          const absLots = Math.abs(data.hedgeNetVol);
          if (absLots > 0) {
            const ins = instrMapRef.current[data.symbol];
            const minVol = ins?.min_trade_vol ?? 100000;
            setDomQtyLots(String(Math.round(absLots * minVol)));
          } else {
            setDomQtyLots('');
          }
        }
      }
    } else if (groupKey) {
      setSelectedSymbol(groupKey);
    }
  }, []);  // stable — refs cover all reactive reads

  const onExposureRowClicked = useCallback((event: RowClickedEvent<HedgeExposureRow>) => {
    if (event.data) {
      _handleRowSelect(event.data);
    } else if (event.node.group && event.node.key) {
      // Explicitly toggle expansion on group-row click. Default AG Grid
      // behaviour is unreliable under the current config (getRowId + no
      // animateRows interacts with group auto-expand inconsistently), so
      // we drive it ourselves.
      event.node.setExpanded(!event.node.expanded);
      _handleRowSelect(null, event.node.key);
    }
  }, [_handleRowSelect]);

  const onExposureCellClicked = useCallback((event: { data?: HedgeExposureRow; node?: { group?: boolean; key?: string; expanded?: boolean; setExpanded?: (v: boolean) => void } }) => {
    if (event.data) {
      _handleRowSelect(event.data);
    } else if (event.node?.group && event.node?.key) {
      if (event.node.setExpanded) event.node.setExpanded(!event.node.expanded);
      _handleRowSelect(null, event.node.key);
    }
  }, [_handleRowSelect]);

  // ==========================================================================
  // ORDER SUBMISSION
  // Payload shape matches CBookPage.submitOrder (which is the known-working
  // reference for /api/v1/fix/order). Key fields: qty (NOT quantity),
  // open_close: 'O' for new opens, product_type derived from symbol family.
  // ==========================================================================
  const submitOrder = useCallback(async (side: 'BUY' | 'SELL') => {
    const qty = parseFloat(domQtyLots.trim());
    if (!qty || qty <= 0 || !domLpId || !domSymbol || submitting) return;
    setSubmitting(true);
    const entry: ExecEntry = {
      clord_id: `pending-${Date.now()}`, ts: Date.now(),
      symbol: domSymbol, side, qty, orderType: domOrderType, tif: domTif, lpId: domLpId,
      status: 'SENT',
    };
    try {
      const body: Record<string, unknown> = {
        lp_id:         domLpId,
        symbol:        domSymbol,
        side,
        qty,                                    // C++ flat-path contract — NOT 'quantity'
        order_type:    domOrderType,
        time_in_force: domTif,
        open_close:    'O',
        product_type:  (domSymbol.includes('XAU') || domSymbol.includes('BTC') || domSymbol.includes('US') || domSymbol.includes('DE')) ? 'CFD' : 'FOREX',
      };
      if (domOrderType === 'LIMIT' || domOrderType === 'STOP') {
        const p = parseFloat(limitPrice);
        if (!p) {
          entry.status = 'REJECTED'; entry.rejectReason = `Price required for ${domOrderType}`;
          setExecLog((prev) => [entry, ...prev].slice(0, 10));
          setSubmitting(false);
          return;
        }
        body.price = p;
      }
      const r = await bff<FIXOrderResp>('/api/v1/fix/order', { method: 'POST', body: JSON.stringify(body) });
      if (r.success) {
        entry.clord_id = r.clord_id ?? '—';
        // No explicit refresh needed — POSITION_REPORT on the FIX WebSocket
        // will upsert the new position into aBookPositions as soon as it lands.
      } else {
        entry.status = 'REJECTED'; entry.rejectReason = r.error ?? 'Rejected';
      }
    } catch (err) {
      entry.status = 'REJECTED';
      entry.rejectReason = err instanceof Error ? err.message : 'Request failed';
    } finally {
      setSubmitting(false);
      setExecLog((prev) => [entry, ...prev].slice(0, 10));
    }
  }, [domLpId, domSymbol, submitting, domQtyLots, domOrderType, domTif, limitPrice]);

  // ==========================================================================
  // DOM DISPLAY HELPERS
  // ==========================================================================
  const lpDotColor = (st: string) =>
    st === 'CONNECTED' ? '#49b3b3' : st === 'DEGRADED' ? '#e0a020'
    : (st === 'CONNECTING' || st === 'RECONNECTING') ? '#a78bfa' : '#555';

  const bookBadge = (st: string) => ({
    HEALTHY:      { text: 'LIVE',  color: '#49b3b3' },
    STALE:        { text: 'STALE', color: '#e0a020' },
    RESYNCING:    { text: 'SYNC',  color: '#a78bfa' },
    SUBSCRIBING:  { text: 'SUB…',  color: '#666'    },
    EMPTY:        { text: 'WAIT',  color: '#666'    },
    ERROR:        { text: 'ERR',   color: '#ff5c5c' },
    DISCONNECTED: { text: 'DISC',  color: '#ff5c5c' },
  }[st] ?? { text: st, color: '#555' });

  const fmtBookSize = (sz: number) =>
    sz >= 1_000_000 ? `${(sz / 1_000_000).toFixed(1)}M`
    : sz >= 100_000  ? `${(sz / 100_000).toFixed(2)}L`
    : sz >= 1_000    ? `${(sz / 1_000).toFixed(1)}K`
    : sz.toFixed(0);

  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  // Money formatter used in the header card — matches the grid's fmtMoney:
  //   $4,567.30  /  $5,123,456.78  /  -$1,234.56
  const fmtHdrMoney = (val: number) => {
    const abs = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${val < 0 ? '-' : ''}$${abs}`;
  };

  // Notional formatter for the header card's Volume cells.
  // Full precision with thousands separators — no K/M compaction, so a 500
  // orphan sitting alongside a 1.8M gross is never silently rounded away:
  //   500.50
  //   1,800,500
  //   5,123,456
  // Unsigned — Volume is always a magnitude, not a direction. No $ prefix:
  // these are UNITS of the base instrument (oz, EUR, etc.), not currency.
  // Decimals only appear when the value has a fractional component.
  const fmtHdrNotional = (val: number) => {
    const abs = Math.abs(val);
    const hasFraction = Math.abs(abs - Math.round(abs)) > 0.001;
    return abs.toLocaleString('en-US', {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* ── Page Header — title + Overall Net Exposure card on one row ───
          Title and card sit side-by-side. On narrow viewports the card drops
          below as a unit (flex-wrap) without breaking internally.
          Card mirrors the CBook strategy-card aesthetic: teal left-border,
          dark fill, four column clusters separated by hairlines:
            1. Positions / Long·Short          — position counts
            2. B-Book Vol / Coverage Vol /     — volume breakdown
               Net Exposure
            3. Float P/L / Net P/L /           — P/L readouts
               Realised P/L
            4. Hedged Ratio                    — portfolio coverage health
          Hedge Impact and Status are per-symbol metrics in the grid below. */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between gap-4 flex-wrap">
        {/* Title — left */}
        <div>
          <h1 className="text-lg font-semibold text-white">Net Exposure</h1>
          <p className="text-xs text-[#999]">Overall Net Exposure</p>
        </div>

        {/* Overall-exposure card — right */}
        <div
          className="inline-flex items-stretch gap-4 rounded px-4 py-2 text-base"
          style={{
            backgroundColor: '#252429',
            border: '1px solid #49b3b344',
            borderLeft: '3px solid #49b3b3',
          }}
        >
          {/* GROUP 1 — positions */}
          <div className="flex items-center gap-5">
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Positions</div>
              <div className="font-mono text-white">{headerStats.positions}</div>
            </div>
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Long / Short</div>
              <div className="font-mono">
                <span style={{ color: '#49b3b3' }}>{headerStats.longCount}</span>
                <span className="text-[#505050]"> / </span>
                <span style={{ color: '#e0a020' }}>{headerStats.shortCount}</span>
              </div>
            </div>
          </div>

          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* GROUP 2 — volumes
              Three honest numbers answering different questions:
                B-Book Vol   : house inventory (what you're warehousing)
                Coverage Vol : LP exposure inclusive of orphans (what's pushed out)
                Net Exposure : residual directional risk after symbol-by-symbol offset */}
          <div className="flex items-center gap-5">
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">B-Book Vol</div>
              <div className="font-mono text-white">
                {volumeDisplayMode === 'Lots'
                  ? `${headerStats.bbookLots.toFixed(2)} lots`
                  : fmtHdrNotional(headerStats.bbookNotional)}
              </div>
            </div>
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Coverage Vol</div>
              <div className="font-mono text-white">
                {volumeDisplayMode === 'Lots'
                  ? `${headerStats.coverageLots.toFixed(2)} lots`
                  : fmtHdrNotional(headerStats.coverageNotional)}
              </div>
            </div>
            <div title="Residual directional risk after B-Book and Coverage net out per symbol. Perfect hedge = 0; orphan and naked positions contribute their full magnitude.">
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Net Exposure</div>
              <div className="font-mono text-white">
                {volumeDisplayMode === 'Lots'
                  ? `${headerStats.netExposureLots.toFixed(2)} lots`
                  : fmtHdrNotional(headerStats.netExposureNotional)}
              </div>
            </div>
          </div>

          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* GROUP 3 — P/L */}
          <div className="flex items-center gap-5">
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Float P/L</div>
              <div className="font-mono" style={{
                color: headerStats.floatPnl > 0 ? '#6aaa78' : headerStats.floatPnl < 0 ? '#d07070' : '#d2d6e2',
              }}>
                {fmtHdrMoney(headerStats.floatPnl)}
              </div>
            </div>
            <div>
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Net P/L</div>
              <div className="font-mono" style={{
                color: headerStats.netPnl > 0 ? '#6aaa78' : headerStats.netPnl < 0 ? '#d07070' : '#d2d6e2',
              }}>
                {fmtHdrMoney(headerStats.netPnl)}
              </div>
            </div>
            <div title="Coverage side from backend daily-stats. B-Book side accumulated client-side until MT5 closed-position endpoint is available.">
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Realised P/L</div>
              <div className="font-mono" style={{
                color: headerStats.realisedPnl > 0 ? '#6aaa78' : headerStats.realisedPnl < 0 ? '#d07070' : '#d2d6e2',
              }}>
                {fmtHdrMoney(headerStats.realisedPnl)}
              </div>
            </div>
          </div>

          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* GROUP 3 — portfolio hedge coverage */}
          <div className="flex items-center gap-5">
            <div title="Portfolio Hedged Ratio: client-direction lots covered by an opposite-direction hedge, summed across symbols. 100% = every B-Book lot has a matching Coverage lot in the opposite direction. Per-symbol breakdown in the grid below.">
              <div className="text-sm uppercase tracking-wider text-white mb-0.5">Hedged Ratio</div>
              {headerStats.hedgedRatio != null ? (
                <div className="font-mono" style={{
                  color: headerStats.hedgedRatio >= 0.95 ? '#6aaa78'
                    : headerStats.hedgedRatio >= 0.8  ? '#c09060' : '#d07070',
                }}>
                  {(headerStats.hedgedRatio * 100).toFixed(1)}%
                </div>
              ) : (
                <div className="font-mono text-[#666]">—</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-2 pt-2 pb-12">

        {/* Filter bar — matches BBookPage pattern (strip across top, not scattered chips) */}
        <div className="px-2 py-1.5 mb-2 border-b border-[#505050] flex items-center gap-4 flex-wrap" style={{ backgroundColor: '#2a292c' }}>
          <span className="text-[10px] text-[#666] uppercase tracking-wider font-medium">Filters</span>

          {/* MT5 Node (master-only) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#999] uppercase tracking-wider font-medium">MT5 Node:</span>
            <select
              value={filterServer}
              onChange={(e) => setFilterServer(e.target.value)}
              className="w-[220px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
            >
              {serverOptions.map((s) => (
                <option key={s} value={s}>{s} - Master</option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-[#505050]" />

          {/* Lots / Notional toggle */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Lots' ? 'text-white' : 'text-[#666]')}>Lots</span>
            <button
              onClick={() => setVolumeDisplayMode(volumeDisplayMode === 'Lots' ? 'Notional' : 'Lots')}
              className={clsx('relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5',
                volumeDisplayMode === 'Notional' ? 'bg-[#49b3b3]' : 'bg-[#606060]')}
            >
              <span className={clsx('block w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ease-in-out',
                volumeDisplayMode === 'Notional' ? 'translate-x-5' : 'translate-x-0')} />
            </button>
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Notional' ? 'text-white' : 'text-[#666]')}>Notional</span>
          </div>

          <div className="h-4 w-px bg-[#505050]" />

          {/* Group expand controls — grouped at the right so they don't visually compete with filters */}
          <button onClick={() => exposureGridRef.current?.api?.expandAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#606060] hover:border-[#808080] rounded transition-colors">
            Expand All
          </button>
          <button onClick={() => exposureGridRef.current?.api?.collapseAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#606060] hover:border-[#808080] rounded transition-colors">
            Collapse All
          </button>
        </div>

        {/* ── Main content area ──────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden gap-2 min-h-0">

          {/* ── Left column: Grid + Intraday Monitor ─────────────── */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">

            {/* Exposure grid */}
            <div className="flex-1 min-h-0">
              <AgGridReact<HedgeExposureRow>
                ref={exposureGridRef}
                theme={gridTheme}
                rowData={hedgeExposureData}
                columnDefs={exposureColDefs}
                defaultColDef={defaultColDef}
                autoGroupColumnDef={autoGroupColumnDef}
                // Size each column to its widest cell + header, then leave
                // any leftover viewport space empty on the right. Without
                // this, AG Grid's default behaviour distributes leftover
                // width across columns ("spreads"), which on a 27"/32"
                // monitor turns 1.5k pixels of content into 2.5k pixels of
                // padded-out columns. fitColumns() also calls
                // autoSizeAllColumns later for late-arriving data and
                // post-mode-toggle re-fits — both produce the same
                // content-fit result, so the strategy and the retries
                // stay consistent.
                autoSizeStrategy={{ type: 'fitCellContents' }}
                groupDefaultExpanded={0}
                suppressAggFuncInHeader={true}
                // Stable row identity — AG Grid does an immutable diff on rowData
                // change, updating only the cells whose values actually changed,
                // instead of tearing down and rebuilding rows on every price tick.
                // Without this, the grid visibly flashes and jumps on every MD tick.
                getRowId={(params) => (params.data as HedgeExposureRow).id}
                // Cell-change flash is disabled via suppressCellFlashing on individual
                // column defs where needed; v35 doesn't accept enableCellChangeFlash
                // at the grid level any more.
                // Do NOT re-measure columns or re-apply animations on data refresh.
                animateRows={false}
                rowHeight={28}
                headerHeight={36}
                getRowStyle={(params) => {
                  if (params.data?.isBBook)
                    return { backgroundColor: '#1e2d2d', borderLeft: '2px solid #49b3b3', cursor: 'default' };
                  return undefined;
                }}
                onRowGroupOpened={onRowGroupOpened}
                onGridReady={onExposureGridReady}
                onFirstDataRendered={onFirstDataRendered}
                onRowDataUpdated={onRowDataUpdated}
                onGridSizeChanged={onGridSizeChanged}
                onColumnVisible={onColumnVisible}
                onColumnResized={onColumnResized}
                onColumnRowGroupChanged={onColumnRowGroupChanged}
                onRowClicked={onExposureRowClicked}
                onCellClicked={onExposureCellClicked}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true }}
              />
            </div>

            {/* ── Intraday Monitor ────────────────────────────────── */}
            <div className="border-t border-[#555] mt-2 pt-2 mb-8" style={{ height: '140px', flexShrink: 0 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Intraday: Monitor</span>
                  {selectedSymbol && <span className="text-xs text-[#49b3b3] bg-[#333] px-2 py-0.5 rounded">{selectedSymbol}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-[#666]">
                  {intradayData && (
                    <span>Target: <span className="text-[#a0a0b0]">
                      {new Date(intradayData.targetTime).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET
                    </span></span>
                  )}
                  <span>Current: {new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} ET</span>
                </div>
              </div>

              {intradayLoading ? (
                <div className="h-20 flex items-center justify-center text-[#555] text-sm border border-[#555] rounded">Loading predictions…</div>
              ) : intradayUnmapped ? (
                <div className="h-20 flex items-center justify-center gap-2 text-[#888] text-sm border border-[#555] rounded">
                  <span style={{ color: '#e0a020' }}>⚠</span>
                  No NexDay mapping for <span className="font-mono text-[#49b3b3]">{selectedSymbol}</span> — configure it in Settings → Predictions
                </div>
              ) : selectedSymbol && intradayData ? (
                <table className="w-full text-xs border border-[#555]" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <colgroup><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /></colgroup>
                  <thead>
                    <tr style={{ backgroundColor: '#1a1a1c' }}>
                      {(['15 Minutes', '30 Minutes', '1 Hour', '2 Hours'] as const).map((period, i) => {
                        const now = new Date(); const target = new Date(now);
                        target.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);
                        const offsets = [15, 30, 60, 120];
                        const start = new Date(target.getTime() - offsets[i] * 60000);
                        return (
                          <th key={period} className="py-2 px-3 text-left border-r border-[#555] last:border-r-0">
                            <div className="text-white font-medium">{period}</div>
                            <div className="text-[#49b3b3] text-[10px] font-normal">{formatTime(start)} - {formatTime(target)}</div>
                          </th>
                        );
                      })}
                    </tr>
                    <tr style={{ backgroundColor: '#232225' }}>
                      {[0, 1, 2, 3].map((i) => (
                        <th key={i} className="border-r border-[#555] last:border-r-0 p-0">
                          <div className="grid grid-cols-3 text-[#999] font-normal">
                            <span className="py-1 px-2 text-right border-r border-[#444]">pHigh</span>
                            <span className="py-1 px-2 text-center border-r border-[#444]">pTrend</span>
                            <span className="py-1 px-2 text-right">pLow</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#232326' }}>
                      {[
                        [intradayData.pred15High, intradayData.pred15Trend, intradayData.pred15Low],
                        [intradayData.pred30High, intradayData.pred30Trend, intradayData.pred30Low],
                        [intradayData.pred1hHigh, intradayData.pred1hTrend, intradayData.pred1hLow],
                        [intradayData.pred2hHigh, intradayData.pred2hTrend, intradayData.pred2hLow],
                      ].map(([hi, trend, lo], i) => (
                        <td key={i} className={i < 3 ? 'border-r border-[#555] p-0' : 'p-0'}>
                          <div className="grid grid-cols-3 text-white font-mono">
                            <span className="py-2 px-2 text-right border-r border-[#444]">{(hi as number).toFixed(4)}</span>
                            <span className={clsx('py-2 px-2 text-center border-r border-[#444]', trend === 'Up' ? 'text-[#49b3b3]' : trend === 'Down' ? 'text-[#ff5c5c]' : 'text-[#999]')}>{trend as string}</span>
                            <span className="py-2 px-2 text-right">{(lo as number).toFixed(4)}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="h-20 flex items-center justify-center text-[#555] text-sm border border-[#555] rounded">
                  Select an instrument to view prediction data
                </div>
              )}
            </div>
          </div>

          {/* ── DOM Trader Drawer ────────────────────────────────────────
              Default: collapsed 32px rail with an expand chevron. Click the
              rail → opens the full panel. Inside the open panel, the header
              has a close chevron (›) on the far right.
              Clicking a Coverage row in the grid also auto-opens the drawer
              (see _handleRowSelect).
              The panel subtree stays mounted in both states so order form
              state (qty, limit, exec log, WS subscriptions) survives the
              open/close cycle — we only hide the DOM elements, not unmount. */}
          {!domDrawerOpen && (
            <button
              onClick={() => setDomDrawerOpen(true)}
              className="flex flex-col items-center justify-center flex-shrink-0 border border-[#555] rounded transition-colors hover:bg-[#2a292c]"
              style={{ width: '32px', backgroundColor: '#232225' }}
              title="Open DOM Trader"
            >
              <span style={{ color: '#49b3b3', fontSize: '18px', lineHeight: '1' }}>‹</span>
              <span
                className="text-[10px] text-[#999] uppercase tracking-wider mt-2"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.12em' }}
              >
                DOM Trader
              </span>
            </button>
          )}

          {/* ── DOM Trader Panel (real FIX, identical to CBookPage) ── */}
          <div
            className="flex flex-col border border-[#555] rounded overflow-hidden flex-shrink-0 transition-opacity"
            style={{
              width: '390px',
              backgroundColor: '#232225',
              // Visually mute the whole panel when a B-Book row is selected.
              // BUY/SELL buttons are also hard-gated via canBuy/canSell above.
              opacity: bBookSelected ? 0.45 : 1,
              // When the drawer is closed, hide the panel entirely — `display:
              // none` so it takes zero width/height but its state + mounted
              // subtree survive (WS, exec log, form values).
              display: domDrawerOpen ? 'flex' : 'none',
            }}
          >

            {/* Panel header */}
            <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: '#1a1a1c' }}>
              <span className="text-base font-medium text-white">Market Depth</span>
              <div className="flex items-center gap-2">
                {bBookSelected ? (
                  <span
                    className="text-sm font-mono px-1.5 py-0.5 rounded"
                    style={{ color: '#c09060', backgroundColor: '#2a2016', border: '1px solid #c09060' }}
                    title="B-Book positions don't route through the LP — DOM trading is disabled for this selection."
                  >
                    B-BOOK — DISABLED
                  </span>
                ) : bookStatus !== '—' && (() => {
                  const b = bookBadge(bookStatus);
                  return (
                    <span className="text-sm font-mono px-1.5 py-0.5 rounded"
                      style={{ color: b.color, backgroundColor: `${b.color}18`, border: `1px solid ${b.color}44` }}>
                      {b.text}
                    </span>
                  );
                })()}
                <div className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: domLpInfo ? lpDotColor(domLpInfo.state) : '#555' }}
                  title={domLpInfo ? `${domLpId}: ${domLpInfo.state}` : 'No LP'} />
                {/* Close-drawer chevron. Clicking collapses the panel back
                    to the 32px rail. Form state survives the transition. */}
                <button
                  onClick={() => setDomDrawerOpen(false)}
                  className="text-[#999] hover:text-white transition-colors ml-1"
                  style={{ fontSize: '20px', lineHeight: '1' }}
                  title="Collapse DOM Trader"
                >
                  ›
                </button>
              </div>
            </div>

            {/* LP session status */}
            {lpStatus && (
              <div className="px-3 py-1 border-b border-[#333] flex items-center gap-3 text-sm flex-shrink-0" style={{ backgroundColor: '#191a1c' }}>
                <span className="text-white">Trading:</span>
                <span style={{ color: lpStatus.trading_session.state === 'LOGGED_ON' ? '#49b3b3' : '#e0a020' }}>{lpStatus.trading_session.state}</span>
                <span className="text-white">MD:</span>
                <span style={{ color: lpStatus.md_session.state === 'LOGGED_ON' ? '#49b3b3' : '#e0a020' }}>{lpStatus.md_session.state}</span>
              </div>
            )}

            {/* LP Selector */}
            <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white w-5 flex-shrink-0">LP</span>
                <select
                  value={domLpId}
                  onChange={(e) => {
                    setDomLpId(e.target.value);
                    setDomSymbol(''); setLiveBook(null); setBookStatus('—'); subscribedRef.current = '';
                  }}
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3] min-w-0"
                >
                  <option value="">— Select LP —</option>
                  {allLps.map((l) => (
                    <option key={l.lp_id} value={l.lp_id}>
                      {l.lp_name ?? l.lp_id}{l.state !== 'CONNECTED' ? ` (${l.state})` : ''}
                    </option>
                  ))}
                </select>
                {domLpInfo && (
                  <span className="text-xs font-mono flex-shrink-0 px-1 py-0.5 rounded"
                    style={{ color: lpDotColor(domLpInfo.state), backgroundColor: `${lpDotColor(domLpInfo.state)}18`, border: `1px solid ${lpDotColor(domLpInfo.state)}33` }}>
                    {domLpInfo.state}
                  </span>
                )}
              </div>
            </div>

            {/* Symbol Selector */}
            <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white w-5 flex-shrink-0">SYM</span>
                <button
                  onClick={() => { if (domLpId) setShowPicker((v) => !v); }}
                  disabled={!domLpId || instrLoading}
                  className={clsx(
                    'flex-1 flex items-center justify-between bg-[#2a2a2c] border rounded px-2 py-1 text-sm transition-colors min-w-0',
                    domSymbol ? 'text-white border-[#49b3b3]' : 'text-[#666] border-[#555]',
                    (!domLpId || instrLoading) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="font-mono font-semibold truncate text-xs">
                    {domSymbol || (instrLoading ? 'Loading…' : domLpId ? 'Select symbol…' : '—')}
                  </span>
                  <span className="text-[#444] ml-1 flex-shrink-0">{showPicker ? '▲' : '▼'}</span>
                </button>
              </div>
              {showPicker && (
                <div className="mt-1.5">
                  <input
                    type="text" autoFocus
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Search symbol or description…"
                    className="w-full bg-[#1a1a1c] border border-[#49b3b3] rounded px-2 py-1.5 text-sm text-white placeholder-[#444] focus:outline-none mb-1"
                  />
                  <div className="border border-[#444] rounded overflow-y-auto" style={{ maxHeight: '160px', backgroundColor: '#1a1a1c' }}>
                    {filteredInstruments.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[#444]">No symbols found</div>
                    ) : filteredInstruments.map((ins) => (
                      <button
                        key={ins.symbol}
                        onClick={() => {
                          subscribedRef.current = '';
                          setDomSymbol(ins.symbol);
                          setShowPicker(false); setSymbolSearch('');
                          setLimitPrice('');
                        }}
                        className="w-full flex items-center justify-between px-3 py-1 text-sm hover:bg-[#2a2a2c] transition-colors text-left"
                      >
                        <span className="font-mono font-semibold text-white">{ins.symbol}</span>
                        <div className="text-right ml-2">
                          {ins.instrument_group && <span className="text-[#555] text-xs mr-1">{ins.instrument_group}</span>}
                          <span className="text-[#444] text-xs">{ins.currency}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Best Bid / Ask */}
            <div className="px-3 py-1.5 border-b border-[#555] flex-shrink-0">
              {liveBook && liveBook.best_bid != null ? (
                <div className="grid grid-cols-3 text-xs">
                  <div>
                    <div className="text-white mb-0.5">Best Bid</div>
                    <BigFigurePrice price={liveBook.best_bid} precision={instrDecimals} accent="#4ecdc4" handlePx={14} pipPx={20} pipettePx={11} />
                  </div>
                  <div className="text-center">
                    <div className="text-white mb-0.5">Spread</div>
                    <div className="font-mono text-white">{liveBook.spread != null ? liveBook.spread.toFixed(instrDecimals) : '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white mb-0.5">Best Ask</div>
                    {liveBook.best_ask != null
                      ? <BigFigurePrice price={liveBook.best_ask} precision={instrDecimals} accent="#ff6b6b" handlePx={14} pipPx={20} pipettePx={11} />
                      : <span className="font-mono font-bold text-[#666]">—</span>}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#444] text-center py-0.5">
                  {bBookSelected ? 'B-Book selected — DOM Trader disabled (not routed through LP)'
                    : !domLpId ? 'Select LP above' : !domSymbol ? 'Select symbol or click a row'
                    : bookStatus === 'SUBSCRIBING' ? 'Subscribing…'
                    : bookStatus === 'EMPTY' ? 'Subscribed — awaiting snapshot'
                    : bookStatus === 'DISCONNECTED' ? 'Session disconnected'
                    : 'Awaiting market data'}
                </div>
              )}
            </div>

            {/* Order Book (5 levels) */}
            <div className="px-2 py-1 border-b border-[#555] flex-shrink-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white">
                    <th className="text-right py-0.5 pr-1.5 font-normal text-xs">Size</th>
                    <th className="text-center py-0.5 font-normal text-xs">Bid</th>
                    <th className="text-center py-0.5 font-normal text-xs">Ask</th>
                    <th className="text-left py-0.5 pl-1.5 font-normal text-xs">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {liveBook && liveBook.bids.length > 0 ? (() => {
                    const allSizes = [...liveBook.bids.map((b) => b.size), ...liveBook.asks.map((a) => a.size)];
                    const maxSz = Math.max(...allSizes, 1);
                    return Array.from({ length: DOM_DEPTH }).map((_, i) => {
                      const b = liveBook.bids[i]; const a = liveBook.asks[i];
                      return (
                        <tr key={i}>
                          <td className="text-right py-0.5 pr-1.5 relative">
                            {b && <div className="absolute right-0 top-0 bottom-0 opacity-20 rounded-l" style={{ width: `${(b.size / maxSz) * 100}%`, backgroundColor: '#4ecdc4' }} />}
                            <span className="relative font-mono text-[13px]" style={{ color: b ? '#4ecdc4' : '#2a2a2a' }}>{b ? fmtBookSize(b.size) : '—'}</span>
                          </td>
                          <td className="text-center py-0.5">
                            {b
                              ? <BigFigurePrice price={b.price} precision={instrDecimals} accent="#4ecdc4" handlePx={12} pipPx={17} pipettePx={10} />
                              : <span className="font-mono text-[13px]" style={{ color: '#2a2a2a' }}>—</span>}
                          </td>
                          <td className="text-center py-0.5">
                            {a
                              ? <BigFigurePrice price={a.price} precision={instrDecimals} accent="#ff6b6b" handlePx={12} pipPx={17} pipettePx={10} />
                              : <span className="font-mono text-[13px]" style={{ color: '#2a2a2a' }}>—</span>}
                          </td>
                          <td className="text-left py-0.5 pl-1.5 relative">
                            {a && <div className="absolute left-0 top-0 bottom-0 opacity-20 rounded-r" style={{ width: `${(a.size / maxSz) * 100}%`, backgroundColor: '#ff6b6b' }} />}
                            <span className="relative font-mono text-[13px]" style={{ color: a ? '#ff6b6b' : '#2a2a2a' }}>{a ? fmtBookSize(a.size) : '—'}</span>
                          </td>
                        </tr>
                      );
                    });
                  })() : (
                    Array.from({ length: DOM_DEPTH }).map((_, i) => (
                      <tr key={i}>
                        <td className="text-right py-0.5 pr-1.5 font-mono text-[13px] text-[#2a2a2a]">—</td>
                        <td className="text-center py-0.5 font-mono text-[13px] text-[#2a2a2a]">—</td>
                        <td className="text-center py-0.5 font-mono text-[13px] text-[#2a2a2a]">—</td>
                        <td className="text-left py-0.5 pl-1.5 font-mono text-[13px] text-[#2a2a2a]">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Order Entry */}
            <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
              {/* Type + TIF */}
              <div className="flex gap-2 mb-2">
                <select
                  value={domOrderType}
                  onChange={(e) => setDomOrderType(e.target.value)}
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3]"
                >
                  {effectiveCaps.order_types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={domTif}
                  onChange={(e) => setDomTif(e.target.value)}
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3]"
                >
                  {effectiveCaps.time_in_force.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Qty */}
              <div className="mb-2">
                <div className="text-xs text-white mb-1">QTY</div>
                <input
                  type="number" min="0"
                  value={domQtyLots}
                  onChange={(e) => setDomQtyLots(e.target.value)}
                  disabled={!domSymbol}
                  placeholder={effectiveCaps.min_order_qty != null ? effectiveCaps.min_order_qty.toLocaleString() : '0'}
                  className={clsx(
                    'w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#49b3b3]',
                    !domSymbol && 'opacity-50 cursor-not-allowed'
                  )}
                />
              </div>

              {/* Limit price (only shown for LIMIT / STOP) */}
              {(domOrderType === 'LIMIT' || domOrderType === 'STOP') && (
                <div className="mb-2">
                  <div className="text-xs text-white mb-1">PRICE</div>
                  <input
                    type="number" min="0" step="0.00001"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    disabled={!domSymbol}
                    placeholder="0.00000"
                    className={clsx(
                      'w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#49b3b3]',
                      !domSymbol && 'opacity-50 cursor-not-allowed'
                    )}
                  />
                </div>
              )}

              {/* BUY / SELL */}
              <div className="flex gap-2">
                <button
                  onClick={() => submitOrder('BUY')}
                  disabled={!canBuy}
                  className={clsx(
                    'flex-1 py-2 rounded text-sm font-semibold transition-colors',
                    canBuy ? 'bg-[#49b3b3] hover:bg-[#3dbdb5] text-black' : 'bg-[#2a2a2c] text-[#444] cursor-not-allowed border border-[#555]'
                  )}
                >
                  {submitting ? '…' : 'BUY'}
                </button>
                <button
                  onClick={() => submitOrder('SELL')}
                  disabled={!canSell}
                  className={clsx(
                    'flex-1 py-2 rounded text-sm font-semibold transition-colors',
                    canSell ? 'bg-[#e0a020] hover:bg-[#c89018] text-black' : 'bg-[#2a2a2c] text-[#444] cursor-not-allowed border border-[#555]'
                  )}
                >
                  {submitting ? '…' : 'SELL'}
                </button>
              </div>
            </div>

            {/* Exec Log */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-3 py-1.5 border-b border-[#333] flex items-center justify-between" style={{ backgroundColor: '#1a1a1c' }}>
                <span className="text-xs uppercase tracking-wider text-white">Order Log</span>
                {execLog.length > 0 && (
                  <button onClick={() => setExecLog([])} className="text-xs text-[#666] hover:text-[#aaa] transition-colors">clear</button>
                )}
              </div>
              {execLog.length === 0 ? (
                <div className="px-3 py-3 text-sm text-[#555]">
                  {!domLpId ? 'Select an LP to begin' : !domSymbol ? 'Select a symbol or click a row' : 'No orders this session'}
                </div>
              ) : execLog.map((e, idx) => (
                <div key={`${e.clord_id}-${idx}`} className="px-3 py-2 border-b border-[#222]">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-bold" style={{ color: e.side === 'BUY' ? '#49b3b3' : '#e0a020' }}>{e.side}</span>
                      <span className="font-mono text-white font-semibold">{e.symbol}</span>
                      <span className="font-mono text-white">{e.qty.toLocaleString()}</span>
                    </div>
                    <span className="text-xs font-bold font-mono" style={{ color: e.status === 'SENT' ? '#49b3b3' : '#ff5c5c' }}>{e.status}</span>
                  </div>
                  <div className="text-xs font-mono text-[#aaa] truncate">{e.clord_id}</div>
                  {e.rejectReason && <div className="text-xs text-[#ff5c5c] mt-0.5">{e.rejectReason}</div>}
                  <div className="text-xs text-[#666] mt-0.5">{new Date(e.ts).toLocaleTimeString()} · {e.orderType}/{e.tif}</div>
                </div>
              ))}
            </div>

          </div>{/* end DOM panel */}

        </div>
      </div>
    </div>
  );
}

export default NetExposurePage;