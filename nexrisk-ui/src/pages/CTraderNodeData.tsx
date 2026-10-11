// ============================================================
// cTrader node data — groups, symbols, traders, open positions
// NexRisk_cTrader_Node_Data_API v1.0
//
// What a connected cTrader node has loaded from its server. The lists are a
// SNAPSHOT: loaded after every login and when Refresh is pressed, and they do
// not change in between. Every list says when it was loaded, and whether what
// is shown is stale or possibly incomplete — the header line of each tab
// states it, so a list is never taken for more current or more complete than
// it is.
//
// Nothing is polled. A list is read when its tab opens, when its filters
// change, and when the node announces the end of a load (NODE_DATA_SYNC on
// topic ctrader.node_status — the page passes that on as `syncTick`).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CTraderApiError,
  ctraderDataApi,
  type CTraderGroup,
  type CTraderListAnswer,
  type CTraderNodeData,
  type CTraderPosition,
  type CTraderSymbol,
  type CTraderTrader,
} from '@/services/api';

const RED    = '#ff5c5c';
const GREEN  = '#66e07a';
const YELLOW = '#e0d066';
const PAGE   = 200;

type Tab = 'positions' | 'traders' | 'symbols' | 'groups';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'positions', label: 'Positions' },
  { id: 'traders',   label: 'Traders' },
  { id: 'symbols',   label: 'Symbols' },
  { id: 'groups',    label: 'Groups' },
];

export interface CTraderDataNode {
  id: number;
  node_name: string;
  connection_status: string;
  data: CTraderNodeData | null;
}

// ── Formatting ───────────────────────────────────────────────
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function fmtLoaded(ms: number): string {
  if (!ms) return 'never';
  const d = new Date(ms);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return sameDay(d, new Date()) ? time : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${time}`;
}

function fmtSeconds(sec: number): string {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Prices as quoted, without binary floating-point noise (1.0877000000000001).
const fmtPrice = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : String(Number(v.toFixed(8)));

const fmtInt = (v: number) => v.toLocaleString('en-US');

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

// ── Small pieces ─────────────────────────────────────────────
function Pill({ color, bg, border, children }: { color: string; bg: string; border: string; children: ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
      style={{ fontSize: 11, color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'warn' | 'info'; children: ReactNode }) {
  const cfg = {
    error: [RED, '#2c1417', '#7a2f36'],
    warn:  [YELLOW, '#28220a', '#6a6530'],
    info:  ['#a5c8f0', '#0f1e35', '#1e4270'],
  }[tone];
  return (
    <div className="px-3 py-2 rounded text-xs leading-relaxed"
      style={{ backgroundColor: cfg[1], border: `1px solid ${cfg[2]}`, color: cfg[0], overflowWrap: 'anywhere' }}>
      {children}
    </div>
  );
}

interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'right';
  mono?: boolean;
  /** Title attribute for the cell (long text). */
  title?: (row: T) => string;
}

function DataTable<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number }) {
  return (
    <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header}
              className="text-text-secondary font-medium whitespace-nowrap"
              style={{
                position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#1a1a1c',
                textAlign: c.align ?? 'left', padding: '7px 10px', borderBottom: '1px solid #44454f',
              }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="hover:bg-surface-hover" style={{ borderBottom: '1px solid #323340' }}>
            {columns.map((c) => (
              <td key={c.header}
                className={`${c.mono ? 'font-mono ' : ''}text-text-primary whitespace-nowrap`}
                title={c.title?.(row)}
                style={{ textAlign: c.align ?? 'left', padding: '5px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Columns ──────────────────────────────────────────────────
const sideColor = (action: string) => (action === 'BUY' ? GREEN : RED);

const POSITION_COLUMNS: Column<CTraderPosition>[] = [
  { header: 'Position', mono: true, cell: (p) => p.position_id },
  { header: 'Login', mono: true, cell: (p) => (p.login === null ? <span title="No account is held for this position's trader id">—</span> : p.login) },
  { header: 'Group', cell: (p) => p.group || '—', title: (p) => p.group },
  { header: 'Symbol', mono: true, cell: (p) => p.symbol || `#${p.symbol_id}` },
  { header: 'Side', mono: true, cell: (p) => <span style={{ color: sideColor(p.action) }}>{p.action}</span> },
  { header: 'Lots', mono: true, align: 'right', cell: (p) => fmtQty(p.volume_lots) },
  { header: 'Units', mono: true, align: 'right', cell: (p) => fmtQty(p.volume, 0) },
  { header: 'Open price', mono: true, align: 'right', cell: (p) => fmtPrice(p.price_open) },
  { header: 'Current', mono: true, align: 'right', cell: (p) => fmtPrice(p.price_current) },
  { header: 'S/L', mono: true, align: 'right', cell: (p) => fmtPrice(p.price_sl) },
  { header: 'T/P', mono: true, align: 'right', cell: (p) => fmtPrice(p.price_tp) },
  { header: 'Profit', mono: true, align: 'right', cell: (p) => fmtMoney(p.profit) },
  { header: 'Swap', mono: true, align: 'right', cell: (p) => fmtMoney(p.swap) },
  { header: 'Commission', mono: true, align: 'right', cell: (p) => fmtMoney(p.commission) },
  { header: 'Margin', mono: true, align: 'right', cell: (p) => fmtMoney(p.used_margin) },
  { header: 'Ccy', mono: true, cell: (p) => p.currency || '—' },
  {
    header: 'Book', mono: true,
    cell: (p) => (p.book === 'B'
      ? <Pill color="#f0d0a5" bg="#2a1f0f" border="#5a4020">B</Pill>
      : <Pill color="#a5c8f0" bg="#0f2035" border="#1e4270">A</Pill>),
  },
  { header: 'Opened', mono: true, cell: (p) => fmtSeconds(p.time_create) },
];

