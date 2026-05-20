// ============================================
// Predictions — NexDay symbol mapping and sync status
//
// Standalone page under the Intel menu (path: /predictions).
// Previously lived as a tab inside MT5 Servers → NodeManagement; relocated
// 2026-05 with no content changes. All NexDay logic, helpers, types, and
// the UI body are mirrored exactly from the original tab.
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';

// ============================================================
// ICONS — copied from NodeManagement (the 4 used by PredictionsTab)
// ============================================================
const IcoBook = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m22,0H6C3.794,0,2,1.794,2,4v16c0,2.206,1.794,4,4,4h16c1.103,0,2-.897,2-2V2c0-1.103-.897-2-2-2ZM6,22c-1.103,0-2-.897-2-2s.897-2,2-2h14v4H6Zm16,0h-.675c.114-.313.175-.65.175-1v-1H6c-.71,0-1.37.195-1.938.525C4.021,21.353,4,21.176,4,21V4c0-1.103.897-2,2-2h16v20Z"/>
  </svg>
);

const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/>
  </svg>
);

const IcoWarning = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/>
  </svg>
);

const IcoX = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/>
  </svg>
);


// ============================================================
// NEXDAY API — helpers, types
// ============================================================

const NEXDAY_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

async function ndFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${NEXDAY_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

interface NexDayMapping {
  id: number;
  mt5_symbol: string;
  nexday_symbol: string;
  is_active: boolean;
  nexday_description: string;
  security_type: string;
  current_prediction: string | null;
}

interface NexDayAvailableSymbol {
  nexday_symbol: string;
  description: string;
  security_type: string;
  exchange: string;
  mapped_mt5_count: number;
}

interface UnmappedSymbol {
  mt5_symbol: string;
  trader_count: number;
  total_volume: number;
}

interface NexDaySyncStatus {
  endpoint: string;
  status: 'ok' | 'error' | 'stale';
  records_synced: number;
  last_sync_at: string;
  error_message?: string;
}

interface UploadHistoryRow {
  id: number;
  batch_id: string;
  filename: string;
  row_count: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  status: 'completed' | 'failed' | 'partial';
  uploaded_at: string;
}

// Rows parsed from Excel but not yet uploaded — shown in preview
interface ParsedRow {
  mt5_symbol: string;
  nexday_symbol: string;
  valid: boolean;
  reason?: string;
}


function ndRelative(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

async function loadSheetJS(): Promise<any> {
  if ((window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload  = () => resolve((window as any).XLSX);
    s.onerror = () => reject(new Error('Failed to load SheetJS from CDN'));
    document.head.appendChild(s);
  });
}

// ────────────────────────────────────────────────────────────
// AUTO-MAP HELPER — pure, runs client-side before any API call
// ────────────────────────────────────────────────────────────
type AutoSuggestion = {
  mt5_symbol:    string;
  nexday_symbol: string;
  exchange:      string;
  confidence:    'exact' | 'prefix';
};

/**
 * Best-effort matching of MT5 symbols against available NexDay symbols.
 *
 * Pass 1 — exact base match:
 *   Strip the exchange suffix from the NexDay symbol (everything after the
 *   first '.'), uppercase both sides, and require equality.
 *   e.g. "EURUSD" matches "EURUSD.FXCM"
 *
 * Pass 2 — prefix match:
 *   Either the NexDay base starts with the MT5 symbol or the MT5 symbol
 *   starts with the NexDay base (handles truncations / contract codes).
 *
 * Symbols with no match in either pass are returned in `unmatched` so the
 * operator knows which ones to map manually.
 */
function computeAutoSuggestions(
  unmapped:  UnmappedSymbol[],
  available: NexDayAvailableSymbol[],
): { matched: AutoSuggestion[]; unmatched: string[] } {
  const matched:   AutoSuggestion[] = [];
  const unmatched: string[]         = [];

  for (const u of unmapped) {
    const mt5 = u.mt5_symbol.toUpperCase();

    // Pass 1 — exact base
    let hit = available.find(
      a => a.nexday_symbol.split('.')[0].toUpperCase() === mt5,
    );
    if (hit) {
      matched.push({ mt5_symbol: u.mt5_symbol, nexday_symbol: hit.nexday_symbol, exchange: hit.exchange, confidence: 'exact' });
      continue;
    }

    // Pass 2 — prefix
    hit = available.find(a => {
      const base = a.nexday_symbol.split('.')[0].toUpperCase();
      return base.startsWith(mt5) || mt5.startsWith(base);
    });
    if (hit) {
      matched.push({ mt5_symbol: u.mt5_symbol, nexday_symbol: hit.nexday_symbol, exchange: hit.exchange, confidence: 'prefix' });
      continue;
    }

    unmatched.push(u.mt5_symbol);
  }

  return { matched, unmatched };
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export function PredictionsPage() {
  const [mappings,     setMappings]     = useState<NexDayMapping[]>([]);
  const [available,    setAvailable]    = useState<NexDayAvailableSymbol[]>([]);
  const [unmapped,     setUnmapped]     = useState<UnmappedSymbol[]>([]);
  const [syncStatus,   setSyncStatus]   = useState<NexDaySyncStatus[]>([]);
  const [history,      setHistory]      = useState<UploadHistoryRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [pToast,       setPToast]       = useState<{ msg: string; type: 'success'|'warn'|'error' } | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleteId,     setDeleteId]     = useState<number | null>(null);
  const [searchMapped, setSearchMapped] = useState('');
  const [formMt5,      setFormMt5]      = useState('');
  const [formNexDay,   setFormNexDay]   = useState('');
  const [formNotes,    setFormNotes]    = useState('');
  const [ndSearch,     setNdSearch]     = useState('');
  // Excel upload preview
  const [parsedRows,    setParsedRows]   = useState<ParsedRow[] | null>(null);
  const [uploading,     setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Auto-map
  const [autoMatched,   setAutoMatched]   = useState<AutoSuggestion[]>([]);
  const [autoUnmatched, setAutoUnmatched] = useState<string[]>([]);
  const [applyingAuto,  setApplyingAuto]  = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);

  const showPToast = (msg: string, type: 'success'|'warn'|'error' = 'success') => {
    setPToast({ msg, type });
    setTimeout(() => setPToast(null), 5000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [m, u, st, h] = await Promise.all([
        ndFetch<{ mappings: NexDayMapping[] }>('/api/v1/mappings/nexday'),
        ndFetch<{ unmapped_symbols: UnmappedSymbol[] }>('/api/v1/mappings/nexday/unmapped'),
        ndFetch<{ endpoints: Record<string, NexDaySyncStatus>; health: string }>('/api/v1/predictions/status'),
        ndFetch<{ history: UploadHistoryRow[] }>('/api/v1/mappings/history?limit=10'),
      ]);
      setMappings(m.mappings ?? []);
      setUnmapped(u.unmapped_symbols ?? []);
      setSyncStatus(Object.entries(st.endpoints ?? {}).map(([k, v]) => ({ ...v, endpoint: k })));
      setHistory(h.history ?? []);
    } catch (e: unknown) {
      showPToast((e as Error).message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailable = async () => {
    try {
      const r = await ndFetch<{ nexday_symbols: NexDayAvailableSymbol[] }>('/api/v1/mappings/nexday/available');
      setAvailable(r.nexday_symbols ?? []);
    } catch { /* silent — dropdown just stays empty */ }
  };

  useEffect(() => { loadAll(); loadAvailable(); }, []);

  // Recompute auto-suggestions whenever unmapped symbols or available symbols change,
  // but only while no mappings have been configured yet.
  useEffect(() => {
    if (mappings.length > 0 || !available.length || !unmapped.length) {
      setAutoMatched([]);
      setAutoUnmatched([]);
      return;
    }
    const { matched, unmatched } = computeAutoSuggestions(unmapped, available);
    setAutoMatched(matched);
    setAutoUnmatched(unmatched);
  }, [unmapped, available, mappings.length]);

  const handleApplyAutoMap = async () => {
    if (!autoMatched.length) return;
    setApplyingAuto(true);
    try {
      const result = await ndFetch<{
        inserted: number; updated: number; skipped: number;
        errors: { mt5_symbol: string; error: string }[];
      }>('/api/v1/mappings/nexday/bulk', {
        method: 'POST',
        body: JSON.stringify({
          mappings: autoMatched.map(s => ({ mt5_symbol: s.mt5_symbol, nexday_symbol: s.nexday_symbol })),
        }),
      });
      const errCount = result.errors?.length ?? 0;
      showPToast(
        `Auto-mapped ${result.inserted} added · ${result.updated} updated${errCount ? ` · ${errCount} errors` : ''}`,
        errCount ? 'warn' : 'success',
      );
      setAutoDismissed(true);
      await loadAll();
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    } finally {
      setApplyingAuto(false);
    }
  };

  const handleAdd = async () => {
    if (!formMt5.trim() || !formNexDay) return;
    setSaving(true);
    try {
      await ndFetch('/api/v1/mappings/nexday', {
        method: 'POST',
        body: JSON.stringify({
          mt5_symbol: formMt5.trim().toUpperCase(),
          nexday_symbol: formNexDay,
          ...(formNotes ? { notes: formNotes } : {}),
        }),
      });
      showPToast(`Mapped ${formMt5.toUpperCase()} → ${formNexDay}`);
      setFormMt5(''); setFormNexDay(''); setFormNotes(''); setNdSearch('');
      await loadAll();
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await ndFetch(`/api/v1/mappings/nexday/${id}`, { method: 'DELETE' });
      showPToast('Mapping deleted');
      setDeleteId(null);
      await loadAll();
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    }
  };

  const handleClearAll = async () => {
    try {
      await ndFetch('/api/v1/mappings/nexday?confirm=true', { method: 'DELETE' });
      showPToast('All mappings cleared', 'warn');
      setClearConfirm(false);
      await loadAll();
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    }
  };

  // Step 1: parse the file and show a preview before uploading
  const handleFilePicked = async (file: File) => {
    try {
      const XLSX = await loadSheetJS();
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Use defval: null so empty cells appear as null rather than being omitted
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      const parsed: ParsedRow[] = rows.map((row) => {
        const mt5     = (row['MT5Symbol']    ?? row['mt5_symbol']    ?? row['MT5']    ?? '').toString().trim();
        const nexday  = (row['NexDaySymbol'] ?? row['nexday_symbol'] ?? row['NexDay'] ?? '').toString().trim();
        if (!mt5 && !nexday) return { mt5_symbol: mt5, nexday_symbol: nexday, valid: false, reason: 'Both columns empty' };
        if (!mt5)            return { mt5_symbol: mt5, nexday_symbol: nexday, valid: false, reason: 'MT5Symbol is empty — no MT5 mapping configured yet for this NexDay symbol' };
        if (!nexday)         return { mt5_symbol: mt5, nexday_symbol: nexday, valid: false, reason: 'NexDaySymbol is empty' };
        return { mt5_symbol: mt5.toUpperCase(), nexday_symbol: nexday, valid: true };
      });

      setParsedRows(parsed);
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    }
  };

  // Step 2: send valid rows to the API
  const handleConfirmUpload = async () => {
    if (!parsedRows) return;
    const valid = parsedRows.filter(r => r.valid);
    if (!valid.length) { showPToast('No valid rows to upload', 'warn'); return; }

    setUploading(true);
    try {
      const result = await ndFetch<{
        inserted: number; updated: number; skipped: number;
        errors: { mt5_symbol: string; error: string }[];
      }>('/api/v1/mappings/nexday/bulk', {
        method: 'POST',
        body: JSON.stringify({ mappings: valid.map(r => ({ mt5_symbol: r.mt5_symbol, nexday_symbol: r.nexday_symbol })) }),
      });
      const errCount = result.errors?.length ?? 0;
      showPToast(
        `${result.inserted} added · ${result.updated} updated · ${result.skipped} skipped${errCount ? ` · ${errCount} errors` : ''}`,
        errCount ? 'warn' : 'success',
      );
      setParsedRows(null);
      await loadAll();
    } catch (e: unknown) {
      showPToast((e as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const ndOptions = available
    .filter(s => !ndSearch
      || s.nexday_symbol.toLowerCase().includes(ndSearch.toLowerCase())
      || s.description.toLowerCase().includes(ndSearch.toLowerCase()))
    .slice(0, 60);

  const filteredMappings = mappings.filter(m =>
    !searchMapped
    || m.mt5_symbol.toLowerCase().includes(searchMapped.toLowerCase())
    || m.nexday_symbol.toLowerCase().includes(searchMapped.toLowerCase()));

  const tStyle = (type: string) =>
    type === 'success' ? { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }
    : type === 'warn'  ? { backgroundColor: '#28220a', color: '#e0d066', border: '1px solid #6a6530' }
    :                    { backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' };

  const trendColor = (t: string | null) =>
    t === 'Up' || t === 'Bullish' ? '#66e07a' : t === 'Down' || t === 'Bearish' ? '#ff5c5c' : '#888';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-text-muted">Loading NexDay mappings…</span>
      </div>
    );
  }

  const validRows   = parsedRows?.filter(r => r.valid)   ?? [];
  const skippedRows = parsedRows?.filter(r => !r.valid)  ?? [];

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="space-y-4 relative">
        {/* Toast */}
        {pToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded text-xs font-medium shadow-lg"
            style={tStyle(pToast.type)}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              backgroundColor: pToast.type === 'success' ? '#66e07a' : pToast.type === 'warn' ? '#e0d066' : '#ff5c5c' }} />
            {pToast.msg}
          </div>
        )}

        {/* Auto-map suggestions — shown when no mappings exist but matches were found */}
        {!autoDismissed && mappings.length === 0 && autoMatched.length > 0 && (
          <div className="rounded p-4" style={{ backgroundColor: '#0d1f2a', border: '1px solid #1e4a70' }}>
            <div className="flex items-center justify-between mb-3 gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">Auto-Map Suggestions</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {autoMatched.length} symbol{autoMatched.length !== 1 ? 's' : ''} matched automatically by symbol name
                  {autoUnmatched.length > 0
                    ? ` · ${autoUnmatched.length} could not be matched and require manual mapping`
                    : ' · all symbols covered'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setAutoDismissed(true)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors px-2 py-1 rounded"
                  style={{ border: '1px solid #383838' }}>
                  Dismiss
                </button>
                <button onClick={handleApplyAutoMap} disabled={applyingAuto}
                  className="btn btn-primary text-xs px-3 py-1.5"
                  style={applyingAuto ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  {applyingAuto ? 'Applying…' : `Apply ${autoMatched.length} mapping${autoMatched.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>

            <div className="rounded overflow-hidden" style={{ border: '1px solid #1e3a5a', backgroundColor: '#0a1520' }}>
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: '#0f2035' }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-text-muted font-medium">MT5 Symbol</th>
                    <th className="px-3 py-2 text-left text-text-muted font-medium">NexDay Symbol</th>
                    <th className="px-3 py-2 text-left text-text-muted font-medium">Exchange</th>
                    <th className="px-3 py-2 text-left text-text-muted font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {autoMatched.map(s => (
                    <tr key={s.mt5_symbol} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono font-semibold text-text-primary">{s.mt5_symbol}</td>
                      <td className="px-3 py-1.5 font-mono" style={{ color: '#49b3b3' }}>{s.nexday_symbol}</td>
                      <td className="px-3 py-1.5 text-text-muted">{s.exchange || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={s.confidence === 'exact'
                            ? { backgroundColor: '#0d1f12', color: '#66e07a', border: '1px solid #1e4d28' }
                            : { backgroundColor: '#1e2a10', color: '#b8d4a5', border: '1px solid #3a5830' }}>
                          {s.confidence === 'exact' ? 'Exact' : 'Prefix'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {autoUnmatched.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-text-muted flex-shrink-0">No match found for:</span>
                {autoUnmatched.map(sym => (
                  <button key={sym} onClick={() => setFormMt5(sym)}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors"
                    style={{ backgroundColor: '#1e1a00', border: '1px solid #5a4d00', color: '#c8b040' }}
                    title="Click to pre-fill the manual mapping form">
                    {sym}
                  </button>
                ))}
                <span className="text-[10px] text-text-muted">— use the Add Mapping form.</span>
              </div>
            )}
          </div>
        )}

        {/* Unmapped symbols alert */}
        {unmapped.length > 0 && (
          <div className="rounded p-3 flex items-start gap-3"
            style={{ backgroundColor: '#28220a', border: '1px solid #6a6530' }}>
            <span style={{ color: '#e0d066', flexShrink: 0, marginTop: 1 }}><IcoWarning /></span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: '#e0d066' }}>
                {unmapped.length} symbol{unmapped.length !== 1 ? 's' : ''} with open positions but no NexDay mapping
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {unmapped.map(u => (
                  <button key={u.mt5_symbol} onClick={() => setFormMt5(u.mt5_symbol)}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors"
                    style={{ backgroundColor: '#1e1a00', border: '1px solid #5a4d00', color: '#c8b040' }}
                    title={`${u.trader_count} traders · ${u.total_volume.toFixed(1)} lots`}>
                    <span className="font-mono font-semibold">{u.mt5_symbol}</span>
                    <span className="opacity-70">{u.total_volume.toFixed(1)}L</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1.5">Click a symbol to pre-fill the form below.</p>
            </div>
          </div>
        )}

        {/* Two-column: mappings table + add form */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 380px' }}>

          {/* LEFT — Active Mappings */}
          <div className="panel flex flex-col overflow-hidden">
            <div className="panel-header">
              <span className="text-sm font-semibold text-text-primary">
                Active Mappings
                <span className="ml-2 text-xs font-normal text-text-muted">{mappings.length} configured</span>
              </span>
              <div className="flex items-center gap-2">
                <input value={searchMapped} onChange={e => setSearchMapped(e.target.value)}
                  placeholder="Search…" className="input text-xs h-7 w-36" />
                {mappings.length > 0 && (
                  <button onClick={() => setClearConfirm(true)}
                    className="btn text-xs px-2 py-1"
                    style={{ backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {mappings.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-sm text-text-muted">No mappings configured yet</p>
                  <p className="text-xs text-text-secondary mt-1">Use the form on the right to add your first mapping.</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: '#1a1a1e', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr className="text-left">
                      <th className="px-3 py-2 text-text-muted font-medium">MT5 Symbol</th>
                      <th className="px-3 py-2 text-text-muted font-medium">NexDay Symbol</th>
                      <th className="px-3 py-2 text-text-muted font-medium">Type</th>
                      <th className="px-3 py-2 text-text-muted font-medium">Description</th>
                      <th className="px-3 py-2 text-text-muted font-medium">Trend</th>
                      <th className="px-3 py-2 text-text-muted font-medium">Status</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map(m => (
                      <tr key={m.id} className="border-t border-border hover:bg-surface-hover transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold text-text-primary">{m.mt5_symbol}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: '#49b3b3' }}>{m.nexday_symbol}</td>
                        <td className="px-3 py-2 text-text-secondary">{m.security_type || '—'}</td>
                        <td className="px-3 py-2 text-text-muted truncate max-w-[160px]" title={m.nexday_description}>
                          {m.nexday_description || '—'}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: trendColor(m.current_prediction) }}>
                          {m.current_prediction || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={m.is_active
                              ? { backgroundColor: '#0d1f12', color: '#66e07a', border: '1px solid #1e4d28' }
                              : { backgroundColor: '#2a2a2c', color: '#888', border: '1px solid #444' }}>
                            {m.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {deleteId === m.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => handleDelete(m.id)}
                                className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                                style={{ backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}>
                                Confirm
                              </button>
                              <button onClick={() => setDeleteId(null)}
                                className="text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-white transition-colors border border-border">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteId(m.id)}
                              className="text-text-muted hover:text-red-400 transition-colors p-1">
                              <IcoTrash />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredMappings.length === 0 && searchMapped && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                          No mappings match "{searchMapped}"
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RIGHT — Add form + upload + history */}
          <div className="flex flex-col gap-4">

            {/* Add Mapping */}
            <div className="panel">
              <div className="panel-header">
                <span className="text-sm font-semibold text-text-primary">Add Mapping</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">MT5 Symbol</label>
                  <input value={formMt5} onChange={e => setFormMt5(e.target.value.toUpperCase())}
                    placeholder="e.g. EURUSD" className="input w-full text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    NexDay Symbol
                    {formNexDay && <span className="ml-2 font-mono" style={{ color: '#49b3b3' }}>{formNexDay}</span>}
                  </label>
                  <input value={ndSearch}
                    onChange={e => { setNdSearch(e.target.value); setFormNexDay(''); }}
                    placeholder="Search NexDay symbols…" className="input w-full text-xs mb-1" />
                  {available.length > 0 ? (
                    <div className="rounded border border-border overflow-y-auto" style={{ maxHeight: 180, backgroundColor: '#1a1a1e' }}>
                      {ndOptions.length === 0
                        ? <p className="text-xs text-text-muted p-2 text-center">No matches</p>
                        : ndOptions.map(s => (
                          <button key={s.nexday_symbol}
                            onClick={() => { setFormNexDay(s.nexday_symbol); setNdSearch(s.nexday_symbol); }}
                            className="w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between hover:bg-surface-hover transition-colors"
                            style={formNexDay === s.nexday_symbol ? { backgroundColor: '#0d3a3a', color: '#49b3b3' } : {}}>
                            <span>
                              <span className="font-mono font-semibold text-text-primary">{s.nexday_symbol}</span>
                              {s.description && <span className="ml-2 text-text-muted">{s.description}</span>}
                            </span>
                            <span className="text-[10px] px-1 py-0.5 rounded flex-shrink-0 ml-1"
                              style={{ backgroundColor: '#1e2a1e', color: '#888', border: '1px solid #333' }}>
                              {s.exchange}
                            </span>
                          </button>
                        ))
                      }
                      {available.length > 60 && ndOptions.length === 60 && (
                        <p className="text-[10px] text-text-muted text-center py-1.5">Showing top 60 — type to filter</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted mt-1">Loading available symbols…</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Notes <span className="font-normal">(optional)</span></label>
                  <input value={formNotes} onChange={e => setFormNotes(e.target.value)}
                    placeholder="e.g. Primary forex pair" className="input w-full text-xs" />
                </div>
                <button onClick={handleAdd} disabled={saving || !formMt5.trim() || !formNexDay}
                  className="w-full btn btn-primary text-sm py-2"
                  style={saving || !formMt5.trim() || !formNexDay ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  {saving ? 'Saving…' : 'Add Mapping'}
                </button>
              </div>
            </div>

            {/* Bulk Upload */}
            <div className="panel">
              <div className="panel-header">
                <span className="text-sm font-semibold text-text-primary">Bulk Upload</span>
                <span className="text-xs text-text-muted">.xlsx · .csv</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="rounded p-2.5 text-xs"
                  style={{ backgroundColor: '#1a1a1e', border: '1px solid #2a2a2e' }}>
                  <p className="text-text-muted mb-0.5 font-medium">Expected columns</p>
                  <p className="font-mono" style={{ color: '#a0a0b0' }}>MT5Symbol · NexDaySymbol</p>
                  <p className="text-text-muted mt-0.5">Rows with an empty MT5Symbol are skipped — they show in the preview below.</p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { handleFilePicked(f); e.target.value = ''; }}} />
                <button onClick={() => { setParsedRows(null); fileRef.current?.click(); }}
                  className="w-full btn text-sm py-2 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
                  <IcoBook size={14} /> Choose File…
                </button>

                {/* Upload preview */}
                {parsedRows && (
                  <div className="space-y-2">
                    {/* Summary bar */}
                    <div className="flex items-center gap-3 text-xs rounded px-2.5 py-2"
                      style={{ backgroundColor: '#1a1a1e', border: '1px solid #2a2a2e' }}>
                      <span style={{ color: '#66e07a' }}>{validRows.length} will upload</span>
                      <span className="opacity-30">·</span>
                      <span style={{ color: skippedRows.length > 0 ? '#e0d066' : '#666' }}>
                        {skippedRows.length} skipped
                      </span>
                      <button onClick={() => setParsedRows(null)}
                        className="ml-auto text-text-muted hover:text-white transition-colors">
                        <IcoX size={11} />
                      </button>
                    </div>

                    {/* Skipped rows detail */}
                    {skippedRows.length > 0 && (
                      <div className="rounded overflow-hidden"
                        style={{ border: '1px solid #6a6530', backgroundColor: '#1a1600' }}>
                        <div className="px-2.5 py-1.5 text-[10px] font-semibold" style={{ color: '#e0d066', backgroundColor: '#28220a' }}>
                          Skipped rows — no MT5 mapping configured yet for these NexDay symbols
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: 100 }}>
                          {skippedRows.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 px-2.5 py-1 text-[10px] border-t"
                              style={{ borderColor: '#2a2000' }}>
                              <span className="font-mono text-text-muted w-24 truncate">{r.mt5_symbol || '(empty)'}</span>
                              <span className="opacity-30">→</span>
                              <span className="font-mono" style={{ color: '#c8b040' }}>{r.nexday_symbol || '(empty)'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Confirm button */}
                    <button onClick={handleConfirmUpload} disabled={uploading || validRows.length === 0}
                      className="w-full btn btn-primary text-sm py-2"
                      style={uploading || validRows.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                      {uploading ? 'Uploading…' : `Upload ${validRows.length} mapping${validRows.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Upload History */}
            {history.length > 0 && (
              <div className="panel">
                <div className="panel-header">
                  <span className="text-sm font-semibold text-text-primary">Upload History</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {history.map(h => (
                    <div key={h.id} className="px-3 py-2 border-t border-border first:border-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-mono text-text-primary truncate max-w-[160px]" title={h.filename}>
                          {h.filename || h.batch_id}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={h.status === 'completed'
                            ? { backgroundColor: '#0d1f12', color: '#66e07a', border: '1px solid #1e4d28' }
                            : { backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}>
                          {h.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted font-mono">
                        +{h.inserted} / ~{h.updated} / ×{h.skipped} / ⚠{h.errors} · {ndRelative(h.uploaded_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clear All confirm modal */}
        {clearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
            <div className="panel w-full max-w-sm mx-4" style={{ backgroundColor: '#232225' }}>
              <div className="panel-header">
                <span className="text-sm font-semibold" style={{ color: '#ff5c5c' }}>Clear All Mappings</span>
                <button onClick={() => setClearConfirm(false)} className="btn-icon text-text-muted"><IcoX /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-2 p-3 rounded text-xs"
                  style={{ backgroundColor: '#2a1810', border: '1px solid #7a3f20' }}>
                  <span style={{ color: '#ff5c5c', flexShrink: 0, marginTop: 1 }}><IcoWarning /></span>
                  <span style={{ color: '#e09a55' }}>
                    This will delete all <strong>{mappings.length}</strong> NexDay mappings.
                    The Signal column will show <strong>—</strong> for all symbols until re-mapped.
                  </span>
                </div>
                <p className="text-sm text-text-primary">Are you sure you want to clear all mappings?</p>
                <div className="flex items-center justify-end gap-3">
                  <button onClick={() => setClearConfirm(false)} className="btn btn-ghost text-sm">Cancel</button>
                  <button onClick={handleClearAll}
                    className="btn text-sm"
                    style={{ backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}>
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}