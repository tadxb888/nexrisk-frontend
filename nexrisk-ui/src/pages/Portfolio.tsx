// ============================================
// Portfolio Page
// Tree-style rows with expandable groups
// YTD Realized P/L Area Chart below table
// ============================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridReadyEvent, ValueFormatterParams, GridOptions } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';

// ======================
// THEME BASE CONFIG
// ======================
const getGridTheme = (zoomLevel: number) => themeQuartz.withParams({
  backgroundColor: "#313032",
  browserColorScheme: "dark",
  chromeBackgroundColor: { ref: "foregroundColor", mix: 0.11, onto: "backgroundColor" },
  fontFamily: { googleFont: "IBM Plex Mono" },
  fontSize: Math.round(12 * zoomLevel / 100),
  foregroundColor: "#FFF",
  headerFontSize: Math.round(14 * zoomLevel / 100),
});

// ======================
// TYPES
// ======================
interface PortfolioRow {
  id: string;
  metric: string;
  portfolio: number | null;
  aBook: number | null;
  bBook: number | null;
  cBook: number | null;
  netTotal: number | null;
  isGroup?: boolean;
  isChild?: boolean;
  expanded?: boolean;
  children?: PortfolioRow[];
}

// ======================
// SAMPLE DATA
// ======================
const portfolioData: PortfolioRow[] = [
  {
    id: 'pnl',
    metric: 'Net Profit & Loss',
    portfolio: -492817.65,
    aBook: -221897.64,
    bBook: 739607.91,
    cBook: null,
    netTotal: 24892.62,
    isGroup: true,
    expanded: true,
    children: [
      {
        id: 'floating',
        metric: 'Floating Profit & Loss',
        portfolio: -531351.62,
        aBook: -73803.49,
        bBook: -945646.21,
        cBook: null,
        netTotal: -1550801.32,
        isChild: true,
      },
      {
        id: 'realized',
        metric: 'Realized Profit & Loss',
        portfolio: 41249.96,
        aBook: 150042.76,
        bBook: 1685374.12,
        cBook: null,
        netTotal: 1576581.32,
        isChild: true,
      },
    ],
  },
  {
    id: 'rpm',
    metric: 'Revenues Per Million',
    portfolio: -51.52,
    aBook: -26.30,
    bBook: -11.35,
    cBook: null,
    netTotal: -89.17,
  },
  {
    id: 'lots',
    metric: 'Volumes (Lots)',
    portfolio: 924.60,
    aBook: 919.31,
    bBook: 137.90,
    cBook: null,
    netTotal: 1981.81,
  },
  {
    id: 'notional',
    metric: 'Volumes (Notional)',
    portfolio: 26356870.30,
    aBook: 21367420.95,
    bBook: 5286870.50,
    cBook: null,
    netTotal: 53011161.75,
  },
  {
    id: 'revenue',
    metric: 'Revenues and Expenses',
    portfolio: -2715.99,
    aBook: 1948.61,
    bBook: -120.00,
    cBook: null,
    netTotal: -887.38,
    isGroup: true,
    expanded: true,
    children: [
      {
        id: 'swaps',
        metric: 'Swaps',
        portfolio: 0.00,
        aBook: 1933.76,
        bBook: 0.00,
        cBook: null,
        netTotal: 1933.76,
        isChild: true,
      },
      {
        id: 'commissions',
        metric: 'Commissions',
        portfolio: -2715.99,
        aBook: -4118.24,
        bBook: -120.00,
        cBook: null,
        netTotal: 1282.25,
        isChild: true,
      },
      {
        id: 'adjustments',
        metric: 'Adjustments',
        portfolio: 0.00,
        aBook: 412.34,
        bBook: 0.00,
        cBook: null,
        netTotal: 412.34,
        isChild: true,
      },
      {
        id: 'rebates',
        metric: 'Rebates',
        portfolio: 0.00,
        aBook: -4515.73,
        bBook: 0.00,
        cBook: null,
        netTotal: -4515.73,
        isChild: true,
      },
    ],
  },
];

