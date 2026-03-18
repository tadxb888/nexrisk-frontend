import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  ColGroupDef,
  GridOptions,
  RowSelectionOptions,
  ValueFormatterParams,
  GetContextMenuItemsParams,
  MenuItemDef,
  GridReadyEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';

// ══════════════════════════════════════════════════════════════
// THEME — identical to BBookPage
// ══════════════════════════════════════════════════════════════
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#313032',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 14,
});

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const DUMMY_USER = 'Manager';
const WS_MAX_RETRIES = 8;

// ── Icons ──────────────────────────────────────────────────────
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════
// TE publishes TRADE_CAPTURE_REPORT (35=AE) for every fill — not 35=8.
// Shape: { type, lp_id, data: TradeInfo.ToJson() }
interface TradeCaptureWsEvent {
  type: 'TRADE_CAPTURE_REPORT';
  lp_id: string;
  data: {
    trade_report_id: string;  // tag 571 — our row key
    order_id: string;         // tag 37  — TE order ID
    exec_id: string;
    symbol: string;           // tag 55
    side: string;             // "BUY" | "SELL" — already mapped in C++
    last_qty: number;         // tag 32
    last_px: number;          // tag 31
    account: string;          // tag 1
    transact_time: string;    // tag 60 — FIX format YYYYMMDD-HH:MM:SS.mmm
    security_exchange: string;// tag 207
    ex_destination: string;   // tag 100
    security_id: string;      // tag 48
    canonical_symbol: string;
    trd_type: number;
    commission: number;
    received_ts: number;      // epoch ms
    // Correlated by C++ LookupNOS — present when DB lookup succeeded
    cl_ord_id?: string;       // tag 11 — our ClOrdID
    nos_sent_ms?: number;     // real UTC epoch ms when NOS was sent
  };
}

// NOS_SENT — published by BuildAndSendNOS, but nexrisk_service overwrites
// the type to EXECUTION_REPORT for all events on the "execution" ZMQ topic.
interface NosWsEvent {
  type: 'EXECUTION_REPORT';
  lp_id: string;
  cl_ord_id: string;
  symbol: string;
  side: string;
  qty: number;
  ord_type: string;
  tif: string;
  timestamp_ms: number;
}

export interface ExecutionReportRow {
  // Primary key — TE trade report ID (tag 571)
  trade_report_id: string;
  // Correlated from NOS (matched by symbol+side+time within 500ms window)
  clord_id: string;         // tag 11 — empty if NOS not yet correlated
  nos_time: string;         // ":ss.mmm" or "—"
  round_trip_ms: number | null;
  // Status — always FILLED for AE; PENDING if NOS sent but no AE yet
  te_status: 'FILLED' | 'PENDING' | 'UNKNOWN';
  user: string;
  order_id: string;         // tag 37 — TE order ID
  exec_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  ord_type: 'MKT' | 'LMT' | 'STP' | 'STPLMT';
  tif: 'GTC' | 'DAY' | 'IOC' | 'FOK' | 'GTD';
  order_qty: number;        // from NOS tag 38
  fill_px: number;          // tag 31
  fill_qty: number;         // tag 32
  commission: number;       // tag 12
  route: string;            // tag 100
  security_exchange: string;// tag 207
  security_id: string;      // tag 48
  settl_date: string;       // tag 64
  account: string;          // tag 1
  transact_time: string;    // tag 60 — FIX format
  lp_id: string;
}

interface LPStatus {
  lp_id: string;
  lp_name?: string;
  trading_session?: string;
  state?: string;
}

interface FIXPosition {
  position_id?: string;
  side?: 'LONG' | 'SHORT';
  net_qty?: number;
  [key: string]: unknown;
}

type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

const WS_BADGE: Record<WsStatus, { color: string; label: string }> = {
  connecting:   { color: '#e0a020', label: 'Connecting…'   },
  live:         { color: '#66e07a', label: 'Live'           },
  reconnecting: { color: '#e0a020', label: 'Reconnecting…' },
  error:        { color: '#ff6b6b', label: 'Disconnected'  },
};

// ══════════════════════════════════════════════════════════════
// LOOKUP / DECODE
// ══════════════════════════════════════════════════════════════
function mapOrdType(code?: string): ExecutionReportRow['ord_type'] {
  const map: Record<string, ExecutionReportRow['ord_type']> = {
    '1': 'MKT', '2': 'LMT', '3': 'STP', '4': 'STPLMT',
  };
  return map[code ?? ''] ?? 'MKT';
}

function mapTIF(code?: string): ExecutionReportRow['tif'] {
  const map: Record<string, ExecutionReportRow['tif']> = {
    '0': 'DAY', '1': 'GTC', '3': 'IOC', '4': 'FOK', '6': 'GTD',
  };
  return map[code ?? ''] ?? 'GTC';
}

// ══════════════════════════════════════════════════════════════
// TIMESTAMP HELPERS
// ══════════════════════════════════════════════════════════════
function parseTimestamp(ts: string): number {
  // FIX format: YYYYMMDD-HH:MM:SS.mmm
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return 0;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`).getTime();
}

function formatSsMs(ts: string): string {
  // Extract ":ss.mmm" from full FIX timestamp
  const match = ts.match(/:(\d{2}\.\d{3})/);
  return match ? `:${match[1]}` : ts;
}

// Convert epoch ms → FIX timestamp string (YYYYMMDD-HH:MM:SS.mmm)
// Used to normalise the C++ timestamp_ms field so buildRow / formatSsMs work
function msToFixTimestamp(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => n.toString().padStart(2, '0');
  const p3 = (n: number) => n.toString().padStart(3, '0');
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `-${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}` +
    `.${p3(d.getUTCMilliseconds())}`
  );
}

// ══════════════════════════════════════════════════════════════
// NOS TRACKER — pending orders waiting for AE correlation
// key: `${symbol}|${side}` → most recent NOS for that symbol+side
// ══════════════════════════════════════════════════════════════
interface NosRecord {
  clord_id: string;
  symbol: string;
  side: string;       // "BUY" | "SELL"
  order_qty: number;
  ord_type: string;   // FIX tag 40 code
  tif: string;        // FIX tag 59 code
  nos_ts: number;     // epoch ms
}

// Build a grid row from a TRADE_CAPTURE_REPORT (35=AE) event.
// nosRecord: correlated NOS from nosMap, or null if not yet received.
function buildRowFromAE(
  ae: TradeCaptureWsEvent['data'],
  lp_id: string,
  nosRecord: NosRecord | null
): ExecutionReportRow {
  // Prefer DB-correlated fields embedded by C++ LookupNOS — these are reliable.
  // Fall back to in-memory nosRecord (symbol|side map) when DB unavailable.
  const corr_clord_id  = ae.cl_ord_id   || nosRecord?.clord_id  || '';
  const corr_nos_ts    = ae.nos_sent_ms  ?? nosRecord?.nos_ts    ?? null;

  // RT: both nos_sent_ms and received_ts are NexRisk internal epoch ms.
  // For historical rows received_ts = timestamp_ms from audit DB.
  // Only compute RT when NOS was sent before the fill and within 60s.
  const fill_ts = ae.received_ts || 0;
  const round_trip_ms  = (corr_nos_ts && fill_ts && fill_ts > corr_nos_ts && (fill_ts - corr_nos_ts) < 60000)
    ? (fill_ts - corr_nos_ts)
    : null;

  return {
    trade_report_id: ae.trade_report_id,
    clord_id:        corr_clord_id,
    nos_time:        corr_nos_ts ? formatSsMs(msToFixTimestamp(corr_nos_ts)) : '—',
    round_trip_ms,
    te_status:       'FILLED',
    user:            DUMMY_USER,
    order_id:        ae.order_id,
    exec_id:         ae.exec_id,
    symbol:          ae.symbol,
    side:            ae.side === 'SELL' ? 'SELL' : 'BUY',
    ord_type:        nosRecord ? mapOrdType(nosRecord.ord_type) : 'MKT',
    tif:             nosRecord ? mapTIF(nosRecord.tif)          : 'GTC',
    order_qty:       nosRecord?.order_qty ?? 0,
    fill_px:         ae.last_px,
    fill_qty:        ae.last_qty,
    commission:      ae.commission,
    route:           ae.ex_destination,
    security_exchange: ae.security_exchange,
    security_id:     ae.security_id,
    settl_date:      '',   // not in AE from TE
    account:         ae.account,
    transact_time:   ae.transact_time,
    lp_id,
  };
}

// Build a PENDING row when we've sent a NOS but no AE received yet
function buildPendingRow(nos: NosRecord, lp_id: string): ExecutionReportRow {
  return {
    trade_report_id: `pending_${nos.clord_id}`,
    clord_id:        nos.clord_id,
    nos_time:        formatSsMs(msToFixTimestamp(nos.nos_ts)),
    round_trip_ms:   null,
    te_status:       'PENDING',
    user:            DUMMY_USER,
    order_id:        '',
    exec_id:         '',
    symbol:          nos.symbol,
    side:            nos.side === 'SELL' ? 'SELL' : 'BUY',
    ord_type:        mapOrdType(nos.ord_type),
    tif:             mapTIF(nos.tif),
    order_qty:       nos.order_qty,
    fill_px:         0,
    fill_qty:        0,
    commission:      0,
    route:           '',
    security_exchange: '',
    security_id:     '',
    settl_date:      '',
    account:         '',
    transact_time:   msToFixTimestamp(nos.nos_ts),
    lp_id,
  };
}

// ══════════════════════════════════════════════════════════════
// SIDE PANEL — generateExplanation (replaceable with LLM later)
// ══════════════════════════════════════════════════════════════
function generateExplanation(row: ExecutionReportRow): string {
  const lines: string[] = [];

  lines.push('ORDER SUMMARY');
  lines.push(`Direction : ${row.side} ${row.order_qty > 0 ? row.order_qty.toLocaleString() : '—'} ${row.symbol} (${row.ord_type}, ${row.tif})`);
  lines.push(`Status    : ${row.te_status}`);

  if (row.te_status === 'PENDING') {
    lines.push('Order sent to TE — awaiting fill confirmation (35=AE).');
  } else {
    const fillPx = row.fill_px > 0 ? row.fill_px.toFixed(5) : '—';
    const fillQty = row.fill_qty > 0 ? row.fill_qty.toLocaleString() : '—';
    lines.push(`Fill Px   : ${fillPx}  (tag 31)`);
    lines.push(`Fill Qty  : ${fillQty}  (tag 32)`);
    if (row.commission > 0) lines.push(`Commission: ${row.commission}`);
  }

  lines.push('');
  lines.push('OUR REFERENCE');
  lines.push(`Trade Rpt ID: ${row.trade_report_id}  (tag 571)`);
  lines.push(`ClOrdID     : ${row.clord_id || '—'}  (tag 11 — correlated from NOS)`);
  lines.push(`TE OrderID  : ${row.order_id || '—'}  (tag 37)`);
  lines.push(`Submitted   : ${row.user}`);

  lines.push('');
  lines.push('ROUTING');
  lines.push(`Account   : ${row.account || '—'}  (tag 1)`);
  lines.push(`Route     : ${row.route || '—'}  (tag 100)`);
  lines.push(`Exchange  : ${row.security_exchange || '—'}  (tag 207)`);
  lines.push(`Security  : ${row.security_id || '—'}  (tag 48)`);

  lines.push('');
  lines.push('LIFECYCLE TIMING');
  lines.push(`NOS sent   : ${row.nos_time.padEnd(10)}  (we submitted the order)`);
  lines.push(`TE filled  : ${row.transact_time ? formatSsMs(row.transact_time) : '—'}  (35=AE received)`);
  lines.push(`Round trip : ${row.round_trip_ms !== null ? `${row.round_trip_ms}ms` : '—'}`);

  lines.push('');
  lines.push('TIME');
  lines.push(`Transact   : ${row.transact_time}  UTC`);

  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// LP SESSION STATE COLOR
// ══════════════════════════════════════════════════════════════
function lpStateColor(trading_session?: string): string {
  if (trading_session === 'LOGGED_ON')                                          return '#66e07a';
  if (trading_session === 'CONNECTING' || trading_session === 'RECONNECTING')   return '#e0a020';
  if (trading_session === 'DISCONNECTED')                                       return '#ff6b6b';
  return '#e0a020'; // unknown / stale initial state — amber, not red
}

// ══════════════════════════════════════════════════════════════
// VALUE FORMATTERS
// ══════════════════════════════════════════════════════════════
const fmtQty = (p: ValueFormatterParams) => {
  const v = p.value as number | null;
  if (v === null || v === undefined || v === 0) return '—';
  return Number(v).toLocaleString();
};

const fmtPx = (p: ValueFormatterParams) => {
  const v = p.value as number | null;
  if (v === null || v === undefined || v === 0) return '—';
  return Number(v).toFixed(5);
};

// ══════════════════════════════════════════════════════════════
// ANALYTICS CHART COMPONENTS
// ══════════════════════════════════════════════════════════════

// Returns true when transact_time (YYYYMMDD-HH:MM:SS.mmm) is from today (UTC).
function isTodayRow(transact_time: string): boolean {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return transact_time.startsWith(prefix);
}

// Muted, non-fluorescent palette — intentionally matches BBookCharts aesthetic.
const STATUS_COLORS: Record<string, string> = {
  FILLED:    '#4a7c5e',  // muted sage green
  REJECTED:  '#7c4a68',  // muted rose
  PENDING:   '#5c4d7d',  // muted purple
  CANCELLED: '#5a5a65',  // muted slate grey
};

// ── Tooltip sub-components (hoisted to module scope — no remount on re-render) ──

interface LatencyEntry { symbol: string; time: string }
function LatencyOverTimeTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: LatencyEntry }> }) {
  if (!active || !payload?.length) return null;
  const { value, payload: p } = payload[0];
  return (
    <div className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs">
      <p className="text-[#999]">{p.symbol} @ {p.time}</p>
      <p className="text-white font-mono font-semibold">{value}ms</p>
    </div>
  );
}

interface LPEntry { lp: string; min: number; avg: number; max: number }
function LatencyByLPTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: LPEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs">
      <p className="text-white font-medium mb-1">{d.lp}</p>
      <p style={{ color: '#4a7c5e' }}>Min: <span className="font-mono">{d.min}ms</span></p>
      <p style={{ color: '#7eaacb' }}>Avg: <span className="font-mono">{d.avg}ms</span></p>
      <p style={{ color: '#b87333' }}>Max: <span className="font-mono">{d.max}ms</span></p>
    </div>
  );
}

interface StatusEntry { name: string; value: number }
function OrdersByStatusTooltip({ active, payload, total }: { active?: boolean; payload?: Array<{ payload: StatusEntry }>; total: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
  return (
    <div className="bg-[#232225] border border-[#555] rounded px-2 py-1 text-xs">
      <p style={{ color: STATUS_COLORS[d.name] ?? '#999' }} className="font-medium">{d.name}</p>
      <p className="text-white font-mono">{d.value} <span className="text-[#999]">({pct}%)</span></p>
    </div>
  );
}

// ── 1. Execution Latency Over Time ─────────────────────────────
function LatencyOverTimeChart({ rows }: { rows: ExecutionReportRow[] }) {
  const data = useMemo(() => (
    rows
      .filter(r => r.round_trip_ms !== null && isTodayRow(r.transact_time))
      .map(r => ({
        time:   r.transact_time.slice(9, 17),  // HH:MM:SS
        rt:     r.round_trip_ms as number,
        symbol: r.symbol,
      }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-60)                               // cap at 60 most-recent fills
  ), [rows]);

  return (
    <div className="rounded p-2 flex flex-col overflow-hidden" style={{ backgroundColor: '#232225' }}>
      <div className="mb-1 shrink-0">
        <h4 className="text-xs font-semibold text-white">Latency Over Time</h4>
        <p className="text-[10px] text-[#bbb]">Round-trip ms · Today</p>
      </div>
      <ResponsiveContainer width="100%" height={192}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2e2e30" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#ddd' }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#ddd' }}
            tickLine={false}
            axisLine={false}
            unit="ms"
          />
          <Tooltip content={<LatencyOverTimeTooltip />} cursor={{ stroke: '#444' }} />
          <Line
            type="monotone"
            dataKey="rt"
            stroke="#577a9e"
            strokeWidth={1.5}
            dot={{ r: 3, fill: '#577a9e', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#7eaacb', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 2. Execution Latency by LP (stacked horizontal bar: min/avg-min/max-avg) ──
function LatencyByLPChart({ rows }: { rows: ExecutionReportRow[] }) {
  const data = useMemo(() => {
    const byLp: Record<string, number[]> = {};
    rows
      .filter(r => r.round_trip_ms !== null && isTodayRow(r.transact_time))
      .forEach(r => {
        if (!byLp[r.lp_id]) byLp[r.lp_id] = [];
        byLp[r.lp_id].push(r.round_trip_ms as number);
      });
    return Object.entries(byLp).map(([lp, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const min    = sorted[0];
      const max    = sorted[sorted.length - 1];
      const avg    = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      return {
        lp,
        minVal:   min,
        midRange: avg - min,
        topRange: max - avg,
        // raw values used by tooltip
        min, avg, max,
      };
    });
  }, [rows]);

  // Compute Y-axis width dynamically so no LP name is ever clipped
  const yAxisWidth = Math.min(140, Math.max(64, ...data.map(d => d.lp.length * 7)));

  return (
    <div className="rounded p-2 flex flex-col overflow-hidden" style={{ backgroundColor: '#232225' }}>
      <div className="mb-1 shrink-0">
        <h4 className="text-xs font-semibold text-white">Latency by LP</h4>
        <p className="text-[10px] text-[#bbb]">Min / Avg / Max RT · Today</p>
      </div>
      <ResponsiveContainer width="100%" height={168}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2e2e30" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#ddd' }}
            tickLine={false}
            axisLine={false}
            unit="ms"
          />
          <YAxis
            type="category"
            dataKey="lp"
            tick={{ fontSize: 10, fill: '#ddd' }}
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
          />
          <Tooltip content={<LatencyByLPTooltip />} cursor={{ fill: '#2a2a2c' }} />
          <Bar dataKey="minVal"   stackId="rt" fill="#4a7c5e" name="Min" radius={0}         />
          <Bar dataKey="midRange" stackId="rt" fill="#3d5a80" name="Avg" radius={0}         />
          <Bar dataKey="topRange" stackId="rt" fill="#b87333" name="Max" radius={[0,3,3,0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-3 mt-1 shrink-0">
        {([['Min', '#4a7c5e'], ['Avg', '#3d5a80'], ['Max', '#b87333']] as [string, string][]).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-white">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 3. Orders by Status (donut) ─────────────────────────────────
function OrdersByStatusChart({ rows }: { rows: ExecutionReportRow[] }) {
  const { data, total } = useMemo(() => {
    const counts: Record<string, number> = { FILLED: 0, REJECTED: 0, PENDING: 0, CANCELLED: 0 };
    rows
      .filter(r => isTodayRow(r.transact_time))
      .forEach(r => {
        if      (r.te_status === 'FILLED')  counts.FILLED++;
        else if (r.te_status === 'PENDING') counts.PENDING++;
        else                                counts.CANCELLED++;
      });
    const data  = Object.entries(counts).map(([name, value]) => ({ name, value }));
    const total = data.reduce((s, d) => s + d.value, 0);
    return { data, total };
  }, [rows]);

  // Pass total via closure into a wrapper so the Tooltip can access it
  const TooltipWithTotal = useMemo(
    () => (props: { active?: boolean; payload?: Array<{ payload: StatusEntry }> }) =>
      <OrdersByStatusTooltip {...props} total={total} />,
    [total],
  );

  return (
    <div className="rounded p-2 flex flex-col overflow-hidden" style={{ backgroundColor: '#232225' }}>
      <div className="mb-1 shrink-0">
        <h4 className="text-xs font-semibold text-white">Orders by Status</h4>
        <p className="text-[10px] text-[#bbb]">{total} orders · Today</p>
      </div>
      <ResponsiveContainer width="100%" height={162}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="42%"
            outerRadius="82%"
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#555'} />
            ))}
          </Pie>
          <Tooltip content={<TooltipWithTotal />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-1 shrink-0">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[item.name] ?? '#555' }} />
            <span className="text-[10px] text-white">
              {item.name}: <span className="font-semibold">{item.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Volume by Symbol (vertical bar) ──────────────────────────
function VolumeBySymbolChart({ rows }: { rows: ExecutionReportRow[] }) {
  const data = useMemo(() => {
    const bySymbol: Record<string, number> = {};
    rows
      .filter(r => isTodayRow(r.transact_time) && r.fill_qty > 0)
      .forEach(r => { bySymbol[r.symbol] = (bySymbol[r.symbol] || 0) + r.fill_qty; });
    return Object.entries(bySymbol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([symbol, vol]) => ({ symbol, vol }));
  }, [rows]);

  return (
    <div className="rounded p-2 flex flex-col overflow-hidden" style={{ backgroundColor: '#232225' }}>
      <div className="mb-1 shrink-0">
        <h4 className="text-xs font-semibold text-white">Volume by Symbol</h4>
        <p className="text-[10px] text-[#bbb]">Fill quantity · Today</p>
      </div>
      <ResponsiveContainer width="100%" height={215}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 24 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#2e2e30" vertical={false} />
          <XAxis
            dataKey="symbol"
            tick={{ fontSize: 10, fill: '#ddd', angle: -35, textAnchor: 'end' }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#ddd' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#232225', border: '1px solid #555', borderRadius: 4, fontSize: 11 }}
            formatter={(val: number) => [val.toLocaleString(), 'Volume']}
            labelStyle={{ color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            cursor={{ fill: '#2a2a2c' }}
          />
          <Bar dataKey="vol" fill="#5c4d7d" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════
export function ExecutionReportPage() {
  const gridRef = useRef<AgGridReact<ExecutionReportRow>>(null);

  // ── State ──────────────────────────────────────────────────
  const [rows,           setRows]           = useState<ExecutionReportRow[]>([]);
  const [lpStatuses,     setLpStatuses]     = useState<LPStatus[]>([]);
  const [positions,      setPositions]      = useState<FIXPosition[]>([]);
  const [wsStatus,       setWsStatus]       = useState<WsStatus>('connecting');
  const [wsError,        setWsError]        = useState<string | null>(null);
  const [lastEventAt,    setLastEventAt]    = useState<Date | null>(null);
  const [selectedRow,    setSelectedRow]    = useState<ExecutionReportRow | null>(null);
  const [copied,         setCopied]         = useState(false);
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  const [selectedLp,      setSelectedLp]      = useState<string>('all');

  // O(1) trade_report_id → row lookup for WS upserts
  const rowMapRef   = useRef<Map<string, ExecutionReportRow>>(new Map());
  // NOS correlation: symbol|side → most recent NOS within 500ms window
  const nosMapRef   = useRef<Map<string, NosRecord>>(new Map());
  const wsRef       = useRef<WebSocket | null>(null);
  const retryRef    = useRef(0);
  const mountedRef  = useRef(true);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep rowMapRef in sync whenever rows state changes
  useEffect(() => {
    const m = new Map<string, ExecutionReportRow>();
    for (const r of rows) m.set(r.trade_report_id, r);
    rowMapRef.current = m;
  }, [rows]);

  // ── One-shot historical load on mount ──────────────────────
  // Fetches today's fills from the DB-backed audit trail.
  // Runs once. No polling. Failures are silent — WS fills in going forward.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1. LP list — fetch all configured LPs (admin) merged with live session state
        // /api/v1/fix/admin/lp returns ALL LPs including disabled/disconnected ones
        // /api/v1/fix/status returns only currently running session states
        const [adminRes, statusRes] = await Promise.all([
          fetch('/api/v1/fix/admin/lp'),
          fetch('/api/v1/fix/status'),
        ]);
        if (cancelled) return;

        const adminData  = adminRes.ok  ? await adminRes.json()  : null;
        const statusData = statusRes.ok ? await statusRes.json() : null;

        // Build session state map from status response
        const rawLps = (statusData?.lps ?? statusData?.data?.lps ?? []) as Array<{ lp_id: string; state?: string; trading_session?: string }>;
        const stateMap = new Map<string, string>();
        if (Array.isArray(rawLps)) {
          rawLps.forEach(v => stateMap.set(v.lp_id, v.trading_session ?? v.state ?? ''));
        } else {
          Object.entries(rawLps as Record<string, Record<string, string>>).forEach(
            ([lp_id, v]) => stateMap.set(lp_id, v.trading_session ?? v.state ?? '')
          );
        }

        // All configured LPs as base, overlay live session state
        const configuredLps = (adminData?.data?.lps ?? adminData?.lps ?? []) as Array<{ lp_id: string; lp_name?: string; enabled?: boolean }>;
        // Any LP not in stateMap has no live session → DISCONNECTED
        const lps: LPStatus[] = configuredLps.length > 0
          ? configuredLps.map(lp => ({
              lp_id:           lp.lp_id,
              lp_name:         lp.lp_name,
              trading_session: stateMap.get(lp.lp_id) ?? 'DISCONNECTED',
            }))
          : rawLps.map(v => ({ lp_id: v.lp_id, trading_session: v.trading_session ?? v.state }));

        if (!cancelled) {
          setLpStatuses(lps);
          // Default selection to first LP if only one, else keep 'all'
          if (lps.length === 1) setSelectedLp(lps[0].lp_id);
        }

        // 2. For each LP fetch correlated fills (AE + NOS joined in DB)
        const seedRows: ExecutionReportRow[] = [];

        await Promise.allSettled(lps.map(async (lp) => {
          try {
            const url = `/api/v1/fix/lp/${lp.lp_id}/correlated-fills?limit=500`;
            let res = await fetch(url);
            // ZMQ command channel may not be ready immediately — retry once
            if (res.status === 503) {
              await new Promise(r => setTimeout(r, 3000));
              if (cancelled) return;
              res = await fetch(url);
            }
            if (!res.ok || cancelled) return;
            const data = await res.json();
            // Response shape: { success: true, data: [ { raw, msg_type, timestamp_ms, cl_ord_id, nos_sent_ms } ] }
            const messages: Array<{
              raw:         string;
              msg_type:    string;
              timestamp_ms:number;
              cl_ord_id:   string;
              nos_sent_ms: number;
            }> = data?.data ?? [];

            for (const msg of messages) {
              const raw: string   = msg.raw ?? '';
              const ts_ms: number = msg.timestamp_ms ?? 0;
              const fixTs = ts_ms ? msToFixTimestamp(ts_ms) : '';

              const get = (tag: number) =>
                raw.match(new RegExp(`(?:^|\\|)${tag}=([^|]+)`))?.[1] ?? '';

              const trade_report_id = get(571);
              if (!trade_report_id) continue;

              const symbol   = get(55);
              const sideCode = get(54);
              const side     = sideCode === '2' ? 'SELL' : 'BUY';

              const aeData: TradeCaptureWsEvent['data'] = {
                trade_report_id,
                order_id:          get(37),
                exec_id:           '',
                symbol,
                side,
                last_qty:          parseFloat(get(32) || '0'),
                last_px:           parseFloat(get(31) || '0'),
                account:           get(1),
                transact_time:     get(60) || fixTs,
                security_exchange: get(207),
                ex_destination:    get(100),
                security_id:       get(48),
                canonical_symbol:  '',
                trd_type:          0,
                commission:        parseFloat(get(12) || '0'),
                received_ts:       ts_ms,
                // Correlated fields from DB join — populated when NOS was matched
                cl_ord_id:         msg.cl_ord_id  || undefined,
                nos_sent_ms:       msg.nos_sent_ms || undefined,
              };

              seedRows.push(buildRowFromAE(aeData, lp.lp_id, null));
            }
          } catch { /* per-LP non-fatal */ }
        }));

        if (!cancelled && seedRows.length > 0) {
          seedRows.sort((a, b) =>
            parseTimestamp(b.transact_time) - parseTimestamp(a.transact_time)
          );
          setRows(seedRows);
          // Also push into grid — grid is transaction-driven, not bound to rowData
          gridRef.current?.api?.applyTransaction({ add: seedRows });
        }
      } catch { /* non-fatal */ }
    };

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebSocket ───────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    setWsStatus('connecting');
    setWsError(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/v1/fix/events`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setWsStatus('live');
      ws.send(JSON.stringify({ type: 'subscribe', topics: [''] }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        setLastEventAt(new Date());

        // ALL fixbridge execution events arrive as type:"EXECUTION_REPORT" because
        // nexrisk_service overwrites the type for everything on the execution ZMQ topic.
        // The original payload is always wrapped under msg.data by NexRiskService.cpp:1275.
        //
        // NOS_SENT shape:  { type:"EXECUTION_REPORT", lp_id, data:{ cl_ord_id, symbol, side, qty, ... } }
        // AE fill shape:   { type:"EXECUTION_REPORT", lp_id, data:{ trade_report_id, symbol, side, ... } }
        //
        // Distinguish by presence of cl_ord_id vs trade_report_id in msg.data.
        if (msg.type === 'EXECUTION_REPORT') {
          const lp_id   = msg.lp_id as string ?? '';
          const inner   = msg.data as Record<string, unknown> ?? {};

          // ── NOS sent outbound ──────────────────────────────────
          if (inner.cl_ord_id) {
            const nosRecord: NosRecord = {
              clord_id:  inner.cl_ord_id  as string,
              symbol:    inner.symbol     as string,
              side:      inner.side       as string,
              order_qty: inner.qty        as number ?? 0,
              ord_type:  (inner.ord_type as string) === 'LIMIT' ? '2' : (inner.ord_type as string) === 'STOP' ? '3' : '1',
              tif:       (inner.tif as string) === 'DAY' ? '0' : (inner.tif as string) === 'IOC' ? '3' : (inner.tif as string) === 'FOK' ? '4' : '1',
              nos_ts:    inner.timestamp_ms as number ?? Date.now(),
            };
            const key = `${nosRecord.symbol}|${nosRecord.side}`;
            nosMapRef.current.set(key, nosRecord);

            const pendingRow = buildPendingRow(nosRecord, lp_id);
            const existing = rowMapRef.current.get(pendingRow.trade_report_id);
            rowMapRef.current.set(pendingRow.trade_report_id, pendingRow);
            if (existing) {
              gridRef.current?.api?.applyTransaction({ update: [pendingRow] });
            } else {
              gridRef.current?.api?.applyTransaction({ add: [pendingRow], addIndex: 0 });
            }

          // ── AE fill from TE ────────────────────────────────────
          } else if (inner.trade_report_id) {
            const ae = inner as unknown as TradeCaptureWsEvent['data'];
            const key = `${ae.symbol}|${ae.side}`;
            const nosRecord = nosMapRef.current.get(key) ?? null;
            const ae_ts = parseTimestamp(ae.transact_time);
            const validNos = nosRecord && (ae_ts - nosRecord.nos_ts) < 5000 ? nosRecord : null;

            if (validNos) {
              const pendingKey = `pending_${validNos.clord_id}`;
              const pendingRow = rowMapRef.current.get(pendingKey);
              if (pendingRow) {
                rowMapRef.current.delete(pendingKey);
                gridRef.current?.api?.applyTransaction({ remove: [pendingRow] });
              }
              nosMapRef.current.delete(key);
            }

            const row = buildRowFromAE(ae, lp_id, validNos);
            const existing = rowMapRef.current.get(row.trade_report_id);
            rowMapRef.current.set(row.trade_report_id, row);
            if (existing) {
              gridRef.current?.api?.applyTransaction({ update: [row] });
            } else {
              gridRef.current?.api?.applyTransaction({ add: [row], addIndex: 0 });
            }
          }

        // ── TRADE_CAPTURE_REPORT — TE fill (35=AE) ───────────
        // Published on "trade" ZMQ topic → nexrisk_service sets type=TRADE_CAPTURE_REPORT
        // Fields are under msg.data (unwrapped from inner data by NexRiskService.cpp)
        } else if (msg.type === 'TRADE_CAPTURE_REPORT') {
          const ae = msg.data as unknown as TradeCaptureWsEvent['data'];
          if (!ae?.trade_report_id) return;

          const lp_id = msg.lp_id as string ?? '';
          const key = `${ae.symbol}|${ae.side}`;
          const nosRecord = nosMapRef.current.get(key) ?? null;
          const ae_ts = parseTimestamp(ae.transact_time);
          const validNos = nosRecord && (ae_ts - nosRecord.nos_ts) < 5000 ? nosRecord : null;

          if (validNos) {
            const pendingKey = `pending_${validNos.clord_id}`;
            const pendingRow = rowMapRef.current.get(pendingKey);
            if (pendingRow) {
              rowMapRef.current.delete(pendingKey);
              gridRef.current?.api?.applyTransaction({ remove: [pendingRow] });
            }
            nosMapRef.current.delete(key);
          }

          const row = buildRowFromAE(ae, lp_id, validNos);
          const existing = rowMapRef.current.get(row.trade_report_id);
          rowMapRef.current.set(row.trade_report_id, row);
          if (existing) {
            gridRef.current?.api?.applyTransaction({ update: [row] });
          } else {
            gridRef.current?.api?.applyTransaction({ add: [row], addIndex: 0 });
          }
        } else if (msg.type === 'SESSION_STATE_CHANGE' || msg.type === 'SESSION_LOGON' || msg.type === 'SESSION_LOGOUT') {
          const lp_id    = msg.lp_id as string | undefined;
          const newState = (msg.session_state ?? msg.state ?? (msg.type === 'SESSION_LOGON' ? 'LOGGED_ON' : 'DISCONNECTED')) as string;
          if (!lp_id) return;
          setLpStatuses(prev => {
            const exists = prev.some(lp => lp.lp_id === lp_id);
            if (exists) return prev.map(lp => lp.lp_id === lp_id ? { ...lp, trading_session: newState } : lp);
            return [...prev, { lp_id, trading_session: newState }];
          });

        // ── POSITION_REPORT ───────────────────────────────────
        } else if (msg.type === 'POSITION_REPORT') {
          const pos: FIXPosition = {
            position_id: msg.position_id as string,
            side:        msg.side as 'LONG' | 'SHORT',
            net_qty:     msg.net_qty as number,
          };
          if (!pos.position_id) return;
          setPositions(prev => {
            const idx = prev.findIndex(p => p.position_id === pos.position_id);
            if (idx >= 0) { const n = [...prev]; n[idx] = pos; return n; }
            return [...prev, pos];
          });

        // ── POSITION_CLOSED ───────────────────────────────────
        } else if (msg.type === 'POSITION_CLOSED') {
          const posId = (msg.data as Record<string, unknown>)?.position_id as string | undefined;
          if (!posId) return;
          setPositions(prev => prev.filter(p => p.position_id !== posId));
        }

      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      if (retryRef.current >= WS_MAX_RETRIES) {
        setWsStatus('error');
        setWsError('WebSocket disconnected. Click ↻ to reconnect.');
        return;
      }
      setWsStatus('reconnecting');
      const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
      retryRef.current++;
      timerRef.current = setTimeout(() => { if (mountedRef.current) connectWs(); }, delay);
    };

    ws.onerror = () => { ws.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    wsRef.current?.close();
    if (timerRef.current) clearTimeout(timerRef.current);
    connectWs();
  }, [connectWs]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // Escape key → close side panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRow(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Filtered rows (by selected LP) ─────────────────────────
  const filteredRows = useMemo(() =>
    selectedLp === 'all' ? rows : rows.filter(r => r.lp_id === selectedLp),
    [rows, selectedLp]
  );

  // ── Stats (derived from filtered rows) ──────────────────────
  const stats = useMemo(() => {
    const filled = filteredRows.filter(r => r.te_status === 'FILLED');
    const rts = filled
      .map(r => r.round_trip_ms)
      .filter((v): v is number => v !== null);
    const longCount  = filled.filter(r => r.side === 'BUY').length;
    const shortCount = filled.filter(r => r.side === 'SELL').length;
    const volume     = filled.reduce((s, r) => s + (r.fill_qty ?? 0), 0);

    return {
      positionCount:  filled.length,
      longCount,
      shortCount,
      volume,
      avgRt:          rts.length ? Math.round(rts.reduce((s, v) => s + v, 0) / rts.length) : null,
      bestRt:         rts.length ? Math.min(...rts)  : null,
      worstRt:        rts.length ? Math.max(...rts)  : null,
      rejectionCount: 0,
      rejectionPct:   0,
    };
  }, [filteredRows]);

  // ══════════════════════════════════════════════════════════════
  // COLUMN DEFINITIONS
  // ══════════════════════════════════════════════════════════════
  const columnDefs = useMemo<(ColDef<ExecutionReportRow> | ColGroupDef<ExecutionReportRow>)[]>(() => [

    // ── META ─────────────────────────────────────────────────────
    {
      headerName: 'Meta',
      children: [
        {
          field: 'lp_id',
          headerName: 'LP',
          headerTooltip: 'Liquidity Provider',
          width: 100,
          filter: 'agSetColumnFilter',
        },
        {
          field: 'transact_time',
          headerName: 'Transact Time',
          headerTooltip: 'TransactTime (tag 60) from 35=AE',
          width: 170,
          sort: 'desc',
          filter: 'agTextColumnFilter',
          cellStyle: { fontFamily: 'monospace', fontSize: 11 },
        },
        {
          field: 'trade_report_id',
          headerName: 'Trade Rpt ID',
          headerTooltip: 'TradeReportRefID (tag 571)',
          width: 180,
          filter: 'agTextColumnFilter',
          cellStyle: { fontFamily: 'monospace', fontSize: 11 },
          hide: true,
        },
      ],
    },

    // ── TIMING ──────────────────────────────────────────────────
    {
      headerName: 'Timing',
      children: [
        {
          field: 'nos_time',
          headerName: 'NOS Time',
          headerTooltip: 'Time we sent the NewOrderSingle — correlated from outbound NOS',
          width: 90,
          filter: 'agTextColumnFilter',
          cellStyle: { fontFamily: 'monospace' },
        },
        {
          field: 'te_status',
          headerName: 'TE Status',
          headerTooltip: 'FILLED = 35=AE received; PENDING = NOS sent, no AE yet',
          width: 100,
          filter: 'agSetColumnFilter',
          filterParams: { values: ['FILLED', 'PENDING', 'UNKNOWN'] },
          cellRenderer: (p: { value: ExecutionReportRow['te_status'] }) => {
            const palette: Record<string, { bg: string; fg: string }> = {
              'FILLED':  { bg: '#1b361b', fg: '#66e07a' },
              'PENDING': { bg: '#332a00', fg: '#e0a020' },
              'UNKNOWN': { bg: '#262626', fg: '#555'    },
            };
            const s = palette[p.value] ?? palette['UNKNOWN'];
            return (
              <span style={{
                backgroundColor: s.bg, color: s.fg,
                padding: '2px 7px', borderRadius: 3,
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.04em', whiteSpace: 'nowrap',
              }}>
                {p.value}
              </span>
            );
          },
        },
        {
          field: 'round_trip_ms',
          headerName: 'RT (ms)',
          headerTooltip: 'Round trip: AE transact_time − NOS sent_time',
          width: 80,
          filter: 'agNumberColumnFilter',
          type: 'rightAligned',
          cellRenderer: (p: { value: number | null }) => {
            if (p.value === null || p.value === undefined)
              return <span style={{ color: '#555' }}>—</span>;
            const color = p.value <= 200 ? '#66e07a' : p.value <= 600 ? '#e0a020' : '#ff6b6b';
            return <span style={{ color, fontWeight: 700 }}>{p.value}</span>;
          },
        },
      ],
    },

    // ── ORDER ────────────────────────────────────────────────────
    {
      headerName: 'Order',
      children: [
        {
          field: 'user',
          headerName: 'User',
          width: 90,
          filter: 'agSetColumnFilter',
        },
        {
          field: 'clord_id',
          headerName: 'ClOrdID',
          headerTooltip: 'Our client order ID (tag 11) — correlated from NOS',
          width: 200,
          pinned: 'left',
          filter: 'agTextColumnFilter',
          cellStyle: { fontFamily: 'monospace', fontSize: 11 },
          tooltipField: 'clord_id',
        },
        {
          field: 'order_id',
          headerName: 'TE OrderID',
          headerTooltip: 'TE order ID (tag 37)',
          width: 100,
          filter: 'agTextColumnFilter',
          cellStyle: { fontFamily: 'monospace' },
        },
        {
          field: 'symbol',
          headerName: 'Symbol',
          headerTooltip: 'Instrument (tag 55)',
          width: 80,
          pinned: 'left',
          filter: 'agSetColumnFilter',
        },
        {
          field: 'side',
          headerName: 'Side',
          headerTooltip: 'Tag 54',
          width: 60,
          filter: 'agSetColumnFilter',
          filterParams: { values: ['BUY', 'SELL'] },
          cellRenderer: (p: { value: 'BUY' | 'SELL' }) => (
            <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : '#e0a020', fontWeight: 700 }}>
              {p.value}
            </span>
          ),
        },
        {
          field: 'ord_type',
          headerName: 'Type',
          headerTooltip: 'Order type (tag 40) — from NOS',
          width: 70,
          filter: 'agSetColumnFilter',
          filterParams: { values: ['MKT', 'LMT', 'STP', 'STPLMT'] },
        },
        {
          field: 'tif',
          headerName: 'TIF',
          headerTooltip: 'Time in force (tag 59) — from NOS',
          width: 60,
          filter: 'agSetColumnFilter',
          filterParams: { values: ['DAY', 'GTC', 'IOC', 'FOK', 'GTD'] },
        },
      ],
    },

    // ── FILL ─────────────────────────────────────────────────────
    {
      headerName: 'Fill',
      children: [
        {
          field: 'fill_qty',
          headerName: 'Qty',
          headerTooltip: 'Order quantity (tag 38) — from NOS',
          width: 90,
          filter: 'agNumberColumnFilter',
          type: 'rightAligned',
          valueFormatter: fmtQty,
        },
        {
          field: 'fill_px',
          headerName: 'Fill Px',
          headerTooltip: 'Last price (tag 31)',
          width: 90,
          filter: 'agNumberColumnFilter',
          type: 'rightAligned',
          valueFormatter: fmtPx,
        },
        {
          field: 'fill_qty',
          headerName: 'Fill Qty',
          headerTooltip: 'Last quantity (tag 32)',
          width: 90,
          filter: 'agNumberColumnFilter',
          type: 'rightAligned',
          valueFormatter: fmtQty,
        },
        {
          field: 'commission',
          headerName: 'Commission',
          headerTooltip: 'Commission (tag 12)',
          width: 90,
          filter: 'agNumberColumnFilter',
          type: 'rightAligned',
          valueFormatter: fmtPx,
          hide: true,
        },
      ],
    },

    // ── ROUTING ──────────────────────────────────────────────────
    {
      headerName: 'Routing',
      children: [
        {
          field: 'route',
          headerName: 'Route',
          headerTooltip: 'ExDestination (tag 100)',
          width: 90,
          filter: 'agTextColumnFilter',
        },
        {
          field: 'security_exchange',
          headerName: 'Exchange',
          headerTooltip: 'SecurityExchange (tag 207)',
          width: 80,
          filter: 'agSetColumnFilter',
          hide: true,
        },
        {
          field: 'security_id',
          headerName: 'Sec ID',
          headerTooltip: 'SecurityID (tag 48)',
          width: 80,
          filter: 'agTextColumnFilter',
          hide: true,
        },
        {
          field: 'account',
          headerName: 'Account',
          headerTooltip: 'Account (tag 1)',
          width: 130,
          filter: 'agSetColumnFilter',
        },
      ],
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable:  true,
    filter:    true,
    resizable: true,
    minWidth:  50,
  }), []);

  const rowSelection = useMemo<RowSelectionOptions>(() => ({
    mode: 'singleRow',
    enableClickSelection: true,
  }), []);

  const gridOptions = useMemo<GridOptions<ExecutionReportRow>>(() => ({
    enableAdvancedFilter: true,
    sideBar: {
      toolPanels: ['columns', 'filters'],
      defaultToolPanel: '',
    },
    columnHoverHighlight: true,
    animateRows: false,
    rowBuffer: 20,
    debounceVerticalScrollbar: true,
    getRowStyle: (params) => {
      if (params.data?.te_status === 'PENDING') return { backgroundColor: '#282000' };
      return undefined;
    },
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent' },
        { statusPanel: 'agSelectedRowCountComponent'        },
        { statusPanel: 'agAggregationComponent'             },
      ],
    },
  }), []);

  const onGridReady = useCallback((_ev: GridReadyEvent) => {
    setTimeout(() => gridRef.current?.api?.autoSizeAllColumns(), 0);
  }, []);

  const onFirstDataRendered = useCallback(() => {
    gridRef.current?.api?.autoSizeAllColumns();
  }, []);

  // Re-size columns whenever filteredRows changes — covers initial load via
  // applyTransaction (fires after onFirstDataRendered), LP filter switches,
  // and any subsequent row updates. Debounced so rapid WS updates don't thrash.
  const autoSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (filteredRows.length === 0) return;
    if (autoSizeTimerRef.current) clearTimeout(autoSizeTimerRef.current);
    autoSizeTimerRef.current = setTimeout(() => {
      gridRef.current?.api?.autoSizeAllColumns();
    }, 80);
  }, [filteredRows]);

  const onRowClicked = useCallback((params: { data?: ExecutionReportRow }) => {
    if (params.data) setSelectedRow(params.data);
  }, []);

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
      const rowData = params.node?.data as ExecutionReportRow | undefined;
      return [
        { name: 'View Order Details', action: () => { if (rowData) setSelectedRow(rowData); } },
        'separator',
        'copy',
        'copyWithHeaders',
        'separator',
        { name: 'Export to CSV',   action: () => params.api.exportDataAsCsv()   },
        { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
      ];
    },
    []
  );

  const handleCopy = useCallback(() => {
    if (!selectedRow) return;
    const text = [
      '═══════════════════════════════════════',
      'NEXRISK EXECUTION REPORT',
      '═══════════════════════════════════════',
      `${selectedRow.side} ${selectedRow.fill_qty} ${selectedRow.symbol} @ ${selectedRow.fill_px}`,
      `Status    : ${selectedRow.te_status}`,
      `TE OrderID: ${selectedRow.order_id}`,
      `ClOrdID   : ${selectedRow.clord_id || '—'}`,
      '───────────────────────────────────────',
      `NOS sent  : ${selectedRow.nos_time}`,
      `Fill time : ${selectedRow.transact_time ? formatSsMs(selectedRow.transact_time) : '—'}`,
      `Round trip: ${selectedRow.round_trip_ms !== null ? `${selectedRow.round_trip_ms}ms` : '—'}`,
      '───────────────────────────────────────',
      `Account   : ${selectedRow.account}`,
      `Route     : ${selectedRow.route}`,
      `Exchange  : ${selectedRow.security_exchange}`,
      `LP        : ${selectedRow.lp_id}`,
      '───────────────────────────────────────',
      `Generated : ${new Date().toLocaleString('en-GB')}`,
      '═══════════════════════════════════════',
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedRow]);

  const handleTelegram = useCallback(() => {
    if (!selectedRow) return;
    const msg = `NEXRISK EXECUTION\n\n${selectedRow.side} ${selectedRow.fill_qty} ${selectedRow.symbol} @ ${selectedRow.fill_px}\nStatus: ${selectedRow.te_status}\nRT: ${selectedRow.round_trip_ms !== null ? `${selectedRow.round_trip_ms}ms` : '—'}\nOrderID: ${selectedRow.order_id}\nLP: ${selectedRow.lp_id}\nTime: ${selectedRow.transact_time}`;
    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(msg)}`, '_blank', 'width=550,height=450');
  }, [selectedRow]);

  const badge = WS_BADGE[wsStatus];

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Execution Report</h1>
          <p className="text-xs text-[#999]">FIX Bridge order blotter</p>
        </div>

        <div className="flex items-center gap-5 text-xs flex-wrap">

          {/* LP selector dropdown */}
          {lpStatuses.length > 0 && (
            <>
              <div className="flex items-center gap-2">
              <span className="text-[#999] text-xs">Liquidity Provider:</span>
              <select
                value={selectedLp}
                onChange={e => setSelectedLp(e.target.value)}
                className="w-[200px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]"
              >
                <option value="all">All Liquidity Providers</option>
                {lpStatuses.map(lp => (
                  <option key={lp.lp_id} value={lp.lp_id}>
                    {lp.lp_name ?? lp.lp_id}
                    {lp.trading_session === 'DISCONNECTED' ? ' — Disconnected' : ''}
                  </option>
                ))}
              </select>
              </div>
              <div className="w-px h-4 bg-[#505050]" />
            </>
          )}

          <div>
            <span className="text-[#999]">Positions:</span>
            <span className="ml-1 font-mono text-white">{stats.positionCount}</span>
          </div>
          <div className="w-px h-4 bg-[#505050]" />

          <div>
            <span className="text-[#999]">Long / Short:</span>
            <span className="ml-1 font-mono">
              <span className="text-[#4ecdc4]">{stats.longCount}</span>
              <span className="text-[#505050]"> / </span>
              <span className="text-[#e0a020]">{stats.shortCount}</span>
            </span>
          </div>

          <div>
            <span className="text-[#999]">Vol:</span>
            <span className="ml-1 font-mono text-white">{stats.volume.toLocaleString()}</span>
          </div>

          <div className="w-px h-4 bg-[#505050]" />

          <div>
            <span className="text-[#999]">Avg RT:</span>
            <span className="ml-1 font-mono text-white">
              {stats.avgRt !== null ? `${stats.avgRt}ms` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[#999]">Best RT:</span>
            <span className="ml-1 font-mono text-[#66e07a]">
              {stats.bestRt !== null ? `${stats.bestRt}ms` : '—'}
            </span>
          </div>
          <div>
            <span className="text-[#999]">Worst RT:</span>
            <span className="ml-1 font-mono text-[#ff6b6b]">
              {stats.worstRt !== null ? `${stats.worstRt}ms` : '—'}
            </span>
          </div>

          <div className="w-px h-4 bg-[#505050]" />

          <div>
            <span className="text-[#999]">Rejections:</span>
            <span className="ml-1 font-mono text-[#ff6b6b]">{stats.rejectionCount}</span>
          </div>
          <div>
            <span className="text-[#999]">Rejection %:</span>
            <span className="ml-1 font-mono text-[#ff6b6b]">
              {stats.rejectionPct.toFixed(1)}%
            </span>
          </div>

          <div className="w-px h-4 bg-[#505050]" />

          {/* WS status badge */}
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
            <span className="font-mono text-[10px]" style={{ color: badge.color }}>{badge.label}</span>
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {wsStatus === 'error' && wsError && (
        <div className="px-4 py-2 bg-[#3a1f1f] border-b border-[#ff6b6b] text-xs text-[#ff6b6b] flex items-center justify-between flex-shrink-0">
          <span>⚠ {wsError}</span>
          <button onClick={reconnect} className="ml-4 underline hover:no-underline">Reconnect</button>
        </div>
      )}

      {/* ── Content: Grid + Side Panel ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Grid column — grid above, charts below */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-300"
          style={{ width: selectedRow ? 'calc(100% - 400px)' : '100%' }}
        >
          {/* Grid area */}
          <div className="flex-1 flex flex-col overflow-hidden p-2">
            {/* Connecting */}
            {wsStatus === 'connecting' && (
              <div className="flex-1 flex items-center justify-center text-[#999] text-sm">
                <span className="font-mono">Connecting to FIX Bridge…</span>
              </div>
            )}

            {/* Reconnecting with no rows */}
            {wsStatus === 'reconnecting' && rows.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-[#e0a020] text-sm">
                <span className="font-mono">Reconnecting…</span>
              </div>
            )}

            {/* Permanently disconnected */}
            {wsStatus === 'error' && rows.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <p className="text-[#ff6b6b] text-sm font-mono">Connection lost</p>
                <button
                  onClick={reconnect}
                  className="text-xs text-[#999] border border-[#444] rounded px-3 py-1 hover:text-white hover:border-[#888] transition-colors"
                >
                  ↻ Reconnect
                </button>
              </div>
            )}

            {/* Live but no orders yet */}
            {wsStatus === 'live' && rows.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                <p className="text-[#999] text-sm">Waiting for orders</p>
                <p className="text-[#666] text-xs">
                  Orders will appear here as the FIX Bridge submits them to an LP.
                </p>
              </div>
            )}

            {/* AG Grid */}
            <div style={{ flex: 1, width: '100%', display: rows.length > 0 ? undefined : 'none' }}>
              <AgGridReact<ExecutionReportRow>
                ref={gridRef}
                theme={gridTheme}
                rowData={filteredRows}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                gridOptions={gridOptions}
                rowHeight={26}
                headerHeight={36}
                groupHeaderHeight={28}
                getRowId={(p) => p.data.trade_report_id}
                rowSelection={rowSelection}
                cellSelection={{ enableHeaderHighlight: true }}
                getContextMenuItems={getContextMenuItems}
                onGridReady={onGridReady}
                onFirstDataRendered={onFirstDataRendered}
                onRowClicked={onRowClicked}
              />
            </div>
          </div>

          {/* ── Analytics Charts Strip ─────────────────────────── */}
          <div
            className={clsx(
              'border-t border-[#808080] flex-shrink-0 transition-all duration-300 overflow-hidden',
              chartsCollapsed ? 'h-[40px]' : 'h-[300px]'
            )}
            style={{ backgroundColor: '#313032' }}
          >
            {/* Toggle bar — exact BBookCharts pattern */}
            <div className="flex justify-center py-1 shrink-0">
              <button
                onClick={() => setChartsCollapsed(c => !c)}
                className="flex items-center gap-1 px-3 py-1 text-xs text-white bg-[#232225] border border-[#808080] rounded hover:bg-[#3a3a3c] transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${chartsCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {chartsCollapsed ? 'Expand Charts' : 'Collapse Charts'}
              </button>
            </div>

            {/* Analytics charts — 4-column grid matching BBookCharts layout */}
            {!chartsCollapsed && (
              <div className="grid grid-cols-4 gap-2 px-2 pb-2" style={{ height: 'calc(100% - 40px)' }}>
                <LatencyOverTimeChart rows={filteredRows} />
                <LatencyByLPChart    rows={filteredRows} />
                <OrdersByStatusChart rows={filteredRows} />
                <VolumeBySymbolChart rows={filteredRows} />
              </div>
            )}
          </div>
        </div>

        {/* ── Side Panel ─────────────────────────────────────────── */}
        <div
          className={clsx(
            'absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#404040]',
            'transition-transform duration-300',
            selectedRow ? 'translate-x-0' : 'translate-x-full'
          )}
          style={{ width: 400, backgroundColor: '#252427' }}
        >
          {selectedRow && (
            <>
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-[#404040] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: selectedRow.side === 'BUY' ? '#4ecdc4' : '#e0a020' }}
                  >
                    {selectedRow.side} {selectedRow.symbol}
                  </span>
                  <span className="text-[#505050]">—</span>
                  <span className="text-xs text-[#999] truncate">{selectedRow.te_status}</span>
                  {/* Copy + Telegram */}
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      onClick={handleCopy}
                      className="p-1 rounded hover:bg-[#3a383c] transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied
                        ? <span style={{ color: '#66e07a' }}><CheckIcon /></span>
                        : <span style={{ color: '#666' }}><CopyIcon /></span>
                      }
                    </button>
                    <button
                      onClick={handleTelegram}
                      className="p-1 rounded hover:bg-[#3a383c] transition-colors"
                      title="Share via Telegram"
                    >
                      <span style={{ color: '#666' }}><TelegramIcon /></span>
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="text-[#555] hover:text-white text-xl leading-none transition-colors flex-shrink-0 ml-2"
                  title="Close (Esc)"
                >
                  ×
                </button>
              </div>

              {/* Panel body — plain-English explanation */}
              <div className="flex-1 overflow-y-auto p-4">
                <pre
                  className="font-mono leading-relaxed whitespace-pre-wrap select-text"
                  style={{ fontSize: 11, color: '#bbb' }}
                >
                  {generateExplanation(selectedRow)}
                </pre>
              </div>

              {/* Panel footer */}
              <div className="px-4 py-2 border-t border-[#404040] flex-shrink-0 flex items-center justify-between">
                <span className="text-[10px] text-[#444] font-mono">
                  {selectedRow.trade_report_id}
                </span>
                <span className="text-[10px] text-[#444] font-mono">
                  {selectedRow.lp_id}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExecutionReportPage;