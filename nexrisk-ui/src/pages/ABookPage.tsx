import { useState, useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams, GetContextMenuItemsParams, MenuItemDef, RowClickedEvent, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

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
export interface ABookHedge {
  id: string;
  time: string;
  login: number;
  symbol: string;
  position_id: number;
  side: 'BUY' | 'SELL';
  volume: number;
  lp: string;
  rule: string;
  profile: 'Low' | 'Medium' | 'High' | 'Critical';
  client_price: number;
  lp_price: number;
  slippage: number;
  status: 'Completed' | 'Failed' | 'Rejected';
  latency: number;
  hedge_pnl: number;
  fix_execution_id: string;
  fix_message: string;
  lp_order_id: string;
  retry_attempts: number;
  reject_reason: string | null;
  commission: number;
  spread_at_execution: number;
  routing_node: string;
}

interface HedgeExposureRow {
  id: string;
  symbol: string;
  lp: string;
  lpAccount: string;
  netLots: number;
  netNotional: number;
  avgPrice: number;
  lastHedge: string;
  avgLatency: number;
  fillSuccessPct: number;
}

type TabType = 'hedge-ledger' | 'hedge-exposure';

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

const fmtDate = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const fmtTime = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

const fmtDateTime = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  return d.toLocaleString('en-GB', { 
    day: '2-digit', month: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  }).replace(',', '');
};

