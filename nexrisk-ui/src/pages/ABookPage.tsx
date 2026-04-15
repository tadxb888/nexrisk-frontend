import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef, GridOptions, RowSelectionOptions, ValueFormatterParams,
  GetContextMenuItemsParams, MenuItemDef, RowClickedEvent, GridReadyEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ======================
// THEME (Quartz dark)
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#232326',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 14,
});

// ======================
// TYPES
// ======================

/** Shape returned by GET /api/v1/hedge/records — Section 7.1 of Hedging Manager API. */
export interface HedgeRecord {
  record_id: number;
  position_id: number;
  login_id: number;
  mt5_symbol: string;
  direction: 'LONG' | 'SHORT';
  parent_record_id: number | null;
  rule_id: number | null;
  rule_name: string | null;
  feed_lp_id: string;
  hedging_lp_id: string;
  clord_id: string;
  lp_position_id: string | null;
  hedge_volume_pct: number;
  hedge_volume_mt5: number;
  hedge_volume_lp: number;
  volume_multiplier: number;
  price_multiplier: number;
  client_fill_price: number | null;
  raw_feed_price: number | null;
  lp_hedge_fill_price_lp: number | null;
  lp_hedge_fill_price_mt5: number | null;
  lp_fill_volume_lp: number | null;
  lp_fill_volume_mt5: number | null;
  net_revenue_pips: number | null;
  net_revenue_usd: number | null;
  hedge_state: string;
  escalation_reason: string | null;
  rejection_code: string | null;
  dispatched_at: string;
  confirmed_at: string | null;
  closed_at: string | null;
  escalated_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
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
type DatePeriod = 'today' | 'month';

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
  // Works for both HedgeRecord (mt5_symbol) and legacy (symbol)
  const sym: string = p.data?.mt5_symbol ?? p.data?.symbol ?? '';
  if (v === null || v === undefined) return '';
  if (sym.includes('JPY')) return Number(v).toFixed(3);
  if (sym.includes('XAU') || sym.includes('BTC')) return Number(v).toFixed(2);
  return Number(v).toFixed(5);
};

const fmtDate = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const fmtTime = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

const fmtDateTime = (p: ValueFormatterParams) => {
  if (!p.value) return '';
  const d = new Date(p.value);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replace(',', '');
};

// ======================
// COLORS
// ======================
const HEDGE_STATE_COLORS: Record<string, string> = {
  PENDING:             '#9ca3af',
  PARTIAL:             '#a1a1aa',
  HEDGED:              '#6b7280',
  CLOSING:             '#a1a1aa',
  CLOSED:              '#6b7280',
  TIMEOUT_ESCALATED:   '#d4d4d8',
  REJECTED_ESCALATED:  '#d4d4d8',
  NORMALIZER_ERROR:    '#d4d4d8',
  B_BOOKED:            '#6b7280',
};

const DIRECTION_COLORS: Record<string, string> = {
  LONG:  '#49b3b3',
  SHORT: '#e0a020',
};

