// ============================================================================
// useAlertsBar
// ----------------------------------------------------------------------------
// Hook that owns:
//   • the user's saved cells (loaded from / saved to backend)
//   • a live tick map keyed by `${source_id}|${symbol}`
//   • a node-status map (for offline detection)
//   • a per-(source, symbol) precision cache (digits from MT5 symbol catalog)
//
// Stale detection runs from a 1 Hz tick so cells fade after STALE_AFTER_MS
// without an incoming tick, even when no other state has changed.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  alertsBarApi,
  connectAlertsBarWebSocket,
  mt5Api,
  type AlertsBarCell,
  type MT5NodeAPI,
  type QuoteTick,
} from '@/services/api';

const STALE_AFTER_MS = 60_000;
const STALE_TIMER_MS = 1_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type CellState = 'live' | 'stale' | 'offline' | 'pending';
export type CellDirection = 'up' | 'down' | 'flat';

export interface CellTick {
  ask:          number;
  bid?:         number;
  last?:        number;
  receivedAt:   number; // browser-side timestamp (ms)
}

export interface UseAlertsBarResult {
  cells:        AlertsBarCell[];
  nodes:        MT5NodeAPI[];           // active (enabled) MT5 nodes for the picker
  loading:      boolean;
  error:        string | null;
  saving:       boolean;
  /** Returns null until the first tick arrives. */
  getTick:      (cell: AlertsBarCell) => CellTick | null;
  getPrecision: (cell: AlertsBarCell) => number;
  getState:     (cell: AlertsBarCell) => CellState;
  /** Direction of the most recent tick relative to the previous one. */
  getDirection: (cell: AlertsBarCell) => CellDirection;
  addCell:      (source_id: string, symbol: string, digits: number) => Promise<void>;
  removeCell:   (cellIndex: number) => Promise<void>;
  reorder:      (fromIndex: number, toIndex: number) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const cellKey = (sourceId: string, symbol: string) => `${sourceId}|${symbol}`;

/** Fallback precision when the symbol catalog hasn't loaded yet. */
function fallbackPrecision(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper.includes('JPY')) return 3;
  if (/^(XAU|XAG|XPT|XPD)/.test(upper)) return 2;
  return 5;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAlertsBar(): UseAlertsBarResult {
  const [cells, setCells]     = useState<AlertsBarCell[]>([]);
  const [nodes, setNodes]     = useState<MT5NodeAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Live tick map — kept in a ref so WS handlers see the current value, with
  // a tickVersion counter to drive re-renders when ticks arrive.
  const ticksRef = useRef<Map<string, CellTick>>(new Map());
  // Direction of the most recent tick relative to the previous one.
  // Sticks until the next price change contradicts it (Bloomberg/EBS convention).
  const directionRef = useRef<Map<string, CellDirection>>(new Map());
  const [tickVersion, setTickVersion] = useState(0);

  // Precision cache (source_id|symbol → digits)
  const precisionRef = useRef<Map<string, number>>(new Map());

  // Node status map (node_id → connection_status), seeded from getNodes()
  // and kept fresh by mt5.node_status WS frames.
  const nodeStatusRef = useRef<Map<number, string>>(new Map());
  const nodeIdByNameRef = useRef<Map<string, number>>(new Map());
  const [, setNodeStatusVersion] = useState(0);

  // 1 Hz heartbeat — drives stale detection.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), STALE_TIMER_MS);
    return () => clearInterval(id);
  }, []);

  // ── Load nodes + cells, prime precision cache for every source ─────────────
  // Node and cell loads are decoupled: a failure on one side should not
  // prevent the other from working (e.g. picker still functions if cells
  // can't be loaded for some reason).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // Load nodes
      try {
        const nodesRes = await mt5Api.getNodes();
        if (cancelled) return;
        setNodes(nodesRes.nodes);
        nodeStatusRef.current = new Map(nodesRes.nodes.map(n => [n.id, n.connection_status]));
        nodeIdByNameRef.current = new Map(nodesRes.nodes.map(n => [n.node_name, n.id]));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load nodes');
      }

      // Load cells (independent of nodes)
      let loadedCells: AlertsBarCell[] = [];
      try {
        const cellsRes = await alertsBarApi.getCells();
        if (cancelled) return;
        loadedCells = cellsRes.cells;
        setCells(cellsRes.cells);
      } catch {
        // Non-fatal: picker still works without saved cells.
      }

      // Prime precision cache for any source that has cells.
      if (loadedCells.length > 0) {
        const nodesNow = await mt5Api.getNodes().catch(() => null);
        const nodeList = nodesNow?.nodes ?? [];
        const uniqueSources = Array.from(new Set(loadedCells.map(c => c.source_id)));
        await Promise.all(uniqueSources.map(async (sourceId) => {
          const node = nodeList.find(n => n.node_name === sourceId);
          if (!node) return;
          try {
            const symRes = await mt5Api.getNodeSymbols(node.id);
            for (const s of symRes.symbols) {
              precisionRef.current.set(cellKey(sourceId, s.symbol), s.digits);
            }
          } catch {
            // Source may be offline — fallback rule applies.
          }
        }));
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── WebSocket subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = connectAlertsBarWebSocket((ev) => {
      if (ev.kind === 'quote') {
        const { sourceId, symbol, tick } = ev;
        const k = cellKey(sourceId, symbol);

        // Direction: compare new ask to previous before overwriting.
        // Equal prices keep the existing direction (don't reset to flat).
        const prev = ticksRef.current.get(k);
        if (prev && tick.ask !== prev.ask) {
          directionRef.current.set(k, tick.ask > prev.ask ? 'up' : 'down');
        } else if (!prev) {
          directionRef.current.set(k, 'flat');
        }

        ticksRef.current.set(k, {
          ask:        tick.ask,
          bid:        tick.bid,
          last:       tick.last,
          receivedAt: Date.now(),
        });
        // Bump version to trigger re-render. State equality check avoids
        // unbounded growth: version monotonically increases.
        setTickVersion(v => v + 1);
      } else if (ev.kind === 'node_status') {
        nodeStatusRef.current.set(ev.nodeId, ev.status);
        setNodeStatusVersion(v => v + 1);
      }
    });
    return cleanup;
  }, []);

  // ── Accessors ──────────────────────────────────────────────────────────────
  const getTick = useCallback<UseAlertsBarResult['getTick']>(
    (cell) => ticksRef.current.get(cellKey(cell.source_id, cell.symbol)) ?? null,
    // tickVersion read intentionally so consumers re-render with new values.
    [tickVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const getPrecision = useCallback<UseAlertsBarResult['getPrecision']>(
    (cell) =>
      precisionRef.current.get(cellKey(cell.source_id, cell.symbol))
        ?? fallbackPrecision(cell.symbol),
    []
  );

  const getState = useCallback<UseAlertsBarResult['getState']>(
    (cell) => {
      const nodeId = nodeIdByNameRef.current.get(cell.source_id);
      const nodeStatus = nodeId !== undefined ? nodeStatusRef.current.get(nodeId) : undefined;
      if (nodeStatus && nodeStatus !== 'CONNECTED') return 'offline';

      const tick = ticksRef.current.get(cellKey(cell.source_id, cell.symbol));
      if (!tick) return 'pending';
      return now - tick.receivedAt > STALE_AFTER_MS ? 'stale' : 'live';
    },
    [now]
  );

  const getDirection = useCallback<UseAlertsBarResult['getDirection']>(
    (cell) =>
      directionRef.current.get(cellKey(cell.source_id, cell.symbol)) ?? 'flat',
    // tickVersion read so consumers re-render when direction changes.
    [tickVersion] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const persist = useCallback(async (next: AlertsBarCell[]) => {
    setSaving(true);
    try {
      return await alertsBarApi.saveCells({
        cells: next.map(c => ({ source_type: 'mt5', source_id: c.source_id, symbol: c.symbol })),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const addCell = useCallback<UseAlertsBarResult['addCell']>(
    async (source_id, symbol, digits) => {
      if (cells.length >= 4) return;
      const next: AlertsBarCell[] = [
        ...cells,
        { cell_index: cells.length, source_type: 'mt5', source_id, symbol },
      ];
      // Prime precision cache immediately so the first render has correct digits.
      precisionRef.current.set(cellKey(source_id, symbol), digits);
      setCells(next);
      try {
        await persist(next);
      } catch (e) {
        setCells(cells); // rollback — server didn't accept the change
        precisionRef.current.delete(cellKey(source_id, symbol));
        setError(e instanceof Error ? e.message : 'Failed to save cell');
      }
    },
    [cells, persist]
  );

  const removeCell = useCallback<UseAlertsBarResult['removeCell']>(
    async (cellIndex) => {
      const next = cells
        .filter((_, i) => i !== cellIndex)
        .map((c, i) => ({ ...c, cell_index: i }));
      setCells(next);
      try {
        await persist(next);
      } catch (e) {
        setCells(cells); // rollback
        setError(e instanceof Error ? e.message : 'Failed to remove cell');
      }
    },
    [cells, persist]
  );

  const reorder = useCallback<UseAlertsBarResult['reorder']>(
    async (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const next = [...cells];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const renumbered = next.map((c, i) => ({ ...c, cell_index: i }));
      setCells(renumbered);
      try {
        await persist(renumbered);
      } catch (e) {
        setCells(cells); // rollback
        setError(e instanceof Error ? e.message : 'Failed to reorder');
      }
    },
    [cells, persist]
  );

  // ── Active nodes for the picker ────────────────────────────────────────────
  // Filter on is_enabled only. connection_status from the REST endpoint is
  // unreliable (same workaround the BFF mt5-ws layer uses); live status is
  // tracked separately via the mt5.node_status WS stream and surfaced on the
  // cell itself as the "OFFLINE" tag when needed.
  const activeNodes = useMemo(
    () => nodes.filter(n => n.is_enabled !== false),
    [nodes]
  );

  return {
    cells,
    nodes: activeNodes,
    loading,
    error,
    saving,
    getTick,
    getPrecision,
    getState,
    getDirection,
    addCell,
    removeCell,
    reorder,
  };
}