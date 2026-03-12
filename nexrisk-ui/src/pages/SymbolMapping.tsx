// ============================================================
// Symbol Mapping — MT5 Symbol → LP Instrument
// STP Phase 1 — compact add strip, table-dominant layout,
// in-row edit, per-row delete, auto-map review workflow
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';

// ── API ──────────────────────────────────────────────────────
const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const hasBody = opts.body != null && typeof opts.body === 'string';
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ────────────────────────────────────────────────────
interface LPMapping {
  id: number;
  mt5_symbol: string;
  lp_id: string;               // LP identifier — required for snap quote and PUT updates
  lp_name: string;
  lp_symbol: string;
  volume_multiplier: number;   // Size Normalizer ×N
  lp_price_precision: number;  // Price Digits
  enabled: boolean;
  source: 'manual' | 'auto' | 'imported';
  approved: boolean;
  created_at: string;
  updated_at: string;
  // Display-only fields not in backend schema yet
  price_multiplier?: number;
  mt5_trades_in_units?: boolean;
  mt5_trades_in_lots?: boolean;
  lp_trades_in_lots?: boolean;
  lp_trades_in_units?: boolean;
  min_size?: number;
  step_size?: number;
}
interface MT5Node      { node_id: number; node_name: string; connection_status: string; is_enabled: boolean; }
interface MT5Symbol    { symbol: string; description: string; digits: number; contract_size: number; }
interface LPConfig     { lp_id: string; lp_name: string; enabled: boolean; credentials_set: boolean; }
interface LPStatus     { state: string; trading_session: { state: string; instruments_loaded: number; instruments_complete: boolean }; }
interface LPInstrument { symbol: string; canonical_symbol?: string; description?: string; contract_multiplier?: number; price_precision?: number; }
interface UnmappedSym  { mt5_symbol: string; trader_count: number; total_volume: number; }
interface BulkResult   { inserted: number; updated?: number; skipped: number; conflicts?: string[]; errors?: { mt5_symbol: string; error: string }[]; }

// ── Helpers ───────────────────────────────────────────────────
function computeMultiplier(mt5cs?: number, lpCm?: number): number | undefined {
  if (!mt5cs || !lpCm) return undefined;
  const r = mt5cs / lpCm;
  return Math.abs(r - 1) < 0.0001 ? undefined : Math.round(r * 10000) / 10000;
}

function autoMatch(sym: string, instrs: LPInstrument[]): LPInstrument | null {
  if (!instrs.length) return null;
  const up = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tests = [
    (i: LPInstrument) => i.symbol.toUpperCase() === sym.toUpperCase(),
    (i: LPInstrument) => (i.canonical_symbol ?? '').toUpperCase() === sym.toUpperCase(),
    (i: LPInstrument) => i.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') === up,
    ...[3,4,5].map(n => (i: LPInstrument) => i.symbol.toUpperCase() === `${up.slice(0,n)}/${up.slice(n)}`),
  ];
  for (const t of tests) { const m = instrs.find(t); if (m) return m; }
  return null;
}

// ── Icons ─────────────────────────────────────────────────────
const IcoPlus    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M19,11h-6V5c0-.553-.448-1-1-1s-1,.447-1,1v6H5c-.552,0-1,.447-1,1s.448,1,1,1h6v6c0,.553.448,1,1,1s1-.447,1-1v-6h6c.552,0,1-.447,1-1s-.448-1-1-1Z"/></svg>;
const IcoTrash   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/></svg>;
const IcoEdit    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M22.987,4.206l-3.193-3.193c-.663-.663-1.542-1.013-2.475-1.013s-1.812.35-2.475,1.013L1.707,14.146c-.286.286-.498.637-.616,1.022L.038,20.617c-.09.305-.004.633.224.855.169.163.393.251.624.251.077,0,.155-.01.231-.029l5.449-1.053c.385-.118.735-.33,1.021-.616l13.131-13.131c.663-.663,1.013-1.542,1.013-2.475s-.35-1.812-1.013-2.475Z"/></svg>;
const IcoCheck   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M22.319,4.431,8.5,18.249a1,1,0,0,1-1.417,0L1.739,12.9a1,1,0,0,1,0-1.417,1,1,0,0,1,1.417,0l4.636,4.636L20.9,3.014a1,1,0,0,1,1.417,1.417Z"/></svg>;
const IcoX       = ({ size = 13 }: { size?: number }) => <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}><path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/></svg>;
const IcoWarn    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/></svg>;
const IcoUpload  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M11,16V7.414l-3.293,3.293a1,1,0,0,1-1.414-1.414l5-5a1,1,0,0,1,1.414,0l5,5a1,1,0,0,1-1.414,1.414L13,7.414V16a1,1,0,0,1-2,0ZM21,14a1,1,0,0,0-1,1v4H4V15a1,1,0,0,0-2,0v4a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V15A1,1,0,0,0,21,14Z"/></svg>;
const IcoHistory = () => <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12,2A10,10,0,1,0,22,12,10.011,10.011,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8.009,8.009,0,0,1,12,20ZM13,7H11v6l4.243,4.243,1.414-1.414L13,12.586Z"/></svg>;
const IcoChevD   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="m11.998,17c-.268,0-.518-.105-.707-.293l-8.292-8.293c-.391-.391-.391-1.023,0-1.414s1.023-.391,1.414,0l7.585,7.586,7.585-7.585c.391-.391,1.024-.391,1.414,0s.391,1.023,0,1.414l-8.292,8.292c-.188,.188-.439,.293-.707,.293Z"/></svg>;
const IcoSearch  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M23.707,22.293l-5.969-5.969a10.016,10.016,0,1,0-1.414,1.414l5.969,5.969a1,1,0,0,0,1.414-1.414ZM10,18a8,8,0,1,1,8-8A8.009,8.009,0,0,1,10,18Z"/></svg>;

// ── Toggle — copied from NodeManagement / LiquidityProviders ─
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center',
        width: 36, height: 20, borderRadius: 10, padding: 3,
        backgroundColor: checked ? '#163a3a' : '#383838',
        border: `1.5px solid ${checked ? '#4ecdc4' : '#505050'}`,
        cursor: 'pointer', flexShrink: 0, outline: 'none',
        transition: 'background-color .15s, border-color .15s',
      }}>
      <span style={{
        display: 'block', width: 12, height: 12, borderRadius: '50%',
        backgroundColor: checked ? '#4ecdc4' : '#888',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .15s, background-color .15s',
      }} />
    </button>
  );
}

