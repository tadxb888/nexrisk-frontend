import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef } from 'ag-grid-community';
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
    };
  });
}

// ======================
// COMPONENT
// ======================
export function BBookPage() {
  const gridRef = useRef<AgGridReact<BBookPosition>>(null);
  const [group, setGroup] = useState('');
  const [symbol, setSymbol] = useState('');
  const [server, setServer] = useState('');
  
  // Initial snapshot
  const [positions] = useState<BBookPosition[]>(() => generateMockPositions(100));
  
  // Index for streaming updates
  const rowIndexRef = useRef<Map<string, BBookPosition>>(new Map());

  useEffect(() => {
    const m = new Map<string, BBookPosition>();
    for (const r of positions) m.set(getRowId(r), r);
    rowIndexRef.current = m;
  }, [positions]);

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
    sideBar: 'columns',
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
  // STATS
  // ======================
  const stats = useMemo(() => {
    const total = positions.length;
    const totalPnL = positions.reduce((s, p) => s + p.profit, 0);
    const totalVolume = positions.reduce((s, p) => s + p.volume, 0);
    const buyCount = positions.filter(p => p.type === 'BUY').length;
    const sellCount = positions.filter(p => p.type === 'SELL').length;
    const hedgedCount = positions.filter(p => p.hedge !== 'No').length;
    return { total, totalPnL, totalVolume, buyCount, sellCount, hedgedCount };
  }, [positions]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Header */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between">
        <div>
          <h1 className="text-sm font-medium text-white">B-Book</h1>
          <p className="text-xs text-[#999]">Internalized flow — Live positions held against the house</p>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div><span className="text-[#999]">Positions:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
          <div><span className="text-[#999]">Long/Short:</span><span className="ml-1 font-mono"><span className="text-[#4ecdc4]">{stats.buyCount}</span><span className="text-[#999]"> / </span><span className="text-[#e0a020]">{stats.sellCount}</span></span></div>
          <div><span className="text-[#999]">Volume:</span><span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span></div>
          <div><span className="text-[#999]">P&L:</span><span className={clsx('ml-1 font-mono', stats.totalPnL >= 0 ? 'text-[#66e07a]' : 'text-[#ff6b6b]')}>{stats.totalPnL >= 0 ? '' : '-'}${Math.abs(stats.totalPnL).toFixed(2)}</span></div>
          <div><span className="text-[#999]">Hedged:</span><span className="ml-1 font-mono text-white">{stats.hedgedCount}</span></div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#808080]">
        <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="All Groups / All Traders" className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white placeholder-[#888] focus:outline-none focus:border-[#4ecdc4]" />
        <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="All Symbols" className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white placeholder-[#888] focus:outline-none focus:border-[#4ecdc4]" />
        <select value={server} onChange={(e) => setServer(e.target.value)} className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#4ecdc4]">
          <option value="">MT5 Server</option>
        </select>
        <button className="px-6 py-1.5 rounded text-sm font-medium bg-[#4ecdc4] hover:bg-[#3dbdb5] text-black">Request</button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, width: '100%' }}>
        <AgGridReact<BBookPosition>
          ref={gridRef}
          theme={gridTheme}
          rowData={positions}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          gridOptions={gridOptions}
          rowHeight={26}
          headerHeight={36}
          getRowId={(p) => getRowId(p.data)}
          rowSelection={rowSelection}
          cellSelection={{ enableHeaderHighlight: true }}
          getContextMenuItems={getContextMenuItems}
        />
      </div>

      {/* Charts */}
      <div className="h-[300px] border-t border-[#808080] p-4" style={{ backgroundColor: '#313032' }}>
        <BBookCharts positions={positions} />
      </div>
    </div>
  );
}

export default BBookPage;
