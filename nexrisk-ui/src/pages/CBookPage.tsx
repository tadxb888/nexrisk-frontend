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
  CellValueChangedEvent,
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
  stop_loss?: number;
  take_profit?: number;
  unrealized_pnl?: number;
  current_price?: number;
}

// Brief Section 7.4: ACCOUNT_STATUS fires every ~2 s from TE
// Only tags confirmed sent by TE sandbox UAA (verified 2026-03-13):
//   20115 = ProjectedBalance  → balance
//   20080 = UsedMargin        → margin_used
//   7027  = AvailableMargin   → margin_available
// Tags NOT sent by sandbox: 7010, 20111, 20127, 7032 (equity/unrealised/realised absent)
interface AccountStatus {
  balance: number;          // tag 20115 ProjectedBalance
  margin_used: number;      // tag 20080 UsedMargin
  margin_available: number; // tag 7027  AvailableMargin
  currency: string;
}

interface DailyStats {
  trade_date:      string;
  realized_pnl:    number;
  commission:      number;
  swap_long:       number | null;   // always null for TE (no per-leg split available)
  swap_short:      number | null;   // always null for TE
  swap_net:        number;
  position_count:  number;
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
// Stable reference passed to AG Grid rowData — never changes so AG Grid never reconciles.
// All grid data changes go through applyTransaction only.
const GRID_STABLE_EMPTY: CBookOrder[] = [];

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
export type CBookOrderType = 'Terminal' | 'DOM Trader';
export type CBookSide = 'BUY' | 'SELL';

export interface CBookOrder {
  id: string;
  date: string;
  time: string;
  dealerId: string;
  symbol: string;
  positionId: string;
  side: CBookSide | 'FLAT';
  volume: number;       // lots — used for P/L calc, close logic; do not display
  rawQty: number;       // lots — used for close pre-fill
  displayQty: number;   // units as typed by user — display only
  lpName: string;
  lpAccount: string;
  fillPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number | null;
  currentPrice: number | null;
  type: CBookOrderType;
  comments: string;
  instrumentGroup: string;  // 'FX' | 'Metals' | etc — for vol display
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

interface FIXMessage {
  seq_num: number;
  direction: 'sent' | 'received';
  msg_type: string;
  msg_type_name: string;
  timestamp: string;
  raw: string;
}

interface FIXMessage {
  seq_num: number;
  direction: 'sent' | 'received';
  msg_type: string;
  msg_type_name: string;
  timestamp: string;
  raw: string;
}

const TYPE_COLORS: Record<CBookOrderType, string> = {
  Terminal:     '#a78bfa',
  'DOM Trader': '#4ecdc4',
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

const fmtTimeUTC = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}.${String(d.getUTCMilliseconds()).padStart(3,'0')}`;
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

/**
 * buildBookFromMaps — render BookData from accumulated local bid/ask price→size maps.
 * Called after every mutation so the DOM always reflects the full accumulated depth.
 */
function buildBookFromMaps(
  symbol: string,
  bidsMap: Map<number, number>,
  asksMap: Map<number, number>,
): BookData | null {
  const bids: BookLevel[] = [...bidsMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => b.price - a.price)   // highest bid first
    .slice(0, DOM_DEPTH);
  const asks: BookLevel[] = [...asksMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => a.price - b.price)   // lowest ask first
    .slice(0, DOM_DEPTH);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  if (bestBid == null || bestAsk == null) return null;
  const spread = +(bestAsk - bestBid).toFixed(5);
  return { symbol, best_bid: bestBid, best_ask: bestAsk, spread, bids, asks, last_update_ts: Date.now() };
}

/**
 * primeBookFromRest — seed local maps from REST GET /md/book response (full depth).
 * TE adapter sends bids[]/asks[] swapped; detect and correct before seeding.
 */
function primeBookFromRest(
  data: any,
  bidsMap: Map<number, number>,
  asksMap: Map<number, number>,
): void {
  if (!data) return;
  let rawBids: any[] = data.bids || [];
  let rawAsks: any[] = data.asks || [];
  const refBid: number | null = data.best_bid ?? null;
  const refAsk: number | null = data.best_ask ?? null;
  if (refBid != null && refAsk != null && refBid > refAsk) {
    [rawBids, rawAsks] = [rawAsks, rawBids];
  }
  bidsMap.clear();
  asksMap.clear();
  for (const b of rawBids) if (b.price && b.size) bidsMap.set(Number(b.price), Number(b.size));
  for (const a of rawAsks) if (a.price && a.size) asksMap.set(Number(a.price), Number(a.size));
}

/**
 * applyBookMessage — apply a WS market data message to local book maps.
 *
 * MARKET_DATA_SNAPSHOT  → full replacement via primeBookFromRest
 * MARKET_DATA_INCREMENTAL:
 *   Format A: entries[] (standard spec) → NEW/CHANGE sets, DELETE removes
 *   Format B: bids[]/asks[] (TE adapter normalised) → merge top-of-book changes,
 *             preserving other depth levels already in the maps
 *
 * Returns true if maps were mutated (caller should re-render).
 */
function applyBookMessage(
  data: any,
  type: string,
  bidsMap: Map<number, number>,
  asksMap: Map<number, number>,
): boolean {
  if (!data) return false;
  const isSnapshot    = type === 'MARKET_DATA_SNAPSHOT' || type === 'MD_SNAPSHOT';
  const isIncremental = type === 'MARKET_DATA_INCREMENTAL' || type === 'MD_INCREMENTAL';
  if (!isSnapshot && !isIncremental) return false;

  if (isSnapshot) {
    primeBookFromRest(data, bidsMap, asksMap);
    return bidsMap.size > 0 || asksMap.size > 0;
  }

  // Incremental: Format A — entries[]
  if (Array.isArray(data.entries) && data.entries.length > 0) {
    for (const e of data.entries) {
      const map = (e.entry_type === 'BID') ? bidsMap : asksMap;
      if (e.action === 'DELETE' || e.size === 0) {
        map.delete(Number(e.price));
      } else {
        map.set(Number(e.price), Number(e.size));
      }
    }
    return true;
  }

  // Incremental: Format B — bids[]/asks[] (TE normalised, contains changed levels)
  let rawBids: any[] = data.bids || [];
  let rawAsks: any[] = data.asks || [];
  const refBid: number | null = data.best_bid ?? null;
  const refAsk: number | null = data.best_ask ?? null;
  if (refBid != null && refAsk != null && refBid > refAsk) {
    [rawBids, rawAsks] = [rawAsks, rawBids];
  }
  bidsMap.clear();
  asksMap.clear();
  let mutated = false;
  for (const b of rawBids) {
    if (b.price != null && b.size != null) {
      bidsMap.set(Number(b.price), Number(b.size));
      mutated = true;
    }
  }
  for (const a of rawAsks) {
    if (a.price != null && a.size != null) {
      asksMap.set(Number(a.price), Number(a.size));
      mutated = true;
    }
  }
  return mutated;
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
    // TE always sends side='FLAT' — derive direction from quantities.
    side: (() => {
      if (pos.side === 'LONG'  || pos.side === 'BUY')  return 'BUY';
      if (pos.side === 'SHORT' || pos.side === 'SELL') return 'SELL';
      if (pos.long_qty  > 0 && pos.short_qty === 0)   return 'BUY';
      if (pos.short_qty > 0 && pos.long_qty  === 0)   return 'SELL';
      return 'FLAT';
    })(),
    volume:     Math.abs(pos.net_qty),
    rawQty:     Math.abs(pos.net_qty),
    displayQty: Math.abs(pos.net_qty) * minVol,
    lpName:     lpId,
    lpAccount:  pos.account,
    fillPrice:  pos.open_price,
    stopLoss:   pos.stop_loss   ?? null,
    takeProfit: pos.take_profit ?? null,
    unrealizedPnl: pos.unrealized_pnl ?? null,
    currentPrice:  pos.current_price  ?? null,
    type:       'Terminal',
    comments:        `swap:${(pos.swap ?? 0).toFixed(2)}  comm:${(pos.commission ?? 0).toFixed(2)}`,
    instrumentGroup: ins?.instrument_group ?? 'FX',
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
  const currentPricesRef = useRef<Map<string, number>>(new Map()); // symbol → mid price
  // Symbols that have open positions — used to subscribe MD for P&L ticks on all positions,
  // not just the DOM symbol. Updated whenever livePositions changes.
  const positionSymbolsRef    = useRef<Set<string>>(new Set());
  // Symbols already subscribed for position P&L price feed (avoid duplicate subscribes)
  const posSubscribedRef      = useRef<Set<string>>(new Set());
  const [useLocalTime, setUseLocalTime] = useState<boolean>(true);
  const [execPanelOpen, setExecPanelOpen] = useState<boolean>(false);
  const [selectedExec, setSelectedExec]   = useState<ExecEntry | null>(null);
  const [fixMessages, setFixMessages]     = useState<FIXMessage[]>([]);
  const [fixMessagesLoading, setFixMessagesLoading] = useState(false);
  const [sessionOrders, setSessionOrders] = useState<CBookOrder[]>([]);
  const [posLoading, setPosLoading]       = useState(false);

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
  const [dailyStats, setDailyStats]       = useState<DailyStats | null>(null);
  const statsRefreshTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref that always points to the latest fetchDailyStats — prevents stale closure
  // inside the WS onmessage handler (whose useEffect deps are [domLpId, domSymbol]).
  const fetchDailyStatsRef = useRef<() => void>(() => {});

  const effectiveCaps = capabilities ?? {
    lp_id: domLpId, order_types: ['MARKET', 'LIMIT'], time_in_force: ['GTC', 'IOC', 'DAY'],
    max_order_qty: 10000000, min_order_qty: 1000, custom_fields: { sl_tp: false },
  };

  // liveBook stored in a ref — avoids React re-render (and gridRows recompute) on every MD tick.
  // A throttled state counter drives DOM panel re-renders at max 100ms intervals.
  const liveBookRef               = useRef<BookData | null>(null);
  const [liveBook, setLiveBook]   = useState<BookData | null>(null);
  const bookRenderTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBookRef            = useRef<BookData | null>(null);
  const [bookStatus, setBookStatus] = useState<string>('—');
  const [priceTickCounter, setPriceTickCounter] = useState(0);

  // Refs for WS handler closures
  const subscribedRef = useRef<string>('');
  const wsRef         = useRef<WebSocket | null>(null);
  const wsSymbolRef   = useRef<string>('');
  const wsLpIdRef     = useRef<string>('');
  // Always mirrors gridLpId so WS handlers work even when wsLpIdRef is '' (no DOM symbol).
  const gridLpIdRef   = useRef<string>('');
  // True only when the selected LP exists and is CONNECTED
  const gridLpConnected = useMemo(() => {
    if (!gridLpId) return true; // "All LPs" — show everything
    const lp = allLps.find((l) => l.lp_id === gridLpId);
    return lp?.state === 'CONNECTED';
  }, [gridLpId, allLps]);
  const bookSeededRef = useRef<boolean>(false);
  // Track optimistically-closed position IDs so poll results don't ghost them back.
  // Persisted to localStorage so page refresh doesn't resurface positions closed this session.
  const closedPositionIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('nexrisk_closed_positions');
        if (raw) return new Set<string>(JSON.parse(raw) as string[]);
      } catch {}
      return new Set<string>();
    })()
  );
  // Local accumulated book state — updated by applyBookMessage, rendered via setLiveBook
  const localBidsRef  = useRef<Map<number, number>>(new Map());
  const localAsksRef  = useRef<Map<number, number>>(new Map());

  const [domOrderType, setDomOrderType] = useState<string>('MARKET');
  const [domTif, setDomTif]             = useState<string>('GTC');
  const [domQtyLots, setDomQtyLots]     = useState<string>('');
  const [domComment, setDomComment]     = useState<string>('');
  // Set when DOM order is placed. Picked up by the next REST poll that finds a new position_id.
  const pendingDomRef   = useRef<{ comment: string; preIds: Set<string> } | null>(null);
  // position_id → {type, comments} — survives REST polls, WS updates, and page refresh
  const posOverrideRef = useRef<Map<string, { type: CBookOrderType; comments: string }>>(
    (() => {
      try {
        const raw = localStorage.getItem('nexrisk_pos_overrides');
        if (raw) return new Map(JSON.parse(raw) as [string, { type: CBookOrderType; comments: string }][]);
      } catch {}
      return new Map();
    })()
  );

  const saveOverrides = () => {
    try {
      localStorage.setItem('nexrisk_pos_overrides', JSON.stringify([...posOverrideRef.current.entries()]));
    } catch {}
  };
  const saveClosedIds = () => {
    try {
      localStorage.setItem('nexrisk_closed_positions', JSON.stringify([...closedPositionIdsRef.current]));
    } catch {}
  };
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
  // Initial load goes through React state (shows loading indicator).
  // Subsequent 15-second polls bypass React state entirely — they call
  // gridApi.applyTransaction() directly so no React re-render occurs and
  // the grid never scrolls or jumps.
  useEffect(() => {
    gridLpIdRef.current = gridLpId;
    if (!gridLpId) { setLivePositions([]); return; }
    let cancelled = false;
    let firstLoad = true;

    const fetchPositions = async () => {
      if (firstLoad) setPosLoading(true);
      try {
        if (!instrCacheRef.current[gridLpId]) {
          const ir = await bff<{ success: boolean; data: { instruments: FIXInstrument[] } }>(`/api/v1/fix/lp/${gridLpId}/instruments`);
          if (!cancelled && ir.success) {
            const map: Record<string, FIXInstrument> = {};
            for (const ins of ir.data.instruments) map[ins.symbol] = ins;
            instrCacheRef.current[gridLpId] = map;
          }
        }
        const r = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${gridLpId}`);
        if (cancelled || !r.success) return;
        const instrMap = instrCacheRef.current[gridLpId] ?? {};
        // Prune closed-ID tombstones for positions the backend no longer returns at all
        // (they've been fully removed server-side). Keep tombstones that the backend still
        // echoes — they guard against the cache echo re-adding a freshly closed position.
        const backendPosIds = new Set(r.data.positions.map((p) => p.position_id));
        let closedPruned = false;
        for (const id of closedPositionIdsRef.current) {
          if (!backendPosIds.has(id)) { closedPositionIdsRef.current.delete(id); closedPruned = true; }
        }
        if (closedPruned) saveClosedIds();
        const incoming = r.data.positions
          .filter((p) => p.position_id !== '' && p.open_price > 0)
          .filter((p) => !closedPositionIdsRef.current.has(p.position_id))
          .map((p) => {
            const row = positionToCBook(p, gridLpId, instrMap);
            const ov = posOverrideRef.current.get(p.position_id);
            if (ov) { row.type = ov.type; row.comments = ov.comments; }
            return row;
          });

        if (firstLoad) {
          // Seed grid via applyTransaction — never via rowData prop (causes row reordering).
          // setLivePositions kept for stats panel only.
          setLivePositions(incoming);
          const api = gridRef.current?.api;
          if (api) api.applyTransaction({ add: incoming });
          // Subscribe MD for every open position symbol so currentPrice updates
          // even when the DOM panel is showing a different symbol.
          const syms = [...new Set(incoming.map((p) => p.symbol))];
          for (const sym of syms) {
            if (!posSubscribedRef.current.has(sym)) {
              posSubscribedRef.current.add(sym);
              bff('/api/v1/fix/md/subscribe', {
                method: 'POST', body: JSON.stringify({ lp_id: gridLpId, symbol: sym, depth: 1 }),
              }).catch(() => {});
            }
          }
        } else {
          // Subsequent polls: update the grid directly without touching React state
          const api = gridRef.current?.api;
          if (!api) { setLivePositions(incoming); return; }
          const existingIds = new Set<string>();
          api.forEachNode((node) => { if (node.data) existingIds.add(node.data.id); });
          const incomingIds = new Set(incoming.map((r) => r.id));
          const toAdd    = incoming.filter((r) => !existingIds.has(r.id));
          const toUpdate = incoming.filter((r) =>  existingIds.has(r.id));
          const toRemove = [...existingIds].filter((id) => !incomingIds.has(id))
            .map((id) => ({ id } as CBookOrder));
          // add/remove via applyTransaction; updates via node.setData() which
          // does NOT trigger sort re-evaluation so rows never swap position.
          if (toAdd.length)    api.applyTransaction({ add: toAdd });
          if (toRemove.length) api.applyTransaction({ remove: toRemove });
          for (const row of toUpdate) {
            api.getRowNode(row.id)?.setData(row);
          }
        }
      } catch {
        if (cancelled) return;
        if (firstLoad) setLivePositions([]);
      } finally {
        if (!cancelled) {
          if (firstLoad) setPosLoading(false);
          firstLoad = false;
        }
      }
    };
    fetchPositions();
    // No poll timer — positions kept live via POSITION_REPORT WebSocket events.
    return () => { cancelled = true; };
  }, [gridLpId]);

  // ── Market data startup — Section 8 of brief, implemented exactly ───────────
  // 1. GET  /status/{lp_id}         — verify sessions logged on
  // 2. POST /md/subscribe            — tell backend to start publishing symbol
  // 3. Wait 400ms                    — first MD snapshot arrives within this window (TE)
  // 4. GET  /positions/{lp_id}       — load positions panel
  // 5. GET  /orders/{lp_id}/active   — load active orders
  // 6. Connect WebSocket             — receive EXECUTION_REPORT, MARKET_DATA_SNAPSHOT,
  //                                    POSITION_REPORT, ACCOUNT_STATUS
  // Book updates are 100% WebSocket-driven. No REST poll.
  useEffect(() => {
    if (!domLpId || !domSymbol) {
      setLiveBook(null); liveBookRef.current = null; pendingBookRef.current = null;
      setBookStatus('—');
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      wsSymbolRef.current = '';
      wsLpIdRef.current = '';
      localBidsRef.current.clear();
      localAsksRef.current.clear();
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
    localBidsRef.current.clear();
    localAsksRef.current.clear();
    setLiveBook(null); liveBookRef.current = null; pendingBookRef.current = null;
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
          method: 'POST', body: JSON.stringify({ lp_id: domLpId, symbol: domSymbol, depth: 10 }),
        });
      } catch { /* non-fatal */ }
      if (cancelled) return;

      // Step 3: wait 400ms — first MD snapshot arrives within this window from TE
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;

      // Step 5: GET /positions/{lp_id}
      try {
        const instrMap = instrCacheRef.current[domLpId] ?? {};
        const posR = await bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${domLpId}`);
        if (!cancelled && posR.success) {
          setLivePositions(
            posR.data.positions
              .filter((p) => p.position_id !== '' && p.open_price > 0)
          .filter((p) => !closedPositionIdsRef.current.has(p.position_id))
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
          if (msg.type === 'MARKET_DATA_INCREMENTAL' || msg.type === 'MARKET_DATA_SNAPSHOT') {
            console.log('[MD]', msg.data?.symbol, 'bid:', msg.data?.best_bid, 'ask:', msg.data?.best_ask);
          } else {
            // Log all non-MD WS events so external closes are visible in devtools
            console.log('[CBook WS] event:', msg.type, msg.lp_id ?? '', msg.data ?? '');
          }

          // ── Shared helper: fetch positions and reconcile grid ─────────────────
          // Called after EXECUTION_REPORT — once at 600ms (C++ cache window) and
          // again at 2500ms (TE sandbox external close may take 1-2s to clear).
          const syncPositionsAfterFill = (lpSnap: string, delayMs: number) => {
            setTimeout(() => {
              if (cancelled) return;
              const instrMap = instrCacheRef.current[lpSnap] ?? {};
              bff<{ success: boolean; data: { positions: FIXPosition[] } }>(`/api/v1/fix/positions/${lpSnap}`)
                .then((r) => {
                  if (!r.success || cancelled) return;
                  // Stamp DOM type/comments on any new position found by pending DOM order
                  const pending = pendingDomRef.current;
                  // If REST returns a position with qty>0 that we blacklisted (e.g. DOM
                  // partial close: POSITION_CLOSED fires before PositionReport), unblacklist it.
                  // Track unblacklisted IDs to protect them from toRemove diff logic.
                  const recentlyUnblacklisted = new Set<string>();
                  r.data.positions.forEach((p) => {
                    if (p.position_id && p.open_price > 0 && (p.long_qty + p.short_qty) > 0
                        && closedPositionIdsRef.current.has(p.position_id)) {
                      closedPositionIdsRef.current.delete(p.position_id);
                      saveClosedIds();
                      recentlyUnblacklisted.add(`pos-${lpSnap}-${p.position_id}`);
                    }
                  });
                  const rows = r.data.positions
                    .filter((p) => p.position_id !== '' && p.open_price > 0)
                    .filter((p) => !closedPositionIdsRef.current.has(p.position_id))
                    .map((p) => {
                      const row = positionToCBook(p, lpSnap, instrMap);
                      // If a DOM order is pending and this is a new position_id → stamp it
                      if (pending && !pending.preIds.has(p.position_id)) {
                        posOverrideRef.current.set(p.position_id, {
                          type:     'DOM Trader',
                          comments: pending.comment,
                        });
                        saveOverrides();
                        pendingDomRef.current = null;
                      }
                      const ov = posOverrideRef.current.get(p.position_id);
                      if (ov) { row.type = ov.type; row.comments = ov.comments; }
                      return row;
                    });
                  setLivePositions(rows);
                  const api = gridRef.current?.api;
                  if (api) {
                    // Diff: remove pos- rows absent from fresh fetch (externally closed),
                    // update/add rows that are present.
                    const existingPosIds = new Set<string>();
                    api.forEachNode((node) => { if (node.data?.id?.startsWith('pos-')) existingPosIds.add(node.data.id); });
                    const incomingIds = new Set(rows.map((r) => r.id));
                    const toRemove = [...existingPosIds]
                      .filter((id) => !incomingIds.has(id) && !recentlyUnblacklisted.has(id))
                      .map((id) => ({ id } as CBookOrder));
                    if (toRemove.length) {
                      console.log('[CBook] syncPositions removing', toRemove.length, 'closed pos rows at', delayMs, 'ms');
                      api.applyTransaction({ remove: toRemove });
                    }
                    rows.forEach((row) => {
                      const node = api.getRowNode(row.id);
                      if (node) node.setData(row);
                      else api.applyTransaction({ add: [row] });
                    });
                  }
                }).catch(() => {});
            }, delayMs);
          };

          // ── FILLS — Brief Section 7.1 / 3.1
          // EXECUTION_REPORT is the fill type for ALL LPs incl TE.
          // nexrisk_service normalises TE's 35=AE TradeCaptureReport → EXECUTION_REPORT.
          // Do NOT add TRADE_CAPTURE_REPORT case — will never arrive.
          if (msg.type === 'EXECUTION_REPORT') {
            // Brief Section 9.5: fields may be at event.data.* or event.* level
            const fill = msg.data ?? msg;
            const clordId = fill.cl_ord_id ?? fill.clord_id ?? `ws-${Date.now()}`;
            const entry: ExecEntry = {
              clord_id:  clordId,
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
            // Two-pass sync:
            // Pass 1 @ 600ms  — C++ position refresh timer (500ms) should have fired.
            // Pass 2 @ 2500ms — TE sandbox external close can take 1-2s to clear the
            //                   position from TE's own cache, so pass 1 may still see it.
            if (wsLpIdRef.current) {
              syncPositionsAfterFill(wsLpIdRef.current, 600);
              syncPositionsAfterFill(wsLpIdRef.current, 2500);
            }
          }

          // ── MARKET DATA — Brief Section 7.2
          if (
            msg.type === 'MARKET_DATA_SNAPSHOT' ||
            msg.type === 'MD_SNAPSHOT'           ||
            msg.type === 'MARKET_DATA_INCREMENTAL' ||
            msg.type === 'MD_INCREMENTAL'
          ) {
            const bookRaw = msg.data ?? msg;
            const sym = bookRaw.symbol ?? msg.symbol;
            if (!sym) return;
            if (msg.lp_id && msg.lp_id !== wsLpIdRef.current && msg.lp_id !== gridLpIdRef.current) return;

            const refBid: number | null = bookRaw.best_bid ?? null;
            const refAsk: number | null = bookRaw.best_ask ?? null;

            // ── DOM panel book (DOM symbol only) ─────────────────────────────
            if (sym === wsSymbolRef.current) {
              let rawBids: any[] = bookRaw.bids || [];
              let rawAsks: any[] = bookRaw.asks || [];
              if (refBid != null && refAsk != null && refBid > refAsk) {
                [rawBids, rawAsks] = [rawAsks, rawBids];
              }
              localBidsRef.current.clear();
              localAsksRef.current.clear();
              for (const b of rawBids) if (b.price != null) localBidsRef.current.set(Number(b.price), Number(b.size));
              for (const a of rawAsks) if (a.price != null) localAsksRef.current.set(Number(a.price), Number(a.size));
              const book = buildBookFromMaps(sym, localBidsRef.current, localAsksRef.current);
              console.log('[BOOK BUILD]', sym, book, 'maps:', localBidsRef.current.size, localAsksRef.current.size);
              if (book) {
                liveBookRef.current    = book;
                pendingBookRef.current = book;
                setBookStatus('HEALTHY');
              }
            }

            // ── Grid P&L update (all open positions for this symbol) ─────────
            // Prices written to ref immediately. refreshCells fires on every tick
            // for instant WS-speed P/L updates. suppressFlash=true prevents highlight.
            if (refBid != null && refAsk != null) {
              const prevBid = currentPricesRef.current.get(sym + ':bid');
              const prevAsk = currentPricesRef.current.get(sym + ':ask');
              if (prevBid !== refBid || prevAsk !== refAsk) {
                currentPricesRef.current.set(sym + ':bid', refBid);
                currentPricesRef.current.set(sym + ':ask', refAsk);
                gridRef.current?.api?.refreshCells({
                  columns: ['currentPrice', 'unrealizedPnl'],
                  suppressFlash: true,
                });
                setPriceTickCounter((n) => n + 1);
              }
            }
            // ── DOM book panel (throttled to 100ms — human eye limit) ────────────
            if (sym === wsSymbolRef.current && pendingBookRef.current) {
              if (!bookRenderTimer.current) {
                bookRenderTimer.current = setTimeout(() => {
                  bookRenderTimer.current = null;
                  if (pendingBookRef.current) setLiveBook(pendingBookRef.current);
                }, 100);
              }
            }
          }

          // ── POSITIONS — Brief Section 7.3
          if (msg.type === 'POSITION_REPORT') {
            const evtLp = msg.lp_id;
            if (evtLp && evtLp !== wsLpIdRef.current && evtLp !== gridLpIdRef.current) return;
            const resolvedLp = evtLp ?? wsLpIdRef.current ?? gridLpIdRef.current;
            const instrMap = instrCacheRef.current[resolvedLp] ?? {};
            // NexRiskService routing wraps position fields under msg.data (same as EXECUTION_REPORT).
            const pd = msg.data ?? msg;
            const pos: FIXPosition = {
              position_id: pd.position_id ?? '',
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
              stop_loss:   pd.stop_loss   ?? undefined,
              take_profit: pd.take_profit ?? undefined,
              unrealized_pnl: pd.unrealized_pnl ?? undefined,
              current_price:  pd.current_price  ?? undefined,
            };
            // WS events: guard on position_id only — open_price may be 0 in TE events.
            // (open_price > 0 guard is for REST responses only, not WS.)
            // Special case: if position was blacklisted by POSITION_CLOSED but TE sends
            // a POSITION_REPORT with qty>0 shortly after (DOM partial close), unblacklist
            // and re-add. TCR fires before PositionReport for DOM-initiated closes.
            if (pos.position_id !== ''
                && pos.open_price > 0
                && pos.long_qty + pos.short_qty > 0
                && closedPositionIdsRef.current.has(pos.position_id)) {
              // Re-open: remove from blacklist so the row gets added back
              closedPositionIdsRef.current.delete(pos.position_id);
              saveClosedIds();
            }
            if (pos.position_id !== ''
                && !closedPositionIdsRef.current.has(pos.position_id)) {
              // TE sends a POSITION_REPORT with open_price=0 when a position is closed
              // externally (e.g. from the TE Trading Terminal). Detect and purge from grid.
              if (pos.open_price === 0) {
                const closedId = `pos-${resolvedLp}-${pos.position_id}`;
                closedPositionIdsRef.current.add(pos.position_id);
                saveClosedIds();
                setLivePositions((prev) => prev.filter((p) => p.positionId !== pos.position_id));
                gridRef.current?.api?.applyTransaction({ remove: [{ id: closedId } as CBookOrder] });
              } else {
              const row = positionToCBook(pos, resolvedLp, instrMap);
              // If a DOM order is pending and this position_id is new → stamp it
              const pending = pendingDomRef.current;
              if (pending && !pending.preIds.has(pos.position_id)) {
                posOverrideRef.current.set(pos.position_id, {
                  type:     'DOM Trader',
                  comments: pending.comment,
                });
                saveOverrides();
                pendingDomRef.current = null; // consumed
              }
              // Apply persisted type/comment override (survives all subsequent WS updates)
              const ov = posOverrideRef.current.get(pos.position_id);
              if (ov) { row.type = ov.type; row.comments = ov.comments; }
              setLivePositions((prev) => {
                const idx = prev.findIndex((p) => p.positionId === row.positionId);
                return idx >= 0 ? prev.map((p, i) => i === idx ? row : p) : [row, ...prev];
              });
              const api = gridRef.current?.api;
              if (api) {
                const existingNode = api.getRowNode(row.id);
                if (existingNode) existingNode.setData(row); // setData: no sort re-eval, no row swap
                else              api.applyTransaction({ add: [row] });
              }
              // Subscribe MD for this symbol if not already subscribed (for P&L ticks)
              if (pos.symbol && !posSubscribedRef.current.has(pos.symbol)) {
                posSubscribedRef.current.add(pos.symbol);
                bff('/api/v1/fix/md/subscribe', {
                  method: 'POST', body: JSON.stringify({ lp_id: resolvedLp, symbol: pos.symbol, depth: 1 }),
                }).catch(() => {});
              }
              } // end open_price > 0 branch
            }
          }

          if (msg.type === 'POSITION_CLOSED') {
            const evtLpC = msg.lp_id;
            if (evtLpC && evtLpC !== wsLpIdRef.current && evtLpC !== gridLpIdRef.current) return;
            const resolvedCloseLp = evtLpC ?? wsLpIdRef.current ?? gridLpIdRef.current;
            const pid = msg.position_id ?? msg.data?.position_id;
            if (pid) {
              closedPositionIdsRef.current.add(pid);
              saveClosedIds();
              setLivePositions((prev) => prev.filter((p) => p.positionId !== pid));
              gridRef.current?.api?.applyTransaction({
                remove: [{ id: `pos-${resolvedCloseLp}-${pid}` } as CBookOrder]
              });
            }
            // Update dailyStats directly from the event payload so the top bar
            // reflects the close immediately — no REST round-trip needed.
            // The debounced fetch below keeps the DB-authoritative value in sync.
            const d = msg.data ?? msg;
            const evtPnl   = typeof d.realized_pnl === 'number' ? d.realized_pnl : 0;
            const evtComm  = typeof d.commission   === 'number' ? d.commission   : 0;
            const evtSwap  = typeof d.swap         === 'number' ? d.swap         : 0;
            if (evtPnl !== 0 || evtComm !== 0 || evtSwap !== 0) {
              setDailyStats((prev) => prev
                ? {
                    ...prev,
                    realized_pnl:   prev.realized_pnl   + evtPnl,
                    commission:     prev.commission      + evtComm,
                    swap_net:       prev.swap_net        + evtSwap,
                    position_count: prev.position_count  + 1,
                  }
                : {
                    trade_date:     new Date().toISOString().slice(0, 10),
                    realized_pnl:   evtPnl,
                    commission:     evtComm,
                    swap_long:      null,
                    swap_short:     null,
                    swap_net:       evtSwap,
                    position_count: 1,
                  }
              );
            }
            // Debounced REST fetch keeps the value DB-authoritative (handles
            // commission/swap values that may not be in the WS event).
            if (statsRefreshTimer.current) clearTimeout(statsRefreshTimer.current);
            statsRefreshTimer.current = setTimeout(() => fetchDailyStatsRef.current(), 500);
          }

          // ── POSITION_UPDATED — partial close from TE terminal
          // TE sends PositionReport with reduced qty. Update the grid row in place.
          if (msg.type === 'POSITION_UPDATED') {
            const evtLp = msg.lp_id;
            if (evtLp && evtLp !== wsLpIdRef.current && evtLp !== gridLpIdRef.current) return;
            const resolvedLp = evtLp ?? gridLpIdRef.current;
            // NexRiskService wraps payload under msg.data for position topic events
            const upd = msg.data ?? msg;
            const pid = upd.position_id ?? upd.positionId;
            if (pid && gridRef.current?.api) {
              const rowId = `pos-${resolvedLp}-${pid}`;
              let updatedRow: CBookOrder | null = null;
              const symbol = upd.symbol ?? '';
              const instrMap = instrCacheRef.current[resolvedLp] ?? {};
              const ins = instrMap[symbol];
              const minVol = ins?.min_trade_vol ?? 100000;
              gridRef.current.api.forEachNode((node) => {
                if (node.data?.id === rowId) {
                  const netQty = Math.abs(upd.net_qty ?? upd.long_qty ?? upd.short_qty ?? 0);
                  updatedRow = {
                    ...node.data,
                    volume:     netQty,
                    rawQty:     netQty,
                    displayQty: netQty * minVol,
                  };
                }
              });
              if (updatedRow) {
                gridRef.current.api.applyTransaction({ update: [updatedRow] });
              }
            }
          }

          // ── ACCOUNT — Brief Section 7.4
          // Fires every ~2 s from TE. Drive account panel without REST polling.
          if (msg.type === 'ACCOUNT_STATUS' || msg.type === 'TRADE_CAPTURE_REPORT') {
            const d = msg.data ?? msg;
            setAccount({
              balance:          d.balance          ?? 0,
              margin_used:      d.margin_used      ?? 0,
              margin_available: d.margin_available ?? 0,
              currency:         d.currency         ?? 'USD',
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
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (bookRenderTimer.current) { clearTimeout(bookRenderTimer.current); bookRenderTimer.current = null; }
      wsSymbolRef.current = '';
      // Unsubscribe all position P&L symbols on LP change or unmount
      const lpToUnsub = wsLpIdRef.current;
      for (const sym of posSubscribedRef.current) {
        bff('/api/v1/fix/md/unsubscribe', {
          method: 'POST', body: JSON.stringify({ lp_id: lpToUnsub, symbol: sym }),
        }).catch(() => {});
      }
      posSubscribedRef.current.clear();
      wsLpIdRef.current   = '';
      localBidsRef.current.clear();
      localAsksRef.current.clear();
    };
  }, [domLpId, domSymbol]);

  // ── Close-mode: sync DOM when closeRow changes ────────────────────────────
  useEffect(() => {
    if (!closeRow) return;
    if (closeRow._lpId !== domLpId) setDomLpId(closeRow._lpId);
    setDomSymbol(closeRow.symbol);
    // qty: don't pre-fill 0 for TE sandbox — leave blank so user enters actual size
    if (closeRow.rawQty > 0) {
      const inst = instruments.find(i => i.symbol === closeRow.symbol);
      const minVol = inst?.min_trade_vol ?? 1;
      setDomQtyLots(String(closeRow.rawQty * minVol));
    } else setDomQtyLots('');
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

  const gridRows = useMemo<CBookOrder[]>(() => [...livePositions, ...sessionOrders], [livePositions, sessionOrders]);

  const stats = useMemo(() => {
    const openRows = gridRows.filter((r) => r._isOpen);
    // Split open position volume by instrument group
    const fxUnits  = openRows.filter((r) => r.instrumentGroup === 'FX').reduce((s, r) => s + (r.displayQty ?? 0), 0);
    const cfdUnits = openRows.filter((r) => r.instrumentGroup !== 'FX').reduce((s, r) => s + (r.displayQty ?? 0), 0);
    const fmtFx = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : n.toLocaleString();
    const parts: string[] = [];
    if (fxUnits  > 0) parts.push(`${fmtFx(fxUnits)} FX`);
    if (cfdUnits > 0) parts.push(`${cfdUnits.toLocaleString()} CFDs`);
    const volDisplay = parts.length ? parts.join(' | ') : '—';
    return {
      total:      gridRows.length,
      buys:       openRows.filter((r) => r.side === 'BUY').length,
      sells:      openRows.filter((r) => r.side === 'SELL').length,
      volDisplay,
    };
  }, [gridRows]);

  // Unrealized P/L — summed client-side from all open grid rows using live book prices.
  // LP-agnostic: same formula as the per-row P/L valueGetter in columnDefs.
  const unrealizedPnlTotal = useMemo(() => {
    let total = 0;
    let hasAny = false;
    for (const pos of livePositions) {
      if (!pos._isOpen || !pos.symbol) continue;
      const key = pos.side === 'BUY' ? pos.symbol + ':bid' : pos.symbol + ':ask';
      const closePrice = currentPricesRef.current.get(key) ?? pos.currentPrice ?? null;
      if (closePrice == null) continue;
      const dir = pos.side === 'BUY' ? 1 : pos.side === 'SELL' ? -1 : 0;
      if (dir !== 0) { total += (closePrice - pos.fillPrice) * pos.displayQty * dir; hasAny = true; }
    }
    return hasAny ? total : null;
  }, [livePositions, priceTickCounter]);

  // ── Daily stats fetch helper — called on mount, on LP change, and after a close ─
  const fetchDailyStats = useCallback(() => {
    if (!domLpId) { setDailyStats(null); return; }
    bff<{ success: boolean; data: DailyStats }>(
      `/api/v1/fix/daily-stats?lp_id=${encodeURIComponent(domLpId)}`
    )
      .then((r) => { if (r.success) setDailyStats(r.data); })
      .catch(() => {});
  }, [domLpId]);

  // Keep the ref current so the WS closure (which captures refs, not state/callbacks)
  // always calls the latest version of fetchDailyStats.
  useEffect(() => { fetchDailyStatsRef.current = fetchDailyStats; }, [fetchDailyStats]);

  // Fetch on mount and whenever the DOM LP changes; poll every 30 s as a safety net.
  useEffect(() => {
    if (!domLpId) { setDailyStats(null); return; }
    fetchDailyStats();
    const timer = setInterval(fetchDailyStats, 30_000);
    return () => clearInterval(timer);
  }, [domLpId, fetchDailyStats]);

  const instrDecimals = activeInstrument?.price_precision
    ?? (domSymbol.includes('JPY') ? 3 : domSymbol.includes('XAU') || domSymbol.includes('BTC') ? 2 : 5);

  // ==========================================================================
  // ORDER PLACEMENT — Brief Section 5 / 9.3 / 9.4
  // ==========================================================================
  const placeOrder = useCallback(async (side: 'BUY' | 'SELL') => {
    if (!domLpId || !domSymbol || submitting) return;
    const qty = Math.round(parseFloat(domQtyLots));
    if (!qty || qty <= 0) return;
    const minVol = activeInstrument?.min_trade_vol ?? 1;
    if (qty < minVol) return;

    setSubmitting(true);
    const entry: ExecEntry = {
      clord_id: '—', ts: Date.now(), symbol: domSymbol, side,
      qty: qty, orderType: domOrderType, tif: domTif,
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
          qty:           qty,
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
          // Register as closed so poll results don't ghost it back.
          const closedPosId = closeRow.positionId;
          closedPositionIdsRef.current.add(closedPosId);
          saveClosedIds();
          // Remove from grid and state immediately — don't wait for WS.
          const closedRowId = `pos-${domLpId}-${closedPosId}`;
          gridRef.current?.api?.applyTransaction({ remove: [{ id: closedRowId } as CBookOrder] });
          setLivePositions((prev) => prev.filter((p) => p.positionId !== closedPosId));
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
          qty:           qty,
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
          // Register DOM order so EXECUTION_REPORT can stamp type + comment on the new position
          // Snapshot current position_ids — next REST poll will detect new one
          const preIds = new Set<string>();
          gridRef.current?.api?.forEachNode((n) => { if (n.data?.positionId) preIds.add(n.data.positionId); });
          pendingDomRef.current = { comment: domComment.trim(), preIds };
          setDomComment('');
          // Optimistic session row — grid shows immediately, fill confirmed by WS EXECUTION_REPORT
          const newRow: CBookOrder = {
            id: `sess-${r.clord_id ?? Date.now()}`,
            date: new Date().toISOString(), time: new Date().toISOString(),
            dealerId: domLpId, symbol: domSymbol,
            positionId: r.clord_id ?? '', side,
            volume: qty, rawQty: qty, displayQty: qty,
            lpName: domLpId,
            lpAccount: domLpInfo?.lp_name ?? domLpId,
            fillPrice: liveBookRef.current
              ? (side === 'BUY' ? (liveBookRef.current.best_ask ?? 0) : (liveBookRef.current.best_bid ?? 0))
              : parseFloat(limitPrice) || 0,
            type: 'DOM Trader', comments: domComment.trim() || `FIX:${r.clord_id}`,
            instrumentGroup: activeInstrument?.instrument_group ?? 'FX',
            stopLoss: null, takeProfit: null, unrealizedPnl: null, currentPrice: null,
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
    domLpId, domSymbol, submitting, domQtyLots, domOrderType, domTif, domComment,
    limitPrice, stopLoss, takeProfit, slTpSupported, activeInstrument,
    closeRow, domLpInfo,
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

  const fetchFixMessages = useCallback(async (entry: ExecEntry) => {
    setSelectedExec(entry);
    setFixMessages([]);
    setFixMessagesLoading(true);
    try {
      const res = await bff<{ success: boolean; data: { messages: FIXMessage[] } }>(
        `/api/v1/fix/lp/${entry.lpId}/fix/messages/order/${encodeURIComponent(entry.clord_id)}`
      );
      setFixMessages(res.data?.messages ?? []);
    } catch {
      setFixMessages([]);
    } finally {
      setFixMessagesLoading(false);
    }
  }, []);

  // ==========================================================================
  // COLUMN DEFINITIONS
  // ==========================================================================
  const columnDefs = useMemo<ColDef<CBookOrder>[]>(() => [
    { field: 'date',       headerName: 'Date',        filter: 'agDateColumnFilter',  width: 110, pinned: 'left', valueFormatter: fmtDate, sort: 'desc' },
    { field: 'time',       headerName: useLocalTime ? 'Time (Local)' : 'Time (UTC)', filter: 'agDateColumnFilter', width: 130, pinned: 'left', valueFormatter: useLocalTime ? fmtTime : fmtTimeUTC },
    { field: 'dealerId',   headerName: 'Account',     filter: 'agSetColumnFilter',   width: 140 },
    { field: 'symbol',     headerName: 'Symbol',      filter: 'agSetColumnFilter',   width: 100, pinned: 'left', cellStyle: { fontWeight: 500 } },
    { field: 'positionId', headerName: 'Position ID', filter: 'agTextColumnFilter',  width: 160 },
    {
      field: 'side', headerName: 'Side', filter: 'agSetColumnFilter', width: 80,
      cellRenderer: (p: { value: string }) =>
        <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : p.value === 'SELL' ? '#e0a020' : '#888', fontWeight: 600 }}>{p.value}</span>,
    },
    { field: 'displayQty',   headerName: 'Volume',      filter: 'agNumberColumnFilter', width: 110, valueFormatter: (p) => p.value != null ? Number(p.value).toLocaleString() : '—' },
    { field: 'fillPrice',   headerName: 'Fill Price',  filter: 'agNumberColumnFilter', width: 120, valueFormatter: fmtPrice },
    {
      colId: 'currentPrice', headerName: 'Cur. Price', filter: 'agNumberColumnFilter', width: 120, sortable: false, suppressCellFlash: true,
      valueGetter: (p: { data?: CBookOrder }) => {
        if (!p.data?._isOpen || !p.data.symbol) return null;
        const key = p.data.side === 'BUY' ? p.data.symbol + ':bid' : p.data.symbol + ':ask';
        return currentPricesRef.current.get(key) ?? p.data.currentPrice ?? null;
      },
      valueFormatter: fmtPrice,
    },
    {
      colId: 'unrealizedPnl', headerName: 'P/L', filter: 'agNumberColumnFilter', width: 100, sortable: false, suppressCellFlash: true,
      valueGetter: (p: { data?: CBookOrder }) => {
        if (!p.data?._isOpen || !p.data.symbol) return null;
        const key = p.data.side === 'BUY' ? p.data.symbol + ':bid' : p.data.symbol + ':ask';
        const closePrice = currentPricesRef.current.get(key) ?? p.data.currentPrice ?? null;
        if (closePrice == null) return null;
        const dir = p.data.side === 'BUY' ? 1 : p.data.side === 'SELL' ? -1 : 0;
        // Use displayQty (units) not volume (lots) — P/L = (price diff) * units
        return dir !== 0 ? (closePrice - p.data.fillPrice) * p.data.displayQty * dir : null;
      },
      cellRenderer: (p: { value: number | null }) => {
        if (p.value == null) return <span style={{ color: '#555' }}>—</span>;
        const color = p.value >= 0 ? '#4ecdc4' : '#ff6b6b';
        return <span style={{ color, fontWeight: 600 }}>{p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}</span>;
      },
    },
    { field: 'stopLoss',   headerName: 'S/L', filter: 'agNumberColumnFilter', width: 110, valueFormatter: (p) => p.value ? fmtPrice(p) : '—' },
    { field: 'takeProfit', headerName: 'T/P', filter: 'agNumberColumnFilter', width: 110, valueFormatter: (p) => p.value ? fmtPrice(p) : '—' },
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
  ], [useLocalTime]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, minWidth: 70 }), []);
  const rowSelection  = useMemo<RowSelectionOptions>(() => ({ mode: 'singleRow', enableClickSelection: true }), []);
  const gridOptions   = useMemo<GridOptions<CBookOrder>>(() => ({
    enableAdvancedFilter: true,
    sideBar: { toolPanels: ['columns'], defaultToolPanel: '' },
    columnHoverHighlight: true, animateRows: false, rowBuffer: 20,
    enableCellChangeFlash: false,
    suppressScrollOnNewData: true,
    suppressMoveWhenRowDragging: true,
    suppressAnimationFrame: true,
    alwaysShowVerticalScroll: true,
    suppressRowHoverHighlight: false,
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent' },
        { statusPanel: 'agSelectedRowCountComponent' },
        { statusPanel: 'agAggregationComponent' },
      ],
    },
  }), []);

  // Once the grid has been seeded via rowData on first render, we stop passing
  // rowData as a live prop by switching to a stable empty-array sentinel.
  // All subsequent structural changes (add/remove) go through applyTransaction only.
  const onGridReady = useCallback((_e: GridReadyEvent) => {
    setTimeout(() => gridRef.current?.api?.autoSizeAllColumns(), 0);
  }, []);

  const onCellValueChanged = useCallback((e: CellValueChangedEvent<CBookOrder>) => {
    if (e.column.getColId() === 'comments' && e.data?.positionId) {
      // Persist edited comment — survives REST polls
      const existing = posOverrideRef.current.get(e.data.positionId);
      posOverrideRef.current.set(e.data.positionId, {
        type:     existing?.type ?? e.data.type,
        comments: e.newValue ?? '',
      });
      saveOverrides();
    }
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

      {/* ── Row 1: C-Book title + Account metrics ───────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#555] flex items-center gap-6 flex-shrink-0" style={{ backgroundColor: '#1e1e20' }}>
        <div className="flex-shrink-0">
          <h1 className="text-base font-semibold text-white leading-tight">C-Book</h1>
          <p className="text-[10px] text-[#777]">Hedge, Trade &amp; Repair orders</p>
        </div>
        <div className="w-px h-8 bg-[#444] flex-shrink-0" />
        {/* Account metrics — TE only. Only 3 fields confirmed sent by TE sandbox UAA. */}
        {allLps.find(l => l.lp_id === domLpId)?.provider_type === 'traderevolution' && (
          account ? (
            <div className="flex items-center gap-5 text-[11px] flex-wrap">
              {/* tag 20115 — ProjectedBalance = UsedMargin + AvailableMargin */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Balance</div>
                <div className="font-mono text-white font-medium">{account.currency} {fmtAcct(account.balance)}</div>
              </div>
              {/* tag 20080 — UsedMargin */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Used Margin</div>
                <div className="font-mono text-white font-medium">{account.currency} {fmtAcct(account.margin_used)}</div>
              </div>
              {/* tag 7027 — AvailableMargin */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Available Margin</div>
                <div className="font-mono text-white font-medium">{account.currency} {fmtAcct(account.margin_available)}</div>
              </div>

              <div className="w-px h-8 bg-[#444] flex-shrink-0" />

              {/* Realized P/L — sourced from risk.cbook_closed_positions via REST */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Realized P/L</div>
                {dailyStats ? (
                  <div className="font-mono font-medium"
                       style={{ color: dailyStats.realized_pnl >= 0 ? '#4ecdc4' : '#ff6b6b' }}>
                    {dailyStats.realized_pnl >= 0 ? '+' : ''}{fmtAcct(dailyStats.realized_pnl)}
                  </div>
                ) : (
                  <div className="font-mono text-[#555]">—</div>
                )}
              </div>

              {/* Unrealized P/L — summed client-side from open grid rows × live book prices */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Unrealized P/L</div>
                {unrealizedPnlTotal != null ? (
                  <div className="font-mono font-medium"
                       style={{ color: unrealizedPnlTotal >= 0 ? '#4ecdc4' : '#ff6b6b' }}>
                    {unrealizedPnlTotal >= 0 ? '+' : ''}{fmtAcct(unrealizedPnlTotal)}
                  </div>
                ) : (
                  <div className="font-mono text-[#555]">—</div>
                )}
              </div>

              {/* Commission — cumulative today from closed positions */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Commission</div>
                {dailyStats ? (
                  <div className="font-mono font-medium"
                       style={{ color: dailyStats.commission < 0 ? '#ff6b6b' : '#888' }}>
                    {fmtAcct(dailyStats.commission)}
                  </div>
                ) : (
                  <div className="font-mono text-[#555]">—</div>
                )}
              </div>

              {/* Swap Long — not available from TE (no per-leg split) */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Swap Long</div>
                <div className="font-mono text-[#444]">--</div>
              </div>

              {/* Swap Short — not available from TE (no per-leg split) */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Swap Short</div>
                <div className="font-mono text-[#444]">--</div>
              </div>

              {/* Swap Net — single swap value from AP position reports */}
              <div>
                <div className="text-[#777] uppercase tracking-wide text-[9px] mb-0.5">Swap Net</div>
                {dailyStats ? (
                  <div className="font-mono font-medium"
                       style={{ color: dailyStats.swap_net < 0 ? '#ff6b6b' : dailyStats.swap_net > 0 ? '#4ecdc4' : '#888' }}>
                    {dailyStats.swap_net >= 0 ? '+' : ''}{fmtAcct(dailyStats.swap_net)}
                  </div>
                ) : (
                  <div className="font-mono text-[#555]">—</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-[#555]">Awaiting account data…</div>
          )
        )}
      </div>

      {/* ── Row 2: Controls + Position stats ─────────────────────────────────── */}
      <div className="px-4 py-1.5 border-b border-[#444] flex items-center gap-3 flex-shrink-0 text-xs" style={{ backgroundColor: '#252527' }}>
        <div className="flex items-center gap-2">
          <span className="text-[#aaa]">View LP:</span>
          {lpsLoading ? <span className="text-[#555]">…</span> : (
            <select
              value={gridLpId}
              onChange={(e) => { setGridLpId(e.target.value); setCloseRow(null); }}
              className="bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]"
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

        <button
          onClick={() => setUseLocalTime(v => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#555] bg-[#232225] hover:border-[#4ecdc4] text-[#aaa] hover:text-white transition-colors text-xs"
          title="Toggle local / server (UTC) time"
        >
          {useLocalTime ? 'Local Time' : 'UTC'}
        </button>
        <div className="w-px h-4 bg-[#555]" />
        <div><span className="text-[#aaa]">Pos:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
        <div>
          <span className="text-[#aaa]">L/S:</span>
          <span className="ml-1 font-mono">
            <span className="text-[#4ecdc4]">{stats.buys}</span>
            <span className="text-[#444]"> / </span>
            <span className="text-[#e0a020]">{stats.sells}</span>
          </span>
        </div>
        <div>
          <span className="text-[#aaa]">Vol (Units):</span>
          <span className="ml-1 font-mono text-white">{stats.volDisplay}</span>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2 min-h-0">

        {/* ── Grid ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {!gridLpConnected ? (
            <div className="flex-1 flex items-center justify-center text-[#555] text-sm">
              No data to show — LP not connected
            </div>
          ) : posLoading && livePositions.length === 0 ? (
            <div className="flex-shrink-0 px-3 py-1.5 text-xs text-[#555] border-b border-[#444]">
              Fetching positions from {gridLpId}…
            </div>
          ) : null}
          <div className={gridLpConnected ? "flex-1 min-h-0" : "hidden"}>
            <AgGridReact<CBookOrder>
              ref={gridRef}
              theme={gridTheme}
              rowData={GRID_STABLE_EMPTY}
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
              onCellValueChanged={onCellValueChanged}
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
              <span className="text-sm font-medium text-white">Market Depth </span>
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

          {/* Account metrics moved to main page header row 1 */}

          {/* LP session state (from brief Section 4.1) */}
          {lpStatus && (
            <div className="px-3 py-1 border-b border-[#333] flex items-center gap-3 text-[10px] flex-shrink-0" style={{ backgroundColor: '#191a1c' }}>
              <span className="text-white">Trading:</span>
              <span style={{ color: lpStatus.trading_session.state === 'LOGGED_ON' ? '#4ecdc4' : '#e0a020' }}>
                {lpStatus.trading_session.state}
              </span>
              <span className="text-white">MD:</span>
              <span style={{ color: lpStatus.md_session.state === 'LOGGED_ON' ? '#4ecdc4' : '#e0a020' }}>
                {lpStatus.md_session.state}
              </span>
            </div>
          )}

          {/* ── LP Selector ──────────────────────────────────────────────────── */}
          <div className="px-3 py-2 border-b border-[#555] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white w-5 flex-shrink-0">LP</span>
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
              <span className="text-[10px] text-white w-5 flex-shrink-0">SYM</span>
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
                  <div className="text-white mb-0.5">Best Bid</div>
                  <div className="font-mono font-bold" style={{ color: '#4ecdc4' }}>{liveBook.best_bid.toFixed(instrDecimals)}</div>
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
              <div className="text-[10px] text-white mb-1">Quantity (Units)</div>
              <input type="text" value={domQtyLots}
                onChange={(e) => setDomQtyLots(e.target.value.replace(/[^0-9.]/g, ''))}
                disabled={!isConnected && !closeRow}
                placeholder="0.00"
                className={clsx(
                  'w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4] placeholder-[#555]',
                  closeRow && 'border-[#a78bfa44]',
                  (!isConnected && !closeRow) && 'opacity-40'
                )}
              />
              {domQtyLots && activeInstrument && (
                <div className="text-[10px] text-white mt-0.5">
                  Min: {(activeInstrument.min_trade_vol).toLocaleString()} units
                </div>
              )}
            </div>

            {/* SL / TP */}
            {!closeRow && slTpSupported && (
              <div className="mb-2">
                <div className="flex gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-white mb-1">Stop Loss</div>
                    <input type="text" value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value.replace(/[^0-9.]/g, ''))}
                      disabled={!isConnected || submitting} placeholder="0.00000"
                      className="w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#ff6b6b] placeholder-[#555]"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-white mb-1">Take Profit</div>
                    <input type="text" value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value.replace(/[^0-9.]/g, ''))}
                      disabled={!isConnected || submitting} placeholder="0.00000"
                      className="w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4] placeholder-[#555]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Comment (optional, 50 chars, DOM Trader orders only) */}
            {!closeRow && (
              <div className="mb-2">
                <div className="text-[10px] text-white mb-1">Comment <span className="text-[#555]">(optional)</span></div>
                <input
                  type="text"
                  value={domComment}
                  onChange={(e) => setDomComment(e.target.value.slice(0, 50))}
                  placeholder="Add note…"
                  maxLength={50}
                  className="w-full bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4] placeholder-[#555]"
                />
                {domComment && <div className="text-[9px] text-[#555] mt-0.5 text-right">{domComment.length}/50</div>}
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

        </div>
        {/* ── End DOM Panel ──────────────────────────────────────────────────── */}

        {/* ── Order Execution Panel (slide-out, mirrors ABookPage pattern) ───── */}
        {execPanelOpen && (
          <div className="flex flex-col border-l border-[#555] flex-shrink-0" style={{ width: '360px', backgroundColor: '#161618' }}>

            {/* Header */}
            <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between flex-shrink-0" style={{ backgroundColor: '#1a1a1c' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Order FIX Details</span>
                {selectedExec && (
                  <button
                    onClick={() => { setSelectedExec(null); setFixMessages([]); }}
                    className="text-xs text-[#999] hover:text-white border border-[#444] rounded px-1.5 py-0.5 transition-colors"
                  >← back</button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!selectedExec && execLog.length > 0 && (
                  <button onClick={() => setExecLog([])} className="text-xs text-[#666] hover:text-[#aaa] transition-colors">clear</button>
                )}
                <button
                  onClick={() => { setExecPanelOpen(false); setSelectedExec(null); setFixMessages([]); }}
                  className="text-[#999] hover:text-white transition-colors p-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── List view ── */}
            {!selectedExec && (
              <div className="flex-1 overflow-y-auto min-h-0">
                {execLog.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[#666]">
                    {!domLpId ? 'Select an LP to begin' : !domSymbol ? 'Select a symbol' : 'No orders this session'}
                  </div>
                ) : execLog.map((e, idx) => (
                  <div
                    key={`${e.clord_id}-${idx}`}
                    className="px-3 py-3 border-b border-[#222] cursor-pointer hover:bg-[#1d1d20] transition-colors"
                    onClick={() => fetchFixMessages(e)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold" style={{ color: e.side === 'BUY' ? '#4ecdc4' : '#e0a020' }}>{e.side}</span>
                        <span className="font-mono text-white font-semibold">{e.symbol}</span>
                        <span className="text-white font-mono">{e.qty.toLocaleString()}</span>
                      </div>
                      <span className="text-xs font-bold font-mono"
                        style={{ color: e.status === 'SENT' ? '#4ecdc4' : '#ff6b6b' }}>
                        {e.status}
                      </span>
                    </div>
                    <div className="text-xs text-[#aaa] font-mono mb-0.5 truncate">{e.clord_id}</div>
                    {e.rejectReason && (
                      <div className="text-xs text-[#ff6b6b] mb-0.5">{e.rejectReason}</div>
                    )}
                    <div className="text-xs text-[#777]">
                      {new Date(e.ts).toLocaleTimeString()} · {e.lpId} · {e.orderType}/{e.tif}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Detail view ── */}
            {selectedExec && (
              <div className="flex flex-col flex-1 min-h-0">

                {/* Summary row */}
                <div className="px-3 py-2.5 border-b border-[#333] flex-shrink-0" style={{ backgroundColor: '#1d1d20' }}>
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <span className="font-bold" style={{ color: selectedExec.side === 'BUY' ? '#4ecdc4' : '#e0a020' }}>{selectedExec.side}</span>
                    <span className="text-white font-mono font-semibold">{selectedExec.symbol}</span>
                    <span className="text-white font-mono">{selectedExec.qty.toLocaleString()}</span>
                    <span className="ml-auto text-xs font-bold font-mono"
                      style={{ color: selectedExec.status === 'SENT' ? '#4ecdc4' : '#ff6b6b' }}>
                      {selectedExec.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#aaa] font-mono truncate mb-0.5">{selectedExec.clord_id}</div>
                  <div className="text-xs text-[#777]">
                    {new Date(selectedExec.ts).toLocaleTimeString()} · {selectedExec.lpId} · {selectedExec.orderType}/{selectedExec.tif}
                  </div>
                </div>

                {/* FIX messages */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {fixMessagesLoading && (
                    <div className="px-3 py-4 text-sm text-[#666] animate-pulse">Fetching FIX messages…</div>
                  )}
                  {!fixMessagesLoading && fixMessages.length === 0 && (
                    <div className="px-3 py-4 text-sm text-[#666]">No FIX messages found for this order.</div>
                  )}
                  {!fixMessagesLoading && fixMessages.map((msg, i) => (
                    <div key={`${msg.seq_num}-${i}`} className="border-b border-[#222]">
                      {/* Message header bar */}
                      <div className="px-3 py-2 flex items-center gap-2 border-b border-[#222]" style={{ backgroundColor: '#1d1d20' }}>
                        <span
                          className="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: msg.direction === 'sent' ? '#0e2320' : '#17153a',
                            color: msg.direction === 'sent' ? '#4ecdc4' : '#a78bfa',
                          }}
                        >{msg.direction === 'sent' ? 'OUT' : 'IN'}</span>
                        <span className="text-sm text-white font-semibold">{msg.msg_type_name}</span>
                        <span className="text-xs text-[#666] font-mono ml-auto">35={msg.msg_type}</span>
                        <span className="text-xs text-[#666] font-mono">#{msg.seq_num}</span>
                      </div>
                      {/* Timestamp */}
                      <div className="px-3 pt-2 pb-1 text-xs text-[#888] font-mono">{msg.timestamp}</div>
                      {/* Raw FIX — tag per row */}
                      <div className="px-3 pb-3">
                        {msg.raw.split('|').filter(Boolean).map((tag, ti) => {
                          const eq = tag.indexOf('=');
                          if (eq < 0) return null;
                          const tagNum = tag.slice(0, eq);
                          const val    = tag.slice(eq + 1);
                          return (
                            <div key={ti} className="flex gap-3 text-xs py-0.5">
                              <span className="text-[#666] font-mono w-6 flex-shrink-0 text-right">{tagNum}</span>
                              <span className="text-white font-mono break-all">{val}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>
        )}

        {/* Collapsed tab */}
        {!execPanelOpen && (
          <button
            onClick={() => setExecPanelOpen(true)}
            className="flex items-center justify-center border-l border-[#555] bg-[#232225] hover:bg-[#2a2a2c] transition-colors flex-shrink-0"
            style={{ width: '28px' }}
            title="Show Order Execution"
          >
            <span
              className="text-[#999] text-xs font-medium whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Order Execution
            </span>
          </button>
        )}

      </div>
    </div>
  );
}

export default CBookPage;