// ============================================================
// ExecutionReport.tsx
// FIX Execution Report — A-Book & C-Book LP Order Blotter
// Sources: GET /api/v1/fix/lp/{lp_id}/orders   (blotter)
//          GET /api/v1/fix/lp/{lp_id}/fix/messages/order/{clord_id}  (detail)
//          WS  /ws/v1/fix/events  → EXECUTION_REPORT updates Status in-place
// ============================================================

import {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ValueFormatterParams,
  ICellRendererParams,
  GetContextMenuItemsParams,
  MenuItemDef,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ── AG-Grid dark theme ────────────────────────────────────────
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#1e1e20',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.07, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#e8e8ea',
  headerFontSize: 11,
  rowBorder: { style: 'solid', width: 1, color: '#2a2a2e' },
  borderColor: '#2a2a2e',
  selectedRowBackgroundColor: '#2a2540',
});

const API_BASE = (import.meta as Record<string, unknown> & { env?: Record<string, string> }).env?.VITE_API_URL ?? 'http://localhost:8080';
const WS_BASE  = API_BASE.replace(/^http/, 'ws');

// ── Types ─────────────────────────────────────────────────────

type BookTab = 'A-Book' | 'C-Book';

type OrdStatus = 'PENDING_NEW' | 'NEW' | 'PARTIALLY_FILLED' | 'FILLED'
               | 'CANCELLED' | 'PENDING_CANCEL' | 'REJECTED' | 'EXPIRED' | 'REPLACED';

type MsgDirection = 'sent' | 'received';

export interface OrderRow {
  id: string;                // clord_id — AG-Grid rowId
  lp_id: string;
  clord_id: string;
  order_id: string;
  symbol: string;
  canonical_symbol: string;
  side: 'BUY' | 'SELL';
  open_close: 'O' | 'C' | '';
  product_type: 'FOREX' | 'CFD' | 'EQUITIES' | '';
  order_type: string;
  time_in_force: string;
  quantity: number;
  limit_price: number | null;
  avg_px: number | null;
  last_px: number | null;
  cum_qty: number;
  leaves_qty: number;
  stop_loss: number | null;
  take_profit: number | null;
  exec_type: string;
  exec_id: string;
  status: OrdStatus;
  text: string;
  created_ts: number;
  last_update_ts: number;
  // live flash support
  _statusFlash?: boolean;
}

interface FIXMessage {
  seq_num: number;
  direction: MsgDirection;
  msg_type: string;
  msg_type_name: string;
  timestamp: string;
  raw: string;
  parsed?: Record<string, string>;
}

interface LPConfig {
  lp_id: string;
  lp_name: string;
  state: string;
  provider_type?: string;
}

// ── WebSocket event payloads ───────────────────────────────────

interface WSExecReport {
  type: 'EXECUTION_REPORT';
  lp_id: string;
  clord_id: string;     // API doc §13: field is "clord_id" (no extra underscore)
  exec_id?: string;
  order_id?: string;
  exec_type: string;    // '8' = REJECTED, 'F' = FILL, etc.
  ord_status: string;
  symbol?: string;
  side?: string;
  last_qty?: number;
  last_px?: number;
  cum_qty?: number;
  leaves_qty?: number;
  text?: string;
  timestamp_ms?: number;
}

interface WSCancelReject {
  type: 'ORDER_CANCEL_REJECT';
  lp_id: string;
  clord_id: string;          // API doc §13: the cancel request's own ClOrdID
  orig_clord_id: string;     // API doc §13: the original order being cancelled
  ord_status: string;
  cxl_rej_reason?: string;   // '0'=too late, '1'=unknown order, '3'=pending state
  text?: string;
  timestamp_ms?: number;
}

interface WSSessionReject {
  type: 'SESSION_REJECT';
  lp_id: string;
  ref_seq_num?: number;
  ref_msg_type?: string;    // e.g. 'D' = NewOrderSingle that caused the reject
  reason?: string;
  text?: string;
  timestamp_ms?: number;
}

interface SessionAlert {
  id: string;
  lp_id: string;
  ref_msg_type?: string;
  text: string;
  ts: number;
}

// ── Helpers ───────────────────────────────────────────────────

function fmtTimestamp(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function fmtPrice(v: number | null | undefined, symbol = ''): string {
  if (v === null || v === undefined) return '';
  if (symbol.includes('JPY')) return v.toFixed(3);
  if (symbol.includes('XAU') || symbol.includes('BTC')) return v.toFixed(2);
  return v.toFixed(5);
}

function fmtQty(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function execTypeLabel(code: string): string {
  const map: Record<string, string> = {
    '0': 'New', '4': 'Cancelled', '5': 'Replaced',
    '8': 'Rejected', 'C': 'Expired', 'F': 'Trade (Fill)',
  };
  return map[code] ?? code;
}

function ordStatusLabel(s: OrdStatus): string {
  const map: Record<string, string> = {
    PENDING_NEW: 'Pending', NEW: 'New', PARTIALLY_FILLED: 'Partial',
    FILLED: 'Filled', CANCELLED: 'Cancelled', PENDING_CANCEL: 'Pend Cancel',
    REJECTED: 'Rejected', EXPIRED: 'Expired', REPLACED: 'Replaced',
  };
  return map[s] ?? s;
}

function statusColor(s: OrdStatus): string {
  switch (s) {
    case 'FILLED':           return '#4ade80';   // green
    case 'PARTIALLY_FILLED': return '#86efac';   // light green
    case 'NEW':              return '#7dd3fc';   // blue
    case 'PENDING_NEW':      return '#93c5fd';   // lighter blue
    case 'REJECTED':         return '#f87171';   // red
    case 'CANCELLED':        return '#94a3b8';   // slate
    case 'PENDING_CANCEL':   return '#fbbf24';   // amber
    case 'EXPIRED':          return '#a78bfa';   // purple
    default:                 return '#e8e8ea';
  }
}

function sideColor(side: string): string {
  return side === 'BUY' ? '#4ecdc4' : '#e0a020';
}

function msgTypeColor(type: string): string {
  if (type === 'D') return '#7dd3fc';   // NewOrderSingle – blue
  if (type === '8') return '#86efac';   // ExecutionReport – green
  if (type === 'F') return '#fbbf24';   // OrderCancelRequest – amber
  if (type === 'G') return '#c4b5fd';   // OrderReplaceRequest – purple
  if (type === '9') return '#f87171';   // OrderCancelReject – red
  if (type === '3') return '#fb923c';   // SessionReject – orange
  return '#94a3b8';
}

function cxlRejReasonLabel(code: string | undefined): string {
  if (!code) return '';
  const map: Record<string, string> = {
    '0': 'Too late to cancel',
    '1': 'Unknown order',
    '3': 'Order already in pending state',
  };
  return map[code] ?? `Reason ${code}`;
}

function directionIcon(dir: MsgDirection) {
  return dir === 'sent'
    ? <span style={{ color: '#7dd3fc', fontSize: 10 }}>▶ SENT</span>
    : <span style={{ color: '#86efac', fontSize: 10 }}>◀ RECV</span>;
}

// Map FIX OrdStatus code → OrdStatus string
function mapOrdStatus(code: string): OrdStatus {
  const map: Record<string, OrdStatus> = {
    '0': 'NEW', '1': 'PARTIALLY_FILLED', '2': 'FILLED',
    '4': 'CANCELLED', '6': 'PENDING_CANCEL', '8': 'REJECTED', 'E': 'PENDING_NEW',
  };
  return map[code] ?? 'NEW';
}

// ── Mock data (graceful degradation while backend is 🟡) ────────

function buildMock(lpId: string, book: BookTab): OrderRow[] {
  const now = Date.now();
  const ago = (s: number) => now - s * 1000;
  const base: Omit<OrderRow, 'id' | 'lp_id'>[] = [
    {
      clord_id: `${lpId}_1_${now - 300000}`, order_id: 'LP_ORD_10021',
      symbol: 'EURUSD', canonical_symbol: 'EURUSD',
      side: 'BUY', open_close: 'O', product_type: 'FOREX',
      order_type: 'MARKET', time_in_force: 'IOC',
      quantity: 100000, limit_price: null, avg_px: 1.08547, last_px: 1.08547,
      cum_qty: 100000, leaves_qty: 0,
      stop_loss: 1.08000, take_profit: 1.09200,
      exec_type: 'F', exec_id: `EXEC_${now - 300100}`,
      status: 'FILLED', text: '',
      created_ts: ago(300), last_update_ts: ago(298),
    },
    {
      clord_id: `${lpId}_2_${now - 250000}`, order_id: 'LP_ORD_10022',
      symbol: 'GBPUSD', canonical_symbol: 'GBPUSD',
      side: 'SELL', open_close: 'C', product_type: 'FOREX',
      order_type: 'MARKET', time_in_force: 'IOC',
      quantity: 200000, limit_price: null, avg_px: 1.27134, last_px: 1.27134,
      cum_qty: 200000, leaves_qty: 0,
      stop_loss: null, take_profit: null,
      exec_type: 'F', exec_id: `EXEC_${now - 250100}`,
      status: 'FILLED', text: '',
      created_ts: ago(250), last_update_ts: ago(248),
    },
    {
      clord_id: `${lpId}_3_${now - 180000}`, order_id: '',
      symbol: 'XAUUSD', canonical_symbol: 'XAUUSD',
      side: 'BUY', open_close: 'O', product_type: 'CFD',
      order_type: 'LIMIT', time_in_force: 'GTC',
      quantity: 50, limit_price: 2310.00, avg_px: null, last_px: null,
      cum_qty: 0, leaves_qty: 50,
      stop_loss: 2280.00, take_profit: 2380.00,
      exec_type: '8', exec_id: '',
      status: 'REJECTED', text: 'Order size exceeds risk limit',
      created_ts: ago(180), last_update_ts: ago(179),
    },
    {
      clord_id: `${lpId}_4_${now - 60000}`, order_id: 'LP_ORD_10023',
      symbol: 'EURUSD', canonical_symbol: 'EURUSD',
      side: 'SELL', open_close: 'O', product_type: 'FOREX',
      order_type: 'MARKET', time_in_force: 'IOC',
      quantity: 150000, limit_price: null, avg_px: 1.08501, last_px: 1.08501,
      cum_qty: 150000, leaves_qty: 0,
      stop_loss: 1.09100, take_profit: 1.07500,
      exec_type: 'F', exec_id: `EXEC_${now - 60100}`,
      status: 'FILLED', text: '',
      created_ts: ago(60), last_update_ts: ago(58),
    },
    {
      clord_id: `${lpId}_5_${now - 15000}`, order_id: 'LP_ORD_10024',
      symbol: 'GBPJPY', canonical_symbol: 'GBPJPY',
      side: 'BUY', open_close: 'O', product_type: 'FOREX',
      order_type: 'LIMIT', time_in_force: 'GTC',
      quantity: 100000, limit_price: 192.500, avg_px: null, last_px: null,
      cum_qty: 0, leaves_qty: 100000,
      stop_loss: 191.000, take_profit: 195.000,
      exec_type: '0', exec_id: `EXEC_${now - 14900}`,
      status: 'NEW', text: '',
      created_ts: ago(15), last_update_ts: ago(14),
    },
    {
      clord_id: `${lpId}_6_${now - 5000}`, order_id: '',
      symbol: 'EURUSD', canonical_symbol: 'EURUSD',
      side: 'BUY', open_close: 'C', product_type: 'FOREX',
      order_type: 'MARKET', time_in_force: 'IOC',
      quantity: 100000, limit_price: null, avg_px: null, last_px: null,
      cum_qty: 0, leaves_qty: 100000,
      stop_loss: null, take_profit: null,
      exec_type: '', exec_id: '',
      status: 'PENDING_NEW', text: '',
      created_ts: ago(5), last_update_ts: ago(5),
    },
    {
      // Cancel reject mock: a filled order where a cancel was attempted and rejected
      clord_id: `${lpId}_7_${now - 120000}`, order_id: 'LP_ORD_10025',
      symbol: 'USDJPY', canonical_symbol: 'USDJPY',
      side: 'BUY', open_close: 'O', product_type: 'FOREX',
      order_type: 'LIMIT', time_in_force: 'GTC',
      quantity: 100000, limit_price: 151.850, avg_px: 151.850, last_px: 151.850,
      cum_qty: 100000, leaves_qty: 0,
      stop_loss: 151.200, take_profit: 153.000,
      exec_type: 'F', exec_id: `EXEC_${now - 119000}`,
      status: 'FILLED', text: 'Order already filled — Too late to cancel',
      created_ts: ago(120), last_update_ts: ago(90),
    },
  ];

  return base.map(o => ({ ...o, id: o.clord_id, lp_id: lpId }));
}

function buildMockFIXMessages(order: OrderRow): FIXMessage[] {
  const ts1 = new Date(order.created_ts).toISOString().replace('T', '-').replace(/\..+/, '');
  const ts2 = new Date(order.created_ts + 130).toISOString().replace('T', '-').replace(/\..+/, '');
  const ts3 = new Date(order.created_ts + 280).toISOString().replace('T', '-').replace(/\..+/, '');
  const updTs = new Date(order.last_update_ts).toISOString().replace('T', '-').replace(/\..+/, '');
  const sideCode = order.side === 'BUY' ? '1' : '2';
  const ordTypeCode = order.order_type === 'MARKET' ? '1' : '2';

  const msgs: FIXMessage[] = [
    {
      seq_num: 11,
      direction: 'sent',
      msg_type: 'D',
      msg_type_name: 'NewOrderSingle',
      timestamp: ts1,
      raw: [
        '8=FIX.4.4', '9=220', '35=D',
        `34=11`, `49=${order.lp_id}`, `52=${ts1}`, '56=TEORDER',
        `11=${order.clord_id}`, `1=${order.lp_id}`,
        `55=${order.symbol}`, `54=${sideCode}`,
        `38=${order.quantity}`, `40=${ordTypeCode}`,
        order.limit_price ? `44=${order.limit_price}` : null,
        `59=${order.time_in_force === 'GTC' ? '1' : '3'}`,
        `60=${ts1}`,
        `77=${order.open_close || 'O'}`,
        order.stop_loss ? `18205=${order.stop_loss}` : null,
        order.take_profit ? `18206=${order.take_profit}` : null,
        `20017=${order.product_type === 'FOREX' ? '1' : '2'}`,
        '10=xxx',
      ].filter(Boolean).join('|'),
      parsed: {
        ClOrdID: order.clord_id,
        Symbol: order.symbol,
        Side: sideCode,
        OrderQty: String(order.quantity),
        OrdType: ordTypeCode,
        ...(order.limit_price ? { Price: String(order.limit_price) } : {}),
        OpenClose: order.open_close || 'O',
        ...(order.stop_loss ? { StopLoss: String(order.stop_loss) } : {}),
        ...(order.take_profit ? { TakeProfit: String(order.take_profit) } : {}),
      },
    },
  ];

  if (order.status !== 'PENDING_NEW') {
    msgs.push({
      seq_num: 11,
      direction: 'received',
      msg_type: '8',
      msg_type_name: 'ExecutionReport',
      timestamp: ts2,
      raw: [
        '8=FIX.4.4', '9=260', '35=8',
        `34=11`, '49=TEORDER', `52=${ts2}`, `56=${order.lp_id}`,
        order.order_id ? `37=${order.order_id}` : null,
        `11=${order.clord_id}`,
        `17=EXEC_ACK_${order.clord_id.slice(-6)}`,
        '150=0', '39=0',
        `55=${order.symbol}`, `54=${sideCode}`,
        `38=${order.quantity}`, `32=0`, '31=0',
        `14=0`, `151=${order.quantity}`, '6=0',
        '10=xxx',
      ].filter(Boolean).join('|'),
      parsed: {
        OrderID: order.order_id || '',
        ClOrdID: order.clord_id,
        ExecID: `EXEC_ACK_${order.clord_id.slice(-6)}`,
        ExecType: '0',
        OrdStatus: '0',
        Symbol: order.symbol,
      },
    });
  }

  if (order.status === 'FILLED' && order.avg_px) {
    msgs.push({
      seq_num: 12,
      direction: 'received',
      msg_type: '8',
      msg_type_name: 'ExecutionReport (Fill)',
      timestamp: ts3,
      raw: [
        '8=FIX.4.4', '9=290', '35=8',
        `34=12`, '49=TEORDER', `52=${ts3}`, `56=${order.lp_id}`,
        order.order_id ? `37=${order.order_id}` : null,
        `11=${order.clord_id}`,
        order.exec_id ? `17=${order.exec_id}` : null,
        '150=F', '39=2',
        `55=${order.symbol}`, `54=${sideCode}`,
        `38=${order.quantity}`,
        `32=${order.cum_qty}`, `31=${order.avg_px}`,
        `14=${order.cum_qty}`, '151=0',
        `6=${order.avg_px}`,
        '10=xxx',
      ].filter(Boolean).join('|'),
      parsed: {
        OrderID: order.order_id,
        ClOrdID: order.clord_id,
        ExecID: order.exec_id,
        ExecType: 'F',
        OrdStatus: '2',
        LastQty: String(order.cum_qty),
        LastPx: String(order.avg_px),
        AvgPx: String(order.avg_px),
        Symbol: order.symbol,
      },
    });
  }

  if (order.status === 'REJECTED') {
    msgs.push({
      seq_num: 11,
      direction: 'received',
      msg_type: '8',
      msg_type_name: 'ExecutionReport (Reject)',
      timestamp: ts2,
      raw: [
        '8=FIX.4.4', '9=250', '35=8',
        `34=11`, '49=TEORDER', `52=${ts2}`, `56=${order.lp_id}`,
        `11=${order.clord_id}`, `17=REJ_${order.clord_id.slice(-6)}`,
        '150=8', '39=8',
        `55=${order.symbol}`, `54=${sideCode}`,
        `38=${order.quantity}`, '32=0', '31=0', '14=0',
        `151=${order.quantity}`, '6=0',
        `58=${order.text}`, '10=xxx',
      ].filter(Boolean).join('|'),
      parsed: {
        ClOrdID: order.clord_id,
        ExecType: '8 (REJECTED)',
        OrdStatus: '8',
        Text: order.text || 'Rejected by LP',
        Symbol: order.symbol,
      },
    });
  }

  // Cancel Reject mock — shown when text contains "Too late to cancel" / "already filled"
  if (order.text && (order.text.includes('Too late') || order.text.includes('already filled') || order.text.includes('cancel'))) {
    msgs.push({
      seq_num: msgs.length + 1,
      direction: 'sent',
      msg_type: 'F',
      msg_type_name: 'OrderCancelRequest',
      timestamp: updTs,
      raw: `8=FIX.4.4|35=F|49=${order.lp_id}|56=TEORDER|41=${order.clord_id}|11=${order.clord_id}_cancel|55=${order.symbol}|54=${order.side === 'BUY' ? '1' : '2'}|`,
      parsed: {
        OrigClOrdID: order.clord_id,
        ClOrdID: `${order.clord_id}_cancel`,
        Symbol: order.symbol,
      },
    });
    msgs.push({
      seq_num: msgs.length + 1,
      direction: 'received',
      msg_type: '9',
      msg_type_name: 'OrderCancelReject',
      timestamp: updTs,
      raw: `8=FIX.4.4|35=9|49=TEORDER|56=${order.lp_id}|41=${order.clord_id}|102=1|58=${order.text}|`,
      parsed: {
        OrigClOrdID: order.clord_id,
        CxlRejReason: '1 (Unknown Order)',
        Text: order.text,
      },
    });
  }

  return msgs;
}

// ── Cell Renderers ────────────────────────────────────────────

function StatusCell({ value, data }: ICellRendererParams<OrderRow>) {
  const status = value as OrdStatus;
  return (
    <span
      className={clsx(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-all duration-300',
        data?._statusFlash && 'ring-1 ring-white/40',
      )}
      style={{ color: statusColor(status), backgroundColor: `${statusColor(status)}18` }}
    >
      {ordStatusLabel(status)}
    </span>
  );
}

function SideCell({ value }: ICellRendererParams<OrderRow>) {
  return (
    <span className="font-semibold" style={{ color: sideColor(value as string) }}>
      {value}
    </span>
  );
}

function OcCell({ value }: ICellRendererParams<OrderRow>) {
  if (!value) return null;
  return (
    <span className={clsx(
      'inline-block px-1 text-[10px] font-semibold rounded',
      value === 'O' ? 'text-[#4ecdc4]' : 'text-[#e0a020]',
    )}>
      {value === 'O' ? 'OPEN' : 'CLOSE'}
    </span>
  );
}

function LPBadge({ value }: ICellRendererParams<OrderRow>) {
  return (
    <span className="font-mono text-[10px] text-[#c8c8d0] tracking-wide uppercase">
      {String(value).replace('traderevolution', 'TE').replace('cmc', 'CMC')}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function ExecutionReportPage() {
  // ── State ───────────────────────────────────────────────────
  const [activeBook, setActiveBook]   = useState<BookTab>('A-Book');
  const [allLPs, setAllLPs]           = useState<LPConfig[]>([]);
  const [selectedLPs, setSelectedLPs] = useState<Set<string>>(new Set());
  const [rows, setRows]               = useState<OrderRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [wsStatus, setWsStatus]       = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null);
  const [selectedOrder, setSelectedOrder]         = useState<OrderRow | null>(null);
  const [detailMessages, setDetailMessages]       = useState<FIXMessage[]>([]);
  const [detailLoading, setDetailLoading]         = useState(false);
  const [lpDropOpen, setLpDropOpen]   = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrdStatus | ''>('');
  const [rawMsgVisible, setRawMsgVisible] = useState<number | null>(null);
  const [fetchError, setFetchError]       = useState<string | null>(null);

  const gridApiRef = useRef<GridApi<OrderRow> | null>(null);
  const wsRef      = useRef<WebSocket | null>(null);
  const rowMapRef  = useRef<Map<string, OrderRow>>(new Map());
  const lpDropRef  = useRef<HTMLDivElement>(null);

  // Session-level alerts (SESSION_REJECT events — not tied to an order row)
  const [sessionAlerts, setSessionAlerts] = useState<SessionAlert[]>([]);
  const dismissAlert = useCallback((id: string) =>
    setSessionAlerts(prev => prev.filter(a => a.id !== id)), []);

  // ── Fetch LP list ───────────────────────────────────────────
  const fetchLPs = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/fix/admin/lp`);
      if (!r.ok) throw new Error('LP fetch failed');
      // Response: { success: true, data: { count: N, lps: LPConfig[] } }
      const d = await r.json() as { success?: boolean; data?: { lps?: LPConfig[] }; lps?: LPConfig[] };
      const lps: LPConfig[] = d.data?.lps ?? (d.lps as LPConfig[] | undefined) ?? [];
      if (lps.length > 0) {
        setAllLPs(lps);
        // Leave selectedLPs empty — user must choose (shows 'Select LP…')
      } else {
        throw new Error('empty');
      }
    } catch {
      // Mock fallback — mirrors MOCK_LPS in LiquidityProviders.tsx
      const mock: LPConfig[] = [
        { lp_id: 'traderevolution', lp_name: 'TraderEvolution Sandbox', state: 'CONNECTED', provider_type: 'traderevolution' },
        { lp_id: 'lmax-demo', lp_name: 'LMAX Demo', state: 'DISCONNECTED', provider_type: 'lmax' },
      ];
      setAllLPs(mock);
      // Leave selectedLPs empty — user must choose (shows 'Select LP…')
    }
  }, []);

  // ── Fetch orders for all selected LPs ──────────────────────
  const fetchOrders = useCallback(async (lpIds: string[], _book: BookTab) => {
    setLoading(true);
    setFetchError(null);
    try {
      const results = await Promise.allSettled(
        lpIds.map(async (id) => {
          const r = await fetch(`${API_BASE}/api/v1/fix/lp/${id}/orders`);
          if (!r.ok) {
            // 404 = no order cache yet for this LP (no orders placed this session) — treat as empty
            if (r.status === 404) {
              return { lp_id: id, payload: { success: true, data: { orders: [] } } };
            }
            const body = await r.json().catch(() => ({})) as { error?: string; details?: string };
            const msg = (body.error && body.error !== 'Unknown error')
              ? body.error
              : body.details ?? `HTTP ${r.status}`;
            throw new Error(`[${id}] ${msg}`);
          }
          return { lp_id: id, payload: await r.json() as { success?: boolean; data?: { orders?: unknown[] } } };
        })
      );

      const merged: OrderRow[] = [];
      const errors: string[] = [];

      results.forEach((r) => {
        if (r.status === 'rejected') {
          errors.push(String(r.reason));
          return;
        }
        const { lp_id: id, payload } = r.value;
        // API doc §7 GET_ALL_ORDERS: { success: true, data: { orders: [...] } }
        const orders = payload?.data?.orders;
        if (!Array.isArray(orders)) {
          errors.push(`${id}: unexpected response shape`);
          return;
        }
        // Empty orders is a valid live response — just means no orders cached yet
        (orders as Record<string, unknown>[]).forEach((o) => {
          merged.push({
            id: String(o.clord_id),
            lp_id: id,
            clord_id:         String(o.clord_id ?? ''),
            order_id:         String(o.order_id ?? ''),
            symbol:           String(o.symbol ?? ''),
            canonical_symbol: String(o.canonical_symbol ?? o.symbol ?? ''),
            side:             (o.side as 'BUY' | 'SELL') ?? 'BUY',
            open_close:       (o.open_close as 'O' | 'C') ?? '',
            product_type:     (o.product_type as 'FOREX' | 'CFD') ?? '',
            order_type:       String(o.order_type ?? ''),
            time_in_force:    String(o.time_in_force ?? ''),
            quantity:         Number(o.quantity ?? 0),
            limit_price:      o.price != null ? Number(o.price) : null,
            avg_px:           o.avg_px != null ? Number(o.avg_px) : null,
            last_px:          o.last_px != null ? Number(o.last_px) : null,
            cum_qty:          Number(o.cum_qty ?? 0),
            leaves_qty:       Number(o.leaves_qty ?? 0),
            stop_loss:        o.stop_loss != null ? Number(o.stop_loss) : null,
            take_profit:      o.take_profit != null ? Number(o.take_profit) : null,
            exec_type:        String(o.exec_type ?? ''),
            exec_id:          String(o.exec_id ?? ''),
            // API doc §7: field is "state" (order state machine value)
            status:           (o.state as OrdStatus) ?? 'NEW',
            text:             String(o.text ?? ''),
            created_ts:       Number(o.created_ts ?? Date.now()),
            last_update_ts:   Number(o.last_update_ts ?? Date.now()),
          });
        });
      });

      if (errors.length > 0) {
        setFetchError(errors.join(' | '));
      }

      // Sort newest first
      merged.sort((a, b) => b.created_ts - a.created_ts);

      rowMapRef.current = new Map(merged.map(r => [r.clord_id, r]));
      setRows(merged);
      setLastUpdate(new Date());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── WebSocket ───────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(`${WS_BASE}/ws/v1/fix/events`);
      wsRef.current = ws;
      setWsStatus('connecting');

      ws.onopen = () => setWsStatus('connected');
      ws.onclose = () => {
        setWsStatus('disconnected');
        setTimeout(connectWS, 5000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (evt) => {
        try {
          const raw = JSON.parse(evt.data as string) as Record<string, unknown>;
          const api = gridApiRef.current;

          // ── Helper: flash + update a row ──────────────────────
          const applyRowUpdate = (updated: OrderRow) => {
            const key = updated.clord_id;
            rowMapRef.current.set(key, updated);
            if (api) {
              api.applyTransactionAsync({ update: [updated] });
              setTimeout(() => {
                const row = rowMapRef.current.get(key);
                if (row) {
                  const cleared = { ...row, _statusFlash: false };
                  rowMapRef.current.set(key, cleared);
                  api.applyTransactionAsync({ update: [cleared] });
                }
              }, 800);
            }
            setLastUpdate(new Date());
          };

          // ── EXECUTION_REPORT ──────────────────────────────────
          if (raw.type === 'EXECUTION_REPORT') {
            const msg = raw as unknown as WSExecReport;
            const clord = msg.clord_id;
            const existing = rowMapRef.current.get(clord);
            if (!existing) return;

            const isRejected = msg.exec_type === '8';
            applyRowUpdate({
              ...existing,
              status: mapOrdStatus(msg.ord_status),
              exec_type: msg.exec_type ?? existing.exec_type,
              exec_id: msg.exec_id ?? existing.exec_id,
              last_px: msg.last_px != null ? msg.last_px : existing.last_px,
              avg_px: isRejected ? null : (msg.last_px != null ? msg.last_px : existing.avg_px),
              cum_qty: msg.cum_qty != null ? msg.cum_qty : existing.cum_qty,
              leaves_qty: msg.leaves_qty != null ? msg.leaves_qty : existing.leaves_qty,
              // Preserve rejection reason text from TE
              text: isRejected ? (msg.text ?? existing.text) : existing.text,
              last_update_ts: msg.timestamp_ms ?? existing.last_update_ts,
              _statusFlash: true,
            });
            return;
          }

          // ── ORDER_CANCEL_REJECT (35=9) ────────────────────────
          // A cancel request was refused. Find the original order by orig_clord_id (API doc §13).
          if (raw.type === 'ORDER_CANCEL_REJECT') {
            const msg = raw as unknown as WSCancelReject;
            // orig_clord_id references the original order that could not be cancelled
            const existing = rowMapRef.current.get(msg.orig_clord_id);
            if (!existing) return;

            const reason = cxlRejReasonLabel(msg.cxl_rej_reason);
            const reasonText = [msg.text, reason].filter(Boolean).join(' — ');
            applyRowUpdate({
              ...existing,
              // Order status stays as-is (cancel was rejected — order still live)
              status: mapOrdStatus(msg.ord_status) ?? existing.status,
              text: reasonText || existing.text,
              last_update_ts: msg.timestamp_ms ?? existing.last_update_ts,
              _statusFlash: true,
            });
            return;
          }

          // ── SESSION_REJECT (35=3) — protocol-level error ──────
          // Not tied to a specific order row. Surface as a dismissible banner.
          if (raw.type === 'SESSION_REJECT') {
            const msg = raw as unknown as WSSessionReject;
            const alert: SessionAlert = {
              id: `sr_${msg.timestamp_ms ?? Date.now()}`,
              lp_id: msg.lp_id,
              ref_msg_type: msg.ref_msg_type,
              text: msg.text ?? `Session reject: reason ${msg.reason ?? '?'}`,
              ts: msg.timestamp_ms ?? Date.now(),
            };
            setSessionAlerts(prev => [alert, ...prev].slice(0, 5)); // keep last 5
            setLastUpdate(new Date());
            return;
          }
        } catch { /* skip malformed frames */ }
      };
    } catch {
      setWsStatus('disconnected');
    }
  }, []);

  // ── Fetch FIX messages for a given order ───────────────────
  const fetchDetail = useCallback(async (order: OrderRow) => {
    setDetailLoading(true);
    setDetailMessages([]);
    try {
      const r = await fetch(
        `${API_BASE}/api/v1/fix/lp/${order.lp_id}/fix/messages/order/${encodeURIComponent(order.clord_id)}`
      );
      if (!r.ok) throw new Error('detail fetch failed');
      const d = await r.json() as { data?: { messages?: FIXMessage[] } };
      const msgs = d?.data?.messages ?? [];
      if (msgs.length > 0) {
        setDetailMessages(msgs);
      } else {
        setDetailMessages(buildMockFIXMessages(order));
      }
    } catch {
      setDetailMessages(buildMockFIXMessages(order));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Effects ──────────────────────────────────────────────────
  useEffect(() => {
    fetchLPs();
  }, [fetchLPs]);

  useEffect(() => {
    if (selectedLPs.size > 0) {
      fetchOrders([...selectedLPs], activeBook);
    }
  }, [selectedLPs, activeBook, fetchOrders]);

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, [connectWS]);

  // Close LP dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (lpDropRef.current && !lpDropRef.current.contains(e.target as Node)) {
        setLpDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── AG-Grid columns ──────────────────────────────────────────
  const colDefs = useMemo((): ColDef<OrderRow>[] => [
    {
      headerName: 'Time',
      field: 'created_ts',
      width: 155,
      pinned: 'left',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number>) => fmtTimestamp(p.value),
      sort: 'desc',
      sortIndex: 0,
    },
    {
      headerName: 'LP',
      field: 'lp_id',
      width: 80,
      cellRenderer: LPBadge,
    },
    {
      headerName: 'ClOrdID',
      field: 'clord_id',
      width: 190,
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#ffffff' },
      tooltipField: 'clord_id',
    },
    {
      headerName: 'LP Order ID',
      field: 'order_id',
      width: 130,
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#c8c8d0' },
    },
    {
      headerName: 'Symbol',
      field: 'symbol',
      width: 90,
      cellStyle: { fontWeight: 600, color: '#e8e8ea' },
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Side',
      field: 'side',
      width: 68,
      cellRenderer: SideCell,
    },
    {
      headerName: 'O/C',
      field: 'open_close',
      width: 72,
      cellRenderer: OcCell,
      headerTooltip: 'Open / Close (FIX tag 77)',
    },
    {
      headerName: 'Type',
      field: 'product_type',
      width: 68,
      cellStyle: { color: '#e8e8ea', fontSize: 10 },
      headerTooltip: 'Product type (TE tag 20017)',
    },
    {
      headerName: 'Ord Type',
      field: 'order_type',
      width: 88,
      cellStyle: { color: '#ffffff', fontSize: 11 },
    },
    {
      headerName: 'TIF',
      field: 'time_in_force',
      width: 60,
      cellStyle: { color: '#e8e8ea', fontSize: 10 },
    },
    {
      headerName: 'Quantity',
      field: 'quantity',
      width: 100,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number>) => fmtQty(p.value),
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#ffffff' },
    },
    {
      headerName: 'Limit Px',
      field: 'limit_price',
      width: 95,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number | null>) =>
        p.value != null ? fmtPrice(p.value, p.data?.symbol) : '—',
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#e8e8ea' },
    },
    {
      headerName: 'Fill Px',
      field: 'avg_px',
      width: 95,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number | null>) =>
        p.value != null ? fmtPrice(p.value, p.data?.symbol) : '—',
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#4ade80' },
    },
    {
      headerName: 'Cum Qty',
      field: 'cum_qty',
      width: 95,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number>) => fmtQty(p.value),
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#86efac' },
    },
    {
      headerName: 'Leaves Qty',
      field: 'leaves_qty',
      width: 98,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number>) =>
        p.value > 0 ? fmtQty(p.value) : '—',
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#fbbf24' },
    },
    {
      headerName: 'SL',
      field: 'stop_loss',
      width: 88,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number | null>) =>
        p.value != null ? fmtPrice(p.value, p.data?.symbol) : '—',
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#f87171' },
      headerTooltip: 'Stop Loss (TE tag 18205)',
    },
    {
      headerName: 'TP',
      field: 'take_profit',
      width: 88,
      type: 'numericColumn',
      valueFormatter: (p: ValueFormatterParams<OrderRow, number | null>) =>
        p.value != null ? fmtPrice(p.value, p.data?.symbol) : '—',
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', color: '#4ecdc4' },
      headerTooltip: 'Take Profit (TE tag 18206)',
    },
    {
      headerName: 'ExecType',
      field: 'exec_type',
      width: 110,
      valueFormatter: (p: ValueFormatterParams<OrderRow, string>) =>
        p.value ? execTypeLabel(p.value) : '—',
      cellStyle: { color: '#e8e8ea', fontSize: 10 },
    },
    {
      headerName: 'Status',
      field: 'status',
      width: 110,
      pinned: 'right',
      cellRenderer: StatusCell,
      filter: 'agSetColumnFilter',
    },
    {
      headerName: 'ExecID',
      field: 'exec_id',
      width: 155,
      cellStyle: { fontFamily: '"IBM Plex Mono", monospace', fontSize: 10, color: '#c8c8d0' },
      tooltipField: 'exec_id',
    },
    {
      headerName: 'Reject Text',
      field: 'text',
      flex: 1,
      minWidth: 150,
      cellStyle: { color: '#f87171', fontSize: 11 },
      tooltipField: 'text',
    },
    {
      headerName: 'Updated',
      field: 'last_update_ts',
      width: 140,
      valueFormatter: (p: ValueFormatterParams<OrderRow, number>) => fmtTimestamp(p.value),
      cellStyle: { color: '#9090a0', fontSize: 10 },
    },
  ], []);

  const defaultColDef = useMemo<ColDef<OrderRow>>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
    suppressMenu: false,
    menuTabs: ['filterMenuTab'],
  }), []);

  // ── Context menu ─────────────────────────────────────────────
  const getContextMenuItems = useCallback((
    params: GetContextMenuItemsParams<OrderRow>
  ): (MenuItemDef | string)[] => {
    const row = params.node?.data;
    if (!row) return ['copy'];
    return [
      {
        name: 'View FIX Messages',
        action: () => { setSelectedOrder(row); fetchDetail(row); },
      },
      {
        name: 'Copy ClOrdID',
        action: () => navigator.clipboard.writeText(row.clord_id),
      },
      {
        name: 'Copy LP Order ID',
        action: () => row.order_id && navigator.clipboard.writeText(row.order_id),
        disabled: !row.order_id,
      },
      'separator',
      'copy',
      'copyWithHeaders',
      'export',
    ];
  }, [fetchDetail]);

  // ── Derived / filtered data ──────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = rows;
    if (symbolFilter) {
      const sf = symbolFilter.toUpperCase();
      r = r.filter(row => row.symbol.includes(sf) || row.canonical_symbol.includes(sf));
    }
    if (statusFilter) {
      r = r.filter(row => row.status === statusFilter);
    }
    return r;
  }, [rows, symbolFilter, statusFilter]);

  // ── Render ────────────────────────────────────────────────────
  const wsColor = wsStatus === 'connected' ? '#4ade80'
    : wsStatus === 'connecting' ? '#fbbf24' : '#f87171';
  const wsLabel = wsStatus === 'connected' ? 'Live'
    : wsStatus === 'connecting' ? 'Connecting…' : 'Offline';

  return (
    <div
      className="flex flex-col"
      style={{ height: '100%', backgroundColor: '#131315', color: '#e8e8ea', overflow: 'hidden' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-4 px-4 py-2.5 border-b"
        style={{ borderColor: '#2a2a2e', backgroundColor: '#1a1a1e', height: 50 }}
      >
        {/* Page title */}
        <div>
          <span className="text-sm font-semibold tracking-wide text-white">FIX Blotter</span>
        </div>

        {/* A / C Book Toggle */}
        <div
          className="flex rounded overflow-hidden border"
          style={{ borderColor: '#2a2a2e' }}
        >
          {(['A-Book', 'C-Book'] as BookTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveBook(tab)}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: activeBook === tab ? '#4ecdc4' : '#1e1e20',
                color: activeBook === tab ? '#0d0d0f' : '#9090a0',
                borderRight: tab === 'A-Book' ? '1px solid #2a2a2e' : undefined,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* LP selector */}
        <div className="relative" ref={lpDropRef}>
          <button
            onClick={() => setLpDropOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-medium"
            style={{ borderColor: '#4a4a56', backgroundColor: '#1e1e20', color: '#ffffff', minWidth: 220 }}
          >
            <span className="flex-1 text-left">
              {selectedLPs.size === 0
                ? 'Select LP…'
                : selectedLPs.size === 1
                  ? (allLPs.find(l => l.lp_id === [...selectedLPs][0])?.lp_name ?? [...selectedLPs][0])
                  : `${selectedLPs.size} LPs selected`}
            </span>
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10" className="flex-shrink-0 ml-1">
              <path d="M12,17a2,2,0,0,1-1.41-.59l-7-7A2,2,0,0,1,6.41,6.59L12,12.17l5.59-5.58A2,2,0,0,1,20.41,9.41l-7,7A2,2,0,0,1,12,17Z"/>
            </svg>
          </button>
          {lpDropOpen && (
            <div
              className="absolute top-8 left-0 z-50 rounded border shadow-xl py-1"
              style={{ backgroundColor: '#1e1e20', borderColor: '#4a4a56', minWidth: 260 }}
            >
              {allLPs.length === 0 && (
                <div className="px-3 py-2 text-xs text-[#9090a0]">No LPs configured</div>
              )}
              {allLPs.map(lp => (
                <button
                  key={lp.lp_id}
                  onClick={() => {
                    setSelectedLPs(prev => {
                      const next = new Set(prev);
                      if (next.has(lp.lp_id)) next.delete(lp.lp_id);
                      else next.add(lp.lp_id);
                      return next;
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-[#2a2a2e] transition-colors text-left"
                >
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0 border"
                    style={{
                      backgroundColor: selectedLPs.has(lp.lp_id) ? '#4ecdc4' : 'transparent',
                      borderColor: selectedLPs.has(lp.lp_id) ? '#4ecdc4' : '#4b5563',
                    }}
                  />
                  <span className="flex-1 text-white font-medium">{lp.lp_name || lp.lp_id}</span>
                  <span
                    className="text-[10px] px-1 rounded"
                    style={{
                      backgroundColor: lp.state === 'CONNECTED' ? '#16a34a22' : '#dc262622',
                      color: lp.state === 'CONNECTED' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {lp.state}
                  </span>
                </button>
              ))}
              <div className="border-t mt-1 pt-1" style={{ borderColor: '#2a2a2e' }}>
                <button
                  onClick={() => setSelectedLPs(new Set(allLPs.map(l => l.lp_id)))}
                  className="w-full px-3 py-1 text-[10px] text-[#4ecdc4] hover:text-white text-left"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedLPs(new Set())}
                  className="w-full px-3 py-1 text-[10px] text-[#9090a0] hover:text-white text-left"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Symbol filter */}
        <input
          type="text"
          placeholder="Symbol…"
          value={symbolFilter}
          onChange={e => setSymbolFilter(e.target.value)}
          className="px-2 py-1 text-xs rounded border bg-transparent outline-none w-24"
          style={{ borderColor: '#4a4a56', color: '#e8e8ea' }}
        />

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as OrdStatus | '')}
          className="px-2 py-1 text-xs rounded border bg-[#1e1e20] outline-none"
          style={{ borderColor: '#4a4a56', color: '#e8e8ea' }}
        >
          {(['NEW', 'PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'CANCELLED', 'PENDING_NEW'] as OrdStatus[]).map(s => (
            <option key={s} value={s}>{ordStatusLabel(s)}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Row count */}
        <span className="text-[11px] text-[#c8c8d0]">
          {filteredRows.length.toLocaleString()} orders
        </span>

        {/* Refresh */}
        <button
          onClick={() => fetchOrders([...selectedLPs], activeBook)}
          disabled={loading}
          className="p-1.5 rounded border transition-colors"
          style={{ borderColor: '#2a2a2e', backgroundColor: '#1e1e20', color: '#e8e8ea' }}
          title="Refresh"
        >
          <svg
            viewBox="0 0 24 24" fill="currentColor" width="13" height="13"
            className={loading ? 'animate-spin' : ''}
          >
            <path d="M23,12c0,6.07-4.93,11-11,11S1,18.07,1,12,5.93,1,12,1c2.93,0,5.62,1.14,7.62,3H16c-.55,0-1,.45-1,1s.45,1,1,1h5c.55,0,1-.45,1-1V0c0-.55-.45-1-1-1s-1,.45-1,1v2.46C17.65,0.89,14.93,0,12,0,5.37,0,0,5.37,0,12s5.37,12,12,12,12-5.37,12-12c0-.55-.45-1-1-1s-1,.45-1,1Z"/>
          </svg>
        </button>

        {/* WebSocket status */}
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: wsColor }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wsColor }} />
          {wsLabel}
        </div>

        {/* Last update */}
        {lastUpdate && (
          <span className="text-[10px] text-[#8a8a98]">
            {lastUpdate.toLocaleTimeString('en-GB')}
          </span>
        )}
      </div>

      {/* ── Session Reject Alerts ────────────────────────────── */}
      {sessionAlerts.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 space-y-1" style={{ backgroundColor: '#1a1a1e', borderBottom: '1px solid #2a2a2e' }}>
          {sessionAlerts.map(alert => (
            <div
              key={alert.id}
              className="flex items-start gap-2 text-[11px] rounded px-2.5 py-1.5"
              style={{ backgroundColor: '#2a1510', border: '1px solid #6a2e1a' }}
            >
              <span className="flex-shrink-0 font-bold" style={{ color: '#fb923c' }}>
                ⚠ SESSION REJECT
              </span>
              {alert.ref_msg_type && (
                <span style={{ color: '#fb923c' }}>
                  [35={alert.ref_msg_type}]
                </span>
              )}
              <span className="flex-1 font-mono" style={{ color: '#fbd38d' }}>
                {alert.text}
              </span>
              <span className="flex-shrink-0" style={{ color: '#9090a0' }}>
                {alert.lp_id.replace('traderevolution', 'TE')} · {new Date(alert.ts).toLocaleTimeString('en-GB')}
              </span>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="flex-shrink-0 ml-1 hover:opacity-70"
                style={{ color: '#9090a0' }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Fetch Error Banner ──────────────────────────────────── */}
      {fetchError && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-[11px]"
          style={{ backgroundColor: '#1a1218', borderBottom: '1px solid #5a1a2a' }}
        >
          <span className="font-bold flex-shrink-0" style={{ color: '#f87171' }}>⚠ ORDER FETCH ERROR</span>
          <span className="flex-1 font-mono" style={{ color: '#fca5a5' }}>{fetchError}</span>
          <button
            onClick={() => setFetchError(null)}
            className="flex-shrink-0 hover:opacity-70"
            style={{ color: '#9090a0' }}
          >✕</button>
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {selectedLPs.size === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl opacity-20">⬡</span>
              <span className="text-xs text-[#6a6a78]">Select an LP above to load orders</span>
            </div>
          </div>
        )}
        <AgGridReact<OrderRow>
          theme={gridTheme}
          rowData={filteredRows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={p => p.data.id}
          rowSelection="single"
          animateRows={true}
          enableCellChangeFlash={true}
          cellFlashDuration={600}
          suppressRowClickSelection={false}
          onGridReady={(e: GridReadyEvent<OrderRow>) => {
            gridApiRef.current = e.api;
          }}
          onFirstDataRendered={(e) => {
            e.api.autoSizeAllColumns();
          }}
          onRowDataUpdated={(e) => {
            e.api.autoSizeAllColumns();
          }}
          autoSizeStrategy={{ type: 'fitCellContents' }}
          onRowClicked={e => {
            if (!e.data) return;
            setSelectedOrder(e.data);
            fetchDetail(e.data);
          }}
          getContextMenuItems={getContextMenuItems}
          tooltipShowDelay={300}
          enableRangeSelection={true}
          rowHeight={28}
          headerHeight={32}
          loadingOverlayComponent={() => (
            <div className="flex items-center gap-2 text-sm text-[#c8c8d0]">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className="animate-spin">
                <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
                <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"/>
              </svg>
              Loading orders…
            </div>
          )}
          loading={loading && filteredRows.length === 0}
        />
      </div>

      {/* ── Status bar ──────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-4 px-4 text-[10px] border-t"
        style={{ borderColor: '#2a2a2e', backgroundColor: '#131315', height: 24, color: '#9090a0' }}
      >
        <span>
          Book: <span className="text-[#4ecdc4] font-semibold">{activeBook}</span>
        </span>
        <span>•</span>
        <span>LPs: {[...selectedLPs].join(', ') || '—'}</span>
        <span>•</span>
        <span>Past 24 h + session</span>
        <span>•</span>
        <span>FIX Audit Trail: Section 11 (v2.0)</span>
        <div className="flex-1" />
        <span>
          WS EXECUTION_REPORT → Status column (keyed by ClOrdID)
        </span>
      </div>

      {/* ── FIX Message Detail Drawer ────────────────────────────── */}
      {selectedOrder && (
        <div
          className="fixed inset-y-0 right-0 z-50 flex"
          style={{ pointerEvents: 'none' }}
        >
          {/* Backdrop */}
          <div
            className="flex-1"
            style={{ pointerEvents: 'auto' }}
            onClick={() => setSelectedOrder(null)}
          />
          {/* Panel */}
          <div
            className="flex-shrink-0 flex flex-col border-l"
            style={{
              width: 520,
              backgroundColor: '#131315',
              borderColor: '#2a2a2e',
              pointerEvents: 'auto',
            }}
          >
            {/* Drawer header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
              style={{ borderColor: '#2a2a2e', backgroundColor: '#1a1a1e' }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">FIX Message Lifecycle</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ backgroundColor: `${statusColor(selectedOrder.status)}18`, color: statusColor(selectedOrder.status) }}
                  >
                    {ordStatusLabel(selectedOrder.status)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs font-semibold" style={{ color: sideColor(selectedOrder.side) }}>
                    {selectedOrder.side}
                  </span>
                  <span className="text-xs text-white font-semibold">{selectedOrder.symbol}</span>
                  <span className="text-[10px] text-[#c8c8d0]">
                    {fmtQty(selectedOrder.quantity)} @ {fmtPrice(selectedOrder.avg_px ?? selectedOrder.limit_price, selectedOrder.symbol) || 'MKT'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded hover:bg-[#2a2a2e] transition-colors text-[#c8c8d0]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/>
                </svg>
              </button>
            </div>

            {/* Order summary grid */}
            <div
              className="flex-shrink-0 px-4 py-3 border-b grid grid-cols-3 gap-2"
              style={{ borderColor: '#2a2a2e', backgroundColor: '#1a1a1e' }}
            >
              {[
                { label: 'ClOrdID', value: selectedOrder.clord_id, mono: true, span: 3 },
                { label: 'LP Order ID', value: selectedOrder.order_id || '—', mono: true },
                { label: 'LP', value: selectedOrder.lp_id.replace('traderevolution', 'TE'), mono: false },
                { label: 'Book', value: activeBook, mono: false },
                { label: 'Order Type', value: selectedOrder.order_type || '—', mono: false },
                { label: 'TIF', value: selectedOrder.time_in_force || '—', mono: false },
                { label: 'Open/Close', value: selectedOrder.open_close === 'O' ? 'OPEN' : selectedOrder.open_close === 'C' ? 'CLOSE' : '—', mono: false },
                { label: 'Product', value: selectedOrder.product_type || '—', mono: false },
                { label: 'ExecID', value: selectedOrder.exec_id || '—', mono: true },
                { label: 'SL', value: fmtPrice(selectedOrder.stop_loss, selectedOrder.symbol) || '—', mono: true },
                { label: 'TP', value: fmtPrice(selectedOrder.take_profit, selectedOrder.symbol) || '—', mono: true },
                { label: 'Fill Px', value: fmtPrice(selectedOrder.avg_px, selectedOrder.symbol) || '—', mono: true },
              ].map(({ label, value, mono, span }) => (
                <div key={label} className={clsx(span === 3 ? 'col-span-3' : '')}>
                  <div className="text-[9px] uppercase tracking-wider text-[#8a8a98] mb-0.5">{label}</div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: '#ffffff', fontFamily: mono ? '"IBM Plex Mono", monospace' : undefined }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Reject reason (if any) */}
            {selectedOrder.text && (
              <div
                className="flex-shrink-0 flex items-start gap-2 px-4 py-2 border-b text-xs"
                style={{ borderColor: '#2a2a2e', backgroundColor: '#2a1515', color: '#f87171' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" className="flex-shrink-0 mt-0.5">
                  <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10,10-4.48,10-10S17.52,2,12,2Zm1,15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/>
                </svg>
                {selectedOrder.text}
              </div>
            )}

            {/* FIX messages */}
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              <div
                className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold border-b"
                style={{ borderColor: '#2a2a2e', color: '#9090a0', backgroundColor: '#1a1a1e' }}
              >
                FIX Message Trail — {detailMessages.length} message{detailMessages.length !== 1 ? 's' : ''}
                {detailLoading && <span className="ml-2 text-[#4ecdc4]">Loading…</span>}
              </div>

              <div className="px-4 py-3 space-y-3">
                {detailMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className="rounded border overflow-hidden"
                    style={{ borderColor: '#2a2a2e' }}
                  >
                    {/* Message header */}
                    <div
                      className="flex items-center justify-between px-3 py-2"
                      style={{ backgroundColor: '#1e1e22' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: msgTypeColor(msg.msg_type) }}
                        />
                        <span
                          className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${msgTypeColor(msg.msg_type)}18`,
                            color: msgTypeColor(msg.msg_type),
                          }}
                        >
                          35={msg.msg_type}
                        </span>
                        <span className="text-[11px] text-white font-medium">{msg.msg_type_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {directionIcon(msg.direction)}
                        <span className="text-[10px] font-mono text-[#9090a0]">
                          Seq #{msg.seq_num}
                        </span>
                        <span className="text-[10px] font-mono text-[#8a8a98]">
                          {msg.timestamp}
                        </span>
                      </div>
                    </div>

                    {/* Parsed fields */}
                    {msg.parsed && Object.keys(msg.parsed).length > 0 && (
                      <div
                        className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1"
                        style={{ backgroundColor: '#17171b' }}
                      >
                        {Object.entries(msg.parsed).map(([k, v]) => (
                          <div key={k} className="flex gap-1 text-[10px]">
                            <span className="text-[#8a8a98] flex-shrink-0 w-20 truncate">{k}</span>
                            <span className="text-white font-mono">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Raw message toggle */}
                    <div style={{ backgroundColor: '#17171b' }}>
                      <button
                        onClick={() => setRawMsgVisible(v => v === idx ? null : idx)}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] border-t transition-colors hover:bg-[#1e1e22]"
                        style={{ borderColor: '#2a2a2e', color: '#9090a0' }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                          <path d="M8.707,13.707a1,1,0,0,1-1.414-1.414l3-3a1,1,0,0,1,1.414,0l3,3a1,1,0,0,1-1.414,1.414L11,11.414Z"/>
                        </svg>
                        {rawMsgVisible === idx ? 'Hide raw FIX' : 'Show raw FIX'}
                      </button>
                      {rawMsgVisible === idx && (
                        <div
                          className="px-3 pb-3 pt-1 font-mono text-[10px] break-all leading-5"
                          style={{ color: '#4ecdc4', backgroundColor: '#0e0e10' }}
                        >
                          {msg.raw.split('|').filter(Boolean).map((field, fi) => (
                            <span key={fi}>
                              <span className="text-[#4a4a5a]">{fi > 0 ? ' | ' : ''}</span>
                              <span>{field}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {!detailLoading && detailMessages.length === 0 && (
                  <div className="text-center py-8 text-xs text-[#9090a0]">
                    No FIX messages found for this order
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t"
              style={{ borderColor: '#2a2a2e', backgroundColor: '#1a1a1e' }}
            >
              <button
                onClick={() => fetchDetail(selectedOrder)}
                className="text-[10px] text-[#4ecdc4] hover:text-white transition-colors"
              >
                Reload messages
              </button>
              <button
                onClick={() => {
                  const text = detailMessages.map(m =>
                    `[${m.direction.toUpperCase()}] 35=${m.msg_type} ${m.msg_type_name} @${m.timestamp}\n${m.raw}`
                  ).join('\n\n');
                  navigator.clipboard.writeText(text);
                }}
                className="text-[10px] text-[#9090a0] hover:text-white transition-colors"
              >
                Copy all raw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExecutionReportPage;