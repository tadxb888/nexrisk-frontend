// ============================================
// Taiga Risk Radar
//
// A weather-radar view of the book over a fixed instrument map. Three layers
// share the same map: Exposure, Flow toxicity, Liquidity.
//
// Phase 1 — the Exposure layer runs on live data:
//   seed   GET /api/v1/risk-radar/exposure               (once, on open)
//   live   topic portfolio.exposure.symbols              (WebSocket, ~1 Hz)
//   stress GET /api/v1/risk/largest-1day                 (once, on open)
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
//   • an instrument without a USD value is drawn grey, never green;
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
  type PortfolioExposureSymbolsData,
} from '@/services/api';
import { usePermission } from '@/stores/usePermission';
import { FAMILIES, familyName, hashSymbol, layoutSymbols, type MapPosition } from './riskRadar/instrumentMap';
import { HeatRenderer, rampGradientCss, type HeatBlob } from './riskRadar/heatField';
import {
  BANDS,
  BAND_BY_ID,
  HISTORY_WINDOW_MS,
  MAX_DAILY_RANGE,
  SAMPLE_EVERY_MS,
  PLATFORM_LABEL,
  buildView,
  coverageOf,
  fmtLots,
  fmtPct,
  fmtSpan,
  fmtUsd,
  fmtUtcDateTime,
  fmtUtcTime,
  parseTime,
  scopeLabel,
  sideOf,
  totalUsdOf,
  trendOf,
  usdOf,
  type Band,
  type Platform,
  type PlatformScope,
  type RadarSymbol,
  type RadarView,
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

type SocketState = 'connecting' | 'open' | 'closed';

function useRadarFeed() {
  const [snapshot, setSnapshot] = useState<PortfolioExposureSymbolsData | null>(
    () => (history.length ? history[history.length - 1].snapshot : null),
  );
  const [socket, setSocket] = useState<SocketState>('connecting');
  const [lastLiveAt, setLastLiveAt] = useState<number | null>(null);
  const [, setHistoryVersion] = useState(0);
  const liveSeen = useRef(false);

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

    const stop = connectRiskRadarWebSocket(
      (d) => {
        if (cancelled) return;
        liveSeen.current = true;
        accept(d, true);
      },
      (status) => { if (!cancelled) setSocket(status); },
    );

    return () => { cancelled = true; stop(); };
  }, []);

  return { snapshot, socket, lastLiveAt };
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

function RadarGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="#3ddc57" strokeWidth="1.6" />
      <circle cx="13" cy="13" r="7.5" fill="none" stroke="#ffe01f" strokeWidth="1.6" />
      <circle cx="13" cy="13" r="3.4" fill="#ff3b30" />
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

