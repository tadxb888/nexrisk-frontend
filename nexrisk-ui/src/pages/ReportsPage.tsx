// ============================================================
// NexRisk — Reports Page
// ============================================================

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080';

// ── Grid theme ───────────────────────────────────────────────
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#232326',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontSize: 13,
  foregroundColor: '#FFF',
  headerFontSize: 13,
});

const defaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
  minWidth: 80,
};

// ── Column helpers ───────────────────────────────────────────
function snake2title(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function col(field: string, overrides?: Partial<ColDef>): ColDef {
  return { field, headerName: snake2title(field), minWidth: 90, ...overrides };
}
const fmtTs = (p: ValueFormatterParams) => {
  const v = p.value as string | null | undefined;
  if (v == null || v === '') return '';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
};
const ts   = (f: string): ColDef => col(f, { valueFormatter: fmtTs, minWidth: 160 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pnl  = (f: string): ColDef => col(f, { minWidth: 110, cellStyle: (p: any) => { const n = parseFloat(p.value); return isNaN(n) ? null : { color: n >= 0 ? '#66e07a' : '#ff5c5c' }; } });
const n2   = (f: string): ColDef => col(f, { minWidth: 90,  valueFormatter: (p) => { const n = parseFloat(p.value as string); return isNaN(n) ? ((p.value as string | null | undefined) ?? '') : n.toFixed(2); } });
const wide = (f: string): ColDef => col(f, { minWidth: 200 });
function cs(...defs: (string | ColDef)[]): ColDef[] {
  return defs.map(d => (typeof d === 'string' ? col(d) : d));
}

// ── Types ────────────────────────────────────────────────────
type ResponseShape = 'paginated' | 'profitability' | 'health-escalations' | 'raw-data' | 'json-config' | 'lp-volume';

type FilterDef =
  | { type: 'date-range' }
  | { type: 'text';   id: string; label: string; placeholder?: string; required?: boolean; strategySelect?: boolean }
  | { type: 'select'; id: string; label: string; options: { value: string; label: string }[] };
interface ReportDef {
  id: string; label: string; description: string; category: string; path: string;
  filters: FilterDef[]; columns: ColDef[]; secondaryColumns?: ColDef[];
  responseShape: ResponseShape; csvSupported: boolean; defaultLimit: number; note?: string;
}
interface Category { id: string; label: string; color: string; reports: ReportDef[]; }
interface PaginationState { total: number; limit: number; offset: number; }

// ── Report definitions ───────────────────────────────────────
const CATEGORIES: Category[] = [
  {
    id: 'financial', label: 'Financial', color: '#66e07a',
    reports: [
      {
        id: 'financial-profitability', label: 'Profitability', category: 'financial',
        description: 'Realized P&L from closed deals and unrealized P&L from open positions',
        path: 'financial/profitability', responseShape: 'profitability',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID', placeholder: 'MT5 login' },
          { type: 'text', id: 'symbol',   label: 'Symbol',   placeholder: 'e.g. EURUSD' },
        ],
        columns: cs('login', col('trader_name', { minWidth: 140 }), 'symbol', pnl('realized_pnl'), pnl('swap_total'), col('commission_total'), 'deal_count'),
        secondaryColumns: cs('login', col('trader_name', { minWidth: 140 }), 'symbol', pnl('unrealized_pnl'), pnl('swap_total'), col('commission_total'), 'position_count', n2('total_volume_lots')),
      },
      {
        id: 'financial-commissions', label: 'Commissions', category: 'financial',
        description: 'MT5 client commissions and LP-side commissions unified',
        path: 'financial/commissions', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID' },
          { type: 'text', id: 'symbol',   label: 'Symbol' },
          { type: 'text', id: 'lp_id',    label: 'LP ID' },
        ],
        columns: cs('source', 'login_id', col('trader_name', { minWidth: 140 }), 'symbol', 'lp_id', 'lp_name', pnl('commission_total'), 'trade_count'),
      },
      {
        id: 'financial-swaps', label: 'Swaps', category: 'financial',
        description: 'Aggregated swap charges per login/symbol from closed deals',
        path: 'financial/swaps', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID' },
          { type: 'text', id: 'symbol',   label: 'Symbol' },
        ],
        columns: cs('login', col('trader_name', { minWidth: 140 }), 'symbol', pnl('total_swap'), 'deal_count', ts('first_at'), ts('last_at')),
      },
      {
        id: 'financial-volume', label: 'Traded Volume', category: 'financial',
        description: 'Aggregated lot volume and notional volume per login/symbol',
        path: 'financial/volume', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID' },
          { type: 'text', id: 'symbol',   label: 'Symbol' },
        ],
        columns: cs('login', col('trader_name', { minWidth: 140 }), 'symbol', n2('lot_volume'), n2('notional_volume'), 'trade_count', ts('first_trade_at'), ts('last_trade_at')),
      },
    ],
  },
  {
    id: 'execution', label: 'Execution', color: '#4ecdc4',
    reports: [
      {
        id: 'execution-fix', label: 'FIX Message Log', category: 'execution',
        description: 'Raw FIX protocol messages — click any row to inspect tags and full message content',
        path: 'execution/fix', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200,
        note: '24-hour rolling retention — FIX messages older than 24 hours are not available from this endpoint.',
        filters: [
          { type: 'date-range' },
          { type: 'text',   id: 'lp_id',    label: 'LP ID' },
          { type: 'text',   id: 'symbol',   label: 'Symbol' },
          { type: 'text',   id: 'msg_type', label: 'Msg Type', placeholder: 'D, 8, AE…' },
          { type: 'select', id: 'direction', label: 'Direction', options: [
            { value: '', label: 'All' }, { value: 'sent', label: 'Sent' }, { value: 'received', label: 'Received' },
          ]},
        ],
        // Fewer columns — detail visible in panel
        columns: cs('id', 'lp_id', 'direction', 'msg_type', col('msg_type_name', { minWidth: 130 }), ts('session_ts'), col('clord_id', { minWidth: 160 }), 'symbol', 'exec_type', 'ord_status', 'login_id'),
      },
      {
        id: 'execution-rejections', label: 'Rejections', category: 'execution',
        description: 'Hedge orders in REJECTED_ESCALATED state with FIX rejection details',
        path: 'execution/rejections', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'lp_id',  label: 'LP ID' },
          { type: 'text', id: 'symbol', label: 'Symbol' },
        ],
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'lp_name', 'symbol', 'hedge_state', 'rejection_code', ts('dispatched_at'), n2('hedge_volume_mt5')),
      },
      {
        id: 'execution-orders', label: 'Order Execution', category: 'execution',
        description: 'All hedge orders with execution details and round-trip time',
        path: 'execution/orders', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text',   id: 'login_id', label: 'Login ID' },
          { type: 'text',   id: 'lp_id',    label: 'LP ID' },
          { type: 'text',   id: 'symbol',   label: 'Symbol' },
          { type: 'select', id: 'status',   label: 'Status', options: [
            { value: '', label: 'All' },
            ...['PENDING','HEDGED','CLOSED','TIMEOUT_ESCALATED','REJECTED_ESCALATED','NORMALIZER_ERROR','B_BOOKED']
              .map(v => ({ value: v, label: v })),
          ]},
        ],
        // fill_price / client_fill_price: raw string — preserve original decimal format
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'lp_name', 'symbol', 'direction', n2('volume_mt5'), col('fill_price'), col('client_fill_price'), 'status', ts('dispatched_at'), col('rt_ms'), pnl('net_revenue_usd')),
      },
      {
        id: 'execution-summary', label: 'Execution Summary', category: 'execution',
        description: 'Execution timeline per order: transaction time, NOS sent time, round-trip',
        path: 'execution/summary', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID' },
          { type: 'text', id: 'lp_id',    label: 'LP ID' },
          { type: 'text', id: 'symbol',   label: 'Symbol' },
        ],
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'symbol', 'direction', 'lp_status', ts('transaction_time'), 'nos_sent_ms', 'rt_ms', n2('hedge_volume_mt5')),
      },
      {
        id: 'execution-dom-trader', label: 'DOM Trader', category: 'execution',
        description: 'Hedge orders placed manually via the DOM Trader',
        path: 'execution/dom-trader', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'login_id', label: 'Login ID' },
        ],
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'lp_name', 'symbol', 'direction', n2('hedge_volume_mt5'), col('fill_price'), 'hedge_state', ts('dispatched_at'), 'rt_ms'),
      },
      {
        id: 'execution-lp-volume', label: 'LP Volume Report', category: 'execution',
        description: 'LP-confirmed billable volume aggregated by symbol, asset class, LP, node, book, direction, or day',
        path: 'lp-volume', responseShape: 'lp-volume',
        csvSupported: true, defaultLimit: 0, filters: [],
        columns: [],
      },
    ],
  },
  {
    id: 'hedging', label: 'Hedging', color: '#e0a020',
    reports: [
      {
        id: 'hedging-strategies', label: 'Strategies', category: 'hedging',
        description: 'Full configuration of all hedging rules',
        path: 'hedging/strategies', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'select', id: 'status', label: 'Status', options: [
            { value: '', label: 'All' }, { value: 'ACTIVE', label: 'ACTIVE' }, { value: 'PAUSED', label: 'PAUSED' }, { value: 'STOPPED', label: 'STOPPED' },
          ]},
        ],
        columns: cs('rule_id', col('name', { minWidth: 160 }), 'priority', 'status', 'activation_type', 'lp_name', 'direction', 'hedge_volume_pct', 'current_routing_status', 'total_hedges_sent', ts('last_triggered_at')),
      },
      {
        id: 'hedging-health-escalations', label: 'Health & Escalations', category: 'hedging',
        description: 'Escalated positions and LP health metrics for a strategy',
        path: 'hedging/health-escalations', responseShape: 'health-escalations',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'text', id: 'strategy_name', label: 'Strategy', required: true, strategySelect: true },
          { type: 'date-range' },
        ],
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'symbol', 'hedge_state', wide('escalation_reason'), ts('dispatched_at'), ts('escalated_at')),
        secondaryColumns: cs('lp_id', 'connectivity_status', n2('latency_ms'), n2('fill_rate_pct'), n2('reject_rate_pct'), n2('slippage_avg_pips'), ts('last_heartbeat_at'), 'breach_action'),
      },
      {
        id: 'hedging-executions', label: 'Strategy Executions', category: 'hedging',
        description: 'All hedge dispatches, optionally filtered by strategy or login',
        path: 'hedging/executions', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'strategy_name', label: 'Strategy', strategySelect: true },
          { type: 'text', id: 'login_id',       label: 'Login ID' },
        ],
        columns: cs('record_id', 'login_id', col('trader_name', { minWidth: 140 }), 'strategy_name', 'lp_name', 'symbol', 'direction', n2('volume'), col('fill_price'), 'hedge_state', ts('dispatched_at'), 'rt_ms'),
      },
    ],
  },
  {
    id: 'classification', label: 'Classification', color: '#a78bfa',
    reports: [
      {
        id: 'classification-risk-matrix-config', label: 'Risk Matrix Config', category: 'classification',
        description: 'Reference list of all risk action codes with metadata',
        path: 'classification/risk-matrix-config', responseShape: 'raw-data',
        csvSupported: false, defaultLimit: 0, filters: [],
        columns: cs('code', col('description', { minWidth: 200 }), 'severity_order', 'requires_approval', 'auto_executable', 'color_code', ts('created_at')),
      },
      {
        id: 'classification-risk-matrix-rules', label: 'Risk Matrix Rules', category: 'classification',
        description: 'All risk matrix rules joined to their action codes',
        path: 'classification/risk-matrix-rules', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200, filters: [],
        columns: cs('id', col('rule_name', { minWidth: 160 }), 'behavior_type', 'pf_min', 'pf_max', 'risk_level', 'action_code', col('action_description', { minWidth: 180 }), 'priority', 'is_active', 'updated_by', ts('updated_at')),
      },
      {
        id: 'classification-risk-matrix-history', label: 'Risk Matrix History', category: 'classification',
        description: 'Audit trail for all changes to risk matrix rules and action codes',
        path: 'classification/risk-matrix-history', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [{ type: 'date-range' }],
        columns: cs('id', 'table_name', 'record_id', 'change_type', 'changed_by', ts('changed_at'), col('reason', { minWidth: 180 })),
      },
    ],
  },
  {
    id: 'clustering', label: 'Clustering', color: '#f9a8d4',
    reports: [
      {
        id: 'clustering-runs', label: 'Clustering Runs', category: 'clustering',
        description: 'History of HDBSCAN clustering executions with quality metrics',
        path: 'clustering/runs', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 50,
        filters: [{ type: 'date-range' }],
        columns: cs(col('run_id', { minWidth: 280 }), ts('run_timestamp'), 'feature_window', 'universe_size', 'n_clusters', n2('silhouette_score'), 'execution_time_ms', 'status'),
      },
      {
        id: 'clustering-profiles', label: 'Cluster Profiles', category: 'clustering',
        description: 'Cluster profiles for a specific run joined to archetype mappings',
        path: 'clustering/profiles', responseShape: 'raw-data',
        csvSupported: false, defaultLimit: 0,
        filters: [{ type: 'text', id: 'run_id', label: 'Run ID', placeholder: 'UUID from Clustering Runs', required: true }],
        columns: cs('cluster_id', 'member_count', n2('stability_score'), n2('persistence'), 'archetype_code', 'default_risk_profile', ts('effective_from')),
      },
      {
        id: 'clustering-assignments', label: 'Cluster Assignments', category: 'clustering',
        description: 'All trader assignments for a specific clustering run',
        path: 'clustering/assignments', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 500,
        filters: [{ type: 'text', id: 'run_id', label: 'Run ID', placeholder: 'UUID from Clustering Runs', required: true }],
        columns: cs('login', col('trader_name', { minWidth: 140 }), 'cluster_id', n2('membership_probability'), n2('outlier_score'), 'is_noise', ts('assigned_at')),
      },
    ],
  },
  {
    id: 'lp', label: 'Liquidity Provider', color: '#fb923c',
    reports: [
      {
        id: 'lp-config', label: 'LP Configuration', category: 'lp',
        description: 'Full LP configuration merged with live health metrics',
        path: 'lp/config', responseShape: 'raw-data',
        csvSupported: false, defaultLimit: 0, filters: [],
        columns: cs('lp_id', 'lp_name', 'provider_type', 'environment', 'enabled', 'connectivity_status', n2('latency_ms'), n2('fill_rate_pct'), n2('reject_rate_pct'), 'trading_host', ts('last_heartbeat_at')),
      },
      {
        id: 'lp-instruments', label: 'LP Instruments', category: 'lp',
        description: 'Symbol mappings per LP joined to MT5 symbol metadata',
        path: 'lp/instruments', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200,
        filters: [
          { type: 'text',   id: 'lp_id',      label: 'LP ID' },
          { type: 'select', id: 'active_only', label: 'Active Only', options: [
            { value: 'true', label: 'Active only' }, { value: 'false', label: 'All' },
          ]},
        ],
        columns: cs('mt5_symbol', 'lp_symbol', 'lp_id', 'lp_name', n2('volume_multiplier'), 'lp_price_precision', 'enabled', 'is_active', ts('uploaded_at')),
      },
      {
        id: 'lp-audit-log', label: 'LP Audit Log', category: 'lp',
        description: 'Combined log from lp_audit_log and audit_log (LP_ADMIN category)',
        path: 'lp/audit-log', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 100,
        filters: [
          { type: 'date-range' },
          { type: 'text', id: 'lp_id', label: 'LP ID' },
        ],
        columns: cs('source', 'id', 'lp_id', 'action', 'actor', col('details', { minWidth: 200 }), ts('occurred_at')),
      },
    ],
  },
  {
    id: 'symbol-mapping', label: 'Symbol Mapping', color: '#a3e635',
    reports: [
      {
        id: 'symbol-mapping', label: 'Symbol Mapping', category: 'symbol-mapping',
        description: 'Full LP to MT5 symbol mapping table',
        path: 'symbol-mapping', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 500,
        filters: [
          { type: 'text', id: 'lp_id',  label: 'LP ID' },
          { type: 'text', id: 'symbol', label: 'MT5 Symbol' },
        ],
        columns: cs('mt5_symbol', 'lp_symbol', 'lp_id', 'lp_name', n2('volume_multiplier'), 'lp_price_precision', 'enabled', 'is_active', ts('uploaded_at'), 'mt5_node_name'),
      },
    ],
  },
  {
    id: 'price-rules', label: 'Price Rules', color: '#c084fc',
    reports: [
      {
        id: 'price-rules-feed-config', label: 'Feed Configuration', category: 'price-rules',
        description: 'Complete feed pipeline configuration including availability schedule',
        path: 'price-rules/feed-config', responseShape: 'raw-data',
        csvSupported: false, defaultLimit: 0, filters: [],
        columns: cs(col('feed_id', { minWidth: 80 }), col('name', { minWidth: 140 }), 'source_lp_id', 'mt5_node_name', 'status', 'priority', 'throttle_enabled', 'availability_type', 'global_repricing_method', ts('updated_at')),
      },
      {
        id: 'price-rules-feed-summary', label: 'Feed Summary', category: 'price-rules',
        description: 'Operational overview of all feeds',
        path: 'price-rules/feed-summary', responseShape: 'raw-data',
        csvSupported: false, defaultLimit: 0,
        note: 'Pipeline tick statistics are not persisted and will not appear in this report.',
        filters: [],
        columns: cs(col('feed_id', { minWidth: 80 }), col('name', { minWidth: 140 }), 'source_lp_id', 'lp_name', 'status', 'symbol_count', 'throttle_enabled'),
      },
      {
        id: 'price-rules-spread-rules', label: 'Spread Rules', category: 'price-rules',
        description: 'Priority-ordered spread repricing rules per feed',
        path: 'price-rules/spread-rules', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200,
        filters: [{ type: 'text', id: 'feed_id', label: 'Feed ID' }],
        columns: cs('rule_id', 'feed_name', col('rule_name', { minWidth: 140 }), 'priority', 'enabled', 'scope_symbol', 'condition_type', 'method', 'bid_adjustment', 'ask_adjustment', ts('created_at')),
      },
      {
        id: 'price-rules-group-spread', label: 'Group Spread Rules', category: 'price-rules',
        description: 'Per-MT5-group per-symbol spread override rules',
        path: 'price-rules/group-spread', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200,
        filters: [{ type: 'text', id: 'mt5_group', label: 'MT5 Group' }],
        columns: cs('rule_id', 'mt5_group', 'mt5_symbol', 'mode', 'value_points', 'ask_offset', 'bid_offset', 'enabled', 'created_by', ts('created_at')),
      },
    ],
  },
  {
    id: 'access-control', label: 'Access Control', color: '#f87171',
    reports: [
      {
        id: 'acl-users', label: 'Users', category: 'access-control',
        description: 'Platform user accounts with role info and lifecycle timestamps',
        path: 'acl/users', responseShape: 'paginated',
        csvSupported: true, defaultLimit: 200,
        filters: [
          { type: 'select', id: 'is_active', label: 'Status', options: [
            { value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' },
          ]},
        ],
        columns: cs('id', 'email', 'first_name', 'last_name', 'role_name', 'is_active', 'is_root', 'totp_enrolled', ts('created_at'), ts('last_login_at')),
      },
    ],
  },
];

