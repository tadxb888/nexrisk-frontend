// ============================================================================
// FxCellPicker
// ----------------------------------------------------------------------------
// Two-step modal:
//   1. Pick a source (active MT5 node).
//   2. Pick a symbol from that node's catalogue (searchable).
//
// On confirm, calls onConfirm(source_id, symbol, digits). The hook persists.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { mt5Api, type MT5NodeAPI } from '@/services/api';

interface SymbolEntry {
  symbol:        string;
  description:   string;
  digits:        number;
}

export interface FxCellPickerProps {
  open:      boolean;
  nodes:     MT5NodeAPI[];                                          // active nodes only
  onClose:   () => void;
  onConfirm: (source_id: string, symbol: string, digits: number) => void;
}

const FONT_MONO = "'IBM Plex Mono', monospace";

type Step = 'source' | 'symbol';

export function FxCellPicker({ open, nodes, onClose, onConfirm }: FxCellPickerProps) {
  const [step, setStep]               = useState<Step>('source');
  const [selectedNode, setSelectedNode] = useState<MT5NodeAPI | null>(null);
  const [symbols, setSymbols]         = useState<SymbolEntry[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const searchRef                     = useRef<HTMLInputElement>(null);

  // Reset on each open
  useEffect(() => {
    if (open) {
      setStep('source');
      setSelectedNode(null);
      setSymbols([]);
      setSymbolsError(null);
      setSearch('');
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // When entering symbol step, fetch catalog and focus the search input
  useEffect(() => {
    if (step !== 'symbol' || !selectedNode) return;
    let cancelled = false;
    setSymbolsLoading(true);
    setSymbolsError(null);
    mt5Api.getNodeSymbols(selectedNode.id)
      .then(res => { if (!cancelled) setSymbols(res.symbols); })
      .catch(e => { if (!cancelled) setSymbolsError(e instanceof Error ? e.message : 'Failed to load symbols'); })
      .finally(() => { if (!cancelled) setSymbolsLoading(false); });
    // Focus search after the next paint
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { cancelled = true; };
  }, [step, selectedNode]);

  const filteredSymbols = useMemo(() => {
    if (!search.trim()) return symbols;
    const q = search.trim().toUpperCase();
    return symbols.filter(s =>
      s.symbol.toUpperCase().includes(q) || s.description.toUpperCase().includes(q)
    );
  }, [symbols, search]);

  // Only the Master node streams prices, so it is the only valid FX-cell source.
  // Narrow the passed active nodes down to the master before showing the picker.
  const masterNodes = useMemo(() => nodes.filter(n => n.is_master), [nodes]);

  if (!open) return null;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: 560,
          backgroundColor: '#2a292c',
          border: '1px solid #555',
          borderRadius: 6,
          color: '#fff',
          fontFamily: '-apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #3a3a3e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {step === 'source' ? 'Add FX Cell — pick a source' : 'Add FX Cell — pick a symbol'}
            </div>
            {step === 'symbol' && selectedNode && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, fontFamily: FONT_MONO }}>
                source: {selectedNode.node_name}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              fontSize: 18,
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {step === 'source' ? (
            <SourceList nodes={masterNodes} onPick={(n) => { setSelectedNode(n); setStep('symbol'); }} />
          ) : (
            <SymbolList
              symbols={filteredSymbols}
              loading={symbolsLoading}
              error={symbolsError}
              search={search}
              onSearchChange={setSearch}
              searchRef={searchRef}
              onPick={(s) => {
                if (selectedNode) onConfirm(selectedNode.node_name, s.symbol, s.digits);
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid #3a3a3e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          {step === 'symbol' ? (
            <button
              onClick={() => setStep('source')}
              style={{
                background: 'transparent',
                border: '1px solid #555',
                color: '#ddd',
                borderRadius: 3,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              ‹ Back
            </button>
          ) : <span />}
          <span style={{ color: '#888', fontSize: 11 }}>
            Step {step === 'source' ? '1' : '2'} of 2
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Source list ──────────────────────────────────────────────────────────────

function SourceList({
  nodes,
  onPick,
}: {
  nodes: MT5NodeAPI[];
  onPick: (n: MT5NodeAPI) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div style={{ padding: 18, color: '#aaa', fontSize: 12 }}>
        No Master MT5 node. Designate one in <em>System → MT5 Servers</em>.
      </div>
    );
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {nodes.map(n => (
        <li key={n.id}>
          <button
            onClick={() => onPick(n)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #3a3a3e',
              color: '#fff',
              padding: '12px 18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#33323590')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontFamily: FONT_MONO }}>{n.node_name}</span>
              <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {n.node_type}{n.is_master ? ' · MASTER' : ''}
              </span>
            </span>
            <StatusBadge status={n.connection_status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isConnected = status === 'CONNECTED';
  const color = isConnected ? '#66e07a' : '#888';
  return (
    <span
      title={`connection_status: ${status} (REST is best-effort; live status comes from WS)`}
      style={{
        fontSize: 9,
        color,
        border: `1px solid ${color}40`,
        padding: '2px 6px',
        borderRadius: 2,
        letterSpacing: '0.06em',
      }}
    >
      {status || 'UNKNOWN'}
    </span>
  );
}

// ── Symbol list ──────────────────────────────────────────────────────────────

function SymbolList({
  symbols, loading, error, search, onSearchChange, searchRef, onPick,
}: {
  symbols: SymbolEntry[];
  loading: boolean;
  error:   string | null;
  search:  string;
  onSearchChange: (s: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  onPick:  (s: SymbolEntry) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid #3a3a3e' }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search symbol or description…"
          style={{
            width: '100%',
            background: '#1e1e22',
            border: '1px solid #3a3a3e',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 3,
            fontSize: 12,
            fontFamily: FONT_MONO,
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 280 }}>
        {loading && <div style={{ padding: 18, color: '#aaa', fontSize: 12 }}>Loading symbols…</div>}
        {error && <div style={{ padding: 18, color: '#ff6b6b', fontSize: 12 }}>{error}</div>}
        {!loading && !error && symbols.length === 0 && (
          <div style={{ padding: 18, color: '#aaa', fontSize: 12 }}>No matches.</div>
        )}
        {!loading && !error && symbols.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {symbols.map(s => (
              <li key={s.symbol}>
                <button
                  onClick={() => onPick(s)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #3a3a3e',
                    color: '#fff',
                    padding: '8px 18px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#33323590')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ fontSize: 13, fontFamily: FONT_MONO }}>{s.symbol}</span>
                  <span style={{ fontSize: 11, color: '#888', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default FxCellPicker;