const TRADER_COLUMNS: Column<CTraderTrader>[] = [
  { header: 'Login', mono: true, cell: (t) => t.login },
  { header: 'Name', cell: (t) => t.name || '—', title: (t) => t.name },
  { header: 'E-mail', cell: (t) => t.email || '—', title: (t) => t.email },
  { header: 'Group', cell: (t) => t.group || `#${t.group_id}`, title: (t) => t.group },
  { header: 'Balance', mono: true, align: 'right', cell: (t) => fmtMoney(t.balance) },
  { header: 'Ccy', mono: true, cell: (t) => t.currency || '—' },
  { header: 'Leverage', mono: true, align: 'right', cell: (t) => (t.leverage > 0 ? `1:${t.leverage}` : '—') },
  { header: 'Account', mono: true, cell: (t) => t.account_type },
  { header: 'Access', mono: true, cell: (t) => (t.access_rights === 'FULL_ACCESS' ? t.access_rights : <span style={{ color: YELLOW }}>{t.access_rights}</span>) },
  { header: 'Swap-free', cell: (t) => yesNo(t.swap_free) },
  { header: 'White label', cell: (t) => t.broker_name || '—' },
  { header: 'Registered', mono: true, cell: (t) => fmtSeconds(t.registration) },
];

const SYMBOL_COLUMNS: Column<CTraderSymbol>[] = [
  { header: 'Symbol', mono: true, cell: (s) => s.symbol },
  { header: 'Id', mono: true, align: 'right', cell: (s) => s.symbol_id },
  { header: 'Description', cell: (s) => s.description || '—', title: (s) => s.description },
  { header: 'Digits', mono: true, align: 'right', cell: (s) => s.digits },
  { header: 'Pip', mono: true, align: 'right', cell: (s) => s.pip_position },
  { header: 'Contract size', mono: true, align: 'right', cell: (s) => fmtQty(s.contract_size, 0) },
  { header: 'Base', mono: true, cell: (s) => s.currency_base || '—' },
  { header: 'Profit ccy', mono: true, cell: (s) => s.currency_profit || '—' },
  { header: 'Visible', cell: (s) => yesNo(s.enabled) },
  { header: 'Trading', mono: true, cell: (s) => (s.trading_mode === 'ENABLED' ? s.trading_mode : <span style={{ color: YELLOW }}>{s.trading_mode}</span>) },
];

const GROUP_COLUMNS: Column<CTraderGroup>[] = [
  { header: 'Group', cell: (g) => g.group, title: (g) => g.group },
  { header: 'Id', mono: true, align: 'right', cell: (g) => g.group_id },
  { header: 'Description', cell: (g) => g.description || '—', title: (g) => g.description },
  { header: 'Logins allowed', cell: (g) => yesNo(g.enabled) },
  { header: 'Manager has access', cell: (g) => (g.has_access ? 'Yes' : <span style={{ color: YELLOW }}>No</span>) },
  { header: 'Dealing desk', cell: (g) => yesNo(g.is_dealing_desk) },
  { header: 'Stop-out', mono: true, align: 'right', cell: (g) => (g.margin_stopout === null ? '—' : `${g.margin_stopout}%`) },
];