const ALL_REPORTS: ReportDef[] = CATEGORIES.flatMap(c => c.reports);
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

function dateQuickSelect(days: number): { from: string; to: string } {
  const now = new Date();
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: now.toISOString() };
}

// ── Row Detail Panel ─────────────────────────────────────────
function fmtPanelValue(val: unknown): { text: string; isLong: boolean } {
  if (val === null || val === undefined) return { text: '—', isLong: false };
  if (typeof val === 'boolean') return { text: val ? 'Yes' : 'No', isLong: false };
  if (typeof val === 'object') {
    const str = JSON.stringify(val, null, 2);
    return { text: str, isLong: true };
  }
  const str = String(val);
  if (str === '') return { text: '—', isLong: false };
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try { return { text: new Date(str).toLocaleString(), isLong: false }; } catch { /* fall through */ }
  }
  return { text: str, isLong: str.length > 72 || str.includes('\n') };
}

function RowDetailPanel({
  row,
  reportLabel,
  categoryColor,
  onClose,
}: {
  row: Record<string, unknown>;
  reportLabel: string;
  categoryColor: string;
  onClose: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 flex flex-col border-l border-[#505050] overflow-hidden"
      style={{ width: '340px', backgroundColor: '#1e1d20' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#505050] flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
          <span className="text-xs font-semibold text-white truncate">{reportLabel} — Row Detail</span>
        </div>
        <button onClick={onClose} className="text-[#bbb] hover:text-white transition-colors ml-2 flex-shrink-0 text-sm leading-none" title="Close panel">✕</button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {Object.entries(row).map(([key, val]) => {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const { text, isLong } = fmtPanelValue(val);
          return (
            <div key={key}>
              <div className="text-[10px] text-[#bbb] uppercase tracking-wider mb-0.5 font-medium">{label}</div>
              {isLong ? (
                <pre
                  className="text-xs text-[#ccc] font-mono bg-[#141316] rounded p-2 whitespace-pre-wrap break-words leading-relaxed"
                  style={{ maxHeight: '200px', overflowY: 'auto' }}
                >
                  {text}
                </pre>
              ) : (
                <span className="text-xs font-mono" style={{ color: text === '—' ? '#555' : '#e0e0e0' }}>
                  {text}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section title bar ────────────────────────────────────────
function SectionBar({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs font-semibold text-white">{label}</span>
      <span className="text-xs text-[#bbb] font-mono ml-2">{count.toLocaleString()} rows</span>
    </div>
  );
}

// ── JSON Config Viewer (non-programmer friendly) ─────────────

function isPrim(v: unknown): boolean {
  return v === null || v === undefined || (typeof v !== 'object' && !Array.isArray(v));
}

function ConfigVal({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span style={{ color: '#aaa' }}>—</span>;
  if (typeof v === 'boolean') return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded"
      style={{ backgroundColor: v ? '#162416' : '#241616', color: v ? '#66e07a' : '#ff6b6b' }}>
      {v ? 'Enabled' : 'Disabled'}
    </span>
  );
  if (typeof v === 'number') return <span className="text-xs" style={{ color: '#4ecdc4' }}>{v.toLocaleString()}</span>;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      try { return <span className="text-xs text-[#aaa]">{new Date(v).toLocaleString()}</span>; } catch { /* fall through */ }
    }
    return <span className="text-xs text-white">{v}</span>;
  }
  return <span className="text-xs text-[#aaa]">{String(v)}</span>;
}

function ConfigNode({ label, value, depth }: { label: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const title = snake2title(label);

  // ── Primitive → simple row ──────────────────────────────
  if (isPrim(value)) {
    return (
      <div className="flex items-center justify-between py-2 px-4 border-b border-[#242428]"
        style={{ backgroundColor: depth % 2 === 0 ? '#1c1b1e' : '#1e1d20' }}>
        <span className="text-xs text-[#ccc]">{title}</span>
        <ConfigVal v={value} />
      </div>
    );
  }

  // ── Array ───────────────────────────────────────────────
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="flex items-center justify-between py-2 px-4 border-b border-[#242428]">
          <span className="text-xs text-[#ccc]">{title}</span>
          <span className="text-xs text-[#aaa]">None</span>
        </div>
      );
    }
    if (value.every(isPrim)) {
      return (
        <div className="flex items-start justify-between gap-4 py-2 px-4 border-b border-[#242428]">
          <span className="text-xs text-[#ccc] flex-shrink-0">{title}</span>
          <span className="text-xs text-white text-right">{value.map(String).join(', ')}</span>
        </div>
      );
    }
    return (
      <div className="border-b border-[#242428]">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between py-2 px-4 hover:bg-[#252428] transition-colors text-left">
          <span className="text-xs font-medium text-white">{title}</span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] text-[#aaa] bg-[#1a191c] px-1.5 py-0.5 rounded">{value.length} items</span>
            <span className="text-[10px] text-[#aaa]">{open ? '▲' : '▼'}</span>
          </span>
        </button>
        {open && (
          <div className="pb-2">
            {value.map((item, i) => (
              <div key={i} className="mx-4 mb-2 rounded overflow-hidden border border-[#2a2a2e]">
                <div className="px-3 py-1 text-[10px] font-semibold text-[#aaa] uppercase tracking-wider"
                  style={{ backgroundColor: '#141316' }}>Item {i + 1}</div>
                {typeof item === 'object' && item !== null
                  ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                      <ConfigNode key={k} label={k} value={v} depth={depth + 1} />
                    ))
                  : <div className="py-2 px-4 text-xs text-white">{String(item)}</div>
                }
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Object ──────────────────────────────────────────────
  const entries = Object.entries(value as Record<string, unknown>);

  if (depth === 0) {
    // Top-level section card
    return (
      <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #2a2a2e' }}>
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#2a2930] transition-colors text-left"
          style={{ backgroundColor: '#252428' }}>
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] text-[#aaa]">
              {entries.length} setting{entries.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-[#aaa]">{open ? '▲' : '▼'}</span>
          </span>
        </button>
        {open && (
          <div style={{ backgroundColor: '#1c1b1e' }}>
            {entries.map(([k, v]) => <ConfigNode key={k} label={k} value={v} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  // Nested object subsection
  return (
    <div className="border-b border-[#242428]">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 px-4 hover:bg-[#252428] transition-colors text-left">
        <span className="text-xs font-semibold text-[#ccc]">{title}</span>
        <span className="text-[10px] text-[#aaa]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-l-2 border-[#2d2c30] ml-4 mb-1">
          {entries.map(([k, v]) => <ConfigNode key={k} label={k} value={v} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

function JsonConfigViewer({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  const prims   = entries.filter(([, v]) => isPrim(v));
  const complex = entries.filter(([, v]) => !isPrim(v));
  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: '#1a191c' }}>
      <div style={{ maxWidth: '680px' }}>
        {/* Top-level primitives (e.g. generated_at) */}
        {prims.length > 0 && (
          <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #2a2a2e', backgroundColor: '#1c1b1e' }}>
            {prims.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 px-4 border-b border-[#242428] last:border-b-0">
                <span className="text-xs text-[#bbb]">{snake2title(k)}</span>
                <ConfigVal v={v} />
              </div>
            ))}
          </div>
        )}
        {/* Collapsible sections */}
        {complex.map(([k, v]) => <ConfigNode key={k} label={k} value={v} depth={0} />)}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// LP Volume Report (custom toolbar + grid for the lp-volume shape)
// ─────────────────────────────────────────────────────────────
type LpVolumePeriod   = 'today' | 'mtd' | 'last_month' | 'custom';
type LpVolumeGroupKey = 'lp' | 'node' | 'book' | 'symbol' | 'asset_class' | 'direction' | 'day';

interface LpVolumeRow {
  lp_id?:          string;
  mt5_node_id?:    number;
  book_name?:      'A' | 'C';
  mt5_symbol?:     string;
  asset_class?:    string | null;
  contract_size?:  number;
  direction?:      'LONG' | 'SHORT';
  day?:            string;
  volume_lots:     number;
  volume_notional: number;
  deal_count:      number;
  first_fill_at:   string;
  last_fill_at:    string;
}

interface LpVolumeResponse {
  period:   LpVolumePeriod;
  from:     string;
  to:       string;
  group_by: string[];
  filters:  Record<string, string>;
  columns:  string[];
  rows:     LpVolumeRow[];
  totals: { volume_lots: number; volume_notional: number; deal_count: number };
}

const LP_VOL_GROUP_OPTIONS: { key: LpVolumeGroupKey; label: string }[] = [
  { key: 'symbol',      label: 'Symbol' },
  { key: 'asset_class', label: 'Asset Class' },
  { key: 'lp',          label: 'LP' },
  { key: 'node',        label: 'Node' },
  { key: 'book',        label: 'Book' },
  { key: 'direction',   label: 'Direction' },
  { key: 'day',         label: 'Day' },
];

const ASSET_CLASS_OPTIONS = ['Forex', 'Metals', 'Indices', 'Energies', 'Crypto', 'Stocks', 'Bonds'];

function fmtLvNumber(v: unknown, decimals: number): string {
  const n = typeof v === 'number' ? v : parseFloat(v as string);
  if (isNaN(n)) return '';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// The response's `to` is exclusive (next-day UTC midnight). Render the inclusive form.
function fmtInclusiveTo(toIso: string): string {
  try { return new Date(new Date(toIso).getTime() - 1).toLocaleDateString(); }
  catch { return String(toIso); }
}
function fmtFromDate(fromIso: string): string {
  try { return new Date(fromIso).toLocaleDateString(); }
  catch { return String(fromIso); }
}

function LpVolumeFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[10px] text-[#999] whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}

function LpVolumeSummaryStat({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[#bbb] uppercase tracking-wider font-medium">{label}</span>
      <span
        className="font-mono"
        style={{
          color:      prominent ? '#fff' : '#ddd',
          fontSize:   prominent ? '14px' : '12px',
          fontWeight: prominent ? 600    : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function LpVolumeReport() {
  const [period, setPeriod]               = useState<LpVolumePeriod>('today');
  const [customFrom, setCustomFrom]       = useState<string>('');
  const [customTo, setCustomTo]           = useState<string>('');
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(null);
  const [groupBy, setGroupBy]             = useState<LpVolumeGroupKey[]>(['symbol']);
  const [fLpId, setFLpId]                 = useState<string>('');
  const [fNodeId, setFNodeId]             = useState<string>('');
  const [fBook, setFBook]                 = useState<string>('');
  const [fSymbol, setFSymbol]             = useState<string>('');
  const [fAssetClass, setFAssetClass]     = useState<string>('');
  const [filtersOpen, setFiltersOpen]     = useState<boolean>(false);
  const [data, setData]                   = useState<LpVolumeResponse | null>(null);
  const [loading, setLoading]             = useState<boolean>(false);
  const [error, setError]                 = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Browser tab title — restored on unmount/page switch
  useEffect(() => {
    const previous = document.title;
    document.title = 'LP Volume Report — Taiga';
    return () => { document.title = previous; };
  }, []);

  const buildParams = useCallback((forCsv: boolean): URLSearchParams => {
    const sp = new URLSearchParams();
    sp.set('period', period);
    if (period === 'custom' && appliedCustom) {
      sp.set('from', appliedCustom.from);
      sp.set('to',   appliedCustom.to);
    }
    if (groupBy.length > 0) sp.set('group_by', groupBy.join(','));
    if (fLpId.trim())       sp.set('lp_id',      fLpId.trim());
    if (fNodeId.trim())     sp.set('node_id',    fNodeId.trim());
    if (fBook)              sp.set('book',       fBook);
    if (fSymbol.trim())     sp.set('mt5_symbol', fSymbol.trim());
    if (fAssetClass)        sp.set('asset_class', fAssetClass);
    if (forCsv)             sp.set('format', 'csv');
    return sp;
  }, [period, appliedCustom, groupBy, fLpId, fNodeId, fBook, fSymbol, fAssetClass]);

  const doFetch = useCallback(async () => {
    if (period === 'custom' && !appliedCustom) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/api/v1/reports/lp-volume?${buildParams(false)}`;
      const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as LpVolumeResponse;
      setData(json);
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      setError((e as Error)?.message ?? 'Request failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, appliedCustom, buildParams]);

  // Re-fetch whenever the request shape changes
  const groupKey = groupBy.join(',');
  useEffect(() => {
    void doFetch();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, appliedCustom, groupKey, fLpId, fNodeId, fBook, fSymbol, fAssetClass]);

  // Poll only when period is open-ended and the tab is visible
  useEffect(() => {
    if (period !== 'today' && period !== 'mtd') return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void doFetch();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [period, doFetch]);

  function toggleGroup(key: LpVolumeGroupKey) {
    setGroupBy(prev =>
      prev.includes(key)
        ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) // require ≥1
        : [...prev, key]
    );
  }

  function handleApplyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    setAppliedCustom({ from: customFrom, to: customTo });
  }

  async function handleExportCsv() {
    try {
      const url = `${API_BASE}/api/v1/reports/lp-volume?${buildParams(true)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const blob = await res.blob();
      const burl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = burl;
      const cd = res.headers.get('Content-Disposition');
      a.download = cd?.match(/filename="(.+?)"/)?.[1] ?? 'lp-volume.csv';
      a.click();
      URL.revokeObjectURL(burl);
    } catch { /* ignore */ }
  }

  // Column defs built from the response's `columns` array (canonical order)
  const colDefs = useMemo<ColDef[]>(() => {
    if (!data) return [];
    return data.columns.map((field): ColDef => {
      switch (field) {
        case 'volume_lots':
          return {
            field, headerName: 'Volume (lots)', minWidth: 130, type: 'rightAligned',
            valueFormatter: (p) => fmtLvNumber(p.value, 2),
            cellStyle: { fontFamily: 'IBM Plex Mono, monospace' },
          };
        case 'volume_notional':
          return {
            field, headerName: 'Notional', minWidth: 170, type: 'rightAligned',
            valueFormatter: (p) => fmtLvNumber(p.value, 2),
            cellStyle: { fontFamily: 'IBM Plex Mono, monospace', fontSize: '14px', color: '#fff' },
          };
        case 'deal_count':
          return {
            field, headerName: 'Deal Count', minWidth: 110, type: 'rightAligned',
            valueFormatter: (p) => fmtLvNumber(p.value, 0),
            cellStyle: { fontFamily: 'IBM Plex Mono, monospace' },
          };
        case 'contract_size':
          return {
            field, headerName: 'Contract Size', minWidth: 130, type: 'rightAligned',
            valueFormatter: (p) => {
              const n = typeof p.value === 'number' ? p.value : parseFloat(p.value as string);
              if (isNaN(n)) return '';
              const d = Number.isInteger(n) ? 0 : 2;
              return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
            },
            cellStyle: { fontFamily: 'IBM Plex Mono, monospace' },
          };
        case 'asset_class':
          return {
            field, headerName: 'Asset Class', minWidth: 120,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cellRenderer: (p: any) => (p.value == null
              ? <span style={{ color: '#777', fontStyle: 'italic' }}>Unclassified</span>
              : p.value),
          };
        case 'direction':
          return {
            field, headerName: 'Direction', minWidth: 90,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cellRenderer: (p: any) => (
              <span style={{
                color:      p.value === 'LONG' ? '#66e07a' : p.value === 'SHORT' ? '#ff5c5c' : '#aaa',
                fontWeight: 600,
              }}>{p.value ?? ''}</span>
            ),
          };
        case 'book_name':
          return {
            field, headerName: 'Book', minWidth: 80,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cellRenderer: (p: any) => {
              const v = p.value;
              if (v == null) return '';
              const bg = v === 'A' ? 'rgba(78,205,196,0.18)' : v === 'C' ? 'rgba(224,160,32,0.18)' : 'rgba(160,160,160,0.18)';
              const fg = v === 'A' ? '#4ecdc4'              : v === 'C' ? '#e0a020'              : '#aaa';
              return (
                <span style={{
                  display: 'inline-block', padding: '1px 8px', borderRadius: 999,
                  fontSize: '11px', fontWeight: 600, backgroundColor: bg, color: fg,
                  fontFamily: 'IBM Plex Mono, monospace',
                }}>{v}</span>
              );
            },
          };
        case 'first_fill_at':
        case 'last_fill_at':
          return {
            field, headerName: snake2title(field), minWidth: 180,
            valueFormatter: (p) => {
              const v = p.value as string | null | undefined;
              if (v == null || v === '') return '';
              try { return new Date(v).toLocaleString(); } catch { return String(v); }
            },
            tooltipValueGetter: (p) => (p.value == null ? '' : String(p.value)),
            cellStyle: { fontFamily: 'IBM Plex Mono, monospace' },
          };
        case 'lp_id':
          return { field, headerName: 'LP',       minWidth: 140, cellStyle: { fontFamily: 'IBM Plex Mono, monospace' } };
        case 'mt5_node_id':
          return { field, headerName: 'MT5 Node', minWidth: 90,  type: 'rightAligned', cellStyle: { fontFamily: 'IBM Plex Mono, monospace' } };
        case 'mt5_symbol':
          return { field, headerName: 'Symbol',   minWidth: 110, cellStyle: { fontFamily: 'IBM Plex Mono, monospace' } };
        case 'day':
          return { field, headerName: 'Day',      minWidth: 110, cellStyle: { fontFamily: 'IBM Plex Mono, monospace' } };
        default:
          // Defensive: unknown additive columns get a generic render
          return col(field);
      }
    });
  }, [data]);

  const hasRows = !!data && data.rows.length > 0;
  const customApplyDisabled = !customFrom || !customTo || customFrom > customTo;
  const anyFilterActive = !!(fLpId || fNodeId || fBook || fSymbol || fAssetClass);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="px-4 py-2 border-b border-[#505050] flex items-center gap-3 flex-wrap flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
        {/* Period segmented */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-[#bbb] uppercase tracking-wider font-medium mr-1">Period</span>
          {([['today','Today'], ['mtd','MTD'], ['last_month','Last Month'], ['custom','Custom']] as [LpVolumePeriod, string][]).map(([key, label]) => {
            const active = period === key;
            return (
              <button
                key={key}
                onClick={() => { setPeriod(key); if (key !== 'custom') setAppliedCustom(null); }}
                className="text-[10px] px-2 py-0.5 rounded border transition-colors"
                style={{
                  borderColor:     active ? '#4ecdc4' : '#606060',
                  color:           active ? '#4ecdc4' : '#ccc',
                  backgroundColor: active ? 'rgba(78,205,196,0.12)' : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Custom date pickers */}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white" />
            <span className="text-[10px] text-[#bbb]">–</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white" />
            <button
              onClick={handleApplyCustom}
              disabled={customApplyDisabled}
              className="text-[10px] px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: '#4ecdc4', color: '#4ecdc4' }}
            >
              Apply
            </button>
          </div>
        )}

        {/* Group-by chips */}
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-[#bbb] uppercase tracking-wider font-medium mr-1">Group by</span>
          {LP_VOL_GROUP_OPTIONS.map(({ key, label }) => {
            const active = groupBy.includes(key);
            const lockedOn = active && groupBy.length === 1;
            return (
              <button
                key={key}
                onClick={() => toggleGroup(key)}
                disabled={lockedOn}
                title={lockedOn ? 'At least one grouping is required' : undefined}
                className="text-[10px] px-2 py-0.5 rounded border transition-colors disabled:cursor-not-allowed"
                style={{
                  borderColor:     active ? '#4ecdc4' : '#606060',
                  color:           active ? '#4ecdc4' : '#ccc',
                  backgroundColor: active ? 'rgba(78,205,196,0.12)' : 'transparent',
                  opacity:         lockedOn ? 0.85 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Filters toggle */}
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className="text-[10px] px-2 py-0.5 rounded border transition-colors flex-shrink-0"
          style={{
            borderColor:     filtersOpen || anyFilterActive ? '#4ecdc4' : '#606060',
            color:           filtersOpen || anyFilterActive ? '#4ecdc4' : '#ccc',
            backgroundColor: filtersOpen ? 'rgba(78,205,196,0.12)' : 'transparent',
          }}
        >
          Filters{anyFilterActive ? ' •' : ''} {filtersOpen ? '▲' : '▼'}
        </button>

        {/* CSV */}
        <button
          onClick={handleExportCsv}
          disabled={!hasRows}
          className="text-xs px-3 py-1 rounded border border-[#606060] text-[#999] hover:text-white hover:border-[#808080] transition-colors font-mono flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Download CSV
        </button>
      </div>

      {/* ── Filters drawer ── */}
      {filtersOpen && (
        <div className="px-4 py-2 border-b border-[#505050] flex items-center gap-4 flex-wrap flex-shrink-0" style={{ backgroundColor: '#252429' }}>
          <LpVolumeFilterField label="LP">
            <input type="text" value={fLpId} onChange={e => setFLpId(e.target.value)}
              placeholder="e.g. traderevolution"
              className="w-[160px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#555]" />
          </LpVolumeFilterField>
          <LpVolumeFilterField label="Asset Class">
            <select value={fAssetClass} onChange={e => setFAssetClass(e.target.value)}
              className="bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white">
              <option value="">All</option>
              {ASSET_CLASS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </LpVolumeFilterField>
          <LpVolumeFilterField label="Symbol">
            <input type="text" value={fSymbol} onChange={e => setFSymbol(e.target.value)}
              placeholder="e.g. EURUSD"
              className="w-[120px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#555]" />
          </LpVolumeFilterField>
          <LpVolumeFilterField label="Node">
            <input type="text" value={fNodeId} onChange={e => setFNodeId(e.target.value)}
              placeholder="e.g. 2"
              className="w-[80px] bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#555]" />
          </LpVolumeFilterField>
          <LpVolumeFilterField label="Book">
            <select value={fBook} onChange={e => setFBook(e.target.value)}
              className="bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white">
              <option value="">All</option>
              <option value="A">A</option>
              <option value="C">C</option>
            </select>
          </LpVolumeFilterField>
          {anyFilterActive && (
            <button
              onClick={() => { setFLpId(''); setFNodeId(''); setFBook(''); setFSymbol(''); setFAssetClass(''); }}
              className="text-[10px] text-[#bbb] hover:text-white transition-colors ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Summary strip ── */}
      {data && (
        <div className="px-4 py-2 border-b border-[#505050] flex items-center gap-6 flex-shrink-0 flex-wrap" style={{ backgroundColor: '#1c1b1e' }}>
          <LpVolumeSummaryStat label="Period"        value={data.period.toUpperCase()} />
          <LpVolumeSummaryStat label="From"          value={fmtFromDate(data.from)} />
          <LpVolumeSummaryStat label="To (incl.)"    value={fmtInclusiveTo(data.to)} />
          {loading && <span className="text-[10px] text-[#bbb] font-mono">refreshing…</span>}
          <div className="flex-1" />
          <LpVolumeSummaryStat label="Volume (lots)" value={fmtLvNumber(data.totals.volume_lots,     2)} prominent />
          <LpVolumeSummaryStat label="Notional"      value={fmtLvNumber(data.totals.volume_notional, 2)} prominent />
          <LpVolumeSummaryStat label="Deal Count"    value={fmtLvNumber(data.totals.deal_count,      0)} prominent />
        </div>
      )}

      {/* ── Data area ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: '4px' }}>
        {loading && !data && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[#999] text-sm font-mono">Loading…</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-[#ff5c5c] text-sm font-mono">{error}</p>
            <button onClick={() => doFetch()} className="text-xs px-3 py-1 rounded border border-[#606060] text-[#999] hover:text-white transition-colors">Retry</button>
          </div>
        )}
        {!loading && !error && data && data.rows.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[#aaa] text-sm font-mono">No fills in this period for the selected filters.</span>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="flex-1 min-h-0">
            <AgGridReact
              theme={gridTheme}
              defaultColDef={defaultColDef}
              rowHeight={26}
              headerHeight={36}
              rowData={data.rows}
              columnDefs={colDefs}
            />
          </div>
        )}
      </div>
    </div>
  );
}
// ── Main component ───────────────────────────────────────────
export function ReportsPage() {
  const [selectedId, setSelectedId]           = useState<string>(ALL_REPORTS[0].id);
  const [filterValues, setFilterValues]       = useState<Record<string, string>>({});
  const [limit, setLimit]                     = useState<number>(ALL_REPORTS[0].defaultLimit || 100);
  const [offset, setOffset]                   = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [responseData, setResponseData]       = useState<Record<string, any> | null>(null);
  const [pagination, setPagination]           = useState<PaginationState | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [hasRun, setHasRun]                   = useState(false);
  // New state
  const [activeDateQuick, setActiveDateQuick] = useState<number | null>(null);
  const [selectedRow, setSelectedRow]         = useState<Record<string, unknown> | null>(null);
  const [strategyOptions, setStrategyOptions] = useState<string[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Load strategy names when a strategy-filter report is selected
  const needsStrategies = selectedId === 'hedging-health-escalations' || selectedId === 'hedging-executions';
  useEffect(() => {
    if (!needsStrategies || strategyOptions.length > 0 || loadingStrategies) return;
    setLoadingStrategies(true);
    fetch(`${API_BASE}/api/v1/reports/hedging/strategies?limit=500`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((j: any) => {
        if (!j) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names: string[] = (j.data ?? []).map((s: any) => String(s.name ?? '')).filter(Boolean).sort();
        setStrategyOptions(names);
      })
      .catch(() => {})
      .finally(() => setLoadingStrategies(false));
  }, [needsStrategies, strategyOptions.length, loadingStrategies]);

  const selectedReport = ALL_REPORTS.find(r => r.id === selectedId)!;
  const category = CAT_BY_ID[selectedReport.category];

  function selectReport(id: string) {
    abortRef.current?.abort();
    const r = ALL_REPORTS.find(x => x.id === id)!;
    setSelectedId(id);
    setFilterValues({});
    setLimit(r.defaultLimit > 0 ? r.defaultLimit : 100);
    setOffset(0);
    setResponseData(null);
    setPagination(null);
    setError(null);
    setHasRun(false);
    setActiveDateQuick(null);
    setSelectedRow(null);
  }

  const requiredMissing = selectedReport.filters.some(
    f => f.type === 'text' && f.required && !filterValues[(f as { id: string }).id]?.trim()
  );

  async function doFetch(runOffset: number) {
    if (requiredMissing) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setHasRun(true);
    setSelectedRow(null);

    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filterValues)) {
      if (v && v.trim()) sp.set(k, v.trim());
    }
    const shape = selectedReport.responseShape;
    const isPaged = shape === 'paginated' || shape === 'profitability' || shape === 'health-escalations';
    if (isPaged && selectedReport.defaultLimit > 0) {
      sp.set('limit', String(limit));
      sp.set('offset', String(runOffset));
    }
    const url = `${API_BASE}/api/v1/reports/${selectedReport.path}${sp.toString() ? '?' + sp.toString() : ''}`;

    try {
      const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await res.json() as Record<string, any>;
      setResponseData(json);
      setOffset(runOffset);
      if (shape === 'paginated') {
        setPagination((json.pagination as PaginationState) ?? null);
      } else if (shape === 'profitability') {
        setPagination((json.realized?.pagination as PaginationState) ?? null);
      } else if (shape === 'health-escalations') {
        setPagination((json.escalations?.pagination as PaginationState) ?? null);
      } else {
        setPagination(null);
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      setError((e as Error)?.message ?? 'Request failed');
      setResponseData(null);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }

  const handleRun  = () => doFetch(0);
  const handlePrev = () => { if (pagination && pagination.offset > 0) doFetch(Math.max(0, pagination.offset - limit)); };
  const handleNext = () => { if (pagination && pagination.offset + limit < pagination.total) doFetch(pagination.offset + limit); };

  function setFilter(id: string, value: string) {
    setFilterValues(prev => ({ ...prev, [id]: value }));
  }
  function applyDateQuick(days: number) {
    const { from, to } = dateQuickSelect(days);
    setFilterValues(prev => ({ ...prev, from, to }));
    setActiveDateQuick(days);
  }
  function clearDateRange() {
    setFilterValues(prev => { const n = { ...prev }; delete n.from; delete n.to; return n; });
    setActiveDateQuick(null);
  }

  async function handleExportCsv() {
    if (!selectedReport.csvSupported) return;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filterValues)) { if (v && v.trim()) sp.set(k, v.trim()); }
    sp.set('format', 'csv'); sp.set('limit', '10000'); sp.set('offset', '0');
    try {
      const res = await fetch(`${API_BASE}/api/v1/reports/${selectedReport.path}?${sp.toString()}`, { credentials: 'include' });
      if (!res.ok) return;
      const blob = await res.blob();
      const burl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = burl;
      const cd = res.headers.get('Content-Disposition');
      a.download = cd?.match(/filename="(.+?)"/)?.[1] ?? `${selectedReport.id}.csv`;
      a.click();
      URL.revokeObjectURL(burl);
    } catch { /* ignore */ }
  }

  const hasDR = selectedReport.filters.some(f => f.type === 'date-range');
  const activeDateRange = filterValues.from || filterValues.to;
  const showPagination = !!(pagination && ['paginated','profitability','health-escalations'].includes(selectedReport.responseShape));
  const pFrom = pagination ? pagination.offset + 1 : 0;
  const pTo   = pagination ? Math.min(pagination.offset + limit, pagination.total) : 0;

  // Shared row click handler for all grids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onRowClicked = (e: { data?: any }) => { if (e.data) setSelectedRow(e.data as Record<string, unknown>); };

  // ── Data area renderer ───────────────────────────────────
  function renderData() {
    if (!hasRun) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#aaa] text-sm font-mono">Configure filters and click Run Report</p>
            {requiredMissing && <p className="text-[#e0a020] text-xs mt-2 font-mono">Required fields must be filled before running</p>}
          </div>
        </div>
      );
    }
    if (loading) {
      return <div className="flex-1 flex items-center justify-center"><span className="text-[#999] text-sm font-mono">Loading…</span></div>;
    }
    if (error) {
      const isJsonConfig = selectedReport.responseShape === 'json-config';
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-[#ff5c5c] text-sm font-mono">{error}</p>
          {isJsonConfig && (
            <p className="text-[#bbb] text-xs max-w-xs">This configuration endpoint may not be available yet. Check with your backend team.</p>
          )}
          {!isJsonConfig && (
            <button onClick={handleRun} className="text-xs px-3 py-1 rounded border border-[#606060] text-[#999] hover:text-white transition-colors">Retry</button>
          )}
        </div>
      );
    }
    if (!responseData) return null;

    const shape = selectedReport.responseShape;
    const gridProps = { theme: gridTheme, defaultColDef, rowHeight: 26, headerHeight: 36, onRowClicked };

    if (shape === 'json-config') {
      return <JsonConfigViewer data={responseData} />;
    }
    if (shape === 'raw-data') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = responseData.data ?? [];
      return (
        <div className="flex-1 min-h-0">
          <AgGridReact {...gridProps} rowData={rows} columnDefs={selectedReport.columns} />
        </div>
      );
    }
    if (shape === 'paginated') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = responseData.data ?? [];
      return (
        <div className="flex-1 min-h-0">
          <AgGridReact {...gridProps} rowData={rows} columnDefs={selectedReport.columns} />
        </div>
      );
    }
    if (shape === 'profitability') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const realized: any[]   = responseData.realized?.data   ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unrealized: any[] = responseData.unrealized?.data ?? [];
      return (
        <div className="flex-1 flex flex-col min-h-0 gap-0.5">
          <div className="flex-1 flex flex-col min-h-0">
            <SectionBar label="Realized P&L" color="#66e07a" count={realized.length} />
            <div className="flex-1 min-h-0"><AgGridReact {...gridProps} rowData={realized} columnDefs={selectedReport.columns} /></div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <SectionBar label="Unrealized P&L" color="#e0a020" count={unrealized.length} />
            <div className="flex-1 min-h-0"><AgGridReact {...gridProps} rowData={unrealized} columnDefs={selectedReport.secondaryColumns ?? []} /></div>
          </div>
        </div>
      );
    }
    if (shape === 'health-escalations') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escalations: any[] = responseData.escalations?.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lpHealth: any[]    = responseData.lp_health        ?? [];
      return (
        <div className="flex-1 flex flex-col min-h-0 gap-0.5">
          <div style={{ flex: '0 0 60%' }} className="flex flex-col min-h-0">
            <SectionBar label="Escalations" color="#ff6b6b" count={escalations.length} />
            <div className="flex-1 min-h-0"><AgGridReact {...gridProps} rowData={escalations} columnDefs={selectedReport.columns} /></div>
          </div>
          <div style={{ flex: '0 0 38%' }} className="flex flex-col min-h-0">
            <SectionBar label="LP Health" color="#4ecdc4" count={lpHealth.length} />
            <div className="flex-1 min-h-0"><AgGridReact {...gridProps} rowData={lpHealth} columnDefs={selectedReport.secondaryColumns ?? []} /></div>
          </div>
        </div>
      );
    }
    return null;
  }

  const selectCls = 'bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]';

  return (
    <div className="h-full flex overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* ── Sidebar ── */}
      <div className="w-[220px] flex-shrink-0 flex flex-col overflow-y-auto border-r border-[#505050]" style={{ backgroundColor: '#2a292c' }}>
        <div className="px-3 py-2 border-b border-[#505050]">
          <span className="text-[10px] text-[#bbb] uppercase tracking-wider font-medium">Reports</span>
        </div>
        {CATEGORIES.map(cat => (
          <div key={cat.id} className="py-1">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-[10px] font-semibold text-white uppercase tracking-wide">{cat.label}</span>
            </div>
            {cat.reports.map(r => {
              const isActive = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => selectReport(r.id)}
                  className="w-full text-left py-1.5 text-xs transition-colors"
                  style={{
                    paddingLeft: '28px', paddingRight: '8px',
                    color: isActive ? '#fff' : '#aaa',
                    backgroundColor: isActive ? '#313032' : 'transparent',
                    borderLeft: isActive ? `2px solid ${cat.color}` : '2px solid transparent',
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
              <h1 className="text-lg font-semibold text-white">{selectedReport.label}</h1>
            </div>
            <p className="text-xs text-[#999] mt-0.5">{selectedReport.description}</p>
          </div>
          {pagination && (
            <span className="text-xs text-[#bbb] font-mono flex-shrink-0">{pagination.total.toLocaleString()} total rows</span>
          )}
        </div>

        {/* Note banner */}
        {selectedReport.note && (
          <div className="px-4 py-2 border-b border-[#4a3800] text-xs text-[#e0a020] flex items-start gap-2 flex-shrink-0" style={{ backgroundColor: '#2a1f00' }}>
            <span className="flex-shrink-0 font-bold mt-0.5">!</span>
            <span>{selectedReport.note}</span>
          </div>
        )}

        {/* Filter bar — hidden for LP Volume (it has its own custom toolbar) */}
        {selectedReport.responseShape !== 'lp-volume' && (
        <div className="px-4 py-2 border-b border-[#505050] flex items-center gap-3 flex-wrap flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
          <span className="text-[10px] text-[#bbb] uppercase tracking-wider font-medium flex-shrink-0">Filters</span>

          {/* Date quick-selects */}
          {hasDR && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {([['Today', 1], ['7D', 7], ['30D', 30], ['90D', 90]] as [string, number][]).map(([lbl, d]) => {
                const isSelected = activeDateQuick === d;
                return (
                  <button
                    key={lbl}
                    onClick={() => applyDateQuick(d)}
                    className="text-[10px] px-2 py-0.5 rounded border transition-colors"
                    style={{
                      borderColor:     isSelected ? '#4ecdc4' : '#606060',
                      color:           isSelected ? '#4ecdc4' : '#ccc',
                      backgroundColor: isSelected ? 'rgba(78,205,196,0.12)' : 'transparent',
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
              {activeDateRange && (
                <>
                  <span className="text-[10px] text-[#4ecdc4] font-mono ml-1">
                    {filterValues.from ? new Date(filterValues.from).toLocaleDateString() : ''}
                    {' – '}
                    {filterValues.to ? new Date(filterValues.to).toLocaleDateString() : ''}
                  </span>
                  <button onClick={clearDateRange} className="text-[10px] text-[#bbb] hover:text-white transition-colors">✕</button>
                </>
              )}
            </div>
          )}

          {/* Report-specific filters */}
          {selectedReport.filters.filter(f => f.type !== 'date-range').map(filter => {
            if (filter.type === 'text') {
              // Strategy name → dropdown when options available
              if (filter.strategySelect) {
                const isEmpty = !!filter.required && !filterValues[filter.id]?.trim();
                return (
                  <div key={filter.id} className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-[#999] whitespace-nowrap">
                      {filter.label}
                      {filter.required && <span className="text-[#e0a020] ml-0.5">*</span>}
                    </span>
                    {strategyOptions.length > 0 ? (
                      <select
                        value={filterValues[filter.id] ?? ''}
                        onChange={e => setFilter(filter.id, e.target.value)}
                        className={selectCls}
                        style={{ minWidth: '180px', borderColor: isEmpty ? '#e0a020' : undefined }}
                      >
                        <option value="">Select strategy…</option>
                        {strategyOptions.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={filterValues[filter.id] ?? ''}
                        onChange={e => setFilter(filter.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !requiredMissing) handleRun(); }}
                        placeholder={loadingStrategies ? 'Loading strategies…' : (filter.placeholder ?? '')}
                        disabled={loadingStrategies}
                        className="w-[180px] bg-[#232225] rounded px-2 py-1 text-xs text-white placeholder-[#555] focus:outline-none transition-colors"
                        style={{ border: `1px solid ${isEmpty ? '#e0a020' : '#606060'}` }}
                      />
                    )}
                  </div>
                );
              }

              // Normal text input
              const isEmpty = !!filter.required && !filterValues[filter.id]?.trim();
              return (
                <div key={filter.id} className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-[#999] whitespace-nowrap">
                    {filter.label}
                    {filter.required && <span className="text-[#e0a020] ml-0.5">*</span>}
                  </span>
                  <input
                    type="text"
                    value={filterValues[filter.id] ?? ''}
                    onChange={e => setFilter(filter.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !requiredMissing) handleRun(); }}
                    placeholder={filter.placeholder ?? ''}
                    className="w-[150px] bg-[#232225] rounded px-2 py-1 text-xs text-white placeholder-[#555] focus:outline-none transition-colors"
                    style={{ border: `1px solid ${isEmpty ? '#e0a020' : '#606060'}` }}
                  />
                </div>
              );
            }
            if (filter.type === 'select') {
              return (
                <div key={filter.id} className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-[#999] whitespace-nowrap">{filter.label}</span>
                  <select value={filterValues[filter.id] ?? ''} onChange={e => setFilter(filter.id, e.target.value)} className={selectCls}>
                    {filter.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              );
            }
            return null;
          })}

          <div className="flex-1" />

          {selectedReport.csvSupported && hasRun && !loading && responseData && (
            <button onClick={handleExportCsv} className="text-xs px-3 py-1 rounded border border-[#606060] text-[#999] hover:text-white hover:border-[#808080] transition-colors font-mono flex-shrink-0">
              Export CSV
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={requiredMissing || loading}
            className="text-xs px-4 py-1.5 rounded font-semibold transition-colors flex-shrink-0"
            style={{
              backgroundColor: requiredMissing || loading ? '#3a3a3c' : '#4ecdc4',
              color:           requiredMissing || loading ? '#666'    : '#1a1a1a',
              cursor:          requiredMissing || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Run Report'}
          </button>
        </div>
        )}
      
        {/* Data area + optional detail panel */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {selectedReport.responseShape === 'lp-volume' ? (
            <LpVolumeReport />
          ) : (
            <>
              <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ padding: '4px' }}>
                {renderData()}
              </div>
              {selectedRow && (
                <RowDetailPanel
                  row={selectedRow}
                  reportLabel={selectedReport.label}
                  categoryColor={category.color}
                  onClose={() => setSelectedRow(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Pagination footer */}
        {showPagination && selectedReport.responseShape !== 'lp-volume' && (
          <div className="px-4 py-2 border-t border-[#505050] flex items-center gap-4 flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
            <span className="text-xs text-[#999] font-mono">{pFrom.toLocaleString()}–{pTo.toLocaleString()} of {pagination!.total.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <button onClick={handlePrev} disabled={pagination!.offset === 0 || loading} className="text-xs px-2 py-0.5 rounded border border-[#606060] text-[#999] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
              <button onClick={handleNext} disabled={pTo >= pagination!.total || loading} className="text-xs px-2 py-0.5 rounded border border-[#606060] text-[#999] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] text-[#bbb]">Rows per page</span>
              <select value={limit} onChange={e => setLimit(Number(e.target.value))} className={selectCls}>
                {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsPage;