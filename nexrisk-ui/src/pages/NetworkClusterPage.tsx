// ============================================================================
// NetworkClusterPage — infrastructure world map
//
// A dark Equal-Earth world map with one pin per deployed node. Clicking a pin
// opens a detail card: Country · IP · CPU · RAM · Disk · Users. Pin colour =
// node status (online / degraded / offline).
//
// Data: GET /api/v1/cluster/nodes (BFF → C++), polled every 30s. See
// backend-brief-cluster-nodes.md for the contract. Until the endpoint ships,
// a PREVIEW fallback inventory renders so the layout is reviewable — replace
// the coordinates with the real ones (they'll come from the server inventory
// once live).
//
// Requires: `npm i react-simple-maps @types/react-simple-maps`
// World topology loaded from world-atlas (CDN; self-host by dropping
// countries-110m.json into public/ and pointing GEO_URL at it).
// ============================================================================

import { useEffect, useState } from 'react';
import {
  ComposableMap,
  ZoomableGroup,
  Geographies,
  Geography,
  Marker,
  Sphere,
  Graticule,
} from 'react-simple-maps';

// World topology, self-hosted same-origin (public/countries-110m.json) so it
// isn't blocked by CSP/Incognito. Fetch it once into public/ — see setup note.
const GEO_URL = '/countries-110m.json';

// ── Types (mirror the backend brief) ────────────────────────────────────────
type NodeRole = 'frontend' | 'backend' | 'mt5_master' | 'mt5';
type NodeStatus = 'online' | 'degraded' | 'offline';

