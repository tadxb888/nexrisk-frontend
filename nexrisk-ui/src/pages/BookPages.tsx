// ============================================
// Book Pages (A-Book, B-Book, C-Book)
// Position and trader views filtered by book type
// ============================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgGridReact } from '@ag-grid-community/react';
import type { ColDef, GridReadyEvent } from '@ag-grid-community/core';
import { positionsApi, tradersApi } from '@/services/api';
import { clsx } from 'clsx';
import type { BookType } from '@/types';

import '@ag-grid-community/styles/ag-grid.css';
import '../components/ui/grid-config';

interface BookPageProps {
  bookType: BookType;
  title: string;
  description: string;
}

// Risk badge component
function RiskBadge({ level }: { level: string }) {
  return (
    <span className={clsx(
      'badge text-xs',
      level === 'CRITICAL' && 'badge-critical',
      level === 'HIGH' && 'badge-high',
      level === 'MEDIUM' && 'badge-medium',
      level === 'LOW' && 'badge-low'
    )}>
      {level}
    </span>
  );
}

function BookPage({ bookType, title, description }: BookPageProps) {
  // Fetch positions
  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ['positions', bookType],
    queryFn: () => positionsApi.getAll(100),
  });

  // Fetch traders
  const { data: tradersData, isLoading: tradersLoading } = useQuery({
    queryKey: ['traders'],
    queryFn: () => tradersApi.getAll({ limit: 100 }),
  });

  // Position columns
  const positionCols: ColDef[] = useMemo(() => [
    {
      field: 'position_id',
      headerName: 'Position',
      width: 100,
      cellClass: 'font-mono text-text-muted',
    },
    {
      field: 'login',
      headerName: 'Trader',
      width: 90,
      cellClass: 'font-mono',
    },
    {
      field: 'symbol',
      headerName: 'Symbol',
      width: 100,
      cellClass: 'font-mono font-medium',
    },
    {
      field: 'type',
      headerName: 'Side',
      width: 80,
      cellRenderer: (params: { value: string }) => (
        <span className={clsx(
          'text-xs',
          params.value === 'BUY' && 'text-accent',
          params.value === 'SELL' && 'text-risk-high'
        )}>
          {params.value}
        </span>
      ),
    },
    {
      field: 'volume',
      headerName: 'Volume',
      width: 90,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(2) || '',
    },
    {
      field: 'open_price',
      headerName: 'Open',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(5) || '',
    },
    {
      field: 'profit',
      headerName: 'P&L',
      width: 100,
      type: 'rightAligned',
      cellClass: (params) => clsx(
        'font-mono',
        params.value > 0 && 'cell-pnl-positive',
        params.value < 0 && 'cell-pnl-negative'
      ),
      valueFormatter: (params) => 
        params.value != null 
          ? `$${params.value.toFixed(2)}` 
          : '',
    },
    {
      field: 'swap',
      headerName: 'Swap',
      width: 80,
      type: 'rightAligned',
      cellClass: 'font-mono text-text-muted',
      valueFormatter: (params) => params.value?.toFixed(2) || '',
    },
  ], []);

  // Trader columns
  const traderCols: ColDef[] = useMemo(() => [
    {
      field: 'login',
      headerName: 'Login',
      width: 90,
      cellClass: 'font-mono',
    },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'classification',
      headerName: 'Class',
      width: 110,
    },
    {
      field: 'risk_level',
      headerName: 'Risk',
      width: 100,
      cellRenderer: (params: { value: string }) => <RiskBadge level={params.value} />,
    },
    {
      field: 'risk_score',
      headerName: 'Score',
      width: 80,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(1) || '',
    },
    {
      field: 'equity',
      headerName: 'Equity',
      width: 120,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => 
        params.value?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || '',
    },
  ], []);

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  // Calculate summary stats
  const positions = positionsData?.positions || [];
  const totalPnL = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const totalVolume = positions.reduce((sum, p) => sum + (p.volume || 0), 0);
  const longPositions = positions.filter(p => p.type === 'BUY').length;
  const shortPositions = positions.filter(p => p.type === 'SELL').length;

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>

      {/* Summary Stats */}
      <div className="panel p-3 mb-4 flex items-center gap-8">
        <div>
          <span className="text-xs text-text-muted">Total Positions</span>
          <p className="text-lg font-mono text-text-primary">{positions.length}</p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Long / Short</span>
          <p className="text-lg font-mono">
            <span className="text-accent">{longPositions}</span>
            <span className="text-text-muted"> / </span>
            <span className="text-risk-high">{shortPositions}</span>
          </p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Total Volume</span>
          <p className="text-lg font-mono text-text-primary">{totalVolume.toFixed(2)} lots</p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Total P&L</span>
          <p className={clsx(
            'text-lg font-mono',
            totalPnL > 0 && 'text-pnl-positive',
            totalPnL < 0 && 'text-pnl-negative',
            totalPnL === 0 && 'text-text-primary'
          )}>
            ${totalPnL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Two-column layout: Positions and Traders */}
      <div className="flex-1 flex gap-4">
        {/* Positions Grid */}
        <div className="flex-1 flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Open Positions</h3>
          <div className="flex-1 ag-theme-nexrisk">
            <AgGridReact
              rowData={positions}
              columnDefs={positionCols}
              onGridReady={onGridReady}
              animateRows={true}
              headerHeight={36}
              rowHeight={28}
              getRowId={(params) => String(params.data.position_id)}
              loading={positionsLoading}
            />
          </div>
        </div>

        {/* Traders Grid */}
        <div className="w-96 flex flex-col">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Active Traders</h3>
          <div className="flex-1 ag-theme-nexrisk">
            <AgGridReact
              rowData={tradersData?.traders || []}
              columnDefs={traderCols}
              onGridReady={onGridReady}
              animateRows={true}
              headerHeight={36}
              rowHeight={28}
              getRowId={(params) => String(params.data.login)}
              loading={tradersLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Export specific book pages
export function BBookPage() {
  return (
    <BookPage
      bookType="B"
      title="B-Book"
      description="Internalized flow - positions held against the house"
    />
  );
}

export function ABookPage() {
  return (
    <BookPage
      bookType="A"
      title="A-Book"
      description="Hedged flow - positions routed to liquidity providers"
    />
  );
}

export function CBookPage() {
  return (
    <BookPage
      bookType="C"
      title="C-Book"
      description="Hybrid book - partially hedged positions"
    />
  );
}

export default BookPage;