function ExposureCards({ view, upto, scope }: { view: RadarView; upto: number; scope: PlatformScope }) {
  const totals = history.slice(0, upto + 1).map((s) => totalUsdOf(s.snapshot, scope));
  const trend = trendOf(history, upto, (s) => totalUsdOf(s.snapshot, scope));
  const sparkColor = trend?.dir === 'building' ? C.up : trend?.dir === 'easing' ? C.down : C.blueSoft;
  const top = view.symbols.find((s) => s.pricing === 'priced') ?? null;
  const hasBook = view.priced > 0;

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Card
        accent={C.blue}
        label="B-Book exposure"
        aside={<Sparkline values={totals} width={132} height={42} color={sparkColor} />}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{hasBook ? fmtUsd(view.totalUsd) : '—'}</CardValue>
          {trend && hasBook && <TrendChip trend={trend} />}
        </div>
        <CardNote>
          {hasBook
            ? `${view.priced} instrument${view.priced === 1 ? '' : 's'} · a 1% move is ${fmtUsd(view.impact1pct)}`
            : 'No priced B-Book exposure in this snapshot'}
        </CardNote>
      </Card>

      <Card accent="#ff3b30" label="Worst-day loss">
        <CardValue>{view.worstDayTotal !== null ? fmtUsd(view.worstDayTotal) : '—'}</CardValue>
        <CardNote>
          {!view.worstDayReady
            ? 'Daily ranges not loaded'
            : view.worstDayTotal === null
              ? 'No usable daily range for the instruments held'
              : `Each instrument repeating its worst day of the last 100 · covers ${view.worstDayCovered} of ${view.priced}`}
        </CardNote>
      </Card>

      <Card accent={top?.band ? BAND_BY_ID[top.band].color : C.grey} label="Largest concentration">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <CardValue>{top ? fmtPct(top.share) : '—'}</CardValue>
          {top && (
            <span className="font-mono" style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{top.symbol}</span>
          )}
          {top?.band && <BandBadge band={top.band} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
          {BANDS.map((b) => (
            <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.soft, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
              {b.label}
              <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{view.bandCounts[b.id]}</span>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

const PENDING_CARDS: Record<Exclude<Layer, 'exposure'>, string[]> = {
  flow: ['Adverse markout', 'Flagged accounts', 'Confidence'],
  liquidity: ['Degraded routes', 'Reject rate', 'Stale quotes'],
};

const EXPOSURE_CARDS = ['B-Book exposure', 'Worst-day loss', 'Largest concentration'];

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
  s: RadarSymbol;
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

function placeSymbols(
  view: RadarView,
  positions: Map<string, MapPosition>,
  w: number,
  h: number,
  always: Array<string | null>,
): Placed[] {
  const out: Placed[] = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const pinned = new Set(always.filter(Boolean) as string[]);

  // Region captions are obstacles too.
  for (const f of FAMILIES) {
    boxes.push({ x: f.rect.x * w + 8, y: f.rect.y * h + 6, w: f.label.length * 7.6 + 18, h: 22 });
  }

  // …and so is every marker: a name never sits on another instrument's dot.
  for (const s of view.symbols) {
    const pos = positions.get(s.symbol);
    if (pos) boxes.push({ x: pos.x * w - 6, y: pos.y * h - 6, w: 12, h: 12 });
  }

  const ordered = [...view.symbols].sort(
    (a, b) => Number(pinned.has(b.symbol)) - Number(pinned.has(a.symbol)),
  );
  let labelled = 0;

  for (const s of ordered) {
    const pos = positions.get(s.symbol);
    if (!pos) continue;
    const x = pos.x * w;
    const y = pos.y * h;
    // Unpriced instruments are always named: they are a data gap to notice.
    const wants = pinned.has(s.symbol) || s.pricing === 'unpriced' || (s.pricing === 'priced' && labelled < LABEL_LIMIT);
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
      if (label) { boxes.push(label); if (s.pricing === 'priced') labelled++; }
    }
    out.push({ s, x, y, label });
  }
  return out;
}

function symbolAria(s: RadarSymbol): string {
  if (s.pricing === 'priced' && s.band) {
    return `${s.symbol}: ${BAND_BY_ID[s.band].label}, ${fmtPct(s.share)} of B-Book exposure, ${fmtUsd(s.usd)}`;
  }
  if (s.pricing === 'unpriced') return `${s.symbol}: unpriced, ${fmtLots(s.bLots)} B-Book lots with no USD value`;
  return `${s.symbol}: no B-Book position`;
}

interface RadarMapProps {
  view: RadarView;
  layer: Layer;
  selected: string | null;
  onSelect: (symbol: string | null) => void;
  children?: ReactNode;
}

function RadarMap({ view, layer, selected, onSelect, children }: RadarMapProps) {
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

  const positions = useMemo(
    () => layoutSymbols(view.symbols.map((s) => s.symbol)),
    [view],
  );

  // What each patch should reach; the picture eases towards it.
  const targets = useMemo(() => {
    const m = new Map<string, number>();
    if (layer === 'exposure') {
      for (const s of view.symbols) if (s.heat > 0) m.set(s.symbol, s.heat);
    }
    return m;
  }, [view, layer]);

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

    // A crowded family gets smaller patches so it does not merge into a carpet.
    const crowd = new Map<string, number>();
    for (const symbol of shown.keys()) {
      const p = pos.get(symbol);
      if (p) crowd.set(p.family, (crowd.get(p.family) ?? 0) + 1);
    }

    const base = Math.min(sz.h, sz.w * 0.5);
    const blobs: HeatBlob[] = [];
    for (const [symbol, heat] of shown) {
      const p = pos.get(symbol);
      if (!p) continue;
      const tight = Math.max(0.62, Math.min(1, Math.sqrt(7 / (crowd.get(p.family) ?? 1))));
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
    () => (size.w > 0 ? placeSymbols(view, positions, size.w, size.h, [selected, hovered]) : []),
    [view, positions, size, selected, hovered],
  );

  // The inspector already describes the selected instrument.
  const hoveredItem = hovered && hovered !== selected ? placed.find((p) => p.s.symbol === hovered) ?? null : null;
  const active = layer === 'exposure';

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
        {/* Family regions — geography only */}
        {FAMILIES.map((f) => {
          const x = f.rect.x * size.w, y = f.rect.y * size.h;
          const w = f.rect.w * size.w, h = f.rect.h * size.h;
          const lw = f.label.length * 7.6 + 18;
          return (
            <g key={f.id} pointerEvents="none">
              <rect
                x={x} y={y} width={w} height={h} rx={16}
                fill="none" stroke="rgba(150, 180, 215, 0.26)" strokeWidth={1} strokeDasharray="4 5"
              />
              <rect x={x + 8} y={y + 6} width={lw} height={22} rx={4} fill="rgba(7, 11, 17, 0.86)" stroke="rgba(150, 180, 215, 0.42)" />
              <text
                x={x + 8 + lw / 2} y={y + 21} textAnchor="middle" className="font-mono"
                style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.1em', fill: C.soft }}
              >
                {f.label}
              </text>
            </g>
          );
        })}

        {placed.map(({ s, x, y, label }) => {
          const isSel = s.symbol === selected;
          const isHover = s.symbol === hovered;
          const lit = active && s.pricing === 'priced';
          const critical = lit && s.band === 'critical';
          const dim = !active || s.pricing === 'flat';
          return (
            <g
              key={s.symbol}
              className="rr-node"
              role="button"
              tabIndex={0}
              aria-label={active ? symbolAria(s) : `${s.symbol}: no measurement on this layer yet`}
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

              {active && s.pricing === 'unpriced' ? (
                <rect
                  x={x - 4.5} y={y - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${y})`}
                  fill="#0a0f15" stroke={C.grey} strokeWidth={1.6} strokeDasharray="2.5 1.5"
                />
              ) : (
                <circle
                  cx={x} cy={y}
                  r={dim ? 3 : isHover || isSel ? 6.5 : 5.5}
                  fill={dim ? '#5d6b7c' : s.band ? BAND_BY_ID[s.band].color : '#0a0f15'}
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
              ? 'No measurement on this layer yet.'
              : hoveredItem.s.pricing === 'priced'
                ? (
                  <>
                    <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{fmtUsd(hoveredItem.s.usd)}</span>
                    {' B-Book exposure · '}
                    <span className="font-mono" style={{ color: C.text, fontWeight: 600 }}>{fmtPct(hoveredItem.s.share)}</span>
                    {' of the book'}
                  </>
                )
                : hoveredItem.s.pricing === 'unpriced'
                  ? `Unpriced: ${fmtLots(hoveredItem.s.bLots)} B-Book lots, no USD value from the feed.`
                  : 'No B-Book position — held in the A-Book or C-Book only.'}
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

function signedUsd(v: number): string {
  return v > 0 ? `+${fmtUsd(v)}` : fmtUsd(v);
}

interface Driver { tone: 'red' | 'amber' | 'green'; text: string }

function driversFor(s: RadarSymbol, view: RadarView, trend: Trend | null): Driver[] {
  const out: Driver[] = [];
  if (s.band === 'critical' || s.band === 'high') {
    out.push({
      tone: s.band === 'critical' ? 'red' : 'amber',
      text: `Holds ${fmtPct(s.share)} of B-Book exposure${s.rank === 1 ? ' — the largest position in the book' : ''}`,
    });
  } else if (s.rank === 1 && view.priced > 1) {
    out.push({ tone: 'amber', text: `Largest position in the book at ${fmtPct(s.share)}` });
  }
  if (trend?.dir === 'building') {
    out.push({
      tone: 'red',
      text: trend.change === null
        ? `New exposure in the last ${fmtSpan(trend.spanMs)}`
        : `Exposure up ${(trend.change * 100).toFixed(0)}% in the last ${fmtSpan(trend.spanMs)}`,
    });
  } else if (trend?.dir === 'easing' && trend.change !== null) {
    out.push({ tone: 'green', text: `Exposure down ${Math.abs(trend.change * 100).toFixed(0)}% in the last ${fmtSpan(trend.spanMs)}` });
  }
  if (s.worstDayLoss !== null) {
    const worst = view.symbols.reduce((m, x) => Math.max(m, x.worstDayLoss ?? 0), 0);
    if (view.worstDayCovered > 1 && s.worstDayLoss >= worst) {
      out.push({ tone: 'amber', text: 'Largest worst-day loss in the book' });
    }
  }
  if (s.pnlMtd !== null && s.pnlMtd < 0) {
    out.push({ tone: 'amber', text: `Losing month to date: ${fmtUsd(s.pnlMtd)}` });
  }
  if (s.unrealized !== null && s.unrealized < 0) {
    out.push({ tone: 'amber', text: `Unrealised loss on open positions: ${fmtUsd(s.unrealized)}` });
  }
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

function SymbolDetail({
  s, view, upto, scope, scopeText, onClose,
}: { s: RadarSymbol; view: RadarView; upto: number; scope: PlatformScope; scopeText: string; onClose: () => void }) {
  const trend = s.pricing === 'priced' ? trendOf(history, upto, (x) => usdOf(x.snapshot, s.symbol, scope)) : null;
  const series = history.slice(0, upto + 1).map((x) => usdOf(x.snapshot, s.symbol, scope));
  const byPlatform = scope === 'ALL' && (s.parts.length > 1 || s.partlyUnpriced);
  const drivers = s.pricing === 'priced' ? driversFor(s, view, trend) : [];
  const since = history.length ? history[0].t : null;

  return (
    <div style={{ padding: '14px 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.faint }}>{familyName(s.family)} · exposure · {scopeText}</div>
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
        {s.pricing === 'priced' && s.band && <BandBadge band={s.band} large />}
        {s.pricing === 'unpriced' && <GreyBadge text="UNPRICED" />}
        {s.pricing === 'flat' && <GreyBadge text="NO B-BOOK POSITION" />}
        {trend && <TrendChip trend={trend} large />}
      </div>

      {s.pricing === 'unpriced' && (
        <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5, margin: '6px 0 4px' }}>
          The feed carries a B-Book position for this instrument but no USD value, so it has no place on
          the colour scale and is left out of the totals. It is not a low reading.
        </p>
      )}
      {s.pricing === 'flat' && (
        <p style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5, margin: '6px 0 4px' }}>
          {s.parts.length > 1
            ? 'The B-Book positions on the two platforms offset each other, so nothing is carried on this instrument.'
            : 'Held in the A-Book or C-Book only. This layer measures the exposure the broker carries in the B-Book.'}
        </p>
      )}
      {s.partlyUnpriced && (
        <p style={{ fontSize: 12.5, color: '#ffb020', lineHeight: 1.5, margin: '6px 0 4px' }}>
          One platform's position has no USD value from the feed and is missing from these figures.
        </p>
      )}

      {s.pricing === 'priced' && (
        <>
          <Row label="B-Book exposure">{fmtUsd(s.usd)}</Row>
          <Row label="Share of B-Book" note={s.rank ? `#${s.rank} of ${view.priced}` : undefined}>{fmtPct(s.share, 1)}</Row>
          <Row label="1% move">{fmtUsd(s.impact1pct)}</Row>
          <Row
            label="Worst-day loss"
            note={
              s.worstDay === 'ok' && s.worstRange !== null
                ? `worst day of the last 100: ${(s.worstRange * 100).toFixed(2)}%`
                : s.worstDay === 'excluded'
                  ? `range on file is over ${MAX_DAILY_RANGE * 100}% — treated as a bad bar`
                  : view.worstDayReady ? 'no daily range on file' : 'daily ranges not loaded'
            }
          >
            {s.worstDayLoss !== null ? fmtUsd(s.worstDayLoss) : '—'}
          </Row>
          {s.unrealized !== null && (
            <Row label="Unrealised P&L"><span style={{ color: pnlColor(s.unrealized) }}>{signedUsd(s.unrealized)}</span></Row>
          )}
          {s.pnlMtd !== null && (
            <Row label="P&L month to date"><span style={{ color: pnlColor(s.pnlMtd) }}>{signedUsd(s.pnlMtd)}</span></Row>
          )}
        </>
      )}

      <SectionTitle>Position by book <span style={{ color: C.faint, fontWeight: 400 }}>· lots, broker view</span></SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {([['B-Book', s.bLots], ['A-Book', s.aLots], ['C-Book', s.cLots], ['Net', s.netLots]] as Array<[string, number]>).map(([name, lots]) => (
          <div key={name} style={{ background: '#0f1620', border: `1px solid ${C.line}`, borderRadius: 5, padding: '6px 7px' }}>
            <div style={{ fontSize: 11.5, color: C.soft }}>{name}</div>
            <div className="font-mono" style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{fmtLots(lots)}</div>
            <div style={{ fontSize: 10.5, color: C.faint }}>{sideOf(lots)}</div>
          </div>
        ))}
      </div>

      {byPlatform && (
        <>
          <SectionTitle>
            By platform <span style={{ color: C.faint, fontWeight: 400 }}>· B-Book, netted above</span>
          </SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {s.parts.map((part) => (
                <tr key={part.platform} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '6px 0', fontSize: 13, color: C.soft }}>{PLATFORM_LABEL[part.platform]}</td>
                  <td className="font-mono" style={{ padding: '6px 0', fontSize: 12.5, color: C.soft, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtLots(part.bLots)} lots · {sideOf(part.bLots)}
                  </td>
                  <td className="font-mono" style={{ padding: '6px 0 6px 10px', fontSize: 13.5, fontWeight: 600, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {part.usd !== null ? fmtUsd(part.usd) : 'unpriced'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {s.pricing === 'priced' && (
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
            B-Book exposure{' '}
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

function RankedList({ view, scopeText, onSelect }: { view: RadarView; scopeText: string; onSelect: (symbol: string) => void }) {
  const priced = view.symbols.filter((s) => s.pricing === 'priced');
  const unpriced = view.symbols.filter((s) => s.pricing === 'unpriced');
  const flat = view.symbols.filter((s) => s.pricing === 'flat');
  const topShare = priced.length ? priced[0].share : 0;

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
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Exposure by instrument</div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
          B-Book USD notional · {scopeText}. Largest first; select one for detail.
        </div>
      </div>

      {view.symbols.length === 0 && (
        <div style={{ padding: '18px 16px', fontSize: 13, color: C.soft }}>No open exposure in this snapshot.</div>
      )}

      {priced.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.faint, textAlign: 'left' }}>
              <th style={{ padding: '4px 4px 4px 16px', fontWeight: 500, width: 26 }}>#</th>
              <th style={{ padding: 4, fontWeight: 500 }}>Instrument</th>
              <th style={{ padding: 4, fontWeight: 500, textAlign: 'right' }}>Share</th>
              <th style={{ padding: '4px 16px 4px 4px', fontWeight: 500, textAlign: 'right' }}>Exposure</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((s) => {
              const def = s.band ? BAND_BY_ID[s.band] : null;
              return (
                <tr key={s.symbol} {...rowProps(s.symbol)} aria-label={symbolAria(s)} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="font-mono" style={{ padding: '6px 4px 6px 16px', fontSize: 12, color: C.faint }}>{s.rank}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span title={def?.label} style={{ width: 9, height: 9, borderRadius: 2, background: def?.color, flexShrink: 0 }} />
                      <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.symbol}</span>
                    </div>
                    <div style={{ height: 3, background: '#141d28', borderRadius: 2, marginTop: 4 }}>
                      <div style={{ height: 3, borderRadius: 2, background: def?.color, width: `${topShare > 0 ? Math.max(3, (s.share / topShare) * 100) : 0}%` }} />
                    </div>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 4px', fontSize: 13, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtPct(s.share)}
                    <span style={{ display: 'block', fontSize: 10.5, color: C.faint, fontFamily: 'inherit' }}>{def?.label}</span>
                  </td>
                  <td className="font-mono" style={{ padding: '6px 16px 6px 4px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmtUsd(s.usd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {unpriced.length > 0 && (
        <div style={{ margin: '12px 0 0' }}>
          <div style={{ padding: '0 16px', fontSize: 12, color: C.soft }}>
            Unpriced — B-Book position with no USD value from the feed
          </div>
          {unpriced.map((s) => (
            <div
              key={s.symbol}
              {...rowProps(s.symbol)}
              aria-label={symbolAria(s)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderTop: `1px solid ${C.line}`, marginTop: 4 }}
            >
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: C.soft }}>◇ {s.symbol}</span>
              <span className="font-mono" style={{ fontSize: 12.5, color: C.soft }}>{fmtLots(s.bLots)} lots</span>
            </div>
          ))}
        </div>
      )}

      {flat.length > 0 && (
        <div style={{ padding: '12px 16px 0', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          {flat.length} instrument{flat.length === 1 ? '' : 's'} with no B-Book position (A-Book / C-Book only):{' '}
          <span className="font-mono" style={{ color: C.soft }}>{flat.map((s) => s.symbol).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

const PENDING_TEXT: Record<Exclude<Layer, 'exposure'>, { title: string; lead: string; items: string[] }> = {
  flow: {
    title: 'Flow toxicity',
    lead: 'Colours each instrument by how far client fills move against the broker straight after execution.',
    items: [
      'Client-side markout after each fill, in USD',
      'Flagged accounts trading the instrument',
      'Median holding time and trades per minute',
      'How much evidence the reading rests on',
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
        The exposure feed does not carry {PLATFORM_LABEL[platform]} positions yet. This view fills in by itself
        when they are published.
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
            title="Scenario projection is not connected yet"
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

function Legend({ layer }: { layer: Layer }) {
  if (layer !== 'exposure') {
    return (
      <Panel style={{ width: 470, flexShrink: 0, padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>
          <span style={{ color: C.text, fontWeight: 600 }}>No colour scale on this layer yet.</span>{' '}
          Instruments are shown in grey because there is no measurement for them — grey never means low.
        </div>
      </Panel>
    );
  }
  return (
    <Panel style={{ width: 470, flexShrink: 0, padding: '9px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, fontWeight: 600 }}>
        <span>Share of B-Book exposure</span>
        <span style={{ color: C.faint, fontWeight: 400 }}>USD notional</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, margin: '6px 0 4px', background: rampGradientCss(), boxShadow: '0 0 12px rgba(255, 120, 0, 0.25)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {BANDS.map((b, i) => (
          <div key={b.id} style={{ fontSize: 11.5, color: C.text }}>
            {b.label}
            <span className="font-mono" style={{ display: 'block', fontSize: 10.5, color: C.faint }}>
              {i === 0 ? `under ${BANDS[1].from * 100}%` : i === BANDS.length - 1 ? `${b.from * 100}% and over` : `${b.from * 100}–${BANDS[i + 1].from * 100}%`}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
        <span><span style={{ color: C.soft }}>◇</span> unpriced</span>
        <span><span style={{ color: '#5d6b7c' }}>●</span> no B-Book position</span>
        <span>The dot is the reading; the glow is illustrative</span>
      </div>
    </Panel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════

export function RiskRadarPage() {
  const { snapshot, socket, lastLiveAt } = useRadarFeed();
  const largest1Day = useLargest1Day();
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

  const view = useMemo(() => buildView(shownSnapshot, largest1Day, scope), [shownSnapshot, largest1Day, scope]);
  const selectedSymbol = selected ? view.bySymbol.get(selected) ?? null : null;

  // Which platforms the snapshot actually has data for.
  const covered = useMemo(() => coverageOf(shownSnapshot), [shownSnapshot]);
  const pendingPlatform: Platform | null =
    shownSnapshot && scope !== 'ALL' && !covered.has(scope) ? scope : null;
  const missing = shownSnapshot && scope === 'ALL' ? PLATFORMS.filter((p) => !covered.has(p)) : [];
  const shownAlone = PLATFORMS.filter((p) => covered.has(p));
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

  // Freshness
  const liveFresh = socket === 'open' && lastLiveAt !== null && now - lastLiveAt < LIVE_STALE_MS;
  let chip: { color: string; text: string; blink?: boolean };
  if (replaying) {
    chip = { color: '#ffb020', text: `Replay · ${fmtUtcTime(history[replayIndex].t)}` };
  } else if (!snapshot) {
    chip = socket === 'closed'
      ? { color: '#ff3b30', text: 'Live updates offline' }
      : { color: C.grey, text: 'Waiting for exposure data…' };
  } else if (liveFresh) {
    chip = { color: '#3ddc57', text: `Live · as of ${fmtUtcTime(view.asOf)}`, blink: true };
  } else if (socket === 'closed') {
    chip = { color: '#ff3b30', text: `Live updates offline · showing ${fmtUtcDateTime(view.asOf)}` };
  } else {
    chip = { color: '#ffb020', text: `Feed quiet · last snapshot ${fmtUtcDateTime(view.asOf)}` };
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
            <RadarGlyph />
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
        {layer !== 'exposure' ? (
          <PendingCards labels={PENDING_CARDS[layer]} />
        ) : pendingPlatform ? (
          <PendingCards labels={EXPOSURE_CARDS} />
        ) : (
          <ExposureCards view={view} upto={upto} scope={scope} />
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
                {missing.length > 0 && shownAlone.length > 0 ? (
                  <div style={{ fontSize: 12, color: '#ffb020', whiteSpace: 'nowrap' }}>
                    {missing.map((p) => PLATFORM_LABEL[p]).join(' and ')} not in the feed yet · showing{' '}
                    {shownAlone.map((p) => PLATFORM_LABEL[p]).join(' and ')} only
                  </div>
                ) : (
                  <div className="font-mono" style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap' }}>Instrument map · fixed layout</div>
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
              <RadarMap view={view} layer={layer} selected={selected} onSelect={setSelected}>
                {layer !== 'exposure' && (
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
                {layer === 'exposure' && !snapshot && (
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
                      The exposure feed does not carry {PLATFORM_LABEL[pendingPlatform]} positions yet.
                    </div>
                  </div>
                )}
                {layer === 'exposure' && snapshot && !pendingPlatform && view.symbols.length === 0 && (
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: 14, color: C.soft, pointerEvents: 'none',
                    }}
                  >
                    No open exposure in this snapshot.
                  </div>
                )}
              </RadarMap>
            </div>
          </Panel>

          <Panel style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
            {layer !== 'exposure' ? (
              <PendingInspector layer={layer} />
            ) : pendingPlatform ? (
              <PlatformPendingInspector platform={pendingPlatform} />
            ) : selectedSymbol ? (
              <SymbolDetail s={selectedSymbol} view={view} upto={upto} scope={scope} scopeText={scopeText} onClose={() => setSelected(null)} />
            ) : (
              <RankedList view={view} scopeText={scopeText} onSelect={setSelected} />
            )}
          </Panel>
        </div>

        {/* Timeline + legend */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Timeline replayT={replaying ? replayT : null} playing={playing} onScrub={scrub} onPlay={togglePlay} />
          <Legend layer={layer} />
        </div>
      </div>
    </div>
  );
}