interface ClusterNode {
  id: string;
  role: NodeRole;
  label: string;
  ip: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
  status: NodeStatus;
  metrics: { cpu_pct: number | null; ram_pct: number | null; disk_pct: number | null };
  users_connected: number | null;
  as_of?: string;
  age_ms?: number;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
const BG_PAGE   = '#1a1a1c';
const BG_CARD   = '#222327';
const BG_FIELD  = '#232225';
const OCEAN     = '#161619';
const LAND      = '#2b2b31';
const LAND_LINE = '#3a3a40';
const GRATICULE = '#242429';
const TEAL      = '#4ecdc4';
const TEXT      = '#ffffff';
const MUTED     = '#9a9aa2';
const MONO      = 'IBM Plex Mono, monospace';

const STATUS: Record<NodeStatus, { color: string; label: string }> = {
  online:   { color: '#66e07a', label: 'Online' },
  degraded: { color: '#e0a020', label: 'Degraded' },
  offline:  { color: '#ff6b6b', label: 'Offline' },
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

// ── PREVIEW fallback — replace coords with the real inventory ────────────────
const FALLBACK_NODES: ClusterNode[] = [
  { id: 'fe-1', role: 'frontend', label: 'NexRisk Frontend', ip: '—', country: 'United Kingdom', country_code: 'GB', lat: 51.5074, lng: -0.1278, status: 'online', metrics: { cpu_pct: 34, ram_pct: 58, disk_pct: 41 }, users_connected: 7 },
  { id: 'be-1', role: 'backend', label: 'NexRisk Backend', ip: '—', country: 'Germany', country_code: 'DE', lat: 50.1109, lng: 8.6821, status: 'online', metrics: { cpu_pct: 52, ram_pct: 64, disk_pct: 38 }, users_connected: null },
  { id: 'mt5-2', role: 'mt5_master', label: 'Master MT5 · Ross Weiler', ip: '—', country: 'United States', country_code: 'US', lat: 40.7128, lng: -74.006, status: 'degraded', metrics: { cpu_pct: 78, ram_pct: 71, disk_pct: 55 }, users_connected: null },
  { id: 'mt5-4', role: 'mt5', label: 'Highness Investment', ip: '—', country: 'Singapore', country_code: 'SG', lat: 1.3521, lng: 103.8198, status: 'online', metrics: { cpu_pct: 22, ram_pct: 40, disk_pct: 29 }, users_connected: null },
];

// ── Metric bar ──────────────────────────────────────────────────────────────
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
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/v1/cluster/nodes', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json();
        const payload = j?.data ?? j;
        if (!cancelled && Array.isArray(payload?.nodes)) {
          setNodes(payload.nodes);
          setGeneratedAt(payload.generated_at ?? null);
          setLive(true);
        }
      } catch {
        /* keep whatever we have (fallback stays visible) */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const displayNodes = nodes ?? FALLBACK_NODES;
  const selected = displayNodes.find(n => n.id === selectedId) ?? null;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', backgroundColor: BG_PAGE, overflow: 'hidden' }}>
      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 175 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup zoom={1} center={[10, 15]} minZoom={1} maxZoom={6}>
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

          {displayNodes.map(n => {
            const color = STATUS[n.status].color;
            const isSel = n.id === selectedId;
            return (
              <Marker
                key={n.id}
                coordinates={[n.lng, n.lat]}
                onClick={() => setSelectedId(n.id)}
                style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: { cursor: 'pointer' } }}
              >
                <circle r={5} fill={color} className="cluster-pulse" />
                <circle r={isSel ? 6 : 4.5} fill={color} stroke={BG_PAGE} strokeWidth={1.3} />
                <circle r={1.6} fill="#ffffff" opacity={0.9} />
                <text
                  textAnchor="middle"
                  y={-11}
                  style={{
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 9,
                    fill: isSel ? TEXT : MUTED,
                    paintOrder: 'stroke',
                    stroke: BG_PAGE,
                    strokeWidth: 3,
                    strokeLinejoin: 'round',
                    pointerEvents: 'none',
                  }}
                >
                  {n.label}
                </text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 22px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: TEXT, margin: 0 }}>Network Cluster</h1>
            {!live && (
              <span style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#e0a020', border: '1px solid #4a3a1a', backgroundColor: '#241f14', borderRadius: 5, padding: '2px 7px' }}>
                Preview · awaiting live feed
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Live infrastructure across regions</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: MUTED }}>
          <div>{displayNodes.length} nodes</div>
          {generatedAt && (
            <div style={{ fontFamily: MONO, marginTop: 2 }}>
              {new Date(generatedAt).toLocaleTimeString('en-GB', { hour12: false })}
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', left: 22, bottom: 18, display: 'flex', gap: 16, fontSize: 12, color: MUTED }}>
        {(Object.keys(STATUS) as NodeStatus[]).map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS[s].color }} />
            {STATUS[s].label}
          </span>
        ))}
      </div>

      {/* ── Detail card ──────────────────────────────────────────────────── */}
      {selected && (
        <div
          style={{
            position: 'absolute', top: 70, right: 22, width: 290,
            backgroundColor: BG_CARD, border: `1px solid ${LAND_LINE}`, borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)', padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{selected.label}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{ROLE_LABEL[selected.role]}</div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              style={{ color: MUTED, fontSize: 16, lineHeight: 1, padding: 2 }}
              title="Close"
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS[selected.status].color }} />
            <span style={{ fontSize: 12, color: STATUS[selected.status].color }}>{STATUS[selected.status].label}</span>
            {selected.age_ms != null && <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto', fontFamily: MONO }}>{fmtAge(selected.age_ms)}</span>}
          </div>

          <div style={{ height: 1, backgroundColor: LAND_LINE, margin: '12px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: MUTED }}>Country</span>
            <span style={{ color: TEXT }}>{flagEmoji(selected.country_code)} {selected.country}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}>
            <span style={{ color: MUTED }}>IP address</span>
            <span style={{ fontFamily: MONO, color: TEXT }}>{selected.ip}</span>
          </div>

          <MetricBar label="CPU" value={selected.metrics.cpu_pct} />
          <MetricBar label="RAM" value={selected.metrics.ram_pct} />
          <MetricBar label="Disk" value={selected.metrics.disk_pct} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginTop: 12 }}>
            <span style={{ color: MUTED }}>Users</span>
            <span style={{ fontFamily: MONO, color: selected.users_connected == null ? MUTED : TEAL }}>
              {selected.users_connected == null ? '—' : selected.users_connected}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkClusterPage;