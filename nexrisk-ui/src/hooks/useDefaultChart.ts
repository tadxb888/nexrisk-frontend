// ============================================
// useDefaultChart
//
// Persists the user's preferred default chart on the Portfolio page
// to localStorage. On mount, returns the saved id or DEFAULT_CHART_ID
// from the registry as fallback. The setter writes through.
//
// Synchronous useState initializer (no hydration race) — same pattern
// as PortfolioStatsContext's strategyRealized seed.
// ============================================

import { useState, useCallback, useEffect } from 'react';

import {
  DEFAULT_CHART_ID,
  CHART_BY_ID,
  type ChartId,
} from '@/components/portfolio/charts/registry';

const STORAGE_KEY = 'nexrisk.portfolio.defaultChart';

function readPinned(): ChartId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (raw in CHART_BY_ID)) {
      return raw as ChartId;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through.
  }
  return DEFAULT_CHART_ID;
}

export function useDefaultChart(): {
  /** The chart id pinned as the user's default (read on mount). */
  pinnedId: ChartId;
  /** Pin a chart id as the new default. Writes through to localStorage. */
  setPinnedId: (id: ChartId) => void;
  /** Convenience: is this chart id the current default? */
  isPinned: (id: ChartId) => boolean;
} {
  const [pinnedId, setPinnedIdState] = useState<ChartId>(() => readPinned());

  const setPinnedId = useCallback((id: ChartId) => {
    setPinnedIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // best-effort write — ignore storage errors
    }
  }, []);

  // Cross-tab sync: react if another tab changes the pin.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue in CHART_BY_ID) {
        setPinnedIdState(e.newValue as ChartId);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isPinned = useCallback((id: ChartId) => id === pinnedId, [pinnedId]);

  return { pinnedId, setPinnedId, isPinned };
}