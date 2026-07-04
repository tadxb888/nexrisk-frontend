// ============================================================================
// NetworkClusterPage — infrastructure + liquidity world map
//
// A dark Equal-Earth world map with two pin layers:
//   • Nodes (circles)            — deployed boxes: CPU/RAM/Disk/Users
//   • Liquidity Providers (◆)    — connected venues: status/RTT/last activity
// Clicking a pin opens a detail card tailored to its kind.
//
// Data: GET /api/v1/cluster/nodes (BFF → C++), polled every 30s. Contract in
// backend-brief-cluster-nodes.md + backend-brief-cluster-lps.md. A PREVIEW
// fallback renders until the endpoint ships.
//
// Requires: react-simple-maps (+ @types/react-simple-maps) and a same-origin
// world topology at public/countries-110m.json (see GEO_URL).
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';
import {
  ComposableMap,
  ZoomableGroup,
  Geographies,
  Geography,
  Marker,
  Line,
  Sphere,
  Graticule,
} from 'react-simple-maps';

// World topology, self-hosted same-origin (public/countries-110m.json).
const GEO_URL = '/countries-110m.json';

// ── Types (mirror the backend briefs) ───────────────────────────────────────
type NodeRole = 'frontend' | 'backend' | 'mt5_master' | 'mt5';
type NodeStatus = 'online' | 'degraded' | 'offline';
type LpStatus = 'active' | 'connected' | 'offline';

interface ClusterNode {
  id: string;
  role: NodeRole;
  node_type?: string;
  label: string;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  status: NodeStatus;
  metrics: { cpu_pct: number | null; ram_pct: number | null; disk_pct: number | null } | null;
  users_connected: number | null;
  as_of?: string;
  age_ms?: number;
}

interface LiquidityProvider {
  id: string;
  name: string;
  ip: string | null; // FIX gateway host
  country: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  status: LpStatus;
  rtt_ms: number | null;
  last_activity_age_ms?: number;
  session?: string;
}

type Selection = { kind: 'node' | 'lp'; id: string } | null;

// ── Tokens ──────────────────────────────────────────────────────────────────
const BG_PAGE   = '#1a1a1c';
const BG_CARD   = '#222327';
const OCEAN      = '#161619';
const LAND       = '#2b2b31';
const LAND_LINE  = '#3a3a40';
const GRATICULE  = '#242429';
const TEAL       = '#4ecdc4';
const TEXT       = '#ffffff';
const MUTED      = '#9a9aa2';
const MONO       = 'IBM Plex Mono, monospace';

const NODE_STATUS: Record<NodeStatus, { color: string; label: string }> = {
  online:   { color: '#66e07a', label: 'Online' },
  degraded: { color: '#e0a020', label: 'Degraded' },
  offline:  { color: '#ff6b6b', label: 'Offline' },
};
const LP_STATUS: Record<LpStatus, { color: string; label: string }> = {
  active:    { color: '#66e07a', label: 'Active' },
  connected: { color: '#e0a020', label: 'Connected' },
  offline:   { color: '#ff6b6b', label: 'Offline' },
};

const ROLE_LABEL: Record<NodeRole, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  mt5_master: 'MT5 · Master',
  mt5: 'MT5 Node',
};

// ── One-time keyframes for the pin pulse ────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('cluster-map-styles')) {
  const el = document.createElement('style');
  el.id = 'cluster-map-styles';
  el.textContent = `
    @keyframes cluster-pulse {
      0%   { transform: scale(1);   opacity: 0.45; }
      70%  { transform: scale(2.6); opacity: 0;    }
      100% { transform: scale(2.6); opacity: 0;    }
    }
    .cluster-pulse { animation: cluster-pulse 2.4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
    @keyframes cluster-flow { to { stroke-dashoffset: -14; } }
    .cluster-pipe { stroke-dasharray: 3 5; animation: cluster-flow 1.1s linear infinite; }
  `;
  document.head.appendChild(el);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function flagEmoji(cc?: string): string {
  if (!cc || cc.length !== 2) return '';
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => base + c.charCodeAt(0) - 65));
}
function metricColor(v: number | null): string {
  if (v == null) return MUTED;
  if (v >= 90) return '#ff6b6b';
  if (v >= 75) return '#e0a020';
  return TEAL;
}
function fmtAge(ms?: number): string {
  if (ms == null) return '';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}
