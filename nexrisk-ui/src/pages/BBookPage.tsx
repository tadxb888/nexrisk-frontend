import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

import { BBookCharts } from '@/components/charts/BBookCharts';
import { mt5Api, connectBBookWebSocket, type MT5PositionWithNode, type MT5NodeAPI, type BBookWsEvent } from '@/services/api';
import { fmtHdrMoney, fmtHdrCompact, pnlColor, usePortfolioStats } from '@/stores/PortfolioStatsContext';

// ======================
// THEME (Quartz dark)
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
export interface BBookPosition {
  login: number;
  symbol: string;
  position_id: number;
  time: string;        // ISO string (derived from time_create unix seconds)
  type: 'BUY' | 'SELL';
  volume: number;      // volume_lots
  price_open: number;
  sl: number | null;   // price_sl — 0 mapped to null
  tp: number | null;   // price_tp — 0 mapped to null
  price_current: number;
  profit: number;
  swap: number;
  commission: number;
  hedge: 'No' | 'Rule' | 'Manual';   // reserved for future hedge logic
  lp: string | null;                  // reserved for future LP routing
  group: string;                      // MT5 group (not provided per-position; shown if available)
  server: string;                     // node name
}

export type BBookStreamMsg = {
  upsert?: BBookPosition[];
  remove?: string[];
};

// ======================
// WS CONNECTION STATUS
// ======================
type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

// ======================
// FIELD MAPPING
// ======================
function mapPosition(raw: MT5PositionWithNode): BBookPosition {
  return {
    login:         raw.login,
    symbol:        raw.symbol,
    position_id:   raw.position_id,
    time:          new Date(raw.time_create * 1000).toISOString(),
    type:          raw.action === 'BUY' ? 'SELL' : 'BUY',  // broker takes opposite side
    volume:        raw.volume_lots,
    price_open:    raw.price_open,
    price_current: raw.price_current,
    sl:            raw.price_sl  !== 0 ? raw.price_sl  : null,
    tp:            raw.price_tp  !== 0 ? raw.price_tp  : null,
    profit:        -raw.profit,  // broker P&L is inverse of client
    swap:          raw.swap,
    commission:    raw.commission,
    hedge:         'No',
    lp:            null,
    group:         '',
    server:        raw.nodeName,
  };
}

// ======================
// HELPERS
// ======================
const fmtNum = (dp: number) => (p: ValueFormatterParams) => {
  const v = p.value;
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toFixed(dp);
};

const fmtPrice = (p: ValueFormatterParams) => {
  const v = p.value;
  const sym = p.data?.symbol || '';
  if (v === null || v === undefined) return '';
  if (sym.includes('JPY')) return Number(v).toFixed(3);
  if (sym.includes('XAU') || sym.includes('BTC')) return Number(v).toFixed(2);
  return Number(v).toFixed(5);
};

const getRowId = (r: BBookPosition) => `${r.position_id}|${r.login}|${r.symbol}`;

// ======================
// useBBookWebSocket hook
// ======================
/**
 * Manages the WebSocket connection to the B-Book feed.
 * Reconnects with exponential back-off (1s → 2s → 4s … cap 30s).
 * On every (re)connect the backend automatically sends a SNAPSHOT,
 * so no separate REST fetch is needed on reconnect.
 */
function useBBookWebSocket(opts: {
  onSnapshot:  (positions: BBookPosition[]) => void;
  onUpsert:    (position: BBookPosition)    => void;
  onMerge:     (delta: Partial<MT5PositionWithNode> & { position_id: number }) => void;
  onRemove:    (positionId: number)         => void;
  onStatus:    (s: WsStatus)                => void;
}) {
  const retryRef      = useRef(0);
  const mountedRef    = useRef(true);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef    = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    opts.onStatus('connecting');

    const cleanup = connectBBookWebSocket(
      (ev: BBookWsEvent) => {
        if (ev.type === 'SNAPSHOT') {
          const raw = ev.data as MT5PositionWithNode[];
          opts.onSnapshot(raw.map(mapPosition));

        } else if (ev.type === 'POSITION_ADD') {
          // Full position object — safe to map fully
          opts.onUpsert(mapPosition(ev.data as MT5PositionWithNode));

        } else if (ev.type === 'POSITION_CHANGE') {
          // Backend sends only changed fields — merge into existing row
          const d = ev.data as Partial<MT5PositionWithNode> & { position_id: number };
          opts.onMerge(d);

        } else if (ev.type === 'POSITION_DELETE') {
          const d = ev.data as { position_id: number };
          opts.onRemove(d.position_id);
        }
        // subscribed / pong ACKs silently ignored
      },
      (status) => {
        if (status === 'open') {
          retryRef.current = 0;
          opts.onStatus('live');
        } else if (status === 'closed' || status === 'error') {
          if (!mountedRef.current) return;
          opts.onStatus(status === 'error' ? 'error' : 'reconnecting');
          const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
          retryRef.current++;
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        }
      }
    );

    cleanupRef.current = cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cleanupRef.current?.();
    };
  }, [connect]);
}

