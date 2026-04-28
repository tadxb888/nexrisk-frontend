// ============================================
// Mt5NodeSelector
//
// Per-chart MT5 Master node selector. The app supports exactly one
// Master at a time, so this renders as a dropdown with a single
// option — but the structure allows adding multi-Master support
// later without touching consumers.
//
// Visual: matches BBookPage filter-bar dropdown style (dark bg,
// muted border, mono font).
// ============================================

import { useMt5MasterNode } from '@/hooks/useMt5MasterNode';

interface Props {
  /** Currently selected node id. */
  value:    number | null;
  /** Setter — called when the user picks a different node. */
  onChange: (id: number | null) => void;
}

export function Mt5NodeSelector({ value, onChange }: Props) {
  const { node, loading } = useMt5MasterNode();

  // Auto-bind to the master node id when the fetch completes — the
  // parent shouldn't have to wire this race themselves.
  if (!loading && node && value !== node.id) {
    // setTimeout 0 to avoid setState-during-render warning.
    queueMicrotask(() => onChange(node.id));
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-[#aaa]">MT5 Node:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={loading || !node}
        className="bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-[#49b3b3] disabled:opacity-50"
        title={node ? `${node.node_name} — ${node.server_address}` : 'Loading master node…'}
      >
        {loading && <option value="">Loading…</option>}
        {!loading && !node && <option value="">No master node</option>}
        {node && (
          <option value={node.id}>
            {node.node_name} — [Master]
          </option>
        )}
      </select>
    </div>
  );
}