// ======================
// EXPORT HELPERS
// ======================
function getFixDetailsData(row: ABookHedge) {
  return [
    { field: 'ID', value: row.fix_execution_id },
    { field: 'Message', value: row.fix_message },
    { field: 'LP order ID', value: row.lp_order_id },
    { field: 'Retry attempts', value: String(row.retry_attempts) },
    { field: 'Reject reason', value: row.reject_reason || 'N/A' },
    { field: 'Commission', value: `$${row.commission.toFixed(2)}` },
    { field: 'Spread', value: `${row.spread_at_execution.toFixed(1)} pips` },
    { field: 'Routing node', value: row.routing_node },
  ];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToCSV(row: ABookHedge) {
  const data = getFixDetailsData(row);
  const csvContent = [
    'FIX,Description',
    ...data.map(d => `"${d.field}","${d.value.replace(/"/g, '""')}"`)
  ].join('\n');
  downloadFile(csvContent, `fix_details_${row.fix_execution_id}.csv`, 'text/csv;charset=utf-8;');
}

function exportToTXT(row: ABookHedge) {
  const data = getFixDetailsData(row);
  const maxFieldLen = Math.max(...data.map(d => d.field.length));
  const txtContent = [
    '═'.repeat(60),
    '  ORDER FIX DETAILS',
    '═'.repeat(60),
    '',
    ...data.map(d => `${d.field.padEnd(maxFieldLen + 2)}: ${d.value}`),
    '',
    '═'.repeat(60),
    `  Generated: ${new Date().toISOString()}`,
    '═'.repeat(60),
  ].join('\n');
  downloadFile(txtContent, `fix_details_${row.fix_execution_id}.txt`, 'text/plain;charset=utf-8;');
}

function exportToPDF(row: ABookHedge) {
  const data = getFixDetailsData(row);
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order FIX Details - ${row.fix_execution_id}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; padding: 20px; color: #333; }
        h1 { font-size: 14px; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; width: 120px; }
        td { word-break: break-all; }
        .message-cell { font-size: 9px; line-height: 1.4; }
        .footer { margin-top: 20px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
      </style>
    </head>
    <body>
      <h1>Order FIX Details</h1>
      <table>
        <thead><tr><th>FIX</th><th>Description</th></tr></thead>
        <tbody>${data.map(d => `<tr><th>${d.field}</th><td class="${d.field === 'Message' ? 'message-cell' : ''}">${d.value}</td></tr>`).join('')}</tbody>
      </table>
      <div class="footer">Generated: ${new Date().toISOString()} | NexRisk A-Book</div>
    </body>
    </html>
  `;
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}

// ======================
// MOCK DATA
// ======================
function generateMockHedges(count: number): ABookHedge[] {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
  const sides: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
  const lps = ['Lmax', 'Equity', 'CMC', 'FXCM', 'Currenex', 'Hotspot'];
  const rules = ['Default', 'High Volume', 'VIP Client', 'Scalper', 'News Event'];
  const profiles: ('Low' | 'Medium' | 'High' | 'Critical')[] = ['Low', 'Medium', 'High', 'Critical'];
  const statuses: ('Completed' | 'Failed' | 'Rejected')[] = ['Completed', 'Completed', 'Completed', 'Completed', 'Failed', 'Rejected'];

  return Array.from({ length: count }, (_, i) => {
    const symbol = symbols[i % symbols.length];
    const isJPY = symbol.includes('JPY');
    const isXAU = symbol.includes('XAU');
    const isBTC = symbol.includes('BTC');
    const basePrice = isJPY ? 154.5 : isXAU ? 2024 : isBTC ? 42000 : 1.08 + Math.random() * 0.2;
    const client_price = basePrice + (Math.random() - 0.5) * 0.001 * basePrice;
    const lp_price = client_price + (Math.random() - 0.5) * 0.0005 * basePrice;
    const side = sides[Math.floor(Math.random() * 2)];
    const volume = Math.floor(Math.random() * 500 + 10) / 100;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const lp = lps[Math.floor(Math.random() * lps.length)];
    const slippage = (lp_price - client_price) * (side === 'BUY' ? -1 : 1) * (isJPY ? 100 : 10000);

    return {
      id: `H${600000 + i}`,
      time: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      login: 100000 + Math.floor(Math.random() * 900000),
      symbol,
      position_id: 600000 + i,
      side,
      volume,
      lp,
      rule: rules[Math.floor(Math.random() * rules.length)],
      profile: profiles[Math.floor(Math.random() * profiles.length)],
      client_price,
      lp_price,
      slippage: Math.round(slippage * 100) / 100,
      status,
      latency: Math.floor(Math.random() * 150 + 10),
      hedge_pnl: Math.round((Math.random() - 0.4) * 500 * 100) / 100,
      fix_execution_id: `FIX-${Date.now()}-${i}`,
      fix_message: `8=FIX.4.4|9=256|35=8|49=${lp}|56=NEXRISK|34=${i}|52=${new Date().toISOString()}|11=${600000 + i}|17=EXEC${i}|150=F|39=2|55=${symbol}|54=${side === 'BUY' ? '1' : '2'}|38=${volume}|44=${lp_price}|10=123|`,
      lp_order_id: `LP-${lp.toUpperCase()}-${Math.floor(Math.random() * 1000000)}`,
      retry_attempts: status === 'Completed' ? 0 : Math.floor(Math.random() * 3) + 1,
      reject_reason: status === 'Rejected' ? ['Price slippage', 'Insufficient liquidity', 'Quote expired'][Math.floor(Math.random() * 3)] : null,
      commission: Math.round(volume * 3.5 * 100) / 100,
      spread_at_execution: Math.round((Math.random() * 2 + 0.5) * 10) / 10,
      routing_node: `${lp.toLowerCase()}-gw${Math.floor(Math.random() * 4) + 1}.nexrisk.net:${9000 + Math.floor(Math.random() * 100)}`,
    };
  });
}

function generateHedgeExposureData(hedges: ABookHedge[]): HedgeExposureRow[] {
  const symbolLpMap = new Map<string, Map<string, { 
    netLots: number; 
    avgPrice: number; 
    avgLatency: number; 
    lastHedge: string;
    totalHedges: number;
    completedHedges: number;
    lpAccount: string;
  }>>();
  
  hedges.forEach(h => {
    if (!symbolLpMap.has(h.symbol)) {
      symbolLpMap.set(h.symbol, new Map());
    }
    const lpMap = symbolLpMap.get(h.symbol)!;
    
    const lotValue = h.side === 'BUY' ? h.volume : -h.volume;
    const existing = lpMap.get(h.lp);
    
    if (existing) {
      existing.netLots += lotValue;
      existing.avgPrice = (existing.avgPrice * existing.totalHedges + h.lp_price) / (existing.totalHedges + 1);
      existing.avgLatency = (existing.avgLatency * existing.totalHedges + h.latency) / (existing.totalHedges + 1);
      existing.totalHedges += 1;
      if (h.status === 'Completed') existing.completedHedges += 1;
      if (new Date(h.time) > new Date(existing.lastHedge)) {
        existing.lastHedge = h.time;
      }
    } else {
      lpMap.set(h.lp, {
        netLots: lotValue,
        avgPrice: h.lp_price,
        avgLatency: h.latency,
        lastHedge: h.time,
        totalHedges: 1,
        completedHedges: h.status === 'Completed' ? 1 : 0,
        lpAccount: `${h.lp.toUpperCase()}-NET-${Math.floor(Math.random() * 100)}`,
      });
    }
  });

  const rows: HedgeExposureRow[] = [];
  let rowIndex = 0;
  
  symbolLpMap.forEach((lpMap, symbol) => {
    lpMap.forEach((data, lp) => {
      const isXAU = symbol.includes('XAU');
      const isBTC = symbol.includes('BTC');
      const lotSize = isXAU ? 100 : isBTC ? 1 : 100000;
      const netNotional = Math.round(data.netLots * data.avgPrice * lotSize);
      const fillSuccessPct = data.totalHedges > 0 ? Math.round((data.completedHedges / data.totalHedges) * 100) : 0;
      
      rows.push({
        id: `exp-${rowIndex++}`,
        symbol,
        lp,
        lpAccount: data.lpAccount,
        netLots: Math.round(data.netLots * 100) / 100,
        netNotional,
        avgPrice: data.avgPrice,
        lastHedge: data.lastHedge,
        avgLatency: Math.round(data.avgLatency),
        fillSuccessPct,
      });
    });
  });
  
  console.log('Generated exposure data:', rows.length, 'rows');
  return rows;
}

// ======================
// MUTED COLORS
// ======================
const PROFILE_COLORS: Record<string, string> = {
  Low: '#6b7280',
  Medium: '#9ca3af',
  High: '#a1a1aa',
  Critical: '#d4d4d8',
};

const STATUS_COLORS: Record<string, string> = {
  Completed: '#6b7280',
  Failed: '#9ca3af',
  Rejected: '#a1a1aa',
};

// ======================
// COMPONENT
// ======================
export function ABookPage() {
  const gridRef = useRef<AgGridReact<ABookHedge>>(null);
  const exposureGridRef = useRef<AgGridReact<HedgeExposureRow>>(null);
  const [activeTab, setActiveTab] = useState<TabType>('hedge-ledger');
  const [group, setGroup] = useState('');
  const [symbol, setSymbol] = useState('');
  const [lpFilter, setLpFilter] = useState('');
  const [headerLpFilter, setHeaderLpFilter] = useState('');
  const [timePeriod, setTimePeriod] = useState<'today' | 'month'>('month');
  const [selectedRow, setSelectedRow] = useState<ABookHedge | null>(null);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  
  // Hedge Exposure state
  const [selectedExposureRow, setSelectedExposureRow] = useState<HedgeExposureRow | null>(null);
  const [domQuantity, setDomQuantity] = useState<string>('');
  const [domOrderType, setDomOrderType] = useState<'Market' | 'Limit'>('Market');
  const [domTif, setDomTif] = useState<'IOC' | 'FOK' | 'GTC'>('IOC');
  
  const [hedges] = useState<ABookHedge[]>(() => generateMockHedges(100));
  const hedgeExposureData = useMemo(() => generateHedgeExposureData(hedges), [hedges]);

  // Get unique LPs for dropdowns
  const lpOptions = useMemo(() => {
    const lps = new Set(hedges.map(h => h.lp));
    return Array.from(lps).sort();
  }, [hedges]);

  // ======================
  // MAIN GRID COLUMN DEFINITIONS
  // ======================
  const columnDefs = useMemo<ColDef<ABookHedge>[]>(() => [
    { field: 'time', headerName: 'Date', filter: 'agDateColumnFilter', sort: 'desc', width: 100, pinned: 'left', valueFormatter: fmtDate },
    { field: 'time', headerName: 'Time', filter: 'agDateColumnFilter', width: 120, pinned: 'left', valueFormatter: fmtTime },
    { field: 'login', headerName: 'Login', filter: 'agNumberColumnFilter', width: 100 },
    { field: 'symbol', headerName: 'Symbol', filter: 'agSetColumnFilter', width: 100 },
    { field: 'position_id', headerName: 'Position', filter: 'agNumberColumnFilter', width: 100 },
    { field: 'side', headerName: 'Side', filter: 'agSetColumnFilter', width: 80,
      cellRenderer: (p: { value: string }) => <span style={{ color: p.value === 'BUY' ? '#4ecdc4' : '#e0a020' }}>{p.value}</span> },
    { field: 'volume', headerName: 'Volume', filter: 'agNumberColumnFilter', valueFormatter: fmtNum(2), width: 90, type: 'rightAligned' },
    { field: 'lp', headerName: 'LP', filter: 'agSetColumnFilter', width: 90 },
    { field: 'rule', headerName: 'Rule', filter: 'agSetColumnFilter', width: 100 },
    { field: 'profile', headerName: 'Profile', filter: 'agSetColumnFilter', width: 90,
      cellRenderer: (p: { value: string }) => <span style={{ color: PROFILE_COLORS[p.value] || '#9ca3af' }}>{p.value}</span> },
    { field: 'client_price', headerName: 'Client Price', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
    { field: 'lp_price', headerName: 'LP Price', filter: 'agNumberColumnFilter', valueFormatter: fmtPrice, width: 110, type: 'rightAligned' },
    { field: 'slippage', headerName: 'Slippage', filter: 'agNumberColumnFilter', width: 100, type: 'rightAligned',
      cellRenderer: (p: { value: number }) => {
        const val = p.value;
        const color = val > 0 ? '#66e07a' : val < 0 ? '#ff6b6b' : '#999';
        return <span style={{ color }}>{val.toFixed(2)}</span>;
      }},
    { field: 'status', headerName: 'Status', filter: 'agSetColumnFilter', width: 100,
      cellRenderer: (p: { value: string }) => <span style={{ color: STATUS_COLORS[p.value] || '#9ca3af' }}>{p.value}</span> },
    { field: 'latency', headerName: 'Latency', filter: 'agNumberColumnFilter', width: 90, type: 'rightAligned',
      valueFormatter: (p) => p.value ? `${p.value}ms` : '' },
    { field: 'hedge_pnl', headerName: 'Hedge P/L', filter: 'agNumberColumnFilter', width: 110, type: 'rightAligned',
      cellRenderer: (p: { value: number }) => {
        const val = p.value;
        const color = val > 0 ? '#66e07a' : val < 0 ? '#ff6b6b' : '#999';
        const prefix = val >= 0 ? '$' : '-$';
        return <span style={{ color }}>{prefix}{Math.abs(val).toFixed(2)}</span>;
      }},
  ], []);

  // ======================
  // HEDGE EXPOSURE COLUMN DEFINITIONS
  // ======================
  const exposureColDefs = useMemo<ColDef<HedgeExposureRow>[]>(() => [
    { 
      field: 'symbol', 
      headerName: 'Symbol', 
      rowGroup: true, 
      hide: true,
    },
    { 
      field: 'lp', 
      headerName: 'LP', 
      filter: 'agSetColumnFilter',
    },
    { 
      field: 'lpAccount', 
      headerName: 'Account', 
      filter: 'agTextColumnFilter',
    },
    { 
      field: 'netLots', 
      headerName: 'Net Lots', 
      filter: 'agNumberColumnFilter', 
      type: 'rightAligned',
      aggFunc: 'sum',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        const val = Number(p.value);
        const prefix = val > 0 ? '+' : '';
        return `${prefix}${val.toFixed(2)}`;
      },
      cellStyle: (p) => {
        if (p.value === undefined || p.value === null) return {};
        const val = Number(p.value);
        return { color: val > 0 ? '#4ecdc4' : val < 0 ? '#e0a020' : '#999' };
      },
    },
    { 
      field: 'netNotional', 
      headerName: 'Net Notional', 
      filter: 'agNumberColumnFilter', 
      type: 'rightAligned',
      aggFunc: 'sum',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        const val = Number(p.value);
        const absVal = Math.abs(val);
        const formatted = absVal >= 1000000 ? `${(absVal / 1000000).toFixed(2)}M` : absVal >= 1000 ? `${(absVal / 1000).toFixed(1)}K` : absVal.toFixed(0);
        return `${val < 0 ? '-' : ''}$${formatted}`;
      },
      cellStyle: (p) => {
        if (p.value === undefined || p.value === null) return {};
        const val = Number(p.value);
        return { color: val > 0 ? '#4ecdc4' : val < 0 ? '#e0a020' : '#999' };
      },
    },
    { 
      field: 'avgPrice', 
      headerName: 'Avg Price', 
      filter: 'agNumberColumnFilter', 
      type: 'rightAligned',
      aggFunc: 'avg',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        return Number(p.value).toFixed(5);
      },
    },
    { 
      field: 'lastHedge', 
      headerName: 'Last Hedge', 
      filter: 'agDateColumnFilter',
      aggFunc: 'max',
      valueFormatter: fmtDateTime,
    },
    { 
      field: 'avgLatency', 
      headerName: 'Avg Latency', 
      filter: 'agNumberColumnFilter', 
      type: 'rightAligned',
      aggFunc: 'avg',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        return `${Math.round(Number(p.value))}ms`;
      },
    },
    { 
      field: 'fillSuccessPct', 
      headerName: 'Fill Success %', 
      filter: 'agNumberColumnFilter', 
      type: 'rightAligned',
      aggFunc: 'avg',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        return `${Math.round(Number(p.value))}%`;
      },
      cellStyle: (p) => {
        if (p.value === undefined || p.value === null) return {};
        const val = Math.round(Number(p.value));
        return { color: val >= 95 ? '#66e07a' : val >= 80 ? '#e0a020' : '#ff6b6b' };
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, minWidth: 80 }), []);

  const rowSelection = useMemo<RowSelectionOptions>(() => ({
    mode: 'multiRow', enableClickSelection: true, checkboxes: true, headerCheckbox: true,
  }), []);

  const gridOptions = useMemo<GridOptions<ABookHedge>>(() => ({
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

  const autoGroupColumnDef = useMemo<ColDef>(() => ({
    headerName: 'Symbol',
    minWidth: 200,
    cellRendererParams: {
      suppressCount: false,
    },
  }), []);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
    const rowData = params.node?.data as ABookHedge | undefined;
    return [
      { name: 'View FIX Details', action: () => { if (rowData) { setSelectedRow(rowData); setDetailsPanelOpen(true); } } },
      'separator', 'copy', 'copyWithHeaders', 'separator',
      { name: 'Export to CSV', action: () => params.api.exportDataAsCsv() },
      { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
    ];
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent<ABookHedge>) => {
    if (event.data) { setSelectedRow(event.data); setDetailsPanelOpen(true); }
  }, []);

  const onExposureGridReady = useCallback((event: GridReadyEvent<HedgeExposureRow>) => {
    console.log('Exposure grid ready, row count:', event.api.getDisplayedRowCount());
    setTimeout(() => {
      event.api.autoSizeAllColumns();
      // Expand only the first group row
      const firstRowNode = event.api.getDisplayedRowAtIndex(0);
      if (firstRowNode && firstRowNode.group) {
        firstRowNode.setExpanded(true);
      }
    }, 100);
  }, []);

  const onExposureRowClicked = useCallback((event: RowClickedEvent<HedgeExposureRow>) => {
    console.log('Row clicked:', event.node, event.data);
    // For leaf rows (LP rows), event.data exists
    if (event.data) {
      console.log('Setting selected exposure row:', event.data);
      setSelectedExposureRow(event.data);
      setDomQuantity(Math.abs(event.data.netNotional).toString());
    } else if (event.node.group && event.node.key) {
      // For group rows (Symbol rows), find the first child with data
      const firstChild = hedgeExposureData.find(row => row.symbol === event.node.key);
      if (firstChild) {
        console.log('Setting from group row, first child:', firstChild);
        setSelectedExposureRow(firstChild);
        setDomQuantity(Math.abs(firstChild.netNotional).toString());
      }
    }
  }, [hedgeExposureData]);

  const onExposureCellClicked = useCallback((event: any) => {
    console.log('Cell clicked:', event);
    if (event.data) {
      console.log('Cell click - Setting selected exposure row:', event.data);
      setSelectedExposureRow(event.data);
      setDomQuantity(Math.abs(event.data.netNotional).toString());
    }
  }, []);

  // Generate mock DOM data based on selected symbol
  const domData = useMemo(() => {
    console.log('Computing domData, selectedExposureRow:', selectedExposureRow);
    if (!selectedExposureRow) return null;
    
    const basePrice = selectedExposureRow.avgPrice;
    const isJPY = selectedExposureRow.symbol.includes('JPY');
    const isXAU = selectedExposureRow.symbol.includes('XAU');
    const isBTC = selectedExposureRow.symbol.includes('BTC');
    const pipSize = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
    const decimals = isJPY ? 3 : isXAU ? 2 : isBTC ? 2 : 5;
    
    const spread = pipSize * (2 + Math.random() * 3);
    const bidBase = basePrice - spread / 2;
    const askBase = basePrice + spread / 2;
    
    const levels = 5;
    const bids: { price: number; size: number }[] = [];
    const asks: { price: number; size: number }[] = [];
    
    for (let i = 0; i < levels; i++) {
      bids.push({
        price: bidBase - (i * pipSize),
        size: Math.round((10 + Math.random() * 200) * 100) / 100,
      });
      asks.push({
        price: askBase + (i * pipSize),
        size: Math.round((10 + Math.random() * 200) * 100) / 100,
      });
    }
    
    const last = bidBase + (Math.random() * spread);
    const open = last * (1 + (Math.random() - 0.5) * 0.002);
    const high = Math.max(last, open) * (1 + Math.random() * 0.001);
    const low = Math.min(last, open) * (1 - Math.random() * 0.001);
    const change = ((last - open) / open) * 100;
    
    return {
      symbol: selectedExposureRow.symbol,
      lp: selectedExposureRow.lp,
      last: last.toFixed(decimals),
      open: open.toFixed(decimals),
      high: high.toFixed(decimals),
      low: low.toFixed(decimals),
      change: change.toFixed(2),
      volume: '-',
      bids,
      asks,
      decimals,
    };
  }, [selectedExposureRow]);

  // ======================
  // STATS
  // ======================
  const stats = useMemo(() => {
    const filteredHedges = headerLpFilter ? hedges.filter(h => h.lp === headerLpFilter) : hedges;
    const factor = timePeriod === 'today' ? 1 : 22;
    
    const total = filteredHedges.length * factor;
    const totalVolume = filteredHedges.reduce((s, h) => s + h.volume, 0) * factor;
    const totalPnL = filteredHedges.reduce((s, h) => s + h.hedge_pnl, 0) * factor;
    const buyCount = filteredHedges.filter(h => h.side === 'BUY').length * factor;
    const sellCount = filteredHedges.filter(h => h.side === 'SELL').length * factor;
    const completedCount = filteredHedges.filter(h => h.status === 'Completed').length * factor;
    const hedgedRatio = total > 0 ? (completedCount / total) * 100 : 0;
    
    const criticalCount = filteredHedges.filter(h => h.profile === 'Critical').length;
    const highCount = filteredHedges.filter(h => h.profile === 'High').length;
    const mediumCount = filteredHedges.filter(h => h.profile === 'Medium').length;
    const lowCount = filteredHedges.filter(h => h.profile === 'Low').length;
    const profileTotal = criticalCount + highCount + mediumCount + lowCount;
    
    return { 
      total, totalVolume, totalPnL, buyCount, sellCount, completedCount, hedgedRatio,
      criticalPct: profileTotal > 0 ? (criticalCount / profileTotal) * 100 : 0,
      highPct: profileTotal > 0 ? (highCount / profileTotal) * 100 : 0,
      mediumPct: profileTotal > 0 ? (mediumCount / profileTotal) * 100 : 0,
      lowPct: profileTotal > 0 ? (lowCount / profileTotal) * 100 : 0,
    };
  }, [hedges, headerLpFilter, timePeriod]);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Page Header */}
      <div className="px-4 py-2 border-b border-[#808080]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">A-Book</h1>
            <p className="text-xs text-[#999]">Hedged flow — Orders routed to liquidity providers</p>
          </div>
          
          <div className="flex items-center gap-4 text-xs">
            <select value={headerLpFilter} onChange={(e) => setHeaderLpFilter(e.target.value)}
              className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#4ecdc4]">
              <option value="">All LPs</option>
              {lpOptions.map(lp => <option key={lp} value={lp}>{lp}</option>)}
            </select>
            <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value as 'today' | 'month')}
              className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#4ecdc4]">
              <option value="today">Today</option>
              <option value="month">This Month</option>
            </select>
            <div className="w-px h-4 bg-[#808080]" />
            <div><span className="text-[#999]">Positions:</span><span className="ml-1 font-mono text-white">{stats.total}</span></div>
            <div><span className="text-[#999]">Long/Short:</span><span className="ml-1 font-mono"><span className="text-[#4ecdc4]">{stats.buyCount}</span><span className="text-[#999]"> / </span><span className="text-[#e0a020]">{stats.sellCount}</span></span></div>
            <div><span className="text-[#999]">Volume:</span><span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span></div>
            <div><span className="text-[#999]">P&L:</span><span className={clsx('ml-1 font-mono', stats.totalPnL >= 0 ? 'text-[#66e07a]' : 'text-[#ff6b6b]')}>{stats.totalPnL >= 0 ? '' : '-'}${Math.abs(stats.totalPnL).toFixed(2)}</span></div>
            <div><span className="text-[#999]">A/B Hedged Ratio:</span><span className="ml-1 font-mono text-white">{stats.hedgedRatio.toFixed(0)}%</span></div>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-3 mt-2 text-xs">
          <span className="text-[#666] italic">Hedging:</span>
          <div><span className="text-[#999]">Critical:</span><span className="ml-1 font-mono text-white">{stats.criticalPct.toFixed(0)}%</span></div>
          <div><span className="text-[#999]">High:</span><span className="ml-1 font-mono text-white">{stats.highPct.toFixed(0)}%</span></div>
          <div><span className="text-[#999]">Medium:</span><span className="ml-1 font-mono text-white">{stats.mediumPct.toFixed(0)}%</span></div>
          <div><span className="text-[#999]">Low:</span><span className="ml-1 font-mono text-white">{stats.lowPct.toFixed(0)}%</span></div>
          <div className="w-px h-3 bg-[#555]" />
          <div><span className="text-[#999]">Total:</span><span className="ml-1 font-mono text-white">100%</span></div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-4 border-b border-[#808080]" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="flex gap-0">
          <button onClick={() => setActiveTab('hedge-ledger')}
            className={clsx("px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === 'hedge-ledger' ? "text-[#4ecdc4]" : "text-[#999] hover:text-white")}>
            Hedge Ledger
            {activeTab === 'hedge-ledger' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4ecdc4]" />}
          </button>
          <button onClick={() => setActiveTab('hedge-exposure')}
            className={clsx("px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === 'hedge-exposure' ? "text-[#4ecdc4]" : "text-[#999] hover:text-white")}>
            Hedge Exposure
            {activeTab === 'hedge-exposure' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4ecdc4]" />}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'hedge-ledger' && (
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          {/* Filter Bar */}
          <div className="flex items-center gap-3 px-2 py-2 border-b border-[#808080]">
            <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="All Groups / All Traders"
              className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white placeholder-[#888] focus:outline-none focus:border-[#4ecdc4]" />
            <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="All Symbols"
              className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white placeholder-[#888] focus:outline-none focus:border-[#4ecdc4]" />
            <select value={lpFilter} onChange={(e) => setLpFilter(e.target.value)}
              className="flex-1 bg-[#232225] border border-[#808080] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#4ecdc4]">
              <option value="">All Liquidity Providers</option>
              {lpOptions.map(lp => <option key={lp} value={lp}>{lp}</option>)}
            </select>
            <button className="px-6 py-1.5 rounded text-sm font-medium bg-[#4ecdc4] hover:bg-[#3dbdb5] text-black">Request</button>
          </div>

          {/* Main content: Grid + Details Panel */}
          <div className="flex-1 flex gap-0 min-h-0">
            <div style={{ flex: detailsPanelOpen ? '1 1 75%' : '1 1 100%', minWidth: 0 }}>
              <AgGridReact<ABookHedge>
                ref={gridRef} theme={gridTheme} rowData={hedges} columnDefs={columnDefs}
                defaultColDef={defaultColDef} gridOptions={gridOptions} rowHeight={26} headerHeight={36}
                getRowId={(p) => p.data.id} rowSelection={rowSelection}
                cellSelection={{ enableHeaderHighlight: true }}
                getContextMenuItems={getContextMenuItems} onRowClicked={onRowClicked}
              />
            </div>

            {/* Details Panel */}
            {detailsPanelOpen && (
              <div className="flex flex-col border-l border-[#808080]" style={{ width: '320px', backgroundColor: '#313032' }}>
                <div className="px-3 py-2 border-b border-[#808080] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Order FIX Details</h3>
                  <button onClick={() => setDetailsPanelOpen(false)} className="text-[#999] hover:text-white transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-[#3a3a3c] flex items-center gap-2">
                  <span className="text-[10px] text-[#666] mr-1">Export:</span>
                  {['CSV', 'TXT', 'PDF'].map((fmt) => (
                    <button key={fmt}
                      onClick={() => selectedRow && (fmt === 'CSV' ? exportToCSV(selectedRow) : fmt === 'TXT' ? exportToTXT(selectedRow) : exportToPDF(selectedRow))}
                      disabled={!selectedRow}
                      className={clsx("px-2 py-1 text-[10px] rounded border transition-colors",
                        selectedRow ? "text-white border-[#555] hover:bg-[#3a3a3c] hover:border-[#666]" : "text-[#555] border-[#3a3a3c] cursor-not-allowed")}
                      title={selectedRow ? `Download as ${fmt}` : "Select a row first"}>
                      {fmt}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#232225' }}>
                        <th className="text-left py-2 px-3 text-[#999] font-medium border-b border-[#555]" style={{ width: '100px' }}>FIX</th>
                        <th className="text-left py-2 px-3 text-[#999] font-medium border-b border-[#555]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'ID', value: selectedRow?.fix_execution_id },
                        { label: 'Message', value: selectedRow?.fix_message, isMessage: true },
                        { label: 'LP order ID', value: selectedRow?.lp_order_id },
                        { label: 'Retry attempts', value: selectedRow?.retry_attempts },
                        { label: 'Reject reason', value: selectedRow?.reject_reason || 'N/A' },
                        { label: 'Commission', value: selectedRow ? `$${selectedRow.commission.toFixed(2)}` : undefined },
                        { label: 'Spread', value: selectedRow ? `${selectedRow.spread_at_execution.toFixed(1)} pips` : undefined },
                        { label: 'Routing node', value: selectedRow?.routing_node },
                      ].map((row) => (
                        <tr key={row.label} className="border-b border-[#3a3a3c]" style={row.isMessage ? { backgroundColor: '#2a2a2c' } : {}}>
                          <td className={clsx("py-2 px-3 text-[#999] whitespace-nowrap align-top", row.isMessage && "py-3")}>{row.label}</td>
                          <td className={clsx("py-2 px-3 text-white font-mono", row.isMessage ? "text-[10px] leading-relaxed break-all py-3" : "text-[11px]")}>
                            {row.value !== undefined ? (row.isMessage ? <div style={{ maxHeight: '100px', overflowY: 'auto' }}>{row.value}</div> : row.value) : <span className="text-[#555]">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!detailsPanelOpen && (
              <button onClick={() => setDetailsPanelOpen(true)}
                className="flex items-center justify-center border-l border-[#808080] bg-[#232225] hover:bg-[#3a3a3c] transition-colors"
                style={{ width: '28px' }} title="Show Details Panel">
                <span className="text-[#999] text-xs font-medium whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  Order FIX Details
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hedge Exposure Tab */}
      {activeTab === 'hedge-exposure' && (
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => exposureGridRef.current?.api?.expandAll()}
              className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={() => exposureGridRef.current?.api?.collapseAll()}
              className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors"
            >
              Collapse All
            </button>
          </div>
          
          <div className="flex-1 flex overflow-hidden gap-2">
            {/* Main Grid */}
            <div className="flex-1 min-h-0">
              <AgGridReact<HedgeExposureRow>
                ref={exposureGridRef}
                theme={gridTheme}
                rowData={hedgeExposureData}
                columnDefs={exposureColDefs}
                defaultColDef={defaultColDef}
                autoGroupColumnDef={autoGroupColumnDef}
                groupDefaultExpanded={0}
                suppressAggFuncInHeader={true}
                enableAdvancedFilter={true}
                rowHeight={28}
                headerHeight={36}
                onGridReady={onExposureGridReady}
                onRowClicked={onExposureRowClicked}
                onCellClicked={onExposureCellClicked}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true }}
              />
            </div>

            {/* DOM Panel */}
          <div className="flex flex-col border border-[#555] rounded overflow-hidden" style={{ width: '320px', backgroundColor: '#232225' }}>
            {/* DOM Header */}
            <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between" style={{ backgroundColor: '#1a1a1c' }}>
              <span className="text-sm font-medium text-white">Market Depth</span>
              <div className="flex items-center gap-2">
                <div className={clsx("w-2 h-2 rounded-full", selectedExposureRow ? "bg-[#4ecdc4]" : "bg-[#555]")} title={selectedExposureRow ? "Connected" : "No Selection"} />
              </div>
            </div>

            {/* Symbol & LP Info */}
            <div className="px-3 py-2 border-b border-[#555]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#666] bg-[#333] px-1.5 py-0.5 rounded">FX</span>
                  <span className="text-sm font-semibold text-white">{selectedExposureRow?.symbol || '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[#666]">LP:</span>
                  {selectedExposureRow ? (
                    <span className="text-xs font-medium text-[#4ecdc4]">{selectedExposureRow.lp}</span>
                  ) : (
                    <span className="text-xs text-[#555] italic">Select LP</span>
                  )}
                </div>
              </div>
            </div>

            {/* Price Stats */}
            <div className="px-3 py-2 border-b border-[#555] grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[#666]">Last </span>
                <span className="text-white font-mono">{domData?.last || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Open </span>
                <span className="text-white font-mono">{domData?.open || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Chg </span>
                <span className={clsx("font-mono", domData && Number(domData.change) >= 0 ? "text-[#4ecdc4]" : domData ? "text-[#ff6b6b]" : "text-[#555]")}>
                  {domData ? `${Number(domData.change) >= 0 ? '+' : ''}${domData.change}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[#666]">High </span>
                <span className="text-white font-mono">{domData?.high || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Vol </span>
                <span className="text-white font-mono">{domData?.volume || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Low </span>
                <span className="text-white font-mono">{domData?.low || '—'}</span>
              </div>
            </div>

            {/* Order Book */}
            <div className="flex-1 overflow-auto px-2 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#666]">
                    <th className="text-right py-1 pr-2 font-medium">Size</th>
                    <th className="text-center py-1 font-medium">Bid</th>
                    <th className="text-center py-1 font-medium">Ask</th>
                    <th className="text-left py-1 pl-2 font-medium">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {domData ? (
                    domData.bids.map((bid, i) => {
                      const ask = domData.asks[i];
                      const maxSize = Math.max(...domData.bids.map(b => b.size), ...domData.asks.map(a => a.size));
                      const bidWidth = (bid.size / maxSize) * 100;
                      const askWidth = (ask.size / maxSize) * 100;
                      
                      return (
                        <tr key={i} className="relative">
                          <td className="text-right py-1 pr-2 relative">
                            <div 
                              className="absolute right-0 top-0 bottom-0 opacity-40"
                              style={{ width: `${bidWidth}%`, backgroundColor: '#4ecdc4' }}
                            />
                            <span className="relative text-[#4ecdc4] font-mono">{bid.size.toFixed(2)}</span>
                          </td>
                          <td className="text-center py-1">
                            <span className="text-[#4ecdc4] font-mono font-medium">{bid.price.toFixed(domData.decimals)}</span>
                          </td>
                          <td className="text-center py-1">
                            <span className="text-[#e0a020] font-mono font-medium">{ask.price.toFixed(domData.decimals)}</span>
                          </td>
                          <td className="text-left py-1 pl-2 relative">
                            <div 
                              className="absolute left-0 top-0 bottom-0 opacity-40"
                              style={{ width: `${askWidth}%`, backgroundColor: '#e0a020' }}
                            />
                            <span className="relative text-[#e0a020] font-mono">{ask.size.toFixed(2)}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    // Empty placeholder rows
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="relative">
                        <td className="text-right py-1 pr-2 text-[#555] font-mono">—</td>
                        <td className="text-center py-1 text-[#555] font-mono">—</td>
                        <td className="text-center py-1 text-[#555] font-mono">—</td>
                        <td className="text-left py-1 pl-2 text-[#555] font-mono">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Order Entry */}
            <div className="px-3 py-3 border-t border-[#555]" style={{ backgroundColor: '#1a1a1c' }}>
              {/* Order Type & TIF */}
              <div className="flex gap-2 mb-3">
                <select 
                  value={domOrderType} 
                  onChange={(e) => setDomOrderType(e.target.value as 'Market' | 'Limit')}
                  disabled={!selectedExposureRow}
                  className={clsx(
                    "flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]",
                    !selectedExposureRow && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <option value="Market">Market</option>
                  <option value="Limit">Limit</option>
                </select>
                <select 
                  value={domTif} 
                  onChange={(e) => setDomTif(e.target.value as 'IOC' | 'FOK' | 'GTC')}
                  disabled={!selectedExposureRow}
                  className={clsx(
                    "flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]",
                    !selectedExposureRow && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <option value="IOC">IOC</option>
                  <option value="FOK">FOK</option>
                  <option value="GTC">GTC</option>
                </select>
              </div>

              {/* Quantity */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={domQuantity}
                    onChange={(e) => {
                      if (!selectedExposureRow) return;
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      const maxVal = Math.abs(selectedExposureRow.netNotional);
                      const numVal = parseFloat(val) || 0;
                      if (numVal <= maxVal) {
                        setDomQuantity(val);
                      }
                    }}
                    disabled={!selectedExposureRow}
                    className={clsx(
                      "flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4]",
                      !selectedExposureRow && "opacity-50 cursor-not-allowed"
                    )}
                    placeholder="Quantity"
                  />
                  <div className="flex flex-col">
                    <button 
                      onClick={() => {
                        if (!selectedExposureRow) return;
                        const current = parseFloat(domQuantity) || 0;
                        const maxVal = Math.abs(selectedExposureRow.netNotional);
                        const step = maxVal * 0.1;
                        setDomQuantity(Math.min(current + step, maxVal).toFixed(0));
                      }}
                      disabled={!selectedExposureRow}
                      className={clsx("px-1 py-0.5 text-[#999] hover:text-white text-[10px]", !selectedExposureRow && "opacity-50 cursor-not-allowed")}
                    >▲</button>
                    <button 
                      onClick={() => {
                        if (!selectedExposureRow) return;
                        const current = parseFloat(domQuantity) || 0;
                        const step = Math.abs(selectedExposureRow.netNotional) * 0.1;
                        setDomQuantity(Math.max(current - step, 0).toFixed(0));
                      }}
                      disabled={!selectedExposureRow}
                      className={clsx("px-1 py-0.5 text-[#999] hover:text-white text-[10px]", !selectedExposureRow && "opacity-50 cursor-not-allowed")}
                    >▼</button>
                  </div>
                </div>
                <div className="text-[10px] text-[#666] mt-1">
                  Max: {selectedExposureRow ? `$${Math.abs(selectedExposureRow.netNotional).toLocaleString()}` : '—'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  disabled={!selectedExposureRow || selectedExposureRow.netNotional >= 0}
                  className={clsx(
                    "flex-1 py-2 rounded text-xs font-semibold transition-colors",
                    selectedExposureRow && selectedExposureRow.netNotional < 0
                      ? "bg-[#4ecdc4] hover:bg-[#3dbdb5] text-black"
                      : "bg-[#3a3a3c] text-[#555] cursor-not-allowed"
                  )}
                >
                  Close Buy
                </button>
                <button
                  disabled={!selectedExposureRow}
                  className={clsx(
                    "flex-1 py-2 rounded text-xs font-medium bg-[#2a2a2c] border border-[#555] transition-colors",
                    selectedExposureRow ? "text-[#999] hover:text-white hover:border-[#666]" : "text-[#555] cursor-not-allowed"
                  )}
                >
                  Cancel All
                </button>
                <button
                  disabled={!selectedExposureRow || selectedExposureRow.netNotional <= 0}
                  className={clsx(
                    "flex-1 py-2 rounded text-xs font-semibold transition-colors",
                    selectedExposureRow && selectedExposureRow.netNotional > 0
                      ? "bg-[#e0a020] hover:bg-[#c89018] text-black"
                      : "bg-[#3a3a3c] text-[#555] cursor-not-allowed"
                  )}
                >
                  Close Sell
                </button>
              </div>

              {/* Order Execution Confirmation */}
              <div className="mt-3 pt-3 border-t border-[#555]">
                <div className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Order Execution</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#666]">Position ID: </span>
                    <span className="text-white font-mono">{selectedExposureRow ? `POS-${selectedExposureRow.id.split('-')[1] || '000'}` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#666]">FIX ID: </span>
                    <span className="text-white font-mono">{selectedExposureRow ? `FIX-${Date.now().toString().slice(-8)}` : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

    </div>
  );
}

export default ABookPage;