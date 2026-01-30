// ============================================
// Charter Page
// Risk Matrix rules viewer
// ============================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgGridReact } from '@ag-grid-community/react';
import type { ColDef, GridReadyEvent } from '@ag-grid-community/core';
import { configApi } from '@/services/api';
import { clsx } from 'clsx';

import '@ag-grid-community/styles/ag-grid.css';
import '../components/ui/grid-config';

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

export function CharterPage() {
  // Fetch risk matrix rules
  const { data: matrixData, isLoading } = useQuery({
    queryKey: ['risk-matrix'],
    queryFn: () => configApi.getRiskMatrix(),
  });

  // Column definitions
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'rule_id',
      headerName: 'ID',
      width: 70,
      cellClass: 'font-mono text-text-muted',
    },
    {
      field: 'behavior_type',
      headerName: 'Behavior Type',
      width: 140,
    },
    {
      field: 'profit_factor_min',
      headerName: 'PF Min',
      width: 90,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(2) || '',
    },
    {
      field: 'profit_factor_max',
      headerName: 'PF Max',
      width: 90,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(2) || '',
    },
    {
      field: 'risk_level',
      headerName: 'Risk Level',
      width: 110,
      cellRenderer: (params: { value: string }) => <RiskBadge level={params.value} />,
    },
    {
      field: 'action_code',
      headerName: 'Action',
      width: 130,
      cellClass: 'font-mono',
    },
    {
      field: 'spread_multiplier',
      headerName: 'Spread ×',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(2) || '',
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 90,
      type: 'rightAligned',
      cellClass: 'font-mono',
    },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 80,
      cellRenderer: (params: { value: boolean }) => (
        <span className={clsx(
          'status-dot',
          params.value ? 'status-dot-low' : 'status-dot-neutral'
        )} />
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
      cellClass: 'text-text-secondary',
    },
  ], []);

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Risk Charter</h1>
        <p className="text-sm text-text-secondary">
          Risk matrix rules defining behavior classification and actions
        </p>
      </div>

      {/* Info Banner */}
      <div className="panel p-3 mb-4 bg-info-bg border-info-border">
        <p className="text-sm text-text-secondary">
          This is a read-only view. To modify risk matrix rules, use the Risk Charter Settings page.
          Rules are versioned with audit trail and approval workflow.
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 ag-theme-nexrisk">
        <AgGridReact
          rowData={matrixData?.rules || []}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          animateRows={true}
          headerHeight={36}
          rowHeight={32}
          getRowId={(params) => String(params.data.rule_id)}
          loading={isLoading}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
        />
      </div>

      {/* Footer Stats */}
      <div className="mt-4 flex items-center gap-6 text-sm text-text-secondary">
        <span>Total Rules: <span className="font-mono text-text-primary">{matrixData?.total || 0}</span></span>
        <span>Active: <span className="font-mono text-pnl-positive">{matrixData?.rules?.filter(r => r.is_active).length || 0}</span></span>
        <span>Inactive: <span className="font-mono text-text-muted">{matrixData?.rules?.filter(r => !r.is_active).length || 0}</span></span>
      </div>
    </div>
  );
}

export default CharterPage;
