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
//   • A-Book — live via FIX WS POSITION_REPORT, classified by rule_name
//             from hedge records (lp_position_id → rule_name).
//   • C-Book — live via FIX WS POSITION_REPORT, positions WITHOUT a
//             rule_name (i.e. manual: Terminal / DOM Trader). Note we
//             can't distinguish Terminal vs DOM here — DOM-trader
//             tagging is owned by CBookPage's posOverrideRef and we
//             don't touch CBookPage. For Portfolio aggregates that's
//             fine: both flow into C-Book.
//   • Cost   — placeholder. Pending Commissions + Swaps + Fees endpoint.
//
// Realized P/L for A-Book and C-Book is intentionally left null. The
// CBookPage path requires REST daily-stats backfill plus localStorage
// persistence for per-strategy realised P/L. Wiring that here is a
// follow-up — leaving the cell as `—` is more honest than showing
// "$0.00" until the first close lands after the WS connects.
// ============================================

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
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

        // ── POSITION_CLOSED → remove ──────────────────────────────────
        if (msg.type === 'POSITION_CLOSED') {
          const lpId = msg.lp_id as string | undefined;
          const pid  = (msg.position_id ?? msg.data?.position_id) as string | undefined;
          if (!lpId || !pid) return;
          const key = posKey(lpId, pid);
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

    return {
      abook: {
        positions: aPos, buys: aBuys, sells: aSells, volume: aVol,
        unrealized: aUnrl,
        realized:   null, // TODO: daily-stats backfill + per-strategy WS accumulation
      },
      cbook: {
        positions: cPos, buys: cBuys, sells: cSells, volume: cVol,
        unrealized: cUnrl,
        realized:   null, // TODO: daily-stats backfill (LP total − A-Book sum)
      },
    };
  }, [fixPositions, hedgeRuleMap]);

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