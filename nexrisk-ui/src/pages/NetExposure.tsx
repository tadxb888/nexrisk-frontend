// ============================================
// Net Exposure Page
// Symbol exposure view
// ============================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgGridReact } from '@ag-grid-community/react';
import type { ColDef, GridReadyEvent } from '@ag-grid-community/core';
import { positionsApi, symbolsApi } from '@/services/api';
import { clsx } from 'clsx';

import '@ag-grid-community/styles/ag-grid.css';
import '../components/ui/grid-config';

interface ExposureRow {
  symbol: string;
  longVolume: number;
  shortVolume: number;
  netVolume: number;
  longPnL: number;
  shortPnL: number;
  netPnL: number;
  positionCount: number;
}

export function NetExposurePage() {
  // Fetch positions
  const { data: positionsData, isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: () => positionsApi.getAll(500),
  });

  // Aggregate by symbol
  const exposureData: ExposureRow[] = useMemo(() => {
    if (!positionsData?.positions) return [];

    const bySymbol = new Map<string, ExposureRow>();

    for (const pos of positionsData.positions) {
      const existing = bySymbol.get(pos.symbol) || {
        symbol: pos.symbol,
        longVolume: 0,
        shortVolume: 0,
        netVolume: 0,
        longPnL: 0,
        shortPnL: 0,
        netPnL: 0,
        positionCount: 0,
      };

      if (pos.type === 'BUY') {
        existing.longVolume += pos.volume;
        existing.longPnL += pos.profit || 0;
      } else {
        existing.shortVolume += pos.volume;
        existing.shortPnL += pos.profit || 0;
      }

      existing.netVolume = existing.longVolume - existing.shortVolume;
      existing.netPnL = existing.longPnL + existing.shortPnL;
      existing.positionCount += 1;

      bySymbol.set(pos.symbol, existing);
    }

    return Array.from(bySymbol.values()).sort((a, b) => 
      Math.abs(b.netVolume) - Math.abs(a.netVolume)
    );
  }, [positionsData]);

  // Column definitions
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'symbol',
      headerName: 'Symbol',
      width: 110,
      pinned: 'left',
      cellClass: 'font-mono font-medium',
    },
    {
      field: 'positionCount',
      headerName: 'Positions',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono',
    },
    {
      field: 'longVolume',
      headerName: 'Long Vol',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono text-accent',
      valueFormatter: (params) => params.value?.toFixed(2) || '0.00',
    },
    {
      field: 'shortVolume',
      headerName: 'Short Vol',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono text-risk-high',
      valueFormatter: (params) => params.value?.toFixed(2) || '0.00',
    },
    {
      field: 'netVolume',
      headerName: 'Net Vol',
      width: 110,
      type: 'rightAligned',
      cellClass: (params) => clsx(
        'font-mono font-medium',
        params.value > 0 && 'text-accent',
        params.value < 0 && 'text-risk-high'
      ),
      valueFormatter: (params) => {
        if (params.value == null) return '';
        return params.value > 0 ? `+${params.value.toFixed(2)}` : params.value.toFixed(2);
      },
    },
    {
      field: 'longPnL',
      headerName: 'Long P&L',
      width: 110,
      type: 'rightAligned',
      cellClass: (params) => clsx(
        'font-mono',
        params.value > 0 && 'cell-pnl-positive',
        params.value < 0 && 'cell-pnl-negative'
      ),
      valueFormatter: (params) => 
        params.value != null ? `$${params.value.toFixed(2)}` : '',
    },
    {
      field: 'shortPnL',
      headerName: 'Short P&L',
      width: 110,
      type: 'rightAligned',
      cellClass: (params) => clsx(
        'font-mono',
        params.value > 0 && 'cell-pnl-positive',
        params.value < 0 && 'cell-pnl-negative'
      ),
      valueFormatter: (params) => 
        params.value != null ? `$${params.value.toFixed(2)}` : '',
    },
    {
      field: 'netPnL',
      headerName: 'Net P&L',
      width: 120,
      type: 'rightAligned',
      cellClass: (params) => clsx(
        'font-mono font-medium',
        params.value > 0 && 'cell-pnl-positive',
        params.value < 0 && 'cell-pnl-negative'
      ),
      valueFormatter: (params) => 
        params.value != null ? `$${params.value.toFixed(2)}` : '',
    },
  ], []);

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  // Calculate totals
  const totals = useMemo(() => {
    return exposureData.reduce(
      (acc, row) => ({
        longVolume: acc.longVolume + row.longVolume,
        shortVolume: acc.shortVolume + row.shortVolume,
        netVolume: acc.netVolume + row.netVolume,
        netPnL: acc.netPnL + row.netPnL,
      }),
      { longVolume: 0, shortVolume: 0, netVolume: 0, netPnL: 0 }
    );
  }, [exposureData]);

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Net Exposure</h1>
        <p className="text-sm text-text-secondary">
          Aggregated exposure by symbol across all books
        </p>
      </div>

      {/* Summary */}
      <div className="panel p-3 mb-4 flex items-center gap-8">
        <div>
          <span className="text-xs text-text-muted">Symbols</span>
          <p className="text-lg font-mono text-text-primary">{exposureData.length}</p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Total Long</span>
          <p className="text-lg font-mono text-accent">{totals.longVolume.toFixed(2)} lots</p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Total Short</span>
          <p className="text-lg font-mono text-risk-high">{totals.shortVolume.toFixed(2)} lots</p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Net Exposure</span>
          <p className={clsx(
            'text-lg font-mono',
            totals.netVolume > 0 && 'text-accent',
            totals.netVolume < 0 && 'text-risk-high'
          )}>
            {totals.netVolume > 0 ? '+' : ''}{totals.netVolume.toFixed(2)} lots
          </p>
        </div>
        <div>
          <span className="text-xs text-text-muted">Net P&L</span>
          <p className={clsx(
            'text-lg font-mono',
            totals.netPnL > 0 && 'text-pnl-positive',
            totals.netPnL < 0 && 'text-pnl-negative'
          )}>
            ${totals.netPnL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 ag-theme-nexrisk">
        <AgGridReact
          rowData={exposureData}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          animateRows={true}
          headerHeight={36}
          rowHeight={32}
          getRowId={(params) => params.data.symbol}
          loading={isLoading}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
        />
      </div>
    </div>
  );
}

export default NetExposurePage;
