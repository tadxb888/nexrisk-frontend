// ============================================
// PortfolioStatsContext
//
// Single source of truth for the aggregate book stats consumed by
// the four cards on the Portfolio page (B / A / C / Cost) AND the
// global Portfolio Card on the TopBar.
//
// This Provider opens its own WebSocket subscriptions independently
// of CBookPage / BBookPage so those page components stay untouched.
// Trade-off: when the user is on /b-book or /coverage-book there
// will be a second MT5 / FIX WS open. Acceptable cost — the win is
// that the global Portfolio Card is live on every page without any
// CBookPage refactor.
//
// Status by book:
//   • B-Book — live via mt5.position WebSocket (connectBBookWebSocket).
//             Realized P/L still null pending B-Book daily-stats endpoint.
//   • A-Book — live via FIX WS POSITION_REPORT (positions / volume /
//             unrealized) + per-strategy realized P/L accumulated from
//             POSITION_CLOSED events with rule_name lookup.
//             Persisted to localStorage so a mid-day refresh keeps the
//             A vs C split.
//   • C-Book — live via FIX WS POSITION_REPORT (positions / volume /
//             unrealized) + realized P/L derived as (lpTotal − A-Book).
//             lpTotal seeded once via REST (sum of all LPs' daily-stats),
//             then incremented on each POSITION_CLOSED. Note we can't
//             distinguish Terminal vs DOM here — DOM-trader tagging is
//             owned by CBookPage's posOverrideRef. For Portfolio
//             aggregates that's fine: both flow into C-Book.
//   • Cost   — placeholder. Pending Commissions + Swaps + Fees endpoint.
// ============================================

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

import {
  connectBBookWebSocket,
  type MT5PositionWithNode,
  type BBookWsEvent,
} from '@/services/api';

// =============================================================================
// CONSTANTS
// =============================================================================

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';
const WS_BASE  = (import.meta as any).env?.VITE_WS_URL  || 'ws://localhost:8080';
const FIX_WS_PATH = '/ws/v1/fix/events';

// =============================================================================
// SHAPES — exported for consumers
// =============================================================================

/** Per-book aggregate (used by B / A / C cards). */
export interface BookCardStats {
  positions:  number | null;
  buys:       number | null;
  sells:      number | null;
  /** Lots for B-Book; lots (|net_qty|) for A/C — caller treats as unit-agnostic. */
  volume:     number | null;
  unrealized: number | null;
  realized:   number | null;
}

export const EMPTY_BOOK_STATS: BookCardStats = {
  positions: null, buys: null, sells: null, volume: null, unrealized: null, realized: null,
};

/** Cost card — Commissions + Swaps + Fees, earned − charged. */
export interface CostCardStats {
  net:         number | null;
  commissions: number | null;
  swaps:       number | null;
  fees:        number | null;
}

export const EMPTY_COST_STATS: CostCardStats = {
  net: null, commissions: null, swaps: null, fees: null,
};

/** Total aggregate — drives the global Portfolio Card on the TopBar. */
export interface TotalCardStats {
  positions:  number | null;
  buys:       number | null;
  sells:      number | null;
  volume:     number | null;
  unrealized: number | null;
  realized:   number | null;
}

export interface PortfolioStatsValue {
  bbook: BookCardStats;
  abook: BookCardStats;
  cbook: BookCardStats;
  cost:  CostCardStats;
  total: TotalCardStats;
}

const DEFAULT_VALUE: PortfolioStatsValue = {
  bbook: EMPTY_BOOK_STATS,
  abook: EMPTY_BOOK_STATS,
  cbook: EMPTY_BOOK_STATS,
  cost:  EMPTY_COST_STATS,
  total: EMPTY_BOOK_STATS,
};

// =============================================================================
// FIX-side internal shape — minimal data needed for aggregates
// =============================================================================

interface FIXLitePosition {
  lp_id:          string;
  position_id:    string;
  symbol:         string;
  side:           'BUY' | 'SELL' | 'FLAT';
  net_qty:        number;
  open_price:     number;
  unrealized_pnl: number | null;
}

