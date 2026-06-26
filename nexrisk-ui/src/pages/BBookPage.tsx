import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, GridReadyEvent, IRowNode } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

import { BBookCharts } from '@/components/charts/BBookCharts';
import { mt5Api, connectBBookWebSocket, type MT5PositionWithNode, type MT5NodeAPI, type BBookWsEvent } from '@/services/api';
import { fmtHdrMoney, fmtHdrCompact, pnlColor, usePortfolioStats } from '@/stores/PortfolioStatsContext';
import { CardsPeriodToggle } from '@/components/portfolio/CardsPeriodToggle';

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

// Stable empty reference for the grid's rowData. The grid row model is the
// source of truth for live rows and is fed exclusively via transactions, so
// rowData must never be re-bound from React state after mount.
const EMPTY_ROWS: BBookPosition[] = [];

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

        } else if ((ev as any).type === 'POSITION_BATCH' || (ev as any).data?.type === 'POSITION_BATCH') {
          // Per-tick P/L stream (new). One array per symbol, ~every 500ms.
          // Each element is the same changed-fields delta as a single
          // POSITION_CHANGE, so reuse the merge path and price_current keeps
          // updating. Wire shape unverified: the discriminator and the array
          // may sit on the envelope or inside data, so accept either placement.
          const batch = ((ev as any).data?.positions ?? (ev as any).positions) as
            (Partial<MT5PositionWithNode> & { position_id: number })[] | undefined;
          if (Array.isArray(batch)) {
            for (const d of batch) opts.onMerge(d);
          }

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
  // GRID-AUTHORITATIVE MODEL
  // The AG Grid row model is the single source of truth for live rows. Tick
  // updates are pushed via applyTransactionAsync, which the grid batches on
  // its own render cadence (asyncTransactionWaitMillis) — so React does NOT
  // re-render per tick. The states below are SLOW read-back snapshots taken
  // from the grid every few seconds, used only by the charts, header-card
  // stats and filter dropdowns; none of those need tick-rate freshness.
  const [positions,         setPositions]         = useState<BBookPosition[]>([]); // all rows (slow)
  const [filteredPositions, setFilteredPositions] = useState<BBookPosition[]>([]); // filtered+sorted (slow)
  const [rowCount,          setRowCount]          = useState(0);                   // live grid row count
  const [activeNodes,       setActiveNodes]       = useState<MT5NodeAPI[]>([]);
  const [wsStatus,          setWsStatus]          = useState<WsStatus>('connecting');
  const [error,             setError]             = useState<string | null>(null);

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

  // position_id -> rowId. POSITION_CHANGE / POSITION_DELETE arrive carrying only
  // position_id, but the grid is keyed by the composite getRowId. This index
  // resolves the node for those partial events. Rebuilt on every reconcile and
  // kept in sync on add/remove. Touched only from the WS callback thread.
  const pidToRowIdRef = useRef<Map<number, string>>(new Map());

  // Toolbar filter values mirrored into a ref so the grid's external-filter
  // callbacks always read current values without being re-bound on each render.
  const filtersRef = useRef({ group: '', symbol: '', server: '' });
  useEffect(() => {
    filtersRef.current = { group: groupInput, symbol: symbolInput, server: filterServer };
    gridRef.current?.api?.onFilterChanged();
  }, [groupInput, symbolInput, filterServer]);

  // Does a row pass the toolbar filters. Mirrors the previous React-side filter
  // exactly; reads filtersRef so it never goes stale inside the grid callback.
  const rowPassesFilters = useCallback((p: BBookPosition): boolean => {
    const { group, symbol, server } = filtersRef.current;
    const gTerm = group.trim().toUpperCase();
    const sTerm = symbol.trim().toUpperCase();
    if (gTerm) {
      const matchesGroup = p.group.toUpperCase().includes(gTerm);
      const matchesLogin = String(p.login).includes(gTerm);
      if (!matchesGroup && !matchesLogin) return false;
    }
    if (sTerm && !p.symbol.toUpperCase().includes(sTerm)) return false;
    // filterServer is empty only during initial load (before the master node
    // resolves). In that window everything shows; then it narrows to the node.
    if (server !== '' && p.server !== server) return false;
    return true;
  }, []);

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

  // ── Slow read-back from the grid (charts / stats / dropdowns / overlays) ──
  // Off the tick path. Pulls the grid's current row model into React state so
  // charts, header-card stats, dropdown options and the empty/loading overlays
  // have data — none of which need tick-rate freshness. Called on a 5s timer
  // and once synchronously after each structural reconcile so the first seed
  // shows immediately.
  const pullFromGrid = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const all:      BBookPosition[] = [];
    const filtered: BBookPosition[] = [];
    api.forEachNode(n => { if (n.data) all.push(n.data); });
    api.forEachNodeAfterFilterAndSort(n => { if (n.data) filtered.push(n.data); });
    setPositions(all);
    setFilteredPositions(filtered);
    setRowCount(all.length);
  }, []);

  // ── WebSocket handlers — all mutate the grid via transactions, never state ──

  // Reconcile the grid against an authoritative full set (initial seed AND
  // every reconnect SNAPSHOT): add missing rows, update existing ones, remove
  // rows no longer present. applyTransaction preserves sort, filters, column
  // state, selection and scroll position — so a reconnect snapshot does not
  // disturb the user's grid state.
  const reconcile = useCallback((rows: BBookPosition[]) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const incoming = new Map<string, BBookPosition>();
    for (const r of rows) incoming.set(getRowId(r), r);

    const add:    BBookPosition[] = [];
    const update: BBookPosition[] = [];
    const remove: BBookPosition[] = [];

    api.forEachNode(node => {
      const id = node.id;
      if (id !== undefined && !incoming.has(id) && node.data) remove.push(node.data);
    });
    incoming.forEach((row, id) => {
      (api.getRowNode(id) ? update : add).push(row);
    });

    api.applyTransaction({ add, update, remove });

    const m = new Map<number, string>();
    incoming.forEach((row, id) => m.set(row.position_id, id));
    pidToRowIdRef.current = m;

    pullFromGrid();   // reflect the seed/reconcile immediately (sync transaction)
  }, [pullFromGrid]);

  const handleSnapshot = useCallback((snap: BBookPosition[]) => {
    setError(null);
    reconcile(snap);
  }, [reconcile]);

  const handleUpsert = useCallback((pos: BBookPosition) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const id = getRowId(pos);
    api.applyTransactionAsync(api.getRowNode(id) ? { update: [pos] } : { add: [pos] });
    pidToRowIdRef.current.set(pos.position_id, id);
  }, []);

  const handleMerge = useCallback((delta: Partial<MT5PositionWithNode> & { position_id: number }) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const id = pidToRowIdRef.current.get(delta.position_id);
    if (!id) return;                       // unknown position — wait for snapshot/add
    const node = api.getRowNode(id);
    if (!node || !node.data) return;
    // Merge only the live fields, exactly as before (broker P&L is inverted).
    const merged: BBookPosition = {
      ...node.data,
      ...(delta.price_current !== undefined && { price_current: delta.price_current }),
      ...(delta.profit        !== undefined && { profit: -delta.profit }),
      ...(delta.swap          !== undefined && { swap: delta.swap }),
      ...(delta.commission    !== undefined && { commission: delta.commission }),
    };
    api.applyTransactionAsync({ update: [merged] });
  }, []);

  const handleRemove = useCallback((positionId: number) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const id = pidToRowIdRef.current.get(positionId);
    if (!id) return;
    const node = api.getRowNode(id);
    if (node && node.data) api.applyTransactionAsync({ remove: [node.data] });
    pidToRowIdRef.current.delete(positionId);
  }, []);

  useBBookWebSocket({
    onSnapshot: handleSnapshot,
    onUpsert:   handleUpsert,
    onMerge:    handleMerge,
    onRemove:   handleRemove,
    onStatus:   setWsStatus,
  });

  // Initial REST load — reconciles into the grid (same path as a SNAPSHOT) so
  // rows appear immediately regardless of WS snapshot timing.
  const fetchPositions = useCallback(async () => {
    setError(null);
    try {
      const { positions: raw, nodes } = await mt5Api.getAllBBookPositions();
      setActiveNodes(nodes);
      reconcile(raw.map(p => mapPosition(p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load B-Book positions');
    }
  }, [reconcile]);

  // Slow refresh so price drift reflects in charts/stats between structural
  // changes. Structural changes (seed/reconnect) update immediately via
  // reconcile -> pullFromGrid; this timer just keeps prices reasonably fresh.
  useEffect(() => {
    const t = setInterval(pullFromGrid, 5000);
    return () => clearInterval(t);
  }, [pullFromGrid]);

  // ── Derived filter options (from the slow snapshot) ─────────────────────
  const uniqueLogins  = useMemo(() => Array.from(new Set(positions.map(p => String(p.login)))).sort(), [positions]);
  const uniqueSymbols = useMemo(() => Array.from(new Set(positions.map(p => p.symbol))).sort(), [positions]);
  const uniqueGroups  = useMemo(() => Array.from(new Set(positions.map(p => p.group).filter(Boolean))).sort(), [positions]);
  const uniqueServers = useMemo(() => activeNodes.map(n => n.node_name).sort(), [activeNodes]);

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
      // Colored text via cellStyle instead of a JSX cellRenderer. Function
      // cell renderers can't refresh in place, so under the high-frequency
      // transaction stream AG Grid tears down and rebuilds the React-rendered
      // cell on each update, leaking the old fiber + per-cell tooltip
      // controller. valueFormatter/cellStyle keep cells as reusable DOM.
      cellStyle: (p) => ({ color: p.value === 'BUY' ? '#49b3b3' : '#e0a020' }),
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
      // profit updates on EVERY tick. Render as formatted/colored text via
      // valueFormatter + cellStyle (no JSX) so the cell is refreshed in place
      // rather than recreated per tick — this is the hot column and the main
      // source of the residual tooltip/fiber retention.
      valueFormatter: (p) => {
        const v = (p.value as number) ?? 0;
        return (v >= 0 ? '$' : '-$') + Math.abs(v).toFixed(2);
      },
      cellStyle: (p) => {
        const v = (p.value as number) ?? 0;
        return { color: v > 0 ? '#66e07a' : v < 0 ? '#ff5c5c' : '#999' };
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
    // Coalesce async transactions: the grid flushes batched applyTransactionAsync
    // calls on this cadence regardless of how fast ticks arrive. At a 25ms LP
    // feed this turns ~40 updates/sec/position into ~20 batched flushes/sec
    // total, which is what makes the high-frequency feed safe to render.
    asyncTransactionWaitMillis: 50,
    // Use native browser title tooltips instead of AG Grid's custom tooltip
    // system. The custom path instantiates a per-cell tooltipCtrl bound to a
    // listener (native_bind) that is retained by tooltipManager when cells are
    // destroyed under the high-frequency transaction stream — the root of the
    // detached-cell retention seen in heap snapshots. Native tooltips are
    // browser-managed and cannot leak.
    enableBrowserTooltips: true,
    statusBar: {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent' },
        { statusPanel: 'agSelectedRowCountComponent' },
        { statusPanel: 'agAggregationComponent' },
      ],
    },
  }), []);

  // External (toolbar) filter — runs inside the grid so live transaction
  // updates are filtered in place without ever re-binding rowData.
  const isExternalFilterPresent = useCallback(() => {
    const { group, symbol, server } = filtersRef.current;
    return group.trim() !== '' || symbol.trim() !== '' || server !== '';
  }, []);
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<BBookPosition>) => (node.data ? rowPassesFilters(node.data) : true),
    [rowPassesFilters],
  );

  const onGridReady = useCallback((_event: GridReadyEvent) => {
    // Grid API now exists — seed it from REST. The WS SNAPSHOT will reconcile
    // on top once the socket connects.
    fetchPositions();
    setTimeout(() => gridRef.current?.api?.autoSizeAllColumns(), 0);
  }, [fetchPositions]);

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

      {/* Page Header — title on left, M/D toggle + B-Book card right-aligned */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-lg font-semibold text-white">B-Book</h1>
        </div>

        {/* M/D toggle + B-Book card grouped on the right.
            Toggle replaces the legacy CardsPeriodSelector that used to sit on the TopBar. */}
        <div className="ml-auto flex items-center gap-2">
          <CardsPeriodToggle />

          {/* ── B-Book card — 7 cells: title | Long/Short | Volume | Unrealized | Realized | Cost | Hedge Ratio ──
             Live cells (positions, Long/Short, Volume) reflect open positions right now.
             Period cells (Unrealized/Realized/Cost/Hedge Ratio) follow the M/D toggle. */}
          <div
            className="inline-flex items-stretch gap-2 rounded px-2 py-1"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #49b3b344',
              borderLeft: '3px solid #49b3b3',
            }}
            title="B-Book card. Live cells reflect open positions; Unrealized/Realized P/L, Cost and Hedge Ratio follow the M/D toggle to the left."
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

        {/* Server selector intentionally hidden — single Master node only.
            filterServer defaults to the master node_name in the activeNodes effect
            above, so the positions list stays narrowed to the master B-Book.
            Re-enable only if/when multi-node B-Book selection becomes a requirement. */}
        {/* <select
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          className="w-[200px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
        >
          {uniqueServers.map(s => <option key={s} value={s}>{s}</option>)}
        </select> */}

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

        {/* Grid — ALWAYS mounted: its row model is the source of truth for live
            rows and is fed via transactions. rowData is a stable empty array so
            React never re-binds it. Loading/empty states overlay the grid. */}
        <div style={{ position: 'relative', flex: 1, width: '100%' }}>
          <AgGridReact<BBookPosition>
            ref={gridRef}
            theme={gridTheme}
            rowData={EMPTY_ROWS}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            rowHeight={26}
            headerHeight={36}
            getRowId={(p) => getRowId(p.data)}
            rowSelection={rowSelection}
            cellSelection={{ enableHeaderHighlight: true }}
            getContextMenuItems={getContextMenuItems}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
            onGridReady={onGridReady}
          />

          {/* Loading overlay — only on initial connect, before any rows */}
          {wsStatus === 'connecting' && rowCount === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#999] text-sm"
                 style={{ backgroundColor: '#232326' }}>
              <span className="font-mono">Connecting to live feed…</span>
            </div>
          )}

          {/* Empty state */}
          {wsStatus === 'live' && !error && rowCount === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2"
                 style={{ backgroundColor: '#232326' }}>
              <p className="text-[#999] text-sm">No positions in B-Book</p>
              <p className="text-[#666] text-xs">
                {activeNodes.length > 0
                  ? 'Assign MT5 groups to the B-Book in Node Management, or there are no open positions.'
                  : 'No connected MT5 nodes found. Go to Node Management to connect your MT5 server.'}
              </p>
            </div>
          )}
        </div>

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