// ── Searchable dropdown ───────────────────────────────────────
function SearchSelect({ value, onChange, options, placeholder, disabled, className: cls, ctrlHeight }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder: string; disabled?: boolean; className?: string; ctrlHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()) || (o.sub ?? '').toLowerCase().includes(q.toLowerCase()));
  const sel = options.find(o => o.value === value);

  return (
    <div ref={ref} className={clsx('relative', cls)}>
      <button type="button" disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(p => !p); setQ(''); } }}
        className={clsx('input w-full text-sm flex items-center justify-between gap-1', disabled && 'opacity-40 cursor-not-allowed')}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', paddingRight: 8, ...(ctrlHeight ? { height: ctrlHeight } : {}) }}>
        <span className={clsx('flex-1 truncate text-left', sel ? 'font-mono' : '')} style={{ color: sel ? undefined : '#666' }}>
          {sel?.label ?? placeholder}
        </span>
        <span style={{ color: '#555', flexShrink: 0 }}><IcoChevD /></span>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 rounded border border-border overflow-hidden"
          style={{ zIndex: 9999, backgroundColor: '#1a1a1c', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }}><IcoSearch /></span>
              <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search…" className="input w-full text-xs pl-7" />
            </div>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div className="py-3 text-center text-xs text-text-muted">No results</div>
              : filtered.map(o => (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left text-sm border-none cursor-pointer"
                  style={{ backgroundColor: o.value === value ? '#2a2a2c' : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2c')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = o.value === value ? '#2a2a2c' : 'transparent')}
                >
                  <span className="font-mono text-text-primary">{o.label}</span>
                  {o.sub && <span className="text-xs text-text-muted ml-2 truncate" style={{ maxWidth: 160 }}>{o.sub}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ComboInput — free text + optional dropdown ────────────────
function ComboInput({ value, onChange, options, placeholder, className: cls, ctrlHeight }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder: string; className?: string; ctrlHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = options.filter(o => !value || o.label.toLowerCase().includes(value.toLowerCase()) || (o.sub ?? '').toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={ref} className={clsx('relative', cls)}>
      <input type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="input w-full text-sm font-mono"
        style={ctrlHeight ? { height: ctrlHeight } : undefined}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 rounded border border-border overflow-hidden"
          style={{ zIndex: 9999, backgroundColor: '#1a1a1c', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.slice(0, 60).map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-left border-none cursor-pointer"
                style={{ backgroundColor: o.value === value ? '#2a2a2c' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2c')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = o.value === value ? '#2a2a2c' : 'transparent')}
              >
                <span className="font-mono text-text-primary">{o.label}</span>
                {o.sub && <span className="text-xs text-text-muted ml-2 flex-shrink-0">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-Map Review Modal ─────────────────────────────────────
interface ReviewRow { mt5_symbol: string; lp_symbol: string; confidence: 'exact' | 'derived' | 'fallback'; trader_count: number; total_volume: number; }

function AutoMapReview({ rows: init, lpOptions, nodes, lps, defaultNodeId, defaultLpId, onCommit, onClose }: {
  rows: ReviewRow[];
  lpOptions: { value: string; label: string }[];
  nodes: { node_id: number; node_name: string }[];
  lps: { lp_id: string; lp_name: string }[];
  defaultNodeId: number | null;
  defaultLpId: string | null;
  onCommit: (rows: ReviewRow[], nodeId: number | null, lpId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [rows,       setRows]     = useState(init);
  const [nodeId,     setNodeId]   = useState<number | null>(defaultNodeId);
  const [lpId,       setLpId]     = useState<string | null>(defaultLpId);
  const [busy,       setBusy]     = useState(false);
  const [err,        setErr]      = useState('');

  const confStyle = {
    exact:    { color: '#66e07a', backgroundColor: '#162a1c', border: '1px solid #2f6a3d' },
    derived:  { color: '#4ecdc4', backgroundColor: '#163a3a', border: '1px solid #2a6a6a' },
    fallback: { color: '#e0a030', backgroundColor: '#2a1f0a', border: '1px solid #5a4020' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel flex flex-col" style={{ width: 920, maxHeight: '88vh', backgroundColor: '#232225' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #3a3a3c' }}>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Auto-Map Review</h3>
            <p className="text-xs text-text-muted mt-0.5">All LP symbols are editable — adjust before committing</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><IcoX size={15} /></button>
        </div>

        {/* Step 1 — Select MT5 node and LP */}
        <div className="px-5 py-3 flex items-end gap-4 flex-shrink-0" style={{ borderBottom: '1px solid #3a3a3c', backgroundColor: '#1e1e20' }}>
          <div className="flex flex-col gap-1" style={{ minWidth: 200 }}>
            <label className="text-xs text-text-muted font-medium">① MT5 Node (source of symbol list)</label>
            <select className="input text-sm" value={nodeId ?? ''} onChange={e => setNodeId(Number(e.target.value))}
              disabled={nodes.length === 0} style={{ height: 30, opacity: nodes.length === 0 ? 0.4 : 1 }}>
              {nodes.length === 0
                ? <option>No nodes connected</option>
                : nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1" style={{ minWidth: 200 }}>
            <label className="text-xs text-text-muted font-medium">② Liquidity Provider (target for mappings)</label>
            <select className="input text-sm" value={lpId ?? ''} onChange={e => setLpId(e.target.value)}
              disabled={lps.length === 0} style={{ height: 30, opacity: lps.length === 0 ? 0.4 : 1 }}>
              {lps.length === 0
                ? <option>No LPs configured</option>
                : lps.map(l => <option key={l.lp_id} value={l.lp_id}>{l.lp_name}</option>)}
            </select>
          </div>
          <p className="text-xs text-text-muted pb-1.5 flex-1">
            Review the proposed LP instrument for each unmapped symbol below.
            All values are editable — change any LP symbol before committing.
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ borderBottom: '1px solid #3a3a3c', backgroundColor: '#1e1e20' }}>
                <th className="px-4 py-2 text-left text-xs text-text-muted font-medium">MT5 Symbol</th>
                <th className="px-1 py-2 text-xs text-text-muted font-medium"></th>
                <th className="px-3 py-2 text-left text-xs text-text-muted font-medium">LP Instrument (editable)</th>
                <th className="px-4 py-2 text-center text-xs text-text-muted font-medium">Match quality</th>
                <th className="px-4 py-2 text-right text-xs text-text-muted font-medium">Traders</th>
                <th className="px-4 py-2 text-right text-xs text-text-muted font-medium">Open lots</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.mt5_symbol} style={{ borderTop: '1px solid #2a2a2c' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2c')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                  <td className="px-4 py-1.5 font-mono font-semibold text-text-primary">{r.mt5_symbol}</td>
                  <td className="px-1 py-1.5 text-text-muted">→</td>
                  <td className="px-2 py-1" style={{ minWidth: 220 }}>
                    {lpOptions.length > 0
                      ? <SearchSelect value={r.lp_symbol} onChange={v => setRows(p => p.map((x,j) => j===i ? {...x, lp_symbol: v} : x))} options={lpOptions} placeholder="Select…" />
                      : <input className="input w-full text-sm font-mono" value={r.lp_symbol}
                          onChange={e => setRows(p => p.map((x,j) => j===i ? {...x, lp_symbol: e.target.value} : x))} />
                    }
                  </td>
                  <td className="px-4 py-1.5 text-center">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={confStyle[r.confidence]}>
                      {{ exact: 'Exact match', derived: 'Derived match', fallback: 'Same name used' }[r.confidence]}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right text-text-muted">{r.trader_count}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-text-muted">{r.total_volume.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {err && <p className="px-5 py-2 text-xs" style={{ color: '#ff6b6b', borderTop: '1px solid #3a3a3c' }}>{err}</p>}

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #3a3a3c' }}>
          <span className="text-xs text-text-muted">{rows.length} mapping{rows.length !== 1 ? 's' : ''} · ③ commit when ready</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="btn btn-ghost text-xs border border-border px-3 py-1.5">Cancel</button>
            <button disabled={busy}
              onClick={async () => { setBusy(true); setErr(''); try { await onCommit(rows, nodeId, lpId); } catch(e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false); }}}
              className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={busy
                ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
                : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
              <IcoCheck />{busy ? 'Committing…' : `Commit ${rows.length} mapping${rows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Upload Modal ─────────────────────────────────────────
function BulkModal({ onUpload, onClose, mt5Syms, nodeName, lpName }: {
  onUpload: (rows: { mt5_symbol: string; lp_symbol: string }[], fn: string) => Promise<BulkResult>;
  onClose: () => void;
  mt5Syms: MT5Symbol[];
  nodeName: string;
  lpName: string;
}) {
  const [rows, setRows]     = useState<{ mt5_symbol: string; lp_symbol: string }[]>([]);
  const [filename, setFn]   = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const header  = `# Symbol mapping template — MT5 Server: ${nodeName || 'Unknown'} → LP: ${lpName || 'Unknown'}`;
    const note    = `# Instructions: Fill in the LPSymbol column for each MT5 symbol, then upload this file.`;
    const cols    = `MT5Symbol,LPSymbol,LotMultiplier,PriceDigits`;
    const dataRows = mt5Syms.length > 0
      ? mt5Syms.map(s => `${s.symbol},,, `).join('\n')
      : `GBPUSD,,,\nEURUSD,,,\nXAUUSD,,,`;
    const csv = [header, note, cols, dataRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `symbol-mapping-template_${(nodeName || 'mt5').replace(/\s+/g,'_')}_${(lpName || 'lp').replace(/\s+/g,'_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFn(f.name); setErr(''); setResult(null);
    const r = new FileReader();
    r.onload = ev => {
      const allLines = (ev.target?.result as string).trim().split('\n');
      const lines = allLines.filter(l => l.trim() && !l.trim().startsWith('#'));
      if (lines.length < 2) { setErr('Needs a header row and at least one data row'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
      const parsed = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''));
        const row: Record<string,string> = Object.fromEntries(headers.map((h,i) => [h, cols[i]??'']));
        return { mt5_symbol: row.MT5Symbol||row.mt5_symbol||row.MT5||'', lp_symbol: row.LPSymbol||row.lp_symbol||row.LP||'' };
      }).filter(r => r.mt5_symbol && r.lp_symbol);
      if (!parsed.length) { setErr('No usable rows found. Expected columns: MT5Symbol, LPSymbol'); return; }
      setRows(parsed);
    };
    r.readAsText(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel flex flex-col" style={{ width: 560, maxHeight: '85vh', backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #3a3a3c' }}>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Bulk Symbol Mapping — CSV Upload</h3>
            <p className="text-xs text-text-muted mt-0.5">Map many symbols at once by uploading a filled-in CSV file</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><IcoX size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* Step 1 — download template */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Step 1 — Download template</p>
            <div className="flex items-start gap-3 p-3 rounded" style={{ backgroundColor: '#1e1e20', border: '1px solid #383838' }}>
              <div className="flex-1 text-xs text-text-secondary leading-relaxed">
                Download a CSV pre-filled with all MT5 symbols from <span className="font-semibold text-text-primary">{nodeName || 'selected node'}</span>.
                The file includes a header row identifying the MT5 server and LP so it is clear what is being mapped.
                Open in Excel or any spreadsheet app, fill in the <span className="font-mono text-text-primary">LPSymbol</span> column, save, and upload below.
              </div>
              <button onClick={downloadTemplate}
                className="btn text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
                style={{ backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }}>
                <IcoUpload /> Download template
              </button>
            </div>
            <div className="px-1 text-xs text-text-muted">
              <span className="font-semibold">Columns:</span> <code className="font-mono">MT5Symbol</code> (filled), <code className="font-mono">LPSymbol</code> (you fill in),
              <code className="font-mono"> LotMultiplier</code> (optional), <code className="font-mono">PriceDigits</code> (optional).
              Lines beginning with <code className="font-mono">#</code> are treated as comments and ignored.
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #383838' }} />

          {/* Step 2 — upload filled file */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Step 2 — Upload filled file</p>

            {!result ? (
              <>
                <div onClick={() => fileRef.current?.click()}
                  className="rounded p-7 text-center cursor-pointer transition-colors"
                  style={{ border: '2px dashed #404040' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#4ecdc4')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#404040')}>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                  <div className="flex justify-center mb-2 text-text-muted"><IcoUpload /></div>
                  {filename
                    ? <p className="text-sm font-mono text-text-primary">{filename} — {rows.length} rows ready</p>
                    : <p className="text-sm text-text-muted">Click to select your filled CSV</p>}
                </div>

                {rows.length > 0 && (
                  <div className="rounded overflow-hidden" style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #383838' }}>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr style={{ backgroundColor: '#1e1e20', borderBottom: '1px solid #383838' }}>
                        <th className="px-3 py-1.5 text-left text-text-muted font-medium">MT5 Symbol</th>
                        <th className="px-3 py-1.5 text-left text-text-muted font-medium">LP Symbol</th>
                      </tr></thead>
                      <tbody>
                        {rows.slice(0,25).map((r,i) => (
                          <tr key={i} style={{ borderTop: '1px solid #2a2a2c' }}>
                            <td className="px-3 py-1 font-mono text-text-primary">{r.mt5_symbol}</td>
                            <td className="px-3 py-1 font-mono text-text-secondary">{r.lp_symbol}</td>
                          </tr>
                        ))}
                        {rows.length > 25 && <tr><td colSpan={2} className="px-3 py-1 text-center text-text-muted">…and {rows.length-25} more</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {err && <p className="text-xs flex items-center gap-1" style={{ color: '#ff6b6b' }}><IcoWarn />{err}</p>}
              </>
            ) : (
              <div className="p-4 rounded text-sm"
                style={result.errors.length === 0
                  ? { backgroundColor: '#162a1c', border: '1px solid #2f6a3d', color: '#66e07a' }
                  : { backgroundColor: '#2a2016', border: '1px solid #5a4020', color: '#e0a030' }}>
                <p className="font-semibold mb-2">Upload complete</p>
                <div className="flex gap-4 text-xs">
                  <span style={{ color: '#66e07a' }}>{result.inserted} new mappings added</span>
                  <span className="text-text-muted">{result.updated} updated</span>
                  <span className="text-text-muted">{result.skipped} skipped</span>
                  {result.errors.length > 0 && <span style={{ color: '#ff6b6b' }}>{result.errors.length} errors</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid #3a3a3c' }}>
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-3 py-1.5">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button disabled={!rows.length || busy}
              onClick={async () => { setBusy(true); setErr(''); try { setResult(await onUpload(rows, filename)); } catch(e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }}}
              className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={!rows.length || busy
                ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
                : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
              <IcoUpload />{busy ? 'Uploading…' : `Upload ${rows.length} mapping${rows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Import Log Modal ──────────────────────────────────────────
// Shows every bulk CSV import ever run — what file, how many rows,
// how many were new mappings vs. updates vs. errors.
// Useful when something goes wrong after a bulk import: you can
// identify exactly which file caused the change and how many mappings
// were affected, then revert manually if needed.
function ImportLogModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['mapping-lp-history'],
    queryFn: () => api<{ history: { id: number; batch_id: string; filename: string; row_count: number; inserted: number; updated: number; errors: number; uploaded_at: string }[] }>('/api/v1/mappings/history?type=lp&limit=50'),
    staleTime: 30_000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel flex flex-col" style={{ width: 640, maxHeight: '80vh', backgroundColor: '#232225' }}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '1px solid #3a3a3c' }}>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Bulk Import Log</h3>
            <p className="text-xs text-text-muted mt-0.5 max-w-sm leading-relaxed">
              Every CSV bulk upload is recorded here. If a recent import produced unexpected mappings,
              check this log to identify the file and row counts, then correct the affected mappings manually.
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary ml-4 flex-shrink-0"><IcoX size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading
            ? <div className="py-10 text-center text-sm text-text-muted">Loading…</div>
            : (data?.history ?? []).length === 0
              ? <div className="py-10 text-center text-sm text-text-muted">No bulk imports on record yet.</div>
              : (
                <table className="w-full border-collapse text-sm">
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ backgroundColor: '#1e1e20', borderBottom: '1px solid #3a3a3c' }}>
                      <th className="px-4 py-2 text-left text-xs text-text-muted font-medium">Date</th>
                      <th className="px-4 py-2 text-left text-xs text-text-muted font-medium">File</th>
                      <th className="px-4 py-2 text-right text-xs text-text-muted font-medium" title="Rows in the file">Rows</th>
                      <th className="px-4 py-2 text-right text-xs text-text-muted font-medium" title="New mappings added">Added</th>
                      <th className="px-4 py-2 text-right text-xs text-text-muted font-medium" title="Existing mappings updated">Updated</th>
                      <th className="px-4 py-2 text-right text-xs text-text-muted font-medium" title="Rows that failed">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.history ?? []).map(h => (
                      <tr key={h.id}
                        style={{ borderTop: '1px solid #2a2a2c' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2a2a2c')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '')}>
                        <td className="px-4 py-2 text-text-muted whitespace-nowrap">
                          {new Date(h.uploaded_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}
                          <span className="ml-1 text-xs" style={{ color: '#555' }}>
                            {new Date(h.uploaded_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-text-muted" style={{ maxWidth: 220 }}>
                          <span className="truncate block">{h.filename || h.batch_id}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-muted">{h.row_count}</td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: h.inserted > 0 ? '#66e07a' : '#555' }}>{h.inserted}</td>
                        <td className="px-4 py-2 text-right font-mono text-text-muted">{h.updated}</td>
                        <td className="px-4 py-2 text-right font-mono" style={h.errors > 0 ? { color: '#ff6b6b' } : { color: '#555' }}>{h.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          }
        </div>
        <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid #3a3a3c' }}>
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-3 py-1.5">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────
function DeleteConfirm({ m, onConfirm, onClose }: { m: LPMapping; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className="panel" style={{ width: 340, backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Remove Mapping</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><IcoX size={15} /></button>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-text-secondary">
            Remove <span className="font-mono text-text-primary">{m.mt5_symbol}</span>
            {' → '}
            <span className="font-mono text-text-primary">{m.lp_symbol}</span>?
            {' '}This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} disabled={busy}
            className="btn btn-ghost text-xs border border-border px-3 py-1.5">Cancel</button>
          <button disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } catch { setBusy(false); }}}
            className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
            style={busy
              ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
              : { backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            <IcoTrash />{busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Editable row state ─────────────────────────────────────────

// ── Table cell helpers ────────────────────────────────────────
// sep  = right-border section divider
// norm = normalizer column amber background
const TH = ({ children, right, center, sep, norm, title }: {
  children?: React.ReactNode; right?: boolean; center?: boolean;
  sep?: boolean; norm?: boolean; title?: string;
}) => (
  <th title={title} className="px-2 py-1.5 font-mono font-medium whitespace-nowrap"
    style={{
      fontSize: 10, color: '#777', userSelect: 'none',
      textAlign: right ? 'right' : center ? 'center' : 'left',
      borderRight: sep ? '1px solid #3a3a3c' : undefined,
      backgroundColor: norm ? '#1a1808' : undefined,
    }}>
    {children}
  </th>
);
const TD = ({ children, right, center, sep, norm, style }: {
  children?: React.ReactNode; right?: boolean; center?: boolean;
  sep?: boolean; norm?: boolean; style?: React.CSSProperties;
}) => (
  <td className="px-2 py-1 font-mono text-xs"
    style={{
      textAlign: right ? 'right' : center ? 'center' : 'left',
      borderRight: sep ? '1px solid #2a2a2c' : undefined,
      backgroundColor: norm ? '#1a1808' : undefined,
      ...style,
    }}>
    {children}
  </td>
);

interface RowEdit {
  lp_id: string;
  lp_symbol: string;
  lp_name: string;
  volume_multiplier: string;    // Size Normalizer ×N
  lp_price_precision: string;   // Price Digits
  price_multiplier: string;     // display-only until backend supports it
  mt5_trades_in_units: string;  // 'yes' | 'no' | ''
  mt5_trades_in_lots: string;
  lp_trades_in_lots: string;
  lp_trades_in_units: string;
  min_size: string;
  step_size: string;
}
// Per-row snap quote cache
interface SnapQuote { mt5?: number; lp?: number; loading: boolean; err?: string; }

// ── Main Page ──────────────────────────────────────────────────
export function SymbolMappingPage() {
  const qc = useQueryClient();

  // Add-strip state
  const [nodeId,    setNodeId]    = useState<number | null>(null);
  const [lpId,      setLpId]      = useState<string | null>(null);
  const [addMt5,    setAddMt5]    = useState('');
  const [addLpSym,  setAddLpSym]  = useState('');
  const [addMult,   setAddMult]   = useState('');
  const [addPrec,   setAddPrec]   = useState('');
  const [addBusy,   setAddBusy]   = useState(false);
  const [addErr,    setAddErr]    = useState('');
  const [statusMsg, setStatusMsg] = useState<{text:string;ok:boolean}|null>(null);

  // Table state
  const [search,        setSearch]        = useState('');
  const [editingId,     setEditingId]     = useState<number | null>(null);
  const [editForm,      setEditForm]      = useState<RowEdit | null>(null);
  const [savingId,      setSavingId]      = useState<number | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<LPMapping | null>(null);
  const [rowErr,        setRowErr]        = useState<string | null>(null);
  const [autoMapRows,   setAutoMapRows]   = useState<ReviewRow[] | null>(null);
  const [bulkOpen,      setBulkOpen]      = useState(false);
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [snapQuotes,    setSnapQuotes]    = useState<Map<number, SnapQuote>>(new Map());

  // ── Queries ────────────────────────────────────────────────
  const { data: mappingData, isLoading: loadingMaps, error: mapsErr, refetch } = useQuery({
    queryKey: ['mappings-lp'],
    queryFn:  () => api<{ mappings: LPMapping[]; total: number; generated_at: string }>('/api/v1/symbol-mappings'),
    staleTime: 10_000,
  });
  const { data: nodeData } = useQuery({
    queryKey: ['mt5-node-status'],
    queryFn:  () => api<{ nodes: MT5Node[] }>('/api/v1/mt5/nodes/status'),
    staleTime: 15_000, refetchInterval: 30_000,
  });
  const { data: lpListData } = useQuery({
    queryKey: ['lp-list'],
    queryFn:  () => api<{ success: boolean; data: { lps: LPConfig[] } }>('/api/v1/fix/admin/lp'),
    staleTime: 15_000,
  });
  const { data: mt5SymData, isFetching: loadingMt5 } = useQuery({
    queryKey: ['mt5-symbols-all'],
    queryFn:  () => api<{ symbols: MT5Symbol[]; total: number; source_nodes: number }>('/api/v1/symbol-mappings/mt5-symbols'),
    staleTime: 60_000,
  });
  const { data: instrData, isFetching: loadingInstrs, refetch: retryInstrs } = useQuery({
    queryKey: ['lp-instruments', lpId],
    queryFn:  () => api<{ success: boolean; data: { instruments: LPInstrument[] } }>(`/api/v1/fix/lp/${lpId}/instruments`),
    enabled: !!lpId, staleTime: 120_000, retry: 1,
  });
  const { data: lpStatusData } = useQuery({
    queryKey: ['lp-status', lpId],
    queryFn:  () => api<{ success: boolean; data: LPStatus }>(`/api/v1/fix/lp/${lpId}`),
    enabled: !!lpId, staleTime: 15_000, refetchInterval: 20_000, retry: false,
  });
  const { data: unmappedData } = useQuery({
    queryKey: ['mappings-lp-unmapped'],
    queryFn:  () => api<{ unmapped: string[]; total: number }>('/api/v1/symbol-mappings/unmapped'),
    staleTime: 30_000,
  });

  // ── Derived ────────────────────────────────────────────────
  const mappings       = mappingData?.mappings ?? [];
  const connNodes      = (nodeData?.nodes ?? []).filter(n => n.connection_status === 'CONNECTED' && n.is_enabled);
  const lps            = (lpListData?.data?.lps ?? []).filter(l => l.enabled);
  const mt5Syms        = mt5SymData?.symbols ?? [];
  const lpInstrs       = instrData?.data?.instruments ?? [];
  const unmapped: UnmappedSym[] = (unmappedData?.unmapped ?? []).map(sym => ({ mt5_symbol: sym, trader_count: 0, total_volume: 0 }));
  const lpStatus       = lpStatusData?.data;
  const lpConnected    = lpStatus?.state === 'CONNECTED' || lpStatus?.trading_session?.state === 'LOGGED_ON';
  const selectedLP     = lps.find(l => l.lp_id === lpId);
  const mappedSet      = new Set(mappings.map(m => m.mt5_symbol));
  const unmappedPending = unmapped.filter(u => !mappedSet.has(u.mt5_symbol));

  const instrStatus = loadingInstrs ? '(fetching…)'
    : lpInstrs.length > 0 ? `(${lpInstrs.length} instruments)`
    : lpConnected ? '(loading instruments…)'
    : '(session offline — type manually)';

  const mt5Opts = mt5Syms.map(s => ({ value: s.symbol, label: s.symbol, sub: s.description }));
  const lpOpts  = lpInstrs.length
    ? lpInstrs.map(i => ({ value: i.symbol, label: i.symbol, sub: i.description ?? '' }))
    : mt5Syms.map(s => ({ value: s.symbol, label: s.symbol, sub: s.description }));
  const lpNameOpts = lps.map(l => ({ value: l.lp_name, label: l.lp_name }));

  // Auto-select first node / LP
  useEffect(() => { if (!nodeId && connNodes.length) setNodeId(connNodes[0].node_id); }, [connNodes.length]);
  useEffect(() => { if (!lpId && lps.length) setLpId(lps[0].lp_id); }, [lps.length]);

  // When MT5 symbol selected, auto-fill LP side
  function pickAddMt5(sym: string) {
    setAddMt5(sym); setAddErr('');
    const info  = mt5Syms.find(s => s.symbol === sym);
    const instr = autoMatch(sym, lpInstrs);
    if (instr) {
      setAddLpSym(instr.symbol);
      const mult = computeMultiplier(info?.contract_size, instr.contract_multiplier);
      setAddMult(mult !== undefined ? String(mult) : '');
      if (instr.price_precision) setAddPrec(String(instr.price_precision));
      else if (info?.digits)     setAddPrec(String(info.digits));
    } else {
      setAddLpSym(sym);
      if (info?.digits) setAddPrec(String(info.digits));
      setAddMult('');
    }
  }

  // Prefill from unmapped chip
  function prefillUnmapped(u: UnmappedSym) {
    const info  = mt5Syms.find(s => s.symbol === u.mt5_symbol);
    const instr = autoMatch(u.mt5_symbol, lpInstrs);
    setAddMt5(u.mt5_symbol);
    setAddLpSym(instr ? instr.symbol : u.mt5_symbol);
    const mult = computeMultiplier(info?.contract_size, instr?.contract_multiplier);
    setAddMult(mult !== undefined ? String(mult) : '');
    const prec = instr?.price_precision ?? info?.digits;
    setAddPrec(prec ? String(prec) : '');
    setAddErr(''); setStatusMsg(null);
  }

  // Build auto-map rows
  function buildAutoMapRows(): ReviewRow[] {
    return unmappedPending.map(u => {
      const instr = autoMatch(u.mt5_symbol, lpInstrs);
      return {
        mt5_symbol: u.mt5_symbol,
        lp_symbol: instr ? instr.symbol : u.mt5_symbol,
        confidence: instr ? (instr.symbol.toUpperCase() === u.mt5_symbol.toUpperCase() ? 'exact' : 'derived') : 'fallback',
        trader_count: u.trader_count,
        total_volume: u.total_volume,
      };
    });
  }

  // ── Mutations ─────────────────────────────────────────────
  async function handleAdd() {
    if (!addMt5.trim())   { setAddErr('Select an MT5 symbol'); return; }
    if (!addLpSym.trim()) { setAddErr('Enter LP symbol'); return; }
    if (!lpId)            { setAddErr('Select a Liquidity Provider'); return; }
    setAddBusy(true); setAddErr('');
    try {
      const existing = mappings.find(m => m.mt5_symbol === addMt5.trim() && m.lp_id === lpId);
      if (existing) {
        // Update existing
        await api(`/api/v1/symbol-mappings/${existing.id}`, { method: 'PUT', body: JSON.stringify({
          lp_symbol:           addLpSym.trim(),
          volume_multiplier:   addMult ? parseFloat(addMult) : undefined,
          lp_price_precision:  addPrec ? parseInt(addPrec)   : undefined,
        })});
      } else {
        // Create new
        await api('/api/v1/symbol-mappings', { method: 'POST', body: JSON.stringify({
          mt5_symbol:          addMt5.trim(),
          lp_id:               lpId,
          lp_symbol:           addLpSym.trim(),
          volume_multiplier:   addMult ? parseFloat(addMult) : undefined,
          lp_price_precision:  addPrec ? parseInt(addPrec)   : undefined,
        })});
      }
      await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
      await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
      setStatusMsg({ text: `${existing ? 'Updated' : 'Added'}: ${addMt5} → ${addLpSym}`, ok: true });
      setAddMt5(''); setAddLpSym(''); setAddMult(''); setAddPrec('');
    } catch(e: unknown) { setAddErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setAddBusy(false); }
  }

  function startEdit(m: LPMapping) {
    setEditingId(m.id);
    setRowErr(null);
    setEditForm({
      lp_id:               m.lp_id,
      lp_symbol:           m.lp_symbol,
      lp_name:             m.lp_name ?? '',
      volume_multiplier:   m.volume_multiplier   != null ? String(m.volume_multiplier)   : '',
      lp_price_precision:  m.lp_price_precision  != null ? String(m.lp_price_precision)  : '',
      price_multiplier:    m.price_multiplier    != null ? String(m.price_multiplier)    : '',
      mt5_trades_in_units: m.mt5_trades_in_units != null ? (m.mt5_trades_in_units ? 'yes' : 'no') : '',
      mt5_trades_in_lots:  m.mt5_trades_in_lots  != null ? (m.mt5_trades_in_lots  ? 'yes' : 'no') : '',
      lp_trades_in_lots:   m.lp_trades_in_lots   != null ? (m.lp_trades_in_lots   ? 'yes' : 'no') : '',
      lp_trades_in_units:  m.lp_trades_in_units  != null ? (m.lp_trades_in_units  ? 'yes' : 'no') : '',
      min_size:            m.min_size  != null ? String(m.min_size)  : '',
      step_size:           m.step_size != null ? String(m.step_size) : '',
    });
  }

  async function saveEdit(m: LPMapping) {
    if (!editForm) return;
    setSavingId(m.id);
    setRowErr(null);
    try {
      const parseNum = (v: string) => v.trim() ? parseFloat(v) : undefined;
      // PUT /api/v1/symbol-mappings/:id — fields supported by backend schema
      await api(`/api/v1/symbol-mappings/${m.id}`, { method: 'PUT', body: JSON.stringify({
        lp_symbol:          editForm.lp_symbol.trim() || m.lp_symbol,
        volume_multiplier:  parseNum(editForm.volume_multiplier)  ?? m.volume_multiplier,
        lp_price_precision: editForm.lp_price_precision.trim() ? parseInt(editForm.lp_price_precision) : m.lp_price_precision,
        enabled:            m.enabled,
      })});
      await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
      await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
      setEditingId(null); setEditForm(null);
    } catch(e: unknown) {
      setRowErr(e instanceof Error ? e.message : 'Save failed');
    }
    finally { setSavingId(null); }
  }

  async function fetchSnapQuote(m: LPMapping) {
    const rowLpId = m.lp_id;
    if (!rowLpId) return;
    setSnapQuotes(prev => { const n = new Map(prev); n.set(m.id, { loading: true }); return n; });
    try {
      // 1. Subscribe — idempotent, errors ignored
      //    POST /api/v1/fix/lp/{lp_id}/md/subscribe
      //    body: { type: "SUBSCRIBE_MD", params: { lp_id, symbol, depth: 1 } }
      await api(`/api/v1/fix/lp/${rowLpId}/md/subscribe`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'SUBSCRIBE_MD',
          params: { lp_id: rowLpId, symbol: m.lp_symbol, depth: 1 },
        }),
      }).catch(() => undefined);

      // 2. GET /api/v1/fix/lp/{lp_id}/md/book/{symbol}
      //    Response: { success: true, data: { best_ask, best_bid, mid_price, ... } }
      const res = await api<{ success: boolean; data: { best_ask?: number; best_bid?: number; mid_price?: number } }>(
        `/api/v1/fix/lp/${rowLpId}/md/book/${encodeURIComponent(m.lp_symbol)}`
      );
      const lpPrice = res?.data?.best_ask ?? res?.data?.mid_price ?? res?.data?.best_bid;
      setSnapQuotes(prev => {
        const n = new Map(prev);
        n.set(m.id, { lp: lpPrice, loading: false, err: lpPrice == null ? 'no data' : undefined });
        return n;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'offline';
      setSnapQuotes(prev => { const n = new Map(prev); n.set(m.id, { loading: false, err: msg }); return n; });
    }
  }

  async function toggleEnabled(m: LPMapping) {
    await api(`/api/v1/symbol-mappings/${m.id}`, { method: 'PUT', body: JSON.stringify({
      enabled: !m.enabled,
    })});
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
  }

  async function commitAutoMap(rows: ReviewRow[], _nodeId: number | null, _lpId: string | null) {
    const result = await api<BulkResult>('/api/v1/symbol-mappings/import', { method: 'POST', body: JSON.stringify({
      lp_id: lpId ?? '',
      rows: rows.map(r => ({ mt5_symbol: r.mt5_symbol, lp_symbol: r.lp_symbol })),
    })});
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    setAutoMapRows(null);
    setStatusMsg({ text: `Auto-mapped ${(result.inserted + (result.updated ?? 0))} symbols${(result.errors?.length ?? result.conflicts?.length ?? 0) ? ` · ${result.errors.length} errors` : ''}`, ok: result.errors.length === 0 });
  }

  async function handleBulk(rows: { mt5_symbol: string; lp_symbol: string }[], filename: string) {
    const result = await api<BulkResult>('/api/v1/symbol-mappings/import', { method: 'POST', body: JSON.stringify({ lp_id: lpId ?? '', rows }) });
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    return result;
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await api(`/api/v1/symbol-mappings/${deleteTarget.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    setDeleteTarget(null);
  }

  const filtered = mappings.filter(m => !search
    || m.mt5_symbol.toLowerCase().includes(search.toLowerCase())
    || m.lp_symbol.toLowerCase().includes(search.toLowerCase())
    || (m.lp_name ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const isAlreadyMapped = !!(addMt5 && mappedSet.has(addMt5));

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-0 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Symbol Mapping</h1>
            <p className="text-sm text-text-secondary mt-0.5">MT5 symbols → LP instruments — STP routing prerequisite</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span><span className="font-mono text-text-primary">{mappings.length}</span> mappings</span>
              <span className="opacity-30">·</span>
              <span style={{ color: connNodes.length > 0 ? '#66e07a' : undefined }}><span className="font-mono">{connNodes.length}</span> nodes</span>
              <span className="opacity-30">·</span>
              <span style={{ color: lps.length > 0 ? '#66e07a' : undefined }}><span className="font-mono">{lps.length}</span> LPs</span>
              {unmappedPending.length > 0 && (<>
                <span className="opacity-30">·</span>
                <span style={{ color: '#e0a030' }}><span className="font-mono">{unmappedPending.length}</span> unmapped</span>
              </>)}
            </div>
            <button onClick={() => setHistoryOpen(true)}
              className="btn btn-ghost text-xs border border-border px-2.5 py-1.5 flex items-center gap-1.5">
              <IcoHistory />Import Log
            </button>
            <button onClick={() => setBulkOpen(true)}
              className="btn btn-ghost text-xs border border-border px-2.5 py-1.5 flex items-center gap-1.5">
              <IcoUpload />Bulk CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col p-6 gap-3">

        {/* Unmapped warning */}
        {unmappedPending.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded flex-shrink-0"
            style={{ backgroundColor: '#2a2016', border: '1px solid #6a4a2f' }}>
            <span className="flex-shrink-0 mt-0.5" style={{ color: '#e0a030' }}><IcoWarn /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: '#e0a030' }}>
                There {unmappedPending.length === 1 ? 'is' : 'are'} {unmappedPending.length} B-Book symbol{unmappedPending.length !== 1 ? 's' : ''} with open
                positions that {unmappedPending.length === 1 ? 'has' : 'have'} no mapping to an active Liquidity Provider.
                Without a mapping, these positions cannot be hedged via STP.
              </p>
              <p className="text-xs mt-1" style={{ color: '#a07030' }}>
                Affected: {unmappedPending.map(u => u.mt5_symbol).join(', ')}
              </p>
            </div>
            <button
              onClick={() => setAutoMapRows(buildAutoMapRows())}
              className="btn text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 self-center"
              style={{ backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }}>
              Review &amp; Map →
            </button>
          </div>
        )}

        {/* Add Mapping strip */}
        <div id="add-mapping-strip" className="flex-shrink-0 rounded border" style={{ backgroundColor: '#313032', border: '1px solid #404040' }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: '#404040' }}>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Add Mapping</span>
            <span className="text-xs text-text-muted ml-2">— saving an existing MT5 symbol updates it</span>
          </div>
          <div className="px-4 py-3 flex items-end gap-3 flex-wrap">
            {/* Node */}
            <div className="flex flex-col gap-1" style={{ minWidth: 170 }}>
              <label className="text-xs text-text-muted">MT5 Node</label>
              <select className="input text-sm" value={nodeId ?? ''} onChange={e => setNodeId(Number(e.target.value))}
                disabled={connNodes.length === 0}
                style={{ height: 30, opacity: connNodes.length === 0 ? 0.4 : 1, cursor: connNodes.length === 0 ? 'not-allowed' : undefined }}>
                {connNodes.length === 0
                  ? <option>No nodes</option>
                  : connNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
              </select>
            </div>

            {/* MT5 symbol */}
            <div className="flex flex-col gap-1" style={{ minWidth: 200 }}>
              <label className="text-xs text-text-muted">
                MT5 Symbol{loadingMt5 ? ' (loading…)' : mt5Syms.length ? ` (${mt5Syms.length})` : ''}
              </label>
              <SearchSelect value={addMt5} onChange={pickAddMt5} options={mt5Opts}
                placeholder={loadingMt5 ? 'Loading…' : 'Select symbol…'}
                disabled={loadingMt5 || mt5Opts.length === 0} ctrlHeight={30} />
            </div>

            <div className="flex-shrink-0 text-text-muted" style={{ paddingBottom: 7 }}>→</div>

            {/* LP */}
            <div className="flex flex-col gap-1" style={{ minWidth: 170 }}>
              <label className="text-xs text-text-muted">
                Liquidity Provider
                {lpStatus && (
                  <span className="ml-1" style={{ color: lpConnected ? '#4ecdc4' : '#666' }}>
                    ● {lpConnected ? 'connected' : lpStatus.state}
                  </span>
                )}
              </label>
              <select className="input text-sm" value={lpId ?? ''} onChange={e => setLpId(e.target.value)}
                disabled={lps.length === 0}
                style={{ height: 30, opacity: lps.length === 0 ? 0.4 : 1, cursor: lps.length === 0 ? 'not-allowed' : undefined }}>
                {lps.length === 0
                  ? <option>No LPs</option>
                  : lps.map(l => <option key={l.lp_id} value={l.lp_id}>{l.lp_name}</option>)}
              </select>
            </div>

            {/* LP symbol */}
            <div className="flex flex-col gap-1" style={{ minWidth: 200 }}>
              <label className="text-xs text-text-muted">LP Instrument Symbol <span style={{ color: '#555' }}>{instrStatus}</span></label>
              <ComboInput value={addLpSym} onChange={v => { setAddLpSym(v); setAddErr(''); }}
                options={lpOpts} placeholder="Type or select…" ctrlHeight={30} />
            </div>

            {/* Lot Multiplier */}
            <div className="flex flex-col gap-1" style={{ minWidth: 110 }}>
              <label className="text-xs text-text-muted"
                title="For every 1 lot traded on MT5, this many lots are sent to the LP. Auto-calculated from contract sizes. Leave blank (or 1) when both sides use identical lot sizes.">
                Lot Multiplier <span style={{ color: '#555', fontSize: 10 }}>ⓘ</span>
              </label>
              <input type="text" inputMode="decimal" value={addMult}
                onChange={e => setAddMult(e.target.value)} placeholder="1 (auto)"
                className="input text-sm font-mono" style={{ height: 30 }} />
            </div>

            {/* Price Digits */}
            <div className="flex flex-col gap-1" style={{ minWidth: 90 }}>
              <label className="text-xs text-text-muted"
                title="Number of decimal places in prices sent to this LP. Defaults to the MT5 symbol's digits if left blank.">
                Price Digits <span style={{ color: '#555', fontSize: 10 }}>ⓘ</span>
              </label>
              <input type="text" inputMode="numeric" value={addPrec}
                onChange={e => setAddPrec(e.target.value)} placeholder="auto"
                className="input text-sm font-mono" style={{ height: 30 }} />
            </div>

            {/* Error + add button */}
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: addErr ? '#ff6b6b' : 'transparent' }}>
                {addErr || '.'}
              </label>
              <button onClick={handleAdd}
                disabled={addBusy || !addMt5.trim() || !addLpSym.trim()}
                className="btn text-xs px-3 flex items-center gap-1.5 whitespace-nowrap"
                style={{ height: 30, ...(addBusy || !addMt5.trim() || !addLpSym.trim()
                  ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
                  : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }) }}>
                <IcoPlus />{addBusy ? 'Saving…' : isAlreadyMapped ? 'Update' : 'Add Mapping'}
              </button>
            </div>
          </div>
          {statusMsg && (
            <div className="px-4 pb-2.5 text-xs" style={{ color: statusMsg.ok ? '#66e07a' : '#ff6b6b' }}>
              {statusMsg.text}
            </div>
          )}
        </div>

        {/* Table — flex-1, fills remaining height */}
        <div id="configured-mappings" className="flex-1 min-h-0 flex flex-col overflow-hidden rounded" style={{ border: '1px solid #404040' }}>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ backgroundColor: '#1e1e20', borderBottom: '1px solid #404040' }}>
            <span className="font-mono font-medium uppercase tracking-wider text-[#666]" style={{ fontSize: 10 }}>Configured Mappings</span>
            <div className="relative ml-2">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }}><IcoSearch /></span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
                className="font-mono text-xs text-white rounded px-2 py-1 pl-7 placeholder-[#555]"
                style={{ width: 180, backgroundColor: '#2a2a2c', border: '1px solid #404040', outline: 'none' }} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#666] hover:text-white">
                  <IcoX size={11} />
                </button>
              )}
            </div>
            <span className="font-mono text-[#555]" style={{ fontSize: 10 }}>{filtered.length} / {mappings.length}</span>
            <div className="flex-1" />
            {rowErr && (
              <span className="font-mono flex items-center gap-1" style={{ fontSize: 10, color: '#ff6b6b' }}>
                <IcoWarn />{rowErr}
              </span>
            )}
            <button onClick={() => refetch()} className="text-[#666] hover:text-white p-1" title="Refresh">
              <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12,4c-1.948,0-3.785.768-5.162,2.081l-1.837-2.209v5.128h5.12l-2.145-2.577C8.905,5.514,10.145,4.981,11.5,4.981c2.757,0,5,2.243,5,5s-2.243,5-5,5c-1.429,0-2.733-.574-3.695-1.506l-1.42,1.461c1.341,1.302,3.16,2.045,5.115,2.045,4.071,0,7.342-3.178,7.494-7.213C18.916,5.505,15.689,4,12,4Z"/></svg>
            </button>
          </div>

          {/* Table body */}
          <div className="flex-1 overflow-auto" style={{ backgroundColor: '#232225' }}>
            {mapsErr ? (
              <div className="py-10 text-center">
                <p className="font-mono text-xs mb-3" style={{ color: '#ff6b6b' }}>Failed to load mappings</p>
                <button onClick={() => refetch()}
                  className="font-mono text-xs px-3 py-1 rounded"
                  style={{ backgroundColor: '#2a2a2c', border: '1px solid #404040', color: '#999' }}>Retry</button>
              </div>
            ) : loadingMaps ? (
              <div className="py-10 text-center font-mono text-xs text-[#666]">Loading…</div>
            ) : (
              <table className="border-collapse" style={{ width: '100%', minWidth: 1460 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  {/* Group row */}
                  <tr style={{ backgroundColor: '#1a1a1c', borderBottom: '1px solid #333' }}>
                    <th colSpan={6} className="px-3 py-1 text-left font-mono font-semibold"
                      style={{ fontSize: 10, color: '#4ecdc4', letterSpacing: '0.07em', borderRight: '1px solid #3a3a3c' }}>
                      MT5 Server Name
                    </th>
                    <th colSpan={2} className="px-3 py-1 text-center font-mono font-semibold"
                      style={{ fontSize: 10, color: '#c09030', letterSpacing: '0.07em', borderRight: '1px solid #3a3a3c', backgroundColor: '#1c1a0e' }}>
                      Normalizers
                    </th>
                    <th colSpan={7} className="px-3 py-1 text-left font-mono font-semibold"
                      style={{ fontSize: 10, color: '#4ecdc4', letterSpacing: '0.07em', borderRight: '1px solid #3a3a3c' }}>
                      LP Server Name
                    </th>
                    <th style={{ backgroundColor: '#1a1a1c' }} />
                  </tr>
                  {/* Column headers */}
                  <tr style={{ backgroundColor: '#1e1e20', borderBottom: '1px solid #333' }}>
                    <TH right title="Standard contract size on MT5">Std Lot Size</TH>
                    <TH center title="Trades measured in units">Trades in Units</TH>
                    <TH center title="Trades measured in lots">Trades in Lots</TH>
                    <TH right title="Live ask price from MT5 (read-only)">Snap Quote</TH>
                    <TH>MT5 Server</TH>
                    <TH sep>MT5 Symbol</TH>
                    <TH center norm title="MT5 volume × Size Normalizer = LP volume">Size Normalizer</TH>
                    <TH center norm sep title="MT5 price × Price Normalizer = LP price">Price Normalizer</TH>
                    <TH>LP Symbol</TH>
                    <TH>LP Server</TH>
                    <TH right title="Live ask price from LP">Snap Quote</TH>
                    <TH center title="LP accepts lots">Trades in Lots</TH>
                    <TH center title="LP accepts units">Trades in Units</TH>
                    <TH right title="Minimum order size at LP">Min. Size</TH>
                    <TH sep right title="Standard contract size at LP">Std Lot Size</TH>
                    <TH right>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={16} className="py-12 text-center font-mono text-xs text-[#555]">
                      {search ? `No results for "${search}"` : 'No mappings configured yet'}
                    </td></tr>
                  ) : filtered.map((m, idx) => {
                    const isEditing = editingId === m.id;
                    const isSaving  = savingId  === m.id;
                    const sq        = snapQuotes.get(m.id);
                    const isLast    = idx === filtered.length - 1;

                    const mt5Info  = mt5Syms.find(s => s.symbol === m.mt5_symbol);
                    const lpInstr  = lpInstrs.find(i => i.symbol === m.lp_symbol || i.canonical_symbol === m.lp_symbol);
                    const mt5Lot   = mt5Info?.contract_size;
                    const lpLot    = lpInstr?.contract_multiplier;
                    const nodeName = connNodes.find(n => n.node_id === nodeId)?.node_name ?? '—';

                    const editTxt = (field: keyof RowEdit, right?: boolean) => (
                      <input type="text" value={(editForm as any)[field] ?? ''}
                        onChange={e => setEditForm(f => f ? { ...f, [field]: e.target.value } : f)}
                        className="font-mono text-xs text-white w-full rounded px-1.5 py-0.5"
                        style={{ backgroundColor: '#141418', border: '1px solid #4ecdc4', outline: 'none',
                                 textAlign: right ? 'right' : 'left' }} />
                    );
                    const editYN = (field: keyof RowEdit) => (
                      <select value={(editForm as any)[field] ?? ''}
                        onChange={e => setEditForm(f => f ? { ...f, [field]: e.target.value } : f)}
                        className="font-mono text-xs text-white w-full rounded px-1 py-0.5"
                        style={{ backgroundColor: '#141418', border: '1px solid #4ecdc4', outline: 'none' }}>
                        <option value="">—</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    );
                    const dispYN = (v?: boolean) =>
                      v == null ? <span style={{ color: '#3a3a3c' }}>—</span>
                               : <span style={{ color: v ? '#66e07a' : '#777' }}>{v ? 'Yes' : 'No'}</span>;

                    return (
                      <tr key={m.id}
                        style={{
                          borderBottom: '1px solid #282828',
                          backgroundColor: isEditing ? '#252530' : undefined,
                          opacity: m.enabled === false ? 0.45 : 1,
                        }}
                        onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.backgroundColor = '#282828'; }}
                        onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}>

                        {/* MT5 Std Lot Size — read-only from symbols API */}
                        <TD right>{mt5Lot != null
                          ? <span className="text-white">{mt5Lot.toLocaleString()}</span>
                          : <span style={{ color: '#3a3a3c' }}>—</span>}
                        </TD>

                        <TD center>{isEditing ? editYN('mt5_trades_in_units') : dispYN(m.mt5_trades_in_units)}</TD>
                        <TD center>{isEditing ? editYN('mt5_trades_in_lots')  : dispYN(m.mt5_trades_in_lots)}</TD>

                        {/* MT5 Snap Quote — no REST endpoint; placeholder */}
                        <TD right><span style={{ color: '#3a3a3c' }}>—</span></TD>

                        <TD><span className="text-[#777] truncate block" style={{ maxWidth: 130 }}>{nodeName}</span></TD>
                        <TD sep><span className="text-white font-semibold">{m.mt5_symbol}</span></TD>

                        {/* Normalizers */}
                        <TD center norm>
                          {isEditing ? editTxt('volume_multiplier', true)
                            : <span style={{ color: (m.volume_multiplier ?? 1) !== 1 ? '#e0c060' : '#555' }}>
                                ×{m.volume_multiplier ?? 1}
                              </span>}
                        </TD>
                        <TD center norm sep>
                          {isEditing ? editTxt('price_multiplier', true)
                            : <span style={{ color: (m.price_multiplier ?? 1) !== 1 ? '#e0c060' : '#555' }}>
                                ×{m.price_multiplier ?? 1}
                              </span>}
                        </TD>

                        {/* LP Symbol */}
                        <TD>
                          {isEditing
                            ? <ComboInput value={editForm!.lp_symbol}
                                onChange={v => setEditForm(f => f ? { ...f, lp_symbol: v } : f)}
                                options={lpOpts} placeholder="LP symbol" ctrlHeight={22} />
                            : <span className="text-[#ccc]">{m.lp_symbol}</span>}
                        </TD>

                        {/* LP Server */}
                        <TD>
                          {isEditing
                            ? <SearchSelect value={editForm!.lp_name}
                                onChange={v => setEditForm(f => f ? { ...f, lp_name: v } : f)}
                                options={lpNameOpts} placeholder="LP…" ctrlHeight={22} />
                            : <span className="text-[#777]">{m.lp_name ?? <span style={{ color: '#3a3a3c' }}>—</span>}</span>}
                        </TD>

                        {/* LP Snap Quote */}
                        <TD right>
                          {sq?.loading
                            ? <span className="text-[#555]">…</span>
                            : sq?.lp != null
                              ? <span style={{ color: '#e0c060' }}>{sq.lp.toFixed(5)}</span>
                              : <span style={{ color: '#3a3a3c' }}>—</span>}
                        </TD>

                        <TD center>{isEditing ? editYN('lp_trades_in_lots')  : dispYN(m.lp_trades_in_lots)}</TD>
                        <TD center>{isEditing ? editYN('lp_trades_in_units') : dispYN(m.lp_trades_in_units)}</TD>

                        {/* Min. Size */}
                        <TD right>
                          {isEditing ? editTxt('min_size', true)
                            : m.min_size != null
                              ? <span className="text-[#ccc]">{m.min_size.toLocaleString()}</span>
                              : <span style={{ color: '#3a3a3c' }}>—</span>}
                        </TD>

                        {/* LP Std Lot Size — read-only from instruments API */}
                        <TD sep right>
                          {lpLot != null
                            ? <span className="text-white">{lpLot.toLocaleString()}</span>
                            : <span style={{ color: '#555' }}>Not Supported</span>}
                        </TD>

                        {/* Actions */}
                        <td className="px-2 py-1 whitespace-nowrap" style={{ textAlign: 'right' }}>
                          <div className="flex items-center justify-end gap-1">

                            <button onClick={() => fetchSnapQuote(m)} disabled={sq?.loading || !lpId}
                              title="Fetch live ask price from LP"
                              className="font-mono flex items-center gap-1 rounded px-2 py-0.5"
                              style={{
                                fontSize: 10,
                                backgroundColor: '#1e2a2a', color: '#4ecdc4', border: '1px solid #2a5555',
                                opacity: sq?.loading || !lpId ? 0.4 : 1,
                                cursor: sq?.loading || !lpId ? 'not-allowed' : 'pointer',
                              }}>
                              <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M22,11h-3.28A6.993,6.993,0,0,0,13,5.28V2a1,1,0,0,0-2,0V5.28A6.993,6.993,0,0,0,5.28,11H2a1,1,0,0,0,0,2H5.28A6.993,6.993,0,0,0,11,18.72V22a1,1,0,0,0,2,0V18.72A6.993,6.993,0,0,0,18.72,13H22a1,1,0,0,0,0-2ZM12,17a5,5,0,1,1,5-5A5.006,5.006,0,0,1,12,17Z"/></svg>
                              {sq?.loading ? '…' : 'Snap Quote'}
                            </button>

                            {isEditing ? (
                              <>
                                <button onClick={() => saveEdit(m)} disabled={isSaving}
                                  className="font-mono flex items-center gap-1 rounded px-2 py-0.5"
                                  style={{
                                    fontSize: 10,
                                    ...(isSaving
                                      ? { backgroundColor: '#2a2a2c', color: '#555', border: '1px solid #383838', cursor: 'not-allowed' }
                                      : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }),
                                  }}>
                                  <IcoCheck />{isSaving ? '…' : 'Save'}
                                </button>
                                <button onClick={() => { setEditingId(null); setEditForm(null); setRowErr(null); }}
                                  className="font-mono rounded px-2 py-0.5"
                                  style={{ fontSize: 10, backgroundColor: '#2a2a2c', color: '#888', border: '1px solid #404040' }}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { startEdit(m); setRowErr(null); }}
                                  className="font-mono flex items-center gap-1 rounded px-2 py-0.5"
                                  style={{ fontSize: 10, backgroundColor: '#2a2a2c', color: '#ccc', border: '1px solid #404040' }}>
                                  <IcoEdit />Edit
                                </button>
                                <button onClick={() => setDeleteTarget(m)}
                                  className="font-mono rounded px-2 py-0.5"
                                  style={{ fontSize: 10, backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #5a2530' }}>
                                  Remove
                                </button>
                              </>
                            )}

                            {isLast && !isEditing && (
                              <button
                                onClick={() => document.getElementById('add-mapping-strip')?.scrollIntoView({ behavior: 'smooth' })}
                                className="font-mono flex items-center gap-1 rounded px-2 py-0.5"
                                style={{ fontSize: 10, backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2a5030' }}>
                                <IcoPlus />Add New Row
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Modals */}
      {autoMapRows  && <AutoMapReview rows={autoMapRows} lpOptions={lpOpts} nodes={connNodes} lps={lps} defaultNodeId={nodeId} defaultLpId={lpId} onCommit={commitAutoMap} onClose={() => setAutoMapRows(null)} />}
      {bulkOpen     && <BulkModal onUpload={handleBulk} onClose={() => setBulkOpen(false)} mt5Syms={mt5Syms} nodeName={connNodes.find(n => n.node_id === nodeId)?.node_name ?? ''} lpName={selectedLP?.lp_name ?? ''} />}
      {historyOpen  && <ImportLogModal onClose={() => setHistoryOpen(false)} />}
      {deleteTarget && <DeleteConfirm m={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}

export default SymbolMappingPage;