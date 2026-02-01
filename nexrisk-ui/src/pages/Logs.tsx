// ============================================
// Logs Page
// Trade event stream viewer
// ============================================

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import { eventsApi } from '@/services/api';
import { clsx } from 'clsx';


function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function LogsPage() {
  const [eventType, setEventType] = useState<string>('');
  const [traderFilter, setTraderFilter] = useState<string>('');

  // Fetch events
  const { data: eventsData, isLoading, refetch } = useQuery({
    queryKey: ['events', { type: eventType, login: traderFilter }],
    queryFn: () => eventsApi.getRecent({
      limit: 500,
      type: eventType || undefined,
      login: traderFilter ? Number(traderFilter) : undefined,
    }),
    refetchInterval: 5000,
  });

  // Column definitions
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'timestamp',
      headerName: 'Time',
      width: 100,
      cellClass: 'font-mono text-text-muted',
      valueFormatter: (params) => formatTimestamp(params.value),
    },
    {
      field: 'id',
      headerName: 'Event ID',
      width: 100,
      cellClass: 'font-mono text-text-muted',
    },
    {
      field: 'trader_login',
      headerName: 'Trader',
      width: 100,
      cellClass: 'font-mono',
    },
    {
      field: 'event_type',
      headerName: 'Type',
      width: 120,
      cellRenderer: (params: { value: string }) => (
        <span className={clsx(
          'text-xs px-1.5 py-0.5 rounded',
          params.value?.includes('BUY') && 'bg-accent-subtle text-accent',
          params.value?.includes('SELL') && 'bg-risk-high-bg text-risk-high'
        )}>
          {params.value}
        </span>
      ),
    },
    {
      field: 'symbol',
      headerName: 'Symbol',
      width: 100,
      cellClass: 'font-mono font-medium',
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
      field: 'price',
      headerName: 'Price',
      width: 110,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => params.value?.toFixed(5) || '',
    },
    {
      field: 'profit',
      headerName: 'Profit',
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
  ], []);

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-medium text-text-primary">Event Logs</h1>
          <p className="text-sm text-text-secondary">
            Real-time trade event stream
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="select text-sm"
          >
            <option value="">All Types</option>
            <option value="DEAL_BUY">DEAL_BUY</option>
            <option value="DEAL_SELL">DEAL_SELL</option>
            <option value="ORDER_ADD">ORDER_ADD</option>
            <option value="ORDER_DELETE">ORDER_DELETE</option>
            <option value="POSITION_OPEN">POSITION_OPEN</option>
            <option value="POSITION_CLOSE">POSITION_CLOSE</option>
          </select>

          <input
            type="text"
            placeholder="Trader ID"
            value={traderFilter}
            onChange={(e) => setTraderFilter(e.target.value)}
            className="input text-sm w-28"
          />

          <button
            onClick={() => refetch()}
            className="btn btn-ghost text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 ag-theme-nexrisk">
        <AgGridReact
          rowData={eventsData?.events || []}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          animateRows={true}
          headerHeight={36}
          rowHeight={28}
          getRowId={(params) => String(params.data.id)}
          loading={isLoading}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
        />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
        <span>Showing {eventsData?.events?.length || 0} of {eventsData?.total || 0} events</span>
        <span>Auto-refresh: 5s</span>
      </div>
    </div>
  );
}

export default LogsPage;
