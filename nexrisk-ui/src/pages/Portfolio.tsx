// ============================================
// Portfolio Page
// Matches Portfolio.png mockup exactly
// Tree-style rows with expandable groups
// ============================================

import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent, ValueFormatterParams } from 'ag-grid-community';
import { clsx } from 'clsx';

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

// Sample data matching Portfolio.png screenshot
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
        metric: '--Floating Profit & Loss',
        portfolio: -531351.62,
        aBook: -73803.49,
        bBook: -945646.21,
        cBook: null,
        netTotal: -1550801.32,
        isChild: true,
      },
      {
        id: 'realized',
        metric: '--Realized Profit & Loss',
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
        metric: '--Swaps',
        portfolio: 0.00,
        aBook: 1933.76,
        bBook: 0.00,
        cBook: null,
        netTotal: 1933.76,
        isChild: true,
      },
      {
        id: 'commissions',
        metric: '--Commissions',
        portfolio: -2715.99,
        aBook: -4118.24,
        bBook: -120.00,
        cBook: null,
        netTotal: 1282.25,
        isChild: true,
      },
      {
        id: 'adjustments',
        metric: '--Adjustments',
        portfolio: 0.00,
        aBook: 412.34,
        bBook: 0.00,
        cBook: null,
        netTotal: 412.34,
        isChild: true,
      },
      {
        id: 'rebates',
        metric: '--Rebates',
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

// Flatten data for display
function flattenData(data: PortfolioRow[]): PortfolioRow[] {
  const result: PortfolioRow[] = [];
  for (const row of data) {
    result.push(row);
    if (row.expanded && row.children) {
      result.push(...row.children);
    }
  }
  return result;
}

// Value formatter for currency
function currencyFormatter(params: ValueFormatterParams): string {
  if (params.value == null) return '';
  const val = params.value as number;
  const absVal = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$ ${absVal}` : `$ ${absVal}`;
}

// Value formatter for numbers
function numberFormatter(params: ValueFormatterParams): string {
  if (params.value == null) return '';
  const val = params.value as number;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Cell class for P&L coloring
function pnlCellClass(params: { value: number | null }): string {
  if (params.value == null) return '';
  if (params.value > 0) return 'cell-pnl-positive';
  if (params.value < 0) return 'cell-pnl-negative';
  return '';
}

export function PortfolioPage() {
  const [timeframe, setTimeframe] = useState('Today');
  const [zoom, setZoom] = useState(150);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['pnl', 'revenue']));

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

  // Column definitions matching Portfolio.png
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'metric',
      headerName: 'Portfolio',
      flex: 1.5,
      minWidth: 180,
      cellRenderer: (params: { data: PortfolioRow; value: string }) => {
        const row = params.data;
        if (row.isGroup) {
          const isExpanded = expandedGroups.has(row.id);
          return (
            <div 
              className="flex items-center gap-2 cursor-pointer font-medium"
              onClick={() => toggleGroup(row.id)}
            >
              <span className={clsx(
                'text-text-muted transition-transform',
                isExpanded && 'rotate-90'
              )}>
                ▶
              </span>
              <span>{params.value}</span>
            </div>
          );
        }
        return <span className={row.isChild ? 'text-text-secondary' : ''}>{params.value}</span>;
      },
    },
    {
      field: 'aBook',
      headerName: 'A Book',
      flex: 1,
      minWidth: 120,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellClass: pnlCellClass,
    },
    {
      field: 'bBook',
      headerName: 'B Book',
      flex: 1,
      minWidth: 120,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellClass: pnlCellClass,
    },
    {
      field: 'cBook',
      headerName: 'C Book',
      flex: 1,
      minWidth: 120,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellClass: pnlCellClass,
    },
    {
      field: 'netTotal',
      headerName: 'Net Total',
      flex: 1,
      minWidth: 130,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellClass: pnlCellClass,
      cellStyle: { fontWeight: 500 },
    },
  ], [expandedGroups, toggleGroup]);

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header matching Portfolio.png */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {/* Timeframe dropdown */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="select text-sm"
          >
            <option>Today</option>
            <option>Yesterday</option>
            <option>This Week</option>
            <option>This Month</option>
            <option>MTD</option>
            <option>YTD</option>
          </select>
          
          {/* Title */}
          <h1 className="text-lg font-medium text-text-primary">Portfolio Summary</h1>
        </div>
        
        {/* Zoom slider */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">{zoom}%</span>
          <input
            type="range"
            min="100"
            max="200"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-24 h-1 bg-border rounded-full appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* AG-Grid Table */}
      <div 
        className="ag-theme-nexrisk flex-1" 
        style={{ fontSize: `${zoom / 100 * 13}px` }}
      >
        <AgGridReact
          rowData={displayData}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          animateRows={true}
          suppressCellFocus={true}
          headerHeight={36}
          rowHeight={Math.round(32 * zoom / 100)}
          getRowId={(params) => params.data.id}
          domLayout="normal"
        />
      </div>
    </div>
  );
}

export default PortfolioPage;
