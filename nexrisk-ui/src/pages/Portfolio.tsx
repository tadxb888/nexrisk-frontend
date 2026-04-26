// ============================================
// Portfolio Page
// Title-bar summary cards (B-Book / A-Book / C-Book / Cost) + tree-style table.
// MTD / YTD Realized P&L Area Chart below table.
//
// Card data comes from PortfolioStatsContext (WS-driven, no polling).
// The Provider opens its own MT5 / FIX subscriptions independently of
// CBookPage so this page works without any CBookPage changes.
//
// Table / chart still wired to:
//   GET /api/v1/portfolio/summary?period=
//   GET /api/v1/portfolio/pnl-history?from=&to=
// (Main-page rework is a follow-up.)
// ============================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import type { ColDef, GridReadyEvent, ValueFormatterParams, GridOptions, IHeaderParams } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';

import {
  usePortfolioStats,
  fmtHdrMoney,
  fmtHdrCompact,
  pnlColor,
} from '@/stores/PortfolioStatsContext';

// ======================
// THEME BASE CONFIG
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: "#232326",
  browserColorScheme: "dark",
  chromeBackgroundColor: { ref: "foregroundColor", mix: 0.11, onto: "backgroundColor" },
  fontFamily: { googleFont: "IBM Plex Mono" },
  fontSize: 12,
  foregroundColor: "#FFF",
  headerFontSize: 14,
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

interface SummaryResponse {
  period: string;
  from: string;
  to: string;
  bbook_available: boolean;
  rows: PortfolioRow[];
}

interface PnlPoint {
  date: string;
  daily_pnl: number;
  cumulative_pnl: number;
  bbook: number;
  a_book: number;
  c_book: number;
}

interface PnlHistoryResponse {
  from: string;
  to: string;
  note: string;
  points: PnlPoint[];
}

// ======================
// HELPERS
// ======================

/**
 * CRITICAL: null means data unavailable → render as '—'
 *           0.0 means real zero      → render as '$ 0.00'
 * These are NOT the same.
 */
function currencyFormatter(params: ValueFormatterParams): string {
  if (params.value === null || params.value === undefined) return '—';
  const val = params.value as number;
  const absVal = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `-$ ${absVal}` : `$ ${absVal}`;
}

function getPnlColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return '#606060';
  if (value > 0) return '#66e07a';
  if (value < 0) return '#ff5c5c';
  return '#999';
}

function formatYAxisTick(value: number): string {
  if (value === 0) return '$0';
  const absVal = Math.abs(value);
  if (absVal >= 1_000_000) return `${value < 0 ? '-' : ''}$${(absVal / 1_000_000).toFixed(1)}M`;
  if (absVal >= 1_000)     return `${value < 0 ? '-' : ''}$${(absVal / 1_000).toFixed(0)}K`;
  return `${value < 0 ? '-' : ''}$${absVal.toFixed(0)}`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

// ======================
// B-BOOK HEADER COMPONENT
// ======================
function BBookHeader({ displayName, bbookAvailable }: IHeaderParams & { bbookAvailable: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>{displayName}</span>
      {!bbookAvailable && (
        <span style={{
          backgroundColor: '#450a0a',
          color: '#fca5a5',
          fontSize: '9px',
          padding: '1px 5px',
          borderRadius: '2px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          border: '1px solid #7f1d1d',
          whiteSpace: 'nowrap',
        }}>
          MT5 DISCONNECTED
        </span>
      )}
    </div>
  );
}

// ======================
// CHART COMPONENT
// ======================
function PnlChart({
  collapsed,
  onToggle,
  height,
  onResize,
  points,
  note,
  fromLabel,
  toLabel,
  chartPeriod,
  onChartPeriodChange,
  loading,
}: {
  collapsed: boolean;
  onToggle: () => void;
  height: number;
  onResize: (h: number) => void;
  points: PnlPoint[];
  note: string;
  fromLabel: string;
  toLabel: string;
  chartPeriod: 'mtd' | 'ytd';
  onChartPeriodChange: (p: 'mtd' | 'ytd') => void;
  loading: boolean;
}) {
  // Zero-split gradient positioning
  const values = points.map(p => p.cumulative_pnl);
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const range = dataMax - dataMin;
  const zeroPosition = range > 0 ? Math.max(0, Math.min(1, dataMax / range)) : 0.5;

  const isEmpty = points.length === 0;

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
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.max(200, Math.min(600, startHeightRef.current + deltaY));
      onResize(newHeight);
    };
    const handleMouseUp = () => setIsResizing(false);
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
      style={{ backgroundColor: '#232326', height: collapsed ? 44 : height }}
    >
      {/* Resize Handle */}
      {!collapsed && (
        <div
          className="h-[6px] cursor-ns-resize flex items-center justify-center group hover:bg-[#49b3b3]/20 transition-colors"
          onMouseDown={handleMouseDown}
          style={{ backgroundColor: isResizing ? 'rgba(78,205,196,0.2)' : 'transparent' }}
        >
          <div
            className="w-12 h-[3px] rounded-full transition-colors"
            style={{ backgroundColor: isResizing ? '#49b3b3' : '#606060' }}
          />
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[#3a3a3c]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Portfolio Performance</span>
            <span className="text-[10px] text-[#808080]">
              {fromLabel && toLabel
                ? `${fromLabel} — ${toLabel}`
                : 'Cumulative realized P&L'
              }
            </span>
          </div>

          {/* MTD / YTD Period Selector — stop click propagation so header toggle isn't triggered */}
          {!collapsed && (
            <div
              className="flex gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {(['mtd', 'ytd'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => onChartPeriodChange(p)}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: chartPeriod === p ? '#49b3b3' : '#3a3a3c',
                    color: chartPeriod === p ? '#000' : '#ccc',
                    border: `1px solid ${chartPeriod === p ? '#49b3b3' : '#606060'}`,
                  }}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[#49b3b3]">{collapsed ? '▶' : '▼'}</span>
      </div>

      {/* Chart Body */}
      {!collapsed && (
        <div className="flex-1 px-4 pb-4 min-h-0 relative">

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10"
              style={{ backgroundColor: 'rgba(35,35,38,0.7)' }}>
              <span className="text-[#49b3b3] text-xs">Loading chart data...</span>
            </div>
          )}

          {/* Empty state */}
          {!loading && isEmpty ? (
            <div className="h-full flex items-center justify-center flex-col gap-2">
              <span className="text-[#606060] text-sm">No data available</span>
              {note && <span className="text-[#808080] text-xs max-w-sm text-center">{note}</span>}
            </div>
          ) : (
            <div className="h-full rounded-lg p-3" style={{ backgroundColor: '#232326' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={points}
                  margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="splitColorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                      <stop offset={`${Math.max(0, zeroPosition - 0.05) * 100}%`} stopColor="#4ade80" stopOpacity={0.6} />
                      <stop offset={`${zeroPosition * 100}%`} stopColor="#86efac" stopOpacity={0.2} />
                      <stop offset={`${zeroPosition * 100}%`} stopColor="#fca5a5" stopOpacity={0.2} />
                      <stop offset={`${Math.min(1, zeroPosition + 0.05) * 100}%`} stopColor="#f87171" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="strokeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset={`${zeroPosition * 100}%`} stopColor="#a3a3a3" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#404040" vertical={false} />

                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#808080', fontSize: 10 }}
                    axisLine={{ stroke: '#404040' }}
                    tickLine={false}
                    tickFormatter={(value) => {
                      const d = new Date(value + 'T00:00:00');
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    interval="preserveStartEnd"
                  />

                  <YAxis
                    tick={{ fill: '#808080', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatYAxisTick}
                    domain={['dataMin - 50', 'dataMax + 50']}
                    width={65}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1c',
                      border: '1px solid #404040',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 500 }}
                    formatter={(value: number) => [
                      <span style={{ color: value >= 0 ? '#66e07a' : '#ff5c5c' }}>
                        {value >= 0 ? '+' : ''}{formatYAxisTick(value)}
                      </span>,
                      'Cumulative P&L',
                    ]}
                    labelFormatter={(label) =>
                      new Date(label + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })
                    }
                  />

                  {/* Zero reference line */}
                  <ReferenceLine y={0} stroke="#ffffff" strokeWidth={2} />

                  <Area
                    type="monotone"
                    dataKey="cumulative_pnl"
                    stroke="url(#strokeGradient)"
                    strokeWidth={2}
                    fill="url(#splitColorGradient)"
                    baseValue={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ======================
// MAIN COMPONENT
// ======================
export function PortfolioPage() {
  const gridRef = useRef<AgGridReact<PortfolioRow>>(null);

  // Table state — period now defaults to 'month' (per user spec)
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'month'>('month');
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [bbookAvailable, setBbookAvailable] = useState(true);
  const [summaryFrom, setSummaryFrom] = useState('');
  const [summaryTo, setSummaryTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Grid state — zoom slider removed per user spec
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['pnl', 'revenue']));

  // Chart state
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [chartHeight, setChartHeight] = useState(360);
  const [chartPeriod, setChartPeriod] = useState<'mtd' | 'ytd'>('mtd');
  const [chartPoints, setChartPoints] = useState<PnlPoint[]>([]);
  const [chartNote, setChartNote] = useState('');
  const [chartFrom, setChartFrom] = useState('');
  const [chartTo, setChartTo] = useState('');
  const [chartLoading, setChartLoading] = useState(false);

  // ── Title-bar summary cards ───────────────────────────────────
  // All four cards read from PortfolioStatsContext (mounted in Layout).
  // The Provider opens its own MT5 / FIX subscriptions independently of
  // CBookPage, so this page works without any CBookPage modifications.
  // B-Book is live today; A-Book / C-Book / Cost are placeholders inside
  // the context — they go live for free here once the context wires them.
  const { bbook, abook, cbook, cost } = usePortfolioStats();

  // ── Fetch summary ──────────────────────────────────────────────
  const fetchSummary = useCallback(async (period: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/portfolio/summary?period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const data: SummaryResponse = await res.json();
      setRows(data.rows ?? []);
      setBbookAvailable(data.bbook_available ?? true);
      setSummaryFrom(data.from ?? '');
      setSummaryTo(data.to ?? '');
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch pnl-history ──────────────────────────────────────────
  const fetchPnlHistory = useCallback(async (from?: string, to?: string) => {
    setChartLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      const res = await fetch(`/api/v1/portfolio/pnl-history?${params}`);
      if (!res.ok) return;
      const data: PnlHistoryResponse = await res.json();
      setChartPoints(data.points ?? []);
      setChartNote(data.note ?? '');
      setChartFrom(data.from ?? '');
      setChartTo(data.to ?? '');
    } catch {
      // Chart errors are non-fatal; leave existing data in place
    } finally {
      setChartLoading(false);
    }
  }, []);

  // ── Initial load + timePeriod changes ─────────────────────────
  useEffect(() => {
    fetchSummary(timePeriod);
  }, [timePeriod, fetchSummary]);

  // ── Auto-refresh every 30 s (floating P&L moves with market) ──
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSummary(timePeriod);
    }, 30_000);
    return () => clearInterval(interval);
  }, [timePeriod, fetchSummary]);

  // ── Chart period changes ───────────────────────────────────────
  useEffect(() => {
    if (chartPeriod === 'mtd') {
      fetchPnlHistory(); // backend defaults to MTD
    } else {
      fetchPnlHistory(yearStart(), today());
    }
  }, [chartPeriod, fetchPnlHistory]);

  // ── Group toggle ──────────────────────────────────────────────
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Build flat display rows from API response ─────────────────
  const displayData = useMemo(() => {
    const result: PortfolioRow[] = [];
    for (const row of rows) {
      const isGroup = !!(row.children && row.children.length > 0);
      const isExpanded = isGroup && expandedGroups.has(row.id);
      result.push({ ...row, isGroup, expanded: isExpanded });
      if (isExpanded && row.children) {
        for (const child of row.children) {
          result.push({ ...child, isChild: true });
        }
      }
    }
    return result;
  }, [rows, expandedGroups]);

  // ── Last-updated label ────────────────────────────────────────
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return '';
    const s = Math.round((Date.now() - lastUpdated.getTime()) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }, [lastUpdated]);

  // ── Chart date labels ─────────────────────────────────────────
  const chartFromLabel = chartFrom
    ? new Date(chartFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const chartToLabel = chartTo
    ? new Date(chartTo + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // ── Column definitions ────────────────────────────────────────
  const columnDefs = useMemo<ColDef<PortfolioRow>[]>(() => [
    {
      field: 'metric',
      headerName: 'Metric',
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
                color: '#49b3b3',
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                display: 'inline-block',
              }}>
                ▶
              </span>
              <span style={{ color: '#FFF' }}>{params.value}</span>
            </div>
          );
        }
        return (
          <span style={{
            color: row.isChild ? '#aaa' : '#FFF',
            paddingLeft: row.isChild ? '20px' : '0',
          }}>
            {row.isChild ? `-- ${params.value}` : params.value}
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
      minWidth: 160,
      flex: 1,
      type: 'rightAligned',
      valueFormatter: currencyFormatter,
      cellStyle: (params) => ({ color: getPnlColor(params.value) }),
      // Custom header shows MT5 Disconnected badge when bbook_available is false
      headerComponent: BBookHeader,
      headerComponentParams: { bbookAvailable },
    },
    {
      field: 'cBook',
      headerName: 'Coverage Book',   // renamed from "C Book" per API brief
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
        fontWeight: 500,
      }),
    },
  ], [expandedGroups, toggleGroup, bbookAvailable]);

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

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#232326' }}>

      {/* ── Row 1: Title + book summary cards ───────────────────────────────
          Mirrors CBookPage Row 1 (cards strip). Cards share the same teal
          accent (`#49b3b3`) and cell pattern (label uppercase / value mono).
            • B-Book — live via mt5.position WS (this file).
            • A-Book — pending shared FIX hook / aggregate endpoint.
            • C-Book — pending shared FIX hook / aggregate endpoint.
            • Cost   — pending Commissions+Swaps+Fees endpoint.
          P&L cells render `—` when the source isn't wired yet (pnlColor
          handles the null case as a muted grey). */}
      <div className="px-4 py-1.5 border-b border-[#808080] flex items-center justify-between gap-2 flex-wrap flex-shrink-0" style={{ backgroundColor: '#1e1e20' }}>

        <div className="flex-shrink-0">
          <h1 className="text-sm font-semibold text-white leading-tight">Portfolio</h1>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">

          {/* ── B-Book card ─────────────────────────────────────────────── */}
          <div
            className="inline-flex items-stretch gap-2 rounded px-2 py-1"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #49b3b344',
              borderLeft: '3px solid #49b3b3',
            }}
            title="B-Book: Internalized flow held against the house."
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">B-Book</div>
              <div className="text-xs font-mono text-white">{bbook.positions ?? 0} pos</div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Long / Short</div>
              <div className="text-xs font-mono">
                <span style={{ color: '#49b3b3' }}>{bbook.buys ?? 0}</span>
                <span className="text-[#505050]"> / </span>
                <span style={{ color: '#e0a020' }}>{bbook.sells ?? 0}</span>
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Volume</div>
              <div className="text-xs font-mono text-white">
                {bbook.volume != null ? fmtHdrCompact(bbook.volume) : '—'}
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Unrealized P/L</div>
              {bbook.unrealized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(bbook.unrealized) }}>
                  {fmtHdrMoney(bbook.unrealized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Realized P/L</div>
              {bbook.realized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(bbook.realized) }}>
                  {fmtHdrMoney(bbook.realized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
          </div>

          {/* ── A-Book card ─────────────────────────────────────────────── */}
          <div
            className="inline-flex items-stretch gap-2 rounded px-2 py-1"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #49b3b344',
              borderLeft: '3px solid #49b3b3',
            }}
            title="A-Book: positions opened by hedging strategies (automated execution)."
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">A-Book</div>
              <div className="text-xs font-mono text-white">{abook.positions ?? 0} pos</div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Long / Short</div>
              <div className="text-xs font-mono">
                <span style={{ color: '#49b3b3' }}>{abook.buys ?? 0}</span>
                <span className="text-[#505050]"> / </span>
                <span style={{ color: '#e0a020' }}>{abook.sells ?? 0}</span>
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Volume</div>
              <div className="text-xs font-mono text-white">
                {abook.volume != null ? fmtHdrCompact(abook.volume) : '—'}
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Unrealized P/L</div>
              {abook.unrealized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(abook.unrealized) }}>
                  {fmtHdrMoney(abook.unrealized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Realized P/L</div>
              {abook.realized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(abook.realized) }}>
                  {fmtHdrMoney(abook.realized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
          </div>

          {/* ── C-Book card ─────────────────────────────────────────────── */}
          <div
            className="inline-flex items-stretch gap-2 rounded px-2 py-1"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #49b3b344',
              borderLeft: '3px solid #49b3b3',
            }}
            title="C-Book: positions executed manually via Terminal or DOM Trader."
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">C-Book</div>
              <div className="text-xs font-mono text-white">{cbook.positions ?? 0} pos</div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Long / Short</div>
              <div className="text-xs font-mono">
                <span style={{ color: '#49b3b3' }}>{cbook.buys ?? 0}</span>
                <span className="text-[#505050]"> / </span>
                <span style={{ color: '#e0a020' }}>{cbook.sells ?? 0}</span>
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Volume</div>
              <div className="text-xs font-mono text-white">
                {cbook.volume != null ? fmtHdrCompact(cbook.volume) : '—'}
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Unrealized P/L</div>
              {cbook.unrealized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cbook.unrealized) }}>
                  {fmtHdrMoney(cbook.unrealized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Realized P/L</div>
              {cbook.realized != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cbook.realized) }}>
                  {fmtHdrMoney(cbook.realized)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
          </div>

          {/* ── Cost card ────────────────────────────────────────────────
              Different shape from the book cards — leftmost cell shows the
              headline NET (Commissions + Swaps + Fees, earned − charged)
              with the three category breakdowns to the right. Four cells
              instead of five so the card reads visually as a different kind
              of summary. All values colour-coded with pnlColor (positive =
              revenue, negative = expense). */}
          <div
            className="inline-flex items-stretch gap-2 rounded px-2 py-1"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #49b3b344',
              borderLeft: '3px solid #49b3b3',
            }}
            title="Cost: Commissions + Swaps + Fees, earned by broker − charged to broker."
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Cost</div>
              {cost.net != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cost.net) }}>
                  {fmtHdrMoney(cost.net)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Commissions</div>
              {cost.commissions != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cost.commissions) }}>
                  {fmtHdrMoney(cost.commissions)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Swaps</div>
              {cost.swaps != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cost.swaps) }}>
                  {fmtHdrMoney(cost.swaps)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white mb-0.5">Fees</div>
              {cost.fees != null ? (
                <div className="text-xs font-mono" style={{ color: pnlColor(cost.fees) }}>
                  {fmtHdrMoney(cost.fees)}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Row 2: Period selector ──────────────────────────────────────────
          Refresh and Zoom controls dropped per user spec — page is
          WebSocket-only (no manual refresh) and the global zoom is no
          longer surfaced here. The lastUpdated indicator stays as
          informational text driven off the existing summary fetch. */}
      <div className="px-4 py-1.5 border-b border-[#444] flex items-center gap-4 flex-shrink-0 text-xs" style={{ backgroundColor: '#252527' }}>
        <div className="flex items-center gap-2">
          <span className="text-[#aaa]">Period:</span>
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as 'today' | 'week' | 'month')}
            className="bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        {lastUpdatedLabel && (
          <span className="text-[#606060] ml-auto">Updated {lastUpdatedLabel}</span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 text-xs" style={{ backgroundColor: '#450a0a', color: '#fca5a5', borderBottom: '1px solid #7f1d1d' }}>
          Failed to load portfolio data: {error}
        </div>
      )}

      {/* Summary date range */}
      {summaryFrom && summaryTo && (
        <div className="px-4 py-1 text-[11px] text-[#606060] border-b border-[#3a3a3c]">
          Period: {new Date(summaryFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
          {' '}&mdash;{' '}
          {new Date(summaryTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
        </div>
      )}

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
            headerHeight={36}
            rowHeight={26}
            getRowId={(params) => params.data.id}
            loading={loading && rows.length === 0}
          />
        </div>
      </div>

      {/* P&L Chart */}
      <PnlChart
        collapsed={chartCollapsed}
        onToggle={() => setChartCollapsed(!chartCollapsed)}
        height={chartHeight}
        onResize={setChartHeight}
        points={chartPoints}
        note={chartNote}
        fromLabel={chartFromLabel}
        toLabel={chartToLabel}
        chartPeriod={chartPeriod}
        onChartPeriodChange={setChartPeriod}
        loading={chartLoading}
      />
    </div>
  );
}

export default PortfolioPage;