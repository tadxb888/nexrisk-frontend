// ============================================================
// Route Sanity — LP Route Health Assessment (v3)
//
// Three-column layout:
//   Left   (flex 1) — LP sanity grid: all enabled LPs with
//                     Latency / Uptime / Rejection columns
//   Middle (340px)  — Per-LP threshold AG Grid (editable,
//                     single-click) + Save button
//   Right  (flex 1) — Per-LP symbol AG Grid: Delta Spread,
//                     Avg RT, Volume, Rejection
//
// Thresholds (per-LP, localStorage):
//   Route  : Latency (max), Uptime (min), Rejection (max)
//   Symbol : Latency (max), Rejection (max)
//   Each with /day and /60min variants.
//   No Delta Spread threshold — display only.
//
// Live today:
//   Uptime  — SESSION_STATE_CHANGE WebSocket events
//   All other fields — NA until C++ backend delivers data
// ============================================================

import {
  useState, useRef, useEffect, useCallback, useMemo,
  forwardRef, useImperativeHandle,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  GridReadyEvent,
  ICellRendererParams,
  CellValueChangedEvent,
  CellEditingStoppedEvent,
  ICellEditorParams,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const BASE           = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
const WS_URL         = BASE.replace(/^http/, 'ws') + '/ws/v1/fix/events';
const WS_MAX_RETRIES = 8;
const UPTIME_TICK_MS = 5_000;
const LS_KEY         = 'nexrisk:route-sanity:thresholds-v3';

// ── Color tokens ──────────────────────────────────────────────
const BG_PAGE   = '#313032';
const BG_PANEL  = '#252429';
const BG_HEADER = '#1e1e22';
const BORDER    = '#3a3a3e';
const AMBER     = '#e0a020';
const GREEN     = '#66e07a';
const RED       = '#ff6b6b';

// ══════════════════════════════════════════════════════════════
// THEME  (matches BBookPage / ExecutionReport reference)
// ══════════════════════════════════════════════════════════════
const gridTheme = themeQuartz.withParams({
  backgroundColor:       BG_PAGE,
  browserColorScheme:    'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.07, onto: 'backgroundColor' },
  fontFamily:            { googleFont: 'IBM Plex Mono' },
  fontSize:              14,
  foregroundColor:       '#FFFFFF',
  headerFontSize:        13,
});

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════
interface Thresholds {
  // Route level
  latency_ms_day:          number;
  latency_ms_60min:        number;
  uptime_pct_day:          number;
  uptime_pct_60min:        number;
  lp_rejection_pct_day:    number;
  lp_rejection_pct_60min:  number;
  // Symbol level  (no Delta Spread threshold per spec)
  sym_latency_ms_day:      number;
  sym_latency_ms_60min:    number;
  sym_rejection_pct_day:   number;
  sym_rejection_pct_60min: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  latency_ms_day:           100,
  latency_ms_60min:          50,
  uptime_pct_day:            99,
  uptime_pct_60min:         99.5,
  lp_rejection_pct_day:      10,
  lp_rejection_pct_60min:     1,
  sym_latency_ms_day:       100,
  sym_latency_ms_60min:      50,
  sym_rejection_pct_day:     10,
  sym_rejection_pct_60min:    1,
};

// Row for the threshold configuration grid (middle panel)
interface ThreshRow {
  id:      string;
  group:   string;           // 'Route' | 'Symbol'
  metric:  string;           // 'Latency' | 'Uptime' | 'Rejection'
  unit:    string;           // 'ms' | '%'
  dir:     'max' | 'min';
  day_val: number;
  h60_val: number;
  day_key: keyof Thresholds;
  h60_key: keyof Thresholds;
}

interface LPSanityRow {
  lp_id:                 string;
  lp_name:               string;
  state:                 string | null;
  trading_session_state: string | null;
  md_session_state:      string | null;
  connect_count:         number | null;
  disconnect_count:      number | null;
  // Live fields (null = NA until C++ backend)
  latency_ms_day:        number | null;
  latency_ms_60min:      number | null;
  uptime_pct_day:        number | null;  // computed from WS events
  uptime_pct_60min:      number | null;  // NA — session uptime only
  rejection_pct_day:     number | null;
  rejection_pct_60min:   number | null;
}

interface SymbolSanityRow {
  lp_symbol:           string;
  delta_spread:        number | null;  // LP spread − MT5 spread in pips; display only, no threshold
  avg_rt_ms_day:       number | null;
  avg_rt_ms_60min:     number | null;
  volume:              number | null;
  rejection_pct_day:   number | null;
  rejection_pct_60min: number | null;
}

interface UptimeTracker {
  sessionStart:    number;
  connectedMs:     number;
  lastConnectedAt: number | null;
}

type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

const WS_BADGE: Record<WsStatus, { color: string; label: string }> = {
  connecting:   { color: AMBER,  label: 'Connecting…'   },
  live:         { color: GREEN,  label: 'Live'           },
  reconnecting: { color: AMBER,  label: 'Reconnecting…' },
  error:        { color: RED,    label: 'Disconnected'   },
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function loadThresholds(): Record<string, Partial<Thresholds>> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveThresholdsToStorage(map: Record<string, Partial<Thresholds>>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function getLpThresholds(
  map: Record<string, Partial<Thresholds>>,
  lp_id: string,
): Thresholds {
  return { ...DEFAULT_THRESHOLDS, ...(map[lp_id] ?? {}) };
}

function isConnected(state: string | null): boolean {
  return state === 'CONNECTED' || state === 'LOGGED_ON';
}

function isActive(state: string | null): boolean {
  return state === 'CONNECTED' || state === 'DEGRADED' ||
         state === 'RECONNECTING' || state === 'CONNECTING';
}

const STATE_COLOR: Record<string, string> = {
  CONNECTED:     GREEN,
  LOGGED_ON:     GREEN,
  DEGRADED:      AMBER,
  RECONNECTING:  AMBER,
  CONNECTING:    AMBER,
  DISCONNECTED:  RED,
  STOPPED:       RED,
  QUARANTINED:   RED,
  SESSION_ERROR: RED,
};

function stateColor(state: string | null): string {
  if (!state) return '#555';
  return STATE_COLOR[state] ?? '#888';
}

function computeUptime(t: UptimeTracker, now: number): number {
  const elapsed = now - t.sessionStart;
  if (elapsed <= 0) return 100;
  const conn = t.connectedMs + (t.lastConnectedAt !== null ? now - t.lastConnectedAt : 0);
  return Math.min(100, (conn / elapsed) * 100);
}

const NA      = '—';
const fmtPct  = (v: number | null) => v === null ? NA : `${v.toFixed(2)}%`;
const fmtMs   = (v: number | null) => v === null ? NA : `${v.toFixed(0)} ms`;
const fmtVol  = (v: number | null) => v === null ? NA : v.toLocaleString();

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((e as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// Build threshold grid rows from a Thresholds object
function buildThreshRows(t: Thresholds): ThreshRow[] {
  return [
    { id: 'lat',  group: 'Route',  metric: 'Latency',   unit: 'ms', dir: 'max',
      day_val: t.latency_ms_day,        h60_val: t.latency_ms_60min,
      day_key: 'latency_ms_day',        h60_key: 'latency_ms_60min' },
    { id: 'upt',  group: 'Route',  metric: 'Uptime',    unit: '%',  dir: 'min',
      day_val: t.uptime_pct_day,        h60_val: t.uptime_pct_60min,
      day_key: 'uptime_pct_day',        h60_key: 'uptime_pct_60min' },
    { id: 'rej',  group: 'Route',  metric: 'Rejection', unit: '%',  dir: 'max',
      day_val: t.lp_rejection_pct_day,  h60_val: t.lp_rejection_pct_60min,
      day_key: 'lp_rejection_pct_day',  h60_key: 'lp_rejection_pct_60min' },
    { id: 'slat', group: 'Symbol', metric: 'Latency',   unit: 'ms', dir: 'max',
      day_val: t.sym_latency_ms_day,    h60_val: t.sym_latency_ms_60min,
      day_key: 'sym_latency_ms_day',    h60_key: 'sym_latency_ms_60min' },
    { id: 'srej', group: 'Symbol', metric: 'Rejection', unit: '%',  dir: 'max',
      day_val: t.sym_rejection_pct_day, h60_val: t.sym_rejection_pct_60min,
      day_key: 'sym_rejection_pct_day', h60_key: 'sym_rejection_pct_60min' },
  ];
}

// ══════════════════════════════════════════════════════════════
// CUSTOM CELL EDITOR — plain text, no spinner
// ══════════════════════════════════════════════════════════════
const PlainNumEditor = forwardRef<any, ICellEditorParams>((props, ref) => {
  const [val, setVal] = useState<string>(String(props.value ?? ''));
  const onValueChange = (props as any).onValueChange as ((v: number) => void) | undefined;

  useImperativeHandle(ref, () => ({
    getValue:            () => parseFloat(val) || 0,
    isCancelBeforeStart: () => false,
    isCancelAfterEnd:    () => false,
  }));

  return (
    <input
      type="text"
      value={val}
      onChange={e => {
        setVal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n) && onValueChange) onValueChange(n);
      }}
      autoFocus
      style={{
        width: '100%', height: '100%',
        background: 'transparent',
        color: '#fff',
        border: 'none',
        outline: 'none',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        padding: '0 8px',
      }}
    />
  );
});
PlainNumEditor.displayName = 'PlainNumEditor';

// ══════════════════════════════════════════════════════════════
// SHARED MICRO-COMPONENTS
// ══════════════════════════════════════════════════════════════
const RouteSanityIcon = ({ size = 16 }: { size?: number }) => (
  <svg height={size} viewBox="0 0 24 24" width={size} fill="currentColor">
    <path d="m24 9.5a3.5 3.5 0 1 0 -5 3.15v3.35a5 5 0 0 1 -10 0v-.151a7.513 7.513 0 0 0 6-7.349v-5a3.5 3.5 0 0 0 -3.5-3.5h-2.5v3h2.5a.5.5 0 0 1 .5.5v5a4.5 4.5 0 0 1 -9 0v-5a.5.5 0 0 1 .5-.5h2.5v-3h-2.5a3.5 3.5 0 0 0 -3.5 3.5v5a7.513 7.513 0 0 0 6 7.349v.151a8 8 0 0 0 16 0v-3.35a3.491 3.491 0 0 0 2-3.15z" />
  </svg>
);

const Dot = ({ state, size = 7 }: { state: string | null; size?: number }) => (
  <span style={{
    display: 'inline-block', borderRadius: '50%', flexShrink: 0,
    width: size, height: size, backgroundColor: stateColor(state),
  }} />
);

function EmptyState({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      <span style={{ color: '#fff', fontSize: 13 }}>{msg}</span>
      {sub && <span style={{ color: '#aaa', fontSize: 11 }}>{sub}</span>}
    </div>
  );
}

// Column panel header bar
function PanelHdr({
  label, sub, right, onClose,
}: {
  label: string; sub?: string; right?: React.ReactNode; onClose?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 12px', borderBottom: `1px solid ${BORDER}`,
      backgroundColor: BG_HEADER, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 9, color: '#4ecdc4', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>
          {label}
        </span>
        {sub && <span style={{ fontSize: 9, color: '#fff' }}>{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {right}
        {onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#aaa', fontSize: 14, lineHeight: 1, padding: '0 2px',
          }} title="Collapse">✕</button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════
export default function RouteSanityPage() {

  // ── Thresholds panel visibility ─────────────────────────────
  // Collapsed by default; auto-opens when an LP is selected
  const [threshOpen, setThreshOpen] = useState(false);

  // ── Panel resize state ──────────────────────────────────────
  // When thresholds closed: LP=45%, Symbols=55%
  // When thresholds open: LP=35%, Symbols=40%, Thresholds=25%
  const [leftPct, setLeftPct] = useState(45);
  const [midPct,  setMidPct]  = useState(55);
  const bodyRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((which: 'left' | 'mid') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX   = e.clientX;
    const bodyW    = bodyRef.current?.offsetWidth ?? 1;
    const startLeft = leftPct;
    const startMid  = midPct;

    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientX - startX) / bodyW) * 100;
      if (which === 'left') {
        const next = Math.max(15, Math.min(60, startLeft + delta));
        setLeftPct(next);
      } else {
        const next = Math.max(20, Math.min(65, startMid + delta));
        setMidPct(next);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Refit columns after resize
      lpGridRef.current?.api?.autoSizeAllColumns();
      symGridRef.current?.api?.autoSizeAllColumns();
      thGridRef.current?.api?.autoSizeAllColumns();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [leftPct, midPct]);

  // ── Core data ──────────────────────────────────────────────
  const [lpRows,       setLpRows]       = useState<LPSanityRow[]>([]);
  const [symbolRows,   setSymbolRows]   = useState<SymbolSanityRow[]>([]);
  const [selectedLpId, setSelectedLpId] = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [symLoading,   setSymLoading]   = useState(false);
  const [wsStatus,     setWsStatus]     = useState<WsStatus>('connecting');

  // ── Saved thresholds (from localStorage) ───────────────────
  const [savedThreshMap, setSavedThreshMap] =
    useState<Record<string, Partial<Thresholds>>>(loadThresholds);

  // ── Threshold edit state ────────────────────────────────────
  // threshRows drives the middle AG Grid. draftMap tracks in-grid edits.
  const [threshRows, setThreshRows] = useState<ThreshRow[]>([]);
  const draftRef = useRef<Thresholds>(DEFAULT_THRESHOLDS);

  // ── Dirty flag ──────────────────────────────────────────────
  const [isDirty, setIsDirty] = useState(false);

  // ── Refs ────────────────────────────────────────────────────
  const wsRef        = useRef<WebSocket | null>(null);
  const retriesRef   = useRef(0);
  const unmountRef   = useRef(false);
  const uptimeMap    = useRef<Map<string, UptimeTracker>>(new Map());
  const lpGridRef    = useRef<AgGridReact<LPSanityRow>>(null);
  const thGridRef    = useRef<AgGridReact<ThreshRow>>(null);
  const symGridRef   = useRef<AgGridReact<SymbolSanityRow>>(null);
  const symRowsRef   = useRef<SymbolSanityRow[]>([]); // persists across StrictMode remounts

  // ── Derived ─────────────────────────────────────────────────
  const selectedLp = useMemo(
    () => lpRows.find(r => r.lp_id === selectedLpId) ?? null,
    [lpRows, selectedLpId],
  );

  const lpGridContext = useMemo(
    () => ({
      getT: (lp_id: string) => getLpThresholds(savedThreshMap, lp_id),
      selectedLpId,
      threshOpen,
      onThreshToggle: (lp_id: string) => {
        // If clicking the checkbox of the already-selected LP, just toggle panel
        if (lp_id === selectedLpId) {
          setThreshOpen(o => {
            if (o) {
              // closing — deselect
              setSelectedLpId(null);
              return false;
            }
            return true;
          });
        } else {
          // New LP — select it and open panel
          setSelectedLpId(lp_id);
          setThreshOpen(true);
        }
      },
    }),
    [savedThreshMap, selectedLpId, threshOpen],
  );

  const selT = useMemo(
    () => selectedLpId
      ? getLpThresholds(savedThreshMap, selectedLpId)
      : DEFAULT_THRESHOLDS,
    [selectedLpId, savedThreshMap],
  );

  // ── Load threshold grid when LP or savedThreshMap changes ────
  useEffect(() => {
    if (!selectedLpId) { setThreshRows([]); setThreshOpen(false); return; }
    const t = getLpThresholds(savedThreshMap, selectedLpId);
    draftRef.current = { ...t };
    setThreshRows(buildThreshRows(t));
  }, [selectedLpId, savedThreshMap]);

  // Autosize Thresholds columns whenever the panel opens
  // and adjust LP/Symbol panel widths to give Thresholds room
  useEffect(() => {
    if (threshOpen) {
      setLeftPct(35);
      setMidPct(40);
      setTimeout(() => thGridRef.current?.api?.autoSizeAllColumns(), 50);
    } else {
      setLeftPct(45);
      setMidPct(55);
    }
    setTimeout(() => {
      lpGridRef.current?.api?.autoSizeAllColumns();
      symGridRef.current?.api?.autoSizeAllColumns();
    }, 250);
    // Force LP grid to re-render checkbox column so checked state updates
    setTimeout(() => lpGridRef.current?.api?.refreshCells({ force: true }), 0);
  }, [threshOpen]);

  // ── Save threshold ───────────────────────────────────────────
  const saveThresholds = useCallback(() => {
    if (!selectedLpId) return;
    const updated = { ...savedThreshMap, [selectedLpId]: { ...draftRef.current } };
    setSavedThreshMap(updated);
    saveThresholdsToStorage(updated);
    setIsDirty(false);
    setTimeout(() => lpGridRef.current?.api?.refreshCells({ force: true }), 50);
  }, [selectedLpId, savedThreshMap]);

  // ── Threshold cell edit ──────────────────────────────────────
  const onThreshCellChanged = useCallback(
    (e: CellValueChangedEvent<ThreshRow> | CellEditingStoppedEvent<ThreshRow>) => {
      if (!e.data) return;
      const col    = e.column?.getColId?.();
      const newVal = parseFloat(String((e as any).newValue ?? (e as any).value ?? 0)) || 0;
      const { day_key, h60_key } = e.data;

      if (col === 'day_val') {
        draftRef.current = { ...draftRef.current, [day_key]: newVal };
      } else if (col === 'h60_val') {
        draftRef.current = { ...draftRef.current, [h60_key]: newVal };
      } else {
        // Fallback: read both from row data
        draftRef.current = {
          ...draftRef.current,
          [day_key]: parseFloat(String(e.data.day_val)) || 0,
          [h60_key]: parseFloat(String(e.data.h60_val)) || 0,
        };
      }
      setIsDirty(true);
    },
    [],
  );

  // ── Uptime 5-second tick ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setLpRows(prev =>
        prev.map(r => {
          const t = uptimeMap.current.get(r.lp_id);
          return t ? { ...r, uptime_pct_day: computeUptime(t, now) } : r;
        }),
      );
    }, UPTIME_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── Fetch LP list ────────────────────────────────────────────
  const fetchLPs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; data: { lps: any[] } }>(
        '/api/v1/route-sanity/lps',
      );
      const now  = Date.now();
      const rows: LPSanityRow[] = (res.data?.lps ?? []).map((lp: any) => {
        const conn = isConnected(lp.state);
        uptimeMap.current.set(lp.lp_id, {
          sessionStart:    now,
          connectedMs:     0,
          lastConnectedAt: conn ? now : null,
        });
        return {
          lp_id:                 lp.lp_id,
          lp_name:               lp.lp_name ?? lp.lp_id,
          state:                 lp.state,
          trading_session_state: lp.trading_session_state,
          md_session_state:      lp.md_session_state,
          connect_count:         lp.connect_count,
          disconnect_count:      lp.disconnect_count,
          latency_ms_day:        lp.latency_ms_day    ?? null,
          latency_ms_60min:      lp.latency_ms_60min  ?? null,
          uptime_pct_day:        lp.uptime_pct_day ?? (conn ? 100 : 0),
          uptime_pct_60min:      null,
          rejection_pct_day:     lp.rejection_pct_day   ?? null,
          rejection_pct_60min:   lp.rejection_pct_60min ?? null,
        };
      });
      setLpRows(rows);
      setSelectedLpId(prev => prev ?? (rows[0]?.lp_id ?? null));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLPs(); }, []); // eslint-disable-line

  // ── Fetch instruments for selected LP ───────────────────────
  // Seed from ref on mount so StrictMode remounts don't flash empty
  useEffect(() => {
    if (symRowsRef.current.length > 0) setSymbolRows(symRowsRef.current);
  }, []);

  useEffect(() => {
    if (!selectedLpId) return;
    let cancelled = false;
    if (symRowsRef.current.length === 0) setSymLoading(true);
    api<any>(
      `/api/v1/route-sanity/lp/${selectedLpId}/instruments`,
    )
      .then(res => {
        if (cancelled) return;
        const raw = res as any;
        const instrs: any[] =
          raw?.data?.instruments ??
          raw?.instruments ??
          [];
        if (instrs.length > 0) {
          const rows = instrs.map((i: any) => ({
            lp_symbol:           i.symbol,
            delta_spread:        i.delta_spread        ?? null,
            avg_rt_ms_day:       i.avg_rt_ms_day       ?? null,
            avg_rt_ms_60min:     i.avg_rt_ms_60min     ?? null,
            volume:              i.volume_day          ?? null,
            rejection_pct_day:   i.rejection_pct_day   ?? null,
            rejection_pct_60min: i.rejection_pct_60min ?? null,
          }));
          symRowsRef.current = rows;
          setSymbolRows(rows);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSymLoading(false); });
    return () => { cancelled = true; };
  }, [selectedLpId]);

  // ── WebSocket ────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (unmountRef.current) return;
    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountRef.current) { ws.close(); return; }
      retriesRef.current = 0;
      setWsStatus('live');
    };

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch { return; }
      if (msg.type !== 'SESSION_STATE_CHANGE') return;

      const { lp_id, new_state, timestamp_ms } = msg;
      const now     = (timestamp_ms as number) ?? Date.now();
      const tracker = uptimeMap.current.get(lp_id);

      if (tracker) {
        const wasConn = tracker.lastConnectedAt !== null;
        const nowConn = isConnected(new_state as string);
        if (wasConn && !nowConn) {
          tracker.connectedMs    += now - tracker.lastConnectedAt!;
          tracker.lastConnectedAt = null;
        } else if (!wasConn && nowConn) {
          tracker.lastConnectedAt = now;
        }
      }

      setLpRows(prev => prev.map(r => {
        if (r.lp_id !== lp_id) return r;
        const t = uptimeMap.current.get(lp_id);
        return {
          ...r,
          state:         new_state as string,
          uptime_pct_day: t ? computeUptime(t, now) : r.uptime_pct_day,
        };
      }));
    };

    ws.onerror = () => { if (!unmountRef.current) setWsStatus('error'); };
    ws.onclose = () => {
      if (unmountRef.current) return;
      if (retriesRef.current < WS_MAX_RETRIES) {
        retriesRef.current++;
        setWsStatus('reconnecting');
        setTimeout(connectWs, Math.min(1_000 * 2 ** retriesRef.current, 30_000));
      } else {
        setWsStatus('error');
      }
    };
  }, []);

  useEffect(() => {
    unmountRef.current = false;
    connectWs();
    return () => { unmountRef.current = true; wsRef.current?.close(); };
  }, [connectWs]);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    wsRef.current?.close();
    connectWs();
  }, [connectWs]);

  // ── AutoSize helper ──────────────────────────────────────────
  const autoSize = useCallback((e: GridReadyEvent) => {
    e.api.autoSizeAllColumns();
  }, []);

  // ── LP grid column defs ──────────────────────────────────────
  // Threshold access via context.getT — no colDef recreation on thresh change
  const lpColDefs = useMemo<ColDef<LPSanityRow>[]>(() => {
    type CS = { color: string; fontWeight?: number };

    const naStyle: CS = { color: '#aaa' };

    function valStyle(
      v: number | null,
      thr: number,
      isMin: boolean,
    ): CS {
      if (v === null) return naStyle;
      const breach = isMin ? v < thr : v > thr;
      return breach
        ? { color: AMBER, fontWeight: 600 }
        : { color: '#fff' };
    }

    return [
      {
        headerName: '',
        field: 'lp_id',
        width: 36, maxWidth: 36, minWidth: 36,
        sortable: false, resizable: false, suppressMovable: true,
        cellRenderer: (p: ICellRendererParams<LPSanityRow>) => {
          const isSelected = p.data?.lp_id === p.context?.selectedLpId;
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <input
                type="checkbox"
                checked={isSelected && !!p.context?.threshOpen}
                onChange={() => p.context?.onThreshToggle?.(p.data?.lp_id ?? '')}
                style={{ cursor: 'pointer', accentColor: '#4ecdc4' }}
              />
            </div>
          );
        },
      },
      {
        field:      'lp_name',
        headerName: 'LP',
        cellRenderer: (p: ICellRendererParams<LPSanityRow>) => {
          const row = p.data!;
          const T   = (p.context?.getT?.(row.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          const breach =
            (row.latency_ms_day    !== null && row.latency_ms_day    > T.latency_ms_day)       ||
            (row.uptime_pct_day    !== null && row.uptime_pct_day    < T.uptime_pct_day)        ||
            (row.rejection_pct_day !== null && row.rejection_pct_day > T.lp_rejection_pct_day);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: '100%' }}>
              <Dot state={row.state} size={6} />
              <span style={{ color: breach ? AMBER : '#fff', fontWeight: breach ? 600 : 400 }}>
                {row.lp_name}
              </span>
              {breach && <span style={{ color: AMBER, fontSize: 9, marginLeft: 'auto' }}>▲</span>}
            </div>
          );
        },
      },
      {
        field: 'state', headerName: 'Status',
        cellRenderer: (p: ICellRendererParams<LPSanityRow>) => (
          <span style={{ fontSize: 10, color: stateColor(p.value), letterSpacing: '0.04em' }}>
            {p.value ?? '—'}
          </span>
        ),
      },
      {
        field: 'latency_ms_day', headerName: 'Lat/Day',
        type: 'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          return valStyle(p.value, T.latency_ms_day, false);
        },
      },
      {
        field: 'latency_ms_60min', headerName: 'Lat/60m',
        type: 'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          return valStyle(p.value, T.latency_ms_60min, false);
        },
      },
      {
        field: 'uptime_pct_day', headerName: 'Up/Day',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          if (p.value === null) return naStyle;
          return (p.value as number) < T.uptime_pct_day
            ? { color: AMBER, fontWeight: 600 }
            : { color: GREEN };
        },
      },
      {
        field: 'uptime_pct_60min', headerName: 'Up/60m',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          if (p.value === null) return naStyle;
          return (p.value as number) < T.uptime_pct_60min
            ? { color: AMBER, fontWeight: 600 }
            : { color: GREEN };
        },
      },
      {
        field: 'rejection_pct_day', headerName: 'Rej/Day',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          return valStyle(p.value, T.lp_rejection_pct_day, false);
        },
      },
      {
        field: 'rejection_pct_60min', headerName: 'Rej/60m',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const T = (p.context?.getT?.(p.data?.lp_id) ?? DEFAULT_THRESHOLDS) as Thresholds;
          return valStyle(p.value, T.lp_rejection_pct_60min, false);
        },
      },
    ];
  }, []); // intentional empty deps — threshold reads via context

  // ── Threshold grid column defs ───────────────────────────────
  const threshColDefs = useMemo<ColDef<ThreshRow>[]>(() => [
    {
      field: 'group', headerName: 'Level',
      cellStyle: p => ({
        color:      p.value === 'Symbol' ? '#fff' : '#4ecdc4',
        fontSize:   10,
        letterSpacing: '0.04em',
      }),
    },
    {
      field: 'metric', headerName: 'Metric',
      cellStyle: { color: '#fff' },
    },
    {
      field: 'dir', headerName: 'Lmt',
      cellStyle: p => ({
        color:    p.value === 'min' ? GREEN : AMBER,
        fontSize: 10,
      }),
    },
    {
      field:      'day_val',
      headerName: '/Day',
      editable:   true,
      singleClickEdit: true,
      cellEditor: PlainNumEditor,
      cellEditorParams: (p: any) => ({
        onValueChange: (v: number) => {
          if (!p.data) return;
          draftRef.current = { ...draftRef.current, [p.data.day_key]: v };
          setIsDirty(true);
        },
      }),
      valueFormatter: p => p.value !== null && p.value !== undefined
        ? `${p.value} ${p.data?.unit ?? ''}`
        : NA,
      cellStyle: { color: '#fff' },
    },
    {
      field:      'h60_val',
      headerName: '/60m',
      editable:   true,
      singleClickEdit: true,
      cellEditor: PlainNumEditor,
      cellEditorParams: (p: any) => ({
        onValueChange: (v: number) => {
          if (!p.data) return;
          draftRef.current = { ...draftRef.current, [p.data.h60_key]: v };
          setIsDirty(true);
        },
      }),
      valueFormatter: p => p.value !== null && p.value !== undefined
        ? `${p.value} ${p.data?.unit ?? ''}`
        : NA,
      cellStyle: { color: '#fff' },
    },
  ], []);

  // ── Symbol grid column defs ──────────────────────────────────
  const symColDefs = useMemo<ColDef<SymbolSanityRow>[]>(() => {
    const T = selT;
    return [
      {
        field: 'lp_symbol', headerName: 'Symbol',
        cellStyle: { color: '#fff', fontWeight: 600 },
      },
      {
        field: 'delta_spread', headerName: 'Δ Spread',
        type: 'rightAligned',
        headerTooltip: 'LP spread − MT5 spread in pips. Negative = broker earns on the spread difference; positive = broker pays.',
        cellRenderer: (p: ICellRendererParams<SymbolSanityRow>) => {
          const v = p.value as number | null;
          if (v === null) return <span style={{ color: '#aaa' }}>—</span>;
          // delta = LP_spread_pips - MT5_spread_pips
          // negative → LP tighter than MT5 → Earning (good for broker)
          // positive → LP wider than MT5  → Cost
          // zero     → exactly matched    → Flat
          const absPips = Math.abs(v).toFixed(1);
          if (v < 0) return (
            <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
              <span style={{ color: '#fff' }}>{absPips} pip </span>
              <span style={{ color: GREEN, fontWeight: 600, fontSize: 10 }}>Earning</span>
            </span>
          );
          if (v > 0) return (
            <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
              <span style={{ color: '#fff' }}>{absPips} pip </span>
              <span style={{ color: AMBER, fontWeight: 600, fontSize: 10 }}>Cost</span>
            </span>
          );
          return (
            <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>
              <span style={{ color: '#fff' }}>0.0 pip </span>
              <span style={{ color: '#aaa', fontSize: 10 }}>Flat</span>
            </span>
          );
        },
      },
      {
        field: 'avg_rt_ms_day', headerName: 'RT/Day',
        type: 'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > T.sym_latency_ms_day) return { color: AMBER, fontWeight: 600 };
          return { color: v === null ? '#aaa' : '#ccc' };
        },
      },
      {
        field: 'avg_rt_ms_60min', headerName: 'RT/60m',
        type: 'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > T.sym_latency_ms_60min) return { color: AMBER, fontWeight: 600 };
          return { color: v === null ? '#aaa' : '#ccc' };
        },
      },
      {
        field: 'volume', headerName: 'Vol',
        type: 'rightAligned',
        valueFormatter: p => fmtVol(p.value),
        cellStyle: { color: '#fff' },
      },
      {
        field: 'rejection_pct_day', headerName: 'Rej/Day',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > T.sym_rejection_pct_day) return { color: AMBER, fontWeight: 600 };
          return { color: v === null ? '#aaa' : '#ccc' };
        },
      },
      {
        field: 'rejection_pct_60min', headerName: 'Rej/60m',
        type: 'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > T.sym_rejection_pct_60min) return { color: AMBER, fontWeight: 600 };
          return { color: v === null ? '#aaa' : '#ccc' };
        },
      },
    ];
  }, [selT]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable:       true,
    sortable:        true,
    suppressMovable: false,
  }), []);

  const wsBadge = WS_BADGE[wsStatus];

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: BG_PAGE,
    }}>

      {/* ── Page header ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 16px', borderBottom: `1px solid ${BORDER}`,
        backgroundColor: BG_PANEL, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#4ecdc4' }}><RouteSanityIcon size={15} /></span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Route Sanity</span>
          <span style={{ color: '#aaa', fontSize: 9, marginLeft: 2, fontFamily: 'IBM Plex Mono, monospace' }}>
            Today
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6,
              borderRadius: '50%', backgroundColor: wsBadge.color,
            }} />
            <span style={{ fontSize: 9, color: wsBadge.color, fontFamily: 'IBM Plex Mono, monospace' }}>
              {wsBadge.label}
            </span>
          </div>
          {wsStatus === 'error' && (
            <button
              onClick={reconnect}
              style={{ fontSize: 10, color: '#aaa', background: 'none', border: `1px solid #404040`, borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}
            >
              ↻ WS
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '5px 16px', borderBottom: '1px solid #5a2020',
          backgroundColor: '#1c1010', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#ff8888' }}>⚠ {error}</span>
          <button onClick={fetchLPs} style={{ fontSize: 11, color: '#ff8888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Three-column body ─────────────────────────────────── */}
      <div ref={bodyRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ══════════════════════════════════════════════════════
            LEFT — LP sanity grid
        ══════════════════════════════════════════════════════ */}
        <div style={{
          width: `${leftPct}%`, flexShrink: 0, minWidth: 220,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHdr
            label="Active LPs"
            sub={`${lpRows.filter(r => isActive(r.state)).length} active · ${lpRows.filter(r => !isActive(r.state)).length} inactive`}
          />

          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: BG_PAGE }}>
            {loading && lpRows.length === 0 ? (
              <EmptyState msg="Loading…" />
            ) : lpRows.length === 0 ? (
              <EmptyState
                msg="No enabled LPs"
                sub="Enable LPs in the Liquidity Providers page"
              />
            ) : (
              <AgGridReact<LPSanityRow>
                ref={lpGridRef}
                theme={gridTheme}
                rowData={lpRows}
                columnDefs={lpColDefs}
                defaultColDef={defaultColDef}
                context={lpGridContext}
                rowHeight={28}
                headerHeight={32}
                getRowId={p => p.data.lp_id}
                rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                onRowClicked={e => { if (e.data) setSelectedLpId(e.data.lp_id); }}
                onGridReady={autoSize}
                onFirstDataRendered={autoSize}
                sideBar={{ toolPanels: ['columns'], defaultToolPanel: '' }}
                tooltipShowDelay={300}
                getRowStyle={p =>
                  p.data?.lp_id === selectedLpId
                    ? { backgroundColor: 'rgba(78,205,196,0.07)', borderLeft: '2px solid #4ecdc4' }
                    : undefined
                }
              />
            )}
          </div>
        </div>

        {/* ── Drag handle: Left ↔ Middle ──────────────────────── */}
        <div
          onMouseDown={startResize('left')}
          style={{
            width: 4, flexShrink: 0, cursor: 'col-resize',
            backgroundColor: BORDER,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4ecdc4')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = BORDER)}
        />

        {/* ══════════════════════════════════════════════════════
            MIDDLE — Symbol Breakdown
        ══════════════════════════════════════════════════════ */}
        <div style={{
          width: `${midPct}%`, flexShrink: 0, minWidth: 300,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHdr
            label="Symbol Breakdown"
            sub={selectedLp
              ? `${selectedLp.lp_name} · ${symbolRows.length} symbol${symbolRows.length !== 1 ? 's' : ''}`
              : 'Select an LP'}
          />

          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: BG_PAGE }}>
            {!selectedLpId ? (
              <EmptyState msg="Select an LP" sub="Symbol data appears here" />
            ) : symbolRows.length === 0 && symLoading ? (
              <EmptyState msg="Loading symbols…" />
            ) : symbolRows.length === 0 ? (
              <EmptyState
                msg="No instruments loaded"
                sub="Connect this LP to populate instrument definitions"
              />
            ) : (
              <AgGridReact<SymbolSanityRow>
                ref={symGridRef}
                theme={gridTheme}
                rowData={symbolRows}
                columnDefs={symColDefs}
                defaultColDef={defaultColDef}
                rowHeight={26}
                headerHeight={32}
                getRowId={p => p.data.lp_symbol}
                onGridReady={autoSize}
                sideBar={{ toolPanels: ['columns'], defaultToolPanel: '' }}
                tooltipShowDelay={300}
              />
            )}
          </div>
        </div>

        {/* ── Drag handle: Middle ↔ Right ──────────────────────── */}
        {threshOpen && (
          <div
            onMouseDown={startResize('mid')}
            style={{
              width: 4, flexShrink: 0, cursor: 'col-resize',
              backgroundColor: BORDER,
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4ecdc4')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = BORDER)}
          />
        )}

        {/* ══════════════════════════════════════════════════════
            RIGHT — Thresholds + Save
        ══════════════════════════════════════════════════════ */}
        <div style={{
          width: threshOpen ? `${100 - leftPct - midPct}%` : 0,
          minWidth: threshOpen ? 260 : 0,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s',
        }}>
          <PanelHdr
            label="Thresholds"
            sub={selectedLp ? selectedLp.lp_name : 'Select an LP'}
            onClose={() => setThreshOpen(false)}
            right={
              selectedLpId ? (
                <button
                  onClick={saveThresholds}
                  style={{
                    fontSize: 10,
                    color: '#fff',
                    background: isDirty ? '#1a3a2a' : 'none',
                    border: `1px solid ${isDirty ? '#2f6a3d' : '#4ecdc4'}`,
                    borderRadius: 3,
                    padding: '2px 10px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono, monospace',
                    transition: 'all 0.15s',
                  }}
                >
                  {isDirty ? '● Save' : 'Saved'}
                </button>
              ) : undefined
            }
          />

          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: BG_PAGE }}>
            {!selectedLpId ? (
              <EmptyState msg="Select an LP" sub="Thresholds appear here" />
            ) : (
              <AgGridReact<ThreshRow>
                ref={thGridRef}
                theme={gridTheme}
                rowData={threshRows}
                columnDefs={threshColDefs}
                defaultColDef={{ ...defaultColDef, sortable: false }}
                rowHeight={32}
                headerHeight={32}
                getRowId={p => p.data.id}
                onGridReady={autoSize}
                onFirstDataRendered={autoSize}
                onCellValueChanged={onThreshCellChanged}
                onCellEditingStopped={onThreshCellChanged as any}
                onCellClicked={() => setIsDirty(true)}
                singleClickEdit
                stopEditingWhenCellsLoseFocus
                getRowStyle={p =>
                  p.data?.group === 'Symbol'
                    ? { backgroundColor: 'rgba(0,0,0,0.15)' }
                    : undefined
                }
              />
            )}
          </div>
        </div>


      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div style={{
        padding: '3px 16px', borderTop: '1px solid #1e1e22',
        backgroundColor: '#16161a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: '#404044', fontFamily: 'IBM Plex Mono, monospace' }}>
          Latency · Rejection · Delta Spread (LP − MT5 pips)
        </span>
        <span style={{ fontSize: 9, color: '#404044', fontFamily: 'IBM Plex Mono, monospace' }}>
          Thresholds saved per LP to localStorage · Uptime tracked from session start
        </span>
      </div>
    </div>
  );
}