const hasGeo = (p: { lat?: number | null; lng?: number | null }): boolean =>
  Number.isFinite(p.lat as number) && Number.isFinite(p.lng as number);

// GeoIP resolves IPs to country centroids, so multiple nodes in one country
// land on the exact same point and stack invisibly. Fan coincident points out
// in a small ring so every pin is separately visible and clickable.
type GeoPt = { id: string; lat: number | null; lng: number | null };
function computeOffsets(pts: GeoPt[]): Map<string, { dLat: number; dLng: number }> {
  const groups = new Map<string, string[]>();
  for (const p of pts) {
    if (!Number.isFinite(p.lat as number) || !Number.isFinite(p.lng as number)) continue;
    const k = `${(p.lat as number).toFixed(1)},${(p.lng as number).toFixed(1)}`;
    const arr = groups.get(k);
    if (arr) arr.push(p.id);
    else groups.set(k, [p.id]);
  }
  const off = new Map<string, { dLat: number; dLng: number }>();
  const R = 1.8; // degrees — ring radius for coincident pins
  for (const ids of groups.values()) {
    if (ids.length <= 1) {
      off.set(ids[0], { dLat: 0, dLng: 0 });
      continue;
    }
    ids.forEach((id, i) => {
      const a = (2 * Math.PI * i) / ids.length;
      off.set(id, { dLat: R * Math.sin(a), dLng: R * Math.cos(a) });
    });
  }
  return off;
}

// ── PREVIEW fallbacks — replaced by the live endpoint's inventory ────────────
// ── No preview data — the map shows only real feed data from the endpoint.
const FALLBACK_NODES: ClusterNode[] = [];
const FALLBACK_LPS: LiquidityProvider[] = [];