// ======================
// COMPONENT
// ======================
export function BBookPage() {
  const gridRef = useRef<AgGridReact<BBookPosition>>(null);
  const [chartsCollapsed, setChartsCollapsed] = useState(false);

  // ── Data state ──────────────────────────────────────────────
  const [positions,   setPositions]   = useState<BBookPosition[]>([]);
  const [activeNodes, setActiveNodes] = useState<MT5NodeAPI[]>([]);
  const [wsStatus,    setWsStatus]    = useState<WsStatus>('connecting');
  const [error,       setError]       = useState<string | null>(null);
  // lastEventAt: setter only — value no longer surfaced in UI but kept so that
  // future debug overlays / LP sync indicators can read it without re-wiring.
  const [, setLastEventAt] = useState<Date | null>(null);

  // Filter state
  const [groupInput,   setGroupInput]   = useState('');
  const [symbolInput,  setSymbolInput]  = useState('');
  // Defaults to '' until the master node is resolved, then snaps to the master's name.
  // No "All Servers" option — single-node-at-a-time only.
  const [filterServer, setFilterServer] = useState<string>('');

  // Lots / Units toggle for the Volume cell on the B-Book card.
  const [volumeDisplayMode, setVolumeDisplayMode] = useState<'Lots' | 'Units'>('Lots');

  // Period-scoped values (Realized P/L, Cost components, Unrealized P/L delta,
  // C-Book volume for the hedge ratio) come from the shared Portfolio summary
  // hook. The TopBar period selector ("Today" / "This Month") drives both this
  // page and the Portfolio page from the same state — no local subscription.
  const portfolio = usePortfolioStats();

  // Row index for O(1) upsert/remove
  const rowIndexRef = useRef<Map<string, BBookPosition>>(new Map());
  useEffect(() => {
    const m = new Map<string, BBookPosition>();
    for (const r of positions) m.set(getRowId(r), r);
    rowIndexRef.current = m;
  }, [positions]);

  // Force AG Grid to refresh cells when positions array is replaced wholesale
  // (AG Grid delta-matches by row ID and skips unchanged rows otherwise)
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true });
  }, [positions]);

  // One-time node list fetch (nodes don't change at position frequency)
  useEffect(() => {
    mt5Api.getNodes()
      .then(({ nodes }) => {
        const connected = nodes.filter(n => n.connection_status === 'CONNECTED');
        setActiveNodes(connected);
        // Default the selector to the MASTER node. If for any reason no node
        // is flagged as master, fall back to the first connected node so the
        // page still renders something sensible.
        const master = connected.find(n => n.is_master) ?? connected[0];
        if (master) setFilterServer(prev => prev === '' ? master.node_name : prev);
      })
      .catch(() => { /* non-fatal — node badges just won't show */ });
  }, []);

  // ── WebSocket handlers ───────────────────────────────────────
  const handleSnapshot = useCallback((snap: BBookPosition[]) => {
    setPositions(snap);
    setLastEventAt(new Date());
    setError(null);
  }, []);

  const handleUpsert = useCallback((pos: BBookPosition) => {
    setPositions(prev => {
      const key = getRowId(pos);
      const idx = prev.findIndex(p => getRowId(p) === key);
      if (idx === -1) return [...prev, pos];
      const next = [...prev];
      next[idx] = pos;
      return next;
    });
    setLastEventAt(new Date());
  }, []);

  const handleMerge = useCallback((delta: Partial<MT5PositionWithNode> & { position_id: number }) => {
    setPositions(prev => {
      const idx = prev.findIndex(p => p.position_id === delta.position_id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...prev[idx],
        ...(delta.price_current !== undefined && { price_current: delta.price_current }),
        ...(delta.profit        !== undefined && { profit: -delta.profit }),
        ...(delta.swap          !== undefined && { swap: delta.swap }),
        ...(delta.commission    !== undefined && { commission: delta.commission }),
      };
      return next;
    });
    setLastEventAt(new Date());
  }, []);

  const handleRemove = useCallback((positionId: number) => {
    setPositions(prev => prev.filter(p => p.position_id !== positionId));
    setLastEventAt(new Date());
  }, []);

  useBBookWebSocket({
    onSnapshot: handleSnapshot,
    onUpsert:   handleUpsert,
    onMerge:    handleMerge,
    onRemove:   handleRemove,
    onStatus:   setWsStatus,
  });

  // Manual force-refresh via REST (fallback if WS gets out of sync)
  const fetchPositions = useCallback(async () => {
    setError(null);
    try {
      const { positions: raw, nodes } = await mt5Api.getAllBBookPositions();
      setActiveNodes(nodes);
      setPositions(raw.map(p => mapPosition(p)));
      setLastEventAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load B-Book positions');
    }
  }, []);

  // Fetch on mount so positions load immediately regardless of WS snapshot timing
  useEffect(() => {
    fetchPositions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived filter options ──────────────────────────────────
  const uniqueLogins  = useMemo(() => Array.from(new Set(positions.map(p => String(p.login)))).sort(), [positions]);
  const uniqueSymbols = useMemo(() => Array.from(new Set(positions.map(p => p.symbol))).sort(), [positions]);
  const uniqueGroups  = useMemo(() => Array.from(new Set(positions.map(p => p.group).filter(Boolean))).sort(), [positions]);
  const uniqueServers = useMemo(() => activeNodes.map(n => n.node_name).sort(), [activeNodes]);

  // ── Filtered positions ──────────────────────────────────────
  const filteredPositions = useMemo(() => {
    const gTerm = groupInput.trim().toUpperCase();
    const sTerm = symbolInput.trim().toUpperCase();

    return positions.filter(p => {
      if (gTerm) {
        const matchesGroup = p.group.toUpperCase().includes(gTerm);
        const matchesLogin = String(p.login).includes(gTerm);
        if (!matchesGroup && !matchesLogin) return false;
      }
      if (sTerm && !p.symbol.toUpperCase().includes(sTerm)) return false;
      // filterServer is empty only during the initial load (before the master
      // node has been resolved). In that brief window, show everything; once
      // the selector snaps to the master, this filter narrows to that node.
      if (filterServer !== '' && p.server !== filterServer) return false;
      return true;
    });
  }, [positions, groupInput, symbolInput, filterServer]);

  // ======================
  // COLUMN DEFINITIONS
  // ======================
  const columnDefs = useMemo<ColDef<BBookPosition>[]>(() => [
    { field: 'login',       headerName: 'Login ID',   filter: 'agNumberColumnFilter', width: 120, pinned: 'left' },
    { field: 'symbol',      headerName: 'Symbol',     filter: 'agSetColumnFilter',    width: 110, pinned: 'left' },
    { field: 'position_id', headerName: 'Position ID', filter: 'agNumberColumnFilter', width: 120 },
    {
      field: 'time',
      headerName: 'Open Time',
      filter: 'agDateColumnFilter',
      sort: 'desc',
      width: 160,
      valueFormatter: (p) => p.value
        ? new Date(p.value).toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          }).replace(',', '')
        : '',
    },
    {
      field: 'type',
      headerName: 'Type',
      filter: 'agSetColumnFilter',
      width: 90,
      cellRenderer: (p: { value: string }) => (
        <span style={{ color: p.value === 'BUY' ? '#49b3b3' : '#e0a020' }}>{p.value}</span>
      ),
    },
    { field: 'volume',        headerName: 'Volume',   filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2),  width: 100, type: 'rightAligned' },
    { field: 'price_open',    headerName: 'Open Price', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice,   width: 110, type: 'rightAligned' },
    { field: 'sl',            headerName: 'S/L',      filter: 'agNumberColumnFilter', valueFormatter: fmtPrice,   width: 110, type: 'rightAligned' },
    { field: 'tp',            headerName: 'T/P',      filter: 'agNumberColumnFilter', valueFormatter: fmtPrice,   width: 110, type: 'rightAligned' },
    { field: 'price_current', headerName: 'Current',  filter: 'agNumberColumnFilter', valueFormatter: fmtPrice,   width: 110, type: 'rightAligned' },
    {
      field: 'profit',
      headerName: 'Profit',
      filter: 'agNumberColumnFilter',
      width: 120,
      type: 'rightAligned',
      cellRenderer: (p: { value: number }) => {
        const val = p.value;
        const color = val > 0 ? '#66e07a' : val < 0 ? '#ff5c5c' : '#999';
        const prefix = val >= 0 ? '$' : '-$';
        return <span style={{ color }}>{prefix}{Math.abs(val).toFixed(2)}</span>;
      },
    },
    { field: 'swap',       headerName: 'Swap',       filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2), width: 90,  type: 'rightAligned' },
    { field: 'commission', headerName: 'Commission', filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2), width: 110, type: 'rightAligned' },
    { field: 'hedge',  headerName: 'Hedge',  filter: 'agSetColumnFilter', width: 90, filterParams: { values: ['No', 'Rule', 'Manual'] } },
    { field: 'lp',     headerName: 'LP',     filter: 'agSetColumnFilter', width: 90, valueFormatter: (p: ValueFormatterParams) => p.value || '' },
    { field: 'group',  headerName: 'Group',  filter: 'agSetColumnFilter', width: 90  },
    { field: 'server', headerName: 'Server', filter: 'agSetColumnFilter', width: 140 },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 80,
    flex: 1,
  }), []);

  const rowSelection = useMemo<RowSelectionOptions>(() => ({
    mode: 'multiRow',
    enableClickSelection: true,
    checkboxes: true,
    headerCheckbox: true,
  }), []);

  const gridOptions = useMemo<GridOptions<BBookPosition>>(() => ({
    enableAdvancedFilter: true,
    sideBar: { toolPanels: ['columns', 'filters'], defaultToolPanel: '' },
    columnHoverHighlight: true,
    animateRows: false,
    rowBuffer: 20,
    debounceVerticalScrollbar: true,
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent' },
        { statusPanel: 'agSelectedRowCountComponent' },
        { statusPanel: 'agAggregationComponent' },
      ],
    },
  }), []);

  const onGridReady = useCallback((_event: GridReadyEvent) => {
    setTimeout(() => gridRef.current?.api?.autoSizeAllColumns(), 0);
  }, []);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
    const rowData = params.node?.data as BBookPosition | undefined;
    return [
      { name: 'Pin Row to Top', action: () => console.log('Pin:', rowData) },
      { name: 'Unpin Row',      action: () => console.log('Unpin:', rowData) },
      'separator',
      'copy',
      'copyWithHeaders',
      'separator',
      { name: 'Export to CSV',   action: () => params.api.exportDataAsCsv() },
      { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
      'separator',
      { name: 'Market Depth Trader', action: () => console.log('Market Depth:', rowData) },
      { name: 'Telegram',            action: () => console.log('Telegram:', rowData) },
    ];
  }, []);

  // ======================
  // STATS — live positions only
  // ======================
  const stats = useMemo(() => {
    const src = filteredPositions;
    const totalPnL  = src.reduce((s, p) => s + p.profit, 0);
    const totalSwap = src.reduce((s, p) => s + (p.swap ?? 0), 0);
    const totalComm = src.reduce((s, p) => s + (p.commission ?? 0), 0);
    const totalLots = src.reduce((s, p) => s + p.volume, 0);
    // Units = lots × contract size. We don't have per-symbol contract sizes
    // wired into the page yet — assume the FX standard 100,000 for now.
    // For symbols where this is wrong (XAU, BTC, indices), the Units number
    // will be off until per-symbol contract sizes are surfaced.
    const totalUnits = totalLots * 100_000;
    return {
      total:       src.length,
      buyCount:    src.filter(p => p.type === 'BUY').length,
      sellCount:   src.filter(p => p.type === 'SELL').length,
      totalVolume: totalLots,
      totalUnits,
      totalPnL,
      netPnL:      totalPnL + totalSwap + totalComm,
      hedgedCount: src.filter(p => p.hedge !== 'No').length,
    };
  }, [filteredPositions]);

  const hasActiveFilters = groupInput.trim() !== '' || symbolInput.trim() !== '';

  // ── Period-scoped derived values for the B-Book card ─────────────────────
  // Source: usePortfolioStats() — the same hook the Portfolio page uses.
  // Period follows the TopBar selector (Today / This Month). Each value is
  // null when the WS hasn't snapped yet, and the card shows '—' for those.
  //
  // Unrealized P/L is already period-scoped on the wire:
  //   period_unrealized = live_floating - baseline_unrealized_eod
  // where the baseline is yesterday's EOD for Today, last-day-of-prev-month
  // for This Month. Computed in PortfolioBroadcaster.cpp.
  const periodCost = useMemo(() => {
    const c = portfolio.bbook.commissions;
    const s = portfolio.bbook.swaps;
    const r = portfolio.bbook.rebates;
    if (c == null && s == null && r == null) return null;
    return (c ?? 0) + (s ?? 0) + (r ?? 0);
  }, [portfolio.bbook.commissions, portfolio.bbook.swaps, portfolio.bbook.rebates]);

  // Hedge Ratio = C-Book volume / B-Book volume × 100, both for the selected
  // period. Same-units comparison (both are lots from the broadcaster), so
  // the Lots/Units toggle doesn't affect the ratio. Returns null when either
  // side hasn't loaded; '' when B-volume is zero (rendered as the "- -" placeholder).
  const hedgeRatioPct: number | '' | null = useMemo(() => {
    const bVol = portfolio.bbook.volume;
    const cVol = portfolio.cbook.volume;
    if (bVol == null || cVol == null) return null;
    if (bVol === 0) return '';
    return (cVol / bVol) * 100;
  }, [portfolio.bbook.volume, portfolio.cbook.volume]);

  // ======================
  // RENDER
  // ======================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* Page Header — title on left, B-Book card right-aligned */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-lg font-semibold text-white">B-Book</h1>
        </div>

        {/* ── B-Book card — 7 cells: title | Long/Short | Volume | Unrealized | Realized | Cost | Hedge Ratio ──
           Live cells (positions, Long/Short, Volume) reflect open positions right now.
           Period cells (Unrealized/Realized/Cost/Hedge Ratio) follow the TopBar period selector. */}
        <div
          className="inline-flex items-stretch gap-2 rounded px-2 py-1 ml-auto"
          style={{
            backgroundColor: '#252429',
            border: '1px solid #49b3b344',
            borderLeft: '3px solid #49b3b3',
          }}
          title="B-Book card. Live cells reflect open positions; Unrealized/Realized P/L, Cost and Hedge Ratio follow the period selector in the top bar."
        >
          {/* Cell 1 — Card name + position count */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">B-Book</div>
            <div className="text-xs font-mono text-white">{stats.total} pos</div>
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 2 — Long / Short */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Long / Short</div>
            <div className="text-xs font-mono">
              <span style={{ color: '#49b3b3' }}>{stats.buyCount}</span>
              <span className="text-[#505050]"> / </span>
              <span style={{ color: '#e0a020' }}>{stats.sellCount}</span>
            </div>
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 3 — Volume (Lots / Units toggle).
             Title rendered as a <button> styled to match neighboring <div> titles
             (block, p-0, leading-tight, bg-transparent) so the row baseline aligns.
             Painted in the brand teal #49b3b3 to signal it's clickable. */}
          <div>
            <button
              type="button"
              onClick={() => setVolumeDisplayMode(m => m === 'Lots' ? 'Units' : 'Lots')}
              className="block p-0 m-0 mb-0.5 leading-tight bg-transparent border-0 text-[10px] uppercase tracking-wider hover:opacity-80 transition-opacity cursor-pointer"
              style={{ color: '#49b3b3' }}
              title="Click to toggle between Lots and Units"
            >
              Volume ({volumeDisplayMode})
            </button>
            <div className="text-xs font-mono text-white">
              {volumeDisplayMode === 'Lots'
                ? fmtHdrCompact(stats.totalVolume, '')
                : fmtHdrCompact(stats.totalUnits, '')}
            </div>
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 4 — Unrealized P/L (period-scoped: live floating - baseline_eod) */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Unrealized P/L</div>
            {portfolio.bbook.unrealized != null ? (
              <div className="text-xs font-mono" style={{ color: pnlColor(portfolio.bbook.unrealized) }}>
                {fmtHdrMoney(portfolio.bbook.unrealized)}
              </div>
            ) : (
              <div className="text-xs font-mono text-[#d2d6e2]">—</div>
            )}
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 5 — Realized P/L (period rollup) */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Realized P/L</div>
            {portfolio.bbook.realized != null ? (
              <div className="text-xs font-mono" style={{ color: pnlColor(portfolio.bbook.realized) }}>
                {fmtHdrMoney(portfolio.bbook.realized)}
              </div>
            ) : (
              <div className="text-xs font-mono text-[#d2d6e2]">—</div>
            )}
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 6 — Cost (period: commissions + swaps + rebates) */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Cost</div>
            {periodCost != null ? (
              <div className="text-xs font-mono" style={{ color: pnlColor(periodCost) }}>
                {fmtHdrMoney(periodCost)}
              </div>
            ) : (
              <div className="text-xs font-mono text-[#d2d6e2]">—</div>
            )}
          </div>
          <div className="w-px self-stretch bg-[#3a3a3e]" />

          {/* Cell 7 — Hedge Ratio (period: C-Book vol / B-Book vol, %) */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Hedge Ratio</div>
            {hedgeRatioPct === null ? (
              <div className="text-xs font-mono text-[#d2d6e2]">—</div>
            ) : hedgeRatioPct === '' ? (
              <div className="text-xs font-mono text-[#d2d6e2]">- -</div>
            ) : (
              <div className="text-xs font-mono text-white">
                {hedgeRatioPct.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-[#3a1f1f] border-b border-[#ff5c5c] text-xs text-[#ff5c5c] flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={fetchPositions} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="px-4 py-1.5 border-b border-[#505050] flex items-center gap-4" style={{ backgroundColor: '#2a292c' }}>
        <span className="text-[10px] text-[#666] uppercase tracking-wider font-medium">Filters</span>

        <div className="relative">
          <input
            type="text"
            list="bbookgroup-options"
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            placeholder="All Groups / All Accounts"
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#49b3b3]"
          />
          <datalist id="bbookgroup-options">
            {uniqueGroups.map(g => <option key={g} value={g} />)}
            {uniqueLogins.map(l => <option key={l} value={l} />)}
          </datalist>
        </div>

        <div className="relative">
          <input
            type="text"
            list="bbooksymbol-options"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="All Symbols"
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#49b3b3]"
          />
          <datalist id="bbooksymbol-options">
            {uniqueSymbols.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        <select
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          className="w-[200px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
        >
          {uniqueServers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => { setGroupInput(''); setSymbolInput(''); }}
            className="text-xs text-[#999] hover:text-white transition-colors"
          >
            ✕ Clear
          </button>
        )}

        {hasActiveFilters && (
          <span className="text-[10px] text-[#49b3b3] font-mono ml-auto">
            {filteredPositions.length} of {positions.length} positions
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">

        {/* Loading overlay — only on initial connect */}
        {wsStatus === 'connecting' && positions.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-[#999] text-sm">
            <span className="font-mono">Connecting to live feed…</span>
          </div>
        )}

        {/* Empty state */}
        {wsStatus === 'live' && !error && positions.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-[#999] text-sm">No positions in B-Book</p>
            <p className="text-[#666] text-xs">
              {activeNodes.length > 0
                ? 'Assign MT5 groups to the B-Book in Node Management, or there are no open positions.'
                : 'No connected MT5 nodes found. Go to Node Management to connect your MT5 server.'}
            </p>
          </div>
        )}

        {/* Grid */}
        {positions.length > 0 && (
          <div style={{ flex: 1, width: '100%' }}>
            <AgGridReact<BBookPosition>
              ref={gridRef}
              theme={gridTheme}
              rowData={filteredPositions}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              gridOptions={gridOptions}
              rowHeight={26}
              headerHeight={36}
              getRowId={(p) => getRowId(p.data)}
              rowSelection={rowSelection}
              cellSelection={{ enableHeaderHighlight: true }}
              getContextMenuItems={getContextMenuItems}
              onGridReady={onGridReady}
            />
          </div>
        )}

        {/* Charts - collapsible */}
        <div
          className={clsx(
            'border-t border-[#808080] transition-all duration-300',
            chartsCollapsed ? 'h-[40px]' : 'h-[300px]'
          )}
          style={{ backgroundColor: '#232326' }}
        >
          <BBookCharts
            positions={filteredPositions}
            collapsed={chartsCollapsed}
            onToggle={() => setChartsCollapsed(!chartsCollapsed)}
          />
        </div>
      </div>
    </div>
  );
}

export default BBookPage;