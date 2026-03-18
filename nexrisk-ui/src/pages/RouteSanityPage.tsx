// ============================================================
// Route Sanity — LP Route Health Assessment
// Two side-by-side AG Grids:
//   Left  → per-LP: Latency, Uptime (WS), Rejection
//   Right → per-symbol (selected LP): Spread R/E, Avg RT, Vol, Rejection
//
// Uptime is the only live field until C++ backend catches up.
// Uptime is computed from SESSION_STATE_CHANGE WS events.
// Latency, Rejection, Spread R/E remain NA in this milestone.
//
// Thresholds: stored in localStorage, applied as amber highlights.
// ============================================================

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  GridReadyEvent,
  RowClickedEvent,
  ICellRendererParams,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const BASE    = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
const WS_URL  = BASE.replace(/^http/, 'ws') + '/ws/v1/fix/events';
const WS_MAX_RETRIES   = 8;
const UPTIME_TICK_MS   = 5_000; // recompute uptime % every 5 s
const LS_KEY           = 'nexrisk:route-sanity:thresholds';

// ══════════════════════════════════════════════════════════════
// THEME — identical to ExecutionReport / BBookPage
// ══════════════════════════════════════════════════════════════
const gridTheme = themeQuartz.withParams({
  backgroundColor:       '#313032',
  browserColorScheme:    'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily:            { googleFont: 'IBM Plex Mono' },
  fontSize:              12,
  foregroundColor:       '#FFF',
  headerFontSize:        13,
});

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export interface Thresholds {
  // Route level (per LP row)
  latency_ms_day:            number;  // max acceptable avg latency per day (ms)
  latency_ms_60min:          number;  // max acceptable avg latency per 60 min (ms)
  uptime_pct_day:            number;  // min acceptable uptime per day (%)
  uptime_pct_60min:          number;  // min acceptable uptime per 60 min (%)
  lp_rejection_pct_day:      number;  // max acceptable LP rejection rate per day (%)
  lp_rejection_pct_60min:    number;  // max acceptable LP rejection rate per 60 min (%)
  // Symbol level (per symbol row)
  sym_rejection_pct_day:     number;
  sym_rejection_pct_60min:   number;
  spread_re_pips_day:        number;  // max acceptable Spread R/E per day (pips)
  spread_re_pips_60min:      number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  latency_ms_day:          100,
  latency_ms_60min:         50,
  uptime_pct_day:           99,
  uptime_pct_60min:       99.5,
  lp_rejection_pct_day:     10,
  lp_rejection_pct_60min:    1,
  sym_rejection_pct_day:    10,
  sym_rejection_pct_60min:   1,
  spread_re_pips_day:        2,
  spread_re_pips_60min:      1,
};

export interface LPSanityRow {
  lp_id:            string;
  lp_name:          string;
  state:            string | null;
  // Pending C++ backend — null until implemented
  latency_ms:       number | null;
  rejection_pct:    number | null;
  // Computed in frontend from WS SESSION_STATE_CHANGE tracking
  uptime_pct:       number | null;
  // From GET_LP_STATUS (for informational tooltip)
  connect_count:    number | null;
  disconnect_count: number | null;
}

export interface SymbolSanityRow {
  lp_symbol:     string;
  // Pending C++ backend — null until implemented
  spread_re:     number | null;
  avg_rt_ms:     number | null;
  volume:        number | null;
  rejection_pct: number | null;
}

// Internal uptime tracking per LP
interface UptimeTracker {
  sessionStart:      number;  // epoch ms when we started tracking this LP
  connectedMs:       number;  // accumulated ms in connected state
  lastConnectedAt:   number | null; // epoch ms of last transition → connected
}

type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

const WS_BADGE: Record<WsStatus, { color: string; label: string }> = {
  connecting:   { color: '#e0a020', label: 'Connecting…'   },
  live:         { color: '#66e07a', label: 'Live'           },
  reconnecting: { color: '#e0a020', label: 'Reconnecting…' },
  error:        { color: '#ff6b6b', label: 'Disconnected'  },
};