// ── Small row + metric bar ──────────────────────────────────────────────────
function Row({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: color ?? TEXT, fontFamily: mono ? MONO : undefined }}>{value}</span>
    </div>
  );
}
function MetricBar({ label, value }: { label: string; value: number | null }) {
  const color = metricColor(value);
  return (
    <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
      <span style={{ width: 40, fontSize: 12, color: MUTED }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#1a1a1c', overflow: 'hidden' }}>
        <div style={{ width: `${value ?? 0}%`, height: '100%', backgroundColor: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 46, textAlign: 'right', fontFamily: MONO, fontSize: 12, color: value == null ? MUTED : TEXT }}>
        {value == null ? '—' : `${value.toFixed(0)}%`}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════
export function NetworkClusterPage() {
  const [nodes, setNodes] = useState<ClusterNode[] | null>(null);
  const [lps, setLps] = useState<LiquidityProvider[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 15]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleHidden = (id: string) =>
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/v1/cluster/nodes', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        const p = j?.data ?? j;
        if (cancelled) return;
        let any = false;
        if (Array.isArray(p?.nodes)) { setNodes(p.nodes); any = true; }
        if (Array.isArray(p?.lps)) { setLps(p.lps); any = true; }
        if (any) { setGeneratedAt(p.generated_at ?? null); setLive(true); }
      } catch {
        /* keep fallback */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const displayNodes = nodes ?? FALLBACK_NODES;
  const displayLps = lps ?? FALLBACK_LPS;
  const selNode = selected?.kind === 'node' ? displayNodes.find(n => n.id === selected.id) ?? null : null;
  const selLp = selected?.kind === 'lp' ? displayLps.find(l => l.id === selected.id) ?? null : null;

  const backendNode = displayNodes.find(n => n.role === 'backend');
  const masterNode = displayNodes.find(n => n.role === 'mt5_master');
  const offsets = computeOffsets([...displayNodes, ...displayLps]);
  const off = (id: string) => offsets.get(id) ?? { dLat: 0, dLng: 0 };
  const LINK_MT5 = '#e0a020'; // Backend ↔ MT5 Master
  const LINK_LP  = '#4ecdc4'; // Backend ↔ online LPs
  const zoomBtn: CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: BG_CARD, border: `1px solid ${LAND_LINE}`, borderRadius: 7,
    color: TEXT, fontSize: 16, lineHeight: 1, cursor: 'pointer',
  };

  const pinLabel = (label: string, y: number, active: boolean) => (
    <text
      textAnchor="middle" y={y}
      style={{
        fontFamily: 'system-ui, sans-serif', fontSize: 9, fill: active ? TEXT : MUTED,
        paintOrder: 'stroke', stroke: BG_PAGE, strokeWidth: 3, strokeLinejoin: 'round', pointerEvents: 'none',
      }}
    >
      {label}
    </text>
  );

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', backgroundColor: BG_PAGE, overflow: 'hidden' }}>
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 175 }} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup
          zoom={zoom}
          center={center}
          minZoom={1}
          maxZoom={8}
          onMoveEnd={(pos: { zoom: number; coordinates: [number, number] }) => { setZoom(pos.zoom); setCenter(pos.coordinates); }}
        >
          <Sphere id="sphere" stroke="#000000" strokeWidth={0} fill={OCEAN} />
          <Graticule stroke={GRATICULE} strokeWidth={0.35} />
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={LAND}
                  stroke={LAND_LINE}
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#33333a', outline: 'none' },
                    pressed: { fill: '#33333a', outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Links (rendered under the pins) */}
          {backendNode && masterNode && hasGeo(backendNode) && hasGeo(masterNode) && !hidden.has(backendNode.id) && !hidden.has(masterNode.id) && (
            <Line
              from={[(backendNode.lng as number) + off(backendNode.id).dLng, (backendNode.lat as number) + off(backendNode.id).dLat]}
              to={[(masterNode.lng as number) + off(masterNode.id).dLng, (masterNode.lat as number) + off(masterNode.id).dLat]}
              stroke={LINK_MT5}
              strokeWidth={1.1}
              strokeLinecap="round"
              className="cluster-pipe"
            />
          )}
          {backendNode && hasGeo(backendNode) && !hidden.has(backendNode.id) &&
            displayLps
              .filter(l => l.status !== 'offline' && hasGeo(l) && !hidden.has(l.id))
              .map(lp => (
                <Line
                  key={`link-${lp.id}`}
                  from={[(backendNode.lng as number) + off(backendNode.id).dLng, (backendNode.lat as number) + off(backendNode.id).dLat]}
                  to={[(lp.lng as number) + off(lp.id).dLng, (lp.lat as number) + off(lp.id).dLat]}
                  stroke={LINK_LP}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  className="cluster-pipe"
                />
              ))}

          {/* Nodes — circles */}
          {displayNodes.filter(n => hasGeo(n) && !hidden.has(n.id)).map(n => {
            const color = (NODE_STATUS[n.status] ?? NODE_STATUS.offline).color;
            const isSel = selected?.kind === 'node' && selected.id === n.id;
            const o = off(n.id);
            return (
              <Marker
                key={n.id}
                coordinates={[(n.lng as number) + o.dLng, (n.lat as number) + o.dLat]}
                onClick={() => setSelected({ kind: 'node', id: n.id })}
                style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: { cursor: 'pointer' } }}
              >
                <g transform={`scale(${1 / zoom})`}>
                  <circle r={5} fill={color} className="cluster-pulse" />
                  <circle r={isSel ? 6 : 4.5} fill={color} stroke={BG_PAGE} strokeWidth={1.3} />
                  <circle r={1.6} fill="#ffffff" opacity={0.9} />
                  {isSel && pinLabel(n.label, -11, true)}
                </g>
              </Marker>
            );
          })}

          {/* Liquidity providers — diamonds */}
          {displayLps.filter(lp => hasGeo(lp) && !hidden.has(lp.id)).map(lp => {
            const color = (LP_STATUS[lp.status] ?? LP_STATUS.offline).color;
            const isSel = selected?.kind === 'lp' && selected.id === lp.id;
            const o = off(lp.id);
            return (
              <Marker
                key={lp.id}
                coordinates={[(lp.lng as number) + o.dLng, (lp.lat as number) + o.dLat]}
                onClick={() => setSelected({ kind: 'lp', id: lp.id })}
                style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: { cursor: 'pointer' } }}
              >
                <g transform={`scale(${1 / zoom})`}>
                  {lp.status === 'active' && <path d="M0,-6 L6,0 L0,6 L-6,0 Z" fill={color} className="cluster-pulse" />}
                  <path d={`M0,${isSel ? -6.5 : -5.5} L${isSel ? 6.5 : 5.5},0 L0,${isSel ? 6.5 : 5.5} L${isSel ? -6.5 : -5.5},0 Z`} fill={color} stroke={BG_PAGE} strokeWidth={1.3} />
                  {isSel && pinLabel(lp.name, -11, true)}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: TEXT, margin: 0 }}>Network Cluster</h1>
            {!live && (
              <span style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#e0a020', border: '1px solid #4a3a1a', backgroundColor: '#241f14', borderRadius: 5, padding: '2px 7px' }}>
                No live feed
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Live infrastructure &amp; liquidity across regions</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: MUTED }}>
          <div>{displayNodes.length} nodes · {displayLps.length} LPs</div>
          {generatedAt && (
            <div style={{ fontFamily: MONO, marginTop: 2 }}>{new Date(generatedAt).toLocaleTimeString('en-GB', { hour12: false })}</div>
          )}
        </div>
      </div>

      {/* Node list — click a row to hide/show it on the map */}
      <div style={{ position: 'absolute', top: 92, left: 22, width: 210, maxHeight: '55%', overflowY: 'auto', backgroundColor: 'rgba(26,26,28,0.72)', border: `1px solid ${LAND_LINE}`, borderRadius: 8, padding: '6px 0' }}>
        <div style={{ padding: '2px 12px 6px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8a8a8a' }}>Nodes</div>
        {[
          ...displayNodes.map(n => ({ id: n.id, label: n.label, color: (NODE_STATUS[n.status] ?? NODE_STATUS.offline).color, geo: hasGeo(n) })),
          ...displayLps.map(l => ({ id: l.id, label: l.name, color: (LP_STATUS[l.status] ?? LP_STATUS.offline).color, geo: hasGeo(l) })),
        ].map(r => {
          const isHidden = hidden.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => toggleHidden(r.id)}
              className="w-full flex items-center gap-2 transition-colors"
              style={{ padding: '5px 12px', fontSize: 12, color: isHidden ? '#6a6a70' : '#e2e2e6', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title={isHidden ? 'Show on map' : 'Hide from map'}
            >
              <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color, opacity: isHidden ? 0.35 : 1, flexShrink: 0 }} />
              <span className="truncate" style={{ textDecoration: isHidden ? 'line-through' : 'none' }}>{r.label}</span>
              {!r.geo && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7a7a80', flexShrink: 0 }}>no geo</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', left: 22, bottom: 18, display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: MUTED }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={MUTED} /></svg> Node
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="-6 -6 12 12"><path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={MUTED} /></svg> Liquidity Provider
        </span>
        <span style={{ width: 1, height: 12, backgroundColor: LAND_LINE }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#66e07a' }} /> Healthy</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0a020' }} /> Degraded / idle</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff6b6b' }} /> Offline</span>
        <span style={{ width: 1, height: 12, backgroundColor: LAND_LINE }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px solid ${LINK_MT5}` }} /> MT5 link</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px solid ${LINK_LP}` }} /> LP link</span>
      </div>

      {/* Detail card — node */}
      {selNode && (
        <div style={{ position: 'absolute', top: 70, right: 22, width: 290, backgroundColor: BG_CARD, border: `1px solid ${LAND_LINE}`, borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.45)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{selNode.label}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
                {ROLE_LABEL[selNode.role] ?? selNode.role}{selNode.node_type ? ` · ${selNode.node_type}` : ''}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: MUTED, fontSize: 16, lineHeight: 1, padding: 2 }} title="Close">✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: NODE_STATUS[selNode.status].color }} />
            <span style={{ fontSize: 12, color: NODE_STATUS[selNode.status].color }}>{NODE_STATUS[selNode.status].label}</span>
            {selNode.age_ms != null && <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto', fontFamily: MONO }}>{fmtAge(selNode.age_ms)}</span>}
          </div>
          <div style={{ height: 1, backgroundColor: LAND_LINE, margin: '12px 0' }} />
          <Row label="Country" value={`${flagEmoji(selNode.country_code ?? undefined)} ${selNode.country ?? '—'}`} />
          <Row label="IP address" value={selNode.ip ?? '—'} mono />
          {selNode.metrics ? (
            <>
              <MetricBar label="CPU" value={selNode.metrics.cpu_pct} />
              <MetricBar label="RAM" value={selNode.metrics.ram_pct} />
              <MetricBar label="Disk" value={selNode.metrics.disk_pct} />
              <div style={{ marginTop: 12 }}>
                <Row label="Users" value={selNode.users_connected == null ? '—' : String(selNode.users_connected)} mono color={selNode.users_connected == null ? MUTED : TEAL} />
              </div>
            </>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>External node — host metrics not monitored.</div>
          )}
        </div>
      )}

      {/* Detail card — liquidity provider */}
      {selLp && (
        <div style={{ position: 'absolute', top: 70, right: 22, width: 290, backgroundColor: BG_CARD, border: `1px solid ${LAND_LINE}`, borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.45)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{selLp.name}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Liquidity Provider</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: MUTED, fontSize: 16, lineHeight: 1, padding: 2 }} title="Close">✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LP_STATUS[selLp.status].color }} />
            <span style={{ fontSize: 12, color: LP_STATUS[selLp.status].color }}>{LP_STATUS[selLp.status].label}</span>
            {selLp.last_activity_age_ms != null && <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto', fontFamily: MONO }}>{fmtAge(selLp.last_activity_age_ms)}</span>}
          </div>
          <div style={{ height: 1, backgroundColor: LAND_LINE, margin: '12px 0' }} />
          <Row label="Country" value={`${flagEmoji(selLp.country_code ?? undefined)} ${selLp.country ?? '—'}`} />
          <Row label="FIX host" value={selLp.ip ?? '—'} mono />
          <Row label="RTT" value={selLp.rtt_ms == null ? '—' : `${selLp.rtt_ms} ms`} mono color={selLp.rtt_ms == null ? MUTED : TEXT} />
          {selLp.session && <Row label="Session" value={selLp.session} mono />}
        </div>
      )}
      {/* Zoom controls */}
      <div style={{ position: 'absolute', right: 22, bottom: 52, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setZoom(z => Math.min(z * 1.5, 8))} style={zoomBtn} title="Zoom in" aria-label="Zoom in">+</button>
        <button onClick={() => setZoom(z => Math.max(z / 1.5, 1))} style={zoomBtn} title="Zoom out" aria-label="Zoom out">−</button>
        <button onClick={() => { setZoom(1); setCenter([10, 15]); }} style={zoomBtn} title="Reset view" aria-label="Reset view">⟳</button>
      </div>

      {/* Empty state — no feed data */}
      {displayNodes.length === 0 && displayLps.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ color: MUTED, fontSize: 13, backgroundColor: 'rgba(26,26,28,0.65)', padding: '8px 14px', borderRadius: 8, border: `1px solid ${LAND_LINE}` }}>
            Waiting for cluster feed…
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkClusterPage;