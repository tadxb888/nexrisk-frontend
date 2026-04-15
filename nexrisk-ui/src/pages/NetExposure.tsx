/**
 * NetExposure.tsx — Net Exposure page
 *
 * Exposure grid data sources:
 *   B-Book rows: aggregated from live MT5 positions (poll every 30 s)
 *   A-Book rows: aggregated from real FIX/LP open positions (poll every 15 s)
 *                Endpoint: GET /api/v1/fix/lp/{lp_id}/positions
 *
 * DOM Trader: real FIX market depth — identical infrastructure to CBookPage
 *   WebSocket:    ws://BFF/ws/v1/fix/events
 *   MD subscribe: POST /api/v1/fix/md/subscribe
 *   Order entry:  POST /api/v1/fix/order
 *   Symbol driven by clicking any non-B-Book row in the exposure grid.
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
// THEME
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#232326',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 11,
});

// ======================
// TYPES
// ======================
interface HedgeExposureRow {
  id: string;
  symbol: string;
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
  sortOrder: number;
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
// B-BOOK AGGREGATOR (unchanged from original)
// ======================
function aggregateBBookPositions(positions: MT5PositionWithNode[], lpLabel: string): HedgeExposureRow[] {
  if (!positions.length) return [];
  const riskLevels: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  const bySymbol = new Map<string, {
    netVol: number; totalProfit: number; totalSwap: number; totalComm: number;
    weightedCurrentPriceSum: number; weightedOpenPriceSum: number; totalVolForPrice: number;
  }>();
  for (const p of positions) {
    const sign = p.action === 'BUY' ? 1 : -1;
    const vol  = p.volume_lots * sign;
    const cur  = bySymbol.get(p.symbol);
    if (cur) {
      cur.netVol += vol; cur.totalProfit += p.profit; cur.totalSwap += p.swap; cur.totalComm += p.commission;
      cur.weightedCurrentPriceSum += p.price_current * p.volume_lots;
      cur.weightedOpenPriceSum    += p.price_open    * p.volume_lots;
      cur.totalVolForPrice        += p.volume_lots;
    } else {
      bySymbol.set(p.symbol, {
        netVol: vol, totalProfit: p.profit, totalSwap: p.swap, totalComm: p.commission,
        weightedCurrentPriceSum: p.price_current * p.volume_lots,
        weightedOpenPriceSum:    p.price_open    * p.volume_lots,
        totalVolForPrice: p.volume_lots,
      });
    }
  }
  const rows: HedgeExposureRow[] = [];
  let idx = 0;
  bySymbol.forEach((data, symbol) => {
    const isJPY = symbol.includes('JPY'); const isXAU = symbol.includes('XAU'); const isBTC = symbol.includes('BTC');
    const lotSize  = isXAU ? 100 : isBTC ? 1 : 100000;
    const pipValue = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
    const avgPrice       = data.totalVolForPrice > 0 ? data.weightedCurrentPriceSum / data.totalVolForPrice : 0;
    const breakEvenPrice = data.totalVolForPrice > 0 ? data.weightedOpenPriceSum    / data.totalVolForPrice : 0;
    const clientNetVol  = Math.round(data.netVol * 100) / 100;
    const brokerNetVol  = Math.round(-clientNetVol * 100) / 100;
    const clientNetNotional = Math.round(clientNetVol * lotSize);
    const brokerNetNotional = Math.round(brokerNetVol * lotSize);
    const unhedgedLots = Math.abs(brokerNetVol);
    const brokerFloatingPL = Math.round(-(data.totalProfit + data.totalSwap + data.totalComm) * 100) / 100;
    const riskIdx = unhedgedLots > 5 ? 3 : unhedgedLots > 2 ? 2 : unhedgedLots > 0.5 ? 1 : 0;
    rows.push({
      id: `bbook-${symbol}-${idx++}`, symbol, lp: lpLabel, lpAccount: 'Internal',
      clientNetVol, hedgeNetVol: 0, brokerNetVol,
      clientNetNotional, hedgeNetNotional: 0, brokerNetNotional,
      avgPrice: Math.round(avgPrice * 100000) / 100000,
      brokerFloatingPL, unhedgedLots,
      breakEvenPrice: Math.round(breakEvenPrice * 100000) / 100000,
      probableIdp30: 'Neutral', bevh: Math.round(unhedgedLots * 100) / 100,
      riskLevel: riskLevels[riskIdx], marketMovePercent: 0,
      plImpact: Math.round(unhedgedLots * lotSize * 0.001 * pipValue * 100) / 100,
      isBBook: true, sortOrder: 0,
    });
  });
  return rows;
}

// ======================
// A-BOOK AGGREGATOR
// Aggregates real open FIX/LP positions into exposure rows, one row per symbol.
// net_qty from TE is treated as direct lots (the native TE position unit).
// ======================
function aggregateABookPositions(
  positions: FIXPosition[],
  lpId: string,
  lpDisplayName: string,
  instrMap: Record<string, FIXInstrument>,
): HedgeExposureRow[] {
  const bySymbol = new Map<string, {
    hedgeNetLots: number;
    totalPnl: number;
    weightedCurrentSum: number;
    weightedOpenSum: number;
    totalAbsLots: number;
    account: string;
  }>();

  for (const p of positions) {
    if (!p.position_id || p.open_price <= 0) continue;
    const ins = instrMap[p.symbol];
    const minVol = ins?.min_trade_vol ?? 100000;
    // Determine direction; fall back to long/short qty comparison
    const isLong = p.side === 'LONG' || p.side === 'BUY'
      || (p.long_qty > 0 && p.short_qty === 0);
    const sign = isLong ? 1 : -1;
    // net_qty from TE is in native units; convert to lots
    const lots = Math.abs(p.net_qty) / (minVol || 100000);
    const signedLots = lots * sign;
    const mktPx = p.current_price ?? p.open_price;

    const cur = bySymbol.get(p.symbol);
    if (cur) {
      cur.hedgeNetLots += signedLots;
      cur.totalPnl += (p.unrealized_pnl ?? 0);
      cur.weightedCurrentSum += mktPx * lots;
      cur.weightedOpenSum    += p.open_price * lots;
      cur.totalAbsLots       += lots;
    } else {
      bySymbol.set(p.symbol, {
        hedgeNetLots: signedLots,
        totalPnl: p.unrealized_pnl ?? 0,
        weightedCurrentSum: mktPx * lots,
        weightedOpenSum:    p.open_price * lots,
        totalAbsLots: lots,
        account: p.account,
      });
    }
  }

  const riskLevels: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  const rows: HedgeExposureRow[] = [];
  let idx = 0;

  bySymbol.forEach((data, symbol) => {
    const isJPY = symbol.includes('JPY'); const isXAU = symbol.includes('XAU'); const isBTC = symbol.includes('BTC');
    const lotSize  = isXAU ? 100 : isBTC ? 1 : 100000;
    const pipValue = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;

    const avgPrice       = data.totalAbsLots > 0 ? data.weightedCurrentSum / data.totalAbsLots : 0;
    const breakEvenPrice = data.totalAbsLots > 0 ? data.weightedOpenSum    / data.totalAbsLots : 0;

    const hedgeNetVol = Math.round(data.hedgeNetLots * 100) / 100;
    // In A-Book: broker hedges client exposure → clientNetVol ≈ opposite of hedge.
    // brokerNetVol = hedgeNetVol (our residual LP position exposure).
    const clientNetVol  = Math.round(-hedgeNetVol * 100) / 100;
    const brokerNetVol  = hedgeNetVol;

    const clientNetNotional = Math.round(clientNetVol * lotSize);
    const hedgeNetNotional  = Math.round(hedgeNetVol  * lotSize);
    const brokerNetNotional = Math.round(brokerNetVol * lotSize);
    const unhedgedLots = Math.abs(brokerNetVol);
    const riskIdx = unhedgedLots > 5 ? 3 : unhedgedLots > 2 ? 2 : unhedgedLots > 0.5 ? 1 : 0;

    rows.push({
      id: `abook-${lpId}-${symbol}-${idx++}`,
      symbol, lp: lpDisplayName, lpAccount: data.account,
      clientNetVol, hedgeNetVol, brokerNetVol,
      clientNetNotional, hedgeNetNotional, brokerNetNotional,
      avgPrice:        Math.round(avgPrice       * 100000) / 100000,
      brokerFloatingPL: Math.round(data.totalPnl * 100) / 100,
      unhedgedLots,
      breakEvenPrice: Math.round(breakEvenPrice * 100000) / 100000,
      probableIdp30: 'Neutral',
      bevh: Math.round(unhedgedLots * 100) / 100,
      riskLevel: riskLevels[riskIdx],
      marketMovePercent: 0,
      plImpact: Math.round(unhedgedLots * lotSize * 0.001 * pipValue * 100) / 100,
      isBBook: false, sortOrder: 1,
    });
  });

  return rows;
}

// ======================
// COMPONENT
// ======================
export function NetExposurePage() {
  // ── Exposure grid ─────────────────────────────────────────────
  const exposureGridRef = useRef<AgGridReact<HedgeExposureRow>>(null);
  const expandedGroupsRef = useRef<Set<string>>(new Set());
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null); // intraday monitor

  // ── Display ───────────────────────────────────────────────────
  const [volumeDisplayMode, setVolumeDisplayMode] = useState<'Lots' | 'Notional'>('Notional');

  // ── B-Book data ───────────────────────────────────────────────
  const [bBookPositions, setBBookPositions] = useState<MT5PositionWithNode[]>([]);
  const [bBookNodes,     setBBookNodes]     = useState<MT5NodeAPI[]>([]);
  const [filterServer,   setFilterServer]   = useState<string>('ALL');

  // ── A-Book data — live FIX/LP positions ───────────────────────
  const [aBookPositions, setABookPositions] = useState<FIXPosition[]>([]);

  // ── LP list ───────────────────────────────────────────────────
  const [allLps, setAllLps] = useState<FIXLpEntry[]>(SEED_LPS);

  // ── DOM / FIX ─────────────────────────────────────────────────
  const [domLpId,       setDomLpId]       = useState<string>('traderevolution');
  const [domSymbol,     setDomSymbol]     = useState<string>('');
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
  const bookSeededRef   = useRef<boolean>(false);

  // ── Signal / intraday ─────────────────────────────────────────
  const [signalMap,        setSignalMap]        = useState<Map<string, string>>(new Map());
  const [intradayData,     setIntradayData]     = useState<PredictionRow | null>(null);
  const [intradayLoading,  setIntradayLoading]  = useState(false);
  const [intradayUnmapped, setIntradayUnmapped] = useState(false);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // ── B-Book: poll MT5 positions every 30 s ─────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const { positions, nodes } = await mt5Api.getAllBBookPositions();
        if (cancelled) return;
        setBBookPositions(positions);
        setBBookNodes(nodes);
      } catch { /* silent */ }
    };
    fetch();
    const timer = setInterval(fetch, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // ── A-Book: poll FIX positions every 15 s ────────────────────
  useEffect(() => {
    if (!domLpId) { setABookPositions([]); return; }
    let cancelled = false;
    const fetchABook = async () => {
      try {
        const r = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(
          `/api/v1/fix/lp/${domLpId}/positions`
        );
        if (cancelled || !r.success) return;
        setABookPositions(
          r.data.positions.filter((p) => p.position_id !== '' && p.open_price > 0)
        );
      } catch { /* silent */ }
    };
    fetchABook();
    const timer = setInterval(fetchABook, 15000);
    return () => { cancelled = true; clearInterval(timer); };
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

  // ── DOM WebSocket — MD subscription (identical to CBookPage) ─
  useEffect(() => {
    if (!domLpId || !domSymbol) {
      setLiveBook(null); liveBookRef.current = null;
      setBookStatus('—');
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsSymbolRef.current = ''; wsLpIdRef.current = '';
      localBidsRef.current.clear(); localAsksRef.current.clear();
      return;
    }

    const key = `${domLpId}:${domSymbol}`;
    if (subscribedRef.current === key) return;

    // Teardown previous subscription
    const prev = subscribedRef.current;
    if (prev) {
      const [pl, ps] = prev.split(':');
      bff(`/api/v1/fix/md/unsubscribe`, { method: 'POST', body: JSON.stringify({ lp_id: pl, symbol: ps }) }).catch(() => {});
    }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    bookSeededRef.current = false;
    subscribedRef.current = key;
    wsSymbolRef.current   = domSymbol;
    wsLpIdRef.current     = domLpId;
    localBidsRef.current.clear(); localAsksRef.current.clear();
    setLiveBook(null); liveBookRef.current = null;
    setBookStatus('SUBSCRIBING');

    let cancelled = false;

    const startup = async () => {
      // Step 1: check LP session
      try {
        const st = await bff<{ success: boolean; data: FIXLpStatus }>(`/api/v1/fix/status/${domLpId}`);
        if (!cancelled && st.success) setLpStatus(st.data);
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 2: subscribe MD
      try {
        await bff(`/api/v1/fix/md/subscribe`, {
          method: 'POST', body: JSON.stringify({ lp_id: domLpId, symbol: domSymbol, depth: 10 }),
        });
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 3: wait 400 ms — first MD snapshot arrives within this window (TE)
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;

      // Step 4: seed from REST book cache
      try {
        const bookR = await bff<any>(`/api/v1/fix/md/book/${domLpId}/${domSymbol}`);
        if (!cancelled) {
          primeBookFromRest(bookR, localBidsRef.current, localAsksRef.current);
          const bd = buildBookFromMaps(domSymbol, localBidsRef.current, localAsksRef.current);
          if (bd) { liveBookRef.current = bd; setLiveBook(bd); setBookStatus('HEALTHY'); bookSeededRef.current = true; }
        }
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 5: connect WebSocket
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

          // ── Market data ─────────────────────────────────────────────
          if (msg.type === 'MARKET_DATA_SNAPSHOT' || msg.type === 'MARKET_DATA_INCREMENTAL' ||
              msg.type === 'MD_SNAPSHOT' || msg.type === 'MD_INCREMENTAL') {
            // Guard: only process ticks for the subscribed symbol
            if (msg.data?.symbol && msg.data.symbol !== wsSymbolRef.current) return;
            const mutated = applyBookMessage(msg.data ?? msg, msg.type, localBidsRef.current, localAsksRef.current);
            if (mutated) {
              const bd = buildBookFromMaps(wsSymbolRef.current, localBidsRef.current, localAsksRef.current);
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
            return;
          }

          // ── Session ─────────────────────────────────────────────────
          if (msg.type === 'SESSION_LOGON')  setBookStatus('EMPTY');
          if (msg.type === 'SESSION_LOGOUT') setBookStatus('DISCONNECTED');

        } catch { /* malformed frame */ }
      };

      ws.onerror = (e) => console.warn('[NetExposure WS] error', e);
      ws.onclose = () => { if (!cancelled) console.log('[NetExposure WS] closed'); };
    };

    startup();

    return () => {
      cancelled = true;
      subscribedRef.current = '';
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (bookRenderTimer.current) { clearTimeout(bookRenderTimer.current); bookRenderTimer.current = null; }
      wsSymbolRef.current = ''; wsLpIdRef.current = '';
      localBidsRef.current.clear(); localAsksRef.current.clear();
    };
  }, [domLpId, domSymbol]);

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

  // ==========================================================================
  // DERIVED
  // ==========================================================================
  const instrMap = useMemo<Record<string, FIXInstrument>>(() => {
    const map: Record<string, FIXInstrument> = {};
    for (const ins of instruments) map[ins.symbol] = ins;
    return map;
  }, [instruments]);

  const bBookLpLabel = useMemo(() => {
    if (!bBookNodes.length) return 'B-Book';
    if (bBookNodes.length === 1) return `B-Book-${bBookNodes[0].node_name}`;
    return 'B-Book-MT5-All Servers';
  }, [bBookNodes]);

  const serverOptions = useMemo(
    () => ['ALL', ...bBookNodes.map((n) => n.node_name).sort()],
    [bBookNodes]
  );

  const aBookLpName = useMemo(() => {
    const lp = allLps.find((l) => l.lp_id === domLpId);
    return lp?.lp_name ?? 'TraderEvolution';
  }, [allLps, domLpId]);

  const hedgeExposureData = useMemo(() => {
    const aBookRows = aggregateABookPositions(aBookPositions, domLpId, aBookLpName, instrMap);
    if (filterServer === 'ALL') {
      return [...aBookRows, ...aggregateBBookPositions(bBookPositions, bBookLpLabel)];
    }
    const filtered = bBookPositions.filter((p) => p.nodeName === filterServer);
    return [...aBookRows, ...aggregateBBookPositions(filtered, `B-Book-${filterServer}`)];
  }, [aBookPositions, domLpId, aBookLpName, instrMap, bBookPositions, bBookLpLabel, filterServer]);

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
  const canBuy  = isConnected && !!domSymbol && !!domQtyLots && !submitting;
  const canSell = isConnected && !!domSymbol && !!domQtyLots && !submitting;

  // ==========================================================================
  // GRID FIT HELPERS
  // ==========================================================================
  const fitColumns = useCallback(() => {
    const api = exposureGridRef.current?.api;
    if (!api) return;
    const eGrid = (exposureGridRef.current as any)?.eGridDiv as HTMLElement | undefined;
    if ((eGrid?.clientWidth ?? 0) < 50) return;
    const displayedCols = api.getAllDisplayedColumns();
    if (!displayedCols?.length) return;
    try { api.autoSizeAllColumns(false); } catch { /* no-op */ }
    const totalWidth = displayedCols.reduce((s, c) => s + (c.getActualWidth?.() ?? 0), 0);
    if (totalWidth > (eGrid?.clientWidth ?? 0)) { try { api.sizeColumnsToFit(); } catch { /* no-op */ } }
  }, []);

  const onFirstDataRendered  = useCallback((_e: FirstDataRenderedEvent<HedgeExposureRow>) => { requestAnimationFrame(fitColumns); setTimeout(fitColumns, 50); }, [fitColumns]);
  const onGridSizeChanged    = useCallback((_e: GridSizeChangedEvent<HedgeExposureRow>) => fitColumns(), [fitColumns]);
  const onColumnVisible      = useCallback((_e: ColumnVisibleEvent) => fitColumns(), [fitColumns]);
  const onColumnRowGroupChanged = useCallback((_e: ColumnRowGroupChangedEvent) => fitColumns(), [fitColumns]);

  useEffect(() => { setTimeout(fitColumns, 50); }, [fitColumns]);
  useEffect(() => { setTimeout(fitColumns, 50); }, [volumeDisplayMode, fitColumns]);

  // Restore expanded groups after data refresh
  useEffect(() => {
    const api = exposureGridRef.current?.api;
    if (!api) return;
    setTimeout(() => {
      api.forEachNode((node) => {
        if (node.group && node.key && expandedGroupsRef.current.has(node.key)) node.setExpanded(true);
      });
    }, 0);
  }, [hedgeExposureData]);

  // ==========================================================================
  // COLUMN DEFINITIONS
  // ==========================================================================
  const exposureColDefs = useMemo<ColDef<HedgeExposureRow>[]>(() => {
    const fmtLots     = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
    const fmtNotional = (val: number) => {
      const absVal = Math.abs(val);
      const formatted = absVal >= 1_000_000 ? `${(absVal / 1_000_000).toFixed(2)}M`
        : absVal >= 1_000 ? `${(absVal / 1_000).toFixed(1)}K` : absVal.toFixed(2);
      return `${val < 0 ? '-' : '+'}$${formatted}`;
    };
    const volColor   = (val: number) => ({ color: val > 0 ? '#49b3b3' : val < 0 ? '#ff5c5c' : '#999' });
    const plColor    = (val: number) => ({ color: val > 0 ? '#49b3b3' : val < 0 ? '#ff5c5c' : '#999' });
    const signalColor = (signal: string) =>
      signal.startsWith('Hdg') ? '#49b3b3' : signal.startsWith('Opp') ? '#e0a020' : '#666';

    return [
      { field: 'symbol', headerName: 'Symbol', rowGroup: true, hide: true },
      {
        field: 'lp', headerName: 'LP', filter: 'agSetColumnFilter',
        cellRenderer: (p: { value: string; data?: HedgeExposureRow }) => {
          if (!p.data?.isBBook) return p.value;
          return (
            <span className="flex items-center gap-1.5">
              <span style={{ color: '#49b3b3', fontWeight: 600 }}>{p.value}</span>
              <span style={{ fontSize: '9px', backgroundColor: '#1a3a3a', color: '#49b3b3', border: '1px solid #49b3b3', borderRadius: '3px', padding: '0 4px', lineHeight: '14px' }}>B</span>
            </span>
          );
        },
      },
      { field: 'lpAccount', headerName: 'Account', filter: 'agTextColumnFilter' },
      {
        field: volumeDisplayMode === 'Lots' ? 'brokerNetVol' : 'brokerNetNotional',
        headerName: 'Net Vol.',
        filter: 'agNumberColumnFilter', type: 'rightAligned', aggFunc: 'sum',
        valueFormatter: (p) => p.value == null ? '' : volumeDisplayMode === 'Lots' ? fmtLots(Number(p.value)) : fmtNotional(Number(p.value)),
        cellStyle: (p) => p.value != null ? volColor(Number(p.value)) : {},
      },
      {
        field: 'breakEvenPrice', headerName: 'Break-Even Px',
        filter: 'agNumberColumnFilter', type: 'rightAligned', aggFunc: 'avg',
        valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(5) : '',
      },
      {
        field: 'avgPrice', headerName: 'Mkt Px',
        filter: 'agNumberColumnFilter', type: 'rightAligned', aggFunc: 'avg',
        valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(5) : '',
      },
      {
        field: 'brokerFloatingPL', headerName: 'Broker P/L',
        filter: 'agNumberColumnFilter', type: 'rightAligned', aggFunc: 'sum',
        valueFormatter: (p) => {
          if (p.value == null) return '';
          const val = Number(p.value);
          return `${val >= 0 ? '+' : ''}$${val.toFixed(2)}`;
        },
        cellStyle: (p) => p.value != null ? plColor(Number(p.value)) : {},
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
      { field: 'sortOrder', hide: true, initialSort: 'asc', sortable: true },
    ];
  }, [volumeDisplayMode, signalMap]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, suppressSizeToFit: false }), []);
  const autoGroupColumnDef = useMemo<ColDef>(() => ({ headerName: 'Symbol', minWidth: 150, cellRendererParams: { suppressCount: false } }), []);

  // ==========================================================================
  // GRID EVENT HANDLERS
  // ==========================================================================
  const onRowGroupOpened = useCallback((event: { node: { group: boolean; key?: string; expanded: boolean } }) => {
    if (!event.node.group || !event.node.key) return;
    if (event.node.expanded) expandedGroupsRef.current.add(event.node.key);
    else expandedGroupsRef.current.delete(event.node.key);
  }, []);

  const onExposureGridReady = useCallback((event: GridReadyEvent<HedgeExposureRow>) => {
    setTimeout(() => {
      const firstRowNode = event.api.getDisplayedRowAtIndex(0);
      if (firstRowNode?.group) firstRowNode.setExpanded(true);
      fitColumns();
    }, 100);
  }, [fitColumns]);

  const _handleRowSelect = useCallback((data: HedgeExposureRow | null, groupKey?: string) => {
    if (data) {
      setSelectedSymbol(data.symbol); // drives intraday monitor
      if (!data.isBBook) {
        // A-Book row → drive DOM to this symbol
        if (data.symbol !== domSymbol) {
          subscribedRef.current = ''; // force re-subscribe on new symbol
          setDomSymbol(data.symbol);
          setShowPicker(false);
          setLimitPrice('');
          // Pre-fill qty from LP position size (in lots)
          const absLots = Math.abs(data.hedgeNetVol);
          if (absLots > 0) {
            const ins = instrMap[data.symbol];
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
  }, [domSymbol, instrMap]);

  const onExposureRowClicked = useCallback((event: RowClickedEvent<HedgeExposureRow>) => {
    if (event.data) {
      _handleRowSelect(event.data);
    } else if (event.node.group && event.node.key) {
      _handleRowSelect(null, event.node.key);
    }
  }, [_handleRowSelect]);

  const onExposureCellClicked = useCallback((event: { data?: HedgeExposureRow; node?: { group?: boolean; key?: string } }) => {
    if (event.data) {
      _handleRowSelect(event.data);
    } else if (event.node?.group && event.node?.key) {
      _handleRowSelect(null, event.node.key);
    }
  }, [_handleRowSelect]);

  // ==========================================================================
  // ORDER SUBMISSION
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
        lp_id: domLpId, symbol: domSymbol, side,
        order_type: domOrderType, time_in_force: domTif, quantity: qty,
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
        // Refresh A-Book positions after order to reflect any new LP position
        setTimeout(() => {
          bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/lp/${domLpId}/positions`)
            .then((r) => { if (r.success) setABookPositions(r.data.positions.filter((p) => p.position_id !== '' && p.open_price > 0)); })
            .catch(() => {});
        }, 2000);
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

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* ── Page Header ───────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#808080]">
        <h1 className="text-lg font-semibold text-white">Net Exposure</h1>
        <p className="text-xs text-[#999]">Live hedge exposure by symbol and LP</p>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-2 pt-2 pb-12">

        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-2 flex-wrap">
          <button onClick={() => exposureGridRef.current?.api?.expandAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors">
            Expand All
          </button>
          <button onClick={() => exposureGridRef.current?.api?.collapseAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors">
            Collapse All
          </button>

          <div className="h-4 w-px bg-[#555]" />

          {/* B-Book server filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[#666]">B-Book:</span>
            <select
              value={filterServer}
              onChange={(e) => setFilterServer(e.target.value)}
              className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
            >
              {serverOptions.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Servers' : s}</option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-[#555]" />

          {/* Lots / Notional toggle */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Lots' ? 'text-white' : 'text-[#666]')}>Lots</span>
            <button
              onClick={() => setVolumeDisplayMode(volumeDisplayMode === 'Lots' ? 'Notional' : 'Lots')}
              className={clsx('relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5',
                volumeDisplayMode === 'Notional' ? 'bg-[#49b3b3]' : 'bg-[#555]')}
            >
              <span className={clsx('block w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ease-in-out',
                volumeDisplayMode === 'Notional' ? 'translate-x-5' : 'translate-x-0')} />
            </button>
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Notional' ? 'text-white' : 'text-[#666]')}>Notional</span>
          </div>
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
                groupDefaultExpanded={-1}
                suppressAggFuncInHeader={true}
                autoSizeStrategy={{ type: 'fitCellContents' }}
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
                onGridSizeChanged={onGridSizeChanged}
                onColumnVisible={onColumnVisible}
                onColumnRowGroupChanged={onColumnRowGroupChanged}
                onRowClicked={onExposureRowClicked}
                onCellClicked={onExposureCellClicked}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true }}
                sideBar={{ toolPanels: [{ id: 'columns', labelDefault: 'Columns', labelKey: 'columns', iconKey: 'columns', toolPanel: 'agColumnsToolPanel', toolPanelParams: { suppressRowGroups: true, suppressValues: true, suppressPivots: true, suppressPivotMode: true } }], defaultToolPanel: '' }}
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

          {/* ── DOM Trader Panel (real FIX, identical to CBookPage) ── */}
          <div className="flex flex-col border border-[#555] rounded overflow-hidden flex-shrink-0" style={{ width: '300px', backgroundColor: '#232225' }}>

            {/* Panel header */}
            <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: '#1a1a1c' }}>
              <span className="text-sm font-medium text-white">Market Depth</span>
              <div className="flex items-center gap-2">
                {bookStatus !== '—' && (() => {
                  const b = bookBadge(bookStatus);
                  return (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ color: b.color, backgroundColor: `${b.color}18`, border: `1px solid ${b.color}44` }}>
                      {b.text}
                    </span>
                  );
                })()}
                <div className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: domLpInfo ? lpDotColor(domLpInfo.state) : '#555' }}
                  title={domLpInfo ? `${domLpId}: ${domLpInfo.state}` : 'No LP'} />
              </div>
            </div>

            {/* LP session status */}
            {lpStatus && (
              <div className="px-3 py-1 border-b border-[#333] flex items-center gap-3 text-[10px] flex-shrink-0" style={{ backgroundColor: '#191a1c' }}>
                <span className="text-white">Trading:</span>
                <span style={{ color: lpStatus.trading_session.state === 'LOGGED_ON' ? '#49b3b3' : '#e0a020' }}>{lpStatus.trading_session.state}</span>
                <span className="text-white">MD:</span>
                <span style={{ color: lpStatus.md_session.state === 'LOGGED_ON' ? '#49b3b3' : '#e0a020' }}>{lpStatus.md_session.state}</span>
              </div>
            )}

            {/* LP Selector */}
            <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white w-5 flex-shrink-0">LP</span>
                <select
                  value={domLpId}
                  onChange={(e) => {
                    setDomLpId(e.target.value);
                    setDomSymbol(''); setLiveBook(null); setBookStatus('—'); subscribedRef.current = '';
                  }}
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3] min-w-0"
                >
                  <option value="">— Select LP —</option>
                  {allLps.map((l) => (
                    <option key={l.lp_id} value={l.lp_id}>
                      {l.lp_name ?? l.lp_id}{l.state !== 'CONNECTED' ? ` (${l.state})` : ''}
                    </option>
                  ))}
                </select>
                {domLpInfo && (
                  <span className="text-[10px] font-mono flex-shrink-0 px-1 py-0.5 rounded"
                    style={{ color: lpDotColor(domLpInfo.state), backgroundColor: `${lpDotColor(domLpInfo.state)}18`, border: `1px solid ${lpDotColor(domLpInfo.state)}33` }}>
                    {domLpInfo.state}
                  </span>
                )}
              </div>
            </div>

            {/* Symbol Selector */}
            <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white w-5 flex-shrink-0">SYM</span>
                <button
                  onClick={() => { if (domLpId) setShowPicker((v) => !v); }}
                  disabled={!domLpId || instrLoading}
                  className={clsx(
                    'flex-1 flex items-center justify-between bg-[#2a2a2c] border rounded px-2 py-1 text-xs transition-colors min-w-0',
                    domSymbol ? 'text-white border-[#49b3b3]' : 'text-[#666] border-[#555]',
                    (!domLpId || instrLoading) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="font-mono font-semibold truncate">
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
                    className="w-full bg-[#1a1a1c] border border-[#49b3b3] rounded px-2 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none mb-1"
                  />
                  <div className="border border-[#444] rounded overflow-y-auto" style={{ maxHeight: '160px', backgroundColor: '#1a1a1c' }}>
                    {filteredInstruments.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[#444]">No symbols found</div>
                    ) : filteredInstruments.map((ins) => (
                      <button
                        key={ins.symbol}
                        onClick={() => {
                          subscribedRef.current = '';
                          setDomSymbol(ins.symbol);
                          setShowPicker(false); setSymbolSearch('');
                          setLimitPrice('');
                        }}
                        className="w-full flex items-center justify-between px-3 py-1 text-xs hover:bg-[#2a2a2c] transition-colors text-left"
                      >
                        <span className="font-mono font-semibold text-white">{ins.symbol}</span>
                        <div className="text-right ml-2">
                          {ins.instrument_group && <span className="text-[#555] text-[10px] mr-1">{ins.instrument_group}</span>}
                          <span className="text-[#444] text-[10px]">{ins.currency}</span>
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
                <div className="grid grid-cols-3 text-[10px]">
                  <div>
                    <div className="text-white mb-0.5">Best Bid</div>
                    <div className="font-mono font-bold" style={{ color: '#49b3b3' }}>{liveBook.best_bid.toFixed(instrDecimals)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white mb-0.5">Spread</div>
                    <div className="font-mono text-white">{liveBook.spread != null ? liveBook.spread.toFixed(instrDecimals) : '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white mb-0.5">Best Ask</div>
                    <div className="font-mono font-bold" style={{ color: '#e0a020' }}>{liveBook.best_ask?.toFixed(instrDecimals) ?? '—'}</div>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-[#444] text-center py-0.5">
                  {!domLpId ? 'Select LP above' : !domSymbol ? 'Select symbol or click a row'
                    : bookStatus === 'SUBSCRIBING' ? 'Subscribing…'
                    : bookStatus === 'EMPTY' ? 'Subscribed — awaiting snapshot'
                    : bookStatus === 'DISCONNECTED' ? 'Session disconnected'
                    : 'Awaiting market data'}
                </div>
              )}
            </div>

            {/* Order Book (5 levels) */}
            <div className="px-2 py-1 border-b border-[#555] flex-shrink-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white">
                    <th className="text-right py-0.5 pr-1.5 font-normal text-[10px]">Size</th>
                    <th className="text-center py-0.5 font-normal text-[10px]">Bid</th>
                    <th className="text-center py-0.5 font-normal text-[10px]">Ask</th>
                    <th className="text-left py-0.5 pl-1.5 font-normal text-[10px]">Size</th>
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
                            {b && <div className="absolute right-0 top-0 bottom-0 opacity-20 rounded-l" style={{ width: `${(b.size / maxSz) * 100}%`, backgroundColor: '#49b3b3' }} />}
                            <span className="relative font-mono text-[11px]" style={{ color: b ? '#49b3b3' : '#2a2a2a' }}>{b ? fmtBookSize(b.size) : '—'}</span>
                          </td>
                          <td className="text-center py-0.5">
                            <span className="font-mono text-[11px] font-medium" style={{ color: b ? '#49b3b3' : '#2a2a2a' }}>{b ? b.price.toFixed(instrDecimals) : '—'}</span>
                          </td>
                          <td className="text-center py-0.5">
                            <span className="font-mono text-[11px] font-medium" style={{ color: a ? '#e0a020' : '#2a2a2a' }}>{a ? a.price.toFixed(instrDecimals) : '—'}</span>
                          </td>
                          <td className="text-left py-0.5 pl-1.5 relative">
                            {a && <div className="absolute left-0 top-0 bottom-0 opacity-20 rounded-r" style={{ width: `${(a.size / maxSz) * 100}%`, backgroundColor: '#e0a020' }} />}
                            <span className="relative font-mono text-[11px]" style={{ color: a ? '#e0a020' : '#2a2a2a' }}>{a ? fmtBookSize(a.size) : '—'}</span>
                          </td>
                        </tr>
                      );
                    });
                  })() : (
                    Array.from({ length: DOM_DEPTH }).map((_, i) => (
                      <tr key={i}>
                        <td className="text-right py-0.5 pr-1.5 font-mono text-[11px] text-[#2a2a2a]">—</td>
                        <td className="text-center py-0.5 font-mono text-[11px] text-[#2a2a2a]">—</td>
                        <td className="text-center py-0.5 font-mono text-[11px] text-[#2a2a2a]">—</td>
                        <td className="text-left py-0.5 pl-1.5 font-mono text-[11px] text-[#2a2a2a]">—</td>
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
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
                >
                  {effectiveCaps.order_types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={domTif}
                  onChange={(e) => setDomTif(e.target.value)}
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
                >
                  {effectiveCaps.time_in_force.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Qty */}
              <div className="mb-2">
                <div className="text-[10px] text-white mb-1">QTY</div>
                <input
                  type="number" min="0"
                  value={domQtyLots}
                  onChange={(e) => setDomQtyLots(e.target.value)}
                  disabled={!domSymbol}
                  placeholder={effectiveCaps.min_order_qty != null ? effectiveCaps.min_order_qty.toLocaleString() : '0'}
                  className={clsx(
                    'w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#49b3b3]',
                    !domSymbol && 'opacity-50 cursor-not-allowed'
                  )}
                />
              </div>

              {/* Limit price (only shown for LIMIT / STOP) */}
              {(domOrderType === 'LIMIT' || domOrderType === 'STOP') && (
                <div className="mb-2">
                  <div className="text-[10px] text-white mb-1">PRICE</div>
                  <input
                    type="number" min="0" step="0.00001"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    disabled={!domSymbol}
                    placeholder="0.00000"
                    className={clsx(
                      'w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#49b3b3]',
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
                    'flex-1 py-2 rounded text-xs font-semibold transition-colors',
                    canBuy ? 'bg-[#49b3b3] hover:bg-[#3dbdb5] text-black' : 'bg-[#2a2a2c] text-[#444] cursor-not-allowed border border-[#555]'
                  )}
                >
                  {submitting ? '…' : 'BUY'}
                </button>
                <button
                  onClick={() => submitOrder('SELL')}
                  disabled={!canSell}
                  className={clsx(
                    'flex-1 py-2 rounded text-xs font-semibold transition-colors',
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
                <span className="text-[10px] uppercase tracking-wider text-white">Order Log</span>
                {execLog.length > 0 && (
                  <button onClick={() => setExecLog([])} className="text-[10px] text-[#666] hover:text-[#aaa] transition-colors">clear</button>
                )}
              </div>
              {execLog.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#555]">
                  {!domLpId ? 'Select an LP to begin' : !domSymbol ? 'Select a symbol or click a row' : 'No orders this session'}
                </div>
              ) : execLog.map((e, idx) => (
                <div key={`${e.clord_id}-${idx}`} className="px-3 py-2 border-b border-[#222]">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold" style={{ color: e.side === 'BUY' ? '#49b3b3' : '#e0a020' }}>{e.side}</span>
                      <span className="font-mono text-white font-semibold">{e.symbol}</span>
                      <span className="font-mono text-white">{e.qty.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] font-bold font-mono" style={{ color: e.status === 'SENT' ? '#49b3b3' : '#ff5c5c' }}>{e.status}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[#aaa] truncate">{e.clord_id}</div>
                  {e.rejectReason && <div className="text-[10px] text-[#ff5c5c] mt-0.5">{e.rejectReason}</div>}
                  <div className="text-[10px] text-[#666] mt-0.5">{new Date(e.ts).toLocaleTimeString()} · {e.orderType}/{e.tif}</div>
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