/** Side derivation matches CBookPage's positionToCBook. */
function deriveSide(pd: any): 'BUY' | 'SELL' | 'FLAT' {
  if (pd.side === 'LONG'  || pd.side === 'BUY')  return 'BUY';
  if (pd.side === 'SHORT' || pd.side === 'SELL') return 'SELL';
  if ((pd.long_qty  ?? 0) > 0 && (pd.short_qty ?? 0) === 0) return 'BUY';
  if ((pd.short_qty ?? 0) > 0 && (pd.long_qty  ?? 0) === 0) return 'SELL';
  return 'FLAT';
}

/** `${lp_id}:${position_id}` — composite key for the cross-LP map. */
const posKey = (lpId: string, positionId: string) => `${lpId}:${positionId}`;

// =============================================================================
// FORMAT HELPERS — exported so cards in every consumer render identically
// =============================================================================

/** Full $X,XXX.XX. */
export const fmtHdrMoney = (val: number): string => {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${val < 0 ? '-' : ''}$${abs}`;
};

/** K / M / B compact volume formatter for narrow Volume cells. */
export const fmtHdrCompact = (val: number, prefix = ''): string => {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000_000)  return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)     return `${sign}${prefix}${(abs / 1_000).toFixed(0)}K`;
  if (abs >= 1_000)      return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`;
  const hasFraction = Math.abs(abs - Math.round(abs)) > 0.001;
  return `${sign}${prefix}${abs.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

/** P/L colour — NetExposure palette. Returns muted grey for null. */
export const pnlColor = (v: number | null | undefined): string =>
  v == null ? '#d2d6e2' : v > 0 ? '#6aaa78' : v < 0 ? '#d07070' : '#d2d6e2';

// =============================================================================
// CONTEXT + HOOK
// =============================================================================

const PortfolioStatsContext = createContext<PortfolioStatsValue>(DEFAULT_VALUE);

export function usePortfolioStats(): PortfolioStatsValue {
  return useContext(PortfolioStatsContext);
}

// =============================================================================
// PROVIDER
// =============================================================================

export function PortfolioStatsProvider({ children }: { children: ReactNode }) {

  // ─────────────────────────────────────────────────────────────────────────
  // B-BOOK — live MT5 position feed
  // ─────────────────────────────────────────────────────────────────────────
  const [bbookPositions, setBbookPositions] = useState<MT5PositionWithNode[]>([]);

  useEffect(() => {
    const cleanup = connectBBookWebSocket((ev: BBookWsEvent) => {
      if (ev.type === 'SNAPSHOT') {
        setBbookPositions(ev.data);
      } else if (ev.type === 'POSITION_ADD') {
        setBbookPositions(prev => {
          const idx = prev.findIndex(p => p.position_id === ev.data.position_id);
          if (idx >= 0) { const next = [...prev]; next[idx] = ev.data; return next; }
          return [...prev, ev.data];
        });
      } else if (ev.type === 'POSITION_CHANGE') {
        const delta = ev.data as Partial<MT5PositionWithNode> & { position_id: number };
        setBbookPositions(prev =>
          prev.map(p => (p.position_id === delta.position_id ? { ...p, ...delta } : p))
        );
      } else if (ev.type === 'POSITION_DELETE') {
        const id = (ev.data as { position_id: number }).position_id;
        setBbookPositions(prev => prev.filter(p => p.position_id !== id));
      }
    });
    return cleanup;
  }, []);

  const bbook = useMemo<BookCardStats>(() => {
    if (bbookPositions.length === 0) {
      return { positions: 0, buys: 0, sells: 0, volume: 0, unrealized: 0, realized: null };
    }
    let buys = 0, sells = 0, volume = 0, unrealized = 0;
    for (const p of bbookPositions) {
      // Broker takes opposite side of client; broker P&L is inverse of client.
      const brokerSide: 'BUY' | 'SELL' = p.action === 'BUY' ? 'SELL' : 'BUY';
      if (brokerSide === 'BUY') buys += 1; else sells += 1;
      volume     += p.volume_lots;
      unrealized += -p.profit;
    }
    return {
      positions:  bbookPositions.length,
      buys, sells, volume, unrealized,
      realized:   null, // TODO: B-Book daily-stats endpoint
    };
  }, [bbookPositions]);

  // ─────────────────────────────────────────────────────────────────────────
  // A-BOOK + C-BOOK — live FIX position feed (cross-LP aggregate)
  //
  // Two pieces of state:
  //   • fixPositions  — Map<"lpId:positionId", FIXLitePosition>
  //                     keeps every open FIX position across all LPs
  //   • hedgeRuleMap  — Map<lp_position_id, rule_name>
  //                     classification source for A vs C
  //
  // Hedge records: REST seed once + hedge.fill WS for incremental updates.
  // CBookPage polls /api/v1/hedge/records every 30s; we don't, to stay
  // consistent with the WS-first architecture. If the user creates a new
  // strategy outside this app's session, we'll see the rule_name when its
  // first hedge.fill arrives.
  // ─────────────────────────────────────────────────────────────────────────
  const [fixPositions, setFixPositions] = useState<Map<string, FIXLitePosition>>(new Map());
  const [hedgeRuleMap, setHedgeRuleMap] = useState<Map<string, string>>(new Map());

  // Realised-P/L tracking (cross-LP).
  //   • lpTotalRealized   — sum of realized_pnl across all LPs for today.
  //                         Seeded once via REST, then incremented per
  //                         POSITION_CLOSED event.
  //   • strategyRealized  — rule_name → cumulative realized today.
  //                         Built incrementally from POSITION_CLOSED events
  //                         where the closed position had a rule_name.
  //                         Hydrated synchronously from localStorage so
  //                         a mid-day refresh doesn't lose the per-strategy
  //                         split (synchronous initializer avoids the race
  //                         between the persist effect and an async load).
  //   • tradeDate         — the backend's authoritative trade-date (from
  //                         daily-stats). Triggers strategyRealized clear
  //                         when the date advances.
  // C-Book realized = lpTotalRealized − sum(strategyRealized).
  // Both A-Book and C-Book realized stay null until lpTotalRealized seeds.
  const STRATEGY_REALIZED_KEY = 'taiga:portfolio-strategy-realized';
  const [lpTotalRealized,  setLpTotalRealized]  = useState<number | null>(null);
  const [strategyRealized, setStrategyRealized] = useState<Map<string, number>>(() => {
    try {
      const raw = localStorage.getItem(STRATEGY_REALIZED_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw) as { entries?: [string, number][] };
      return new Map(parsed?.entries ?? []);
    } catch { return new Map(); }
  });
  const [tradeDate, setTradeDate] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(STRATEGY_REALIZED_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { tradeDate?: string };
      return parsed?.tradeDate ?? null;
    } catch { return null; }
  });

  // Synchronous mirror of hedgeRuleMap so the WS handler can look up
  // rule_name on a POSITION_CLOSED without a stale-closure issue.
  const hedgeRuleMapRef = useRef(hedgeRuleMap);
  useEffect(() => { hedgeRuleMapRef.current = hedgeRuleMap; }, [hedgeRuleMap]);

  // ── Hedge records seed (REST, once) ──────────────────────────────────
  // Non-fatal: if unavailable, positions stay C-Book until hedge.fill
  // arrives from the WS.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/hedge/records?page_size=200`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json) return;
        const records: { lp_position_id?: string | null; rule_name?: string | null }[] =
          json.data ?? (Array.isArray(json) ? json : []);
        const map = new Map<string, string>();
        for (const r of records) {
          if (r.lp_position_id && r.rule_name) map.set(r.lp_position_id, r.rule_name);
        }
        setHedgeRuleMap(map);
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  // Persist strategyRealized + tradeDate to localStorage on every change.
  // Synchronous useState initializers above hydrate from this same key on
  // mount, so there's no race between hydration and persistence.
  useEffect(() => {
    try {
      localStorage.setItem(
        STRATEGY_REALIZED_KEY,
        JSON.stringify({
          tradeDate: tradeDate ?? new Date().toISOString().slice(0, 10),
          entries:   [...strategyRealized.entries()],
        }),
      );
    } catch { /* ignore quota errors */ }
  }, [strategyRealized, tradeDate]);

  // ── LP list + all-LPs daily-stats backfill (REST, once) ─────────────
  // Sums realized_pnl across all LPs to seed lpTotalRealized. After this
  // seed lands, POSITION_CLOSED events keep it incrementally up to date
  // without further REST traffic (matches WS-first principle).
  // Drift correction: if missed events cause lpTotalRealized to diverge
  // from the DB, refreshing the page re-seeds.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/fix/status`)
      .then(res => (res.ok ? res.json() : null))
      .then((statusJson: any) => {
        if (cancelled || !statusJson?.success) return;
        const lpDict = (statusJson.data?.lps ?? {}) as Record<string, any>;
        const lpIds = Object.keys(lpDict);
        if (lpIds.length === 0) {
          setLpTotalRealized(0);
          return;
        }
        return Promise.all(
          lpIds.map(id =>
            fetch(`${API_BASE}/api/v1/fix/daily-stats?lp_id=${encodeURIComponent(id)}`)
              .then(r => (r.ok ? r.json() : null))
              .then(j => ({
                realized:  j?.success && typeof j.data?.realized_pnl === 'number' ? j.data.realized_pnl : 0,
                tradeDate: j?.success ? (j.data?.trade_date as string | undefined) : undefined,
              }))
              .catch(() => ({ realized: 0, tradeDate: undefined as string | undefined })),
          ),
        );
      })
      .then((results) => {
        if (cancelled || !results) return;
        const total = results.reduce((s, r) => s + r.realized, 0);
        const seenDate = results.find(r => r.tradeDate)?.tradeDate;
        setLpTotalRealized(total);
        if (seenDate) setTradeDate(seenDate);
      })
      .catch(() => { /* non-fatal — realized P/L cells stay '—' */ });
    return () => { cancelled = true; };
  }, []);

  // ── Trade-date rollover ──────────────────────────────────────────────
  // When the backend's tradeDate advances (midnight in the broker's
  // timezone, or whatever policy nexrisk_service uses to stamp
  // risk.cbook_closed_positions.trade_date), wipe the per-strategy
  // realized so today's cards start clean.
  const tradeDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tradeDate) return;
    if (tradeDateRef.current && tradeDateRef.current !== tradeDate) {
      setStrategyRealized(new Map());
      setLpTotalRealized(0);
      try { localStorage.removeItem(STRATEGY_REALIZED_KEY); } catch {}
    }
    tradeDateRef.current = tradeDate;
  }, [tradeDate]);

  // ── FIX WebSocket subscription ────────────────────────────────────────
  // Reconnect with exponential back-off (1s → 2s → 4s … cap 30s),
  // mirrors the BBook WS pattern.
  useEffect(() => {
    let mounted = true;
    let retry   = 0;
    let timer:  ReturnType<typeof setTimeout> | null = null;
    let ws:     WebSocket | null = null;

    const connect = () => {
      if (!mounted) return;
      ws = new WebSocket(`${WS_BASE}${FIX_WS_PATH}`);

      ws.onopen = () => { retry = 0; };

      ws.onmessage = (ev: MessageEvent<string>) => {
        if (!mounted) return;
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }

        // ── hedge.fill → enrich rule_name map ───────────────────────────
        // Must be checked first — same WS topic as EXECUTION_REPORT, the
        // `topic` field distinguishes (matches CBookPage's ordering).
        if (msg.topic === 'hedge.fill') {
          const hd = (msg.data ?? msg) as Record<string, unknown>;
          const lpPosId  = hd.lp_position_id as string | undefined;
          const ruleName = hd.rule_name      as string | undefined;
          if (lpPosId && ruleName) {
            setHedgeRuleMap(prev => {
              if (prev.get(lpPosId) === ruleName) return prev;
              const next = new Map(prev);
              next.set(lpPosId, ruleName);
              return next;
            });
          }
          return;
        }

        // ── POSITION_REPORT → upsert / remove ──────────────────────────
        // No LP filter — Portfolio aggregates across all LPs. Skip events
        // missing lp_id (can't key the map without it).
        if (msg.type === 'POSITION_REPORT') {
          const lpId = msg.lp_id as string | undefined;
          if (!lpId) return;
          const pd = msg.data ?? msg;
          const positionId: string = pd.position_id ?? '';
          if (!positionId) return;
          const key = posKey(lpId, positionId);

          // open_price === 0 from TE means the position was closed externally.
          if ((pd.open_price ?? 0) === 0) {
            setFixPositions(prev => {
              if (!prev.has(key)) return prev;
              const next = new Map(prev);
              next.delete(key);
              return next;
            });
            return;
          }

          const lite: FIXLitePosition = {
            lp_id:          lpId,
            position_id:    positionId,
            symbol:         pd.symbol ?? '',
            side:           deriveSide(pd),
            net_qty:        pd.net_qty ?? 0,
            open_price:     pd.open_price ?? 0,
            unrealized_pnl: typeof pd.unrealized_pnl === 'number' ? pd.unrealized_pnl : null,
          };
          setFixPositions(prev => {
            const next = new Map(prev);
            next.set(key, lite);
            return next;
          });
          return;
        }

        // ── POSITION_CLOSED → remove + accumulate realized P/L ───────
        // The event payload carries realized_pnl (and commission/swap,
        // which we'll wire when the Cost card lands). Route into
        // strategyRealized if the closed position was an A-Book
        // (rule_name present in hedgeRuleMap); otherwise it counts
        // toward C-Book implicitly (cbook = lpTotal − sum(strategy)).
        if (msg.type === 'POSITION_CLOSED') {
          const lpId = msg.lp_id as string | undefined;
          const pid  = (msg.position_id ?? msg.data?.position_id) as string | undefined;
          if (!lpId || !pid) return;
          const key = posKey(lpId, pid);

          // Look up rule_name BEFORE removing from any maps. Once removed
          // the lookup might still work (we keep hedgeRuleMap entries) but
          // doing it here mirrors CBookPage's ordering.
          const ruleName = hedgeRuleMapRef.current.get(pid);

          const d = msg.data ?? msg;
          const evtPnl = typeof d.realized_pnl === 'number' ? d.realized_pnl : 0;
          if (evtPnl !== 0) {
            // LP-wide running total — increment whether A or C.
            setLpTotalRealized(prev => (prev ?? 0) + evtPnl);
            // Per-strategy bucket — only when this close was an A-Book hedge.
            if (ruleName) {
              setStrategyRealized(prev => {
                const next = new Map(prev);
                next.set(ruleName, (next.get(ruleName) ?? 0) + evtPnl);
                return next;
              });
            }
          }

          setFixPositions(prev => {
            if (!prev.has(key)) return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          return;
        }

        // ── POSITION_UPDATED → patch in place ─────────────────────────
        // TE partial close: same position, reduced qty / new unrealized.
        if (msg.type === 'POSITION_UPDATED') {
          const lpId = msg.lp_id as string | undefined;
          const upd  = msg.data ?? msg;
          const pid  = (upd.position_id ?? upd.positionId) as string | undefined;
          if (!lpId || !pid) return;
          const key = posKey(lpId, pid);
          setFixPositions(prev => {
            const existing = prev.get(key);
            if (!existing) return prev;
            const patched: FIXLitePosition = {
              ...existing,
              net_qty: upd.net_qty ?? existing.net_qty,
              unrealized_pnl: typeof upd.unrealized_pnl === 'number'
                ? upd.unrealized_pnl
                : existing.unrealized_pnl,
            };
            const next = new Map(prev);
            next.set(key, patched);
            return next;
          });
          return;
        }
      };

      ws.onerror = () => { /* let onclose handle reconnect */ };
      ws.onclose = () => {
        if (!mounted) return;
        const delay = Math.min(1000 * 2 ** retry, 30_000);
        retry += 1;
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null; // suppress reconnect on intentional close
        ws.close(1000, 'unmount');
      }
    };
  }, []);

  // ── Aggregate A-Book and C-Book ────────────────────────────────────
  // Classification: position has rule_name → A-Book; otherwise C-Book.
  // rule_name is looked up from hedgeRuleMap (REST seed + hedge.fill WS).
  //
  // Realized split (matches CBookPage's approach):
  //   abookRealized = sum of per-strategy realized (built up via WS
  //                   POSITION_CLOSED, persisted across page refreshes
  //                   via localStorage)
  //   cbookRealized = lpTotalRealized − abookRealized
  // Both stay null until lpTotalRealized has seeded from REST. Once the
  // backfill lands they show concrete numbers — even if zero.
  const { abook, cbook } = useMemo<{ abook: BookCardStats; cbook: BookCardStats }>(() => {
    let aPos = 0, aBuys = 0, aSells = 0, aVol = 0, aUnrl: number | null = null;
    let cPos = 0, cBuys = 0, cSells = 0, cVol = 0, cUnrl: number | null = null;

    for (const p of fixPositions.values()) {
      // Defensive: closed positions should already be removed.
      if (p.open_price <= 0) continue;
      const isAutomated = !!hedgeRuleMap.get(p.position_id);
      const lots = Math.abs(p.net_qty);
      const buyInc  = p.side === 'BUY'  ? 1 : 0;
      const sellInc = p.side === 'SELL' ? 1 : 0;

      if (isAutomated) {
        aPos  += 1;
        aBuys += buyInc;
        aSells += sellInc;
        aVol  += lots;
        if (p.unrealized_pnl != null) aUnrl = (aUnrl ?? 0) + p.unrealized_pnl;
      } else {
        cPos  += 1;
        cBuys += buyInc;
        cSells += sellInc;
        cVol  += lots;
        if (p.unrealized_pnl != null) cUnrl = (cUnrl ?? 0) + p.unrealized_pnl;
      }
    }

    const abookRealized: number | null = lpTotalRealized != null
      ? [...strategyRealized.values()].reduce((s, v) => s + v, 0)
      : null;
    const cbookRealized: number | null = lpTotalRealized != null
      ? lpTotalRealized - (abookRealized ?? 0)
      : null;

    return {
      abook: {
        positions: aPos, buys: aBuys, sells: aSells, volume: aVol,
        unrealized: aUnrl,
        realized:   abookRealized,
      },
      cbook: {
        positions: cPos, buys: cBuys, sells: cSells, volume: cVol,
        unrealized: cUnrl,
        realized:   cbookRealized,
      },
    };
  }, [fixPositions, hedgeRuleMap, lpTotalRealized, strategyRealized]);

  // ─────────────────────────────────────────────────────────────────────────
  // COST — placeholder pending Commissions+Swaps+Fees endpoint
  // ─────────────────────────────────────────────────────────────────────────
  const cost: CostCardStats = EMPTY_COST_STATS;

  // ─────────────────────────────────────────────────────────────────────────
  // TOTAL — sum of all four books for the global Portfolio Card.
  // sumOrNull keeps cells null until at least one source has populated them.
  // ─────────────────────────────────────────────────────────────────────────
  const total = useMemo<TotalCardStats>(() => {
    const sumOrNull = (vals: (number | null)[]): number | null => {
      const present = vals.filter((v): v is number => v != null);
      return present.length === 0 ? null : present.reduce((s, v) => s + v, 0);
    };
    return {
      positions:  sumOrNull([bbook.positions, abook.positions, cbook.positions]),
      buys:       sumOrNull([bbook.buys,      abook.buys,      cbook.buys]),
      sells:      sumOrNull([bbook.sells,     abook.sells,     cbook.sells]),
      volume:     sumOrNull([bbook.volume,    abook.volume,    cbook.volume]),
      unrealized: sumOrNull([bbook.unrealized, abook.unrealized, cbook.unrealized]),
      realized:   sumOrNull([bbook.realized,  abook.realized,  cbook.realized, cost.net]),
    };
  }, [bbook, abook, cbook, cost]);

  const value = useMemo<PortfolioStatsValue>(
    () => ({ bbook, abook, cbook, cost, total }),
    [bbook, abook, cbook, cost, total],
  );

  return (
    <PortfolioStatsContext.Provider value={value}>
      {children}
    </PortfolioStatsContext.Provider>
  );
}