import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

import { BBookCharts } from '@/components/charts/BBookCharts';

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
  time: string;
  type: 'BUY' | 'SELL';
  volume: number;
  price_open: number;
  sl: number | null;
  tp: number | null;
  price_current: number;
  profit: number;
  hedge: 'No' | 'Rule' | 'Manual';
  lp: string | null;
  group: string;
  server: string;
}

export type BBookStreamMsg = {
  upsert?: BBookPosition[];
  remove?: string[];
};

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
// MOCK DATA (replace with real API)
// ======================
function generateMockPositions(count: number): BBookPosition[] {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD', 'NFLX', 'MSFT', 'DJI30', 'GOOG', 'AAPL', 'AMZN', 'FB', 'TSLA'];
  const types: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
  const hedgeOptions: ('No' | 'Rule' | 'Manual')[] = ['No', 'Rule', 'Manual'];
  const lps = ['Lmax', 'Equity', 'CMC', null];
  const groups = ['VIP', 'PRO', 'STD', 'ECN', 'DEMO'];
  const servers = ['MT5-Live-1', 'MT5-Live-2', 'MT5-Live-3'];

  return Array.from({ length: count }, (_, i) => {
    const symbol = symbols[i % symbols.length];
    const isJPY = symbol.includes('JPY');
    const isXAU = symbol.includes('XAU');
    const isBTC = symbol.includes('BTC');
    const basePrice = isJPY ? 154.5 : isXAU ? 2024 : isBTC ? 42000 : 1.08 + Math.random() * 0.2;
    const price_open = basePrice + (Math.random() - 0.5) * 0.01 * basePrice;
    const price_current = price_open + (Math.random() - 0.5) * 0.005 * basePrice;
    const type = types[Math.floor(Math.random() * 2)];
    const volume = Math.floor(Math.random() * 500 + 10) / 100;
    const profit = (Math.random() - 0.5) * 10000;
    const hedge = hedgeOptions[Math.floor(Math.random() * 3)];

    return {
      login: 100000 + Math.floor(Math.random() * 900000),
      symbol,
      position_id: 600000 + i,
      time: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      type,
      volume,
      price_open,
      sl: Math.random() > 0.5 ? price_open * (type === 'BUY' ? 0.99 : 1.01) : null,
      tp: Math.random() > 0.5 ? price_open * (type === 'BUY' ? 1.02 : 0.98) : null,
      price_current,
      profit: Math.round(profit * 100) / 100,
      hedge,
      lp: hedge !== 'No' ? lps[Math.floor(Math.random() * 3)] : null,
      group: groups[Math.floor(Math.random() * groups.length)],
      server: servers[Math.floor(Math.random() * servers.length)],
    };
  });
}

