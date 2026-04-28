// ============================================
// useMt5MasterNode
//
// Fetches the single MT5 Master node from /api/v1/mt5/nodes (the app
// supports exactly one Master at a time per spec). Result is shared
// across all consumers via in-module cache + listener pattern so we
// don't hit the endpoint once per chart.
//
// Returns the master node (or null while loading / on error). The
// `name` field drives the Mt5NodeSelector display label, the `id`
// flows into chart data fetches as the per-chart `mt5_node` filter.
// ============================================

import { useEffect, useState } from 'react';

import { mt5Api } from '@/services/api';
import type { MT5NodeAPI } from '@/services/api';

// ── Module-level cache ─────────────────────────────────────────
// One fetch per page load. If the master node changes (edited via
// MT5 Servers admin page) the user can refresh; not worth a WS
// subscription for what is effectively configuration.
let cached: MT5NodeAPI | null = null;
let inflight: Promise<MT5NodeAPI | null> | null = null;
const listeners = new Set<(n: MT5NodeAPI | null) => void>();

function notify(node: MT5NodeAPI | null) {
  cached = node;
  for (const fn of listeners) fn(node);
}

async function fetchMaster(): Promise<MT5NodeAPI | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  // mt5Api.getMasterNode already encodes the prefer-CONNECTED-master then
  // any-master fallback; reuse rather than duplicate that policy here.
  inflight = mt5Api.getMasterNode()
    .then(node => {
      const resolved = node ?? null;
      notify(resolved);
      return resolved;
    })
    .catch(() => {
      notify(null);
      return null;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

export function useMt5MasterNode(): {
  node: MT5NodeAPI | null;
  loading: boolean;
} {
  const [node, setNode] = useState<MT5NodeAPI | null>(cached);
  const [loading, setLoading] = useState<boolean>(cached == null);

  useEffect(() => {
    let mounted = true;
    listeners.add(setNode);

    if (cached == null) {
      fetchMaster().finally(() => {
        if (mounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
      listeners.delete(setNode);
    };
  }, []);

  return { node, loading };
}