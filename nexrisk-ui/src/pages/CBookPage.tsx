import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ======================
// THEME (Quartz dark - matching B-Book)
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
export type CBookOrderType = 'Hedge' | 'Opportunity' | 'Repair';
export type CBookSide = 'BUY' | 'SELL';

export interface CBookOrder {
  id: string;
  date: string;           // ISO date string
  time: string;           // ISO time string with milliseconds
  dealerId: string;
  symbol: string;
  positionId: number;
  side: CBookSide;
  volume: number;
  lpName: string;
  lpAccount: string;
  fillPrice: number;
  type: CBookOrderType;
  comments: string;
}

export type CBookStreamMsg = {
  upsert?: CBookOrder[];
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

// Format date as dd/mm/yyyy
const fmtDate = (p: ValueFormatterParams) => {
  const v = p.value;
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Format time as HH:MM:SS.mmm
const fmtTime = (p: ValueFormatterParams) => {
  const v = p.value;
  if (!v) return '';
  const d = new Date(v);
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const secs = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${mins}:${secs}.${ms}`;
};

const getRowId = (r: CBookOrder) => r.id;

// Type colors
const TYPE_COLORS: Record<CBookOrderType, string> = {
  'Hedge': '#4ecdc4',       // Teal
  'Opportunity': '#a78bfa', // Purple
  'Repair': '#f59e0b',      // Amber
};

// ======================
// MOCK DATA (replace with real API)
// ======================
function generateMockOrders(count: number): CBookOrder[] {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURGBP'];
  const sides: CBookSide[] = ['BUY', 'SELL'];
  const types: CBookOrderType[] = ['Hedge', 'Opportunity', 'Repair'];
  const lps = ['Lmax', 'Currenex', 'PrimeXM', 'CFH', 'Equiniti', 'CMC'];
  const dealers = ['D001', 'D002', 'D003', 'D004', 'D005'];
  const logins = [7000, 7001, 7002, 7003, 8000, 8001, 8002];

  return Array.from({ length: count }, (_, i) => {
    const symbol = symbols[i % symbols.length];
    const isJPY = symbol.includes('JPY');
    const isXAU = symbol.includes('XAU');
    const isBTC = symbol.includes('BTC');
    const basePrice = isJPY ? 154.5 : isXAU ? 2024 : isBTC ? 42000 : 1.08 + Math.random() * 0.2;
    const fillPrice = basePrice + (Math.random() - 0.5) * 0.001 * basePrice;
    const type = types[Math.floor(Math.random() * 3)];
    const side = sides[Math.floor(Math.random() * 2)];
    const lp = lps[Math.floor(Math.random() * lps.length)];
    const dealerId = dealers[Math.floor(Math.random() * dealers.length)];
    const login = logins[Math.floor(Math.random() * logins.length)];
    
    const timestamp = new Date(Date.now() - Math.random() * 86400000 * 7);

    return {
      id: `C${800000 + i}`,
      date: timestamp.toISOString(),
      time: timestamp.toISOString(),
      dealerId,
      symbol,
      positionId: 800000 + i,
      side,
      volume: Math.floor(Math.random() * 500 + 10) / 100,
      lpName: lp,
      lpAccount: `${lp.toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      fillPrice,
      type,
      comments: `tracking login id ${login}`,
    };
  });
}

// ======================
// COMPONENT
// ======================
export function CBookPage() {
  const gridRef = useRef<AgGridReact<CBookOrder>>(null);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('week');
  
  // Initial snapshot
  const [orders] = useState<CBookOrder[]>(() => generateMockOrders(100));
  
  // Index for streaming updates
  const rowIndexRef = useRef<Map<string, CBookOrder>>(new Map());

  useEffect(() => {
    const m = new Map<string, CBookOrder>();
    for (const r of orders) m.set(getRowId(r), r);
    rowIndexRef.current = m;
  }, [orders]);

  // ======================
  // COLUMN DEFINITIONS
  // ======================
  const columnDefs = useMemo<ColDef<CBookOrder>[]>(() => [
    { 
      field: 'date', 
      headerName: 'Date', 
      filter: 'agDateColumnFilter',
      width: 110,
      pinned: 'left',
      valueFormatter: fmtDate,
      sort: 'desc',
    },
    { 
      field: 'time', 
      headerName: 'Time', 
      filter: 'agDateColumnFilter',
      width: 120,
      pinned: 'left',
      valueFormatter: fmtTime,
    },
    { 
      field: 'dealerId', 
      headerName: 'Dealer ID', 
      filter: 'agSetColumnFilter', 
      width: 100 
    },
    { 
      field: 'symbol', 
      headerName: 'Symbol', 
      filter: 'agSetColumnFilter', 
      width: 100,
      cellStyle: { fontWeight: 500 },
    },
    { 
      field: 'positionId', 
      headerName: 'Position ID', 
      filter: 'agNumberColumnFilter', 
      width: 120 
    },
    { 
      field: 'side', 
      headerName: 'Side', 
      filter: 'agSetColumnFilter',
      width: 80,
      cellRenderer: (p: { value: CBookSide }) => (
        <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : '#e0a020', fontWeight: 500 }}>
          {p.value}
        </span>
      ),
    },
    { 
      field: 'volume', 
      headerName: 'Vol.', 
      filter: 'agNumberColumnFilter', 
      valueFormatter: fmtNum(2), 
      width: 90, 
      type: 'rightAligned' 
    },
    { 
      field: 'lpName', 
      headerName: 'LP Name', 
      filter: 'agSetColumnFilter', 
      width: 110 
    },
    { 
      field: 'lpAccount', 
      headerName: 'LP Account', 
      filter: 'agTextColumnFilter', 
      width: 130 
    },
    { 
      field: 'fillPrice', 
      headerName: 'Fill Price', 
      filter: 'agNumberColumnFilter', 
      valueFormatter: fmtPrice, 
      width: 110, 
      type: 'rightAligned' 
    },
    { 
      field: 'type', 
      headerName: 'Type', 
      filter: 'agSetColumnFilter',
      width: 110,
      filterParams: { values: ['Hedge', 'Opportunity', 'Repair'] },
      cellRenderer: (p: { value: CBookOrderType }) => (
        <span style={{ color: TYPE_COLORS[p.value] || '#999', fontWeight: 500 }}>
          {p.value}
        </span>
      ),
    },
    { 
      field: 'comments', 
      headerName: 'Comments', 
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 180,
      editable: true,
      cellStyle: { color: '#999' },
      cellEditor: 'agTextCellEditor',
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 70,
  }), []);

  const rowSelection = useMemo<RowSelectionOptions>(() => ({
    mode: 'multiRow',
    enableClickSelection: true,
    checkboxes: true,
    headerCheckbox: true,
  }), []);

  const gridOptions = useMemo<GridOptions<CBookOrder>>(() => ({
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
    const rowData = params.node?.data as CBookOrder | undefined;
    return [
      { name: 'View Order Details', action: () => console.log('View:', rowData) },
      { name: 'Track Login', action: () => {
        const login = rowData?.comments?.match(/login id (\d+)/)?.[1];
        console.log('Track Login:', login);
      }},
      'separator',
      'copy',
      'copyWithHeaders',
      'separator',
      { name: 'Export to CSV', action: () => params.api.exportDataAsCsv() },
      { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
    ];
  }, []);

  // ======================
  // STATS (computed from data based on time period)
  // ======================
  const stats = useMemo(() => {
    const now = new Date();
    const filteredOrders = orders.filter(o => {
      const orderDate = new Date(o.date);
      if (timePeriod === 'today') {
        return orderDate.toDateString() === now.toDateString();
      } else if (timePeriod === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return orderDate >= weekAgo;
      }
      // month - show all
      return true;
    });

    const total = filteredOrders.length;
    const totalVolume = filteredOrders.reduce((s, o) => s + o.volume, 0);
    const hedgeCount = filteredOrders.filter(o => o.type === 'Hedge').length;
    const opportunityCount = filteredOrders.filter(o => o.type === 'Opportunity').length;
    const repairCount = filteredOrders.filter(o => o.type === 'Repair').length;
    const buyCount = filteredOrders.filter(o => o.side === 'BUY').length;
    const sellCount = filteredOrders.filter(o => o.side === 'SELL').length;
    const uniqueLps = new Set(filteredOrders.map(o => o.lpName)).size;

    return { total, totalVolume, hedgeCount, opportunityCount, repairCount, buyCount, sellCount, uniqueLps };
  }, [orders, timePeriod]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Page Header - Title + Stats in one row */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between">
        {/* Left: Title */}
        <div>
          <h1 className="text-lg font-semibold text-white">C-Book</h1>
          <p className="text-xs text-[#999]">Hybrid book — Hedge, Opportunity & Repair orders</p>
        </div>
        
        {/* Right: Time Period + Stats */}
        <div className="flex items-center gap-6 text-xs">
          {/* Time Period Selector */}
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as 'today' | 'week' | 'month')}
            className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#4ecdc4]"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          
          <div className="w-px h-4 bg-[#808080]" />
          
          {/* Stats */}
          <div><span className="text-[#999]">Orders:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
          <div><span className="text-[#999]">Long/Short:</span><span className="ml-1 font-mono"><span className="text-[#4ecdc4]">{stats.buyCount}</span><span className="text-[#999]"> / </span><span className="text-[#e0a020]">{stats.sellCount}</span></span></div>
          <div><span className="text-[#999]">Volume:</span><span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span></div>
          <div className="w-px h-4 bg-[#808080]" />
          <div><span className="text-[#999]">H:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Hedge }}>{stats.hedgeCount}</span></div>
          <div><span className="text-[#999]">O:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Opportunity }}>{stats.opportunityCount}</span></div>
          <div><span className="text-[#999]">R:</span><span className="ml-1 font-mono" style={{ color: TYPE_COLORS.Repair }}>{stats.repairCount}</span></div>
          <div className="w-px h-4 bg-[#808080]" />
          <div><span className="text-[#999]">LPs:</span><span className="ml-1 font-mono text-white">{stats.uniqueLps}</span></div>
        </div>
      </div>

      {/* Content Area with padding */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">
        {/* Grid - takes remaining space */}
        <div style={{ flex: 1, width: '100%' }}>
          <AgGridReact<CBookOrder>
            ref={gridRef}
            theme={gridTheme}
            rowData={orders}
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
      </div>
    </div>
  );
}

export default CBookPage;