// ======================
// COMPONENT
// ======================
export function BBookPage() {
  const gridRef = useRef<AgGridReact<BBookPosition>>(null);
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  const [timePeriod, setTimePeriod] = useState<'today' | 'month'>('month');
  
  // Initial snapshot
  const [positions] = useState<BBookPosition[]>(() => generateMockPositions(100));

  // Filter state — free-text input values
  const [groupInput, setGroupInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [filterServer, setFilterServer] = useState<string>('ALL');
  
  // Index for streaming updates
  const rowIndexRef = useRef<Map<string, BBookPosition>>(new Map());

  useEffect(() => {
    const m = new Map<string, BBookPosition>();
    for (const r of positions) m.set(getRowId(r), r);
    rowIndexRef.current = m;
  }, [positions]);

  // Unique filter values for datalists
  const uniqueGroups = useMemo(() => Array.from(new Set(positions.map(p => p.group))).sort(), [positions]);
  const uniqueLogins = useMemo(() => Array.from(new Set(positions.map(p => String(p.login)))).sort(), [positions]);
  const uniqueSymbols = useMemo(() => Array.from(new Set(positions.map(p => p.symbol))).sort(), [positions]);
  const uniqueServers = useMemo(() => ['ALL', ...Array.from(new Set(positions.map(p => p.server))).sort()], [positions]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    const gTerm = groupInput.trim().toUpperCase();
    const sTerm = symbolInput.trim().toUpperCase();

    return positions.filter(p => {
      // Group/Account filter: match group name OR login ID
      if (gTerm) {
        const matchesGroup = p.group.toUpperCase().includes(gTerm);
        const matchesLogin = String(p.login).includes(gTerm);
        if (!matchesGroup && !matchesLogin) return false;
      }
      // Symbol filter
      if (sTerm) {
        if (!p.symbol.toUpperCase().includes(sTerm)) return false;
      }
      // Server filter
      if (filterServer !== 'ALL' && p.server !== filterServer) return false;
      return true;
    });
  }, [positions, groupInput, symbolInput, filterServer]);

  // ======================
  // COLUMN DEFINITIONS
  // ======================
  const columnDefs = useMemo<ColDef<BBookPosition>[]>(() => [
    { field: 'login', headerName: 'Login ID', filter: 'agNumberColumnFilter', width: 120, pinned: 'left' },
    { field: 'symbol', headerName: 'Symbol', filter: 'agSetColumnFilter', width: 110, pinned: 'left' },
    { field: 'position_id', headerName: 'Position ID', filter: 'agNumberColumnFilter', width: 120 },
    { 
      field: 'time', 
      headerName: 'Time', 
      filter: 'agDateColumnFilter',
      sort: 'desc',
      width: 160,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString('en-GB', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      }).replace(',', '') : '',
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
    { field: 'volume', headerName: 'Volume', filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2), width: 100, type: 'rightAligned' },
    { field: 'price_open', headerName: 'Price', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
    { field: 'sl', headerName: 'S/L', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
    { field: 'tp', headerName: 'T/P', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
    { field: 'price_current', headerName: 'Price', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
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
    { field: 'hedge', headerName: 'Hedge', filter: 'agSetColumnFilter', width: 90, filterParams: { values: ['No', 'Rule', 'Manual'] } },
    { field: 'lp', headerName: 'LP', filter: 'agSetColumnFilter', width: 90, valueFormatter: (p: ValueFormatterParams) => p.value || '' },
    { field: 'group', headerName: 'Group', filter: 'agSetColumnFilter', width: 90 },
    { field: 'server', headerName: 'Server', filter: 'agSetColumnFilter', width: 120 },
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

  // Auto-size columns on grid ready
  const onGridReady = useCallback((_event: GridReadyEvent) => {
    setTimeout(() => {
      gridRef.current?.api?.autoSizeAllColumns();
    }, 0);
  }, []);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
    const rowData = params.node?.data as BBookPosition | undefined;
    return [
      { name: 'Pin Row to Top', action: () => console.log('Pin:', rowData) },
      { name: 'Unpin Row', action: () => console.log('Unpin:', rowData) },
      'separator',
      'copy',
      'copyWithHeaders',
      'separator',
      { name: 'Export to CSV', action: () => params.api.exportDataAsCsv() },
      { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
      'separator',
      { name: 'Market Depth Trader', action: () => console.log('Market Depth:', rowData) },
      { name: 'Telegram', action: () => console.log('Telegram:', rowData) },
    ];
  }, []);

  // ======================
  // STATS (mock different values based on time period)
  // ======================
  const stats = useMemo(() => {
    if (timePeriod === 'today') {
      const total = filteredPositions.length;
      const totalPnL = filteredPositions.reduce((s, p) => s + p.profit, 0);
      const totalVolume = filteredPositions.reduce((s, p) => s + p.volume, 0);
      const buyCount = filteredPositions.filter(p => p.type === 'BUY').length;
      const sellCount = filteredPositions.filter(p => p.type === 'SELL').length;
      const hedgedCount = filteredPositions.filter(p => p.hedge !== 'No').length;
      return { total, totalPnL, totalVolume, buyCount, sellCount, hedgedCount };
    } else {
      return {
        total: filteredPositions.length * 22,
        totalPnL: filteredPositions.reduce((s, p) => s + p.profit, 0) * 22,
        totalVolume: filteredPositions.reduce((s, p) => s + p.volume, 0) * 22,
        buyCount: filteredPositions.filter(p => p.type === 'BUY').length * 22,
        sellCount: filteredPositions.filter(p => p.type === 'SELL').length * 22,
        hedgedCount: filteredPositions.filter(p => p.hedge !== 'No').length * 22,
      };
    }
  }, [filteredPositions, timePeriod]);

  const hasActiveFilters = groupInput.trim() !== '' || symbolInput.trim() !== '' || filterServer !== 'ALL';

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Page Header - Title + Stats in one row */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between">
        {/* Left: Title */}
        <div>
          <h1 className="text-lg font-semibold text-white">B-Book</h1>
          <p className="text-xs text-[#999]">Internalized flow — Live positions held against the house</p>
        </div>
        
        {/* Right: Time Period + Stats */}
        <div className="flex items-center gap-6 text-xs">
          {/* Time Period Selector */}
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as 'today' | 'month')}
            className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#4ecdc4]"
          >
            <option value="today">Today</option>
            <option value="month">This Month</option>
          </select>
          
          <div className="w-px h-4 bg-[#808080]" />
          
          {/* Stats */}
          <div><span className="text-[#999]">Positions:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
          <div><span className="text-[#999]">Long/Short:</span><span className="ml-1 font-mono"><span className="text-[#4ecdc4]">{stats.buyCount}</span><span className="text-[#999]"> / </span><span className="text-[#e0a020]">{stats.sellCount}</span></span></div>
          <div><span className="text-[#999]">Volume:</span><span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span></div>
          <div><span className="text-[#999]">P&L:</span><span className={clsx('ml-1 font-mono', stats.totalPnL >= 0 ? 'text-[#66e07a]' : 'text-[#ff6b6b]')}>{stats.totalPnL >= 0 ? '' : '-'}${Math.abs(stats.totalPnL).toFixed(2)}</span></div>
          <div><span className="text-[#999]">Hedged:</span><span className="ml-1 font-mono text-white">{stats.hedgedCount}</span></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-1.5 border-b border-[#505050] flex items-center gap-4" style={{ backgroundColor: '#2a292c' }}>
        <span className="text-[10px] text-[#666] uppercase tracking-wider font-medium">Filters</span>

        {/* Group / Account — searchable input with datalist */}
        <div className="relative">
          <input
            type="text"
            list="group-options"
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            placeholder="All Groups / All Accounts"
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#4ecdc4]"
          />
          <datalist id="group-options">
            {uniqueGroups.map(g => <option key={g} value={g} />)}
            {uniqueLogins.map(l => <option key={l} value={l} />)}
          </datalist>
        </div>

        {/* Symbol — searchable input with datalist */}
        <div className="relative">
          <input
            type="text"
            list="symbol-options"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="All Symbols"
            className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#4ecdc4]"
          />
          <datalist id="symbol-options">
            {uniqueSymbols.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Server — dropdown */}
        <select value={filterServer} onChange={(e) => setFilterServer(e.target.value)}
          className="w-[240px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]">
          {uniqueServers.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Servers' : s}</option>)}
        </select>

        {/* Request Button */}
        <button
          className="px-4 py-1 rounded text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: '#4ecdc4' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3dbdb5')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4ecdc4')}
          onClick={() => console.log('Request:', { group: groupInput, symbol: symbolInput, server: filterServer })}
        >
          Request
        </button>

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

      {/* Content Area with padding */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">
        {/* Grid - takes remaining space */}
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