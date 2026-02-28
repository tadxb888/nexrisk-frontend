import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

import { BBookCharts } from '@/components/charts/BBookCharts';
import { mt5Api, type MT5Position, type MT5NodeAPI } from '@/services/api';

// ======================
// THEME (Quartz dark)
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: "#313032",
  browserColorScheme: "dark",
  chromeBackgroundColor: { ref: "foregroundColor", mix: 0.11, onto: "backgroundColor" },
  fontFamily: { googleFont: "IBM Plex Mono" },
  fontSize: 12,
  foregroundColor: "#FFF",
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
// FIELD MAPPING
// ======================
function mapPosition(raw: MT5Position, nodeName: string): BBookPosition {
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
    hedge:         'No',    // populated in a future hedge-rules pass
    lp:            null,    // populated once LP routing is live
    group:         '',      // not available per-position from this endpoint
    server:        nodeName,
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
// COMPONENT
// ======================
export function BBookPage() {
  const gridRef = useRef<AgGridReact<BBookPosition>>(null);
  const [chartsCollapsed, setChartsCollapsed] = useState(false);

  // ── Data state ──────────────────────────────────────────────
  const [positions, setPositions] = useState<BBookPosition[]>([]);
  const [masterNode, setMasterNode] = useState<MT5NodeAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filter state
  const [groupInput, setGroupInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [filterServer, setFilterServer] = useState<string>('ALL');

  // Row index for streaming updates
  const rowIndexRef = useRef<Map<string, BBookPosition>>(new Map());

  useEffect(() => {
    const m = new Map<string, BBookPosition>();
    for (const r of positions) m.set(getRowId(r), r);
    rowIndexRef.current = m;
  }, [positions]);

  // ── Initial fetch ───────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: resolve the master/primary node
      const node = await mt5Api.getMasterNode();
      if (!node) {
        setError('No connected master node found. Please connect an MT5 node in Node Management.');
        setPositions([]);
        setLoading(false);
        return;
      }
      setMasterNode(node);

      // Step 2: fetch all B-Book positions in one call
      const data = await mt5Api.getBookPositions(node.id, 'B');

      if (!data.positions || data.positions.length === 0) {
        setPositions([]);
        setLastRefresh(new Date());
        setLoading(false);
        return;
      }

      setPositions(data.positions.map(p => mapPosition(p, node.node_name)));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load B-Book positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPositions, 30_000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  // ── Derived filter options ──────────────────────────────────
  const uniqueLogins  = useMemo(() => Array.from(new Set(positions.map(p => String(p.login)))).sort(), [positions]);
  const uniqueSymbols = useMemo(() => Array.from(new Set(positions.map(p => p.symbol))).sort(), [positions]);
  const uniqueGroups  = useMemo(() => Array.from(new Set(positions.map(p => p.group).filter(Boolean))).sort(), [positions]);
  const uniqueServers = useMemo(() => ['ALL', ...Array.from(new Set(positions.map(p => p.server))).sort()], [positions]);

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
      if (filterServer !== 'ALL' && p.server !== filterServer) return false;
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
        <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : '#e0a020' }}>{p.value}</span>
      ),
    },
    { field: 'volume',        headerName: 'Volume',   filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2),  width: 100, type: 'rightAligned' },
    { field: 'price_open',    headerName: 'Open',     filter: 'agNumberColumnFilter', valueFormatter: fmtPrice,   width: 110, type: 'rightAligned' },
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
        const color = val > 0 ? '#66e07a' : val < 0 ? '#ff6b6b' : '#999';
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
    return {
      total:       src.length,
      buyCount:    src.filter(p => p.type === 'BUY').length,
      sellCount:   src.filter(p => p.type === 'SELL').length,
      totalVolume: src.reduce((s, p) => s + p.volume, 0),
      totalPnL,
      netPnL:      totalPnL + totalSwap + totalComm,
      hedgedCount: src.filter(p => p.hedge !== 'No').length,
    };
  }, [filteredPositions]);

  const hasActiveFilters = groupInput.trim() !== '' || symbolInput.trim() !== '' || filterServer !== 'ALL';

  // ======================
  // RENDER
  // ======================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>

      {/* Page Header */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">B-Book</h1>
          <p className="text-xs text-[#999]">Internalized flow — Live positions held against the house</p>
        </div>

        <div className="flex items-center gap-6 text-xs">
          {/* Node badge */}
          {masterNode && (
            <>
              <div className="flex items-center gap-1.5">
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  masterNode.connection_status === 'CONNECTED' ? 'bg-[#66e07a]' : 'bg-[#ff6b6b]'
                )} />
                <span className="text-[#999] font-mono text-[10px]">{masterNode.node_name}</span>
              </div>
              <div className="w-px h-4 bg-[#808080]" />
            </>
          )}

          {/* Stats */}
          <div><span className="text-[#999]">Positions:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
          <div className="w-px h-4 bg-[#808080]" />
          <div><span className="text-[#999]">Long / Short:</span><span className="ml-1 font-mono"><span className="text-[#4ecdc4]">{stats.buyCount}</span><span className="text-[#505050]"> / </span><span className="text-[#e0a020]">{stats.sellCount}</span></span></div>
          <div><span className="text-[#999]">Volume:</span><span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span></div>
          <div>
            <span className="text-[#999]">Float P&amp;L:</span>
            <span className={clsx('ml-1 font-mono', stats.totalPnL >= 0 ? 'text-[#66e07a]' : 'text-[#ff6b6b]')}>
              {stats.totalPnL >= 0 ? '' : '-'}${Math.abs(stats.totalPnL).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[#999]">Net P&amp;L:</span>
            <span className={clsx('ml-1 font-mono', stats.netPnL >= 0 ? 'text-[#66e07a]' : 'text-[#ff6b6b]')}>
              {stats.netPnL >= 0 ? '' : '-'}${Math.abs(stats.netPnL).toFixed(2)}
            </span>
          </div>
          <div><span className="text-[#999]">Hedged:</span><span className="ml-1 font-mono text-white">{stats.hedgedCount}</span></div>

          {/* Refresh */}
          <button
            onClick={fetchPositions}
            disabled={loading}
            className="text-[10px] text-[#999] hover:text-white transition-colors disabled:opacity-40"
            title={lastRefresh ? `Last refresh: ${lastRefresh.toLocaleTimeString()}` : 'Refresh positions'}
          >
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-[#3a1f1f] border-b border-[#ff6b6b] text-xs text-[#ff6b6b] flex items-center justify-between">
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
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#4ecdc4]"
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
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#4ecdc4]"
          />
          <datalist id="bbooksymbol-options">
            {uniqueSymbols.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        <select
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          className="w-[200px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]"
        >
          {uniqueServers.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Servers' : s}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => { setGroupInput(''); setSymbolInput(''); setFilterServer('ALL'); }}
            className="text-xs text-[#999] hover:text-white transition-colors"
          >
            ✕ Clear
          </button>
        )}

        {hasActiveFilters && (
          <span className="text-[10px] text-[#4ecdc4] font-mono ml-auto">
            {filteredPositions.length} of {positions.length} positions
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">

        {/* Loading overlay */}
        {loading && positions.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-[#999] text-sm">
            <span className="font-mono">Loading B-Book positions…</span>
          </div>
        )}

        {/* Empty state — no groups assigned */}
        {!loading && !error && positions.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
            <p className="text-[#999] text-sm">No positions in B-Book</p>
            <p className="text-[#666] text-xs">
              {masterNode
                ? 'Assign MT5 groups to the B-Book in Node Management, or there are no open positions.'
                : 'No connected master node found. Go to Node Management to connect your MT5 server.'}
            </p>
          </div>
        )}

        {/* Grid */}
        {(positions.length > 0 || loading) && (
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
          style={{ backgroundColor: '#313032' }}
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