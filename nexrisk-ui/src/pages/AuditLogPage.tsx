import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type {
  ColDef,
  GridOptions,
  RowSelectionOptions,
  GridReadyEvent,
  RowClickedEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ── Grid Theme (identical to BBook reference) ─────────────────
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#313032',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 14,
});

// ── Types ─────────────────────────────────────────────────────
interface AuditActor {
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  ip: string | null;
  source: 'user' | 'system' | 'fix_bridge' | 'scheduler';
}

interface AuditEntity {
  type: string;
  id: string;
  label: string | null;
}

interface AuditContext {
  mt5_node_id: number | null;
  mt5_node_name: string | null;
  lp_id: string | null;
  lp_name: string | null;
  hedge_rule_id: number | null;
  hedge_rule_name: string | null;
  price_rule_id: number | null;
  price_rule_name: string | null;
}

export interface AuditLogEntry {
  id: number;
  occurred_at: string;
  action_category: string;
  action_type: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  source_service: string;
  notes: string | null;
  actor: AuditActor;
  entity: AuditEntity;
  context: AuditContext;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  changed_fields: string[] | null;
}

interface AuditLogsResponse {
  total: number;
  limit: number;
  offset: number;
  count: number;
  entries: AuditLogEntry[];
}

interface AuditCategory {
  value: string;
  label: string;
}

interface AppliedFilters {
  category: string;
  action_type: string;
  severity: string;
  source_service: string;
  actor_email: string;
  entity_type: string;
  from: string;
  to: string;
}

// ── Constants ─────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, { color: string; fontWeight?: string }> = {
  INFO:     { color: '#66e07a' },
  WARN:     { color: '#e0a020', fontWeight: '600' },
  CRITICAL: { color: '#ff6b6b', fontWeight: '700' },
};

const ACTION_TYPE_COLOR: Record<string, string> = {
  CREATE:          '#66e07a',
  UPDATE:          '#4ecdc4',
  DELETE:          '#ff6b6b',
  ENABLE:          '#66e07a',
  DISABLE:         '#808080',
  LOGIN:           '#4ecdc4',
  LOGOUT:          '#808080',
  LOGIN_FAILED:    '#ff6b6b',
  PASSWORD_CHANGE: '#e0a020',
  TOTP_ENROLLED:   '#e0a020',
  INVITE_ISSUED:   '#4ecdc4',
  ROLE_CHANGE:     '#e0a020',
  CONNECT:         '#66e07a',
  DISCONNECT:      '#ff6b6b',
  QUARANTINE:      '#ff6b6b',
  RESUME:          '#66e07a',
  CRED_UPDATE:     '#e0a020',
  RELOAD:          '#4ecdc4',
  BUY:             '#4ecdc4',
  SELL:            '#e0a020',
  CANCEL:          '#ff6b6b',
  SERVICE_START:   '#808080',
};

const ACTION_TYPES = [
  'CREATE', 'UPDATE', 'DELETE',
  'ENABLE', 'DISABLE',
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'TOTP_ENROLLED',
  'INVITE_ISSUED', 'ROLE_CHANGE',
  'CONNECT', 'DISCONNECT', 'QUARANTINE', 'RESUME', 'CRED_UPDATE', 'RELOAD',
  'BUY', 'SELL', 'CANCEL',
  'SERVICE_START',
];

const EMPTY_APPLIED: AppliedFilters = {
  category: '', action_type: '', severity: '', source_service: '',
  actor_email: '', entity_type: '', from: '', to: '',
};

const LIMIT = 100;

// ── Helpers ───────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function actorDisplay(actor: AuditActor): string {
  if (actor.source === 'system')    return 'system';
  if (actor.source === 'scheduler') return 'scheduler';
  if (actor.source === 'fix_bridge') return 'fix_bridge';
  if (actor.first_name) return `${actor.first_name} ${actor.last_name ?? ''}`.trim();
  return actor.email ?? actor.source;
}

function serviceDisplay(svc: string): string {
  if (svc === 'fix_bridge')       return 'FIX Bridge';
  if (svc === 'nexrisk_service')  return 'NexRisk';
  return svc;
}

