// ============================================
// Taiga Risk Radar
//
// A weather-radar view of the book over a fixed instrument map. Three layers
// share the same map: Exposure, Flow toxicity, Liquidity.
//
// Phase 1 — the Exposure layer runs on live data:
//   seed   GET /api/v1/risk-radar/exposure               (once, on open)
//   live   topic portfolio.exposure.symbols              (WebSocket, ~1 Hz)
//   limit  GET /api/v1/risk-radar/risk-limits            (once, on open)
//   moves  GET /api/v1/risk/daily-moves                  (once, on open)
//   P&L    GET /api/v1/risk-radar/month-pnl              (once, on open)
//          then topic portfolio.summary.month            (WebSocket)
//   stress GET /api/v1/risk/largest-1day                 (once, on open)
//   groups GET /api/v1/risk-radar/instruments            (once, on open)
//   check  GET /api/v1/risk-radar/mt5-book               (once, on open)
//
// Flow toxicity layer (phase 1, docs/NexRisk_Risk_Radar_Flow_API.md):
//   seed   GET /api/v1/risk-radar/flow                   (once, on open)
//   live   topic radar.flow.symbols                      (WebSocket, ≤ 1 Hz)
//   detail GET /api/v1/risk-radar/flow/{symbol}/accounts (on selecting an instrument)
//   Colour = share of the B-Book flow from flagged accounts (riskRadar/flowModel.ts).
//
// The colour is the risk measure (riskRadar/model.ts): money the broker can
// lose on an instrument under its historical adverse move, after the
// unrealised P&L of B + A + C, as a share of the loss capacity left this
// month (the broker's limit, Settings → Risk Limits). Share of B-Book stays
// in the inspector as information only.
//
// The map is grouped by the broker's own symbol tree on the MT5 MASTER — no
// grouping is invented here. The MT5 book check is what lets an empty or
// partial exposure feed be told apart from a flat book: while no live
// snapshot has arrived, instruments MT5 holds B-Book positions in but the
// feed has no figure for are drawn grey with their lots.
// Nothing is polled. Flow toxicity and Liquidity show an explicit
// "awaiting feed" state until the service publishes their measures — no layer
// ever paints a colour it has no measurement for.
//
// Platforms: every figure can be read for MT5, for cTrader, or for both
// merged (the same instrument netted across the two). A row without a
// `platform` is the MT5 book — all the exposure feed carries today — so until
// the service publishes cTrader positions the cTrader view says "awaiting data
// feed" and "Both" says it is showing MT5 only.
//
// Reading rules the page keeps to:
//   • colour is the measure — the dot on an instrument is its exact band, the
//     glow around it fades out from that level; place and outline carry nothing;
//   • an instrument without a USD value, a P&L or an adverse move is drawn
//     grey (unpriced ◇ / unrated ○), never green;
//   • the timeline replays what this page observed, nothing reconstructed;
//   • the buttons open other pages — nothing is executed from here.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  connectRiskRadarWebSocket,
  getRiskRadarExposure,
  cockpitApi,
  riskRadarApi,
  riskLimitsApi,
  flowApi,
  type DailyMovesData,
  type FlowAccountRow,
  type FlowAccountsData,
  type FlowPayload,
  type PortfolioExposureSymbolsData,
  type RiskLimitsSection,
  type RiskRadarMt5Book,
} from '@/services/api';
import { usePermission } from '@/stores/usePermission';
import { buildMap, groupsFromTree, hashSymbol, type InstrumentMap } from './riskRadar/instrumentMap';
import { RadarIcon } from './riskRadar/RadarIcon';
import {
  buildFlowView,
  bookShareOf,
  classLabel,
  fmtWindow,
  shareOf,
  type FlowSymbol,
  type FlowView,
} from './riskRadar/flowModel';
import { HeatRenderer, rampGradientCss, type HeatBlob } from './riskRadar/heatField';
import {
  BANDS,
  BAND_BY_ID,
  HISTORY_WINDOW_MS,
  MAX_DAILY_RANGE,
  SAMPLE_EVERY_MS,
  PLATFORM_LABEL,
  bookRiskOf,
  buildView,
  coverageOf,
  fmtLots,
  fmtMovePct,
  fmtPct,
  fmtSpan,
  fmtUsd,
  fmtUtcDateTime,
  fmtUtcTime,
  parseTime,
  riskOf,
  scopeLabel,
  sideOf,
  trendOf,
  type Band,
  type Capacity,
  type Platform,
  type PlatformScope,
  type RadarSymbol,
  type RadarView,
  type RiskContext,
  type Sample,
  type Trend,
} from './riskRadar/model';

// ── Page palette ─────────────────────────────────────────────
// The radar is deliberately brighter than the rest of the platform.
const C = {
  page:      '#070a0f',
  panel:     '#0b1017',
  panelEdge: '#1b2633',
  map:       '#05080d',
  text:      '#ffffff',
  soft:      '#d5dde8',
  faint:     '#93a3b6',
  line:      '#1f2b39',
  blue:      '#2f7dff',
  blueSoft:  '#8fb8ff',
  grey:      '#8a97a8',
  up:        '#ff8a14',
  down:      '#3ddc57',
};

const LIVE_STALE_MS = 15_000;

type Layer = 'exposure' | 'flow' | 'liquidity';

const SCOPES: Array<{ id: PlatformScope; label: string }> = [
  { id: 'ALL',     label: 'Both' },
  { id: 'MT5',     label: 'MT5' },
  { id: 'CTRADER', label: 'cTrader' },
];
const PLATFORMS: Platform[] = ['MT5', 'CTRADER'];
const SCOPE_KEY = 'taiga.riskRadar.platform';

function loadScope(): PlatformScope {
  try {
    const v = window.localStorage.getItem(SCOPE_KEY);
    if (v === 'ALL' || v === 'MT5' || v === 'CTRADER') return v;
  } catch { /* storage unavailable: default */ }
  return 'ALL';
}

function saveScope(scope: PlatformScope) {
  try { window.localStorage.setItem(SCOPE_KEY, scope); } catch { /* not remembered, nothing else lost */ }
}

const LAYERS: Array<{ id: Layer; label: string }> = [
  { id: 'exposure',  label: 'Exposure' },
  { id: 'flow',      label: 'Flow toxicity' },
  { id: 'liquidity', label: 'Liquidity' },
];

const STYLE = `
.rr-pulse { transform-box: fill-box; transform-origin: center; animation: rr-pulse 2.2s ease-out infinite; }
@keyframes rr-pulse { 0% { transform: scale(1); opacity: .85; } 100% { transform: scale(3.2); opacity: 0; } }
.rr-live-dot { animation: rr-blink 1.6s ease-in-out infinite; }
@keyframes rr-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .rr-pulse, .rr-live-dot { animation: none; } .rr-pulse { opacity: 0; } }
.rr-node { cursor: pointer; outline: none; }
.rr-node:focus-visible .rr-focus { stroke: #ffffff; stroke-width: 2; }
.rr-row { cursor: pointer; }
.rr-row:hover, .rr-row:focus-visible { background: #131c27; outline: none; }
.rr-btn { transition: filter .12s ease, background .12s ease; }
.rr-btn:hover:not(:disabled) { filter: brightness(1.15); }
.rr-btn:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }
.rr-scrub { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; margin: 0; cursor: pointer; position: relative; }
.rr-scrub:disabled { cursor: default; }
.rr-scrub::-webkit-slider-runnable-track { height: 4px; background: transparent; }
.rr-scrub::-moz-range-track { height: 4px; background: transparent; }
.rr-scrub::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #ffffff; border: 2px solid #2f7dff; box-shadow: 0 0 10px rgba(47,125,255,.8); }
.rr-scrub::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 2px solid #2f7dff; box-shadow: 0 0 10px rgba(47,125,255,.8); }
.rr-scrub:disabled::-webkit-slider-thumb { background: #5b6878; border-color: #5b6878; box-shadow: none; }
.rr-scrub:disabled::-moz-range-thumb { background: #5b6878; border-color: #5b6878; box-shadow: none; }
.rr-scrub:focus { outline: none; }
.rr-scrub:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(255,255,255,.9), 0 0 10px rgba(47,125,255,.8); }
.rr-scrub:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(255,255,255,.9), 0 0 10px rgba(47,125,255,.8); }
`;

// ═══════════════════════════════════════════════════════════════════════════
// Feed — seed once, then live; observed history kept for the session
// ═══════════════════════════════════════════════════════════════════════════

// Kept at module level so the observed history survives leaving the page and
// coming back within the same session.
const history: Sample[] = [];

function record(snapshot: PortfolioExposureSymbolsData, t: number): boolean {
  const last = history[history.length - 1];
  if (last && t - last.t < SAMPLE_EVERY_MS) return false;
  history.push({ t, snapshot });
  while (history.length > 1 && t - history[0].t > HISTORY_WINDOW_MS) history.shift();
  return true;
}

// The flow payloads, recorded the same way, for replay and the trend lines.
interface FlowSample { t: number; payload: FlowPayload }
const flowHistory: FlowSample[] = [];

function recordFlow(payload: FlowPayload, t: number): boolean {
  const last = flowHistory[flowHistory.length - 1];
  if (last && t - last.t < SAMPLE_EVERY_MS) return false;
  flowHistory.push({ t, payload });
  while (flowHistory.length > 1 && t - flowHistory[0].t > HISTORY_WINDOW_MS) flowHistory.shift();
  return true;
}

/** The last flow sample at or before t (the flow at that moment), else the first. */
function flowIndexAt(t: number): number {
  let best = -1;
  for (let i = 0; i < flowHistory.length; i++) if (flowHistory[i].t <= t) best = i;
  return best < 0 ? (flowHistory.length ? 0 : -1) : best;
}

type SocketState = 'connecting' | 'open' | 'closed';

function useRadarFeed() {
  const [snapshot, setSnapshot] = useState<PortfolioExposureSymbolsData | null>(
    () => (history.length ? history[history.length - 1].snapshot : null),
  );
  const [socket, setSocket] = useState<SocketState>('connecting');
  const [lastLiveAt, setLastLiveAt] = useState<number | null>(null);
  const [realizedMtd, setRealizedMtd] = useState<number | null>(null);
  const [flow, setFlow] = useState<FlowPayload | null>(
    () => (flowHistory.length ? flowHistory[flowHistory.length - 1].payload : null),
  );
  const [flowLiveAt, setFlowLiveAt] = useState<number | null>(null);
  /** The seed answered: null = not yet, false = 503 / error (layer not running). */
  const [flowSeeded, setFlowSeeded] = useState<boolean | null>(null);
  const flowLive = useRef(false);
  const [, setHistoryVersion] = useState(0);
  const liveSeen = useRef(false);
  const monthLive = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const accept = (data: PortfolioExposureSymbolsData, live: boolean) => {
      const now = Date.now();
      setSnapshot(data);
      if (live) setLastLiveAt(now);
      if (record(data, parseTime(data.as_of) ?? now)) setHistoryVersion((v) => v + 1);
    };

    // Seed: fills the map at once, and is all there is while the market is
    // shut and the live topic is silent. A live snapshot always wins.
    getRiskRadarExposure()
      .then((d) => {
        if (!cancelled && !liveSeen.current && d && Array.isArray(d.by_symbol)) accept(d, false);
      })
      .catch(() => { /* the live feed remains the primary source */ });

    // Realised P&L of the month: the loss already taken comes off the limit.
    riskRadarApi.getMonthPnl()
      .then((d) => {
        if (!cancelled && !monthLive.current && d && typeof d.realized === 'number') setRealizedMtd(d.realized);
      })
      .catch(() => { /* capacity shows as not loaded until the topic speaks */ });

    // Flow toxicity: seed, then the topic. 503 = the layer is not running yet.
    const acceptFlow = (d: FlowPayload, live: boolean) => {
      const now = Date.now();
      setFlow(d);
      if (live) setFlowLiveAt(now);
      if (recordFlow(d, parseTime(d.as_of) ?? now)) setHistoryVersion((v) => v + 1);
    };
    flowApi.get()
      .then((d) => {
        if (cancelled) return;
        setFlowSeeded(true);
        if (!flowLive.current && d && Array.isArray(d.by_symbol)) acceptFlow(d, false);
      })
      .catch(() => { if (!cancelled) setFlowSeeded(false); });

    const stop = connectRiskRadarWebSocket(
      (d) => {
        if (cancelled) return;
        liveSeen.current = true;
        accept(d, true);
      },
      (status) => { if (!cancelled) setSocket(status); },
      (m) => {
        const r = m.total?.realized;
        if (cancelled || typeof r !== 'number' || !Number.isFinite(r)) return;
        monthLive.current = true;
        setRealizedMtd(r);
      },
      (f) => {
        if (cancelled) return;
        flowLive.current = true;
        setFlowSeeded(true);
        acceptFlow(f, true);
      },
    );

    return () => { cancelled = true; stop(); };
  }, []);

  return { snapshot, socket, lastLiveAt, realizedMtd, flow, flowLiveAt, flowSeeded };
}

/** Adverse move per symbol, read once. null until it arrives. */
function useDailyMoves(): DailyMovesData | null {
  const [data, setData] = useState<DailyMovesData | null>(null);
  useEffect(() => {
    let cancelled = false;
    riskLimitsApi.getDailyMoves()
      .then((d) => { if (!cancelled && d && typeof d === 'object' && d.symbols) setData(d); })
      .catch(() => { /* every instrument stays unrated */ });
    return () => { cancelled = true; };
  }, []);
  return data;
}

/** The broker's loss limit and bands, read once. null until it arrives. */
function useRiskLimits(): RiskLimitsSection | null {
  const [data, setData] = useState<RiskLimitsSection | null>(null);
  useEffect(() => {
    let cancelled = false;
    riskLimitsApi.getForRadar()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* capacity shows as not loaded */ });
    return () => { cancelled = true; };
  }, []);
  return data;
}

function useLargest1Day(): Record<string, number> | null {
  const [data, setData] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    cockpitApi.getLargest1Day()
      .then((d) => { if (!cancelled && d && typeof d === 'object') setData(d); })
      .catch(() => { /* worst-day figures show "—" */ });
    return () => { cancelled = true; };
  }, []);
  return data;
}

/** The broker's symbol tree, read once. Until it arrives the map has one region. */
function useSymbolTree() {
  const [tree, setTree] = useState<{ groupOf: Map<string, string>; order: string[]; source: string | null }>(
    () => ({ groupOf: new Map(), order: [], source: null }),
  );
  useEffect(() => {
    let cancelled = false;
    riskRadarApi.getInstruments()
      .then((d) => {
        if (cancelled || !d || !Array.isArray(d.instruments)) return;
        setTree({ ...groupsFromTree(d.instruments), source: d.source?.node_name ?? null });
      })
      .catch(() => { /* instruments stay under "Unclassified" */ });
    return () => { cancelled = true; };
  }, []);
  return tree;
}

/** Open B-Book positions per symbol on the MT5 servers, read once. */
function useMt5Book(): RiskRadarMt5Book | null {
  const [book, setBook] = useState<RiskRadarMt5Book | null>(null);
  useEffect(() => {
    let cancelled = false;
    riskRadarApi.getMt5Book()
      .then((d) => { if (!cancelled && d && Array.isArray(d.by_symbol)) setBook(d); })
      .catch(() => { /* the page then relies on the exposure feed alone */ });
    return () => { cancelled = true; };
  }, []);
  return book;
}

/** A local clock tick, for "is the feed still fresh". No network. */
function useClock(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function nearestIndex(t: number): number {
  let best = 0;
  let gap = Infinity;
  for (let i = 0; i < history.length; i++) {
    const g = Math.abs(history[i].t - t);
    if (g < gap) { gap = g; best = i; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// Small pieces
// ═══════════════════════════════════════════════════════════════════════════

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.panelEdge}`,
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BandBadge({ band, large }: { band: Band; large?: boolean }) {
  const def = BAND_BY_ID[band];
  return (
    <span
      className="font-mono"
      style={{
        display: 'inline-block',
        background: def.color,
        color: def.ink,
        fontSize: large ? 13 : 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding: large ? '5px 12px' : '2px 7px',
        borderRadius: 4,
        boxShadow: large ? `0 0 16px ${def.color}66` : undefined,
      }}
    >
      {def.label.toUpperCase()}
    </span>
  );
}

function GreyBadge({ text }: { text: string }) {
  return (
    <span
      className="font-mono"
      style={{
        display: 'inline-block',
        border: `1px dashed ${C.grey}`,
        color: C.soft,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding: '4px 11px',
        borderRadius: 4,
      }}
    >
      {text}
    </span>
  );
}

function trendText(trend: Trend): string {
  const span = fmtSpan(trend.spanMs);
  if (trend.change === null) return `New · ${span}`;
  const pct = Math.abs(trend.change * 100);
  const sign = trend.change > 0 ? '+' : trend.change < 0 ? '−' : '';
  return `${sign}${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}% · ${span}`;
}

function TrendChip({ trend, large }: { trend: Trend; large?: boolean }) {
  const color = trend.dir === 'building' ? C.up : trend.dir === 'easing' ? C.down : C.soft;
  const arrow = trend.dir === 'building' ? '▲' : trend.dir === 'easing' ? '▼' : '■';
  const word = trend.dir === 'building' ? 'Building' : trend.dir === 'easing' ? 'Easing' : 'Steady';
  return (
    <span
      className="font-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        border: large ? `1px solid ${color}88` : undefined,
        background: large ? `${color}1a` : undefined,
        padding: large ? '4px 10px' : 0,
        borderRadius: 4,
        fontSize: large ? 13 : 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: large ? 10 : 9 }}>{arrow}</span>
      {large ? `${word} ${trendText(trend)}` : trendText(trend)}
    </span>
  );
}

function Sparkline({
  values, width, height, color,
}: { values: number[]; width: number; height: number; color: string }) {
  if (values.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: C.faint, fontSize: 11 }}>
        collecting…
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <path d={area} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={3} fill={color} stroke={C.panel} strokeWidth={1.5} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary cards
// ═══════════════════════════════════════════════════════════════════════════

function Card({
  accent, label, children, aside,
}: { accent: string; label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <Panel style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
      <div style={{ width: 4, background: accent, boxShadow: `0 0 14px ${accent}` }} />
      <div style={{ flex: 1, minWidth: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.soft, letterSpacing: '0.02em' }}>{label}</div>
          {children}
        </div>
        {aside}
      </div>
    </Panel>
  );
}

function CardValue({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono" style={{ fontSize: 26, fontWeight: 600, color: C.text, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  );
}

function CardNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {children}
    </div>
  );
}

function capacityNote(cap: Capacity): string {
  switch (cap.state) {
    case 'loading':  return 'Risk limits not loaded';
    case 'no_limit': return 'No monthly loss limit set, so nothing can be coloured';
    case 'no_pnl':   return `Limit ${fmtUsd(cap.limit)} · month-to-date P&L not loaded`;
    case 'ok': {
      if ((cap.remaining ?? 0) <= 0) return `Limit ${fmtUsd(cap.limit)} used up by this month's losses`;
      const lim = `Limit ${fmtUsd(cap.limit)}${cap.carriedOver ? ' (carried over)' : ''}`;
      return cap.lossTaken
        ? `${lim} − loss taken this month ${fmtUsd(cap.lossTaken)}`
        : `${lim} · no loss taken this month`;
    }
  }
}

function LimitsLink() {
  const navigate = useNavigate();
  const { can } = usePermission();
  if (!can('settings', 'VIEW')) return null;
  return (
    <button
      type="button"
      className="rr-btn"
      onClick={() => navigate('/settings/risk-limits')}
      style={{
        padding: '6px 11px', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: 'transparent', color: '#ffffff', border: `1px solid ${C.blueSoft}88`, whiteSpace: 'nowrap',
      }}
    >
      Risk Limits →
    </button>
  );
}