// ══════════════════════════════════════════════════════════════
// LP STATE HELPERS
// ══════════════════════════════════════════════════════════════

// Covers both LP state values (CONNECTED) and session state values (LOGGED_ON)
function isConnected(state: string | null): boolean {
  return state === 'CONNECTED' || state === 'LOGGED_ON';
}

const STATE_DOT_COLOR: Record<string, string> = {
  CONNECTED:     '#66e07a',
  LOGGED_ON:     '#66e07a',
  DEGRADED:      '#e0a020',
  RECONNECTING:  '#e0a020',
  CONNECTING:    '#e0a020',
  DISCONNECTED:  '#ff6b6b',
  STOPPED:       '#ff6b6b',
  QUARANTINED:   '#ff6b6b',
  SESSION_ERROR: '#ff6b6b',
};

function stateDotColor(state: string | null): string {
  if (!state) return '#666';
  return STATE_DOT_COLOR[state] ?? '#888';
}

// ══════════════════════════════════════════════════════════════
// UPTIME HELPERS
// ══════════════════════════════════════════════════════════════

function computeUptime(tracker: UptimeTracker, now: number): number {
  const elapsed   = now - tracker.sessionStart;
  if (elapsed <= 0) return 100;
  const connected = tracker.connectedMs +
    (tracker.lastConnectedAt != null ? now - tracker.lastConnectedAt : 0);
  return Math.min(100, (connected / elapsed) * 100);
}

// ══════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ══════════════════════════════════════════════════════════════

const NA = '—';
const fmtPct  = (v: number | null) => v === null ? NA : `${v.toFixed(2)}%`;
const fmtMs   = (v: number | null) => v === null ? NA : `${v.toFixed(0)} ms`;
const fmtPips = (v: number | null) => v === null ? NA : `${v.toFixed(1)} pip`;
const fmtVol  = (v: number | null) => v === null ? NA : v.toLocaleString();

// ══════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((e as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

// ── Route Sanity icon (matches attached SVG) ──────────────────
const RouteSanityIcon = () => (
  <svg height="17" viewBox="0 0 24 24" width="17" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="m24 9.5a3.5 3.5 0 1 0 -5 3.15v3.35a5 5 0 0 1 -10 0v-.151a7.513 7.513 0 0 0 6-7.349v-5a3.5 3.5 0 0 0 -3.5-3.5h-2.5v3h2.5a.5.5 0 0 1 .5.5v5a4.5 4.5 0 0 1 -9 0v-5a.5.5 0 0 1 .5-.5h2.5v-3h-2.5a3.5 3.5 0 0 0 -3.5 3.5v5a7.513 7.513 0 0 0 6 7.349v.151a8 8 0 0 0 16 0v-3.35a3.491 3.491 0 0 0 2-3.15z" />
  </svg>
);

// ── Threshold input row ───────────────────────────────────────
function ThreshRow({
  label, unit, isMin,
  dayVal, minVal,
  onDay, onMin,
}: {
  label:  string;
  unit:   string;
  isMin:  boolean;   // true = threshold is a minimum (e.g. uptime); false = maximum
  dayVal: number;
  minVal: number;
  onDay:  (v: number) => void;
  onMin:  (v: number) => void;
}) {
  const inp = 'w-[72px] bg-[#1c1c20] border border-[#484858] rounded px-2 py-0.5 text-xs text-white ' +
    'placeholder-[#444] focus:outline-none focus:border-[#4ecdc4] font-mono';
  const badge = (txt: string) =>
    <span className="text-[#888] text-[10px] whitespace-nowrap">{txt}</span>;

  return (
    <div className="flex items-center gap-3">
      <span className="text-[#888] text-xs w-[150px] shrink-0">
        {label}
        <span className="text-[#888] ml-1 text-[10px]">({isMin ? 'min' : 'max'})</span>
      </span>
      <div className="flex items-center gap-1.5">
        <input type="number" className={inp} value={dayVal}
          onChange={e => onDay(parseFloat(e.target.value) || 0)} />
        {badge(`${unit} / day`)}
      </div>
      <div className="flex items-center gap-1.5">
        <input type="number" className={inp} value={minVal}
          onChange={e => onMin(parseFloat(e.target.value) || 0)} />
        {badge(`${unit} / 60 min`)}
      </div>
    </div>
  );
}

// ── Grid section header ───────────────────────────────────────
function GridHeader({
  title, sub, count,
}: {
  title: string;
  sub?: string;
  count: number | null;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b border-[#3a3a3c] flex-shrink-0"
      style={{ backgroundColor: '#252427' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[#888] font-semibold">{title}</span>
        {sub && <span className="text-[10px] text-[#4ecdc4] font-mono">{sub}</span>}
      </div>
      {count !== null && (
        <span className="text-[10px] font-mono text-[#777]">
          {count} {count === 1 ? title.slice(0, -1).toLowerCase() : title.toLowerCase()}
        </span>
      )}
    </div>
  );
}

// ── Empty / loading state ─────────────────────────────────────
function GridEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1.5">
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ══════════════════════════════════════════════════════════════

export default function RouteSanityPage() {

  // ── Thresholds (persisted to localStorage) ────────────────
  const [thresholds, setThresholds] = useState<Thresholds>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_THRESHOLDS;
  });
  const [threshOpen, setThreshOpen] = useState(true);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(thresholds)); } catch { /* ignore */ }
  }, [thresholds]);

  function setT<K extends keyof Thresholds>(key: K, val: number) {
    setThresholds(prev => ({ ...prev, [key]: val }));
  }

  // ── Grid data ─────────────────────────────────────────────
  const [lpRows,       setLpRows]       = useState<LPSanityRow[]>([]);
  const [symbolRows,   setSymbolRows]   = useState<SymbolSanityRow[]>([]);
  const [selectedLpId, setSelectedLpId] = useState<string | null>(null);
  const [symLoading,   setSymLoading]   = useState(false);

  // ── Loading / error ───────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── WS ────────────────────────────────────────────────────
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  // ── Refs ──────────────────────────────────────────────────
  const wsRef      = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const unmountRef = useRef(false);

  // Uptime tracking state — Map<lp_id, UptimeTracker>
  // Mutated directly (not React state) to avoid render-per-tick overhead.
  const uptimeMap  = useRef<Map<string, UptimeTracker>>(new Map());

  const lpGridRef  = useRef<AgGridReact<LPSanityRow>>(null);
  const symGridRef = useRef<AgGridReact<SymbolSanityRow>>(null);

  // ── Uptime 5-second tick ──────────────────────────────────
  // Recomputes uptime_pct for every LP row and updates state.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setLpRows(prev =>
        prev.map(row => {
          const tracker = uptimeMap.current.get(row.lp_id);
          if (!tracker) return row;
          return { ...row, uptime_pct: computeUptime(tracker, now) };
        })
      );
    }, UPTIME_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── Fetch LP list ─────────────────────────────────────────
  const fetchLPs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; data: { lps: any[] } }>(
        '/api/v1/route-sanity/lps'
      );
      const now  = Date.now();
      const rows: LPSanityRow[] = res.data.lps.map(lp => {
        const connected = isConnected(lp.state);
        uptimeMap.current.set(lp.lp_id, {
          sessionStart:    now,
          connectedMs:     0,
          lastConnectedAt: connected ? now : null,
        });
        return {
          lp_id:            lp.lp_id,
          lp_name:          lp.lp_name,
          state:            lp.state,
          latency_ms:       null,
          uptime_pct:       connected ? 100 : 0,
          rejection_pct:    null,
          connect_count:    lp.connect_count,
          disconnect_count: lp.disconnect_count,
        };
      });
      setLpRows(rows);
      // Auto-select first LP if none selected
      setSelectedLpId(prev => (prev ?? (rows[0]?.lp_id ?? null)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLPs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch instruments for selected LP ────────────────────
  useEffect(() => {
    if (!selectedLpId) { setSymbolRows([]); return; }
    setSymLoading(true);
    api<{ success: boolean; data: { instruments: any[] } }>(
      `/api/v1/route-sanity/lp/${selectedLpId}/instruments`
    )
      .then(res => {
        const rows: SymbolSanityRow[] = (res.data.instruments ?? []).map(i => ({
          lp_symbol:     i.symbol,
          spread_re:     null,
          avg_rt_ms:     null,
          volume:        null,
          rejection_pct: null,
        }));
        setSymbolRows(rows);
      })
      .catch(() => setSymbolRows([]))
      .finally(() => setSymLoading(false));
  }, [selectedLpId]);

  // ── WebSocket ─────────────────────────────────────────────
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
      const now = (timestamp_ms as number) ?? Date.now();

      // Mutate uptime tracker
      const tracker = uptimeMap.current.get(lp_id);
      if (tracker) {
        const wasConnected = tracker.lastConnectedAt !== null;
        const nowConnected = isConnected(new_state as string);

        if (wasConnected && !nowConnected) {
          // Transition: connected → disconnected; bank elapsed connected time
          tracker.connectedMs  += now - tracker.lastConnectedAt!;
          tracker.lastConnectedAt = null;
        } else if (!wasConnected && nowConnected) {
          // Transition: disconnected → connected
          tracker.lastConnectedAt = now;
        }
      }

      // Update LP row: state + recomputed uptime
      setLpRows(prev =>
        prev.map(row => {
          if (row.lp_id !== lp_id) return row;
          const t = uptimeMap.current.get(lp_id);
          return {
            ...row,
            state:      new_state as string,
            uptime_pct: t ? computeUptime(t, now) : row.uptime_pct,
          };
        })
      );
    };

    ws.onerror = () => {
      if (!unmountRef.current) setWsStatus('error');
    };

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
    return () => {
      unmountRef.current = true;
      wsRef.current?.close();
    };
  }, [connectWs]);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    wsRef.current?.close();
    connectWs();
  }, [connectWs]);

  // ── LP Grid ColDefs ───────────────────────────────────────
  // Recreated when thresholds change so cellStyle functions
  // always reference the current threshold values.
  const lpColDefs = useMemo<ColDef<LPSanityRow>[]>(() => {
    const t   = thresholds;
    const AMB = '#e0a020';
    const AMB_BG = 'rgba(224,160,32,0.08)';

    return [
      {
        field:       'lp_name',
        headerName:  'LP',
        flex:        1,
        minWidth:    140,
        cellRenderer: (params: ICellRendererParams<LPSanityRow>) => {
          const row = params.data!;
          // Amber LP name if ANY route-level threshold is breached
          const anyBreach =
            (row.latency_ms    !== null && row.latency_ms    > t.latency_ms_day)        ||
            (row.uptime_pct    !== null && row.uptime_pct    < t.uptime_pct_day)         ||
            (row.rejection_pct !== null && row.rejection_pct > t.lp_rejection_pct_day);

          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: '100%' }}>
              {/* Connection state dot */}
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: stateDotColor(row.state),
                flexShrink: 0,
              }} />
              <span style={{
                color:      anyBreach ? AMB : '#fff',
                fontWeight: anyBreach ? 600  : 400,
              }}>
                {row.lp_name}
              </span>
              {anyBreach && (
                <span style={{ color: AMB, fontSize: 10, marginLeft: 'auto' }}>▲</span>
              )}
            </div>
          );
        },
        tooltipValueGetter: (p) => {
          const r = p.data;
          if (!r) return '';
          return [
            `ID: ${r.lp_id}`,
            `State: ${r.state ?? 'unknown'}`,
            r.connect_count    !== null ? `Connects: ${r.connect_count}`    : null,
            r.disconnect_count !== null ? `Disconnects: ${r.disconnect_count}` : null,
          ].filter(Boolean).join('\n');
        },
      },
      {
        field:          'latency_ms',
        headerName:     'Latency',
        width:          96,
        type:           'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > t.latency_ms_day)
            return { color: AMB, backgroundColor: AMB_BG };
          return { color: v === null ? '#888' : '#ccc' };
        },
        headerTooltip: `Max acceptable: ${t.latency_ms_day} ms/day · ${t.latency_ms_60min} ms/60 min`,
      },
      {
        field:          'uptime_pct',
        headerName:     'Uptime',
        width:          96,
        type:           'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v < t.uptime_pct_day)
            return { color: AMB, backgroundColor: AMB_BG };
          if (v !== null)
            return { color: '#66e07a' };
          return { color: '#888' };
        },
        headerTooltip: `Min acceptable: ${t.uptime_pct_day}%/day · ${t.uptime_pct_60min}%/60 min`,
      },
      {
        field:          'rejection_pct',
        headerName:     'Rejection',
        width:          96,
        type:           'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > t.lp_rejection_pct_day)
            return { color: AMB, backgroundColor: AMB_BG };
          return { color: v === null ? '#888' : '#ccc' };
        },
        headerTooltip: `Max acceptable: ${t.lp_rejection_pct_day}%/day · ${t.lp_rejection_pct_60min}%/60 min`,
      },
    ];
  }, [thresholds]);

  // ── Symbol Grid ColDefs ───────────────────────────────────
  const symColDefs = useMemo<ColDef<SymbolSanityRow>[]>(() => {
    const t   = thresholds;
    const AMB = '#e0a020';
    const AMB_BG = 'rgba(224,160,32,0.08)';

    return [
      {
        field:      'lp_symbol',
        headerName: 'Symbol',
        flex:       1,
        minWidth:   90,
        cellStyle:  { color: '#fff', fontWeight: 600 },
      },
      {
        field:          'spread_re',
        headerName:     'Spread R/E',
        width:          106,
        type:           'rightAligned',
        valueFormatter: p => fmtPips(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > t.spread_re_pips_day)
            return { color: AMB, backgroundColor: AMB_BG };
          return { color: v === null ? '#888' : '#ccc' };
        },
        headerTooltip: `LP fill − MT5 fill (pips). Max: ${t.spread_re_pips_day} pip/day · ${t.spread_re_pips_60min} pip/60 min`,
      },
      {
        field:          'avg_rt_ms',
        headerName:     'Avg RT',
        width:          86,
        type:           'rightAligned',
        valueFormatter: p => fmtMs(p.value),
        cellStyle:      { color: '#888' },
        headerTooltip:  'Average round-trip time (NOS → ExecutionReport)',
      },
      {
        field:          'volume',
        headerName:     'Vol',
        width:          86,
        type:           'rightAligned',
        valueFormatter: p => fmtVol(p.value),
        cellStyle:      { color: '#888' },
        headerTooltip:  'Total routed volume today',
      },
      {
        field:          'rejection_pct',
        headerName:     'Rejection',
        width:          96,
        type:           'rightAligned',
        valueFormatter: p => fmtPct(p.value),
        cellStyle: p => {
          const v = p.value as number | null;
          if (v !== null && v > t.sym_rejection_pct_day)
            return { color: AMB, backgroundColor: AMB_BG };
          return { color: v === null ? '#888' : '#ccc' };
        },
        headerTooltip: `Max: ${t.sym_rejection_pct_day}%/day · ${t.sym_rejection_pct_60min}%/60 min`,
      },
    ];
  }, [thresholds]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    sortable:  true,
    suppressMovable: false,
  }), []);

  // ── LP row click → load symbols ───────────────────────────
  const onLpRowClicked = useCallback((e: RowClickedEvent<LPSanityRow>) => {
    const id = e.data?.lp_id;
    if (id) setSelectedLpId(id);
  }, []);

  const onLpGridReady  = useCallback((e: GridReadyEvent) => { e.api.sizeColumnsToFit(); }, []);
  const onSymGridReady = useCallback((e: GridReadyEvent) => { e.api.sizeColumnsToFit(); }, []);

  // ── Derived values ────────────────────────────────────────
  const wsBadge    = WS_BADGE[wsStatus];
  const selectedLp = lpRows.find(r => r.lp_id === selectedLpId);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#252427' }}>

      {/* ── Page header ──────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-[#808080] flex-shrink-0"
        style={{ backgroundColor: '#252427' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[#4ecdc4]"><RouteSanityIcon /></span>
          <span className="text-sm font-semibold text-white tracking-wide">Route Sanity</span>
          <span className="text-[#505050] text-[10px] font-mono ml-1">Today</span>
        </div>

        <div className="flex items-center gap-3">
          {/* WS badge */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: wsBadge.color }}
            />
            <span className="text-[10px] font-mono" style={{ color: wsBadge.color }}>
              {wsBadge.label}
            </span>
          </div>

          {wsStatus === 'error' && (
            <button
              onClick={reconnect}
              className="text-xs text-[#999] border border-[#444] rounded px-2 py-0.5 hover:text-white hover:border-[#888] transition-colors"
            >
              ↻ Reconnect
            </button>
          )}

          <button
            onClick={fetchLPs}
            disabled={loading}
            className="text-xs text-[#999] border border-[#404040] rounded px-3 py-0.5 hover:text-white hover:border-[#888] transition-colors disabled:opacity-40"
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="px-4 py-1.5 border-b border-[#ff6b6b] text-xs text-[#ff6b6b] bg-[#2c1a1a] flex-shrink-0 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={fetchLPs} className="underline hover:no-underline ml-3 text-[#ff6b6b]">
            Retry
          </button>
        </div>
      )}

      {/* ── Threshold configuration panel ────────────────── */}
      <div
        className="flex-shrink-0 border-b border-[#3a3a3c]"
        style={{ backgroundColor: '#1c1c20' }}
      >
        {/* Panel header / toggle */}
        <button
          onClick={() => setThreshOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#222226] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[#888] font-semibold">
              Threshold Configuration
            </span>
            <span className="text-[10px] text-[#777] font-mono">
              (amber highlight when breached)
            </span>
          </div>
          <svg
            className={`w-3 h-3 text-[#888] transition-transform ${threshOpen ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {threshOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-x-12 gap-y-3">

            {/* ── Left: Route-level thresholds ─────────── */}
            <div>
              <div className="text-[10px] text-[#4ecdc4] uppercase tracking-wider mb-2.5 font-semibold">
                Route Level &nbsp;<span className="text-[#777] normal-case tracking-normal">per LP</span>
              </div>
              <div className="space-y-2">
                <ThreshRow
                  label="Latency" unit="ms" isMin={false}
                  dayVal={thresholds.latency_ms_day}
                  minVal={thresholds.latency_ms_60min}
                  onDay={v => setT('latency_ms_day', v)}
                  onMin={v => setT('latency_ms_60min', v)}
                />
                <ThreshRow
                  label="Uptime" unit="%" isMin={true}
                  dayVal={thresholds.uptime_pct_day}
                  minVal={thresholds.uptime_pct_60min}
                  onDay={v => setT('uptime_pct_day', v)}
                  onMin={v => setT('uptime_pct_60min', v)}
                />
                <ThreshRow
                  label="Order Rejection" unit="%" isMin={false}
                  dayVal={thresholds.lp_rejection_pct_day}
                  minVal={thresholds.lp_rejection_pct_60min}
                  onDay={v => setT('lp_rejection_pct_day', v)}
                  onMin={v => setT('lp_rejection_pct_60min', v)}
                />
              </div>
            </div>

            {/* ── Right: Symbol-level thresholds ────────── */}
            <div>
              <div className="text-[10px] text-[#4ecdc4] uppercase tracking-wider mb-2.5 font-semibold">
                Symbol Level &nbsp;<span className="text-[#777] normal-case tracking-normal">per LP symbol</span>
              </div>
              <div className="space-y-2">
                <ThreshRow
                  label="Order Rejection" unit="%" isMin={false}
                  dayVal={thresholds.sym_rejection_pct_day}
                  minVal={thresholds.sym_rejection_pct_60min}
                  onDay={v => setT('sym_rejection_pct_day', v)}
                  onMin={v => setT('sym_rejection_pct_60min', v)}
                />
                <ThreshRow
                  label="Spread R/E" unit="pip" isMin={false}
                  dayVal={thresholds.spread_re_pips_day}
                  minVal={thresholds.spread_re_pips_60min}
                  onDay={v => setT('spread_re_pips_day', v)}
                  onMin={v => setT('spread_re_pips_60min', v)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Two side-by-side grids ────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-2 gap-2">

        {/* ── Left: LP Sanity Grid ─────────────────────── */}
        <div
          className="flex flex-col overflow-hidden border border-[#3a3a3c] rounded"
          style={{ width: '38%', minWidth: 300 }}
        >
          <GridHeader
            title="Liquidity Providers"
            count={lpRows.length}
          />

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#313032' }}>
            {loading && lpRows.length === 0 ? (
              <GridEmpty>
                <span className="text-[#888] text-xs font-mono">Loading…</span>
              </GridEmpty>
            ) : !loading && lpRows.length === 0 ? (
              <GridEmpty>
                <p className="text-[#888] text-xs">No enabled LPs found</p>
                <p className="text-[#777] text-[10px] font-mono">
                  Enable LPs in the Liquidity Providers page
                </p>
              </GridEmpty>
            ) : (
              <AgGridReact<LPSanityRow>
                ref={lpGridRef}
                theme={gridTheme}
                rowData={lpRows}
                columnDefs={lpColDefs}
                defaultColDef={defaultColDef}
                rowHeight={26}
                headerHeight={32}
                getRowId={p => p.data.lp_id}
                rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
                onRowClicked={onLpRowClicked}
                onGridReady={onLpGridReady}
                tooltipShowDelay={400}
                getRowStyle={p =>
                  p.data?.lp_id === selectedLpId
                    ? { backgroundColor: '#1e2535' }
                    : undefined
                }
              />
            )}
          </div>
        </div>

        {/* ── Right: Symbol Sanity Grid ────────────────── */}
        <div
          className="flex flex-col overflow-hidden border border-[#3a3a3c] rounded flex-1"
        >
          <GridHeader
            title="Symbols"
            sub={selectedLp?.lp_name}
            count={symbolRows.length}
          />

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#313032' }}>
            {!selectedLpId ? (
              <GridEmpty>
                <p className="text-[#888] text-xs font-mono">Select an LP to view symbols</p>
              </GridEmpty>
            ) : symLoading ? (
              <GridEmpty>
                <span className="text-[#888] text-xs font-mono">Loading symbols…</span>
              </GridEmpty>
            ) : symbolRows.length === 0 ? (
              <GridEmpty>
                <p className="text-[#888] text-xs">No instruments loaded</p>
                <p className="text-[#777] text-[10px] font-mono">
                  Connect the LP to populate instrument definitions
                </p>
              </GridEmpty>
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
                onGridReady={onSymGridReady}
                tooltipShowDelay={400}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-1 border-t border-[#2a2a2c] flex-shrink-0"
        style={{ backgroundColor: '#1a1a1c' }}
      >
        <span className="text-[10px] text-[#777] font-mono">
          Latency · Rejection · Spread R/E pending C++ backend implementation
        </span>
        <span className="text-[10px] text-[#777] font-mono">
          Uptime tracked from session start · Hover column headers for threshold info
        </span>
      </div>
    </div>
  );
}