// ======================
// EXPORT HELPERS — Hedge Record Details
// ======================
function getRecordDetailsData(row: HedgeRecord) {
  const latency =
    row.dispatched_at && row.confirmed_at
      ? `${new Date(row.confirmed_at).getTime() - new Date(row.dispatched_at).getTime()}ms`
      : 'N/A';

  return [
    { field: 'ClOrd ID',      value: row.clord_id },
    { field: 'LP Order ID',   value: row.lp_position_id || 'N/A' },
    { field: 'State',         value: row.hedge_state },
    { field: 'Direction',     value: row.direction },
    { field: 'Volume',        value: `${row.hedge_volume_mt5.toFixed(2)} lots (${row.hedge_volume_pct}%)` },
    { field: 'Client Price',  value: row.client_fill_price != null ? String(row.client_fill_price) : 'N/A' },
    { field: 'LP Fill Price', value: row.lp_hedge_fill_price_mt5 != null ? String(row.lp_hedge_fill_price_mt5) : 'N/A' },
    { field: 'Revenue',       value: row.net_revenue_usd != null ? `$${row.net_revenue_usd.toFixed(2)}` : 'N/A' },
    { field: 'Rev Pips',      value: row.net_revenue_pips != null ? `${row.net_revenue_pips.toFixed(1)} pips` : 'N/A' },
    { field: 'Feed LP',       value: row.feed_lp_id },
    { field: 'Reject Code',   value: row.rejection_code || 'N/A' },
    { field: 'Escalation',    value: row.escalation_reason || 'N/A' },
    { field: 'Dispatched',    value: row.dispatched_at },
    { field: 'Confirmed',     value: row.confirmed_at || 'Pending' },
    { field: 'Latency',       value: latency },
  ];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportToCSV(row: HedgeRecord) {
  const data = getRecordDetailsData(row);
  const csvContent = [
    'FIX,Description',
    ...data.map(d => `"${d.field}","${d.value.replace(/"/g, '""')}"`),
  ].join('\n');
  downloadFile(csvContent, `hedge_record_${row.record_id}.csv`, 'text/csv;charset=utf-8;');
}

function exportToTXT(row: HedgeRecord) {
  const data = getRecordDetailsData(row);
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
  downloadFile(txtContent, `hedge_record_${row.record_id}.txt`, 'text/plain;charset=utf-8;');
}

function exportToPDF(row: HedgeRecord) {
  const data = getRecordDetailsData(row);
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order FIX Details — ${row.clord_id}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; padding: 20px; color: #333; }
        h1 { font-size: 14px; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; width: 120px; }
        td { word-break: break-all; }
        .footer { margin-top: 20px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
      </style>
    </head>
    <body>
      <h1>Order FIX Details</h1>
      <table>
        <thead><tr><th>FIX</th><th>Description</th></tr></thead>
        <tbody>
          ${data.map(d => `<tr><th>${d.field}</th><td>${d.value}</td></tr>`).join('')}
        </tbody>
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
// HEDGE EXPOSURE DATA (derived from real hedge records)
// ======================
function deriveHedgeExposureData(records: HedgeRecord[]): HedgeExposureRow[] {
  const symbolLpMap = new Map<string, Map<string, {
    netLots: number;
    avgPrice: number;
    avgLatency: number;
    lastHedge: string;
    totalHedges: number;
    completedHedges: number;
    lpAccount: string;
  }>>();

  records.forEach(r => {
    if (!symbolLpMap.has(r.mt5_symbol)) {
      symbolLpMap.set(r.mt5_symbol, new Map());
    }
    const lpMap = symbolLpMap.get(r.mt5_symbol)!;

    const lotValue = r.direction === 'LONG' ? r.hedge_volume_mt5 : -r.hedge_volume_mt5;
    const price    = r.lp_hedge_fill_price_mt5 ?? r.client_fill_price ?? 0;
    const latency  =
      r.dispatched_at && r.confirmed_at
        ? new Date(r.confirmed_at).getTime() - new Date(r.dispatched_at).getTime()
        : 0;

    const existing = lpMap.get(r.hedging_lp_id);
    if (existing) {
      existing.netLots  += lotValue;
      existing.avgPrice  = (existing.avgPrice * existing.totalHedges + price)   / (existing.totalHedges + 1);
      existing.avgLatency = (existing.avgLatency * existing.totalHedges + latency) / (existing.totalHedges + 1);
      existing.totalHedges += 1;
      if (r.hedge_state === 'HEDGED') existing.completedHedges += 1;
      if (new Date(r.dispatched_at) > new Date(existing.lastHedge)) {
        existing.lastHedge = r.dispatched_at;
      }
    } else {
      lpMap.set(r.hedging_lp_id, {
        netLots:          lotValue,
        avgPrice:         price,
        avgLatency:       latency,
        lastHedge:        r.dispatched_at,
        totalHedges:      1,
        completedHedges:  r.hedge_state === 'HEDGED' ? 1 : 0,
        lpAccount:        r.hedging_lp_id.toUpperCase(),
      });
    }
  });

  const rows: HedgeExposureRow[] = [];
  let rowIndex = 0;

  symbolLpMap.forEach((lpMap, symbol) => {
    lpMap.forEach((data, lp) => {
      const isXAU       = symbol.includes('XAU');
      const isBTC       = symbol.includes('BTC');
      const lotSize     = isXAU ? 100 : isBTC ? 1 : 100000;
      const netNotional = Math.round(data.netLots * data.avgPrice * lotSize);
      const fillSuccessPct = data.totalHedges > 0
        ? Math.round((data.completedHedges / data.totalHedges) * 100)
        : 0;

      rows.push({
        id: `exp-${rowIndex++}`,
        symbol,
        lp,
        lpAccount:    data.lpAccount,
        netLots:      Math.round(data.netLots * 100) / 100,
        netNotional,
        avgPrice:     data.avgPrice,
        lastHedge:    data.lastHedge,
        avgLatency:   Math.round(data.avgLatency),
        fillSuccessPct,
      });
    });
  });

  return rows;
}

// ======================
// COMPONENT
// ======================
export function ABookPage() {
  const gridRef          = useRef<AgGridReact<HedgeRecord>>(null);
  const exposureGridRef  = useRef<AgGridReact<HedgeExposureRow>>(null);

  // ── UI state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<TabType>('hedge-ledger');
  const [headerLpFilter, setHeaderLpFilter] = useState('');
  const [stateFilter, setStateFilter]       = useState('');
  const [datePeriod, setDatePeriod]         = useState<DatePeriod>('month');
  const [selectedRow, setSelectedRow]       = useState<HedgeRecord | null>(null);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);

  // ── Data state ────────────────────────────────────────────────
  const [records, setRecords] = useState<HedgeRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Hedge Exposure DOM state ──────────────────────────────────
  const [selectedExposureRow, setSelectedExposureRow] = useState<HedgeExposureRow | null>(null);
  const [domQuantity, setDomQuantity]   = useState<string>('');
  const [domOrderType, setDomOrderType] = useState<'Market' | 'Limit'>('Market');
  const [domTif, setDomTif]             = useState<'IOC' | 'FOK' | 'GTC'>('IOC');

  // ======================
  // FETCH
  // ======================
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);

    const now = new Date();
    let from: string;
    if (datePeriod === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      from = start.toISOString();
    } else {
      // 'month' — first of current month
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }
    const to = now.toISOString();

    const params = new URLSearchParams({ from, to, page_size: '100', page: '1' });
    if (headerLpFilter) params.set('hedging_lp_id', headerLpFilter);
    if (stateFilter)    params.set('hedge_state', stateFilter);

    try {
      const res  = await fetch(`/api/v1/hedge-records?${params.toString()}`);
      const json = await res.json();
      if (json.success !== false) {
        setRecords(json.data ?? []);
        setTotal(json.total ?? json.data?.length ?? 0);
      } else {
        setError(json.error ?? 'Failed to load records');
      }
    } catch {
      setError('Network error — could not load hedge records');
    } finally {
      setLoading(false);
    }
  }, [datePeriod, headerLpFilter, stateFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ======================
  // DERIVED DATA
  // ======================
  const hedgeExposureData = useMemo(() => deriveHedgeExposureData(records), [records]);

  const lpOptions = useMemo(() => {
    const lps = new Set(records.map(r => r.hedging_lp_id));
    return Array.from(lps).sort();
  }, [records]);

  const stats = useMemo(() => {
    const longCount    = records.filter(r => r.direction === 'LONG').length;
    const shortCount   = records.filter(r => r.direction === 'SHORT').length;
    const totalVolume  = records.reduce((s, r) => s + r.hedge_volume_mt5, 0);
    const totalRevenue = records.reduce((s, r) => s + (r.net_revenue_usd ?? 0), 0);
    const hedgedCount  = records.filter(r => r.hedge_state === 'HEDGED').length;
    const hedgedRatio  = records.length > 0 ? (hedgedCount / records.length) * 100 : 0;
    return { longCount, shortCount, totalVolume, totalRevenue, hedgedRatio };
  }, [records]);

  // ======================
  // COLUMN DEFINITIONS — HEDGE LEDGER
  // ======================
  const columnDefs = useMemo<ColDef<HedgeRecord>[]>(() => [
    {
      colId: 'dispatched_date',
      field: 'dispatched_at',
      headerName: 'Date',
      filter: 'agDateColumnFilter',
      sort: 'desc',
      width: 100,
      pinned: 'left',
      valueFormatter: fmtDate,
    },
    {
      colId: 'dispatched_time',
      field: 'dispatched_at',
      headerName: 'Time',
      filter: 'agDateColumnFilter',
      width: 130,
      pinned: 'left',
      valueFormatter: fmtTime,
    },
    { field: 'login_id',      headerName: 'Login',    filter: 'agNumberColumnFilter', width: 100 },
    { field: 'mt5_symbol',    headerName: 'Symbol',   filter: 'agSetColumnFilter',    width: 100 },
    { field: 'position_id',   headerName: 'Position', filter: 'agNumberColumnFilter', width: 100 },
    {
      field: 'direction',
      headerName: 'Dir',
      filter: 'agSetColumnFilter',
      width: 70,
      cellRenderer: (p: { value: string }) => (
        <span style={{ color: DIRECTION_COLORS[p.value] ?? '#999' }}>{p.value}</span>
      ),
    },
    {
      field: 'hedge_volume_mt5',
      headerName: 'Volume',
      filter: 'agNumberColumnFilter',
      valueFormatter: fmtNum(2),
      width: 90,
      type: 'rightAligned',
    },
    { field: 'hedging_lp_id', headerName: 'LP',       filter: 'agSetColumnFilter',    width: 110 },
    { field: 'rule_name',     headerName: 'Rule',     filter: 'agTextColumnFilter',   width: 140 },
    {
      field: 'client_fill_price',
      headerName: 'Client Price',
      filter: 'agNumberColumnFilter',
      valueFormatter: fmtPrice,
      width: 115,
      type: 'rightAligned',
    },
    {
      field: 'lp_hedge_fill_price_mt5',
      headerName: 'LP Price',
      filter: 'agNumberColumnFilter',
      valueFormatter: fmtPrice,
      width: 110,
      type: 'rightAligned',
    },
    {
      field: 'net_revenue_pips',
      headerName: 'Rev Pips',
      filter: 'agNumberColumnFilter',
      width: 90,
      type: 'rightAligned',
      valueFormatter: fmtNum(1),
      cellStyle: (p) => {
        if (p.value === null || p.value === undefined) return {};
        const val = Number(p.value);
        return { color: val > 0 ? '#66e07a' : val < 0 ? '#ff5c5c' : '#999' };
      },
    },
    {
      field: 'net_revenue_usd',
      headerName: 'Revenue',
      filter: 'agNumberColumnFilter',
      width: 100,
      type: 'rightAligned',
      cellRenderer: (p: { value: number | null }) => {
        if (p.value === null || p.value === undefined) {
          return <span style={{ color: '#555' }}>—</span>;
        }
        const color  = p.value > 0 ? '#66e07a' : p.value < 0 ? '#ff5c5c' : '#999';
        const prefix = p.value >= 0 ? '$' : '-$';
        return <span style={{ color }}>{prefix}{Math.abs(p.value).toFixed(2)}</span>;
      },
    },
    {
      field: 'hedge_state',
      headerName: 'State',
      filter: 'agSetColumnFilter',
      width: 170,
      cellRenderer: (p: { value: string }) => (
        <span style={{ color: HEDGE_STATE_COLORS[p.value] ?? '#9ca3af' }}>{p.value}</span>
      ),
    },
  ], []);

  // ======================
  // COLUMN DEFINITIONS — HEDGE EXPOSURE
  // ======================
  const exposureColDefs = useMemo<ColDef<HedgeExposureRow>[]>(() => [
    { field: 'symbol',   headerName: 'Symbol',   rowGroup: true, hide: true },
    { field: 'lp',       headerName: 'LP',        filter: 'agSetColumnFilter' },
    { field: 'lpAccount', headerName: 'Account',  filter: 'agTextColumnFilter' },
    {
      field: 'netLots',
      headerName: 'Net Lots',
      filter: 'agNumberColumnFilter',
      type: 'rightAligned',
      aggFunc: 'sum',
      valueFormatter: (p) => {
        if (p.value === undefined || p.value === null) return '';
        const val = Number(p.value);
        return `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
      },
      cellStyle: (p) => {
        if (p.value === undefined || p.value === null) return {};
        const val = Number(p.value);
        return { color: val > 0 ? '#49b3b3' : val < 0 ? '#e0a020' : '#999' };
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
        const val    = Number(p.value);
        const absVal = Math.abs(val);
        const fmt    = absVal >= 1_000_000
          ? `${(absVal / 1_000_000).toFixed(2)}M`
          : absVal >= 1000
            ? `${(absVal / 1000).toFixed(1)}K`
            : absVal.toFixed(0);
        return `${val < 0 ? '-' : ''}$${fmt}`;
      },
      cellStyle: (p) => {
        if (p.value === undefined || p.value === null) return {};
        const val = Number(p.value);
        return { color: val > 0 ? '#49b3b3' : val < 0 ? '#e0a020' : '#999' };
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
        return { color: val >= 95 ? '#66e07a' : val >= 80 ? '#e0a020' : '#ff5c5c' };
      },
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, minWidth: 70 }),
    [],
  );

  const rowSelection = useMemo<RowSelectionOptions>(
    () => ({ mode: 'multiRow', enableClickSelection: true, checkboxes: true, headerCheckbox: true }),
    [],
  );

  const gridOptions = useMemo<GridOptions<HedgeRecord>>(() => ({
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
    cellRendererParams: { suppressCount: false },
  }), []);

  // ======================
  // CALLBACKS
  // ======================
  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams): (string | MenuItemDef)[] => {
      const rowData = params.node?.data as HedgeRecord | undefined;
      return [
        {
          name: 'View FIX Details',
          action: () => {
            if (rowData) { setSelectedRow(rowData); setDetailsPanelOpen(true); }
          },
        },
        'separator', 'copy', 'copyWithHeaders', 'separator',
        { name: 'Export to CSV',   action: () => params.api.exportDataAsCsv() },
        { name: 'Export to Excel', action: () => params.api.exportDataAsExcel() },
      ];
    },
    [],
  );

  const onRowClicked = useCallback((event: RowClickedEvent<HedgeRecord>) => {
    if (event.data) { setSelectedRow(event.data); setDetailsPanelOpen(true); }
  }, []);

  const onGridReady = useCallback((_event: GridReadyEvent<HedgeRecord>) => {
    setTimeout(() => { gridRef.current?.api?.autoSizeAllColumns(); }, 0);
  }, []);

  const onExposureGridReady = useCallback((event: GridReadyEvent<HedgeExposureRow>) => {
    setTimeout(() => {
      event.api.autoSizeAllColumns();
      const firstRow = event.api.getDisplayedRowAtIndex(0);
      if (firstRow?.group) firstRow.setExpanded(true);
    }, 100);
  }, []);

  const onExposureRowClicked = useCallback((event: RowClickedEvent<HedgeExposureRow>) => {
    if (event.data) {
      setSelectedExposureRow(event.data);
      setDomQuantity(Math.abs(event.data.netNotional).toString());
    }
  }, []);

  const onExposureCellClicked = useCallback((event: { data?: HedgeExposureRow }) => {
    if (event.data) {
      setSelectedExposureRow(event.data);
      setDomQuantity(Math.abs(event.data.netNotional).toString());
    }
  }, []);

  // ======================
  // DOM DATA (mock — no DOM API wired yet)
  // ======================
  const domData = useMemo(() => {
    if (!selectedExposureRow) return null;
    const basePrice = selectedExposureRow.avgPrice;
    const isJPY     = selectedExposureRow.symbol.includes('JPY');
    const isXAU     = selectedExposureRow.symbol.includes('XAU');
    const isBTC     = selectedExposureRow.symbol.includes('BTC');
    const pipSize   = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
    const decimals  = isJPY ? 3 : isXAU ? 2 : isBTC ? 2 : 5;
    const spread    = pipSize * (2 + Math.random() * 3);
    const bidBase   = basePrice - spread / 2;
    const askBase   = basePrice + spread / 2;
    const levels    = 5;
    const bids: { price: number; size: number }[] = [];
    const asks: { price: number; size: number }[] = [];
    for (let i = 0; i < levels; i++) {
      bids.push({ price: bidBase - i * pipSize, size: Math.round((10 + Math.random() * 200) * 100) / 100 });
      asks.push({ price: askBase + i * pipSize, size: Math.round((10 + Math.random() * 200) * 100) / 100 });
    }
    const last   = bidBase + Math.random() * spread;
    const open   = last * (1 + (Math.random() - 0.5) * 0.002);
    const high   = Math.max(last, open) * (1 + Math.random() * 0.001);
    const low    = Math.min(last, open) * (1 - Math.random() * 0.001);
    const change = ((last - open) / open) * 100;
    return {
      symbol: selectedExposureRow.symbol, lp: selectedExposureRow.lp,
      last: last.toFixed(decimals), open: open.toFixed(decimals),
      high: high.toFixed(decimals), low: low.toFixed(decimals),
      change: change.toFixed(2), volume: '-', bids, asks, decimals,
    };
  }, [selectedExposureRow]);

  // ======================
  // RENDER
  // ======================
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#808080]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">A-Book</h1>
            <p className="text-xs text-[#999]">Hedged flow — Orders routed to liquidity providers</p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {/* LP filter */}
            <select
              value={headerLpFilter}
              onChange={(e) => setHeaderLpFilter(e.target.value)}
              className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3]"
            >
              <option value="">All LPs</option>
              {lpOptions.map(lp => <option key={lp} value={lp}>{lp}</option>)}
            </select>

            {/* Date period */}
            <select
              value={datePeriod}
              onChange={(e) => setDatePeriod(e.target.value as DatePeriod)}
              className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3]"
            >
              <option value="today">Today</option>
              <option value="month">This Month</option>
            </select>

            {/* State filter */}
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#49b3b3]"
            >
              <option value="">All States</option>
              <option value="HEDGED">HEDGED</option>
              <option value="PENDING">PENDING</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="CLOSED">CLOSED</option>
              <option value="TIMEOUT_ESCALATED">TIMEOUT_ESCALATED</option>
              <option value="REJECTED_ESCALATED">REJECTED_ESCALATED</option>
              <option value="NORMALIZER_ERROR">NORMALIZER_ERROR</option>
              <option value="B_BOOKED">B_BOOKED</option>
            </select>

            {/* Refresh */}
            <button
              onClick={fetchRecords}
              disabled={loading}
              className={clsx(
                'px-3 py-1 text-xs rounded border transition-colors',
                loading
                  ? 'border-[#444] text-[#555] cursor-not-allowed'
                  : 'border-[#808080] text-[#999] hover:text-white hover:border-[#666]',
              )}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <div className="w-px h-4 bg-[#808080]" />
            <div>
              <span className="text-[#999]">Positions:</span>
              <span className="ml-1 font-mono text-white">{total}</span>
            </div>
            <div>
              <span className="text-[#999]">Long/Short:</span>
              <span className="ml-1 font-mono">
                <span className="text-[#49b3b3]">{stats.longCount}</span>
                <span className="text-[#999]"> / </span>
                <span className="text-[#e0a020]">{stats.shortCount}</span>
              </span>
            </div>
            <div>
              <span className="text-[#999]">Volume:</span>
              <span className="ml-1 font-mono text-white">{stats.totalVolume.toFixed(2)} lots</span>
            </div>
            <div>
              <span className="text-[#999]">Revenue:</span>
              <span className={clsx('ml-1 font-mono', stats.totalRevenue >= 0 ? 'text-[#66e07a]' : 'text-[#ff5c5c]')}>
                {stats.totalRevenue >= 0 ? '' : '-'}${Math.abs(stats.totalRevenue).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[#999]">Fill Rate:</span>
              <span className="ml-1 font-mono text-white">{stats.hedgedRatio.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-2 text-xs text-[#ff5c5c] font-mono">{error}</div>
        )}
      </div>

      {/* ── Tab Navigation ──────────────────────────────────── */}
      <div className="px-4 border-b border-[#808080]" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab('hedge-ledger')}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors relative',
              activeTab === 'hedge-ledger' ? 'text-[#49b3b3]' : 'text-[#999] hover:text-white',
            )}
          >
            Hedge Ledger
            {activeTab === 'hedge-ledger' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#49b3b3]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('hedge-exposure')}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors relative',
              activeTab === 'hedge-exposure' ? 'text-[#49b3b3]' : 'text-[#999] hover:text-white',
            )}
          >
            Hedge Exposure
            {activeTab === 'hedge-exposure' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#49b3b3]" />
            )}
          </button>
        </div>
      </div>

      {/* ── Hedge Ledger Tab ─────────────────────────────────── */}
      {activeTab === 'hedge-ledger' && (
        <div className="flex-1 flex flex-col overflow-hidden p-2">
          <div className="flex-1 flex gap-0 min-h-0">

            {/* Main grid */}
            <div style={{ flex: detailsPanelOpen ? '1 1 75%' : '1 1 100%', minWidth: 0 }}>
              <AgGridReact<HedgeRecord>
                ref={gridRef}
                theme={gridTheme}
                rowData={records}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                gridOptions={gridOptions}
                rowHeight={26}
                headerHeight={36}
                getRowId={(p) => String(p.data.record_id)}
                rowSelection={rowSelection}
                cellSelection={{ enableHeaderHighlight: true }}
                getContextMenuItems={getContextMenuItems}
                onRowClicked={onRowClicked}
                onGridReady={onGridReady}
              />
            </div>

            {/* Order FIX Details panel */}
            {detailsPanelOpen && (
              <div
                className="flex flex-col border-l border-[#808080]"
                style={{ width: '320px', backgroundColor: '#232326' }}
              >
                {/* Panel header */}
                <div className="px-3 py-2 border-b border-[#808080] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Order FIX Details</h3>
                  <button
                    onClick={() => setDetailsPanelOpen(false)}
                    className="text-[#999] hover:text-white transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Export buttons */}
                <div className="px-3 py-2 border-b border-[#3a3a3c] flex items-center gap-2">
                  <span className="text-[10px] text-[#666] mr-1">Export:</span>
                  {(['CSV', 'TXT', 'PDF'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => {
                        if (!selectedRow) return;
                        if (fmt === 'CSV') exportToCSV(selectedRow);
                        else if (fmt === 'TXT') exportToTXT(selectedRow);
                        else exportToPDF(selectedRow);
                      }}
                      disabled={!selectedRow}
                      className={clsx(
                        'px-2 py-1 text-[10px] rounded border transition-colors',
                        selectedRow
                          ? 'text-white border-[#555] hover:bg-[#3a3a3c] hover:border-[#666]'
                          : 'text-[#555] border-[#3a3a3c] cursor-not-allowed',
                      )}
                      title={selectedRow ? `Download as ${fmt}` : 'Select a row first'}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                {/* Detail rows */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#232225' }}>
                        <th
                          className="text-left py-2 px-3 text-[#999] font-medium border-b border-[#555]"
                          style={{ width: '100px' }}
                        >
                          FIX
                        </th>
                        <th className="text-left py-2 px-3 text-[#999] font-medium border-b border-[#555]">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRow
                        ? getRecordDetailsData(selectedRow).map((row) => (
                            <tr key={row.field} className="border-b border-[#3a3a3c]">
                              <td className="py-2 px-3 text-[#999] whitespace-nowrap align-top">
                                {row.field}
                              </td>
                              <td className="py-2 px-3 text-white font-mono text-[11px] break-all">
                                {row.value}
                              </td>
                            </tr>
                          ))
                        : (
                          <tr>
                            <td colSpan={2} className="py-4 px-3 text-[#555] text-center">
                              Select a row to view details
                            </td>
                          </tr>
                        )
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Collapsed panel toggle */}
            {!detailsPanelOpen && (
              <button
                onClick={() => setDetailsPanelOpen(true)}
                className="flex items-center justify-center border-l border-[#808080] bg-[#232225] hover:bg-[#3a3a3c] transition-colors"
                style={{ width: '28px' }}
                title="Show Details Panel"
              >
                <span
                  className="text-[#999] text-xs font-medium whitespace-nowrap"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Order FIX Details
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Hedge Exposure Tab ───────────────────────────────── */}
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
            {/* Exposure grid */}
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
            <div
              className="flex flex-col border border-[#555] rounded overflow-hidden"
              style={{ width: '320px', backgroundColor: '#232225' }}
            >
              {/* DOM Header */}
              <div
                className="px-3 py-2 border-b border-[#555] flex items-center justify-between"
                style={{ backgroundColor: '#1a1a1c' }}
              >
                <span className="text-sm font-medium text-white">Market Depth</span>
                <div className="flex items-center gap-2">
                  <div
                    className={clsx('w-2 h-2 rounded-full', selectedExposureRow ? 'bg-[#49b3b3]' : 'bg-[#555]')}
                    title={selectedExposureRow ? 'Connected' : 'No Selection'}
                  />
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
                    {selectedExposureRow
                      ? <span className="text-xs font-medium text-[#49b3b3]">{selectedExposureRow.lp}</span>
                      : <span className="text-xs text-[#555] italic">Select LP</span>
                    }
                  </div>
                </div>
              </div>

              {/* Price Stats */}
              <div className="px-3 py-2 border-b border-[#555] grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-[#666]">Last </span><span className="text-white font-mono">{domData?.last || '—'}</span></div>
                <div><span className="text-[#666]">Open </span><span className="text-white font-mono">{domData?.open || '—'}</span></div>
                <div>
                  <span className="text-[#666]">Chg </span>
                  <span className={clsx('font-mono', domData && Number(domData.change) >= 0 ? 'text-[#49b3b3]' : domData ? 'text-[#ff5c5c]' : 'text-[#555]')}>
                    {domData ? `${Number(domData.change) >= 0 ? '+' : ''}${domData.change}` : '—'}
                  </span>
                </div>
                <div><span className="text-[#666]">High </span><span className="text-white font-mono">{domData?.high || '—'}</span></div>
                <div><span className="text-[#666]">Vol </span><span className="text-white font-mono">{domData?.volume || '—'}</span></div>
                <div><span className="text-[#666]">Low </span><span className="text-white font-mono">{domData?.low || '—'}</span></div>
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
                    {domData
                      ? domData.bids.map((bid, i) => {
                          const ask     = domData.asks[i];
                          const maxSize = Math.max(...domData.bids.map(b => b.size), ...domData.asks.map(a => a.size));
                          const bidWidth = (bid.size / maxSize) * 100;
                          const askWidth = (ask.size / maxSize) * 100;
                          return (
                            <tr key={i} className="relative">
                              <td className="text-right py-1 pr-2 relative">
                                <div className="absolute right-0 top-0 bottom-0 opacity-40"
                                  style={{ width: `${bidWidth}%`, backgroundColor: '#49b3b3' }} />
                                <span className="relative text-[#49b3b3] font-mono">{bid.size.toFixed(2)}</span>
                              </td>
                              <td className="text-center py-1">
                                <span className="text-[#49b3b3] font-mono font-medium">{bid.price.toFixed(domData.decimals)}</span>
                              </td>
                              <td className="text-center py-1">
                                <span className="text-[#e0a020] font-mono font-medium">{ask.price.toFixed(domData.decimals)}</span>
                              </td>
                              <td className="text-left py-1 pl-2 relative">
                                <div className="absolute left-0 top-0 bottom-0 opacity-40"
                                  style={{ width: `${askWidth}%`, backgroundColor: '#e0a020' }} />
                                <span className="relative text-[#e0a020] font-mono">{ask.size.toFixed(2)}</span>
                              </td>
                            </tr>
                          );
                        })
                      : Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td className="text-right py-1 pr-2 text-[#555] font-mono">—</td>
                            <td className="text-center py-1 text-[#555] font-mono">—</td>
                            <td className="text-center py-1 text-[#555] font-mono">—</td>
                            <td className="text-left py-1 pl-2 text-[#555] font-mono">—</td>
                          </tr>
                        ))
                    }
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
                      'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#49b3b3]',
                      !selectedExposureRow && 'opacity-50 cursor-not-allowed',
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
                      'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#49b3b3]',
                      !selectedExposureRow && 'opacity-50 cursor-not-allowed',
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
                        const val    = e.target.value.replace(/[^0-9.]/g, '');
                        const maxVal = Math.abs(selectedExposureRow.netNotional);
                        const numVal = parseFloat(val) || 0;
                        if (numVal <= maxVal) setDomQuantity(val);
                      }}
                      disabled={!selectedExposureRow}
                      className={clsx(
                        'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#49b3b3]',
                        !selectedExposureRow && 'opacity-50 cursor-not-allowed',
                      )}
                      placeholder="Quantity"
                    />
                    <div className="flex flex-col">
                      <button
                        onClick={() => {
                          if (!selectedExposureRow) return;
                          const current = parseFloat(domQuantity) || 0;
                          const maxVal  = Math.abs(selectedExposureRow.netNotional);
                          const step    = maxVal * 0.1;
                          setDomQuantity(Math.min(current + step, maxVal).toFixed(0));
                        }}
                        disabled={!selectedExposureRow}
                        className={clsx('px-1 py-0.5 text-[#999] hover:text-white text-[10px]', !selectedExposureRow && 'opacity-50 cursor-not-allowed')}
                      >▲</button>
                      <button
                        onClick={() => {
                          if (!selectedExposureRow) return;
                          const current = parseFloat(domQuantity) || 0;
                          const step    = Math.abs(selectedExposureRow.netNotional) * 0.1;
                          setDomQuantity(Math.max(current - step, 0).toFixed(0));
                        }}
                        disabled={!selectedExposureRow}
                        className={clsx('px-1 py-0.5 text-[#999] hover:text-white text-[10px]', !selectedExposureRow && 'opacity-50 cursor-not-allowed')}
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
                      'flex-1 py-2 rounded text-xs font-semibold transition-colors',
                      selectedExposureRow && selectedExposureRow.netNotional < 0
                        ? 'bg-[#49b3b3] hover:bg-[#3dbdb5] text-black'
                        : 'bg-[#3a3a3c] text-[#555] cursor-not-allowed',
                    )}
                  >
                    Close Buy
                  </button>
                  <button
                    disabled={!selectedExposureRow}
                    className={clsx(
                      'flex-1 py-2 rounded text-xs font-medium bg-[#2a2a2c] border border-[#555] transition-colors',
                      selectedExposureRow ? 'text-[#999] hover:text-white hover:border-[#666]' : 'text-[#555] cursor-not-allowed',
                    )}
                  >
                    Cancel All
                  </button>
                  <button
                    disabled={!selectedExposureRow || selectedExposureRow.netNotional <= 0}
                    className={clsx(
                      'flex-1 py-2 rounded text-xs font-semibold transition-colors',
                      selectedExposureRow && selectedExposureRow.netNotional > 0
                        ? 'bg-[#e0a020] hover:bg-[#c89018] text-black'
                        : 'bg-[#3a3a3c] text-[#555] cursor-not-allowed',
                    )}
                  >
                    Close Sell
                  </button>
                </div>

                {/* Order execution summary */}
                <div className="mt-3 pt-3 border-t border-[#555]">
                  <div className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Order Execution</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#666]">Position ID: </span>
                      <span className="text-white font-mono">
                        {selectedExposureRow ? `POS-${selectedExposureRow.id.split('-')[1] || '000'}` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#666]">FIX ID: </span>
                      <span className="text-white font-mono">
                        {selectedExposureRow ? `FIX-${Date.now().toString().slice(-8)}` : '—'}
                      </span>
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