// ======================
// YTD REALIZED P/L DATA (Mock - daily data for the year)
// ======================
function generateYTDData() {
  const data = [];
  let cumulative = 0;
  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1); // Jan 1 of current year
  
  // Generate daily data points
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    // Simulate daily P/L with some volatility
    const dailyPnL = (Math.random() - 0.45) * 50000; // Slight upward bias
    cumulative += dailyPnL;
    
    // Add some dramatic swings
    if (d.getMonth() === 0 && d.getDate() === 15) cumulative -= 80000; // Jan dip
    if (d.getMonth() === 1 && d.getDate() === 1) cumulative += 120000; // Feb spike
    
    data.push({
      date: new Date(d).toISOString().split('T')[0],
      month: new Date(d).toLocaleDateString('en-US', { month: 'short' }),
      value: Math.round(cumulative),
    });
  }
  
  return data;
}

const ytdData = generateYTDData();

// ======================
// HELPERS
// ======================
function currencyFormatter(params: ValueFormatterParams): string {
  if (params.value == null) return '';
  const val = params.value as number;
  const absVal = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$ ${absVal}` : `$ ${absVal}`;
}

function getPnlColor(value: number | null): string {
  if (value == null) return '#999';
  if (value > 0) return '#66e07a';
  if (value < 0) return '#ff6b6b';
  return '#999';
}

function formatYAxisTick(value: number): string {
  if (value === 0) return '$0';
  const absVal = Math.abs(value);
  if (absVal >= 1000000) return `${value < 0 ? '-' : ''}$${(absVal / 1000000).toFixed(1)}M`;
  if (absVal >= 1000) return `${value < 0 ? '-' : ''}$${(absVal / 1000).toFixed(0)}K`;
  return `$${value}`;
}

// ======================
// YTD CHART COMPONENT
// ======================
function YTDRealizedPnLChart({ 
  collapsed, 
  onToggle,
  height,
  onResize 
}: { 
  collapsed: boolean; 
  onToggle: () => void;
  height: number;
  onResize: (newHeight: number) => void;
}) {
  // Calculate min/max for gradient positioning
  const values = ytdData.map(d => d.value);
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  const range = dataMax - dataMin;
  
  // Calculate where zero falls in the gradient (0 = top, 1 = bottom)
  const zeroPosition = range > 0 ? dataMax / range : 0.5;
  
  // Reference line values
  const refLines = [
    { value: 1000000, label: '$1M' },
    { value: 250000, label: '$250K' },
    { value: 50000, label: '$50K' },
    { value: 0, label: '$0' },
    { value: -50000, label: '-$50K' },
    { value: -250000, label: '-$250K' },
  ];

  // Resize handling
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  }, [height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new height (dragging up = larger, dragging down = smaller)
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.max(200, Math.min(600, startHeightRef.current + deltaY));
      onResize(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize]);

  return (
    <div 
      className="border-t border-[#808080] flex flex-col" 
      style={{ backgroundColor: '#313032', height: collapsed ? 44 : height }}
    >
      {/* Resize Handle */}
      {!collapsed && (
        <div
          className="h-[6px] cursor-ns-resize flex items-center justify-center group hover:bg-[#4ecdc4]/20 transition-colors"
          onMouseDown={handleMouseDown}
          style={{ backgroundColor: isResizing ? 'rgba(78, 205, 196, 0.2)' : 'transparent' }}
        >
          <div 
            className="w-12 h-[3px] rounded-full transition-colors"
            style={{ backgroundColor: isResizing ? '#4ecdc4' : '#606060' }}
          />
        </div>
      )}
      
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[#3a3a3c]"
        onClick={onToggle}
      >
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">Portfolio Performance</span>
          <span className="text-[10px] text-[#808080]">
            From: {new Date(ytdData[0]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — To: {new Date(ytdData[ytdData.length - 1]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <span className="text-[#4ecdc4]">{collapsed ? '▶' : '▼'}</span>
      </div>
      
      {/* Chart */}
      {!collapsed && (
        <div className="flex-1 px-4 pb-4 min-h-0">
          <div className="h-full rounded-lg p-3" style={{ backgroundColor: '#313032' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={ytdData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
              >
                <defs>
                  {/* Gradient that splits at zero: green above, red below */}
                  <linearGradient id="splitColorGradient" x1="0" y1="0" x2="0" y2="1">
                    {/* Green gradient for positive area */}
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                    <stop offset={`${Math.max(0, zeroPosition - 0.05) * 100}%`} stopColor="#4ade80" stopOpacity={0.6} />
                    <stop offset={`${zeroPosition * 100}%`} stopColor="#86efac" stopOpacity={0.2} />
                    {/* Red gradient for negative area */}
                    <stop offset={`${zeroPosition * 100}%`} stopColor="#fca5a5" stopOpacity={0.2} />
                    <stop offset={`${Math.min(1, zeroPosition + 0.05) * 100}%`} stopColor="#f87171" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.9} />
                  </linearGradient>
                  {/* Stroke gradient */}
                  <linearGradient id="strokeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset={`${zeroPosition * 100}%`} stopColor="#a3a3a3" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>
                
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#404040" 
                  vertical={false}
                />
                
                <XAxis 
                  dataKey="date"
                  tick={{ fill: '#808080', fontSize: 10 }}
                  axisLine={{ stroke: '#404040' }}
                  tickLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    // Show only first of each month
                    if (date.getDate() === 1) {
                      return date.toLocaleDateString('en-US', { month: 'short' });
                    }
                    return '';
                  }}
                  interval={0}
                />
                
                <YAxis 
                  tick={{ fill: '#808080', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatYAxisTick}
                  domain={['dataMin - 100000', 'dataMax + 100000']}
                  width={60}
                />
                
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1c', 
                    border: '1px solid #404040', 
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 500 }}
                  formatter={(value: number) => [
                    <span style={{ color: value >= 0 ? '#66e07a' : '#ff6b6b' }}>
                      {value >= 0 ? '+' : ''}{formatYAxisTick(value)}
                    </span>,
                    'Realized P&L'
                  ]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                />
                
                {/* Reference Lines - White dashed */}
                {refLines.map((line) => (
                  <ReferenceLine 
                    key={line.value}
                    y={line.value} 
                    stroke={line.value === 0 ? '#ffffff' : 'rgba(255,255,255,0.4)'}
                    strokeDasharray={line.value === 0 ? "0" : "4 4"}
                    strokeWidth={line.value === 0 ? 2 : 1}
                  />
                ))}
                
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="url(#strokeGradient)"
                  strokeWidth={2}
                  fill="url(#splitColorGradient)"
                  baseValue={0}
                />
              </AreaChart>
            </ResponsiveContainer>
            
            {/* Reference Line Labels */}
            <div className="flex justify-end gap-6 mt-2 text-[10px]">
              <span className="text-[#22c55e]">$1M</span>
              <span className="text-[#4ade80]">$250K</span>
              <span className="text-[#86efac]">$50K</span>
              <span className="text-white">$0</span>
              <span className="text-[#fca5a5]">-$50K</span>
              <span className="text-[#dc2626]">-$250K</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================
// COMPONENT
// ======================
export function PortfolioPage() {
  const gridRef = useRef<AgGridReact<PortfolioRow>>(null);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('today');
  const [zoom, setZoom] = useState(125);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['pnl', 'revenue']));
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [chartHeight, setChartHeight] = useState(360);

  // Dynamic theme based on zoom
  const gridTheme = useMemo(() => getGridTheme(zoom), [zoom]);

  // Toggle group expansion
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Build display data
  const displayData = useMemo(() => {
    const result: PortfolioRow[] = [];
    for (const row of portfolioData) {
      const isExpanded = expandedGroups.has(row.id);
      result.push({ ...row, expanded: isExpanded });
      if (isExpanded && row.children) {
        result.push(...row.children);
      }
    }
    return result;
  }, [expandedGroups]);

  // Column definitions
  const columnDefs = useMemo<ColDef<PortfolioRow>[]>(() => [
    {
      field: 'metric',
      headerName: 'Portfolio',
      minWidth: 220,
      flex: 1.5,
      cellRenderer: (params: { data: PortfolioRow; value: string }) => {
        const row = params.data;
        if (row.isGroup) {
          const isExpanded = expandedGroups.has(row.id);
          return (
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => toggleGroup(row.id)}
              style={{ fontWeight: 500 }}
            >
              <span style={{ 
                color: '#4ecdc4', 
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                display: 'inline-block'
              }}>
                ▶
              </span>
              <span style={{ color: '#FFF' }}>{params.value}</span>
            </div>
          );
        }
        return (
          <span style={{ 
            color: row.isChild ? '#999' : '#FFF',
            paddingLeft: row.isChild ? '20px' : '0'
          }}>
            {row.isChild ? `--${params.value}` : params.value}
          </span>
        );
      },
    },
    {
      field: 'aBook',
      headerName: 'A Book',
      minWidth: 140,
      flex: 1,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellStyle: (params) => ({ color: getPnlColor(params.value) }),
    },
    {
      field: 'bBook',
      headerName: 'B Book',
      minWidth: 140,
      flex: 1,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellStyle: (params) => ({ color: getPnlColor(params.value) }),
    },
    {
      field: 'cBook',
      headerName: 'C Book',
      minWidth: 140,
      flex: 1,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellStyle: (params) => ({ color: getPnlColor(params.value) }),
    },
    {
      field: 'netTotal',
      headerName: 'Net Total',
      minWidth: 160,
      flex: 1,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellStyle: (params) => ({ 
        color: getPnlColor(params.value),
        fontWeight: 500 
      }),
    },
  ], [expandedGroups, toggleGroup]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: false,
    filter: false,
    resizable: true,
    suppressMenu: true,
  }), []);

  const gridOptions = useMemo<GridOptions<PortfolioRow>>(() => ({
    suppressCellFocus: true,
    suppressRowHoverHighlight: false,
    animateRows: false,
  }), []);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    event.api.sizeColumnsToFit();
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Page Header */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Portfolio Summary</h1>
          <p className="text-xs text-[#999]">P&L and volume metrics across all books</p>
        </div>
        
        <div className="flex items-center gap-6 text-xs">
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
          
          <div className="flex items-center gap-2">
            <span className="text-[#999]">{zoom}%</span>
            <input
              type="range"
              min="100"
              max="200"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 h-1 bg-[#808080] rounded-full appearance-none cursor-pointer"
              style={{
                WebkitAppearance: 'none',
                background: `linear-gradient(to right, #4ecdc4 0%, #4ecdc4 ${(zoom - 100)}%, #808080 ${(zoom - 100)}%, #808080 100%)`
              }}
            />
          </div>
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">
        <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
          <AgGridReact<PortfolioRow>
            ref={gridRef}
            theme={gridTheme}
            rowData={displayData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            onGridReady={onGridReady}
            headerHeight={Math.round(36 * zoom / 100)}
            rowHeight={Math.round(26 * zoom / 100)}
            getRowId={(params) => params.data.id}
          />
        </div>
      </div>

      {/* YTD Realized P&L Chart */}
      <YTDRealizedPnLChart 
        collapsed={chartCollapsed}
        onToggle={() => setChartCollapsed(!chartCollapsed)}
        height={chartHeight}
        onResize={setChartHeight}
      />
    </div>
  );
}

export default PortfolioPage;