// ── State Diff Subcomponent ───────────────────────────────────

function StateDiff({ entry }: { entry: AuditLogEntry }) {
  const { action_type, previous_state, new_state, changed_fields } = entry;
  const changedSet = new Set(changed_fields ?? []);

  if (action_type === 'CREATE' && new_state) {
    return (
      <table className="text-[11px] font-mono w-full">
        <tbody>
          {Object.entries(new_state).map(([k, v]) => (
            <tr key={k} className="border-b border-[#353335]">
              <td className="text-[#999] py-[2px] pr-4 whitespace-nowrap align-top">{k}</td>
              <td className="text-[#66e07a] py-[2px] break-all">{JSON.stringify(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (action_type === 'DELETE' && previous_state) {
    return (
      <table className="text-[11px] font-mono w-full">
        <tbody>
          {Object.entries(previous_state).map(([k, v]) => (
            <tr key={k} className="border-b border-[#353335]">
              <td className="text-[#999] py-[2px] pr-4 whitespace-nowrap align-top">{k}</td>
              <td className="text-[#ff6b6b] py-[2px] break-all line-through">{JSON.stringify(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (previous_state && new_state) {
    const allKeys = [
      ...new Set([...Object.keys(previous_state), ...Object.keys(new_state)]),
    ];
    // Changed fields first
    const sortedKeys = [
      ...allKeys.filter(k => changedSet.has(k)),
      ...allKeys.filter(k => !changedSet.has(k)),
    ];
    return (
      <table className="text-[11px] font-mono w-full border-collapse">
        <thead>
          <tr>
            <th className="text-[#666] text-left font-normal text-[10px] pr-5 pb-1 whitespace-nowrap">Field</th>
            <th className="text-[#666] text-left font-normal text-[10px] pr-5 pb-1">Before</th>
            <th className="text-[#666] text-left font-normal text-[10px] pb-1">After</th>
          </tr>
        </thead>
        <tbody>
          {sortedKeys.map(k => {
            const isChanged = changedSet.has(k);
            return (
              <tr
                key={k}
                className={clsx('border-b border-[#353335]', isChanged && 'bg-[#28231e]')}
              >
                <td className={clsx('py-[2px] pr-5 whitespace-nowrap align-top', isChanged ? 'text-[#e0a020]' : 'text-[#555]')}>
                  {k}
                </td>
                <td className={clsx('py-[2px] pr-5 break-all align-top', isChanged ? 'text-[#ff6b6b]' : 'text-[#555]')}>
                  {JSON.stringify(previous_state[k])}
                </td>
                <td className={clsx('py-[2px] break-all align-top', isChanged ? 'text-[#66e07a]' : 'text-[#555]')}>
                  {JSON.stringify(new_state[k])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return <span className="text-[#555] text-[11px] font-mono">No state snapshot recorded</span>;
}

// ── Detail Panel ──────────────────────────────────────────────

function DetailPanel({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  const sevStyle = SEVERITY_STYLE[entry.severity] ?? SEVERITY_STYLE.INFO;
  const hasDiff  = entry.previous_state !== null || entry.new_state !== null;

  const diffLabel =
    entry.action_type === 'CREATE' ? 'Created With' :
    entry.action_type === 'DELETE' ? 'Deleted State' :
    `State Changes${entry.changed_fields?.length ? ` — ${entry.changed_fields.length} field${entry.changed_fields.length !== 1 ? 's' : ''}` : ''}`;

  return (
    <div
      className="border-t border-[#808080] flex flex-col flex-shrink-0"
      style={{ height: 260, backgroundColor: '#252428' }}
    >
      {/* Panel header bar */}
      <div className="px-4 py-1.5 border-b border-[#3a3840] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[#555] text-[11px] font-mono flex-shrink-0">#{entry.id}</span>
          <span className="text-[11px] font-mono font-semibold flex-shrink-0" style={sevStyle}>
            {entry.severity}
          </span>
          <span
            className="text-[11px] font-mono font-bold flex-shrink-0"
            style={{ color: ACTION_TYPE_COLOR[entry.action_type] ?? '#ccc' }}
          >
            {entry.action_type}
          </span>
          <span className="text-[#888] text-[11px] font-mono flex-shrink-0">{entry.entity?.type}</span>
          {entry.entity?.label && (
            <span className="text-white text-[11px] truncate">"{entry.entity.label}"</span>
          )}
          <span className="text-[#555] text-[11px] font-mono flex-shrink-0">{fmtTime(entry.occurred_at)}</span>
        </div>
        <button
          onClick={onClose}
          className="text-[#666] hover:text-white transition-colors text-sm ml-4 flex-shrink-0"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Panel body: three columns */}
      <div className="flex-1 flex overflow-hidden">

        {/* Column 1 — Actor */}
        <div className="w-[190px] flex-shrink-0 px-3 py-2.5 border-r border-[#353335] overflow-y-auto">
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Actor</div>
          <div className="text-white text-[12px] font-mono">{actorDisplay(entry.actor)}</div>
          {entry.actor.email && entry.actor.first_name && (
            <div className="text-[#888] text-[10px] font-mono mt-0.5 break-all">{entry.actor.email}</div>
          )}
          {entry.actor.role && (
            <div className="text-[#666] text-[10px] mt-1">
              <span className="text-[#555]">role</span> {entry.actor.role}
            </div>
          )}
          {entry.actor.ip && (
            <div className="text-[#555] font-mono text-[10px] mt-0.5">{entry.actor.ip}</div>
          )}
          <div className="text-[#444] text-[10px] mt-1">via {serviceDisplay(entry.source_service)}</div>
        </div>

        {/* Column 2 — Entity + Context + Notes */}
        <div className="w-[210px] flex-shrink-0 px-3 py-2.5 border-r border-[#353335] overflow-y-auto">
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">Entity</div>
          <div className="text-[#aaa] text-[11px] font-mono">{entry.entity?.type}</div>
          {entry.entity?.label && (
            <div className="text-white text-[12px] mt-0.5">{entry.entity.label}</div>
          )}
          <div className="text-[#555] text-[10px] font-mono mt-0.5">id: {entry.entity?.id}</div>

          {/* Context sub-section */}
          {(entry.context.lp_name || entry.context.hedge_rule_name || entry.context.price_rule_name || entry.context.mt5_node_name) && (
            <div className="mt-2.5 pt-2 border-t border-[#353335]">
              <div className="text-[10px] text-[#555] uppercase tracking-widest mb-1.5">Context</div>
              {entry.context.lp_name      && <div className="text-[#888] text-[10px] font-mono"><span className="text-[#555]">LP:</span> {entry.context.lp_name}</div>}
              {entry.context.hedge_rule_name  && <div className="text-[#888] text-[10px] font-mono"><span className="text-[#555]">Rule:</span> {entry.context.hedge_rule_name}</div>}
              {entry.context.price_rule_name  && <div className="text-[#888] text-[10px] font-mono"><span className="text-[#555]">Price:</span> {entry.context.price_rule_name}</div>}
              {entry.context.mt5_node_name    && <div className="text-[#888] text-[10px] font-mono"><span className="text-[#555]">Node:</span> {entry.context.mt5_node_name}</div>}
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div className="mt-2.5 pt-2 border-t border-[#353335]">
              <div className="text-[10px] text-[#555] uppercase tracking-widest mb-1.5">Notes</div>
              <div className="text-[#bbb] text-[10px] leading-relaxed">{entry.notes}</div>
            </div>
          )}
        </div>

        {/* Column 3 — State Diff */}
        <div className="flex-1 min-w-0 px-3 py-2.5 overflow-auto">
          <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">{hasDiff ? diffLabel : 'State'}</div>
          {hasDiff ? (
            <StateDiff entry={entry} />
          ) : (
            <span className="text-[#444] text-[11px] font-mono">No state snapshot for this event type</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function AuditLogPage() {
  const gridRef = useRef<AgGridReact<AuditLogEntry>>(null);

  // Data
  const [entries,       setEntries]       = useState<AuditLogEntry[]>([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [categories,    setCategories]    = useState<AuditCategory[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Pagination
  const [offset, setOffset] = useState(0);

  // Filter display state (controlled inputs)
  const [filterCategory,   setFilterCategory]   = useState('');
  const [filterActionType, setFilterActionType] = useState('');
  const [filterSeverity,   setFilterSeverity]   = useState('');
  const [filterSource,     setFilterSource]     = useState('');
  const [filterActorEmail, setFilterActorEmail] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterFrom,       setFilterFrom]       = useState('');
  const [filterTo,         setFilterTo]         = useState('');

  // Applied filters (drive the actual fetch)
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_APPLIED);

  // ── Categories on mount ────────────────────────────────────
  useEffect(() => {
    apiFetch<{ categories: AuditCategory[] }>('/api/v1/audit/categories')
      .then(r => setCategories(r.categories ?? []))
      .catch(() => {/* fail silently — no fallback needed, dropdowns just show raw values */});
  }, []);

  // ── Fetch logs whenever applied filters or offset change ───
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (applied.category)       sp.set('category',       applied.category);
      if (applied.action_type)    sp.set('action_type',    applied.action_type);
      if (applied.severity)       sp.set('severity',       applied.severity);
      if (applied.source_service) sp.set('source_service', applied.source_service);
      if (applied.actor_email)    sp.set('actor_email',    applied.actor_email);
      if (applied.entity_type)    sp.set('entity_type',    applied.entity_type);
      if (applied.from) {
        try { sp.set('from', new Date(applied.from).toISOString()); } catch { /* skip invalid date */ }
      }
      if (applied.to) {
        try { sp.set('to', new Date(applied.to).toISOString()); } catch { /* skip invalid date */ }
      }
      sp.set('limit',  String(LIMIT));
      sp.set('offset', String(offset));

      const q = sp.toString();
      const data = await apiFetch<AuditLogsResponse>(`/api/v1/audit/logs${q ? `?${q}` : ''}`);
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [applied, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Filter actions ─────────────────────────────────────────
  function handleSearch() {
    setOffset(0);
    setApplied({
      category:       filterCategory,
      action_type:    filterActionType,
      severity:       filterSeverity,
      source_service: filterSource,
      actor_email:    filterActorEmail,
      entity_type:    filterEntityType,
      from:           filterFrom,
      to:             filterTo,
    });
  }

  function handleClear() {
    setFilterCategory('');
    setFilterActionType('');
    setFilterSeverity('');
    setFilterSource('');
    setFilterActorEmail('');
    setFilterEntityType('');
    setFilterFrom('');
    setFilterTo('');
    setOffset(0);
    setApplied(EMPTY_APPLIED);
  }

  // Dropdowns apply immediately — update display state and applied state together
  function applyDropdown(key: keyof AppliedFilters, val: string, setter: (v: string) => void) {
    setter(val);
    setOffset(0);
    setApplied(prev => ({ ...prev, [key]: val }));
  }

  const hasFilters = Object.values(applied).some(v => v !== '');

  // ── Pagination ─────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(offset / LIMIT) + 1;

  // ── Grid Columns ───────────────────────────────────────────
  const columnDefs = useMemo<ColDef<AuditLogEntry>[]>(() => [
    {
      field: 'occurred_at',
      headerName: 'Time',
      width: 185,
      sort: 'asc',  // newest-first data arrives from API; grid sort is cosmetic only
      valueFormatter: p => p.value ? fmtTime(p.value as string) : '',
      cellStyle: { color: '#888', fontFamily: 'IBM Plex Mono' },
    },
    {
      field: 'severity',
      headerName: 'Sev',
      width: 82,
      cellStyle: p => ({
        ...(SEVERITY_STYLE[p.value as string] ?? { color: '#ccc' }),
        fontFamily: 'IBM Plex Mono',
      }),
    },
    {
      field: 'action_category',
      headerName: 'Category',
      width: 145,
      valueFormatter: p => {
        const cat = categories.find(c => c.value === p.value);
        return cat ? cat.label : (p.value as string ?? '');
      },
      cellStyle: { color: '#ccc', fontFamily: 'IBM Plex Mono' },
    },
    {
      field: 'action_type',
      headerName: 'Action',
      width: 145,
      cellStyle: p => ({
        color: ACTION_TYPE_COLOR[p.value as string] ?? '#ccc',
        fontFamily: 'IBM Plex Mono',
        fontWeight: '600',
      }),
    },
    {
      headerName: 'Actor',
      width: 200,
      valueGetter: p => (p.data ? actorDisplay(p.data.actor) : ''),
      tooltipValueGetter: p => p.data?.actor?.email ?? '',
      cellStyle: { color: '#fff', fontFamily: 'IBM Plex Mono' },
    },
    {
      headerName: 'Entity',
      width: 230,
      valueGetter: p => {
        const e = p.data?.entity;
        if (!e) return '';
        return e.label ? `${e.type} / ${e.label}` : `${e.type} #${e.id}`;
      },
      cellStyle: { color: '#ccc', fontFamily: 'IBM Plex Mono' },
    },
    {
      headerName: 'Context',
      width: 180,
      valueGetter: p => {
        const ctx = p.data?.context;
        if (!ctx) return '';
        if (ctx.lp_name)         return `LP: ${ctx.lp_name}`;
        if (ctx.hedge_rule_name) return ctx.hedge_rule_name;
        if (ctx.price_rule_name) return ctx.price_rule_name;
        if (ctx.mt5_node_name)   return ctx.mt5_node_name;
        return '';
      },
      cellStyle: { color: '#777', fontFamily: 'IBM Plex Mono' },
    },
    {
      field: 'source_service',
      headerName: 'Service',
      width: 108,
      valueFormatter: p => serviceDisplay(p.value as string ?? ''),
      cellStyle: { color: '#555', fontFamily: 'IBM Plex Mono' },
    },
    {
      field: 'notes',
      headerName: 'Notes',
      flex: 1,
      minWidth: 100,
      cellStyle: { color: '#888', fontFamily: 'IBM Plex Mono' },
    },
  ], [categories]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
    filter: false,
  }), []);

  const gridOptions = useMemo<GridOptions<AuditLogEntry>>(() => ({
    suppressContextMenu: true,
    enableRangeSelection: false,
  }), []);

  const rowSelection = useMemo<RowSelectionOptions>(() => ({
    mode: 'singleRow',
    enableClickSelection: true,
  }), []);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    e.api.sizeColumnsToFit();
  }, []);

  const onRowClicked = useCallback((e: RowClickedEvent<AuditLogEntry>) => {
    if (!e.data) return;
    setSelectedEntry(prev => (prev?.id === e.data!.id ? null : e.data!));
  }, []);

  // ── Select Input Shared Classes ────────────────────────────
  const selectCls = 'bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]';
  const inputCls  = `${selectCls} placeholder-[#555]`;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>

      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Audit Log</h1>
          <p className="text-xs text-[#999]">Complete record of all platform write operations — who did what, where and when</p>
        </div>

        {/* Pagination + refresh */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {total > 0 && (
            <>
              <span className="text-[#888]">
                <span className="text-white">{(offset + 1).toLocaleString()}–{Math.min(offset + LIMIT, total).toLocaleString()}</span>
                <span className="text-[#555]"> of </span>
                <span className="text-white">{total.toLocaleString()}</span>
              </span>
              <div className="w-px h-4 bg-[#505050]" />
              <span className="text-[#888]">
                page <span className="text-white">{currentPage}</span>
                <span className="text-[#555]"> / </span>
                <span className="text-white">{totalPages}</span>
              </span>
              <div className="w-px h-4 bg-[#505050]" />
            </>
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0 || loading}
              className="px-2 py-1 bg-[#232225] border border-[#505050] rounded text-[11px] text-white disabled:opacity-30 hover:border-[#4ecdc4] transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setOffset(offset + LIMIT)}
              disabled={offset + LIMIT >= total || loading}
              className="px-2 py-1 bg-[#232225] border border-[#505050] rounded text-[11px] text-white disabled:opacity-30 hover:border-[#4ecdc4] transition-colors"
            >
              Next →
            </button>
          </div>
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="text-[#666] hover:text-white transition-colors text-sm"
            title="Refresh"
          >
            {loading ? <span className="text-[10px]">…</span> : '↻'}
          </button>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-2 bg-[#3a1f1f] border-b border-[#ff6b6b] text-xs text-[#ff6b6b] flex items-center justify-between flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => fetchLogs()} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* ── Filter Bar ───────────────────────────────────────── */}
      <div
        className="px-4 py-2 border-b border-[#505050] flex flex-wrap items-center gap-2 flex-shrink-0"
        style={{ backgroundColor: '#2a292c' }}
      >
        <span className="text-[10px] text-[#555] uppercase tracking-widest font-medium">Filters</span>

        {/* Category — fetched from /audit/categories */}
        <select
          value={filterCategory}
          onChange={e => applyDropdown('category', e.target.value, setFilterCategory)}
          className={selectCls}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Action Type */}
        <select
          value={filterActionType}
          onChange={e => applyDropdown('action_type', e.target.value, setFilterActionType)}
          className={selectCls}
        >
          <option value="">All Actions</option>
          {ACTION_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Severity */}
        <select
          value={filterSeverity}
          onChange={e => applyDropdown('severity', e.target.value, setFilterSeverity)}
          className={selectCls}
        >
          <option value="">All Severities</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        {/* Source Service */}
        <select
          value={filterSource}
          onChange={e => applyDropdown('source_service', e.target.value, setFilterSource)}
          className={selectCls}
        >
          <option value="">All Services</option>
          <option value="nexrisk_service">NexRisk</option>
          <option value="fix_bridge">FIX Bridge</option>
        </select>

        {/* Actor Email — text input, applied on Search click */}
        <input
          type="text"
          value={filterActorEmail}
          onChange={e => setFilterActorEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Actor email"
          className={clsx(inputCls, 'w-[170px]')}
        />

        {/* Entity Type — text input */}
        <input
          type="text"
          value={filterEntityType}
          onChange={e => setFilterEntityType(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Entity type"
          className={clsx(inputCls, 'w-[130px]')}
        />

        {/* From */}
        <input
          type="datetime-local"
          value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)}
          className={clsx(inputCls, '[color-scheme:dark]')}
          title="From date"
        />

        {/* To */}
        <input
          type="datetime-local"
          value={filterTo}
          onChange={e => setFilterTo(e.target.value)}
          className={clsx(inputCls, '[color-scheme:dark]')}
          title="To date"
        />

        {/* Search — applies text / date filters */}
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-1 bg-[#2e3c3e] border border-[#4ecdc4] rounded text-xs text-[#4ecdc4] hover:bg-[#3a4c4e] transition-colors disabled:opacity-50"
        >
          Search
        </button>

        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-xs text-[#888] hover:text-white transition-colors"
          >
            ✕ Clear
          </button>
        )}

        {hasFilters && total > 0 && (
          <span className="text-[10px] text-[#4ecdc4] font-mono ml-auto">
            {total.toLocaleString()} result{total !== 1 ? 's' : ''} matching filters
          </span>
        )}
      </div>

      {/* ── Loading Overlay (initial) ────────────────────────── */}
      {loading && entries.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[#888] text-sm">
          <span className="font-mono">Loading audit log…</span>
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────── */}
      {!loading && !error && entries.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <p className="text-[#888] text-sm">No audit events found</p>
          <p className="text-[#555] text-xs">
            {hasFilters
              ? 'Try adjusting or clearing your filters.'
              : 'No events have been recorded yet.'}
          </p>
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="flex-1 min-h-0">
          <AgGridReact<AuditLogEntry>
            ref={gridRef}
            theme={gridTheme}
            rowData={entries}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            gridOptions={gridOptions}
            rowHeight={26}
            headerHeight={36}
            getRowId={p => String(p.data.id)}
            rowSelection={rowSelection}
            onRowClicked={onRowClicked}
            onGridReady={onGridReady}
            getRowStyle={p => ({
              backgroundColor: selectedEntry?.id === p.data?.id ? '#302c38' : undefined,
              cursor: 'pointer',
            })}
          />
        </div>
      )}

      {/* ── Detail Panel ─────────────────────────────────────── */}
      {selectedEntry && (
        <DetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}

export default AuditLogPage;