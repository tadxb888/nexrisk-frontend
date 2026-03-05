/**
 * CBookPage.tsx — C-Book: Hedge / Opportunity / Repair orders
 *
 * Data source:  FIX Bridge API (via BFF at /api/v1/fix/*)
 * Spec:         NexRisk DOM Trader Frontend Brief v3.0 (March 2026)
 *
 * Implementation notes per brief:
 *   - REST paths match C++ flat-path structure (Section 4 / 11)
 *   - WebSocket: ws://BFF/ws/v1/fix/events → proxied to C++:8081
 *   - enrichBook() applied on every snapshot / incremental tick (Section 3.4 / 9.1)
 *   - Position open detection: position_id !== '' && open_price > 0 (Section 3.2)
 *   - Close method: nos_group — counter-direction MARKET order with open_close:'C' (Section 3.3)
 *   - EXECUTION_REPORT is the fill event for ALL LPs incl TE (Section 3.1 / 7.1)
 *   - Do NOT add TRADE_CAPTURE_REPORT handler — will never arrive (Section 3.1)
 *   - ACCOUNT_STATUS fires every ~2 s from TE, drives account panel (Section 7.4)
 *   - Startup sequence per Section 8
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  GridOptions,
  RowSelectionOptions,
  ValueFormatterParams,
  GetContextMenuItemsParams,
  MenuItemDef,
  GridReadyEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// =============================================================================
// THEME
// =============================================================================
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#313032',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 13,
});

// =============================================================================
// API / WS ENDPOINTS
// REST → BFF at :8080 (VITE_API_URL), which proxies to C++ :8090
// WS  → BFF at :8080 (VITE_WS_URL), which proxies to C++ :8081
// =============================================================================
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
const WS_BASE  = (import.meta as any).env?.VITE_WS_URL  || 'ws://localhost:8080';
// Brief Section 7: WebSocket at ws://localhost:8081 (via BFF proxy)
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

// =============================================================================
// INTERFACES
// =============================================================================

interface FIXLpEntry {
  lp_id: string;
  lp_name: string;
  state: string;
  provider_type: string;
}

interface FIXLpStatus {
  lp_id: string;
  state: string;
  trading_session: {
    state: string;
    active_orders: number;
    positions_loaded: number;
    instruments_loaded: number;
  };
  md_session: {
    state: string;
  };
  capabilities?: {
    close_position_method?: string;
  };
}

interface FIXCapabilities {
  lp_id: string;
  order_types: string[];
  time_in_force: string[];
  max_order_qty: number;
  min_order_qty: number;
  custom_fields: { sl_tp?: boolean; product_type?: boolean; open_close?: boolean };
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

// Brief Section 3.2: TE sandbox always returns qty=0, side=FLAT.
// Open detection: position_id !== '' && open_price > 0
interface FIXPosition {
  position_id: string;
  account: string;
  symbol: string;
  open_price: number;
  long_qty: number;
  short_qty: number;
  net_qty: number;
  side: string;         // TE sandbox: always 'FLAT' — do not use for open detection
  commission: number;
  swap: number;
  received_ts: number;
}

// Brief Section 7.4: ACCOUNT_STATUS fires every ~2 s from TE
interface AccountStatus {
  balance: number;
  equity: number;
  margin_used: number;
  margin_available: number;
  unrealized_pnl: number;
  currency: string;
}

interface BookLevel {
  price: number;
  size: number;
}

interface BookData {
  symbol: string;
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
  last_update_ts: number;
}

interface FIXOrderResp {
  success: boolean;
  clord_id?: string;
  error?: string;
}

// =============================================================================
// SEED DATA — keeps UI functional if LP is disconnected / ZMQ in bad state
// =============================================================================
const SEED_LPS: FIXLpEntry[] = [
  { lp_id: 'traderevolution', lp_name: 'TraderEvolution Sandbox', state: 'CONNECTED',    provider_type: 'traderevolution' },
  { lp_id: 'lmax-demo',       lp_name: 'LMAX Demo',               state: 'DISCONNECTED', provider_type: 'lmax'            },
];

const SEED_INSTRUMENTS: Record<string, FIXInstrument[]> = {
  traderevolution: [
    { symbol: 'EURUSD', security_id: '56871', currency: 'USD', description: 'Euro / US Dollar',            instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'GBPUSD', security_id: '',      currency: 'USD', description: 'British Pound / US Dollar',   instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'USDJPY', security_id: '',      currency: 'JPY', description: 'US Dollar / Japanese Yen',    instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 3, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'AUDUSD', security_id: '',      currency: 'USD', description: 'Australian Dollar / USD',     instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'USDCAD', security_id: '',      currency: 'CAD', description: 'US Dollar / Canadian Dollar', instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'EURGBP', security_id: '',      currency: 'GBP', description: 'Euro / British Pound',        instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'USDCHF', security_id: '',      currency: 'CHF', description: 'US Dollar / Swiss Franc',     instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'NZDUSD', security_id: '',      currency: 'USD', description: 'New Zealand Dollar / USD',    instrument_group: 'FX',     min_trade_vol: 100000, max_trade_vol: 10000000, price_precision: 5, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'XAUUSD', security_id: '56931', currency: 'USD', description: 'Gold / US Dollar',            instrument_group: 'Metals', min_trade_vol: 10,     max_trade_vol: 100000,  price_precision: 2, has_trade_route: true, trade_route: 'TRADE' },
    { symbol: 'XAGUSD', security_id: '',      currency: 'USD', description: 'Silver / US Dollar',          instrument_group: 'Metals', min_trade_vol: 100,    max_trade_vol: 500000,  price_precision: 3, has_trade_route: true, trade_route: 'TRADE' },
  ],
  'lmax-demo': [],
};

const SEED_CAPABILITIES: Record<string, FIXCapabilities> = {
  traderevolution: {
    lp_id: 'traderevolution',
    order_types: ['MARKET', 'LIMIT', 'STOP'],
    time_in_force: ['GTC', 'IOC', 'DAY'],
    max_order_qty: 10000000,
    min_order_qty: 1000,
    custom_fields: { sl_tp: true, product_type: true, open_close: true },
  },
  'lmax-demo': {
    lp_id: 'lmax-demo',
    order_types: ['MARKET', 'LIMIT'],
    time_in_force: ['IOC', 'GTC'],
    max_order_qty: 5000000,
    min_order_qty: 1000,
    custom_fields: { sl_tp: false },
  },
};

// =============================================================================
// CBOOK TYPES
// =============================================================================
export type CBookOrderType = 'Hedge' | 'Opportunity' | 'Repair';
export type CBookSide = 'BUY' | 'SELL';

export interface CBookOrder {
  id: string;
  date: string;
  time: string;
  dealerId: string;
  symbol: string;
  positionId: string;
  side: CBookSide | 'FLAT';
  volume: number;
  rawQty: number;
  lpName: string;
  lpAccount: string;
  fillPrice: number;
  type: CBookOrderType;
  comments: string;
  _lpId: string;
  _isOpen: boolean;
}

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

const TYPE_COLORS: Record<CBookOrderType, string> = {
  Hedge: '#4ecdc4',
  Opportunity: '#a78bfa',
  Repair: '#f59e0b',
};

// =============================================================================
// HELPERS
// =============================================================================
const getRowId = (r: CBookOrder) => r.id;

const fmtDate = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  return new Date(p.value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtTime = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
};

const fmtPrice = (p: ValueFormatterParams) => {
  const v = p.value; const sym = p.data?.symbol || '';
  if (v === null || v === undefined) return '';
  if (sym.includes('JPY')) return Number(v).toFixed(3);
  if (sym.includes('XAU') || sym.includes('BTC')) return Number(v).toFixed(2);
  return Number(v).toFixed(5);
};

function toLots(rawQty: number, minVol: number): number {
  return Math.abs(rawQty) / (minVol || 100000);
}

const DOM_DEPTH = 5; // Brief specifies 5 levels

function enrichBook(data: any): BookData | null {
  if (!data) return null;
  // bids[]/asks[] are correctly labelled from both WS and REST sources.
  const rawBids: any[] = data.bids || [];
  const rawAsks: any[] = data.asks || [];
  const bids: BookLevel[] = rawBids
    .map((b: any) => ({ price: b.price, size: b.size }))
    .sort((a: BookLevel, b: BookLevel) => b.price - a.price)
    .slice(0, DOM_DEPTH);
  const asks: BookLevel[] = rawAsks
    .map((a: any) => ({ price: a.price, size: a.size }))
    .sort((a: BookLevel, b: BookLevel) => a.price - b.price)
    .slice(0, DOM_DEPTH);
  const bestBid = bids[0]?.price ?? data.best_bid ?? null;
  const bestAsk = asks[0]?.price ?? data.best_ask ?? null;
  if (bestBid == null || bestAsk == null) return null;
  const spread  = +(bestAsk - bestBid).toFixed(5);
  return { symbol: data.symbol ?? '', best_bid: bestBid, best_ask: bestAsk, spread, bids, asks, last_update_ts: data.last_update_ts ?? Date.now() };
}

/**
 * positionToCBook — Section 3.2
 * TE sandbox: side=FLAT, qty=0 always. Use position_id + open_price for open detection.
 */
function positionToCBook(pos: FIXPosition, lpId: string, instrMap: Record<string, FIXInstrument>): CBookOrder {
  const ins    = instrMap[pos.symbol];
  const minVol = ins?.min_trade_vol ?? 100000;
  const ts     = new Date(pos.received_ts || Date.now());
  // TE: side=FLAT, qty=0. Open if position_id is non-empty and open_price > 0 (Section 3.2).
  const isOpen = pos.position_id !== '' && pos.open_price > 0;
  return {
    id:         `pos-${lpId}-${pos.position_id}`,
    date:       ts.toISOString(),
    time:       ts.toISOString(),
    dealerId:   pos.account,
    symbol:     pos.symbol,
    positionId: pos.position_id,
    side:       pos.side === 'LONG' ? 'BUY' : pos.side === 'SHORT' ? 'SELL' : 'FLAT',
    volume:     toLots(Math.abs(pos.net_qty), minVol),
    rawQty:     Math.abs(pos.net_qty),
    lpName:     lpId,
    lpAccount:  pos.account,
    fillPrice:  pos.open_price,
    type:       'Hedge',
    comments:   `swap:${(pos.swap ?? 0).toFixed(2)}  comm:${(pos.commission ?? 0).toFixed(2)}`,
    _lpId:      lpId,
    _isOpen:    isOpen,
  };
}

// =============================================================================
// COMPONENT
// =============================================================================
export function CBookPage() {
  const gridRef = useRef<AgGridReact<CBookOrder>>(null);

  // ── LPs ───────────────────────────────────────────────────────────────────
  const [allLps, setAllLps]     = useState<FIXLpEntry[]>(SEED_LPS);
  const [lpsLoading, setLpsLoading] = useState(false);

  // ── Grid ──────────────────────────────────────────────────────────────────
  const [gridLpId, setGridLpId]           = useState<string>('');
  const [livePositions, setLivePositions] = useState<CBookOrder[]>([]);
  const [sessionOrders, setSessionOrders] = useState<CBookOrder[]>([]);
  const [posLoading, setPosLoading]       = useState(false);
  const [timePeriod, setTimePeriod]       = useState<'today' | 'week' | 'month'>('week');
  const instrCacheRef = useRef<Record<string, Record<string, FIXInstrument>>>({});

  // ── Close-mode ────────────────────────────────────────────────────────────
  const [closeRow, setCloseRow] = useState<CBookOrder | null>(null);

  // ── DOM state ─────────────────────────────────────────────────────────────
  const [domLpId, setDomLpId]         = useState<string>('');
  const [domSymbol, setDomSymbol]     = useState<string>('');
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  const [showPicker, setShowPicker]   = useState(false);

  const [instruments, setInstruments]     = useState<FIXInstrument[]>([]);
  const [instrLoading, setInstrLoading]   = useState(false);
  const [capabilities, setCapabilities]   = useState<FIXCapabilities | null>(null);
  const [lpStatus, setLpStatus]           = useState<FIXLpStatus | null>(null);
  const [account, setAccount]             = useState<AccountStatus | null>(null);

  const effectiveCaps = capabilities ?? {
    lp_id: domLpId, order_types: ['MARKET', 'LIMIT'], time_in_force: ['GTC', 'IOC', 'DAY'],
    max_order_qty: 10000000, min_order_qty: 1000, custom_fields: { sl_tp: false },
  };

  const [liveBook, setLiveBook]     = useState<BookData | null>(null);
  const [bookStatus, setBookStatus] = useState<string>('—');

  // Refs for WS handler closures
  const bookPollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef<string>('');
  const wsRef         = useRef<WebSocket | null>(null);
  const wsSymbolRef   = useRef<string>('');
  const wsLpIdRef     = useRef<string>('');

  const [domOrderType, setDomOrderType] = useState<string>('MARKET');
  const [domTif, setDomTif]             = useState<string>('GTC');
  const [domQtyLots, setDomQtyLots]     = useState<string>('');
  const [limitPrice, setLimitPrice]     = useState<string>('');
  const [stopLoss, setStopLoss]         = useState<string>('');
  const [takeProfit, setTakeProfit]     = useState<string>('');
  const [submitting, setSubmitting]     = useState(false);
  const [execLog, setExecLog]           = useState<ExecEntry[]>([]);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // ── LP list — start from seed, refresh from /fix/status ──────────────────
  useEffect(() => {
    let cancelled = false;
    setLpsLoading(true);
    const seedConnected = SEED_LPS.find((l) => l.state === 'CONNECTED');
    if (seedConnected) {
      setGridLpId((prev) => prev || seedConnected.lp_id);
      setDomLpId((prev)  => prev || seedConnected.lp_id);
    }
    bff<{ success: boolean; data: { lps: Record<string, any> } }>('/api/v1/fix/status')
      .then((r) => {
        if (cancelled || !r.success) return;
        const lpDict = r.data.lps ?? {};
        const live: FIXLpEntry[] = Object.entries(lpDict).map(([id, info]: [string, any]) => ({
          lp_id:         id,
          lp_name:       info.lp_name ?? SEED_LPS.find(s => s.lp_id === id)?.lp_name ?? id,
          state:         info.state   ?? 'UNKNOWN',
          provider_type: info.provider_type ?? '',
        }));
        for (const seed of SEED_LPS) {
          if (!live.find((l) => l.lp_id === seed.lp_id)) live.push({ ...seed, state: 'DISCONNECTED' });
        }
        setAllLps(live);
        const first = live.find((l) => l.state === 'CONNECTED');
        if (first) {
          setGridLpId((prev) => prev || first.lp_id);
          setDomLpId((prev)  => prev || first.lp_id);
        }
      })
      .catch(() => { /* seed data shown */ })
      .finally(() => { if (!cancelled) setLpsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── LP status + instruments + capabilities when DOM LP changes ────────────
  // Brief Section 4.1: GET /fix/status/{lp_id}
  // Also loads instruments + capabilities for the DOM panel
  useEffect(() => {
    if (!domLpId) { setInstruments([]); setCapabilities(null); setLpStatus(null); return; }
    let cancelled = false;

    // Apply seed immediately
    const seedInstrs = SEED_INSTRUMENTS[domLpId] ?? [];
    const seedCaps   = SEED_CAPABILITIES[domLpId] ?? null;
    setInstruments(seedInstrs);
    setCapabilities(seedCaps);
    if (seedInstrs.length > 0) setDomSymbol((prev) => prev || seedInstrs[0].symbol);
    if (seedCaps) { setDomOrderType(seedCaps.order_types[0] || 'MARKET'); setDomTif(seedCaps.time_in_force[0] || 'GTC'); }
    const seedMap: Record<string, FIXInstrument> = {};
    for (const ins of seedInstrs) seedMap[ins.symbol] = ins;
    instrCacheRef.current[domLpId] = seedMap;

    setInstrLoading(true);
    Promise.allSettled([
      bff<{ success: boolean; data: FIXLpStatus }>(`/api/v1/fix/status/${domLpId}`),
      bff<{ success: boolean; data: { instruments: FIXInstrument[] } }>(`/api/v1/fix/lp/${domLpId}/instruments`),
      bff<{ success: boolean; data: FIXCapabilities }>(`/api/v1/fix/lp/${domLpId}/capabilities`),
    ]).then(([statusR, instrR, capsR]) => {
      if (cancelled) return;
      if (statusR.status === 'fulfilled' && statusR.value.success) setLpStatus(statusR.value.data);
      if (instrR.status === 'fulfilled' && instrR.value.success && instrR.value.data.instruments?.length) {
        setInstruments(instrR.value.data.instruments);
        const liveMap: Record<string, FIXInstrument> = {};
        for (const ins of instrR.value.data.instruments) liveMap[ins.symbol] = ins;
        instrCacheRef.current[domLpId] = liveMap;
      }
      if (capsR.status === 'fulfilled' && capsR.value.success) {
        setCapabilities(capsR.value.data);
        setDomOrderType(capsR.value.data.order_types[0] || 'MARKET');
        setDomTif(capsR.value.data.time_in_force[0] || 'GTC');
      }
    }).finally(() => { if (!cancelled) setInstrLoading(false); });

    return () => { cancelled = true; };
  }, [domLpId]);

  // ── Grid: fetch positions for selected LP ────────────────────────────────
  useEffect(() => {
    if (!gridLpId) { setLivePositions([]); return; }
    let cancelled = false;
    const fetchPositions = async () => {
      setPosLoading(true);
      try {
        if (!instrCacheRef.current[gridLpId]) {
          const ir = await bff<{ success: boolean; data: { instruments: FIXInstrument[] } }>(`/api/v1/fix/lp/${gridLpId}/instruments`);
          if (!cancelled && ir.success) {
            const map: Record<string, FIXInstrument> = {};
            for (const ins of ir.data.instruments) map[ins.symbol] = ins;
            instrCacheRef.current[gridLpId] = map;
          }
        }
        // Brief Section 4.4 / 11: GET /fix/positions/{lp_id}
        const r = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${gridLpId}`);
        if (cancelled || !r.success) return;
        const instrMap = instrCacheRef.current[gridLpId] ?? {};
        // Brief Section 3.2: use position_id + open_price > 0 for open detection (NOT side/qty)
        setLivePositions(
          r.data.positions
            .filter((p) => p.position_id !== '' && p.open_price > 0)
            .map((p) => positionToCBook(p, gridLpId, instrMap))
        );
      } catch {
        if (!cancelled) setLivePositions([]);
      } finally {
        if (!cancelled) setPosLoading(false);
      }
    };
    fetchPositions();
    const timer = setInterval(fetchPositions, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [gridLpId]);

  // ── Market data startup — Section 8 of brief, implemented exactly ───────────
  // 1. GET  /status/{lp_id}         — verify sessions logged on
  // 2. POST /md/subscribe            — tell backend to start publishing symbol
  // 3. Wait 400ms                    — first MD snapshot arrives within this window (TE)
  // 4. GET  /md/book/{lp_id}/{sym}  — prime DOM ladder, call enrichBook() before render
  // 5. GET  /positions/{lp_id}       — load positions panel
  // 6. GET  /orders/{lp_id}/active   — load active orders
  // 7. Connect WebSocket             — receive EXECUTION_REPORT, MD ticks, POSITION_REPORT, ACCOUNT_STATUS
  // 8. Poll GET /md/book every 1s    — supplement WS, guarantees full refresh if incremental missed
  useEffect(() => {
    if (!domLpId || !domSymbol) {
      setLiveBook(null);
      setBookStatus('—');
      if (bookPollRef.current) clearInterval(bookPollRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsSymbolRef.current = '';
      wsLpIdRef.current = '';
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
    if (bookPollRef.current) clearInterval(bookPollRef.current);
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

    subscribedRef.current = key;
    wsSymbolRef.current   = domSymbol;
    wsLpIdRef.current     = domLpId;
    setLiveBook(null);
    setBookStatus('SUBSCRIBING');

    let cancelled = false;

    const startup = async () => {
      // Step 1: GET /status/{lp_id} — show warning if not logged on
      try {
        const st = await bff<{ success: boolean; data: FIXLpStatus }>(`/api/v1/fix/status/${domLpId}`);
        if (!cancelled && st.success) setLpStatus(st.data);
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 2: POST /md/subscribe
      try {
        await bff(`/api/v1/fix/md/subscribe`, {
          method: 'POST', body: JSON.stringify({ lp_id: domLpId, symbol: domSymbol }),
        });
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 3: wait 400ms — first MD snapshot arrives within this window from TE
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;

      // Step 4: GET /md/book — prime DOM ladder (Section 9.2)
      // enrichBook() called on every result before render (Section 3.4 / 9.1)
      const fetchBook = async () => {
        if (cancelled) return;
        // Use refs so this closure always has the current lpId/symbol even if called from stale setInterval
        const lpId  = wsLpIdRef.current;
        const sym   = wsSymbolRef.current;
        if (!lpId || !sym) return;
        try {
          const r = await bff<{ success: boolean; data: any }>(`/api/v1/fix/md/book/${lpId}/${sym}`);
          if (cancelled || !r.success || !r.data) return;
          const rd = r.data;
          const restRaw = (rd?.bids != null || rd?.asks != null) ? rd : (rd?.data ?? rd);
          const book = enrichBook(restRaw);
          if (book) { setLiveBook(book); setBookStatus('HEALTHY'); }
        } catch (e) { console.warn('[CBook POLL] fetchBook error:', e); }
      };
      await fetchBook();

      // Step 5: GET /positions/{lp_id}
      try {
        const instrMap = instrCacheRef.current[domLpId] ?? {};
        const posR = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${domLpId}`);
        if (!cancelled && posR.success) {
          setLivePositions(
            posR.data.positions
              .filter((p) => p.position_id !== '' && p.open_price > 0)
              .map((p) => positionToCBook(p, domLpId, instrMap))
          );
        }
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 7: connect WebSocket
      const ws = new WebSocket(`${WS_BASE}${FIX_WS_PATH}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        console.log('[CBook WS] ✅ CONNECTED to', `${WS_BASE}${FIX_WS_PATH}`);
        setBookStatus((prev) => prev === 'HEALTHY' ? 'HEALTHY' : 'EMPTY');
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(evt.data);
          console.log('[CBook WS] MESSAGE type:', msg.type, 'lp_id:', msg.lp_id, 'symbol:', msg.data?.symbol ?? msg.symbol);

          // ── FILLS — Brief Section 7.1 / 3.1
          // EXECUTION_REPORT is the fill type for ALL LPs incl TE.
          // nexrisk_service normalises TE's 35=AE TradeCaptureReport → EXECUTION_REPORT.
          // Do NOT add TRADE_CAPTURE_REPORT case — will never arrive.
          if (msg.type === 'EXECUTION_REPORT') {
            // Brief Section 9.5: fields may be at event.data.* or event.* level
            const fill = msg.data ?? msg;
            const entry: ExecEntry = {
              clord_id:  fill.cl_ord_id ?? fill.clord_id ?? `ws-${Date.now()}`,
              ts:        msg.timestamp_ms ?? Date.now(),
              symbol:    fill.symbol    ?? msg.symbol    ?? '',
              side:      (fill.side     ?? msg.side      ?? 'BUY') as 'BUY' | 'SELL',
              qty:       fill.last_qty  ?? msg.last_qty  ?? 0,
              orderType: 'MARKET',
              tif:       '',
              lpId:      msg.lp_id ?? wsLpIdRef.current,
              status:    'SENT',
            };
            setExecLog((prev) => [entry, ...prev].slice(0, 20));
            // Brief Section 9.5: re-fetch positions after fill
            if (wsLpIdRef.current) {
              const instrMap = instrCacheRef.current[wsLpIdRef.current] ?? {};
              bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${wsLpIdRef.current}`)
                .then((r) => {
                  if (r.success && !cancelled) {
                    setLivePositions(
                      r.data.positions
                        .filter((p) => p.position_id !== '' && p.open_price > 0)
                        .map((p) => positionToCBook(p, wsLpIdRef.current, instrMap))
                    );
                  }
                }).catch(() => {});
            }
          }

          // ── MARKET DATA — Brief Section 7.2
          // Only process snapshots — backend publishes a full book snapshot after
          // every incremental update (MarketDataSession::OnMarketDataIncrementalFull).
          // Incrementals carry only raw entries[], not bids/asks, so enrichBook
          // cannot render them. Dropping them here prevents the display from
          // flashing to null between each snapshot.
          if (
            msg.type === 'MARKET_DATA_SNAPSHOT' ||
            msg.type === 'MD_SNAPSHOT'
          ) {
            // NexRiskService wraps the ZMQ payload as envelope.data.
            // ZMQ payload may have book fields at top level (flat) or nested under .data (wrapped).
            // Flat:    msg.data = { symbol, bids, asks, best_bid, best_ask, ... }
            // Wrapped: msg.data = { type, lp_id, data: { symbol, bids, asks, ... }, ... }
            const outerData = msg.data ?? msg;
            const bookRaw = (outerData?.bids != null || outerData?.asks != null)
              ? outerData                      // flat — bids/asks at outerData level
              : (outerData?.data ?? outerData); // wrapped — drill into .data
            const sym = bookRaw?.symbol ?? outerData?.symbol ?? msg.symbol;
            if (!sym) return;                                    // no symbol → skip
            if (sym !== wsSymbolRef.current) return;             // wrong symbol → skip
            if (msg.lp_id && msg.lp_id !== wsLpIdRef.current) return;
            const book = enrichBook(bookRaw);
            if (book) {
              setLiveBook(book);
              setBookStatus('HEALTHY');
            }
          }

          // ── POSITIONS — Brief Section 7.3
          if (msg.type === 'POSITION_REPORT') {
            if (msg.lp_id && msg.lp_id !== wsLpIdRef.current) return;
            const instrMap = instrCacheRef.current[wsLpIdRef.current] ?? {};
            const pos: FIXPosition = {
              position_id: msg.position_id ?? '',
              account:     msg.account     ?? '',
              symbol:      msg.symbol      ?? '',
              open_price:  msg.open_price  ?? 0,
              long_qty:    msg.long_qty    ?? 0,
              short_qty:   msg.short_qty   ?? 0,
              net_qty:     msg.net_qty     ?? 0,
              side:        msg.side        ?? 'FLAT',
              commission:  msg.commission  ?? 0,
              swap:        msg.swap        ?? 0,
              received_ts: msg.timestamp_ms ?? Date.now(),
            };
            if (pos.position_id !== '' && pos.open_price > 0) {
              const row = positionToCBook(pos, wsLpIdRef.current, instrMap);
              setLivePositions((prev) => {
                const idx = prev.findIndex((p) => p.positionId === row.positionId);
                return idx >= 0 ? prev.map((p, i) => i === idx ? row : p) : [row, ...prev];
              });
            }
          }

          if (msg.type === 'POSITION_CLOSED') {
            if (msg.lp_id && msg.lp_id !== wsLpIdRef.current) return;
            const pid = msg.position_id ?? msg.data?.position_id;
            if (pid) setLivePositions((prev) => prev.filter((p) => p.positionId !== pid));
          }

          // ── ACCOUNT — Brief Section 7.4
          // Fires every ~2 s from TE. Drive account panel without REST polling.
          if (msg.type === 'ACCOUNT_STATUS') {
            const d = msg.data ?? msg;
            setAccount({
              balance:          d.balance          ?? 0,
              equity:           d.equity           ?? 0,
              margin_used:      d.margin_used       ?? 0,
              margin_available: d.margin_available  ?? 0,
              unrealized_pnl:   d.unrealized_pnl    ?? 0,
              currency:         d.currency          ?? 'USD',
            });
          }

          // ── SESSION — Brief Section 7
          if (msg.type === 'SESSION_LOGON') setBookStatus('EMPTY');
          if (msg.type === 'SESSION_LOGOUT') setBookStatus('DISCONNECTED');

        } catch { /* malformed WS frame */ }
      };

      ws.onerror = (e) => console.warn('[CBook WS] error', e);
      ws.onclose = () => { if (!cancelled) console.log('[CBook WS] closed'); };
    };

    startup();

    return () => {
      cancelled = true;
      subscribedRef.current = '';
      if (bookPollRef.current) clearInterval(bookPollRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsSymbolRef.current = '';
      wsLpIdRef.current   = '';
    };
  }, [domLpId, domSymbol]);

  // ── Close-mode: sync DOM when closeRow changes ────────────────────────────
  useEffect(() => {
    if (!closeRow) return;
    if (closeRow._lpId !== domLpId) setDomLpId(closeRow._lpId);
    setDomSymbol(closeRow.symbol);
    // qty: don't pre-fill 0 for TE sandbox — leave blank so user enters actual size
    if (closeRow.volume > 0) setDomQtyLots(closeRow.volume.toFixed(2));
    else setDomQtyLots('');
    setLimitPrice(''); setStopLoss(''); setTakeProfit('');
    setShowPicker(false);
    subscribedRef.current = '';
  }, [closeRow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================================
  // DERIVED
  // ==========================================================================
  const activeInstrument = useMemo(
    () => instruments.find((i) => i.symbol === domSymbol) ?? null,
    [instruments, domSymbol]
  );

  const domLpInfo   = allLps.find((l) => l.lp_id === domLpId) ?? null;
  const isConnected = domLpInfo?.state === 'CONNECTED';
  const slTpSupported = effectiveCaps.custom_fields?.sl_tp === true;

  const filteredInstruments = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase();
    const src = q
      ? instruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
      : instruments;
    return src.slice(0, 60);
  }, [instruments, symbolSearch]);

  const gridRows = useMemo<CBookOrder[]>(() => {
    const now = new Date();
    const filtSess = sessionOrders.filter((o) => {
      const d = new Date(o.date);
      if (timePeriod === 'today') return d.toDateString() === now.toDateString();
      if (timePeriod === 'week')  return d >= new Date(now.getTime() - 7 * 86400000);
      return true;
    });
    return [...livePositions, ...filtSess];
  }, [livePositions, sessionOrders, timePeriod]);

  const stats = useMemo(() => ({
    total:  gridRows.length,
    volume: gridRows.reduce((s, r) => s + r.volume, 0),
    hedge:  gridRows.filter((r) => r.type === 'Hedge').length,
    opp:    gridRows.filter((r) => r.type === 'Opportunity').length,
    rep:    gridRows.filter((r) => r.type === 'Repair').length,
    buys:   gridRows.filter((r) => r.side === 'BUY').length,
    sells:  gridRows.filter((r) => r.side === 'SELL').length,
  }), [gridRows]);

  const instrDecimals = activeInstrument?.price_precision
    ?? (domSymbol.includes('JPY') ? 3 : domSymbol.includes('XAU') || domSymbol.includes('BTC') ? 2 : 5);

  // ==========================================================================
  // ORDER PLACEMENT — Brief Section 5 / 9.3 / 9.4
  // ==========================================================================
  const placeOrder = useCallback(async (side: 'BUY' | 'SELL') => {
    if (!domLpId || !domSymbol || submitting) return;
    const qtyLots = parseFloat(domQtyLots);
    if (!qtyLots || qtyLots <= 0) return;
    const minVol   = activeInstrument?.min_trade_vol ?? 100000;
    const qtyUnits = Math.round(qtyLots * minVol);

    setSubmitting(true);
    const entry: ExecEntry = {
      clord_id: '—', ts: Date.now(), symbol: domSymbol, side,
      qty: qtyUnits, orderType: domOrderType, tif: domTif,
      lpId: domLpId, status: 'SENT',
    };

    try {
      // ── Close an open position (nos_group method — Section 3.3 / 9.4) ──────
      // Send counter-direction MARKET order with open_close:'C' + position_id.
      if (closeRow && closeRow._lpId === domLpId && closeRow.symbol === domSymbol) {
        const body: Record<string, unknown> = {
          lp_id:         domLpId,
          symbol:        domSymbol,
          side,                          // counter-direction chosen by user
          qty:           qtyUnits,
          order_type:    'MARKET',
          time_in_force: 'GTC',
          open_close:    'C',            // tag 77 = Close
          position_id:   closeRow.positionId,
        };
        const r = await bff<FIXOrderResp>('/api/v1/fix/order', {
          method: 'POST', body: JSON.stringify(body),
        });
        // Brief Section 6.1 / 10: HTTP 200 + success:true = queued, NOT filled.
        // Fill confirmed by EXECUTION_REPORT on WS.
        if (r.success) {
          entry.clord_id = r.clord_id ?? '—';
          setExecLog((prev) => [entry, ...prev].slice(0, 20));
          setCloseRow(null);
          gridRef.current?.api?.deselectAll();
        } else {
          entry.status = 'REJECTED'; entry.rejectReason = r.error ?? 'Rejected';
          setExecLog((prev) => [entry, ...prev].slice(0, 20));
        }

      // ── New open order (Section 9.3) ────────────────────────────────────
      } else {
        const body: Record<string, unknown> = {
          lp_id:         domLpId,
          symbol:        domSymbol,
          side,
          qty:           qtyUnits,
          order_type:    domOrderType,
          time_in_force: domTif,
          open_close:    'O',
          product_type:  (domSymbol.includes('XAU') || domSymbol.includes('BTC') || domSymbol.includes('US') || domSymbol.includes('DE')) ? 'CFD' : 'FOREX',
        };
        if ((domOrderType === 'LIMIT' || domOrderType === 'STOP') && limitPrice) {
          const p = parseFloat(limitPrice);
          if (!p) {
            entry.status = 'REJECTED'; entry.rejectReason = 'Price required for ' + domOrderType;
            setExecLog((prev) => [entry, ...prev].slice(0, 20));
            return;
          }
          body.price = p;
        }
        if (slTpSupported) {
          const sl = parseFloat(stopLoss);  if (sl)  body.stop_loss   = sl;
          const tp = parseFloat(takeProfit); if (tp) body.take_profit = tp;
        }
        const r = await bff<FIXOrderResp>('/api/v1/fix/order', {
          method: 'POST', body: JSON.stringify(body),
        });
        if (r.success) {
          entry.clord_id = r.clord_id ?? '—';
          setExecLog((prev) => [entry, ...prev].slice(0, 20));
          // Optimistic session row — grid shows immediately, fill confirmed by WS EXECUTION_REPORT
          const newRow: CBookOrder = {
            id: `sess-${r.clord_id ?? Date.now()}`,
            date: new Date().toISOString(), time: new Date().toISOString(),
            dealerId: domLpId, symbol: domSymbol,
            positionId: r.clord_id ?? '', side,
            volume: qtyLots, rawQty: qtyUnits,
            lpName: domLpId,
            lpAccount: domLpInfo?.lp_name ?? domLpId,
            fillPrice: liveBook
              ? (side === 'BUY' ? (liveBook.best_ask ?? 0) : (liveBook.best_bid ?? 0))
              : parseFloat(limitPrice) || 0,
            type: 'Hedge', comments: `FIX:${r.clord_id}`,
            _lpId: domLpId, _isOpen: false,
          };
          setSessionOrders((prev) => [newRow, ...prev]);
        } else {
          entry.status = 'REJECTED'; entry.rejectReason = r.error ?? 'Rejected';
          setExecLog((prev) => [entry, ...prev].slice(0, 20));
        }
      }
    } catch (err: unknown) {
      entry.status = 'REJECTED';
      entry.rejectReason = err instanceof Error ? err.message : 'Request failed';
      setExecLog((prev) => [entry, ...prev].slice(0, 20));
    } finally {
      setSubmitting(false);
    }
  }, [
    domLpId, domSymbol, submitting, domQtyLots, domOrderType, domTif,
    limitPrice, stopLoss, takeProfit, slTpSupported, activeInstrument,
    liveBook, closeRow, domLpInfo,
  ]);

  // ── Grid row selection → close mode ───────────────────────────────────────
  const onSelectionChanged = useCallback((e: SelectionChangedEvent<CBookOrder>) => {
    const sel = e.api.getSelectedRows();
    if (sel.length === 1 && sel[0]._isOpen) setCloseRow(sel[0]);
    else setCloseRow(null);
  }, []);

  const exitCloseMode = useCallback(() => {
    setCloseRow(null);
    setDomQtyLots('');
    gridRef.current?.api?.deselectAll();
  }, []);

  // ==========================================================================
  // COLUMN DEFINITIONS
  // ==========================================================================
  const columnDefs = useMemo<ColDef<CBookOrder>[]>(() => [
    { field: 'date',       headerName: 'Date',       filter: 'agDateColumnFilter',   width: 110, pinned: 'left', valueFormatter: fmtDate, sort: 'desc' },
    { field: 'time',       headerName: 'Time',       filter: 'agDateColumnFilter',   width: 120, pinned: 'left', valueFormatter: fmtTime },
    { field: 'dealerId',   headerName: 'Account',    filter: 'agSetColumnFilter',    width: 140 },
    { field: 'symbol',     headerName: 'Symbol',     filter: 'agSetColumnFilter',    width: 100, cellStyle: { fontWeight: 500 } },
    { field: 'positionId', headerName: 'Position ID',filter: 'agTextColumnFilter',   width: 160 },
    {
      field: 'side', headerName: 'Side', filter: 'agSetColumnFilter', width: 80,
      cellRenderer: (p: { value: string }) =>
        <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : p.value === 'SELL' ? '#e0a020' : '#888', fontWeight: 600 }}>{p.value}</span>,
    },
    { field: 'volume',    headerName: 'Volume (L)', filter: 'agNumberColumnFilter',  width: 110, valueFormatter: (p) => p.value ? Number(p.value).toFixed(2) : '—' },
    { field: 'fillPrice', headerName: 'Fill Price', filter: 'agNumberColumnFilter',  width: 120, valueFormatter: fmtPrice },
    {
      field: 'type', headerName: 'Type', filter: 'agSetColumnFilter', width: 110,
      filterParams: { values: ['Hedge', 'Opportunity', 'Repair'] },
      cellRenderer: (p: { value: CBookOrderType }) => (
        <span style={{ color: TYPE_COLORS[p.value] || '#999', fontWeight: 500 }}>{p.value}</span>
      ),
    },
    {
      headerName: 'Status', width: 90, suppressSizeToFit: true,
      cellRenderer: (p: { data?: CBookOrder }) => {
        if (!p.data) return null;
        return p.data._isOpen
          ? <span style={{ color: '#4ecdc4', fontSize: '10px' }}>● OPEN</span>
          : <span style={{ color: '#888', fontSize: '10px' }}>○ FILLED</span>;
      },
    },
    {
      field: 'comments', headerName: 'Comments', filter: 'agTextColumnFilter',
      flex: 1, minWidth: 150, editable: true, cellStyle: { color: '#888' },
      cellEditor: 'agTextCellEditor',
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, minWidth: 70 }), []);
  const rowSelection  = useMemo<RowSelectionOptions>(() => ({ mode: 'singleRow', enableClickSelection: true }), []);
  const gridOptions   = useMemo<GridOptions<CBookOrder>>(() => ({
    enableAdvancedFilter: true,
    sideBar: { toolPanels: ['columns'], defaultToolPanel: '' },
    columnHoverHighlight: true, animateRows: false, rowBuffer: 20,
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent' },
        { statusPanel: 'agSelectedRowCountComponent' },
        { statusPanel: 'agAggregationComponent' },
      ],
    },
  }), []);

  const onGridReady = useCallback((_e: GridReadyEvent) => {
    setTimeout(() => gridRef.current?.api?.autoSizeAllColumns(), 0);
  }, []);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
    const row = params.node?.data as CBookOrder | undefined;
    return [
      { name: row?._isOpen ? 'Close Position in DOM' : 'View in DOM', action: () => { if (row?._isOpen) setCloseRow(row); } },
      'separator', 'copy', 'copyWithHeaders', 'separator',
      { name: 'Export CSV',   action: () => params.api.exportDataAsCsv()   },
      { name: 'Export Excel', action: () => params.api.exportDataAsExcel() },
    ];
  }, []);

  // ==========================================================================
  // DOM DISPLAY HELPERS
  // ==========================================================================
  const lpDotColor = (st: string) =>
    st === 'CONNECTED' ? '#4ecdc4' : st === 'DEGRADED' ? '#e0a020' : (st === 'CONNECTING' || st === 'RECONNECTING') ? '#a78bfa' : '#555';

  const bookBadge = (st: string) => ({
    HEALTHY:      { text: 'LIVE',   color: '#4ecdc4' },
    STALE:        { text: 'STALE',  color: '#e0a020' },
    RESYNCING:    { text: 'SYNC',   color: '#a78bfa' },
    SUBSCRIBING:  { text: 'SUB…',   color: '#666'    },
    EMPTY:        { text: 'WAIT',   color: '#666'    },
    ERROR:        { text: 'ERR',    color: '#ff6b6b' },
    DISCONNECTED: { text: 'DISC',   color: '#ff6b6b' },
  }[st] ?? { text: st, color: '#555' });

  // Brief Section 3.3: close side.
  // If side is FLAT (TE sandbox), closeSide is null → both BUY and SELL enabled.
  const closeSide: 'BUY' | 'SELL' | null = closeRow
    ? (closeRow.side === 'BUY' ? 'SELL' : closeRow.side === 'SELL' ? 'BUY' : null)
    : null;

  const canBuy  = isConnected && !!domSymbol && !!domQtyLots && !submitting && (!closeRow || closeSide === 'BUY'  || closeSide === null);
  const canSell = isConnected && !!domSymbol && !!domQtyLots && !submitting && (!closeRow || closeSide === 'SELL' || closeSide === null);

  const fmtBookSize = (sz: number) =>
    sz >= 1000000 ? `${(sz / 1000000).toFixed(1)}M`
    : sz >= 100000 ? `${(sz / 100000).toFixed(2)}L`
    : sz >= 1000   ? `${(sz / 1000).toFixed(1)}K`
    : sz.toFixed(0);

  const fmtAcct = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">C-Book</h1>
          <p className="text-xs text-[#999]">Hybrid book — Hedge, Opportunity & Repair orders</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#666]">View LP:</span>
            {lpsLoading ? <span className="text-[#555]">…</span> : (
              <select
                value={gridLpId}
                onChange={(e) => { setGridLpId(e.target.value); setCloseRow(null); }}
                className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]"
              >
                <option value="">— All LPs —</option>
                {allLps.map((l) => (
                  <option key={l.lp_id} value={l.lp_id}>
                    {l.lp_name ?? l.lp_id}{l.state !== 'CONNECTED' ? ` (${l.state})` : ''}
                  </option>
                ))}
              </select>
            )}
            {posLoading && <span className="text-[#555] animate-pulse">↻</span>}
          </div>
          <div className="w-px h-4 bg-[#555]" />
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as 'today' | 'week' | 'month')}
            className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <div className="w-px h-4 bg-[#555]" />
          <div><span className="text-[#666]">Pos:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
          <div>
            <span className="text-[#666]">L/S:</span>
            <span className="ml-1 font-mono">
              <span className="text-[#4ecdc4]">{stats.buys}</span>
              <span className="text-[#444]"> / </span>
              <span className="text-[#e0a020]">{stats.sells}</span>
            </span>
          </div>
          <div><span className="text-[#666]">Vol:</span><span className="ml-1 font-mono text-white">{stats.volume.toFixed(2)}</span></div>
          <div className="w-px h-4 bg-[#555]" />
          <div><span className="text-[#666]">H:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Hedge }}>{stats.hedge}</span></div>
          <div><span className="text-[#666]">O:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Opportunity }}>{stats.opp}</span></div>
          <div><span className="text-[#666]">R:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Repair }}>{stats.rep}</span></div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2 min-h-0">

        {/* ── Grid ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {posLoading && livePositions.length === 0 && (
            <div className="flex-shrink-0 px-3 py-1.5 text-xs text-[#555] border-b border-[#444]">
              Fetching positions from {gridLpId}…
            </div>
          )}
          <div className="flex-1 min-h-0">
            <AgGridReact<CBookOrder>
              ref={gridRef}
              theme={gridTheme}
              rowData={gridRows}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              gridOptions={gridOptions}
              rowHeight={26}
              headerHeight={36}
              getRowId={(p) => getRowId(p.data)}
              rowSelection={rowSelection}
              getRowStyle={(p) => {
                if (closeRow && p.data?.id === closeRow.id)
                  return { backgroundColor: '#231a38', borderLeft: '2px solid #a78bfa' };
                if (p.data?._isOpen)
                  return { borderLeft: '2px solid #4ecdc433' };
                return undefined;
              }}
              cellSelection={{ enableHeaderHighlight: true }}
              getContextMenuItems={getContextMenuItems}
              onGridReady={onGridReady}
              onSelectionChanged={onSelectionChanged}
            />
          </div>
        </div>

        {/* ── DOM Panel ─────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col border border-[#555] rounded overflow-hidden flex-shrink-0"
          style={{ width: '300px', backgroundColor: '#232225' }}
        >

          {/* Panel header */}
          <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: '#1a1a1c' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">Market Depth</span>
              {closeRow && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: '#231a38', color: '#a78bfa', border: '1px solid #a78bfa44' }}>
                  CLOSE MODE
                </span>
              )}
            </div>
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

          {/* ── Account Panel — Brief Section 7.4 ────────────────────────────── */}
          {/* ACCOUNT_STATUS fires every ~2 s from TE — drives this without REST polling */}
          {account && (
            <div className="px-3 py-1.5 border-b border-[#333] flex-shrink-0 grid grid-cols-3 gap-x-2 text-[10px]" style={{ backgroundColor: '#191a1c' }}>
              <div>
                <div className="text-[#444] mb-px">Balance</div>
                <div className="font-mono text-white">{fmtAcct(account.balance)}</div>
              </div>
              <div>
                <div className="text-[#444] mb-px">Equity</div>
                <div className="font-mono" style={{ color: account.equity >= account.balance ? '#4ecdc4' : '#e0a020' }}>
                  {fmtAcct(account.equity)}
                </div>
              </div>
              <div>
                <div className="text-[#444] mb-px">Free Margin</div>
                <div className="font-mono text-white">{fmtAcct(account.margin_available)}</div>
              </div>
            </div>
          )}

          {/* LP session state (from brief Section 4.1) */}
          {lpStatus && (
            <div className="px-3 py-1 border-b border-[#333] flex items-center gap-3 text-[10px] flex-shrink-0" style={{ backgroundColor: '#191a1c' }}>
              <span className="text-[#444]">Trading:</span>
              <span style={{ color: lpStatus.trading_session.state === 'LOGGED_ON' ? '#4ecdc4' : '#e0a020' }}>
                {lpStatus.trading_session.state}
              </span>
              <span className="text-[#444]">MD:</span>
              <span style={{ color: lpStatus.md_session.state === 'LOGGED_ON' ? '#4ecdc4' : '#e0a020' }}>
                {lpStatus.md_session.state}
              </span>
            </div>
          )}

          {/* ── LP Selector ──────────────────────────────────────────────────── */}
          <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#555] w-5 flex-shrink-0">LP</span>
              <select
                value={domLpId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDomLpId(id);
                  if (!closeRow) {
                    setDomSymbol(''); setLiveBook(null);
                    setBookStatus('—'); subscribedRef.current = '';
                  }
                }}
                disabled={!!closeRow}
                className={clsx(
                  'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4] min-w-0',
                  closeRow && 'opacity-60 cursor-not-allowed'
                )}
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

          {/* ── Symbol Selector ──────────────────────────────────────────────── */}
          <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#555] w-5 flex-shrink-0">SYM</span>
              <button
                onClick={() => { if (domLpId && !closeRow) setShowPicker((v) => !v); }}
                disabled={!domLpId || instrLoading || !!closeRow}
                className={clsx(
                  'flex-1 flex items-center justify-between bg-[#2a2a2c] border rounded px-2 py-1 text-xs transition-colors min-w-0',
                  domSymbol ? 'text-white border-[#4ecdc4]' : 'text-[#666] border-[#555]',
                  (!domLpId || instrLoading || !!closeRow) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="font-mono font-semibold truncate">
                  {domSymbol || (instrLoading ? 'Loading…' : domLpId ? 'Select symbol…' : '—')}
                </span>
                {!closeRow && <span className="text-[#444] ml-1 flex-shrink-0">{showPicker ? '▲' : '▼'}</span>}
              </button>
              {closeRow && (
                <button onClick={exitCloseMode}
                  className="flex-shrink-0 text-[10px] text-[#666] hover:text-white px-1.5 py-1 border border-[#555] hover:border-[#888] rounded transition-colors"
                  title="Exit close mode">
                  ✕
                </button>
              )}
            </div>

            {showPicker && !closeRow && (
              <div className="mt-1.5">
                <input
                  type="text" autoFocus
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Search symbol or description…"
                  className="w-full bg-[#1a1a1c] border border-[#4ecdc4] rounded px-2 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none mb-1"
                />
                <div className="border border-[#444] rounded overflow-y-auto" style={{ maxHeight: '160px', backgroundColor: '#1a1a1c' }}>
                  {filteredInstruments.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#444]">No symbols found</div>
                  ) : filteredInstruments.map((ins) => (
                    <button
                      key={ins.symbol}
                      onClick={() => {
                        setDomSymbol(ins.symbol); setShowPicker(false);
                        setSymbolSearch(''); setDomQtyLots('');
                        setLimitPrice(''); setStopLoss(''); setTakeProfit('');
                        subscribedRef.current = '';
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

          {/* ── Best Bid / Ask bar ────────────────────────────────────────────── */}
          <div className="px-3 py-1.5 border-b border-[#555] flex-shrink-0">
            {liveBook && liveBook.best_bid != null ? (
              <div className="grid grid-cols-3 text-[10px]">
                <div>
                  <div className="text-[#555] mb-0.5">Best Bid</div>
                  <div className="font-mono font-bold" style={{ color: '#4ecdc4' }}>{liveBook.best_bid.toFixed(instrDecimals)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[#555] mb-0.5">Spread</div>
                  <div className="font-mono text-white">{liveBook.spread != null ? liveBook.spread.toFixed(instrDecimals) : '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[#555] mb-0.5">Best Ask</div>
                  <div className="font-mono font-bold" style={{ color: '#e0a020' }}>{liveBook.best_ask?.toFixed(instrDecimals) ?? '—'}</div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#444] text-center py-0.5">
                {!domLpId
                  ? 'Select LP above'
                  : !domSymbol
                  ? 'Select symbol above'
                  : bookStatus === 'SUBSCRIBING'
                  ? 'Subscribing…'
                  : bookStatus === 'EMPTY'
                  ? 'Subscribed — awaiting snapshot'
                  : bookStatus === 'DISCONNECTED'
                  ? 'Session disconnected'
                  : 'Awaiting market data'}
              </div>
            )}
          </div>

          {/* ── Order Book Levels ─────────────────────────────────────────────── */}
          <div className="px-2 py-1 border-b border-[#555] flex-shrink-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#444]">
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
                    const b = liveBook.bids[i], a = liveBook.asks[i];
                    return (
                      <tr key={i}>
                        <td className="text-right py-0.5 pr-1.5 relative">
                          {b && <div className="absolute right-0 top-0 bottom-0 opacity-20 rounded-l" style={{ width: `${(b.size / maxSz) * 100}%`, backgroundColor: '#4ecdc4' }} />}
                          <span className="relative font-mono text-[11px]" style={{ color: b ? '#4ecdc4' : '#2a2a2a' }}>{b ? fmtBookSize(b.size) : '—'}</span>
                        </td>
                        <td className="text-center py-0.5">
                          <span className="font-mono text-[11px] font-medium" style={{ color: b ? '#4ecdc4' : '#2a2a2a' }}>{b ? b.price.toFixed(instrDecimals) : '—'}</span>
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
                })() : [0,1,2,3,4].map((i) => (
                  <tr key={i}>
                    {['right','center','center','left'].map((align, j) => (
                      <td key={j} className={`text-${align} py-0.5 font-mono text-[11px] text-[#2a2a2a] ${j === 0 ? 'pr-1.5' : j === 3 ? 'pl-1.5' : ''}`}>—</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Order Entry ───────────────────────────────────────────────────── */}
          <div className="px-3 pt-2 pb-2 border-b border-[#444] flex-shrink-0" style={{ backgroundColor: '#1a1a1c' }}>

            {/* Close mode banner */}
            {closeRow && (
              <div className="mb-2 px-2 py-1.5 rounded text-[10px]"
                style={{ backgroundColor: '#231a38', border: '1px solid #a78bfa33', color: '#a78bfa' }}>
                Closing <span className="font-mono text-white">{closeRow.symbol}</span>
                {' '}(pos <span className="font-mono">{closeRow.positionId.slice(-10)}</span>)
                {closeRow.side !== 'FLAT' && <span className="ml-1 text-[#888]">· was {closeRow.side}</span>}
              </div>
            )}

            {/* Order Type + TIF (new orders only) */}
            {!closeRow && (
              <div className="flex gap-2 mb-2">
                <select
                  value={domOrderType}
                  onChange={(e) => { setDomOrderType(e.target.value); setLimitPrice(''); }}
                  disabled={!isConnected || submitting}
                  className={clsx(
                    'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]',
                    (!isConnected || submitting) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {effectiveCaps.order_types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={domTif}
                  onChange={(e) => setDomTif(e.target.value)}
                  disabled={!isConnected || submitting}
                  className={clsx(
                    'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]',
                    (!isConnected || submitting) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {effectiveCaps.time_in_force.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {/* Limit / Stop price */}
            {!closeRow && (domOrderType === 'LIMIT' || domOrderType === 'STOP') && (
              <div className="mb-2">
                <input type="text" value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  disabled={!isConnected || submitting}
                  placeholder={`${domOrderType === 'LIMIT' ? 'Limit' : 'Stop'} price`}
                  className="w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#a78bfa] placeholder-[#444]"
                />
              </div>
            )}

            {/* Quantity */}
            <div className="mb-2">
              <div className="flex items-center gap-1 mb-0.5">
                <input type="text" value={domQtyLots}
                  onChange={(e) => setDomQtyLots(e.target.value.replace(/[^0-9.]/g, ''))}
                  disabled={!isConnected && !closeRow}
                  placeholder="Quantity (lots)"
                  className={clsx(
                    'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4] placeholder-[#444]',
                    closeRow && 'border-[#a78bfa44]',
                    (!isConnected && !closeRow) && 'opacity-40'
                  )}
                />
                {isConnected && (
                  <div className="flex flex-col gap-px">
                    {([0.1, 0.5, 1] as const).map((s) => (
                      <button key={s}
                        onClick={() => setDomQtyLots((v) => (Math.max(0, parseFloat(v || '0') + s)).toFixed(s < 1 ? 1 : 0))}
                        disabled={submitting}
                        className="px-1 py-px text-[9px] text-[#555] hover:text-white bg-[#2a2a2c] border border-[#444] rounded hover:border-[#666] transition-colors"
                      >+{s}</button>
                    ))}
                  </div>
                )}
              </div>
              {domQtyLots && activeInstrument && (
                <div className="text-[10px] text-[#444]">
                  {(parseFloat(domQtyLots) * activeInstrument.min_trade_vol).toLocaleString()} units
                </div>
              )}
            </div>

            {/* SL / TP */}
            {!closeRow && slTpSupported && (
              <div className="flex gap-2 mb-2">
                <input type="text" value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value.replace(/[^0-9.]/g, ''))}
                  disabled={!isConnected || submitting} placeholder="Stop Loss"
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#ff6b6b] placeholder-[#444]"
                />
                <input type="text" value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value.replace(/[^0-9.]/g, ''))}
                  disabled={!isConnected || submitting} placeholder="Take Profit"
                  className="flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4] placeholder-[#444]"
                />
              </div>
            )}

            {/* Buy / Sell */}
            <div className="flex gap-2">
              <button onClick={() => placeOrder('BUY')} disabled={!canBuy}
                className={clsx(
                  'flex-1 py-2.5 rounded text-xs font-bold transition-colors',
                  canBuy ? 'bg-[#4ecdc4] hover:bg-[#3dbdb5] text-black' : 'bg-[#1a3535] text-[#2a6060] cursor-not-allowed'
                )}>
                {submitting ? '…' : closeRow ? '← BUY (close)' : 'BUY'}
              </button>
              <button onClick={() => placeOrder('SELL')} disabled={!canSell}
                className={clsx(
                  'flex-1 py-2.5 rounded text-xs font-bold transition-colors',
                  canSell ? 'bg-[#e0a020] hover:bg-[#c89018] text-black' : 'bg-[#352510] text-[#604020] cursor-not-allowed'
                )}>
                {submitting ? '…' : closeRow ? 'SELL (close) →' : 'SELL'}
              </button>
            </div>
          </div>

          {/* ── Execution Log ─────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ backgroundColor: '#161618' }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#222] sticky top-0" style={{ backgroundColor: '#161618' }}>
              <span className="text-[10px] text-[#444] uppercase tracking-wider">Order Execution</span>
              {execLog.length > 0 && (
                <button onClick={() => setExecLog([])} className="text-[10px] text-[#333] hover:text-[#777] transition-colors">clear</button>
              )}
            </div>

            {execLog.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[#333]">
                {!domLpId ? 'Select an LP to begin' : !domSymbol ? 'Select a symbol' : 'No orders this session'}
              </div>
            ) : execLog.map((e, idx) => (
              <div key={`${e.clord_id}-${idx}`} className="px-3 py-2 border-b border-[#1e1e1e]">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-bold" style={{ color: e.side === 'BUY' ? '#4ecdc4' : '#e0a020' }}>{e.side}</span>
                    <span className="font-mono text-white">{e.symbol}</span>
                    <span className="text-[#666]">{(e.qty / (activeInstrument?.min_trade_vol ?? 100000)).toFixed(2)}L</span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold"
                    style={{ color: e.status === 'SENT' ? '#4ecdc4' : '#ff6b6b' }}>
                    {e.status}
                  </span>
                </div>
                {e.status === 'SENT' && (
                  <div className="text-[10px] text-[#555] font-mono mb-0.5">
                    FIX: <span className="text-[#777]">{e.clord_id}</span>
                  </div>
                )}
                {e.rejectReason && (
                  <div className="text-[10px] text-[#ff6b6b] mb-0.5">{e.rejectReason}</div>
                )}
                <div className="text-[10px] text-[#383838]">
                  {new Date(e.ts).toLocaleTimeString()} · {e.lpId} · {e.orderType}/{e.tif}
                </div>
              </div>
            ))}
          </div>

        </div>
        {/* ── End DOM Panel ──────────────────────────────────────────────────── */}

      </div>
    </div>
  );
}

export default CBookPage;