// ============================================
// Focus Page
// Trader details with AG-Grid and LLM explanations
// ============================================

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent, RowClickedEvent } from 'ag-grid-community';
import { tradersApi, explanationsApi } from '@/services/api';
import { useSelectionStore } from '@/stores';
import { clsx } from 'clsx';
import type { Trader, TraderExplanation } from '@/types';


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

// Trader Detail Panel
function TraderDetailPanel({ login }: { login: number }) {
  const { data: explanation, isLoading } = useQuery({
    queryKey: ['explanation', login],
    queryFn: () => explanationsApi.getTraderExplanation(login),
    enabled: !!login,
  });

  const generateMutation = useMutation({
    mutationFn: () => explanationsApi.generateExplanation(login),
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading trader details...
      </div>
    );
  }

  if (!explanation) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No data available
      </div>
    );
  }

  const { current, claude_explanations, actions, behavior_change } = explanation;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-text-primary">Trader #{login}</h3>
          <RiskBadge level={current.risk_level} />
        </div>
        <div className="text-sm text-text-secondary">
          Classification: <span className="text-text-primary font-medium">{current.classification}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="p-4 border-b border-border">
        <h4 className="text-sm font-medium text-text-secondary mb-3">Risk Metrics</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-text-muted">Risk Score</span>
            <p className="font-mono text-text-primary">{current.risk_score.toFixed(1)}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Effective Risk</span>
            <p className="font-mono text-text-primary">{current.effective_risk.toFixed(1)}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Confidence</span>
            <p className="font-mono text-text-primary">{(current.confidence * 100).toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Trend</span>
            <p className={clsx(
              'font-mono',
              behavior_change?.trend === 'INCREASING_RISK' && 'text-risk-critical',
              behavior_change?.trend === 'DECREASING_RISK' && 'text-pnl-positive',
              behavior_change?.trend === 'STABLE' && 'text-text-primary'
            )}>
              {behavior_change?.trend || 'NEW'}
            </p>
          </div>
        </div>
      </div>

      {/* Triggered Rules */}
      {current.triggered_rules && (
        <div className="p-4 border-b border-border">
          <h4 className="text-sm font-medium text-text-secondary mb-2">Triggered Rules</h4>
          <p className="text-sm text-text-primary whitespace-pre-line">
            {current.triggered_rules}
          </p>
        </div>
      )}

      {/* LLM Explanation */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-text-secondary">AI Explanation</h4>
          {actions.show_explain_button && (
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="btn btn-primary text-xs"
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate'}
            </button>
          )}
        </div>
        
        {claude_explanations && claude_explanations.length > 0 ? (
          <div className="bg-background-tertiary rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={clsx(
                'text-xs px-1.5 py-0.5 rounded',
                claude_explanations[0].is_stale 
                  ? 'bg-risk-medium-bg text-risk-medium' 
                  : 'bg-accent-subtle text-accent'
              )}>
                {claude_explanations[0].is_stale ? 'Stale' : 'Fresh'}
              </span>
              <span className="text-xs text-text-muted">
                {claude_explanations[0].model}
              </span>
            </div>
            <div className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
              {claude_explanations[0].explanation.slice(0, 500)}
              {claude_explanations[0].explanation.length > 500 && '...'}
            </div>
            {claude_explanations[0].is_stale && claude_explanations[0].stale_warning && (
              <p className="mt-2 text-xs text-risk-medium">
                {claude_explanations[0].stale_warning}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-background-tertiary rounded p-3">
            <p className="text-sm text-text-muted">
              {current.template_explanation || 'No explanation available. Click Generate for AI analysis.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function FocusPage() {
  const [searchParams] = useSearchParams();
  const { selectedTrader, setSelectedTrader } = useSelectionStore();
  
  // Check for trader param in URL
  useEffect(() => {
    const traderParam = searchParams.get('trader');
    if (traderParam) {
      setSelectedTrader(Number(traderParam));
    }
  }, [searchParams, setSelectedTrader]);

  // Fetch traders
  const { data: tradersData, isLoading } = useQuery({
    queryKey: ['traders'],
    queryFn: () => tradersApi.getAll({ limit: 100 }),
  });

  // Column definitions
  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'login',
      headerName: 'Login',
      width: 100,
      pinned: 'left',
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
      headerName: 'Classification',
      width: 130,
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
      width: 90,
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
    {
      field: 'margin_level',
      headerName: 'Margin %',
      width: 100,
      type: 'rightAligned',
      cellClass: 'font-mono',
      valueFormatter: (params) => 
        params.value ? `${params.value.toFixed(0)}%` : '',
    },
  ], []);

  const onRowClicked = (event: RowClickedEvent<Trader>) => {
    if (event.data) {
      setSelectedTrader(event.data.login);
    }
  };

  const onGridReady = (params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  };

  return (
    <div className="h-full flex">
      {/* Traders Grid */}
      <div className={clsx(
        'h-full flex flex-col transition-all',
        selectedTrader ? 'flex-1' : 'flex-1'
      )}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-medium text-text-primary">Trader Focus</h1>
          <p className="text-sm text-text-secondary">
            Select a trader to view details and AI explanations
          </p>
        </div>

        {/* Grid */}
        <div className="flex-1 ag-theme-nexrisk">
          <AgGridReact
            rowData={tradersData?.traders || []}
            columnDefs={columnDefs}
            onGridReady={onGridReady}
            onRowClicked={onRowClicked}
            rowSelection="single"
            animateRows={true}
            headerHeight={36}
            rowHeight={32}
            getRowId={(params) => String(params.data.login)}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTrader && (
        <div className="w-96 h-full border-l border-border bg-surface">
          <TraderDetailPanel login={selectedTrader} />
        </div>
      )}
    </div>
  );
}

export default FocusPage;
