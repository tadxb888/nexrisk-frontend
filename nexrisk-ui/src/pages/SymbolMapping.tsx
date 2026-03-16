// ============================================================
// Symbol Mapping — MT5 Symbol → LP Instrument
// STP Phase 1 — AG Grid, sticky symbols + normalizers, in-row edit
// ============================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ── API ───────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────
interface LPMapping {
  id: number;
  mt5_symbol: string;
  lp_id: string;
  lp_name: string;
  lp_symbol: string;
  volume_multiplier: number;
  lp_price_precision: number;
  enabled: boolean;
  source: 'manual' | 'auto' | 'imported';
  approved: boolean;
  created_at: string;
  updated_at: string;
  batch_id: string;
  price_multiplier: number;
  mt5_trades_in_lots: boolean;
  mt5_trades_in_units: boolean;
  lp_trades_in_lots: boolean;
  lp_trades_in_units: boolean;
  min_size: number;
  lp_std_lot: number;
}
interface MT5Node      { node_id: number; node_name: string; connection_status: string; is_enabled: boolean; is_master?: boolean; }
interface MT5Symbol    { symbol: string; description: string; digits: number; contract_size: number; calc_mode?: number; volume_min?: number; }
interface LPConfig     { lp_id: string; lp_name: string; enabled: boolean; credentials_set: boolean; }
interface LPStatus     { state: string; trading_session?: { state: string }; md_session?: { state: string }; }
interface LPInstrument { symbol: string; canonical_symbol?: string; description?: string; contract_multiplier?: number; price_precision?: number; min_trade_vol?: number; max_trade_vol?: number; round_lot?: number; has_trade_route?: boolean; instrument_group?: string; }
interface UnmappedSym  { mt5_symbol: string; trader_count: number; total_volume: number; }
interface BulkResult   { inserted: number; updated?: number; skipped: number; conflicts?: string[]; errors?: { mt5_symbol: string; error: string }[]; }
interface BulkRow      { mt5_symbol: string; lp_symbol: string; mt5_trades_in_units?: boolean; mt5_trades_in_lots?: boolean; price_multiplier?: number; volume_multiplier?: number; lp_trades_in_units?: boolean; lp_trades_in_lots?: boolean; min_size?: number; }
interface RowEdit {
  lp_id: string; lp_symbol: string; lp_name: string;
  volume_multiplier: string; lp_price_precision: string; price_multiplier: string;
  mt5_trades_in_units: string; mt5_trades_in_lots: string;
  lp_trades_in_lots: string; lp_trades_in_units: string;
  min_size: string; step_size: string; lp_std_lot: string;
}
interface SnapQuoteSide { price: number; source: 'lp' | 'mt5'; }
interface SnapQuote { mt5?: SnapQuoteSide | 'loading' | 'error'; lp?: SnapQuoteSide | 'loading' | 'error'; }
interface ReviewRow { mt5_symbol: string; lp_symbol: string; confidence: 'exact' | 'derived' | 'fallback'; trader_count: number; total_volume: number; }
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
    ...[3, 4, 5].map(n => (i: LPInstrument) => i.symbol.toUpperCase() === `${up.slice(0,n)}/${up.slice(n)}`),
  ];
  for (const t of tests) { const m = instrs.find(t); if (m) return m; }
  return null;
}

// ── Icons ─────────────────────────────────────────────────────
const IcoPlus    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M19,11h-6V5c0-.553-.448-1-1-1s-1,.447-1,1v6H5c-.552,0-1,.447-1,1s.448,1,1,1h6v6c0,.553.448,1,1,1s1-.447,1-1v-6h6c.552,0,1-.447,1-1s-.448-1-1-1Z"/></svg>;
const IcoTrash   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/></svg>;
const IcoEdit    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M22.987,4.206l-3.193-3.193c-.663-.663-1.542-1.013-2.475-1.013s-1.812.35-2.475,1.013L1.707,14.146c-.286.286-.498.637-.616,1.022L.038,20.617c-.09.305-.004.633.224.855.169.163.393.251.624.251.077,0,.155-.01.231-.029l5.449-1.053c.385-.118.735-.33,1.021-.616l13.131-13.131c.663-.663,1.013-1.542,1.013-2.475s-.35-1.812-1.013-2.475Z"/></svg>;
const IcoCheck   = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M22.319,4.431,8.5,18.249a1,1,0,0,1-1.417,0L1.739,12.9a1,1,0,0,1,0-1.417,1,1,0,0,1,1.417,0l4.636,4.636L20.9,3.014a1,1,0,0,1,1.417,1.417Z"/></svg>;
const IcoX       = ({ size = 12 }: { size?: number }) => <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}><path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/></svg>;
const IcoWarn    = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/></svg>;
const IcoUpload  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M11,16V7.414l-3.293,3.293a1,1,0,0,1-1.414-1.414l5-5a1,1,0,0,1,1.414,0l5,5a1,1,0,0,1-1.414,1.414L13,7.414V16a1,1,0,0,1-2,0ZM21,14a1,1,0,0,0-1,1v4H4V15a1,1,0,0,0-2,0v4a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V15A1,1,0,0,0,21,14Z"/></svg>;
const IcoHistory = () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12,2A10,10,0,1,0,22,12,10.011,10.011,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8.009,8.009,0,0,1,12,20ZM13,7H11v6l4.243,4.243,1.414-1.414L13,12.586Z"/></svg>;

// ── Shared input class (BBook style) ──────────────────────────
const iCls = 'bg-[#232225] border border-[#606060] rounded px-2 py-1 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#4ecdc4]';