function ExposureCards({
  view, upto, ctx, scope,
}: { view: RadarView; upto: number; ctx: RiskContext; scope: PlatformScope }) {
  const risks = history.slice(0, upto + 1).map((s) => bookRiskOf(s.snapshot, ctx));
  const trend = trendOf(history, upto, (s) => bookRiskOf(s.snapshot, ctx));
  const sparkColor = trend?.dir === 'building' ? C.up : trend?.dir === 'easing' ? C.down : C.blueSoft;
  const cap = view.capacity;
  const top = view.symbols.find((s) => (s.risk ?? 0) > 0) ?? null;
  const bookDef = view.bookBand ? BAND_BY_ID[view.bookBand] : null;
  const measured = view.rated > 0;
  const capAccent = cap.state !== 'ok' ? '#ffb020' : (cap.remaining ?? 0) <= 0 ? '#ff3b30' : C.blue;

  const bookNote = !measured
    ? (view.unrated + view.unpriced > 0 ? 'No instrument can be rated' : 'No open exposure in this snapshot')
    : [
        view.bookLevel !== null ? `${fmtPct(view.bookLevel)} of capacity left` : 'no level without a limit',
        `${view.atRisk} instrument${view.atRisk === 1 ? '' : 's'} at risk`,
        view.unrated > 0 ? `${view.unrated} unrated` : null,
      ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Card
        accent={bookDef?.color ?? C.blue}
        label={scope === 'ALL' ? 'Book risk' : 'Book risk · whole book'}
        aside={<Sparkline values={risks} width={132} height={42} color={sparkColor} />}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{measured ? fmtUsd(view.bookRisk) : '—'}</CardValue>
          {measured && view.bookBand && <BandBadge band={view.bookBand} />}
          {trend && measured && <TrendChip trend={trend} />}
        </div>
        <CardNote>{bookNote}</CardNote>
      </Card>

      <Card accent={capAccent} label="Loss capacity left this month" aside={<LimitsLink />}>
        <CardValue>
          {cap.remaining !== null
            ? <span style={{ color: cap.remaining <= 0 ? '#ff5c5c' : C.text }}>{fmtUsd(cap.remaining)}</span>
            : '—'}
        </CardValue>
        <CardNote>{capacityNote(cap)}</CardNote>
      </Card>

      <Card accent={top?.band ? BAND_BY_ID[top.band].color : C.grey} label="Largest instrument risk">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{top ? fmtUsd(top.risk) : '—'}</CardValue>
          {top && <span className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{top.symbol}</span>}
          {top?.band && <BandBadge band={top.band} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {BANDS.map((b) => (
            <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.soft, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
              {b.label}
              <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{view.bandCounts[b.id]}</span>
            </span>
          ))}
          {view.unrated > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.soft, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${C.grey}` }} />
              Unrated
              <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{view.unrated}</span>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

const PENDING_CARDS: Record<Exclude<Layer, 'exposure'>, string[]> = {
  flow: ['Adverse markout', 'Flagged accounts', 'Confidence'],
  liquidity: ['Degraded routes', 'Reject rate', 'Stale quotes'],
};

const EXPOSURE_CARDS = ['Book risk', 'Loss capacity left this month', 'Largest instrument risk'];

function PendingCards({ labels }: { labels: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {labels.map((label) => (
        <Card key={label} accent={C.grey} label={label}>
          <CardValue><span style={{ color: C.grey }}>—</span></CardValue>
          <CardNote>Awaiting data feed</CardNote>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The map
// ═══════════════════════════════════════════════════════════════════════════

interface Placed {
  s: MapItem;
  x: number;
  y: number;
  label: { x: number; y: number; w: number; h: number } | null;
}

const LABEL_H = 20;
const LABEL_LIMIT = 26;

function labelWidth(text: string): number {
  return Math.round(text.length * 7.4 + 14);
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
}

function captionOf(name: string): string {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

function captionWidth(name: string): number {
  return captionOf(name).length * 7.3 + 18;
}

function placeSymbols(
  items: MapItem[],
  imap: InstrumentMap,
  w: number,
  h: number,
  always: Array<string | null>,
): Placed[] {
  const out: Placed[] = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const pinned = new Set(always.filter(Boolean) as string[]);

  const positions = imap.positions;

  // Region captions are obstacles too.
  for (const r of imap.regions) {
    boxes.push({ x: r.rect.x * w + 8, y: r.rect.y * h + 6, w: captionWidth(r.name), h: 22 });
  }

  // …and so is every marker: a name never sits on another instrument's dot.
  for (const s of items) {
    const pos = positions.get(s.symbol);
    if (pos) boxes.push({ x: pos.x * w - 6, y: pos.y * h - 6, w: 12, h: 12 });
  }

  const ordered = [...items].sort(
    (a, b) => Number(pinned.has(b.symbol)) - Number(pinned.has(a.symbol)),
  );
  let labelled = 0;

  for (const s of ordered) {
    const pos = positions.get(s.symbol);
    if (!pos) continue;
    const x = pos.x * w;
    const y = pos.y * h;
    // 'always' items (a data gap to notice) are always named.
    const wants = pinned.has(s.symbol) || s.label === 'always' || (s.label === 'normal' && labelled < LABEL_LIMIT);
    let label: Placed['label'] = null;
    if (wants) {
      const lw = labelWidth(s.symbol);
      const candidates = [
        { x: x + 10, y: y - LABEL_H / 2 },
        { x: x - 10 - lw, y: y - LABEL_H / 2 },
        { x: x - lw / 2, y: y - 12 - LABEL_H },
        { x: x - lw / 2, y: y + 12 },
      ];
      for (const c of candidates) {
        const box = { x: c.x, y: c.y, w: lw, h: LABEL_H };
        if (box.x < 2 || box.y < 2 || box.x + box.w > w - 2 || box.y + box.h > h - 2) continue;
        if (boxes.some((b) => overlaps(box, b))) continue;
        label = box;
        break;
      }
      if (!label && pinned.has(s.symbol)) {
        label = { x: Math.max(2, Math.min(w - lw - 2, x + 10)), y: Math.max(2, Math.min(h - LABEL_H - 2, y - LABEL_H / 2)), w: lw, h: LABEL_H };
      }
      if (label) { boxes.push(label); if (s.label !== 'always') labelled++; }
    }
    out.push({ s, x, y, label });
  }
  return out;
}

function symbolAria(s: RadarSymbol): string {
  if (s.rating === 'unpriced') return `${s.symbol}: unpriced, ${s.missing.join(', ')}`;
  if (s.rating === 'unrated') return `${s.symbol}: unrated, no adverse move, net ${fmtLots(s.netLots)} lots`;
  if (!((s.risk ?? 0) > 0)) return `${s.symbol}: nothing at risk`;
  const lvl = s.level !== null ? `, ${fmtPct(s.level)} of the capacity left` : ', no level';
  return `${s.symbol}: ${s.band ? BAND_BY_ID[s.band].label : 'risk'} ${fmtUsd(s.risk)}${lvl}`;
}

interface RadarMapProps {
  items: MapItem[];
  imap: InstrumentMap;
  /** The layer has a measurement: colour and readings are drawn. */
  active: boolean;
  selected: string | null;
  onSelect: (symbol: string | null) => void;
  children?: ReactNode;
}

function RadarMap({ items, imap, active, selected, onSelect, children }: RadarMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HeatRenderer | null>(null);
  const shownRef = useRef(new Map<string, number>());
  const rafRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positions = imap.positions;

  // What each patch should reach; the picture eases towards it.
  const targets = useMemo(() => {
    const m = new Map<string, number>();
    if (active) {
      for (const s of items) if (s.heat > 0) m.set(s.symbol, s.heat);
    }
    return m;
  }, [items, active]);

  const stateRef = useRef({ targets, positions, size });
  stateRef.current = { targets, positions, size };

  const draw = useCallback(() => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const { targets: goal, positions: pos, size: sz } = stateRef.current;
    if (!canvas || sz.w < 8 || sz.h < 8) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== sz.w * dpr || canvas.height !== sz.h * dpr) {
      canvas.width = sz.w * dpr;
      canvas.height = sz.h * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Ease the shown levels towards their targets.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const shown = shownRef.current;
    let moving = false;
    for (const key of new Set([...shown.keys(), ...goal.keys()])) {
      const to = goal.get(key) ?? 0;
      const from = shown.get(key) ?? 0;
      let next = reduce ? to : from + (to - from) * 0.16;
      if (Math.abs(to - next) < 0.004) next = to; else moving = true;
      if (next <= 0 && to <= 0) shown.delete(key); else shown.set(key, next);
    }

    // Backdrop: near-black with a faint scope grid.
    ctx.fillStyle = C.map;
    ctx.fillRect(0, 0, sz.w, sz.h);
    const glow = ctx.createRadialGradient(sz.w / 2, sz.h / 2, 0, sz.w / 2, sz.h / 2, Math.max(sz.w, sz.h) * 0.7);
    glow.addColorStop(0, 'rgba(22, 44, 70, 0.34)');
    glow.addColorStop(1, 'rgba(5, 8, 13, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, sz.w, sz.h);
    ctx.strokeStyle = 'rgba(130, 170, 215, 0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x < sz.w; x += 34) { ctx.moveTo(x, 0); ctx.lineTo(x, sz.h); }
    for (let y = 0.5; y < sz.h; y += 34) { ctx.moveTo(0, y); ctx.lineTo(sz.w, y); }
    ctx.stroke();

    // A crowded region gets smaller patches so it does not merge into a carpet.
    const crowd = new Map<string, number>();
    for (const symbol of shown.keys()) {
      const p = pos.get(symbol);
      if (p) crowd.set(p.region, (crowd.get(p.region) ?? 0) + 1);
    }

    const base = Math.min(sz.h, sz.w * 0.5);
    const blobs: HeatBlob[] = [];
    for (const [symbol, heat] of shown) {
      const p = pos.get(symbol);
      if (!p) continue;
      const tight = Math.max(0.62, Math.min(1, Math.sqrt(7 / (crowd.get(p.region) ?? 1))));
      blobs.push({
        x: p.x * sz.w,
        y: p.y * sz.h,
        r: base * (0.11 + 0.19 * heat) * tight,
        heat,
        seed: hashSymbol(symbol),
      });
    }
    // Hottest last is irrelevant for a maximum, but a fixed order keeps frames identical.
    blobs.sort((a, b) => a.seed - b.seed);
    if (!rendererRef.current) rendererRef.current = new HeatRenderer();
    rendererRef.current.render(ctx, sz.w, sz.h, blobs);

    if (moving) rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(draw);
  }, [draw, targets, positions, size]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const placed = useMemo(
    () => (size.w > 0 ? placeSymbols(items, imap, size.w, size.h, [selected, hovered]) : []),
    [items, imap, size, selected, hovered],
  );

  // The inspector already describes the selected instrument.
  const hoveredItem = hovered && hovered !== selected ? placed.find((p) => p.s.symbol === hovered) ?? null : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 7 }}
      onClick={() => onSelect(null)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />

      <svg
        width={size.w}
        height={size.h}
        style={{ position: 'absolute', inset: 0 }}
        role="group"
        aria-label="Instrument map"
      >
        {/* Regions: the broker's own symbol groups — geography only */}
        {imap.regions.map((f) => {
          const x = f.rect.x * size.w, y = f.rect.y * size.h;
          const w = f.rect.w * size.w, h = f.rect.h * size.h;
          const lw = Math.min(captionWidth(f.name), Math.max(40, w - 16));
          return (
            <g key={f.id} pointerEvents="none">
              <rect
                x={x} y={y} width={w} height={h} rx={16}
                fill="none" stroke="rgba(150, 180, 215, 0.26)" strokeWidth={1} strokeDasharray="4 5"
              />
              <rect x={x + 8} y={y + 6} width={lw} height={22} rx={4} fill="rgba(7, 11, 17, 0.86)" stroke="rgba(150, 180, 215, 0.42)" />
              <text
                x={x + 8 + lw / 2} y={y + 21} textAnchor="middle" className="font-mono"
                style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.02em', fill: C.soft }}
              >
                {captionOf(f.name)}
              </text>
            </g>
          );
        })}

        {placed.map(({ s, x, y, label }) => {
          const isSel = s.symbol === selected;
          const isHover = s.symbol === hovered;
          const lit = active && s.lit;
          const critical = lit && s.critical;
          const dim = !active || s.marker === 'dim';
          return (
            <g
              key={s.symbol}
              className="rr-node"
              role="button"
              tabIndex={0}
              aria-label={active ? s.aria : `${s.symbol}: no measurement on this layer`}
              aria-pressed={isSel}
              onClick={(e) => { e.stopPropagation(); onSelect(isSel ? null : s.symbol); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(isSel ? null : s.symbol); }
              }}
              onMouseEnter={() => setHovered(s.symbol)}
              onMouseLeave={() => setHovered((h) => (h === s.symbol ? null : h))}
              onFocus={() => setHovered(s.symbol)}
              onBlur={() => setHovered((h) => (h === s.symbol ? null : h))}
            >
              <circle cx={x} cy={y} r={15} fill="transparent" className="rr-focus" />
              {critical && <circle cx={x} cy={y} r={6} fill="none" stroke="#ffffff" strokeWidth={1.5} className="rr-pulse" pointerEvents="none" />}
              {isSel && <circle cx={x} cy={y} r={10} fill="none" stroke="#ffffff" strokeWidth={2} />}

              {active && s.marker === 'diamond' ? (
                <rect
                  x={x - 4.5} y={y - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${y})`}
                  fill="#0a0f15" stroke={C.grey} strokeWidth={1.6} strokeDasharray="2.5 1.5"
                />
              ) : active && s.marker === 'ring' ? (
                <circle cx={x} cy={y} r={isHover || isSel ? 5.5 : 4.5} fill="#0a0f15" stroke={C.grey} strokeWidth={1.8} />
              ) : (
                <circle
                  cx={x} cy={y}
                  r={dim ? 3 : isHover || isSel ? 6.5 : 5.5}
                  fill={dim ? '#5d6b7c' : s.color}
                  stroke={dim ? 'none' : '#ffffff'}
                  strokeWidth={1.8}
                />
              )}

              {label && (
                <g>
                  <rect
                    x={label.x} y={label.y} width={label.w} height={label.h} rx={4}
                    fill="rgba(6, 9, 14, 0.82)"
                    stroke={isSel ? '#ffffff' : lit ? 'rgba(255, 255, 255, 0.22)' : 'rgba(140, 155, 175, 0.4)'}
                    strokeWidth={isSel ? 1.5 : 1}
                    strokeDasharray={lit || isSel ? undefined : '3 2'}
                  />
                  <text
                    x={label.x + label.w / 2} y={label.y + 14} textAnchor="middle" className="font-mono"
                    style={{ fontSize: 12, fontWeight: 600, fill: lit || isSel ? '#ffffff' : '#aeb9c7' }}
                  >
                    {s.symbol}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {hoveredItem && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: Math.max(8, Math.min(size.w - 236, hoveredItem.x + 16)),
            top: Math.max(8, Math.min(size.h - 96, hoveredItem.y + 16)),
            width: 228,
            background: 'rgba(8, 12, 18, 0.96)',
            border: `1px solid ${C.panelEdge}`,
            borderRadius: 6,
            padding: '8px 10px',
            pointerEvents: 'none',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 3,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{hoveredItem.s.symbol}</span>
            {active && hoveredItem.s.band && <BandBadge band={hoveredItem.s.band} />}
          </div>
          <div style={{ fontSize: 12, color: C.soft, marginTop: 5, lineHeight: 1.45 }}>
            {!active
              ? 'No measurement on this layer.'
              : hoveredItem.s.hover}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Inspector
// ═══════════════════════════════════════════════════════════════════════════

function Row({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 13, color: C.soft, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{children}</span>
        {note && <span style={{ display: 'block', fontSize: 11.5, color: C.faint }}>{note}</span>}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '14px 0 6px' }}>{children}</div>;
}

function pnlColor(v: number): string {
  return v > 0 ? '#3ddc57' : v < 0 ? '#ff5c5c' : C.text;
}

function HoverText({ s }: { s: RadarSymbol }) {
  const strong = (t: string) => <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{t}</span>;
  if (s.rating === 'unpriced') return <>Unpriced: {s.missing.join('; ')}.</>;
  if (s.rating === 'unrated') {
    return <>Unrated: no adverse move{s.moveSamples !== null ? ` (${s.moveSamples} daily closes)` : ''}. Net {strong(fmtUsd(s.netUsd))}.</>;
  }
  if (!((s.risk ?? 0) > 0)) {
    return <>Nothing at risk: {Math.abs(s.netLots) < 0.005 ? 'the books offset each other' : 'the unrealised gain covers the adverse move'}.</>;
  }
  return (
    <>
      {strong(fmtUsd(s.risk))} at risk
      {s.level !== null ? <> · {strong(fmtPct(s.level))} of the capacity left</> : ' · no level without a limit'}
    </>
  );
}

function signedUsd(v: number | null): string {
  if (v === null) return '—';
  return v > 0 ? `+${fmtUsd(v)}` : fmtUsd(v);
}

function Signed({ v }: { v: number | null }) {
  return <span style={{ color: v === null ? C.text : pnlColor(v) }}>{signedUsd(v)}</span>;
}

interface Driver { tone: 'red' | 'amber' | 'green'; text: string }

function driversFor(s: RadarSymbol, view: RadarView, trend: Trend | null): Driver[] {
  const out: Driver[] = [];
  if ((s.band === 'critical' || s.band === 'high') && s.level !== null) {
    out.push({
      tone: s.band === 'critical' ? 'red' : 'amber',
      text: Number.isFinite(s.level)
        ? `Risk is ${fmtPct(s.level)} of the loss capacity left this month`
        : 'The loss capacity of the month is used up',
    });
  }
  if (s.rank === 1 && view.atRisk > 1) out.push({ tone: 'amber', text: 'Largest risk in the book' });
  if (trend?.dir === 'building') {
    out.push({
      tone: 'red',
      text: trend.change === null
        ? `New risk in the last ${fmtSpan(trend.spanMs)}`
        : `Risk up ${(trend.change * 100).toFixed(0)}% in the last ${fmtSpan(trend.spanMs)}`,
    });
  } else if (trend?.dir === 'easing' && trend.change !== null) {
    out.push({ tone: 'green', text: `Risk down ${Math.abs(trend.change * 100).toFixed(0)}% in the last ${fmtSpan(trend.spanMs)}` });
  }
  if (Math.abs(s.bLots) >= 0.005 && Math.abs(s.aLots) < 0.005 && Math.abs(s.cLots) < 0.005) {
    out.push({ tone: 'amber', text: 'Not hedged: no A-Book or C-Book position' });
  }
  if (s.u !== null && s.u < 0) out.push({ tone: 'amber', text: `Unrealised loss across the books: ${fmtUsd(s.u)}` });
  if (s.worstDayLoss !== null && view.worstDayCovered > 1) {
    const worst = view.symbols.reduce((m, x) => Math.max(m, x.worstDayLoss ?? 0), 0);
    if (s.worstDayLoss >= worst) out.push({ tone: 'amber', text: 'Largest worst-day stress in the book' });
  }
  if (s.pnlMtd !== null && s.pnlMtd < 0) out.push({ tone: 'amber', text: `B-Book losing month to date: ${fmtUsd(s.pnlMtd)}` });
  return out;
}

const TONE: Record<Driver['tone'], string> = { red: '#ff3b30', amber: '#ffb020', green: '#3ddc57' };

function ActionButtons() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const positions = can('bbook', 'VIEW');
  const hedge = can('hedge_strat', 'VIEW');
  if (!positions && !hedge) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {positions && (
        <button
          type="button"
          className="rr-btn"
          onClick={() => navigate('/b-book')}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: C.blue, color: '#ffffff', fontSize: 14, fontWeight: 600,
          }}
        >
          Inspect positions →
        </button>
      )}
      {hedge && (
        <button
          type="button"
          className="rr-btn"
          onClick={() => navigate('/hedging-strategies')}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 6, cursor: 'pointer', marginTop: 8,
            background: 'transparent', color: '#ffffff', fontSize: 14, fontWeight: 600,
            border: `1px solid ${C.blueSoft}88`,
          }}
        >
          Review hedge
        </button>
      )}
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
        These open the page for review. Nothing is executed from here.
      </div>
    </div>
  );
}

function Para({ children, color }: { children: ReactNode; color?: string }) {
  return <p style={{ fontSize: 12.5, color: color ?? C.soft, lineHeight: 1.5, margin: '6px 0 4px' }}>{children}</p>;
}

function SymbolDetail({
  s, view, upto, ctx, scope, scopeText, region, onClose,
}: {
  s: RadarSymbol; view: RadarView; upto: number; ctx: RiskContext; scope: PlatformScope;
  scopeText: string; region: string; onClose: () => void;
}) {
  const rated = s.rating === 'rated';
  const trend = rated ? trendOf(history, upto, (x) => riskOf(x.snapshot, s.symbol, ctx)) : null;
  const series = history.slice(0, upto + 1).map((x) => riskOf(x.snapshot, s.symbol, ctx));
  const drivers = rated ? driversFor(s, view, trend) : [];
  const since = history.length ? history[0].t : null;
  const netFlat = Math.abs(s.netLots) < 0.005;
  const moveNote = ctx.moves
    ? `${ctx.moves.percentile}th percentile of daily moves, ${ctx.moves.lookback_days} days${s.moveSamples !== null ? ` · ${s.moveSamples} closes on file` : ''}`
    : 'daily moves not loaded';

  return (
    <div style={{ padding: '14px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.faint }}>{region} · risk · {scopeText}</div>
          <div className="font-mono" style={{ fontSize: 22, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{s.symbol}</div>
        </div>
        <button
          type="button"
          className="rr-btn"
          onClick={onClose}
          aria-label="Close instrument"
          style={{ background: 'transparent', border: 'none', color: C.soft, fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 8px' }}>
        {rated && s.band && <BandBadge band={s.band} large />}
        {rated && !s.band && <GreyBadge text="NO LEVEL" />}
        {s.rating === 'unrated' && <GreyBadge text="UNRATED" />}
        {s.rating === 'unpriced' && <GreyBadge text="UNPRICED" />}
        {trend && <TrendChip trend={trend} large />}
      </div>

      {s.rating === 'unpriced' && (
        <Para>
          {s.fromMt5Book
            ? 'MT5 holds a B-Book position in this instrument, but the exposure feed carries no figure for it. The lots below are read from the MT5 server.'
            : `This instrument cannot be measured: ${s.missing.join('; ')}.`}{' '}
          It has no place on the colour scale and is left out of the book risk. It is not a low reading.
        </Para>
      )}
      {s.rating === 'unrated' && (
        <Para>
          There is no adverse move for this symbol: fewer than 20 daily closes on file. Its risk is not
          measured and it is left out of the book risk until the history fills. It is not a low reading.
        </Para>
      )}
      {rated && !s.band && view.capacity.state !== 'ok' && (
        <Para color="#ffb020">
          {view.capacity.state === 'no_limit'
            ? 'No monthly loss limit is set, so the risk has no level.'
            : 'The loss capacity is not known, so the risk has no level.'}
        </Para>
      )}
      {s.rating !== 'unpriced' && s.partial.length > 0 && (
        <Para color="#ffb020">
          Part of the P&amp;L is not priced: {s.partial.join(' ')} The risk shown is measured without them.
        </Para>
      )}
      {rated && netFlat && (
        <Para>The books offset each other: the net position is flat, so only the unrealised P&amp;L counts.</Para>
      )}
      {scope !== 'ALL' && (
        <Para color={C.faint}>
          Risk is measured on the whole book: LP hedges and the C-Book are not split per platform.
        </Para>
      )}

      {s.rating !== 'unpriced' && (
        <>
          <Row label="Risk" note={s.level !== null ? `${fmtPct(s.level, 1)} of the capacity left` : rated ? 'no level' : undefined}>
            {rated ? fmtUsd(s.risk) : '—'}
          </Row>
          <Row label="Unrealised P&L" note="B + A + C, broker view"><Signed v={s.u} /></Row>
          <Row label="Adverse move" note={moveNote}>{fmtMovePct(s.movePct)}</Row>
          <Row
            label="Move loss"
            note={s.usdPerLot !== null ? `${fmtLots(Math.abs(s.netLots))} net lots × ${fmtUsd(s.usdPerLot)} per lot` : undefined}
          >
            {s.moveLoss !== null ? fmtUsd(s.moveLoss) : '—'}
          </Row>
          <Row label="Stressed P&L" note="unrealised less the move loss"><Signed v={s.stressed} /></Row>
          <Row label="Net position" note={sideOf(s.netLots)}>{fmtUsd(s.netUsd)}</Row>
          <Row
            label="Worst-day stress"
            note={
              s.worstDay === 'ok' && s.worstRange !== null
                ? `net position, worst day of the last 100: ${(s.worstRange * 100).toFixed(2)}%`
                : s.worstDay === 'excluded'
                  ? `range on file is over ${MAX_DAILY_RANGE * 100}% — treated as a bad bar`
                  : s.worstDay === 'flat' ? 'net position flat'
                  : view.worstDayReady ? 'no daily range on file' : 'daily ranges not loaded'
            }
          >
            {s.worstDayLoss !== null ? fmtUsd(s.worstDayLoss) : '—'}
          </Row>
          {s.pnlMtd !== null && (
            <Row label="B-Book P&L month to date"><Signed v={s.pnlMtd} /></Row>
          )}
          {s.bUsd !== null && (
            <Row label="Share of B-Book" note="information only">{fmtPct(s.share, 1)}</Row>
          )}
        </>
      )}

      <SectionTitle>By book <span style={{ color: C.faint, fontWeight: 400 }}>· broker view</span></SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 11, color: C.faint, textAlign: 'right' }}>
            <th style={{ textAlign: 'left', fontWeight: 500, padding: '2px 0' }}>Book</th>
            <th style={{ fontWeight: 500, padding: '2px 0' }}>Lots</th>
            <th style={{ fontWeight: 500, padding: '2px 0' }}>Unrealised</th>
          </tr>
        </thead>
        <tbody>
          {([['B-Book', s.bLots, s.bU], ['A-Book', s.aLots, s.aU], ['C-Book', s.cLots, s.cU], ['Net', s.netLots, s.u]] as Array<[string, number, number | null]>).map(([name, lots, u]) => (
            <tr key={name} style={{ borderTop: `1px solid ${C.line}` }}>
              <td style={{ padding: '6px 0', fontSize: 13, color: name === 'Net' ? C.text : C.soft, fontWeight: name === 'Net' ? 600 : 400 }}>{name}</td>
              <td className="font-mono" style={{ padding: '6px 0', fontSize: 13, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {fmtLots(lots)}
              </td>
              <td className="font-mono" style={{ padding: '6px 0', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Signed v={u} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(s.parts.length > 1 || scope !== 'ALL') && s.parts.length > 0 && (
        <>
          <SectionTitle>B-Book by platform</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {s.parts.filter((p) => scope === 'ALL' || p.platform === scope).map((part) => (
                <tr key={part.platform} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '6px 0', fontSize: 13, color: C.soft }}>{PLATFORM_LABEL[part.platform]}</td>
                  <td className="font-mono" style={{ padding: '6px 0', fontSize: 12.5, color: C.soft, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtLots(part.bLots)} lots
                  </td>
                  <td className="font-mono" style={{ padding: '6px 0 6px 10px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {part.bUsd !== null ? fmtUsd(part.bUsd) : 'unpriced'}
                  </td>
                  <td className="font-mono" style={{ padding: '6px 0 6px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Signed v={part.bU} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {rated && (
        <>
          <SectionTitle>What stands out</SectionTitle>
          {drivers.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Nothing stands out on this instrument.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {drivers.map((d) => (
                <li key={d.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '3px 0', fontSize: 13, color: C.text, lineHeight: 1.4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[d.tone], marginTop: 5, flexShrink: 0, boxShadow: `0 0 8px ${TONE[d.tone]}` }} />
                  {d.text}
                </li>
              ))}
            </ul>
          )}

          <SectionTitle>
            Risk{' '}
            <span style={{ color: C.faint, fontWeight: 400 }}>
              · observed{since !== null ? ` since ${fmtUtcTime(since)}` : ''}
            </span>
          </SectionTitle>
          <Sparkline
            values={series}
            width={306}
            height={56}
            color={trend?.dir === 'building' ? C.up : trend?.dir === 'easing' ? C.down : C.blueSoft}
          />
        </>
      )}

      <ActionButtons />
    </div>
  );
}

function RankedList({
  view, scope, scopeText, emptyText, onSelect,
}: { view: RadarView; scope: PlatformScope; scopeText: string; emptyText: string; onSelect: (symbol: string) => void }) {
  const atRisk = view.symbols.filter((s) => s.rating === 'rated' && (s.risk ?? 0) > 0);
  const unrated = view.symbols.filter((s) => s.rating === 'unrated');
  const unpriced = view.symbols.filter((s) => s.rating === 'unpriced');
  const none = view.symbols.filter((s) => s.rating === 'rated' && !((s.risk ?? 0) > 0));
  const topRisk = atRisk.length ? (atRisk[0].risk ?? 0) : 0;

  const rowProps = (symbol: string) => ({
    className: 'rr-row',
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(symbol),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(symbol); }
    },
  });

  return (
    <div style={{ padding: '14px 0 10px' }}>
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Risk by instrument</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
          Loss under the adverse move, after unrealised P&amp;L · {scopeText}
          {scope !== 'ALL' ? ' · measured on the whole book' : ''}. Largest first; select one for detail.
        </div>
      </div>

      {view.symbols.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: C.soft, lineHeight: 1.5 }}>{emptyText}</div>
      )}

      {atRisk.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.faint, textAlign: 'left' }}>
              <th style={{ padding: '4px 4px 4px 16px', fontWeight: 500, width: 26 }}>#</th>
              <th style={{ padding: 4, fontWeight: 500 }}>Instrument</th>
              <th style={{ padding: 4, fontWeight: 500, textAlign: 'right' }}>Capacity</th>
              <th style={{ padding: '4px 16px 4px 4px', fontWeight: 500, textAlign: 'right' }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {atRisk.map((s) => {
              const def = s.band ? BAND_BY_ID[s.band] : null;
              const bar = def?.color ?? C.blueSoft;
              return (
                <tr key={s.symbol} {...rowProps(s.symbol)} aria-label={symbolAria(s)} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="font-mono" style={{ padding: '6px 4px 6px 16px', fontSize: 12, color: C.faint }}>{s.rank}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span title={def?.label} style={{ width: 9, height: 9, borderRadius: 2, background: bar, flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.symbol}</span>
                    </div>
                    <div style={{ height: 3, background: '#141d28', borderRadius: 2, marginTop: 4 }}>
                      <div style={{ height: 3, borderRadius: 2, background: bar, width: `${topRisk > 0 ? Math.max(3, ((s.risk ?? 0) / topRisk) * 100) : 0}%` }} />
                    </div>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 4px', fontSize: 13, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.level !== null ? fmtPct(s.level) : '—'}
                    <span style={{ display: 'block', fontSize: 10.5, color: C.faint, fontFamily: 'inherit' }}>{def?.label ?? 'no level'}</span>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 16px 6px 4px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtUsd(s.risk)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {unrated.length > 0 && (
        <div style={{ margin: '12px 0 0' }}>
          <div style={{ padding: '0 16px', fontSize: 12, color: C.soft }}>
            Unrated — no adverse move (too few daily closes)
          </div>
          {unrated.map((s) => (
            <div
              key={s.symbol}
              {...rowProps(s.symbol)}
              aria-label={symbolAria(s)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderTop: `1px solid ${C.line}`, marginTop: 4 }}
            >
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.soft }}>○ {s.symbol}</span>
              <span className="font-mono" style={{ fontSize: 12.5, color: C.soft }}>net {fmtUsd(s.netUsd)}</span>
            </div>
          ))}
        </div>
      )}

      {unpriced.length > 0 && (
        <div style={{ margin: '12px 0 0' }}>
          <div style={{ padding: '0 16px', fontSize: 12, color: C.soft }}>
            Unpriced — no USD value or P&amp;L for the position
          </div>
          {unpriced.map((s) => (
            <div
              key={s.symbol}
              {...rowProps(s.symbol)}
              aria-label={symbolAria(s)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderTop: `1px solid ${C.line}`, marginTop: 4 }}
            >
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.soft }}>◇ {s.symbol}</span>
              <span className="font-mono" style={{ fontSize: 12.5, color: C.soft }}>{fmtLots(s.netLots)} net lots</span>
            </div>
          ))}
        </div>
      )}

      {none.length > 0 && (
        <div style={{ padding: '12px 16px 0', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          Nothing at risk ({none.length}), hedged or covered by unrealised gains:{' '}
          <span className="font-mono" style={{ color: C.soft }}>{none.map((s) => s.symbol).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

const PENDING_TEXT: Record<Exclude<Layer, 'exposure'>, { title: string; lead: string; items: string[] }> = {
  flow: {
    title: 'Flow toxicity',
    lead: 'Colours each instrument by the share of its B-Book flow that comes from accounts the classifier flags as toxic. The flow feed is not running, or has not built its first figures.',
    items: [
      'Toxic share of B-Book flow, per instrument',
      'Flagged accounts and the flow they send',
      'Flow by classification, and what is not classified',
      'The accounts behind each instrument',
    ],
  },
  liquidity: {
    title: 'Liquidity',
    lead: 'Colours each instrument by how far execution conditions have slipped from its own normal.',
    items: [
      'Spread, depth and quote age per route',
      'Reject rate and fill latency',
      'Route status: healthy, watch, degraded',
      'Readings relative to each instrument’s baseline',
    ],
  },
};

function PlatformPendingInspector({ platform }: { platform: Platform }) {
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{PLATFORM_LABEL[platform]} exposure</div>
      <div style={{ margin: '10px 0 8px' }}><GreyBadge text="AWAITING DATA FEED" /></div>
      <p style={{ fontSize: 13, color: C.soft, lineHeight: 1.5, margin: '8px 0' }}>
        The exposure feed carries no {PLATFORM_LABEL[platform]} positions. This view fills in by itself
        when it does.
      </p>
      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, marginTop: 12 }}>
        Nothing is shown rather than an empty book: no data is not the same as no exposure.
      </p>
    </div>
  );
}

function PendingInspector({ layer }: { layer: Exclude<Layer, 'exposure'> }) {
  const t = PENDING_TEXT[layer];
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{t.title}</div>
      <div style={{ margin: '10px 0 8px' }}><GreyBadge text="AWAITING DATA FEED" /></div>
      <p style={{ fontSize: 13, color: C.soft, lineHeight: 1.5, margin: '8px 0' }}>{t.lead}</p>
      <SectionTitle>What this layer will show</SectionTitle>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {t.items.map((i) => (
          <li key={i} style={{ display: 'flex', gap: 9, padding: '3px 0', fontSize: 13, color: C.text, lineHeight: 1.4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${C.grey}`, marginTop: 6, flexShrink: 0 }} />
            {i}
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, marginTop: 12 }}>
        The map stays uncoloured on this layer until its measures are published, so nothing here is ever a guess.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Timeline and legend
// ═══════════════════════════════════════════════════════════════════════════

interface TimelineProps {
  replayT: number | null;
  playing: boolean;
  onScrub: (t: number | null) => void;
  onPlay: () => void;
}

function Timeline({ replayT, playing, onScrub, onPlay }: TimelineProps) {
  const windowS = HISTORY_WINDOW_MS / 1000;
  const has = history.length >= 2;
  const tNow = history.length ? history[history.length - 1].t : 0;
  const first = history.length ? history[0].t : 0;
  const bufferedS = has ? Math.min(windowS, (tNow - first) / 1000) : 0;
  const value = replayT !== null && has ? Math.max(-windowS, Math.round((replayT - tNow) / 1000)) : 0;
  const pct = (s: number) => `${((s + windowS) / windowS) * 100}%`;

  return (
    <Panel style={{ flex: 1, minWidth: 0, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <button
        type="button"
        className="rr-btn"
        onClick={onPlay}
        disabled={!has}
        aria-label={playing ? 'Pause replay' : 'Replay observed history'}
        style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, cursor: has ? 'pointer' : 'default',
          background: has ? '#0f1b2e' : '#0d131b', border: `1.5px solid ${has ? C.blue : C.line}`,
          color: has ? '#ffffff' : C.grey, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.soft, marginBottom: 2 }}>
          <span>
            Observed history
            <span style={{ color: C.faint }}>
              {has
                ? ` · ${fmtSpan(bufferedS * 1000)} recorded since this page was opened`
                : ' · starts recording when the page opens'}
            </span>
          </span>
          <span style={{ color: C.faint }}>+15 min scenario · awaiting data feed</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, height: 18 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: '#16202c' }} />
            {has && (
              <div
                style={{
                  position: 'absolute', top: 7, height: 4, borderRadius: 2, right: 0,
                  left: pct(-bufferedS), background: C.blue, boxShadow: '0 0 8px rgba(47, 125, 255, 0.7)',
                }}
              />
            )}
            <input
              type="range"
              className="rr-scrub"
              min={-windowS}
              max={0}
              step={SAMPLE_EVERY_MS / 1000}
              value={value}
              disabled={!has}
              aria-label="Replay position, seconds before now"
              aria-valuetext={replayT !== null ? fmtUtcTime(replayT) : 'Now'}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 0) { onScrub(null); return; }
                const target = Math.max(first, tNow + v * 1000);
                onScrub(history[nearestIndex(target)].t);
              }}
              style={{ position: 'absolute', inset: 0 }}
            />
          </div>
          <div
            aria-hidden="true"
            title="Scenario projection: not available"
            style={{ width: 96, borderTop: `2px dashed ${C.line}`, position: 'relative', top: 0 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div className="font-mono" style={{ position: 'relative', flex: 1, height: 15, fontSize: 11, color: C.faint }}>
            <span style={{ position: 'absolute', left: 0 }}>−30m</span>
            <span style={{ position: 'absolute', left: '33.33%', transform: 'translateX(-50%)' }}>−20m</span>
            <span style={{ position: 'absolute', left: '66.66%', transform: 'translateX(-50%)' }}>−10m</span>
            <span style={{ position: 'absolute', right: 0, color: replayT === null ? '#ffffff' : C.faint, fontWeight: 600 }}>NOW</span>
          </div>
          <div className="font-mono" style={{ width: 96, textAlign: 'right', fontSize: 11, color: C.grey }}>+15m</div>
        </div>
      </div>
    </Panel>
  );
}

function Legend({ layer, view }: { layer: Layer; view: RadarView }) {
  if (layer !== 'exposure') {
    return (
      <Panel style={{ width: 470, flexShrink: 0, padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
          <span style={{ color: C.text, fontWeight: 600 }}>No colour scale on this layer.</span>{' '}
          Instruments are shown in grey because there is no measurement for them — grey never means low.
        </div>
      </Panel>
    );
  }
  const t = view.thresholds;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const ranges = [`under ${pct(t.warning)}`, `${pct(t.warning)}–${pct(t.high)}`, `${pct(t.high)}–${pct(t.critical)}`, `${pct(t.critical)} and over`];
  const cap = view.capacity;
  return (
    <Panel style={{ width: 470, flexShrink: 0, padding: '9px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, fontWeight: 600 }}>
        <span>Risk ÷ loss capacity left this month</span>
        <span style={{ color: C.faint, fontWeight: 400 }}>
          {cap.state === 'ok' ? `limit ${fmtUsd(cap.limit)}` : cap.state === 'no_limit' ? 'no limit set' : 'limit not loaded'}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, margin: '6px 0 4px', background: rampGradientCss(), boxShadow: '0 0 12px rgba(255, 120, 0, 0.25)', opacity: cap.state === 'ok' ? 1 : 0.35 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {BANDS.map((b, i) => (
          <div key={b.id} style={{ fontSize: 11.5, color: C.text }}>
            {b.label}
            <span className="font-mono" style={{ display: 'block', fontSize: 10.5, color: C.faint }}>{ranges[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
        <span><span style={{ color: C.soft }}>○</span> unrated</span>
        <span><span style={{ color: C.soft }}>◇</span> unpriced</span>
        <span><span style={{ color: '#5d6b7c' }}>●</span> nothing at risk</span>
        <span>The dot is the reading</span>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Map items — what the map draws, whatever the layer
// ═══════════════════════════════════════════════════════════════════════════

interface MapItem {
  symbol: string;
  heat: number;
  /** dot = coloured reading · ring = measured, no colour (○) · diamond = cannot be measured (◇) · dim = nothing to show */
  marker: 'dot' | 'ring' | 'diamond' | 'dim';
  /** Fill of a 'dot'. */
  color: string;
  band: Band | null;
  lit: boolean;
  critical: boolean;
  /** always = always named; normal = named while there is room; none = never. */
  label: 'always' | 'normal' | 'none';
  aria: string;
  hover: ReactNode;
}

function exposureItems(view: RadarView): MapItem[] {
  return view.symbols.map((s) => {
    const lit = s.rating === 'rated' && (s.risk ?? 0) > 0;
    return {
      symbol: s.symbol,
      heat: s.heat,
      marker: s.rating === 'unpriced' ? 'diamond' : s.rating === 'unrated' ? 'ring' : lit ? 'dot' : 'dim',
      color: s.band ? BAND_BY_ID[s.band].color : C.blueSoft,
      band: s.band,
      lit,
      critical: lit && s.band === 'critical',
      label: s.rating === 'unpriced' ? 'always' : lit || s.rating === 'unrated' ? 'normal' : 'none',
      aria: symbolAria(s),
      hover: <HoverText s={s} />,
    };
  });
}

function flowItems(fv: FlowView, others: string[]): MapItem[] {
  const strong = (t: string) => <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{t}</span>;
  const win = fmtWindow(fv.windowSec);
  const out: MapItem[] = fv.symbols.map((s) => {
    const lit = s.state === 'rated' && s.bFlaggedUsd > 0;
    const hover: ReactNode = s.state === 'no_b_flow'
      ? <>No B-Book flow in the last {win}: all {strong(fmtUsd(s.flowUsd))} went to the A-Book. Toxic share, all books: {strong(fmtShare(s.share))}.</>
      : lit
        ? <>{strong(fmtShare(s.bShare))} of B-Book flow is toxic: {strong(fmtUsd(s.bFlaggedUsd))} of {fmtUsd(s.bFlowUsd)}, {s.flaggedAccounts} flagged account{s.flaggedAccounts === 1 ? '' : 's'}.</>
        : <>No toxic flow: {strong(fmtUsd(s.bFlowUsd))} B-Book flow, none from flagged accounts{s.unclassifiedUsd > 0 ? `; ${fmtUsd(s.unclassifiedUsd)} from accounts not classified` : ''}.</>;
    return {
      symbol: s.symbol,
      heat: s.heat,
      marker: s.state === 'no_b_flow' ? 'ring' : lit ? 'dot' : 'dim',
      color: s.band ? BAND_BY_ID[s.band].color : C.blueSoft,
      band: lit ? s.band : null,
      lit,
      critical: lit && s.band === 'critical',
      label: lit || s.state === 'no_b_flow' ? 'normal' : 'none',
      aria: s.state === 'no_b_flow'
        ? `${s.symbol}: no B-Book flow`
        : lit ? `${s.symbol}: ${s.band ? BAND_BY_ID[s.band].label : ''} ${fmtShare(s.bShare)} toxic B-Book flow, ${fmtUsd(s.bFlaggedUsd)}`
        : `${s.symbol}: no toxic flow`,
      hover,
    };
  });
  for (const symbol of others) {
    if (fv.bySymbol.has(symbol)) continue;
    out.push({
      symbol, heat: 0, marker: 'dim', color: C.grey, band: null, lit: false, critical: false, label: 'none',
      aria: `${symbol}: no client flow in the window`,
      hover: <>No client deal in the last {win}.</>,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Flow toxicity layer
// ═══════════════════════════════════════════════════════════════════════════

function fmtShare(v: number | null, digits = 0): string {
  return v === null ? '—' : fmtPct(v, digits);
}

const FLOW_CARDS = ['Toxic share of B-Book flow', 'Flagged accounts', 'Most toxic B-Book flow'];

function FlowSettingsLink() {
  const navigate = useNavigate();
  const { can } = usePermission();
  if (!can('settings', 'VIEW')) return null;
  return (
    <button
      type="button"
      className="rr-btn"
      onClick={() => navigate('/settings/flow-toxicity')}
      style={{
        padding: '6px 11px', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: 'transparent', color: '#ffffff', border: `1px solid ${C.blueSoft}88`, whiteSpace: 'nowrap',
      }}
    >
      Flow settings →
    </button>
  );
}

/** The toxic set in force, in words: "Arbitrage ≥ 0.60 · News trader ≥ 0.60 and risk HIGH+". */
function toxicSetText(fv: FlowView): string {
  if (fv.toxicClasses.length === 0) return 'No class is set as toxic: nothing is flagged.';
  return fv.toxicClasses
    .map((c) => `${classLabel(c.cls)}${c.minConfidence !== null ? ` ≥ ${c.minConfidence.toFixed(2)}` : ''}${c.minRiskLevel ? ` and risk ${c.minRiskLevel}+` : ''}`)
    .join(' · ');
}

function FlowCards({ fv, upto, scope }: { fv: FlowView; upto: number; scope: PlatformScope }) {
  const shares = flowHistory.slice(0, upto + 1).map((s) => bookShareOf(s.payload));
  const trend = trendOf(flowHistory, upto, (s) => bookShareOf(s.payload));
  const sparkColor = trend?.dir === 'building' ? C.up : trend?.dir === 'easing' ? C.down : C.blueSoft;
  const t = fv.totals;
  const top = fv.symbols.find((s) => s.rank === 1) ?? null;
  const win = fmtWindow(fv.windowSec);
  const bookDef = fv.bookBand ? BAND_BY_ID[fv.bookBand] : null;
  const whole = scope === 'ALL' ? '' : ' · both platforms';

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Card
        accent={bookDef?.color ?? C.blue}
        label={`Toxic share of B-Book flow${whole}`}
        aside={<Sparkline values={shares} width={132} height={42} color={sparkColor} />}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{fmtShare(t.bShare, 1)}</CardValue>
          {fv.bookBand && <BandBadge band={fv.bookBand} />}
          {trend && t.bShare !== null && <TrendChip trend={trend} />}
        </div>
        <CardNote>
          {t.bShare === null
            ? `No B-Book flow in the last ${win}`
            : `${fmtUsd(t.bFlaggedUsd)} toxic of ${fmtUsd(t.bFlowUsd)} B-Book flow · last ${win}`}
        </CardNote>
      </Card>

      <Card accent={t.flaggedAccounts > 0 ? '#ff8a14' : C.blue} label={`Flagged accounts${whole}`} aside={<FlowSettingsLink />}>
        <CardValue>
          {t.flaggedAccounts}
          <span style={{ fontSize: 15, color: C.soft, fontWeight: 500 }}> of {t.accounts} trading</span>
        </CardValue>
        <CardNote>
          {t.unclassifiedAccounts > 0
            ? `${t.unclassifiedAccounts} not classified (${fmtUsd(t.unclassifiedUsd)} of flow) · all books ${fmtShare(t.share)} toxic`
            : `All accounts classified · all books ${fmtShare(t.share)} toxic`}
        </CardNote>
      </Card>

      <Card accent={top?.band ? BAND_BY_ID[top.band].color : C.grey} label="Most toxic B-Book flow">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{top ? fmtUsd(top.bFlaggedUsd) : '—'}</CardValue>
          {top && <span className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{top.symbol}</span>}
          {top?.band && <BandBadge band={top.band} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {BANDS.map((b) => (
            <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.soft, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
              {b.label}
              <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{fv.bandCounts[b.id]}</span>
            </span>
          ))}
          {fv.noBFlow > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.soft, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${C.grey}` }} />
              No B-Book flow
              <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{fv.noBFlow}</span>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Why the flow list is empty, in words: nothing traded, or only on the other platform. */
function flowEmptyText(fv: FlowView, scope: PlatformScope): string {
  const win = fmtWindow(fv.windowSec);
  if (scope === 'ALL' || fv.hiddenByScope === 0) return `No client deal in the last ${win}.`;
  const other = PLATFORM_LABEL[scope === 'MT5' ? 'CTRADER' : 'MT5'];
  const n = fv.hiddenByScope;
  return `No ${PLATFORM_LABEL[scope]} client deal in the last ${win}. ${n} instrument${n === 1 ? ' was' : 's were'} traded on ${other}: choose Both or ${other} to see ${n === 1 ? 'it' : 'them'}. The cards above cover both platforms.`;
}

function FlowList({
  fv, scope, scopeText, onSelect,
}: { fv: FlowView; scope: PlatformScope; scopeText: string; onSelect: (symbol: string) => void }) {
  const toxic = fv.symbols.filter((s) => s.rank !== null);
  const clean = fv.symbols.filter((s) => s.rank === null && s.state === 'rated');
  const noB = fv.symbols.filter((s) => s.state === 'no_b_flow');
  const topUsd = toxic.length ? toxic[0].bFlaggedUsd : 0;
  const rowProps = (symbol: string) => ({
    className: 'rr-row',
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(symbol),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(symbol); }
    },
  });

  return (
    <div style={{ padding: '14px 0 10px' }}>
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Toxic flow by instrument</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
          B-Book flow from flagged accounts · last {fmtWindow(fv.windowSec)} · {scopeText}
          {scope !== 'ALL' ? ' · shares on both platforms' : ''}. Largest first; select one for detail.
        </div>
        <div style={{ fontSize: 11.5, color: C.soft, marginTop: 6, lineHeight: 1.45 }}>
          <span style={{ color: C.faint }}>Toxic: </span>{toxicSetText(fv)}
        </div>
      </div>

      {fv.symbols.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: C.soft, lineHeight: 1.5 }}>
          {flowEmptyText(fv, scope)}
        </div>
      )}

      {toxic.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.faint, textAlign: 'left' }}>
              <th style={{ padding: '4px 4px 4px 16px', fontWeight: 500, width: 26 }}>#</th>
              <th style={{ padding: 4, fontWeight: 500 }}>Instrument</th>
              <th style={{ padding: 4, fontWeight: 500, textAlign: 'right' }}>Share</th>
              <th style={{ padding: '4px 16px 4px 4px', fontWeight: 500, textAlign: 'right' }}>Toxic flow</th>
            </tr>
          </thead>
          <tbody>
            {toxic.map((s) => {
              const def = s.band ? BAND_BY_ID[s.band] : null;
              const bar = def?.color ?? C.blueSoft;
              return (
                <tr key={s.symbol} {...rowProps(s.symbol)} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="font-mono" style={{ padding: '6px 4px 6px 16px', fontSize: 12, color: C.faint }}>{s.rank}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span title={def?.label} style={{ width: 9, height: 9, borderRadius: 2, background: bar, flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.symbol}</span>
                    </div>
                    <div style={{ height: 3, background: '#141d28', borderRadius: 2, marginTop: 4 }}>
                      <div style={{ height: 3, borderRadius: 2, background: bar, width: `${topUsd > 0 ? Math.max(3, (s.bFlaggedUsd / topUsd) * 100) : 0}%` }} />
                    </div>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 4px', fontSize: 13, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtShare(s.bShare)}
                    <span style={{ display: 'block', fontSize: 10.5, color: C.faint, fontFamily: 'inherit' }}>{def?.label ?? ''}</span>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 16px 6px 4px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtUsd(s.bFlaggedUsd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {clean.length > 0 && (
        <div style={{ padding: '12px 16px 0', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          No toxic B-Book flow ({clean.length}):{' '}
          {clean.map((s, i) => (
            <span key={s.symbol}>
              {i > 0 && ', '}
              <span {...rowProps(s.symbol)} className="rr-row font-mono" style={{ color: C.soft }}>{s.symbol}</span>
            </span>
          ))}
        </div>
      )}

      {noB.length > 0 && (
        <div style={{ padding: '10px 16px 0', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          ○ No B-Book flow, A-Book only ({noB.length}):{' '}
          {noB.map((s, i) => (
            <span key={s.symbol}>
              {i > 0 && ', '}
              <span {...rowProps(s.symbol)} className="rr-row font-mono" style={{ color: C.soft }}>{s.symbol}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVELS = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Why a classified account in the toxic set is not flagged, in words; null when it is, or is not in the set. */
function notFlaggedReason(a: FlowAccountRow, fv: FlowView): string | null {
  if (a.flagged || !a.classification) return null;
  const rule = fv.toxicClasses.find((c) => c.cls === a.classification);
  if (!rule) return null;
  const why: string[] = [];
  if (rule.minConfidence !== null && (a.confidence ?? 0) < rule.minConfidence) {
    why.push(`confidence ${(a.confidence ?? 0).toFixed(2)} below ${rule.minConfidence.toFixed(2)}`);
  }
  if (rule.minRiskLevel) {
    const lvl = a.matrix_risk_level;
    if (!lvl) why.push(`no risk-matrix level (needs ${rule.minRiskLevel}+)`);
    else if (LEVELS.indexOf(lvl) < LEVELS.indexOf(rule.minRiskLevel)) why.push(`risk ${lvl}, needs ${rule.minRiskLevel}+`);
  }
  return why.length ? `Not flagged: ${why.join('; ')}` : null;
}

function fmtHold(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '—';
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

function FlowAccounts({ symbol, fv }: { symbol: string; fv: FlowView }) {
  const [data, setData] = useState<FlowAccountsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    flowApi.getAccounts(symbol)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the accounts'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, version]);

  const rows = data?.accounts ?? [];
  const shown = all ? rows : rows.slice(0, 20);

  return (
    <>
      <SectionTitle>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span>Accounts <span style={{ color: C.faint, fontWeight: 400 }}>· flagged first</span></span>
          <button
            type="button"
            className="rr-btn"
            onClick={() => setVersion((v) => v + 1)}
            disabled={loading}
            style={{ background: 'transparent', border: 'none', color: C.blueSoft, fontSize: 12, cursor: loading ? 'default' : 'pointer', padding: 0 }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </span>
      </SectionTitle>
      {error && <div style={{ fontSize: 12.5, color: '#ff6b6b' }}>{error}</div>}
      {data && !data.ready && <div style={{ fontSize: 12.5, color: '#ffb020' }}>The window is being built after a restart; the list fills in within seconds.</div>}
      {data && data.ready && rows.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No account traded it in the window.</div>}
      {shown.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.faint, textAlign: 'right' }}>
              <th style={{ textAlign: 'left', fontWeight: 500, padding: '2px 0' }}>Account</th>
              <th style={{ fontWeight: 500, padding: '2px 0' }}>Flow</th>
              <th style={{ fontWeight: 500, padding: '2px 0 2px 6px' }} title="Client's realised P&L in the window: positive = the client made money">P&amp;L</th>
              <th style={{ fontWeight: 500, padding: '2px 0' }} title="Median holding time of the closing deals">Hold</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const reason = notFlaggedReason(a, fv);
              const pnl = a.realized_pnl_usd;
              return (
                <tr key={`${a.platform}:${a.login}`} style={{ borderTop: `1px solid ${C.line}`, verticalAlign: 'top' }}>
                  <td style={{ padding: '5px 0', fontSize: 12.5, color: C.text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        title={a.flagged ? 'Flagged' : a.unclassified ? 'Not classified' : 'Not flagged'}
                        style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                          background: a.flagged ? '#ff3b30' : 'transparent',
                          border: a.flagged ? 'none' : `1.5px solid ${a.unclassified ? '#ffb020' : C.grey}`,
                        }}
                      />
                      <span className="font-mono" style={{ fontWeight: 600 }}>{a.login}</span>
                      <span style={{ fontSize: 11, color: C.faint }}>{a.platform === 'CTRADER' ? 'cTrader' : a.platform}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: a.flagged ? '#ff8a8a' : C.soft, paddingLeft: 13 }}>
                      {classLabel(a.unclassified ? null : a.classification)}
                      {a.confidence !== null && !a.unclassified && <span className="font-mono"> {Math.round(a.confidence * 100)}%</span>}
                      {a.matrix_risk_level && <span style={{ color: C.faint }}> · {a.matrix_risk_level}</span>}
                    </div>
                    {reason && <div style={{ fontSize: 11, color: '#ffb020', paddingLeft: 13 }}>{reason}</div>}
                  </td>
                  <td className="font-mono" style={{ padding: '5px 0', fontSize: 12.5, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtUsd(a.flow_usd)}
                    <span style={{ display: 'block', fontSize: 10.5, color: C.faint }}>{a.fills} fills</span>
                  </td>
                  <td className="font-mono" style={{ padding: '5px 0 5px 6px', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', color: pnl === null ? C.text : pnl > 0 ? '#ff5c5c' : pnl < 0 ? '#3ddc57' : C.text }}>
                    {pnl === null ? '—' : pnl > 0 ? `+${fmtUsd(pnl)}` : fmtUsd(pnl)}
                  </td>
                  <td className="font-mono" style={{ padding: '5px 0', fontSize: 12.5, color: C.soft, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtHold(a.median_hold_sec)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {rows.length > shown.length && (
        <button
          type="button"
          className="rr-btn"
          onClick={() => setAll(true)}
          style={{ background: 'transparent', border: 'none', color: C.blueSoft, fontSize: 12, cursor: 'pointer', padding: '6px 0' }}
        >
          Show all {rows.length}
        </button>
      )}
      {rows.length > 0 && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 1.45 }}>
          Client P&amp;L is the client's realised result in the window: red = the client won, which costs the broker on the B-Book.
        </div>
      )}
    </>
  );
}

function FlowDetail({
  s, fv, upto, scope, scopeText, region, onClose,
}: {
  s: FlowSymbol; fv: FlowView; upto: number; scope: PlatformScope;
  scopeText: string; region: string; onClose: () => void;
}) {
  const trend = s.state === 'rated' ? trendOf(flowHistory, upto, (x) => shareOf(x.payload, s.symbol)) : null;
  const series = flowHistory.slice(0, upto + 1).map((x) => shareOf(x.payload, s.symbol));
  const since = flowHistory.length ? flowHistory[0].t : null;
  const aToxic = Math.max(0, s.flaggedUsd - s.bFlaggedUsd);
  const total = s.flowUsd || 1;

  return (
    <div style={{ padding: '14px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.faint }}>{region} · toxic flow · {scopeText}</div>
          <div className="font-mono" style={{ fontSize: 22, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{s.symbol}</div>
        </div>
        <button
          type="button"
          className="rr-btn"
          onClick={onClose}
          aria-label="Close instrument"
          style={{ background: 'transparent', border: 'none', color: C.soft, fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 8px' }}>
        {s.state === 'rated' && s.band && <BandBadge band={s.band} large />}
        {s.state === 'no_b_flow' && <GreyBadge text="NO B-BOOK FLOW" />}
        {trend && <TrendChip trend={trend} large />}
      </div>

      {s.state === 'no_b_flow' && (
        <Para>All of this instrument's flow in the window went to the A-Book, so there is no B-Book share to colour. The all-books figures are below.</Para>
      )}
      {s.unclassifiedShare !== null && s.unclassifiedShare >= 0.2 && (
        <Para color="#ffb020">
          {fmtPct(s.unclassifiedShare)} of the flow comes from {s.unclassifiedAccounts} account{s.unclassifiedAccounts === 1 ? '' : 's'} not
          classified. They are never flagged, so the toxic share may read low.
        </Para>
      )}
      {scope !== 'ALL' && (
        <Para color={C.faint}>The shares are measured on both platforms: the B-Book flow is not split per platform.</Para>
      )}

      <Row label="Toxic share, B-Book" note={`${fmtUsd(s.bFlaggedUsd)} of ${fmtUsd(s.bFlowUsd)} B-Book flow`}>{fmtShare(s.bShare, 1)}</Row>
      <Row label="Toxic share, all books" note={`${fmtUsd(s.flaggedUsd)} of ${fmtUsd(s.flowUsd)} flow`}>{fmtShare(s.share, 1)}</Row>
      <Row label="Toxic flow to the A-Book" note="hedged at the LP">{fmtUsd(aToxic)}</Row>
      <Row label="Fills" note={s.unpricedFills > 0 ? `${s.unpricedFills} without a USD value, left out of the flow` : `${s.flaggedFills} from flagged accounts`}>
        {s.fills}
      </Row>
      <Row label="Accounts" note={`${s.flaggedAccounts} flagged · ${s.unclassifiedAccounts} not classified`}>{s.accounts}</Row>
      <Row label="Flow not classified" note={s.unclassifiedShare !== null ? `${fmtShare(s.unclassifiedShare)} of the flow` : undefined}>{fmtUsd(s.unclassifiedUsd)}</Row>

      {s.parts.length > 0 && (
        <>
          <SectionTitle>By platform <span style={{ color: C.faint, fontWeight: 400 }}>· all books</span></SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {s.parts.map((p) => (
                <tr key={p.platform} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '6px 0', fontSize: 13, color: C.soft }}>{PLATFORM_LABEL[p.platform]}</td>
                  <td className="font-mono" style={{ padding: '6px 0', fontSize: 13, color: C.text, textAlign: 'right' }}>{fmtUsd(p.flowUsd)}</td>
                  <td className="font-mono" style={{ padding: '6px 0 6px 10px', fontSize: 12.5, color: C.soft, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtUsd(p.flaggedUsd)} toxic
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <SectionTitle>By classification <span style={{ color: C.faint, fontWeight: 400 }}>· share of the flow</span></SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {[...s.byClass, ...(s.unclassifiedUsd > 0 || s.unclassifiedAccounts > 0
            ? [{ cls: '', flowUsd: s.unclassifiedUsd, fills: 0, accounts: s.unclassifiedAccounts, toxicClass: false }]
            : [])].map((c) => (
            <tr key={c.cls || 'unclassified'} style={{ borderTop: `1px solid ${C.line}` }}>
              <td style={{ padding: '6px 0', fontSize: 12.5, color: c.cls ? C.text : '#ffb020', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 6, background: c.toxicClass ? '#ff3b30' : 'transparent', border: c.toxicClass ? 'none' : `1.5px solid ${C.grey}` }} />
                {c.cls ? classLabel(c.cls) : 'Not classified'}
              </td>
              <td style={{ padding: '6px 8px', width: '40%' }}>
                <div style={{ height: 4, background: '#141d28', borderRadius: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, (c.flowUsd / total) * 100)}%`, background: c.toxicClass ? '#ff3b30' : c.cls ? C.blueSoft : '#ffb020' }} />
                </div>
              </td>
              <td className="font-mono" style={{ padding: '6px 0', fontSize: 12.5, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {fmtUsd(c.flowUsd)}
                <span style={{ color: C.faint }}> · {c.accounts}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>● class in the toxic set · ○ not · the last figure is the number of accounts</div>

      <FlowAccounts symbol={s.symbol} fv={fv} />

      {s.state === 'rated' && (
        <>
          <SectionTitle>
            Toxic share, B-Book{' '}
            <span style={{ color: C.faint, fontWeight: 400 }}>· observed{since !== null ? ` since ${fmtUtcTime(since)}` : ''}</span>
          </SectionTitle>
          <Sparkline
            values={series}
            width={306}
            height={56}
            color={trend?.dir === 'building' ? C.up : trend?.dir === 'easing' ? C.down : C.blueSoft}
          />
        </>
      )}

      <ActionButtons />
    </div>
  );
}

function FlowLegend({ fv }: { fv: FlowView }) {
  const t = fv.thresholds;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const ranges = [`under ${pct(t.warning)}`, `${pct(t.warning)}–${pct(t.high)}`, `${pct(t.high)}–${pct(t.critical)}`, `${pct(t.critical)} and over`];
  return (
    <Panel style={{ width: 470, flexShrink: 0, padding: '9px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, fontWeight: 600 }}>
        <span>Toxic share of B-Book flow</span>
        <span style={{ color: C.faint, fontWeight: 400 }}>last {fmtWindow(fv.windowSec)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, margin: '6px 0 4px', background: rampGradientCss(), boxShadow: '0 0 12px rgba(255, 120, 0, 0.25)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {BANDS.map((b, i) => (
          <div key={b.id} style={{ fontSize: 11.5, color: C.text }}>
            {b.label}
            <span className="font-mono" style={{ display: 'block', fontSize: 10.5, color: C.faint }}>{ranges[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
        <span><span style={{ color: C.soft }}>○</span> no B-Book flow</span>
        <span><span style={{ color: '#5d6b7c' }}>●</span> no toxic flow, or no flow</span>
        <span>The dot is the reading</span>
      </div>
    </Panel>
  );
}

function FlowMapNotes({ fv, running }: { fv: FlowView; running: boolean }) {
  const notes: ReactNode[] = [];
  const t = fv.totals;
  if (!running) {
    notes.push(<MapNote key="off" tone="#ffb020">The flow feed is not running, or has not built its first figures. The layer fills in when it does.</MapNote>);
  } else {
    if (t.flowUsd > 0 && t.unclassifiedUsd / t.flowUsd >= 0.1) {
      notes.push(
        <MapNote key="uncl" tone="#ffb020">
          {fmtPct(t.unclassifiedUsd / t.flowUsd)} of client flow comes from {t.unclassifiedAccounts} account{t.unclassifiedAccounts === 1 ? '' : 's'} not
          classified. They are never flagged: their flow counts as not toxic.
        </MapNote>,
      );
    }
    if (t.unpricedFills > 0) {
      notes.push(<MapNote key="unpriced" tone={C.soft}>{t.unpricedFills} fill{t.unpricedFills === 1 ? ' has' : 's have'} no USD value and {t.unpricedFills === 1 ? 'is' : 'are'} left out of the flow.</MapNote>);
    }
    if (fv.toxicClasses.length === 0) {
      notes.push(<MapNote key="none" tone="#ffb020" action={<FlowSettingsLink />}>No class is set as toxic, so nothing is flagged.</MapNote>);
    }
  }
  if (notes.length === 0) return null;
  return (
    <div
      style={{ position: 'absolute', left: 10, bottom: 30, maxWidth: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2 }}
      onClick={(e) => e.stopPropagation()}
    >
      {notes}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Notes over the map — what the colours cannot say
// ═══════════════════════════════════════════════════════════════════════════

function MapNote({ children, tone, action }: { children: ReactNode; tone: string; action?: ReactNode }) {
  return (
    <div
      role="note"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(8, 12, 18, 0.94)', border: `1px solid ${tone}99`, borderRadius: 6,
        padding: '7px 11px', fontSize: 12.5, color: tone, lineHeight: 1.45, pointerEvents: 'auto',
      }}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

function MapNotes({ view, mt5Check }: { view: RadarView; mt5Check: RiskRadarMt5Book | null }) {
  const cap = view.capacity;
  const notes: ReactNode[] = [];
  if (cap.state === 'no_limit') {
    notes.push(
      <MapNote key="limit" tone="#ffb020" action={<LimitsLink />}>
        No monthly loss limit is set. Risk is shown in USD, but nothing can be coloured until one is.
      </MapNote>,
    );
  } else if (cap.state === 'ok' && (cap.remaining ?? 0) <= 0) {
    notes.push(
      <MapNote key="used" tone="#ff3b30" action={<LimitsLink />}>
        This month's losses have used up the loss limit: every instrument with risk is Critical.
      </MapNote>,
    );
  } else if (cap.state === 'no_pnl') {
    notes.push(<MapNote key="pnl" tone="#ffb020">Month-to-date P&amp;L not loaded, so the capacity left is not known.</MapNote>);
  }
  if (!view.movesReady) {
    notes.push(<MapNote key="moves" tone="#ffb020">Adverse moves not loaded: instruments are unrated.</MapNote>);
  } else if (view.unrated > 0) {
    notes.push(
      <MapNote key="unrated" tone={C.soft}>
        {view.unrated} instrument{view.unrated === 1 ? ' is' : 's are'} unrated: not enough daily closes for an
        adverse move. {view.unrated === 1 ? 'It is' : 'They are'} left out of the book risk.
      </MapNote>,
    );
  }
  if (view.feedGaps > 0 && mt5Check) {
    notes.push(
      <MapNote key="gaps" tone="#ffb020">
        The exposure feed has no figure for {view.feedGaps} instrument{view.feedGaps === 1 ? '' : 's'} MT5 holds
        B-Book positions in ({mt5Check.total_positions} open position{mt5Check.total_positions === 1 ? '' : 's'},
        read {fmtUtcTime(parseTime(mt5Check.as_of))}). {view.feedGaps === 1 ? 'It is' : 'They are'} drawn grey, lots only.
      </MapNote>,
    );
  }
  if (notes.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute', left: 10, bottom: 30, maxWidth: 'calc(100% - 20px)',
        display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {notes}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════

export function RiskRadarPage() {
  const { snapshot, socket, lastLiveAt, realizedMtd, flow, flowLiveAt, flowSeeded } = useRadarFeed();
  const moves = useDailyMoves();
  const limits = useRiskLimits();
  const largest1Day = useLargest1Day();
  const tree = useSymbolTree();
  const mt5Book = useMt5Book();
  const now = useClock(5_000);

  const [layer, setLayer] = useState<Layer>('exposure');
  const [scope, setScope] = useState<PlatformScope>(loadScope);
  const [selected, setSelected] = useState<string | null>(null);
  const [replayT, setReplayT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const replaying = replayT !== null && history.length > 0;
  const replayIndex = replaying ? nearestIndex(replayT as number) : -1;
  const upto = replaying ? replayIndex : history.length - 1;
  const shownSnapshot = replaying ? history[replayIndex].snapshot : snapshot;

  // The MT5 book was read once, when the page opened. It is compared with the
  // feed only until a live snapshot arrives: after that the feed moves on and
  // a one-off reading of MT5 would raise false gaps.
  const mt5Check = !replaying && lastLiveAt === null ? mt5Book : null;

  const ctx = useMemo<RiskContext>(() => ({ moves, limits, realizedMtd }), [moves, limits, realizedMtd]);

  const view = useMemo(
    () => buildView(shownSnapshot, largest1Day, scope, mt5Check?.by_symbol ?? null, ctx),
    [shownSnapshot, largest1Day, scope, mt5Check, ctx],
  );
  const selectedSymbol = selected ? view.bySymbol.get(selected) ?? null : null;

  // Flow toxicity: the payload of the moment shown (replay picks the one in force then).
  const flowIndex = replaying ? flowIndexAt(replayT as number) : flowHistory.length - 1;
  const shownFlow = replaying ? (flowIndex >= 0 ? flowHistory[flowIndex].payload : null) : flow;
  const fv = useMemo(() => buildFlowView(shownFlow, scope), [shownFlow, scope]);
  const selectedFlow = selected ? fv.bySymbol.get(selected) ?? null : null;
  const flowRunning = flowSeeded !== false || flow !== null;

  // One map for every layer: same instruments, same places.
  const allSymbols = useMemo(() => {
    const set = new Set(view.symbols.map((s) => s.symbol));
    for (const s of fv.symbols) set.add(s.symbol);
    return [...set];
  }, [view, fv]);
  const imap = useMemo(
    () => buildMap(tree.groupOf, tree.order, allSymbols),
    [tree, allSymbols],
  );
  const items = useMemo(
    () => (layer === 'flow' ? flowItems(fv, allSymbols) : exposureItems(view)),
    [layer, fv, view, allSymbols],
  );

  // What an empty map means, in words.
  const mt5Names = mt5Check ? mt5Check.nodes.filter((n) => n.ok).map((n) => n.node_name).join(', ') : '';
  const emptyText = mt5Check && mt5Check.total_positions === 0 && scope !== 'CTRADER' && mt5Names
    ? `No open B-Book positions on MT5 (${mt5Names}), checked ${fmtUtcTime(parseTime(mt5Check.as_of))}.`
    : 'No open exposure in this snapshot.';

  // Which platforms the snapshot actually has data for (exposure layer; the
  // flow payload names its own platforms).
  const covered = useMemo(() => coverageOf(shownSnapshot), [shownSnapshot]);
  const pendingPlatform: Platform | null =
    layer === 'exposure' && shownSnapshot && scope !== 'ALL' && !covered.has(scope) ? scope : null;
  const flowCovered = new Set(fv.platforms);
  const missing = layer === 'flow'
    ? (shownFlow && scope === 'ALL' && fv.platforms.length > 0 ? PLATFORMS.filter((p) => !flowCovered.has(p)) : [])
    : shownSnapshot && scope === 'ALL' ? PLATFORMS.filter((p) => !covered.has(p)) : [];
  const shownAlone = PLATFORMS.filter((p) => (layer === 'flow' ? flowCovered : covered).has(p));
  // Name what is actually on screen: "Both" over an MT5-only feed is the MT5 book.
  const scopeText = scope === 'ALL' && missing.length > 0 && shownAlone.length > 0
    ? shownAlone.map((p) => PLATFORM_LABEL[p]).join(' + ')
    : scopeLabel(scope);

  const chooseScope = useCallback((next: PlatformScope) => {
    setScope(next);
    saveScope(next);
  }, []);

  // Replay: step through the recorded samples, then return to live.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setReplayT((t) => {
        if (t === null) return null;
        const i = nearestIndex(t);
        if (i >= history.length - 1) return null;
        return history[i + 1].t;
      });
    }, 140);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (playing && replayT === null) setPlaying(false);
  }, [playing, replayT]);

  const togglePlay = useCallback(() => {
    if (history.length < 2) return;
    if (playing) { setPlaying(false); return; }
    setReplayT((t) => (t === null ? history[0].t : t));
    setPlaying(true);
  }, [playing]);

  const scrub = useCallback((t: number | null) => {
    setPlaying(false);
    setReplayT(t);
  }, []);

  // Freshness — of the layer on screen.
  const onFlow = layer === 'flow';
  const liveAt = onFlow ? flowLiveAt : lastLiveAt;
  const hasData = onFlow ? flow !== null : snapshot !== null;
  const shownAsOf = onFlow ? fv.asOf : view.asOf;
  const liveFresh = socket === 'open' && liveAt !== null && now - liveAt < LIVE_STALE_MS;
  let chip: { color: string; text: string; blink?: boolean };
  if (replaying) {
    chip = { color: '#ffb020', text: `Replay · ${fmtUtcTime(history[replayIndex].t)}` };
  } else if (!hasData) {
    chip = socket === 'closed'
      ? { color: '#ff3b30', text: 'Live updates offline' }
      : onFlow && flowSeeded === false
        ? { color: '#ffb020', text: 'Flow feed not running' }
        : { color: C.grey, text: onFlow ? 'Waiting for flow data…' : 'Waiting for exposure data…' };
  } else if (liveFresh) {
    chip = { color: '#3ddc57', text: `Live · as of ${fmtUtcTime(shownAsOf)}`, blink: true };
  } else if (socket === 'closed') {
    chip = { color: '#ff3b30', text: `Live updates offline · showing ${fmtUtcDateTime(shownAsOf)}` };
  } else {
    chip = { color: '#ffb020', text: `Feed quiet · last snapshot ${fmtUtcDateTime(shownAsOf)}` };
  }

  return (
    <div className="h-full overflow-auto" style={{ background: C.page }}>
      <style>{STYLE}</style>
      <div
        style={{
          height: '100%', minHeight: 600, minWidth: 1180,
          display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px 14px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <RadarIcon size={30} color="#3ddc57" />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: C.text, lineHeight: 1.15, margin: 0 }}>Risk Radar</h1>
              <div style={{ fontSize: 13, color: C.soft }}>Where the risk in the book sits, instrument by instrument.</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {replaying && (
              <button
                type="button"
                className="rr-btn"
                onClick={() => scrub(null)}
                style={{
                  padding: '6px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: C.blue, color: '#ffffff', border: 'none',
                }}
              >
                Back to live
              </button>
            )}
            <div
              role="status"
              className="font-mono"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.text, whiteSpace: 'nowrap',
                padding: '6px 11px', borderRadius: 5, background: C.panel, border: `1px solid ${chip.color}66`,
              }}
            >
              <span
                className={chip.blink ? 'rr-live-dot' : undefined}
                style={{ width: 8, height: 8, borderRadius: '50%', background: chip.color, boxShadow: `0 0 8px ${chip.color}` }}
              />
              {chip.text}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {layer === 'flow' ? (
          shownFlow ? <FlowCards fv={fv} upto={flowIndex} scope={scope} /> : <PendingCards labels={FLOW_CARDS} />
        ) : layer !== 'exposure' ? (
          <PendingCards labels={PENDING_CARDS[layer]} />
        ) : pendingPlatform ? (
          <PendingCards labels={EXPOSURE_CARDS} />
        ) : (
          <ExposureCards view={view} upto={upto} ctx={ctx} scope={scope} />
        )}

        {/* Map + inspector */}
        <div style={{ flex: 1, minHeight: 300, display: 'flex', gap: 12 }}>
          <Panel style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px' }}>
              <div role="tablist" aria-label="Radar layer" style={{ display: 'flex', gap: 8 }}>
                {LAYERS.map((l) => {
                  const on = l.id === layer;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="rr-btn"
                      onClick={() => setLayer(l.id)}
                      style={{
                        padding: '7px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
                        background: on ? C.blue : '#0f1620',
                        color: on ? '#ffffff' : C.soft,
                        border: `1px solid ${on ? C.blue : C.line}`,
                        boxShadow: on ? '0 0 16px rgba(47, 125, 255, 0.55)' : undefined,
                      }}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                {missing.length > 0 && shownAlone.length > 0 && (
                  <div style={{ fontSize: 12, color: '#ffb020', whiteSpace: 'nowrap' }}>
                    {missing.map((p) => PLATFORM_LABEL[p]).join(' and ')} not in the feed · showing{' '}
                    {shownAlone.map((p) => PLATFORM_LABEL[p]).join(' and ')} only
                  </div>
                )}
                <div role="radiogroup" aria-label="Trading platform" style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: C.soft, marginRight: 8 }}>Platform</span>
                  {SCOPES.map((o, i) => {
                    const on = o.id === scope;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className="rr-btn"
                        onClick={() => chooseScope(o.id)}
                        style={{
                          padding: '6px 13px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          background: on ? '#ffffff' : '#0f1620',
                          color: on ? '#05080d' : C.soft,
                          border: `1px solid ${on ? '#ffffff' : C.line}`,
                          marginLeft: i ? -1 : 0,
                          borderRadius: i === 0 ? '5px 0 0 5px' : i === SCOPES.length - 1 ? '0 5px 5px 0' : 0,
                          position: 'relative', zIndex: on ? 1 : 0,
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 6px 6px' }}>
              <RadarMap
                items={items}
                imap={imap}
                active={layer === 'exposure' || (layer === 'flow' && shownFlow !== null)}
                selected={selected}
                onSelect={setSelected}
              >
                {layer === 'liquidity' && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      background: '#080c12', border: `1px dashed ${C.grey}`, borderRadius: 8,
                      padding: '14px 20px', textAlign: 'center', width: 380, pointerEvents: 'none', zIndex: 2,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                      {PENDING_TEXT[layer].title} — awaiting data feed
                    </div>
                    <div style={{ fontSize: 12.5, color: C.soft, marginTop: 6, lineHeight: 1.5 }}>
                      Same instruments, same places. This layer lights up when its measures are published.
                    </div>
                  </div>
                )}
                <div
                  style={{
                    position: 'absolute', right: 12, bottom: 8, fontSize: 11.5, color: C.faint,
                    pointerEvents: 'none', textShadow: '0 0 6px #05080d',
                  }}
                >
                  {tree.source ? `Groups: symbol tree of ${tree.source}` : 'Symbol groups not loaded'}
                </div>
                {layer === 'exposure' && !snapshot && view.symbols.length === 0 && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: 14, color: C.soft, pointerEvents: 'none',
                    }}
                  >
                    Waiting for exposure data…
                  </div>
                )}
                {layer === 'exposure' && pendingPlatform && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      background: '#080c12', border: `1px dashed ${C.grey}`, borderRadius: 8,
                      padding: '14px 20px', textAlign: 'center', width: 400, pointerEvents: 'none', zIndex: 2,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                      {PLATFORM_LABEL[pendingPlatform]} exposure — awaiting data feed
                    </div>
                    <div style={{ fontSize: 12.5, color: C.soft, marginTop: 6, lineHeight: 1.5 }}>
                      The exposure feed carries no {PLATFORM_LABEL[pendingPlatform]} positions.
                    </div>
                  </div>
                )}
                {layer === 'exposure' && snapshot && !pendingPlatform && view.symbols.length === 0 && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: 14, color: C.soft, pointerEvents: 'none', textAlign: 'center',
                    }}
                  >
                    {emptyText}
                  </div>
                )}
                {layer === 'exposure' && !pendingPlatform && (
                  <MapNotes view={view} mt5Check={mt5Check} />
                )}
                {layer === 'flow' && <FlowMapNotes fv={fv} running={flowRunning && shownFlow !== null} />}
                {layer === 'flow' && shownFlow && fv.symbols.length === 0 && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      background: '#080c12', border: `1px dashed ${C.grey}`, borderRadius: 8,
                      padding: '14px 20px', textAlign: 'center', width: 420, pointerEvents: 'none', zIndex: 2,
                      fontSize: 13, color: C.soft, lineHeight: 1.5,
                    }}
                  >
                    {flowEmptyText(fv, scope)}
                  </div>
                )}
              </RadarMap>
            </div>
          </Panel>

          <Panel style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
            {layer === 'flow' ? (
              !shownFlow ? (
                <PendingInspector layer="flow" />
              ) : selectedFlow ? (
                <FlowDetail s={selectedFlow} fv={fv} upto={flowIndex} scope={scope} scopeText={scopeLabel(scope)} region={imap.regionOf(selectedFlow.symbol)} onClose={() => setSelected(null)} />
              ) : (
                <FlowList fv={fv} scope={scope} scopeText={scopeLabel(scope)} onSelect={setSelected} />
              )
            ) : layer !== 'exposure' ? (
              <PendingInspector layer={layer} />
            ) : pendingPlatform ? (
              <PlatformPendingInspector platform={pendingPlatform} />
            ) : selectedSymbol ? (
              <SymbolDetail s={selectedSymbol} view={view} upto={upto} ctx={ctx} scope={scope} scopeText={scopeText} region={imap.regionOf(selectedSymbol.symbol)} onClose={() => setSelected(null)} />
            ) : (
              <RankedList view={view} scope={scope} scopeText={scopeText} emptyText={emptyText} onSelect={setSelected} />
            )}
          </Panel>
        </div>

        {/* Timeline + legend */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Timeline replayT={replaying ? replayT : null} playing={playing} onScrub={scrub} onPlay={togglePlay} />
          {layer === 'flow' && shownFlow ? <FlowLegend fv={fv} /> : <Legend layer={layer} view={view} />}
        </div>
      </div>
    </div>
  );
}