// ── The freshness line of a list ─────────────────────────────
function ListStatus({ answer, connected }: { answer: CTraderListAnswer; connected: boolean }) {
  const notes: ReactNode[] = [];

  if (answer.state === 'FAILED') {
    notes.push(
      <Banner key="failed" tone="error">
        The last load of this list failed: <span className="font-mono">{answer.error_code || 'UNKNOWN_ERROR'}</span>
        {answer.error ? ` — ${answer.error}` : ''}.
        {answer.error_code === 'NOT_ENOUGH_RIGHTS' && ' The manager login this node uses lacks a permission on cTrader.'}
        {answer.total > 0 && ` The rows shown are from the last good load, ${fmtLoaded(answer.synced_at_ms)}.`}
      </Banner>,
    );
  } else if (answer.state === 'INCOMPLETE') {
    notes.push(
      <Banner key="incomplete" tone="warn">
        This list may be missing records{answer.error ? `: ${answer.error}` : ''}. It needs a look by support.
      </Banner>,
    );
  } else if (answer.stale) {
    notes.push(
      <Banner key="stale" tone="warn">
        Data from {fmtLoaded(answer.synced_at_ms)}. {connected ? 'It has not been reloaded since the node reconnected.' : 'The node is not connected; it reloads by itself after the next login.'}
      </Banner>,
    );
  }

  if (answer.feed_state === 'DEFERRED') {
    notes.push(<Banner key="deferred" tone="warn">Loading is postponed after repeated connection losses. Press Refresh to load now.</Banner>);
  }
  if (answer.state === 'NOT_LOADED') {
    notes.push(
      <Banner key="notloaded" tone="info">
        {answer.feed_state === 'SYNCING' ? 'Loading from cTrader…' : 'This list has not been loaded since the node was started.'}
      </Banner>,
    );
  }
  return notes.length ? <div className="space-y-2">{notes}</div> : null;
}

// ── One loaded answer, whatever the tab ──────────────────────
type AnyAnswer = CTraderListAnswer & {
  positions?: CTraderPosition[];
  traders?: CTraderTrader[];
  symbols?: CTraderSymbol[];
  groups?: CTraderGroup[];
  total_book_a?: number;
  total_book_b?: number;
  returned?: number;
  offset?: number;
};

interface Query {
  book: '' | 'A' | 'B';
  login: string;
  symbol: string;
  groupId: string;
  archived: boolean;
  offset: number;
}

const EMPTY_QUERY: Query = { book: '', login: '', symbol: '', groupId: '', archived: false, offset: 0 };

function fetchTab(id: number, tab: Tab, q: Query): Promise<AnyAnswer> {
  if (tab === 'positions') {
    return ctraderDataApi.getPositions(id, {
      book: q.book || undefined, login: q.login || undefined, symbol: q.symbol || undefined, limit: PAGE, offset: q.offset,
    });
  }
  if (tab === 'traders') {
    return ctraderDataApi.getTraders(id, {
      login: q.login || undefined, group_id: q.groupId ? Number(q.groupId) : undefined, limit: PAGE, offset: q.offset,
    });
  }
  if (tab === 'symbols') return ctraderDataApi.getSymbols(id, q.archived);
  return ctraderDataApi.getGroups(id);
}