// ── Modals ────────────────────────────────────────────────────
function AutoMapReview({ rows: init, nodes, lps, defaultNodeId, defaultLpId, onCommit, onClose }: {
  rows: ReviewRow[]; nodes: { node_id: number; node_name: string }[]; lps: { lp_id: string; lp_name: string }[];
  defaultNodeId: number | null; defaultLpId: string | null;
  onCommit: (rows: ReviewRow[], nodeId: number | null, lpId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(init);
  const [nId, setNId]   = useState<number | null>(defaultNodeId);
  const [lId, setLId]   = useState<string | null>(defaultLpId);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.75)' }}>
      <div className="flex flex-col rounded border border-[#505050]" style={{ width: 860, maxHeight: '88vh', backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#404040]">
          <div>
            <h3 className="text-sm font-semibold text-white">Auto-Map Review</h3>
            <p className="text-xs text-white mt-0.5">Adjust LP symbols before committing</p>
          </div>
          <button onClick={onClose} className="text-[#ccc] hover:text-white"><IcoX size={14} /></button>
        </div>
        <div className="px-5 py-2 flex items-end gap-4 border-b border-[#404040]" style={{ backgroundColor: '#2a292c' }}>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#ccc] uppercase tracking-wider">MT5 Node</label>
            <select value={nId ?? ''} onChange={e => setNId(Number(e.target.value))} className={iCls} style={{ width: 180, color: '#fff' }}>
              {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#ccc] uppercase tracking-wider">Liquidity Provider</label>
            <select value={lId ?? ''} onChange={e => setLId(e.target.value)} className={iCls} style={{ width: 180, color: '#fff' }}>
              {lps.map(l => <option key={l.lp_id} value={l.lp_id}>{l.lp_name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#404040]" style={{ backgroundColor: '#1e1e20' }}>
                <th className="px-4 py-2 text-left text-[#ccc] font-mono font-medium">MT5 Symbol</th>
                <th className="px-4 py-2 text-left text-[#ccc] font-mono font-medium">LP Symbol</th>
                <th className="px-4 py-2 text-center text-[#ccc] font-mono font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.mt5_symbol} className="border-t border-[#2a2a2c]"
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2c')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                  <td className="px-4 py-1.5 font-mono text-white font-semibold">{r.mt5_symbol}</td>
                  <td className="px-4 py-1.5" style={{ minWidth: 200 }}>
                    <input className={iCls + ' w-full'} value={r.lp_symbol}
                      onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, lp_symbol: e.target.value } : x))} />
                  </td>
                  <td className="px-4 py-1.5 text-center font-mono text-[10px]"
                    style={{ color: { exact: '#66e07a', derived: '#4ecdc4', fallback: '#e0a020' }[r.confidence] }}>
                    {{ exact: 'Exact', derived: 'Derived', fallback: 'Fallback' }[r.confidence]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className="px-5 py-2 text-xs text-[#ff6b6b] border-t border-[#404040]">{err}</p>}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#404040]">
          <span className="text-xs text-[#ccc] font-mono">{rows.length} mappings</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="text-xs text-white hover:text-white px-3 py-1.5 border border-[#404040] rounded">Cancel</button>
            <button disabled={busy}
              onClick={async () => { setBusy(true); setErr(''); try { await onCommit(rows, nId, lId); } catch(e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false); }}}
              className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
              style={busy
                ? { backgroundColor: '#2a2a2c', color: '#555', border: '1px solid #383838' }
                : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
              <IcoCheck />{busy ? 'Committing…' : `Commit ${rows.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkModal({ onUpload, onClose, mt5Syms, nodeName, lpName, mappings }: {
  onUpload: (rows: BulkRow[], fn: string) => Promise<BulkResult>;
  onClose: () => void; mt5Syms: MT5Symbol[]; nodeName: string; lpName: string;
  mappings: LPMapping[];
}) {
  const [rows, setRows]     = useState<BulkRow[]>([]);
  const [filename, setFn]   = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const header1 = `Symbol mapping-MT5: ${nodeName || 'Unknown'} - LP: ${lpName || 'Unknown'},,,,,,,,`;
    const header2 = `MT5Symbol,Trades in Units,Trades in Lots,Price Normalizer,Size Normalizer,LPSymbol,Trades in Units,Trades in Lots,Min.Size`;
    const dataRows = mt5Syms.length > 0
      ? mt5Syms.map(s => {
          const existing = mappings.find(m => m.mt5_symbol === s.symbol);
          if (existing) {
            return [
              s.symbol,
              existing.mt5_trades_in_units ? 'Yes' : 'No',
              existing.mt5_trades_in_lots  ? 'Yes' : 'No',
              existing.price_multiplier  ?? 1,
              existing.volume_multiplier ?? 1,
              existing.lp_symbol,
              existing.lp_trades_in_units ? 'Yes' : 'No',
              existing.lp_trades_in_lots  ? 'Yes' : 'No',
              existing.min_size ?? '',
            ].join(',');
          }
          return `${s.symbol},,,,,,,,`;
        })
      : ['EURUSD,,,,,,,,', 'GBPUSD,,,,,,,,', 'XAUUSD,,,,,,,,'];
    const csv = [header1, header2, ...dataRows].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `symbol-mapping_${(nodeName || 'mt5').replace(/\s+/g, '_')}.csv`;
    a.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFn(f.name); setErr(''); setResult(null);
    const r = new FileReader();
    r.onload = ev => {
      const allLines = (ev.target?.result as string).trim().split(/\r?\n/);
      // Skip title row (row 1) and find header row (contains MT5Symbol)
      const hdrIdx = allLines.findIndex(l => l.includes('MT5Symbol'));
      if (hdrIdx === -1) { setErr('Header row with MT5Symbol not found'); return; }
      const hdrs = allLines[hdrIdx].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const dataLines = allLines.slice(hdrIdx + 1).filter(l => l.trim());
      const toBool = (v: string): boolean | undefined => {
        if (v.toLowerCase() === 'yes') return true;
        if (v.toLowerCase() === 'no') return false;
        return undefined;
      };
      const parsed: BulkRow[] = dataLines.map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const get = (i: number) => cols[i] ?? '';
        // Headers: MT5Symbol(0), MT5 Units(1), MT5 Lots(2), Price Norm(3), Size Norm(4), LPSymbol(5), LP Units(6), LP Lots(7), Min.Size(8)
        return {
          mt5_symbol:          get(0),
          mt5_trades_in_units: toBool(get(1)),
          mt5_trades_in_lots:  toBool(get(2)),
          price_multiplier:    get(3) ? parseFloat(get(3)) : undefined,
          volume_multiplier:   get(4) ? parseFloat(get(4)) : undefined,
          lp_symbol:           get(5) || get(0), // fallback to mt5_symbol if lp_symbol blank
          lp_trades_in_units:  toBool(get(6)),
          lp_trades_in_lots:   toBool(get(7)),
          min_size:            get(8) ? parseFloat(get(8)) : undefined,
        };
      }).filter(r => r.mt5_symbol);
      if (!parsed.length) { setErr('No data rows found'); return; }
      setRows(parsed);
    };
    r.readAsText(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.75)' }}>
      <div className="flex flex-col rounded border border-[#505050]" style={{ width: 500, maxHeight: '85vh', backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#404040]">
          <h3 className="text-sm font-semibold text-white">Bulk CSV Upload</h3>
          <button onClick={onClose} className="text-[#ccc] hover:text-white"><IcoX size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <p className="text-[10px] text-[#ccc] uppercase tracking-wider mb-2">Step 1 — Download template</p>
            <div className="flex items-center justify-between p-3 rounded border border-[#404040]" style={{ backgroundColor: '#1e1e20' }}>
              <span className="text-xs text-white">Pre-filled with <span className="text-white">{mt5Syms.length}</span> MT5 symbols from <span className="text-white">{nodeName || 'node'}</span></span>
              <button onClick={downloadTemplate} className="text-xs px-2.5 py-1 rounded flex items-center gap-1"
                style={{ backgroundColor: '#1a1e20', color: '#4ecdc4', border: '1px solid #2a4040' }}>
                <IcoUpload />Download
              </button>
            </div>
          </div>
          <div className="border-t border-[#383838]" />
          <div>
            <p className="text-[10px] text-[#ccc] uppercase tracking-wider mb-2">Step 2 — Upload filled file</p>
            {!result ? (
              <>
                <div onClick={() => fileRef.current?.click()}
                  className="rounded p-6 text-center cursor-pointer border-2 border-dashed border-[#404040] hover:border-[#606060]">
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                  <div className="flex justify-center mb-2 text-[#ccc]"><IcoUpload /></div>
                  <p className="text-xs text-[#ccc]">
                    {filename ? <span className="text-white">{filename} — {rows.length} rows</span> : 'Click to select CSV'}
                  </p>
                </div>
                {err && <p className="text-xs text-[#ff6b6b] mt-2 flex items-center gap-1"><IcoWarn />{err}</p>}
              </>
            ) : (
              <div className="p-3 rounded text-xs border"
                style={!result.errors?.length
                  ? { backgroundColor: '#162a1c', borderColor: '#2f6a3d', color: '#66e07a' }
                  : { backgroundColor: '#2a2016', borderColor: '#5a4020', color: '#e0a020' }}>
                Upload complete: {result.inserted} added · {result.updated ?? 0} updated · {result.skipped} skipped
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#404040]">
          <button onClick={onClose} className="text-xs text-white hover:text-white px-3 py-1.5 border border-[#404040] rounded">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button disabled={!rows.length || busy}
              onClick={async () => { setBusy(true); setErr(''); try { setResult(await onUpload(rows, filename)); } catch(e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }}}
              className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
              style={!rows.length || busy
                ? { backgroundColor: '#2a2a2c', color: '#555', border: '1px solid #383838' }
                : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
              <IcoUpload />{busy ? 'Uploading…' : `Upload ${rows.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportLogModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['mapping-lp-history'],
    queryFn: () => api<{ history: { id: number; batch_id: string; filename: string; row_count: number; inserted: number; updated: number; errors: number; uploaded_at: string }[] }>('/api/v1/mappings/history?type=lp&limit=50'),
    staleTime: 30_000,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.75)' }}>
      <div className="flex flex-col rounded border border-[#505050]" style={{ width: 580, maxHeight: '80vh', backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#404040]">
          <h3 className="text-sm font-semibold text-white">Bulk Import Log</h3>
          <button onClick={onClose} className="text-[#ccc] hover:text-white"><IcoX size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading
            ? <div className="py-10 text-center text-xs text-[#ccc]">Loading…</div>
            : !(data?.history ?? []).length
              ? <div className="py-10 text-center text-xs text-[#ccc]">No bulk imports on record.</div>
              : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#404040]" style={{ backgroundColor: '#1e1e20' }}>
                      {['Date', 'File', 'Rows', 'Added', 'Updated', 'Errors'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-[#ccc] font-mono font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.history ?? []).map(h => (
                      <tr key={h.id} className="border-t border-[#2a2a2c]"
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2c')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                        <td className="px-4 py-2 font-mono text-white">
                          {new Date(h.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-2 font-mono text-white truncate" style={{ maxWidth: 180 }}>{h.filename || h.batch_id}</td>
                        <td className="px-4 py-2 font-mono text-white">{h.row_count}</td>
                        <td className="px-4 py-2 font-mono" style={{ color: h.inserted > 0 ? '#66e07a' : '#555' }}>{h.inserted}</td>
                        <td className="px-4 py-2 font-mono text-white">{h.updated}</td>
                        <td className="px-4 py-2 font-mono" style={{ color: h.errors > 0 ? '#ff6b6b' : '#555' }}>{h.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-[#404040]">
          <button onClick={onClose} className="text-xs text-white hover:text-white px-3 py-1.5 border border-[#404040] rounded">Close</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ m, onConfirm, onClose }: { m: LPMapping; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.75)' }}>
      <div className="rounded border border-[#505050]" style={{ width: 300, backgroundColor: '#232225' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#404040]">
          <h3 className="text-sm font-semibold text-white">Remove Mapping</h3>
          <button onClick={onClose} className="text-[#ccc] hover:text-white"><IcoX /></button>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-white">
            Remove <span className="font-mono text-white">{m.mt5_symbol}</span> → <span className="font-mono text-white">{m.lp_symbol}</span>? Cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#404040]">
          <button onClick={onClose} disabled={busy} className="text-xs text-white hover:text-white px-3 py-1.5 border border-[#404040] rounded">Cancel</button>
          <button disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } catch { setBusy(false); }}}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
            style={busy
              ? { backgroundColor: '#2a2a2c', color: '#555', border: '1px solid #383838' }
              : { backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            <IcoTrash />{busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export function SymbolMappingPage() {
  const qc = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();

  // Persist node, LP and search in URL so refresh restores state
  const nodeIdParam = searchParams.get('node');
  const lpIdParam   = searchParams.get('lp');
  const searchParam = searchParams.get('q') ?? '';

  const nodeId = nodeIdParam ? Number(nodeIdParam) : null;
  const lpId   = lpIdParam ?? null;
  const search = searchParam;

  const setNodeId = (v: number | null) =>
    setSearchParams(p => { const n = new URLSearchParams(p); v === null ? n.delete('node') : n.set('node', String(v)); return n; }, { replace: true });
  const setLpId = (v: string | null) =>
    setSearchParams(p => { const n = new URLSearchParams(p); v === null ? n.delete('lp') : n.set('lp', v); return n; }, { replace: true });
  const setSearch = (v: string) =>
    setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set('q', v) : n.delete('q'); return n; }, { replace: true });
  const [addMt5,      setAddMt5]      = useState('');
  const [addLpSym,    setAddLpSym]    = useState('');
  const [addMult,     setAddMult]     = useState('');
  const [addPriceX,   setAddPriceX]   = useState('');
  const [addMt5Lots,  setAddMt5Lots]  = useState('');
  const [addMt5Units, setAddMt5Units] = useState('');
  const [addLpLots,   setAddLpLots]   = useState('');
  const [addLpUnits,  setAddLpUnits]  = useState('');
  const [addMinSize,  setAddMinSize]  = useState('');
  const [addBusy,     setAddBusy]     = useState(false);
  const [addErr,      setAddErr]      = useState('');
  const [statusMsg,   setStatusMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [editForm,    setEditForm]    = useState<RowEdit | null>(null);
  const [savingId,    setSavingId]    = useState<number | null>(null);
  const [deleteTarget,setDeleteTarget]= useState<LPMapping | null>(null);
  const [rowErr,      setRowErr]      = useState<string | null>(null);
  const [autoMapRows, setAutoMapRows] = useState<ReviewRow[] | null>(null);
  const [bulkOpen,    setBulkOpen]    = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapQuotes,  setSnapQuotes]  = useState<Map<number, SnapQuote>>(new Map());

  // ── Queries ────────────────────────────────────────────────
  const { data: mappingData, isLoading: loadingMaps, error: mapsErr, refetch } = useQuery({
    queryKey: ['mappings-lp'],
    queryFn:  () => api<{ mappings: LPMapping[] }>('/api/v1/symbol-mappings'),
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
  const { data: mt5SymAllData, isFetching: loadingMt5All } = useQuery({
    queryKey: ['mt5-symbols-all'],
    queryFn:  () => api<{ symbols: MT5Symbol[] }>('/api/v1/symbol-mappings/mt5-symbols'),
    staleTime: 60_000,
    enabled: nodeId === null,
  });
  const { data: mt5SymNodeData, isFetching: loadingMt5Node } = useQuery({
    queryKey: ['mt5-symbols-node', nodeId],
    queryFn:  () => api<{ symbols: MT5Symbol[] }>(`/api/v1/mt5/nodes/${nodeId}/symbols`),
    staleTime: 60_000,
    enabled: nodeId !== null,
  });
  const mt5SymData   = nodeId === null ? mt5SymAllData   : mt5SymNodeData;
  const loadingMt5   = nodeId === null ? loadingMt5All   : loadingMt5Node;
  const { data: instrData, isFetching: loadingInstrs } = useQuery({
    queryKey: ['lp-instruments', lpId],
    queryFn:  () => api<{ success: boolean; data: { lp_id: string; count: number; list_complete: boolean; instruments: LPInstrument[] } }>(`/api/v1/fix/lp/${lpId}/instruments`),
    enabled: !!lpId, staleTime: 120_000, retry: 1,
  });
  const { data: lpStatusData } = useQuery({
    queryKey: ['lp-status', lpId],
    queryFn:  () => api<{ success: boolean; data: LPStatus }>(`/api/v1/fix/lp/${lpId}`),
    enabled: !!lpId, staleTime: 15_000, refetchInterval: 20_000, retry: false,
  });
  const { data: unmappedData } = useQuery({
    queryKey: ['mappings-lp-unmapped'],
    queryFn:  () => api<{ unmapped: string[] }>('/api/v1/symbol-mappings/unmapped'),
    staleTime: 30_000,
  });

  // ── Derived ────────────────────────────────────────────────
  const mappings    = mappingData?.mappings ?? [];
  const connNodes   = (nodeData?.nodes ?? []).filter(n => n.connection_status === 'CONNECTED' && n.is_enabled);
  const lps         = (lpListData?.data?.lps ?? []).filter(l => l.enabled);
  const mt5Syms     = mt5SymData?.symbols ?? [];
  const lpInstrs    = instrData?.data?.instruments ?? [];
  const listComplete = instrData?.data?.list_complete ?? false;
  const unmapped    = (unmappedData?.unmapped ?? []).map(sym => ({ mt5_symbol: sym, trader_count: 0, total_volume: 0 }));
  const lpStatus    = lpStatusData?.data;
  const lpConnected = lpStatus?.state === 'CONNECTED' || lpStatus?.trading_session?.state === 'LOGGED_ON';
  const selectedLP  = lps.find(l => l.lp_id === lpId);
  const mappedSet   = new Set(mappings.map(m => m.mt5_symbol));
  const unmappedPending = unmapped.filter(u => !mappedSet.has(u.mt5_symbol));
  const instrStatus = loadingInstrs ? '(loading…)' : lpInstrs.length > 0 ? `(${lpInstrs.length}${listComplete ? '' : '…'})` : lpConnected ? '(loading…)' : '(offline)';
  const lpNameOpts  = lps.map(l => ({ value: l.lp_name, label: l.lp_name }));

  const filtered = useMemo(() => {
    if (!search.trim()) return mappings;
    const q = search.toLowerCase();
    return mappings.filter(m =>
      m.mt5_symbol.toLowerCase().includes(q) ||
      m.lp_symbol.toLowerCase().includes(q) ||
      (m.lp_name ?? '').toLowerCase().includes(q)
    );
  }, [mappings, search]);

  useEffect(() => { if (!lpId && lps.length) setLpId(lps[0].lp_id); }, [lps.length]);

  // ── Mutations ─────────────────────────────────────────────
  // Derive LP-side fields from an LP instrument object
  function applyLpInstr(instr: LPInstrument) {
    if (instr.min_trade_vol != null) {
      setAddMinSize(String(instr.min_trade_vol));
      // Heuristic: large min_trade_vol (≥1000) means LP quotes in base units (FX typical)
      //            small (<1) means LP quotes in lots
      if (instr.min_trade_vol >= 1000) {
        setAddLpUnits('yes'); setAddLpLots('no');
      } else if (instr.min_trade_vol < 1) {
        setAddLpLots('yes'); setAddLpUnits('no');
      }
    }
  }

  function pickAddMt5(sym: string) {
    setAddMt5(sym); setAddErr('');
    const info = mt5Syms.find(s => s.symbol === sym);
    const instr = autoMatch(sym, lpInstrs);

    // MT5 always reports volume in lots (MetaTrader 5 standard)
    if (info) {
      setAddMt5Lots('yes');
      setAddMt5Units('no');
    }

    if (instr) {
      setAddLpSym(instr.symbol);
      const mult = computeMultiplier(info?.contract_size, instr.contract_multiplier);
      setAddMult(mult !== undefined ? String(mult) : '');
      // price_precision from LP instrument tells us digits, not a multiplier — leave addPriceX for manual input
      applyLpInstr(instr);
    } else {
      setAddLpSym(sym);
      setAddMult('');
    }
  }

  function pickAddLpSym(sym: string) {
    setAddLpSym(sym); setAddErr('');
    const instr = lpInstrs.find(i => i.symbol === sym || i.canonical_symbol === sym);
    if (instr) applyLpInstr(instr);
  }

  async function handleAdd() {
    if (!addMt5.trim())   { setAddErr('Select an MT5 symbol'); return; }
    if (!addLpSym.trim()) { setAddErr('Enter LP symbol'); return; }
    if (!lpId)            { setAddErr('Select a Liquidity Provider'); return; }
    setAddBusy(true); setAddErr('');
    try {
      const toBool = (v: string) => v === 'yes' ? true : v === 'no' ? false : undefined;
      const existing = mappings.find(m => m.mt5_symbol === addMt5.trim() && m.lp_id === lpId);
      if (existing) {
        await api(`/api/v1/symbol-mappings/${existing.id}`, { method: 'PUT', body: JSON.stringify({
          lp_symbol: addLpSym.trim(),
          volume_multiplier: addMult   ? parseFloat(addMult)   : undefined,
          price_multiplier:  addPriceX ? parseFloat(addPriceX) : undefined,
          mt5_trades_in_lots:  toBool(addMt5Lots),
          mt5_trades_in_units: toBool(addMt5Units),
          lp_trades_in_lots:   toBool(addLpLots),
          lp_trades_in_units:  toBool(addLpUnits),
          min_size: addMinSize ? parseFloat(addMinSize) : undefined,
        })});
      } else {
        await api('/api/v1/symbol-mappings', { method: 'POST', body: JSON.stringify({
          mt5_symbol: addMt5.trim(), lp_id: lpId, lp_symbol: addLpSym.trim(),
          volume_multiplier: addMult   ? parseFloat(addMult)   : undefined,
          price_multiplier:  addPriceX ? parseFloat(addPriceX) : undefined,
          mt5_trades_in_lots:  toBool(addMt5Lots),
          mt5_trades_in_units: toBool(addMt5Units),
          lp_trades_in_lots:   toBool(addLpLots),
          lp_trades_in_units:  toBool(addLpUnits),
          min_size: addMinSize ? parseFloat(addMinSize) : undefined,
        })});
      }
      await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
      await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
      setStatusMsg({ text: `${existing ? 'Updated' : 'Added'}: ${addMt5} → ${addLpSym}`, ok: true });
      setAddMt5(''); setAddLpSym(''); setAddMult(''); setAddPriceX('');
      setAddMt5Lots(''); setAddMt5Units(''); setAddLpLots(''); setAddLpUnits(''); setAddMinSize('');
    } catch(e: unknown) { setAddErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setAddBusy(false); }
  }

  const startEdit = useCallback((m: LPMapping) => {
    setEditingId(m.id); setRowErr(null);
    setEditForm({
      lp_id: m.lp_id, lp_symbol: m.lp_symbol, lp_name: m.lp_name ?? '',
      volume_multiplier:   m.volume_multiplier   != null ? String(m.volume_multiplier)   : '',
      lp_price_precision:  m.lp_price_precision  != null ? String(m.lp_price_precision)  : '',
      price_multiplier:    m.price_multiplier     != null ? String(m.price_multiplier)    : '',
      mt5_trades_in_units: m.mt5_trades_in_units  != null ? (m.mt5_trades_in_units ? 'yes' : 'no')  : '',
      mt5_trades_in_lots:  m.mt5_trades_in_lots   != null ? (m.mt5_trades_in_lots  ? 'yes' : 'no')  : '',
      lp_trades_in_lots:   m.lp_trades_in_lots    != null ? (m.lp_trades_in_lots   ? 'yes' : 'no')  : '',
      lp_trades_in_units:  m.lp_trades_in_units   != null ? (m.lp_trades_in_units  ? 'yes' : 'no')  : '',
      min_size:  m.min_size  != null ? String(m.min_size)  : '',
      step_size: m.step_size != null ? String(m.step_size) : '',
      lp_std_lot: m.lp_std_lot != null ? String(m.lp_std_lot) : '',
    });
  }, []);

  const saveEdit = useCallback(async (m: LPMapping) => {
    if (!editForm) return;
    setSavingId(m.id); setRowErr(null);
    try {
      const pn  = (v: string) => v.trim() ? parseFloat(v) : undefined;
      const pnB = (v: string): boolean | undefined => v === 'yes' ? true : v === 'no' ? false : undefined;
      await api(`/api/v1/symbol-mappings/${m.id}`, { method: 'PUT', body: JSON.stringify({
        lp_symbol:           editForm.lp_symbol.trim() || m.lp_symbol,
        lp_name:             editForm.lp_name,
        volume_multiplier:   pn(editForm.volume_multiplier) ?? m.volume_multiplier,
        price_multiplier:    pn(editForm.price_multiplier) ?? m.price_multiplier,
        lp_price_precision:  editForm.lp_price_precision.trim() ? parseInt(editForm.lp_price_precision) : m.lp_price_precision,
        mt5_trades_in_lots:  pnB(editForm.mt5_trades_in_lots)  ?? m.mt5_trades_in_lots,
        mt5_trades_in_units: pnB(editForm.mt5_trades_in_units) ?? m.mt5_trades_in_units,
        lp_trades_in_lots:   pnB(editForm.lp_trades_in_lots)   ?? m.lp_trades_in_lots,
        lp_trades_in_units:  pnB(editForm.lp_trades_in_units)  ?? m.lp_trades_in_units,
        min_size:            pn(editForm.min_size)   ?? m.min_size,
        lp_std_lot:          pn(editForm.lp_std_lot) ?? m.lp_std_lot,
        enabled:             m.enabled,
      })});
      await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
      await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
      setEditingId(null); setEditForm(null);
    } catch(e: unknown) { setRowErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSavingId(null); }
  }, [editForm, qc]);

  const cancelEdit  = useCallback(() => { setEditingId(null); setEditForm(null); setRowErr(null); }, []);

  const fetchSnapQuote = useCallback(async (m: LPMapping) => {
    // Start both sides loading simultaneously
    setSnapQuotes(p => { const n = new Map(p); n.set(m.id, { mt5: 'loading', lp: 'loading' }); return n; });

    // ── LP side: subscribe → poll book up to 3 attempts ──────
    async function fetchLP(): Promise<SnapQuoteSide> {
      // m.lp_id may be absent depending on which mappings endpoint is in use —
      // fall back to the LP selected in the page dropdown (lpId)
      const lid = m.lp_id || lpId;
      if (!lid) throw new Error('no LP');
      await api(`/api/v1/fix/lp/${lid}/md/subscribe`, {
        method: 'POST',
        body: JSON.stringify({ symbol: m.lp_symbol, depth: 1 }),
      }).catch(() => undefined);
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await api<any>(
            `/api/v1/fix/lp/${lid}/md/book/${encodeURIComponent(m.lp_symbol)}`
          );
          // C++ may return { success, data: { best_ask } } or { best_ask } directly
          const book = (res?.data && typeof res.data === 'object') ? res.data : res;
          const ask = book?.best_ask;
          const bid = book?.best_bid;
          if (ask != null && ask > 0) return { price: ask, source: 'lp' };
          if (bid != null && bid > 0) return { price: bid, source: 'lp' };
        } catch { /* try again */ }
      }
      throw new Error('no price');
    }

    // ── MT5 side: read price_current from positions ───────────
    async function fetchMT5(): Promise<SnapQuoteSide> {
      let targetNodeId = nodeId;
      if (targetNodeId === null) {
        // All Servers mode — find master or any connected node
        const nodesRes = await api<{ nodes: MT5Node[] }>('/api/v1/mt5/nodes/status');
        const connected = (nodesRes.nodes ?? []).filter(n => n.connection_status === 'CONNECTED' && n.is_enabled);
        const master = connected.find(n => n.is_master) ?? connected[0];
        if (!master) throw new Error('no node');
        targetNodeId = master.node_id;
      }
      const posRes = await api<{ positions: { symbol: string; price_current: number }[] }>(
        `/api/v1/mt5/nodes/${targetNodeId}/positions`
      );
      const pos = (posRes.positions ?? []).find(p => p.symbol === m.mt5_symbol);
      if (!pos) throw new Error('no positions');
      return { price: pos.price_current, source: 'mt5' };
    }

    const [mt5Result, lpResult] = await Promise.allSettled([fetchMT5(), fetchLP()]);
    setSnapQuotes(p => {
      const n = new Map(p);
      n.set(m.id, {
        mt5: mt5Result.status === 'fulfilled' ? mt5Result.value : 'error',
        lp:  lpResult.status  === 'fulfilled' ? lpResult.value  : 'error',
      });
      return n;
    });
  }, [lpId]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await api(`/api/v1/symbol-mappings/${deleteTarget.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    setDeleteTarget(null);
  }

  async function commitAutoMap(rows: ReviewRow[], _nId: number | null, _lId: string | null) {
    await api<BulkResult>('/api/v1/symbol-mappings/import', { method: 'POST', body: JSON.stringify({
      lp_id: lpId ?? '', rows: rows.map(r => ({ mt5_symbol: r.mt5_symbol, lp_symbol: r.lp_symbol })),
    })});
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    setAutoMapRows(null);
  }

  async function handleBulk(rows: BulkRow[], filename: string) {
    const r = await api<BulkResult>('/api/v1/symbol-mappings/import', { method: 'POST', body: JSON.stringify({ lp_id: lpId ?? '', rows }) });
    await qc.invalidateQueries({ queryKey: ['mappings-lp'] });
    await qc.invalidateQueries({ queryKey: ['mappings-lp-unmapped'] });
    return r;
  }

  function buildAutoMapRows(): ReviewRow[] {
    return unmappedPending.map(u => {
      const instr = autoMatch(u.mt5_symbol, lpInstrs);
      return {
        mt5_symbol: u.mt5_symbol,
        lp_symbol: instr ? instr.symbol : u.mt5_symbol,
        confidence: instr ? (instr.symbol.toUpperCase() === u.mt5_symbol.toUpperCase() ? 'exact' : 'derived') : 'fallback',
        trader_count: u.trader_count, total_volume: u.total_volume,
      };
    });
  }

  // ── Grid context ───────────────────────────────────────────
  const isAlreadyMapped = !!(addMt5 && mappedSet.has(addMt5));

  // ── Table helpers ──────────────────────────────────────────
  // Layout (left→right):
  //   [← scroll: MT5 Snap(95) | Server(130) | Std Lot(88) | Units(68) | Lots(68)]
  //   [STICKY: MT5 Symbol(120) | Size×(72) | Price×(72) | LP Symbol(120)]
  //   [scroll: LP Snap(95) | Server(150) | Std Lot(88) | Lots(68) | Units(68) | Min Size(82) →]
  //   [STICKY right: Actions(170)]
  //
  //   sticky left offsets:  MT5 Symbol=449  Size×=569  Price×=641
  //   sticky right offsets: LP Symbol=170   Actions=0

  const STICKY_BG = '#2a2a2f';
  const ROW_H = 30;

  const th = (label: React.ReactNode, opts: {
    w?: number; right?: boolean; center?: boolean;
    sl?: number; sr?: number; style?: React.CSSProperties;
  } = {}) => {
    const isSticky = opts.sl !== undefined || opts.sr !== undefined;
    return (
      <th style={{
        padding: '0 8px', height: 34,
        fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 500,
        color: '#fff', whiteSpace: 'nowrap', userSelect: 'none',
        textAlign: opts.right ? 'right' : opts.center ? 'center' : 'left',
        backgroundColor: isSticky ? STICKY_BG : '#1e1e20',
        borderBottom: '1px solid #3a3a3c', borderRight: '1px solid #3a3a3c',
        width: opts.w, minWidth: opts.w,
        position: isSticky ? 'sticky' : 'relative',
        left: opts.sl, right: opts.sr,
        zIndex: isSticky ? 3 : undefined,
        overflow: 'hidden',
        ...opts.style,
      }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {!opts.sr && !opts.sl && (
          <div
            onMouseDown={e => {
              e.preventDefault();
              const th = (e.currentTarget as HTMLElement).parentElement!;
              const startX = e.clientX;
              const startW = th.offsetWidth;
              const onMove = (ev: MouseEvent) => { th.style.width = Math.max(40, startW + ev.clientX - startX) + 'px'; th.style.minWidth = th.style.width; };
              const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
            style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', cursor: 'col-resize', backgroundColor: 'transparent' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#505060')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
          />
        )}
      </th>
    );
  };

  const td = (content: React.ReactNode, opts: {
    w?: number; right?: boolean; center?: boolean;
    sl?: number; sr?: number; bg?: string; style?: React.CSSProperties;
  } = {}) => {
    const isSticky = opts.sl !== undefined || opts.sr !== undefined;
    return (
      <td style={{
        padding: '0 8px', height: ROW_H,
        fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#fff',
        whiteSpace: 'nowrap', overflow: 'hidden',
        textAlign: opts.right ? 'right' : opts.center ? 'center' : 'left',
        backgroundColor: isSticky ? (opts.bg ?? STICKY_BG) : (opts.bg ?? '#313032'),
        borderBottom: '1px solid #3a3a3c',
        width: opts.w, minWidth: opts.w,
        position: isSticky ? 'sticky' : undefined,
        left: opts.sl, right: opts.sr,
        zIndex: isSticky ? 2 : undefined,
        ...opts.style,
      }}>{content}</td>
    );
  };

  const Dash = () => <span style={{ color: '#666' }}>—</span>;
  const yn = (v?: boolean) => v == null ? <Dash /> : <span style={{ color: v ? '#66e07a' : '#999' }}>{v ? 'Yes' : 'No'}</span>;

  const inp = (field: keyof RowEdit, right?: boolean) => (
    <input type="text" value={editForm ? (editForm as any)[field] ?? '' : ''}
      onChange={e => setEditForm(f => f ? { ...f, [field]: e.target.value } : f)}
      style={{ width: '100%', backgroundColor: '#141418', border: '1px solid #4a4a60',
        borderRadius: 3, padding: '1px 5px', fontFamily: 'inherit', fontSize: 11,
        color: '#e0e0e0', outline: 'none', textAlign: right ? 'right' : 'left' }} />
  );

  const sel = (field: keyof RowEdit) => (
    <select value={editForm ? (editForm as any)[field] ?? '' : ''}
      onChange={e => setEditForm(f => f ? { ...f, [field]: e.target.value } : f)}
      style={{ width: '100%', backgroundColor: '#141418', border: '1px solid #4a4a60',
        borderRadius: 3, padding: '1px 3px', fontFamily: 'inherit', fontSize: 11,
        color: '#fff', outline: 'none' }}>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );

  const btnS = (extra: React.CSSProperties): React.CSSProperties => ({
    fontFamily: 'IBM Plex Mono, monospace', fontSize: 11,
    display: 'inline-flex', alignItems: 'center', gap: 3,
    borderRadius: 3, padding: '2px 7px', border: '1px solid',
    cursor: 'pointer', whiteSpace: 'nowrap',
    ...extra,
  });

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>

      {/* Page Header */}
      <div className="px-4 py-2 border-b border-[#808080] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Symbol Mapping</h1>
          <p className="text-xs text-white">MT5 symbols → LP instruments — STP routing prerequisite</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-white">Mappings: <span className="font-mono text-white">{mappings.length}</span></span>
          <div className="w-px h-4 bg-[#505050]" />
          <span className="text-white">Nodes: <span className="font-mono" style={{ color: connNodes.length > 0 ? '#66e07a' : '#666' }}>{connNodes.length}</span></span>
          <span className="text-white">LPs: <span className="font-mono" style={{ color: lps.length > 0 ? '#66e07a' : '#666' }}>{lps.length}</span></span>
          {unmappedPending.length > 0 && <span style={{ color: '#e0a020' }} className="font-mono">{unmappedPending.length} unmapped</span>}
          <div className="w-px h-4 bg-[#505050]" />
          <button onClick={() => setHistoryOpen(true)} className="text-white hover:text-white flex items-center gap-1.5"><IcoHistory />Import Log</button>
          <button onClick={() => setBulkOpen(true)} className="text-white hover:text-white flex items-center gap-1.5"><IcoUpload />Bulk CSV</button>
        </div>
      </div>

      {/* Unmapped warning */}
      {unmappedPending.length > 0 && (
        <div className="px-4 py-2 border-b border-[#c08820] flex items-center justify-between text-xs flex-shrink-0" style={{ backgroundColor: '#2a2010' }}>
          <span style={{ color: '#e0a020' }}>⚠ {unmappedPending.length} symbol{unmappedPending.length !== 1 ? 's' : ''} with open positions have no LP mapping: <span className="font-mono">{unmappedPending.map(u => u.mt5_symbol).join(', ')}</span></span>
          <button onClick={() => setAutoMapRows(buildAutoMapRows())} className="ml-4 text-xs px-2.5 py-1 rounded" style={{ backgroundColor: '#1a1e20', color: '#4ecdc4', border: '1px solid #2a4040' }}>Review &amp; Map →</button>
        </div>
      )}

      {/* Add Mapping bar */}
      <div className="px-4 py-2 border-b border-[#505050] flex items-center gap-3 flex-wrap flex-shrink-0" style={{ backgroundColor: '#2a292c' }}>
        <span className="text-[10px] text-[#ccc] uppercase tracking-wider font-medium whitespace-nowrap">Add Mapping</span>
        <select value={nodeId ?? ''} onChange={e => setNodeId(e.target.value === '' ? null : Number(e.target.value))} className={iCls} style={{ width: 150, color: '#fff' }}>
          <option value="">All Servers</option>
          {connNodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_name}</option>)}
        </select>
        <select value={addMt5} onChange={e => pickAddMt5(e.target.value)} disabled={mt5Syms.length === 0} className={iCls} style={{ width: 180, color: '#fff' }}>
          <option value="">{loadingMt5 ? 'Loading…' : `MT5 Symbol${mt5Syms.length ? ` (${mt5Syms.length})` : ''}`}</option>
          {mt5Syms.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
        </select>
        <span className="text-[#505050]">→</span>
        <select value={lpId ?? ''} onChange={e => setLpId(e.target.value)} disabled={lps.length === 0} className={iCls} style={{ width: 180, color: '#fff' }}>
          {lps.length === 0 ? <option>No LPs</option> : lps.map(l => <option key={l.lp_id} value={l.lp_id}>{l.lp_name}</option>)}
        </select>
        {lpStatus && <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: lpConnected ? '#66e07a' : '#666' }}>● {lpConnected ? 'connected' : (lpStatus.state ?? 'offline')}</span>}
        <select value={addLpSym} onChange={e => pickAddLpSym(e.target.value)} disabled={lpInstrs.length === 0} className={iCls} style={{ width: 180, color: '#fff' }}>
          <option value="">{`LP Symbol ${instrStatus}`}</option>
          {lpInstrs.map(i => <option key={i.symbol} value={i.symbol}>{i.symbol}</option>)}
        </select>
        <input type="text" inputMode="decimal" value={addMult}   onChange={e => setAddMult(e.target.value)}   placeholder="Size ×"  className={iCls} style={{ width: 72 }} />
        <input type="text" inputMode="decimal" value={addPriceX} onChange={e => setAddPriceX(e.target.value)} placeholder="Price ×" className={iCls} style={{ width: 72 }} />
        <button onClick={handleAdd} disabled={addBusy || !addMt5.trim() || !addLpSym.trim()}
          className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 font-mono whitespace-nowrap"
          style={addBusy || !addMt5.trim() || !addLpSym.trim()
            ? { backgroundColor: '#2a2a2c', color: '#555', border: '1px solid #383838', cursor: 'not-allowed' }
            : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d', cursor: 'pointer' }}>
          <IcoPlus />{addBusy ? 'Saving…' : isAlreadyMapped ? 'Update' : 'Add'}
        </button>
        {addErr && <span className="text-xs text-[#ff6b6b] font-mono flex items-center gap-1"><IcoWarn />{addErr}</span>}
        {statusMsg && <span className="text-xs font-mono ml-auto" style={{ color: statusMsg.ok ? '#66e07a' : '#ff6b6b' }}>{statusMsg.text}</span>}
      </div>

      {/* Toolbar */}
      <div className="px-4 py-1.5 border-b border-[#404040] flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: '#252427' }}>
        <span className="text-[10px] text-[#ccc] uppercase tracking-wider font-medium">Configured Mappings</span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter symbols…" className={iCls} style={{ width: 200 }} />
        {search && <button onClick={() => setSearch('')} className="text-[10px] text-white hover:text-white">✕ Clear</button>}
        <span className="text-[10px] text-[#4ecdc4] font-mono">{filtered.length} / {mappings.length}</span>
        {rowErr && <span className="text-xs text-[#ff6b6b] font-mono flex items-center gap-1 ml-2"><IcoWarn />{rowErr}</span>}
        <div className="flex-1" />
        <button onClick={() => refetch()} className="text-[10px] text-white hover:text-white">↻ Refresh</button>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto" style={{ backgroundColor: '#313032' }}>
        {mapsErr ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-xs text-[#ff6b6b] font-mono">⚠ Failed to load mappings</p>
            <button onClick={() => refetch()} className="text-xs text-white hover:text-white px-3 py-1.5 border border-[#404040] rounded">Retry</button>
          </div>
        ) : loadingMaps ? (
          <div className="flex items-center justify-center h-32 text-xs text-[#ccc] font-mono">Loading…</div>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1340 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Group headers */}
              <tr style={{ backgroundColor: '#1e1e20' }}>
                <th colSpan={5} style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', backgroundColor: '#1e1e20', borderBottom: '1px solid #3a3a3c', borderRight: '1px solid #3a3a3c' }}>MT5 Server</th>
                <th colSpan={4} style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', backgroundColor: STICKY_BG, borderBottom: '1px solid #3a3a3c', borderRight: '1px solid #3a3a3c', position: 'sticky', left: 449, right: 170, zIndex: 4 }}>↔ Mapping</th>
                <th colSpan={6} style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', backgroundColor: '#1e1e20', borderBottom: '1px solid #3a3a3c', borderRight: '1px solid #3a3a3c' }}>LP Server</th>
                <th style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', backgroundColor: '#1e1e20', borderBottom: '1px solid #3a3a3c', position: 'sticky', right: 0, zIndex: 4 }}>Actions</th>
              </tr>
              {/* Column headers */}
              <tr>
                {th('Snap Quote', { w: 95, right: true })}
                {th('Server', { w: 130 })}
                {th('Std Lot', { w: 88, right: true })}
                {th('Units', { w: 68, center: true })}
                {th('Lots', { w: 68, center: true, style: { borderRight: '2px solid #4a4a5a' } })}
                {th('MT5 Symbol', { w: 120, sl: 449, style: { borderLeft: '2px solid #4a4a5a' } })}
                {th('Size ×', { w: 72, center: true, sl: 569 })}
                {th('Price ×', { w: 72, center: true, sl: 641 })}
                {th('LP Symbol', { w: 120, sr: 170, style: { borderRight: '2px solid #4a4a5a' } })}
                {th('Snap Quote', { w: 95, right: true })}
                {th('Server', { w: 150 })}
                {th('Std Lot', { w: 88, right: true })}
                {th('Lots', { w: 68, center: true })}
                {th('Units', { w: 68, center: true })}
                {th('Min Size', { w: 82, right: true, style: { borderRight: '2px solid #4a4a5a' } })}
                {th('Actions', { w: 170, center: true, sr: 0, style: { borderLeft: '1px solid #303038' } })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={16} style={{ padding: '48px 0', textAlign: 'center', color: '#555', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
                  {search ? `No results for "${search}"` : 'No mappings configured yet'}
                </td></tr>
              ) : filtered.map(m => {
                const isEd = editingId === m.id;
                const isSv = savingId === m.id;
                const sq   = snapQuotes.get(m.id);
                const mt5Info = mt5Syms.find(s => s.symbol === m.mt5_symbol);
                const lpInstr = lpInstrs.find(i => i.symbol === m.lp_symbol || i.canonical_symbol === m.lp_symbol);
                const rowBg   = isEd ? '#1e1e28' : undefined;
                const sBg     = isEd ? '#22222e' : STICKY_BG;

                return (
                  <tr key={m.id} style={{ opacity: m.enabled === false ? 0.45 : 1 }}
                    onMouseEnter={e => { if (!isEd) Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach((c: HTMLTableCellElement) => { if (c.style.position !== 'sticky') c.style.backgroundColor = '#3a3a3e'; }); }}
                    onMouseLeave={e => { if (!isEd) Array.from((e.currentTarget as HTMLTableRowElement).cells).forEach((c: HTMLTableCellElement) => { if (c.style.position !== 'sticky') c.style.backgroundColor = ''; }); }}>

                    {/* MT5 Server group — left scrollable */}
                    {td((() => {
                      const s = sq?.mt5;
                      if (s === 'loading') return <span style={{ color: '#888' }}>…</span>;
                      if (s === 'error' || s == null) return <span style={{ color: '#666' }}>—</span>;
                      return <span style={{ color: '#c09030', fontFamily: 'IBM Plex Mono, monospace' }}>{s.price.toFixed(5)}</span>;
                    })(), { w: 95, right: true, bg: rowBg })}
                    {td(<span style={{ color: '#fff' }}>{connNodes.find(n => n.node_id === nodeId)?.node_name ?? '—'}</span>, { w: 130, bg: rowBg })}
                    {td(mt5Info?.contract_size != null ? <span style={{ color: '#fff' }}>{mt5Info.contract_size.toLocaleString()}</span> : <span style={{ color: '#666' }}>—</span>, { w: 88, right: true, bg: rowBg })}
                    {td(isEd ? sel('mt5_trades_in_units') : yn(m.mt5_trades_in_units != null ? m.mt5_trades_in_units : (mt5Info?.calc_mode != null ? [2,6,7,8,10,12].includes(mt5Info.calc_mode) : undefined)), { w: 68, center: true, bg: rowBg })}
                    {td(isEd ? sel('mt5_trades_in_lots')  : yn(m.mt5_trades_in_lots  != null ? m.mt5_trades_in_lots  : (mt5Info?.calc_mode != null ? [0,1,3,4,5,9,11].includes(mt5Info.calc_mode) : undefined)), { w: 68, center: true, bg: rowBg, style: { borderRight: '2px solid #4a4a5a' } })}

                    {/* STICKY CENTER */}
                    {td(<span style={{ color: '#fff', fontWeight: 600 }}>{m.mt5_symbol}</span>, { w: 120, sl: 449, style: { borderLeft: '2px solid #4a4a5a', backgroundColor: sBg } })}
                    {td(isEd ? inp('volume_multiplier', true) : <span style={{ color: (m.volume_multiplier ?? 1) !== 1 ? '#c09030' : '#888' }}>×{m.volume_multiplier ?? 1}</span>, { w: 72, center: true, sl: 569, style: { backgroundColor: sBg } })}
                    {td(isEd ? inp('price_multiplier', true) : <span style={{ color: (m.price_multiplier ?? 1) !== 1 ? '#c09030' : '#888' }}>×{m.price_multiplier ?? 1}</span>, { w: 72, center: true, sl: 641, style: { backgroundColor: sBg } })}
                    {td(
                      isEd
                        ? inp('lp_symbol')
                        : <span style={{ color: '#fff', fontWeight: 600 }}>{m.lp_symbol}</span>,
                      { w: 120, sr: 170, style: { borderRight: '2px solid #4a4a5a', backgroundColor: sBg } }
                    )}

                    {/* LP Server group — right scrollable */}
                    {td((() => {
                      const s = sq?.lp;
                      if (s === 'loading') return <span style={{ color: '#888' }}>…</span>;
                      if (s === 'error' || s == null) return <span style={{ color: '#666' }}>—</span>;
                      return <span style={{ color: '#c09030', fontFamily: 'IBM Plex Mono, monospace' }}>{s.price.toFixed(5)}</span>;
                    })(), { w: 95, right: true, bg: rowBg })}
                    {td(
                      isEd
                        ? <select value={editForm?.lp_name ?? ''} onChange={e => setEditForm(f => f ? { ...f, lp_name: e.target.value } : f)}
                            style={{ width: '100%', backgroundColor: '#141418', border: '1px solid #4a4a60', borderRadius: 3, padding: '1px 3px', fontFamily: 'inherit', fontSize: 11, color: '#fff', outline: 'none' }}>
                            <option value="">—</option>
                            {lpNameOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        : <span style={{ color: '#fff' }}>{m.lp_name || <span style={{ color: '#666' }}>—</span>}</span>,
                      { w: 150, bg: rowBg }
                    )}
                    {td(
                      isEd
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {inp('lp_std_lot', true)}
                            {lpInstr?.contract_multiplier != null && (
                              <button title="Restore from LP" onClick={() => setEditForm(f => f ? { ...f, lp_std_lot: String(lpInstr.contract_multiplier!) } : f)}
                                style={{ flexShrink: 0, backgroundColor: '#1a1e20', border: '1px solid #2a4040', borderRadius: 3, color: '#4ecdc4', cursor: 'pointer', fontSize: 10, padding: '1px 4px' }}>↺</button>
                            )}
                          </div>
                        : (() => { const v = m.lp_std_lot ?? lpInstr?.contract_multiplier; return v != null ? <span style={{ color: '#fff' }}>{v.toLocaleString()}</span> : <span style={{ color: '#555', fontSize: 10 }}>NA</span>; })(),
                      { w: 88, right: true, bg: rowBg }
                    )}
                    {td(isEd ? sel('lp_trades_in_lots')  : yn(m.lp_trades_in_lots),  { w: 68, center: true, bg: rowBg })}
                    {td(isEd ? sel('lp_trades_in_units') : yn(m.lp_trades_in_units), { w: 68, center: true, bg: rowBg })}
                    {td(
                      isEd
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {inp('min_size', true)}
                            {lpInstr?.min_trade_vol != null && (
                              <button title="Restore from LP" onClick={() => setEditForm(f => f ? { ...f, min_size: String(lpInstr.min_trade_vol!) } : f)}
                                style={{ flexShrink: 0, backgroundColor: '#1a1e20', border: '1px solid #2a4040', borderRadius: 3, color: '#4ecdc4', cursor: 'pointer', fontSize: 10, padding: '1px 4px' }}>↺</button>
                            )}
                          </div>
                        : (() => { const v = m.min_size ?? lpInstr?.min_trade_vol; return v != null ? <span style={{ color: '#fff' }}>{v}</span> : <span style={{ color: '#666' }}>—</span>; })(),
                      { w: 82, right: true, bg: rowBg, style: { borderRight: '2px solid #4a4a5a' } }
                    )}

                    {/* Actions — sticky right */}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, height: ROW_H, padding: '0 8px', whiteSpace: 'nowrap', backgroundColor: isEd ? '#1e1e28' : '#313032', borderBottom: '1px solid #3a3a3c', borderLeft: '1px solid #303038' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isEd ? (
                          <>
                            <button onClick={() => saveEdit(m)} disabled={isSv} style={btnS(isSv ? { backgroundColor: '#2a2a2c', color: '#555', borderColor: '#383838' } : { backgroundColor: '#162a1c', color: '#66e07a', borderColor: '#2f6a3d' })}><IcoCheck />{isSv ? '…' : 'Save'}</button>
                            <button onClick={cancelEdit} style={btnS({ backgroundColor: '#2a2a2c', color: '#fff', borderColor: '#404040' })}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => fetchSnapQuote(m)} disabled={sq?.mt5 === 'loading' || sq?.lp === 'loading'} style={btnS({ backgroundColor: '#1e2020', color: '#4ecdc4', borderColor: '#2a3838', opacity: (sq?.mt5 === 'loading' || sq?.lp === 'loading') ? 0.4 : 1 })}>
                              <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9"><path d="M22,11h-3.28A6.993,6.993,0,0,0,13,5.28V2a1,1,0,0,0-2,0V5.28A6.993,6.993,0,0,0,5.28,11H2a1,1,0,0,0,0,2H5.28A6.993,6.993,0,0,0,11,18.72V22a1,1,0,0,0,2,0V18.72A6.993,6.993,0,0,0,18.72,13H22a1,1,0,0,0,0-2Z"/></svg>
                              {(sq?.mt5 === 'loading' || sq?.lp === 'loading') ? '…' : 'Quote'}
                            </button>
                            <button onClick={() => { setRowErr(null); startEdit(m); }} style={btnS({ backgroundColor: '#2a2a2c', color: '#fff', borderColor: '#404040' })}><IcoEdit />Edit</button>
                            <button onClick={() => setDeleteTarget(m)} style={btnS({ backgroundColor: '#2c1417', color: '#ff6b6b', borderColor: '#5a2530' })}><IcoTrash /></button>
                          </>
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

      {/* Modals */}
      {autoMapRows  && <AutoMapReview rows={autoMapRows} nodes={connNodes} lps={lps} defaultNodeId={nodeId} defaultLpId={lpId} onCommit={commitAutoMap} onClose={() => setAutoMapRows(null)} />}
      {bulkOpen     && <BulkModal onUpload={handleBulk} onClose={() => setBulkOpen(false)} mt5Syms={mt5Syms} nodeName={connNodes.find(n => n.node_id === nodeId)?.node_name ?? ''} lpName={selectedLP?.lp_name ?? ''} mappings={mappings} />}
      {historyOpen  && <ImportLogModal onClose={() => setHistoryOpen(false)} />}
      {deleteTarget && <DeleteConfirm m={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}

export default SymbolMappingPage;