// ============================================================
// MODAL
// ============================================================
export function CTraderNodeDataModal({ node, syncTick, liveOk, onClose }: {
  node: CTraderDataNode;
  /** Goes up when the node announces the end of a data load. */
  syncTick: number;
  /** The live socket is open, so that announcement will arrive. */
  liveOk: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('positions');
  const [queries, setQueries] = useState<Record<Tab, Query>>({
    positions: EMPTY_QUERY, traders: EMPTY_QUERY, symbols: EMPTY_QUERY, groups: EMPTY_QUERY,
  });
  const [answer, setAnswer] = useState<AnyAnswer | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [find, setFind] = useState('');
  const [groups, setGroups] = useState<CTraderGroup[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ tone: 'error' | 'warn' | 'info'; text: string } | null>(null);

  const q = queries[tab];
  const connected = node.connection_status === 'CONNECTED';
  // A node that is stopped drops its data; one that loses its connection keeps
  // its rows but they turn stale. Either way the open list is read again, so
  // its header line is true (the read is answered from the service's memory).
  const started = node.data !== null;
  const setQuery = (patch: Partial<Query>) =>
    setQueries((prev) => ({ ...prev, [tab]: { ...prev[tab], offset: 0, ...patch } }));

  // ── Read the open tab ─────────────────────────────────────
  const requestNo = useRef(0);
  useEffect(() => {
    const mine = ++requestNo.current;
    setLoading(true);
    fetchTab(node.id, tab, q)
      .then((res) => {
        if (mine !== requestNo.current) return;
        setAnswer(res);
        setFailure(null);
      })
      .catch((e: unknown) => {
        if (mine !== requestNo.current) return;
        setAnswer(null);
        setFailure({
          status: e instanceof CTraderApiError ? e.status : 0,
          message: e instanceof Error && e.message ? e.message : 'The list could not be read',
        });
      })
      .finally(() => { if (mine === requestNo.current) setLoading(false); });
  }, [node.id, tab, q, reloadTick, syncTick, started, connected]);

  // Group names for the traders filter: the whole list, read once per load.
  useEffect(() => {
    if (tab !== 'traders') return;
    let cancelled = false;
    ctraderDataApi.getGroups(node.id)
      .then((res) => { if (!cancelled) setGroups(res.groups ?? []); })
      .catch(() => { /* the filter is simply not offered */ });
    return () => { cancelled = true; };
  }, [node.id, tab, syncTick]);

  // ── Refresh from cTrader ──────────────────────────────────
  // The spinner ends on the node's NODE_DATA_SYNC with a final state, or when
  // the node leaves CONNECTED (a load abandoned on a lost connection sends no
  // final event). It has no timeout of its own: a load can take minutes.
  useEffect(() => { setRefreshing(false); }, [syncTick]);
  useEffect(() => { if (!connected) setRefreshing(false); }, [connected]);

  const refresh = useCallback(async () => {
    setRefreshNote(null);
    try {
      const res = await ctraderDataApi.refresh(node.id);
      if (liveOk) {
        setRefreshing(true);
        if (!res.started) setRefreshNote({ tone: 'info', text: 'A data load was already running; waiting for it to finish.' });
      } else {
        setRefreshNote({ tone: 'warn', text: 'Load requested. Live updates are offline, so its end will not be announced here — press Reload list in a few seconds.' });
      }
    } catch (e) {
      const status = e instanceof CTraderApiError ? e.status : 0;
      const message = e instanceof Error && e.message ? e.message : 'The refresh was refused';
      setRefreshNote({
        tone: status === 429 ? 'warn' : 'error',
        text: status === 429 ? 'A load ended less than 3 seconds ago. Try again in a moment.' : message,
      });
    }
  }, [node.id, liveOk]);

  // ── Rows of the open tab ──────────────────────────────────
  const needle = find.trim().toLowerCase();
  const symbols = useMemo(() => {
    const rows = answer?.symbols ?? [];
    return needle ? rows.filter((s) => s.symbol.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)) : rows;
  }, [answer, needle]);
  const groupRows = useMemo(() => {
    const rows = answer?.groups ?? [];
    return needle ? rows.filter((g) => g.group.toLowerCase().includes(needle) || g.description.toLowerCase().includes(needle)) : rows;
  }, [answer, needle]);

  const paged = tab === 'positions' || tab === 'traders';
  const total = answer?.total ?? 0;
  const returned = answer?.returned ?? 0;
  const offset = answer?.offset ?? 0;
  const data = node.data;

  const summary = data
    ? `${fmtInt(data.positions.count)} open position${data.positions.count === 1 ? '' : 's'} (A ${fmtInt(data.positions_book_a)} · B ${fmtInt(data.positions_book_b)}) · ${fmtInt(data.traders.count)} traders · ${fmtInt(data.symbols.count)} symbols · ${fmtInt(data.groups.count)} groups`
    : '';

  const filterInput = (value: string, placeholder: string, onCommit: (v: string) => void, digitsOnly = false, width = 130) => (
    <input
      key={`${tab}-${placeholder}-${value}`}
      className="input text-xs font-mono"
      style={{ width, padding: '4px 8px' }}
      placeholder={placeholder}
      defaultValue={value}
      inputMode={digitsOnly ? 'numeric' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        const v = (e.target as HTMLInputElement).value.trim();
        onCommit(digitsOnly ? v.replace(/\D/g, '').slice(0, 18) : v);
      }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        const next = digitsOnly ? v.replace(/\D/g, '').slice(0, 18) : v;
        if (next !== value) onCommit(next);
      }}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel flex flex-col mx-4" role="dialog" aria-label={`Data of ${node.node_name}`}
        style={{ backgroundColor: '#232225', width: 'min(1500px, calc(100vw - 32px))', height: 'min(860px, 92vh)' }}>

        {/* Title */}
        <div className="panel-header">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-text-primary">{node.node_name} — data loaded from cTrader</span>
            {summary && <div className="text-xs text-text-secondary font-mono truncate">{summary}</div>}
          </div>
          <button onClick={onClose} className="btn-icon text-text-muted hover:text-text-primary" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}><path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z" /></svg>
          </button>
        </div>

        {/* Tabs + refresh */}
        <div className="px-4 pt-3 flex items-center justify-between gap-3 flex-wrap">
          <div role="tablist" className="flex items-center gap-1.5">
            {TABS.map((t) => {
              const on = t.id === tab;
              const count = data ? data[t.id].count : null;
              const bad = data && (data[t.id].state === 'FAILED' || data[t.id].state === 'INCOMPLETE');
              return (
                <button key={t.id} role="tab" aria-selected={on}
                  onClick={() => { setTab(t.id); setFind(''); setRefreshNote(null); }}
                  className="btn text-xs px-3 py-1.5"
                  style={on
                    ? { backgroundColor: '#163a3a', color: '#ffffff', border: '1px solid #49b3b3' }
                    : { backgroundColor: 'transparent', color: '#e2e4ec', border: '1px solid #44454f' }}>
                  {t.label}
                  {count !== null && <>{' '}<span className="font-mono" style={{ marginLeft: 3, color: bad ? YELLOW : '#d2d6e2' }}>{fmtInt(count)}</span></>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {answer && (
              <span className="text-xs text-text-secondary">
                Loaded <span className="font-mono text-text-primary">{fmtLoaded(answer.synced_at_ms)}</span>
              </span>
            )}
            <button onClick={() => setReloadTick((n) => n + 1)} disabled={loading}
              title="Read the list again from the service. This does not call cTrader."
              className="btn btn-ghost text-xs border border-border px-2.5 py-1">
              Reload list
            </button>
            <button onClick={() => void refresh()} disabled={refreshing || !connected}
              title={connected ? 'Ask the node to load its lists again from cTrader' : 'The node is not connected; its data loads by itself after the next login'}
              className="btn text-xs px-2.5 py-1"
              style={refreshing || !connected
                ? { backgroundColor: '#2a2a2c', color: '#a0a0b0', border: '1px solid #484848', cursor: 'not-allowed' }
                : { backgroundColor: '#163a3a', color: '#ffffff', border: '1px solid #49b3b3' }}>
              {refreshing ? 'Loading from cTrader…' : 'Refresh from cTrader'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pt-2.5 flex items-center gap-2 flex-wrap" style={{ minHeight: 38 }}>
          {tab === 'positions' && (
            <>
              <div role="radiogroup" aria-label="Book" className="flex items-center">
                {([['', 'All', answer?.total], ['A', 'A-Book', answer?.total_book_a], ['B', 'B-Book', answer?.total_book_b]] as Array<['' | 'A' | 'B', string, number | undefined]>).map(([id, label, n], i) => {
                  const on = q.book === id;
                  return (
                    <button key={label} role="radio" aria-checked={on} onClick={() => setQuery({ book: id })}
                      className="text-xs px-2.5 py-1"
                      style={{
                        backgroundColor: on ? '#163a3a' : 'transparent', color: on ? '#ffffff' : '#e2e4ec',
                        border: `1px solid ${on ? '#49b3b3' : '#44454f'}`, marginLeft: i ? -1 : 0,
                        borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0, position: 'relative', zIndex: on ? 1 : 0,
                      }}>
                      {label}
                      {/* Counts are of the positions matching the other filters; with a book chosen only that book is counted. */}
                      {n !== undefined && (q.book === '' || on) && <>{' '}<span className="font-mono" style={{ marginLeft: 3 }}>{fmtInt(n)}</span></>}
                    </button>
                  );
                })}
              </div>
              {filterInput(q.login, 'Login', (v) => setQuery({ login: v }), true)}
              {filterInput(q.symbol, 'Symbol (exact)', (v) => setQuery({ symbol: v }))}
            </>
          )}
          {tab === 'traders' && (
            <>
              {filterInput(q.login, 'Login', (v) => setQuery({ login: v }), true)}
              {groups.length > 0 && (
                <select className="select text-xs" style={{ padding: '4px 8px', maxWidth: 260 }}
                  value={q.groupId} onChange={(e) => setQuery({ groupId: e.target.value })} aria-label="Group">
                  <option value="">All groups</option>
                  {groups.map((g) => <option key={g.group_id} value={g.group_id}>{g.group}</option>)}
                </select>
              )}
            </>
          )}
          {(tab === 'symbols' || tab === 'groups') && (
            <input className="input text-xs" style={{ width: 240, padding: '4px 8px' }}
              placeholder={tab === 'symbols' ? 'Find a symbol or description' : 'Find a group'}
              value={find} onChange={(e) => setFind(e.target.value)} />
          )}
          {tab === 'symbols' && (
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={q.archived} onChange={(e) => setQuery({ archived: e.target.checked })} />
              Include archived symbols
            </label>
          )}
          {(q.login || q.symbol || q.groupId || q.book) && paged && (
            <button onClick={() => setQuery({ ...EMPTY_QUERY })} className="text-xs text-text-secondary underline">Clear filters</button>
          )}
        </div>

        {/* Notes */}
        <div className="px-4 pt-2 space-y-2">
          {refreshNote && <Banner tone={refreshNote.tone}>{refreshNote.text}</Banner>}
          {answer && <ListStatus answer={answer} connected={connected} />}
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-0 mx-4 mt-2 mb-2 overflow-auto rounded" style={{ border: '1px solid #44454f', backgroundColor: '#1a1a1c' }}>
          {failure ? (
            <div className="p-4">
              <Banner tone={failure.status === 503 ? 'warn' : 'error'}>
                {failure.status === 503 && <strong>This node is not connected. </strong>}
                {failure.message}
              </Banner>
            </div>
          ) : !answer ? (
            <div className="flex items-center justify-center h-full text-sm text-text-muted">Loading…</div>
          ) : tab === 'positions' ? (
            <DataTable columns={POSITION_COLUMNS} rows={answer.positions ?? []} rowKey={(p) => p.position_id} />
          ) : tab === 'traders' ? (
            <DataTable columns={TRADER_COLUMNS} rows={answer.traders ?? []} rowKey={(t) => t.trader_id} />
          ) : tab === 'symbols' ? (
            <DataTable
              columns={q.archived ? [...SYMBOL_COLUMNS, { header: 'Archived', cell: (s: CTraderSymbol) => yesNo(s.archived) }] : SYMBOL_COLUMNS}
              rows={symbols} rowKey={(s) => s.symbol_id} />
          ) : (
            <DataTable columns={GROUP_COLUMNS} rows={groupRows} rowKey={(g) => g.group_id} />
          )}
          {answer && !failure && total === 0 && answer.state !== 'NOT_LOADED' && answer.state !== 'FAILED' && (
            <div className="py-10 text-center text-sm text-text-muted">
              {tab === 'positions' ? 'No open positions match.' : tab === 'traders' ? 'No trader accounts match.' : 'Nothing in this list.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3 flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span>
            {tab === 'positions' && 'Current price and profit are not available yet and show as a dash. Money is in each account’s own currency.'}
            {tab === 'traders' && 'Balance is in the account’s own currency. Equity and margin are not sent by the cTrader Manager API.'}
            {tab === 'symbols' && answer && `${fmtInt(symbols.length)} of ${fmtInt(total)} shown`}
            {tab === 'groups' && answer && `${fmtInt(groupRows.length)} of ${fmtInt(total)} shown`}
          </span>
          {paged && answer && total > 0 && (
            <span className="flex items-center gap-2">
              <span className="font-mono text-text-primary">
                {fmtInt(offset + 1)}–{fmtInt(offset + returned)} of {fmtInt(total)}
              </span>
              <button className="btn btn-ghost text-xs border border-border px-2 py-0.5" disabled={offset === 0 || loading}
                style={offset === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => setQueries((prev) => ({ ...prev, [tab]: { ...prev[tab], offset: Math.max(0, offset - PAGE) } }))}>
                Previous
              </button>
              <button className="btn btn-ghost text-xs border border-border px-2 py-0.5" disabled={offset + returned >= total || loading}
                style={offset + returned >= total ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => setQueries((prev) => ({ ...prev, [tab]: { ...prev[tab], offset: offset + returned } }))}>
                Next
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
